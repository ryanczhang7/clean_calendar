import { format } from "date-fns";
import {
  type JSX,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useNavigate } from "react-router";
import type { Event } from "../data/rows";
import { kindInitials } from "../domain/kindInitials";
import { dayKey, monthGrid } from "../domain/monthGrid";
import type { KindsSnapshot } from "../sync/kindsStore";
import { chipKey } from "../sync/useOccurrences";
import { EmptyMonth } from "./EmptyMonth";
import {
  type ChipCommand,
  type ChipKind,
  EventChip,
  useChipOpener,
} from "./EventChip";
import { useBreakpoint, useColorScheme } from "./media";
import styles from "./MonthView.module.css";
import { moveDay } from "./period";
import { type DropTarget, useChipDrag } from "./useChipDrag";

// CAL-009 AC-2, AC-5, AC-6, AC-7, Contract Block 6. Local time throughout:
// a day is [D 00:00, D+1 00:00), and an event occupies it iff
// startsAt < nextMidnight(D) && endsAt > midnight(D).
// CAL-011 AC-5, Contract Block 6: the grid is one tab stop - the selected
// cell - with a roving tabindex driven by moveDay; chips and "+N more" are
// tabIndex -1 (they are reached through the day list).

export const CHIPS_PER_CELL = { desktop: 4, tablet: 3, phone: 0 } as const;
export const DOTS_PER_CELL = 4;

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const nextMidnight = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

function occupies(event: Event, day: Date): boolean {
  return (
    event.startsAt.getTime() < nextMidnight(day).getTime() &&
    event.endsAt.getTime() > day.getTime()
  );
}

/** All-day first, then ascending startsAt, then title. */
function cellOrder(a: Event, b: Event): number {
  return (
    Number(b.allDay) - Number(a.allDay) ||
    a.startsAt.getTime() - b.startsAt.getTime() ||
    a.title.localeCompare(b.title)
  );
}

/** The events occupying the local day `day` (a midnight), in cell order. */
export function eventsOnDay(events: Event[], day: Date): Event[] {
  return events.filter((e) => occupies(e, day)).sort(cellOrder);
}

/** How a chip shows its kind: live with its initial, or removed. */
export function useChipKind(kinds: KindsSnapshot): (event: Event) => ChipKind {
  const initials = useMemo(() => kindInitials(kinds.kinds), [kinds.kinds]);
  return (event: Event): ChipKind => {
    const kind = kinds.byId(event.kindId);
    if (kind === undefined || kind.deletedAt !== null) {
      return { status: "removed" };
    }
    return { status: "live", kind, initial: initials.get(kind.id) ?? "" };
  };
}

function countLabel(n: number): string {
  if (n === 0) return "no events";
  return n === 1 ? "1 event" : `${n} events`;
}

