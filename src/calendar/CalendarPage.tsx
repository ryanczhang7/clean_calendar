import { format } from "date-fns";
import {
  type JSX,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useLocation, useNavigate } from "react-router";
import type { Result } from "../data/result";
import type { Event } from "../data/rows";
import { dayKey, monthGrid } from "../domain/monthGrid";
import {
  deletedLabel,
  deletedSeriesLabel,
  movedLabel,
  moveEvent,
  moveToDay,
  moveToSlot,
  resizeBy,
  resizedLabel,
  type Span,
  STEP_MINUTES,
  seriesSpan,
} from "../domain/moveEvent";
import { type EditScope, EditScopeDialog } from "../events/EditScopeDialog";
import {
  EventSheet,
  SAVE_FAILED,
  type SheetRequest,
} from "../events/EventSheet";
import { type EventActions, eventActions } from "../sync/eventActions";
import { type EventsStore, eventsStore } from "../sync/eventsStore";
import { type KindsStore, useKinds } from "../sync/kindsStore";
import { type OverrideActions, overrideActions } from "../sync/overrideActions";
import { type OverridesStore, overridesStore } from "../sync/overridesStore";
import { type ReminderActions, reminderActions } from "../sync/reminderActions";
import { type RemindersStore, remindersStore } from "../sync/remindersStore";
import { type SheetSync, sheetSync } from "../sync/sheetSync";
import { useOccurrences } from "../sync/useOccurrences";
import { useMaybeToast } from "../ui/Toast";
import styles from "./CalendarPage.module.css";
import { ChipRemindersContext } from "./chipReminders";
import { DayList } from "./DayList";
import { DayView } from "./DayView";
import type { ChipCommand } from "./EventChip";
import { eventsOnDay, MonthView } from "./MonthView";
import { useBreakpoint } from "./media";
import { type Period, parsePath, periodOf, readView } from "./period";
import { setSelected, useSelected } from "./selection";
import { shortcutBlocked } from "./useCalendarKeys";
import type { DropTarget } from "./useChipDrag";
import { WeekView } from "./WeekView";

// CAL-011 Contract, Block 10. The URL names the view and the period (read
// from the pathname, as the toolbar does); an unparseable calendar URL shows
// today's month. No <h1>: the period title is the toolbar's (PO decision 1).
//
// CAL-012 Contract, Block 7: the page owns the event sheet's request. A month
// cell, a time-grid slot, the empty card, the day list's Add and `N` open a
// new event; a chip opens its event. On close the sheet returns focus to
// whatever opened it.
//
// CAL-013 Contract, Block 8: the page owns moves, resizes and deletes - from a
// drop, a chip's keys or the sheet's Delete - and their undo toasts.

type Stores = {
  kinds?: KindsStore;
  events?: EventsStore;
  /** CAL-024 Block 5: the overrides the views expand series with. */
  overrides?: OverridesStore;
};

type OnChipCommand = (
  event: Event,
  command: ChipCommand,
  chip: HTMLElement,
) => void;
type OnDropEvent = (event: Event, target: DropTarget) => void;

/** How the month asks the page for the sheet, and to move. */
type Opens = {
  /** A new all-day event on `day`. */
  onCreateDay: (day: Date, opener: HTMLElement | null) => void;
  onOpenEvent: (event: Event, chip: HTMLElement) => void;
  onChipCommand: OnChipCommand;
  onDropEvent: OnDropEvent;
};

const nextMidnight = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

const HOUR_MS = 60 * 60 * 1000;

const sameMonth = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

/** The element that has focus: a button just clicked, or the cell `N` was pressed on. */
const focused = (): HTMLElement | null =>
  document.activeElement instanceof HTMLElement ? document.activeElement : null;

/**
 * The selection of a period: in a month, the current selection when it lies
 * there (so a key that moved it across a month keeps it), else today when
 * today is there, else the 1st; in a week or a day, its date.
 */
function selectionFor(period: Period, current: Date | null, today: Date): Date {
  if (period.view !== "month") return period.date;
  if (current !== null && sameMonth(current, period.date)) return current;
  if (sameMonth(today, period.date)) {
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }
  return period.date;
}

const MINUTE_MS = 60 * 1000;

