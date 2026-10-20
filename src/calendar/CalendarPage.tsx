import { format } from "date-fns";
import {
  type JSX,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router";
import type { Event } from "../data/rows";
import { dayKey, monthGrid } from "../domain/monthGrid";
import {
  deletedLabel,
  moveEvent,
  movedLabel,
  moveToDay,
  moveToSlot,
  resizeBy,
  resizedLabel,
  STEP_MINUTES,
  type Span,
} from "../domain/moveEvent";
import {
  EventSheet,
  SAVE_FAILED,
  type SheetRequest,
} from "../events/EventSheet";
import { type EventActions, eventActions } from "../sync/eventActions";
import { type EventsStore, useEventsInRange } from "../sync/eventsStore";
import { type KindsStore, useKinds } from "../sync/kindsStore";
import { DayList } from "./DayList";
import { DayView } from "./DayView";
import { useBreakpoint } from "./media";
import { eventsOnDay, MonthView } from "./MonthView";
import { type Period, parsePath, periodOf, readView } from "./period";
import { setSelected, useSelected } from "./selection";
import { shortcutBlocked } from "./useCalendarKeys";
import { useMaybeToast } from "../ui/Toast";
import type { ChipCommand } from "./EventChip";
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

type Stores = { kinds?: KindsStore; events?: EventsStore };

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

/**
 * Block 8: the writes behind a drop, a chip's command and the sheet's
 * Delete, each toasting with an Undo that runs its write at most once. With
 * no ToastProvider above the page the writes still happen, silently.
 */
function useEventEdits(
  actions: EventActions,
  month: boolean,
): {
  onDropEvent: OnDropEvent;
  onChipCommand: OnChipCommand;
  onDelete: (event: Event) => void;
} {
  const toast = useMaybeToast();
  // After a keyboard move the moved chip takes focus, once the render that
  // shows it in its new place has committed (it may be a new element).
  const focusId = useRef<string | null>(null);
  const [focusTick, requestFocus] = useReducer((n: number) => n + 1, 0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a focus request is the trigger; the id is read from the ref
  useEffect(() => {
    const id = focusId.current;
    if (id === null) return;
    focusId.current = null;
    document.querySelector<HTMLElement>(`[data-event-id="${id}"]`)?.focus();
  }, [focusTick]);

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

  const move = async (
    event: Event,
    span: Span,
    text: string,
    focusAfter: boolean,
  ) => {
    if (sameSpan(event, span)) return;
    const patch = { startsAt: span.startsAt, endsAt: span.endsAt };
    const result = await actions.updateEvent(event.id, patch, event.updatedAt);
    if (result.status !== "ok") {
      failed();
      return;
    }
    const before = { startsAt: event.startsAt, endsAt: event.endsAt };
    toast?.showToast({
      text,
      action: {
        label: "Undo",
        undo: true,
        // The undo carries the token the move produced (Block 3).
        onClick: once(() =>
          actions.updateEvent(event.id, before, result.row.updatedAt),
        ),
      },
    });
    if (focusAfter) {
      focusId.current = event.id;
      requestFocus();
    }
  };

  const remove = async (event: Event) => {
    const result = await actions.removeEvent(event);
    if (result.status !== "ok") {
      failed();
      return;
    }
    toast?.showToast({
      text: deletedLabel(event.title),
      action: {
        label: "Undo",
        undo: true,
        onClick: once(() => actions.restoreEvent(result.row)),
      },
    });
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
      target?.focus();
      void remove(event);
      return;
    }
    const next = commandSpan(event, command, month);
    if (next === null) return;
    void move(event, next.span, next.text, true);
  };

  return {
    onDropEvent,
    onChipCommand,
    onDelete: (event) => void remove(event),
  };
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
  const events = useEventsInRange(from, nextMidnight(to), props.events);
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

export function CalendarPage(
  props: Stores & {
    /** Injected clock; default `() => new Date()`. */
    now?: () => Date;
    /** The sheet's writes; default the app's eventActions (tests inject). */
    actions?: EventActions;
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
  const edits = useEventEdits(actions, period.view === "month");

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
    setSheet({ mode: "edit", event, opener: chip });
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

  const stores = { kinds: props.kinds, events: props.events };
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
  return (
    <>
      {view}
      <EventSheet
        request={sheet}
        kinds={kinds}
        actions={actions}
        onClose={() => setSheet(null)}
        onDelete={edits.onDelete}
      />
    </>
  );
}