export function MonthView(props: {
  year: number;
  month: number;
  /** Already limited to the grid's range by the caller; any order. */
  events: Event[];
  kinds: KindsSnapshot;
  today: Date;
  /** Events still loading: `aria-busy` on the grid, and no empty card. */
  loading: boolean;
  /** Local midnight of the selected day; the one tab stop. */
  selected: Date;
  /** A click on a cell, or a key that moved the selection (possibly out of the visible grid). */
  onSelect: (date: Date) => void;
  /** CAL-012 Block 6: a click, Enter or Space on a cell, after onSelect. Without it Enter and Space do nothing. */
  onActivateDay?: (date: Date, cell: HTMLElement) => void;
  /** CAL-012 Block 6: a chip inside a cell; neither selects nor activates the cell. */
  onOpenEvent?: (event: Event, chip: HTMLElement) => void;
  /** CAL-012 Block 6 (as amended): the empty card's "or add an event". */
  onAddEvent?: () => void;
  /** CAL-013 Block 5: a chip's mapped key (Delete, Alt+arrows). */
  onChipCommand?: (
    event: Event,
    command: ChipCommand,
    chip: HTMLElement,
  ) => void;
  /** CAL-013 Block 5: a chip dragged onto a cell; with it every cell carries data-drop-day. */
  onDropEvent?: (event: Event, target: DropTarget) => void;
}): JSX.Element {
  const {
    year,
    month,
    events,
    kinds,
    today,
    loading,
    selected,
    onSelect,
    onActivateDay,
    onOpenEvent,
    onAddEvent,
    onChipCommand,
    onDropEvent,
  } = props;
  const breakpoint = useBreakpoint();
  const dark = useColorScheme() === "dark";
  const navigate = useNavigate();
  const grid = useRef<HTMLDivElement>(null);
  // The day a key moved the selection to: focused once its cell is the tab
  // stop, which may be a render later, after the page has moved the grid to
  // another month. A click sets nothing here - the click already focused.
  const focusDay = useRef<string | null>(null);

  const days = useMemo(
    () =>
      monthGrid(year, month).map((cell) => ({
        ...cell,
        events: eventsOnDay(events, cell.date),
      })),
    [year, month, events],
  );

  const chipKind = useChipKind(kinds);
  const chips = useChipOpener(onOpenEvent);
  const drag = useChipDrag(onDropEvent);

  const todayKey = dayKey(today);
  const selectedKey = dayKey(selected);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the selected day and the visible month are the triggers; the target is read from the ref
  useEffect(() => {
    const target = focusDay.current;
    if (target === null || target !== selectedKey) return;
    const cell = grid.current?.querySelector<HTMLElement>(
      `[data-day="${target}"][tabindex="0"]`,
    );
    if (cell === null || cell === undefined) return;
    focusDay.current = null;
    cell.focus();
  }, [selectedKey, year, month]);

  const activate = (date: Date, cell: HTMLElement) => {
    onSelect(date);
    onActivateDay?.(date, cell);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      // Only on a cell itself: a key on a chip or "+N more" is theirs.
      const cell = event.target;
      if (onActivateDay === undefined) return;
      if (!(cell instanceof HTMLElement)) return;
      if (cell.getAttribute("role") !== "gridcell") return;
      const date = days.find((d) => dayKey(d.date) === cell.dataset.day)?.date;
      if (date === undefined) return;
      event.preventDefault();
      activate(date, cell);
      return;
    }
    const next = moveDay(selected, event.key);
    if (next === null) return;
    event.preventDefault();
    focusDay.current = dayKey(next);
    onSelect(next);
  };

  // PO decision 7: no event in any of the 42 visible cells.
  const empty = !loading && days.every((d) => d.events.length === 0);
  const weeks = Array.from({ length: 6 }, (_, w) =>
    days.slice(w * 7, w * 7 + 7),
  );
  const shown = CHIPS_PER_CELL[breakpoint];

  const dot = (event: Event) => {
    const k = chipKind(event);
    if (k.status === "removed") {
      return (
        <i key={chipKey(event)} className={styles.dot} data-neutral="true" />
      );
    }
    const background = dark ? k.kind.colorDark : k.kind.colorLight;
    return (
      <i key={chipKey(event)} className={styles.dot} style={{ background }} />
    );
  };

  return (
    <div className={styles.month}>
      {/* biome-ignore lint/a11y/useSemanticElements: Contract Block 6 pins this ARIA grid as divs with explicit roles (accessibility.md, Roles and names) */}
      <div
        ref={grid}
        role="grid"
        aria-label={format(new Date(year, month - 1, 1), "MMMM yyyy")}
        aria-busy={loading ? "true" : undefined}
        data-breakpoint={breakpoint}
        className={styles.grid}
        onKeyDown={onKeyDown}
      >
        {/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: as the grid above; a row is not a tab stop - the selected cell is */}
        <div role="row" className={styles.row}>
          {WEEKDAYS.map((name) => (
            // biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: as the grid above; a column header is not a tab stop
            <div
              key={name}
              role="columnheader"
              aria-label={name}
              className={styles.head}
            >
              <span aria-hidden="true">{name.slice(0, 3).toUpperCase()}</span>
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          // biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: as the grid above; a row is not a tab stop - the selected cell is
          <div
            key={dayKey(week[0]?.date ?? new Date(0))}
            role="row"
            className={styles.row}
          >
            {week.map(({ date, inMonth, events: dayEvents }) => {
              const label = format(date, "EEEE d MMMM");
              const key = dayKey(date);
              const rest = dayEvents.length - shown;
              const isSelected = key === selectedKey;
              return (
                // biome-ignore lint/a11y/useSemanticElements lint/a11y/useKeyWithClickEvents: as the grid above (CAL-009 PO decision 14); the keys are the grid's onKeyDown, one handler for the roving tab stop
                <div
                  key={key}
                  role="gridcell"
                  aria-label={`${label}, ${countLabel(dayEvents.length)}`}
                  aria-current={key === todayKey ? "date" : undefined}
                  aria-selected={isSelected ? "true" : undefined}
                  tabIndex={isSelected ? 0 : -1}
                  data-day={key}
                  data-outside={inMonth ? undefined : "true"}
                  data-drop-day={onDropEvent === undefined ? undefined : key}
                  className={styles.cell}
                  onClick={(e) => activate(date, e.currentTarget)}
                  onClickCapture={chips.onClickCapture}
                >
                  <span aria-hidden="true" className={styles.day}>
                    {date.getDate()}
                  </span>
                  {breakpoint === "phone" ? (
                    dayEvents.length > 0 && (
                      <span aria-hidden="true" className={styles.dots}>
                        {dayEvents.slice(0, DOTS_PER_CELL).map(dot)}
                        {dayEvents.length > DOTS_PER_CELL && <span>+</span>}
                      </span>
                    )
                  ) : (
                    <>
                      {dayEvents.slice(0, shown).map((e) => (
                        <EventChip
                          key={chipKey(e)}
                          event={e}
                          kind={chipKind(e)}
                          tabIndex={-1}
                          onActivate={chips.onActivate}
                          onCommand={onChipCommand}
                          dragProps={drag.chipProps(e)}
                        />
                      ))}
                      {rest > 0 && (
                        <button
                          type="button"
                          tabIndex={-1}
                          className={styles.more}
                          aria-label={`${rest} more ${rest === 1 ? "event" : "events"} on ${label}`}
                          onClick={(event) => {
                            // The day view, not a selection in this grid.
                            event.stopPropagation();
                            navigate(`/day/${key}`);
                          }}
                        >
                          {`+${rest} more`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {empty && <EmptyMonth onAddEvent={onAddEvent} />}
    </div>
  );
}