const atDay = (d: Date, days: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

const sameSpan = (event: Event, span: Span) =>
  event.startsAt.getTime() === span.startsAt.getTime() &&
  event.endsAt.getTime() === span.endsAt.getTime();

/** Block 8: the span a chip's command asks for, and its toast; null → nothing. */
function commandSpan(
  event: Event,
  command: Exclude<ChipCommand, "delete">,
  month: boolean,
): { span: Span; text: string } | null {
  const moved = (span: Span) => ({
    span,
    text: movedLabel(span, event.allDay),
  });
  switch (command) {
    case "left":
    case "right":
      return moved(
        moveToDay(event, atDay(event.startsAt, command === "left" ? -1 : 1)),
      );
    case "up":
    case "down": {
      const sign = command === "up" ? -1 : 1;
      // PO decision 3: a week in the month; 15 minutes in a time grid.
      if (month) {
        return moved(moveToDay(event, atDay(event.startsAt, 7 * sign)));
      }
      if (event.allDay) return null;
      const start = event.startsAt.getTime() + sign * STEP_MINUTES * MINUTE_MS;
      return moved(moveEvent(event, new Date(start)));
    }
    case "lengthen":
    case "shorten": {
      if (month) return null;
      const step = command === "lengthen" ? STEP_MINUTES : -STEP_MINUTES;
      const span = resizeBy(event, step);
      return span === null ? null : { span, text: resizedLabel(span) };
    }
  }
}

/** The pending write an occurrence's edit-scope dialog is asking about. */
type Pending =
  | {
      kind: "move";
      event: Event;
      span: Span;
      text: string;
      focusAfter: boolean;
    }
  | { kind: "delete"; event: Event; focusTarget: HTMLElement | null };

/**
 * Block 8: the writes behind a drop, a chip's command and the sheet's
 * Delete, each toasting with an Undo that runs its write at most once. With
 * no ToastProvider above the page the writes still happen, silently.
 *
 * CAL-025 Block 6: on an OCCURRENCE each of them opens the edit-scope dialog
 * instead, and its answer picks the write - an override of that occurrence,
 * or the series row (read from the events snapshot), moved by seriesSpan.
 */
function useEventEdits(
  actions: EventActions,
  overrides: OverrideActions,
  month: boolean,
  stores: { events: EventsStore; overrides: OverridesStore },
): {
  onDropEvent: OnDropEvent;
  onChipCommand: OnChipCommand;
  onDelete: (event: Event) => void;
  scopeDialog: JSX.Element;
} {
  const toast = useMaybeToast();
  // Focus that must wait for a commit: after a keyboard move the moved chip
  // (it may be a new element); after a confirmed delete the cell, once the
  // closing dialog has given focus back to its opener (CAL-025 Block 6).
  const focusNext = useRef<(() => void) | null>(null);
  const [focusTick, requestFocus] = useReducer((n: number) => n + 1, 0);
  const [pending, setPending] = useState<Pending | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a focus request is the trigger; the target is read from the ref
  useEffect(() => {
    const focus = focusNext.current;
    if (focus === null) return;
    focusNext.current = null;
    focus();
  }, [focusTick]);

  const focusChip = (id: string) => {
    focusNext.current = () =>
      document.querySelector<HTMLElement>(`[data-event-id="${id}"]`)?.focus();
    requestFocus();
  };

  const failed = () => toast?.showToast({ text: SAVE_FAILED, tone: "alert" });

  /** An undo: runs `write` the first time only; a refusal shows the alert. */
  const once = (write: () => Promise<{ status: string }>) => {
    let used = false;
    return () => {
      if (used) return;
      used = true;
      void write().then((r) => {
        if (r.status !== "ok") failed();
      });
    };
  };

  /** Awaits a write; ok → `text` with an Undo of `undo(row)`, else the alert. */
  const written = async <T,>(
    write: Promise<Result<T>>,
    text: string,
    undo: (row: T) => Promise<{ status: string }>,
  ): Promise<boolean> => {
    const result = await write;
    if (result.status !== "ok") {
      failed();
      return false;
    }
    toast?.showToast({
      text,
      action: {
        label: "Undo",
        undo: true,
        onClick: once(() => undo(result.row)),
      },
    });
    return true;
  };

  /** The stored series row of an occurrence (Block 6). */
  const seriesOf = (event: Event) =>
    stores.events.getSnapshot().events.find((e) => e.id === event.id);

  const move = async (
    event: Event,
    span: Span,
    text: string,
    focusAfter: boolean,
  ) => {
    if (sameSpan(event, span)) return;
    if (event.occurrenceDate !== undefined) {
      setPending({ kind: "move", event, span, text, focusAfter });
      return;
    }
    const before = { startsAt: event.startsAt, endsAt: event.endsAt };
    const ok = await written(
      actions.updateEvent(
        event.id,
        { startsAt: span.startsAt, endsAt: span.endsAt },
        event.updatedAt,
      ),
      text,
      // The undo carries the token the move produced (Block 3).
      (row) => actions.updateEvent(event.id, before, row.updatedAt),
    );
    if (ok && focusAfter) focusChip(event.id);
  };

  const remove = (event: Event) =>
    written(actions.removeEvent(event), deletedLabel(event.title), (row) =>
      actions.restoreEvent(row),
    );

  /** CAL-025 Block 6: the write the dialog's answer picks. */
  const confirmScope = async (asked: Pending, scope: EditScope) => {
    const { event } = asked;
    const date = event.occurrenceDate;
    if (date === undefined) return;
    const series = seriesOf(event);
    if (scope === "series" && series === undefined) {
      failed();
      return;
    }
    if (asked.kind === "delete") {
      if (scope === "occurrence") {
        await written(
          overrides.cancelOccurrence(event.id, date),
          deletedLabel(event.title),
          (row) => overrides.restoreOccurrence(row),
        );
      } else if (series !== undefined) {
        await written(
          actions.removeEvent(series),
          deletedSeriesLabel(series.title),
          (row) => actions.restoreEvent(row),
        );
      }
      return;
    }
    const { span, text } = asked;
    let ok = false;
    if (scope === "occurrence") {
      // PO decision 5: the Undo writes the prior override's times back, null
      // where it had none.
      const prior = stores.overrides
        .getSnapshot()
        .overrides.find(
          (o) => o.eventId === event.id && o.occurrenceDate === date,
        );
      const before = {
        startsAt: prior?.startsAt ?? null,
        endsAt: prior?.endsAt ?? null,
      };
      ok = await written(
        overrides.setOverride(event.id, date, {
          startsAt: span.startsAt,
          endsAt: span.endsAt,
        }),
        text,
        () => overrides.setOverride(event.id, date, before),
      );
    } else if (series !== undefined) {
      const before = { startsAt: series.startsAt, endsAt: series.endsAt };
      ok = await written(
        actions.updateEvent(
          event.id,
          seriesSpan(series, event, span),
          series.updatedAt,
        ),
        text,
        (row) => actions.updateEvent(event.id, before, row.updatedAt),
      );
    }
    if (ok && asked.focusAfter) focusChip(event.id);
  };

  const onConfirm = (scope: EditScope) => {
    const asked = pending;
    setPending(null);
    if (asked === null) return;
    if (asked.kind === "delete" && asked.focusTarget !== null) {
      // Once the dialog has closed and refocused its opener - the chip that
      // is about to go (Block 6, amended by RED).
      const target = asked.focusTarget;
      focusNext.current = () => target.focus();
      requestFocus();
    }
    void confirmScope(asked, scope);
  };

  const onDropEvent: OnDropEvent = (event, target) => {
    const span =
      target.kind === "day"
        ? moveToDay(event, target.day)
        : moveToSlot(event, target.start);
    void move(event, span, movedLabel(span, event.allDay), false);
  };

  const onChipCommand: OnChipCommand = (event, command, chip) => {
    if (command === "delete") {
      // Focus leaves the chip before it goes: to the month cell that held
      // it, or to the time grid's one tab stop.
      const target = month
        ? chip.closest<HTMLElement>('[role="gridcell"]')
        : (chip
            .closest('[role="grid"]')
            ?.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]') ??
          null);
      if (event.occurrenceDate !== undefined) {
        setPending({ kind: "delete", event, focusTarget: target });
        return;
      }
      target?.focus();
      void remove(event);
      return;
    }
    const next = commandSpan(event, command, month);
    if (next === null) return;
    void move(event, next.span, next.text, true);
  };

  const onDelete = (event: Event) => {
    if (event.occurrenceDate !== undefined) {
      setPending({ kind: "delete", event, focusTarget: null });
      return;
    }
    void remove(event);
  };

  const scopeDialog = (
    <EditScopeDialog
      open={pending !== null}
      kind={pending?.kind === "delete" ? "delete" : "change"}
      moving={pending?.kind === "move"}
      onCancel={() => setPending(null)}
      onConfirm={onConfirm}
    />
  );

  return { onDropEvent, onChipCommand, onDelete, scopeDialog };
}

/**
 * CAL-020 Contract, Block 5: a navigation carrying `state: { focusEventId }`
 * (the confirm screen, after a save) focuses that event's chip as soon as it
 * renders, once. The page re-renders with the events store, so the check runs
 * after every render that may have brought the chip in; a later render does
 * not steal focus again.
 */
function useFocusEventFromState(store: EventsStore): void {
  const { key, state } = useLocation();
  const wanted = (state as { focusEventId?: unknown } | null | undefined)
    ?.focusEventId;
  const pending = useRef<string | null>(null);
  const seenKey = useRef<string | null>(null);
  if (seenKey.current !== key) {
    seenKey.current = key;
    pending.current = typeof wanted === "string" ? wanted : null;
  }
  useSyncExternalStore(store.subscribe, store.getSnapshot);

  useEffect(() => {
    const id = pending.current;
    if (id === null) return;
    const chip = document.querySelector<HTMLElement>(`[data-event-id="${id}"]`);
    if (chip === null) return;
    pending.current = null;
    // After RouteFocus, whose effect runs later in this same commit and
    // focuses the <h1> when the chip arrives with the page's first render.
    queueMicrotask(() => {
      if (chip.isConnected) chip.focus();
    });
  });
}

function MonthPage(
  props: Stores & Opens & { first: Date; today: Date; selected: Date },
): JSX.Element {
  const {
    first,
    today,
    selected,
    onCreateDay,
    onOpenEvent,
    onChipCommand,
    onDropEvent,
  } = props;
  const navigate = useNavigate();
  const phone = useBreakpoint() === "phone";
  const year = first.getFullYear();
  const month = first.getMonth() + 1;
  const grid = monthGrid(year, month);
  const from = grid[0]?.date ?? first;
  const to = grid[grid.length - 1]?.date ?? first;
  const events = useOccurrences(from, nextMidnight(to), {
    events: props.events,
    overrides: props.overrides,
  });
  const kinds = useKinds(props.kinds);

  // A key or a click that leaves the month moves the page after it, keeping
  // focus in the grid (RouteFocus's "grid" guard, Block 9).
  const onSelect = (date: Date) => {
    setSelected(date);
    if (!sameMonth(date, first)) {
      navigate(`/month/${format(date, "yyyy-MM")}`, {
        state: { focus: "grid" },
      });
    }
  };

  // CAL-012 PO decision 4: on the phone the tap already selected and the day
  // list is the path; elsewhere a day with events opens its day view, an
  // empty one the sheet.
  const onActivateDay = (date: Date, cell: HTMLElement) => {
    if (phone) return;
    if (eventsOnDay(events.events, date).length > 0) {
      navigate(`/day/${dayKey(date)}`);
      return;
    }
    onCreateDay(date, cell);
  };

  return (
    <>
      <MonthView
        year={year}
        month={month}
        events={events.events}
        kinds={kinds}
        today={today}
        loading={events.status !== "ready"}
        selected={selected}
        onSelect={onSelect}
        onActivateDay={onActivateDay}
        onOpenEvent={onOpenEvent}
        onAddEvent={() => onCreateDay(selected, focused())}
        onChipCommand={onChipCommand}
        onDropEvent={onDropEvent}
      />
      {phone && (
        <DayList
          date={selected}
          events={events.events}
          kinds={kinds}
          onAdd={() => onCreateDay(selected, focused())}
          onOpenEvent={onOpenEvent}
        />
      )}
    </>
  );
}

/**
 * CAL-057 Block 6: event id -> its live template's minutesBefore, for the
 * chips. A live template is liveTemplate's rule: `occurrenceDate` null and
 * `deletedAt == null`. A store that has never loaded is asked once.
 */
function useChipReminders(store: RemindersStore): ReadonlyMap<string, number> {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    if (store.getSnapshot().status === "loading") void store.refresh();
  }, [store]);
  return useMemo(() => {
    const map = new Map<string, number>();
    for (const r of snapshot.reminders) {
      if (r.occurrenceDate === null && r.deletedAt == null) {
        map.set(r.eventId, r.minutesBefore);
      }
    }
    return map;
  }, [snapshot.reminders]);
}

export function CalendarPage(
  props: Stores & {
    /** Injected clock; default `() => new Date()`. */
    now?: () => Date;
    /** The sheet's writes; default the app's eventActions (tests inject). */
    actions?: EventActions;
    /** CAL-025 Block 6: an occurrence's writes; default the app's overrideActions. */
    overrideActions?: OverrideActions;
    /** CAL-045 Block 3: the sheet's failed-sync strip; default the app's sheetSync. */
    sheetSync?: SheetSync;
    /** CAL-057 Block 6: the reminders the chips and the sheet read; default the app's. */
    reminders?: RemindersStore;
    /** CAL-057 Block 6: the sheet's reminder writes; default the app's. */
    reminderActions?: ReminderActions;
  } = {},
): JSX.Element {
  const { pathname } = useLocation();
  const phone = useBreakpoint() === "phone";
  const today = (props.now ?? (() => new Date()))();
  const period =
    parsePath(pathname, readView(), today) ?? periodOf("month", today, phone);
  const selected = selectionFor(period, useSelected(), today);
  const periodKey = `${period.view}:${dayKey(period.date)}`;
  const kinds = useKinds(props.kinds);
  const [sheet, setSheet] = useState<SheetRequest | null>(null);
  const actions = props.actions ?? eventActions;
  const overrides = props.overrideActions ?? overrideActions;
  const events = props.events ?? eventsStore;
  const edits = useEventEdits(actions, overrides, period.view === "month", {
    events,
    overrides: props.overrides ?? overridesStore,
  });
  useFocusEventFromState(events);
  const reminders = props.reminders ?? remindersStore;
  const chipReminders = useChipReminders(reminders);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new period is the trigger; `selected` is that render's answer
  useEffect(() => {
    setSelected(selected);
  }, [periodKey]);

  const onCreateDay = (day: Date, opener: HTMLElement | null) => {
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    setSheet({
      mode: "create",
      start,
      end: nextMidnight(start),
      allDay: true,
      opener,
    });
  };
  const onSlotActivate = (start: Date, cell: HTMLElement) => {
    setSheet({
      mode: "create",
      start,
      end: new Date(start.getTime() + HOUR_MS),
      allDay: false,
      opener: cell,
    });
  };
  const onOpenEvent = (event: Event, chip: HTMLElement) => {
    // CAL-025 Block 6: an occurrence's sheet carries its stored series row.
    const series =
      event.occurrenceDate === undefined
        ? undefined
        : events.getSnapshot().events.find((e) => e.id === event.id);
    setSheet(
      series === undefined
        ? { mode: "edit", event, opener: chip }
        : { mode: "edit", event, opener: chip, series },
    );
  };

  // PO decision 3: N creates an all-day event on the selected day, in every
  // view. The listener outlives a render; it reads the latest selection.
  const latestSelected = useRef(selected);
  useLayoutEffect(() => {
    latestSelected.current = selected;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "n" || shortcutBlocked(event)) return;
      event.preventDefault();
      const day = latestSelected.current;
      setSheet({
        mode: "create",
        start: day,
        end: nextMidnight(day),
        allDay: true,
        opener: focused(),
      });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const stores = {
    kinds: props.kinds,
    events: props.events,
    overrides: props.overrides,
  };
  const opens = {
    onSlotActivate,
    onOpenEvent,
    onChipCommand: edits.onChipCommand,
    onDropEvent: edits.onDropEvent,
  };
  let view: JSX.Element;
  if (period.view === "week") {
    view = (
      <WeekView selected={period.date} now={today} {...stores} {...opens} />
    );
  } else if (period.view === "day") {
    view = (
      <DayView selected={period.date} now={today} {...stores} {...opens} />
    );
  } else {
    view = (
      <MonthPage
        {...stores}
        first={period.date}
        today={today}
        selected={selected}
        onCreateDay={onCreateDay}
        onOpenEvent={onOpenEvent}
        onChipCommand={edits.onChipCommand}
        onDropEvent={edits.onDropEvent}
      />
    );
  }
  // CAL-031 PO decision 6: the view and the sheet are siblings in one row,
  // so on the desktop the docked panel takes 400px and the view the rest.
  return (
    <>
      <div className={styles.page}>
        <div className={styles.view}>
          <ChipRemindersContext.Provider value={chipReminders}>
            {view}
          </ChipRemindersContext.Provider>
        </div>
        <EventSheet
          request={sheet}
          kinds={kinds}
          actions={actions}
          overrides={overrides}
          sync={props.sheetSync ?? sheetSync}
          reminderActions={props.reminderActions ?? reminderActions}
          remindersStore={reminders}
          onClose={() => setSheet(null)}
          onDelete={edits.onDelete}
        />
      </div>
      {edits.scopeDialog}
    </>
  );
}
