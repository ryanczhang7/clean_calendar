import { format } from "date-fns";
import { type JSX, useMemo } from "react";
import { useNavigate } from "react-router";
import type { Event } from "../data/rows";
import { kindInitials } from "../domain/kindInitials";
import { dayKey, monthGrid } from "../domain/monthGrid";
import type { KindsSnapshot } from "../sync/kindsStore";
import { EmptyMonth } from "./EmptyMonth";
import { type ChipKind, EventChip } from "./EventChip";
import { useBreakpoint, useColorScheme } from "./media";
import styles from "./MonthView.module.css";

// CAL-009 AC-2, AC-5, AC-6, AC-7, Contract Block 6. Local time throughout:
// a day is [D 00:00, D+1 00:00), and an event occupies it iff
// startsAt < nextMidnight(D) && endsAt > midnight(D). No roving focus yet
// (CAL-011).

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
}): JSX.Element {
  const { year, month, events, kinds, today, loading } = props;
  const breakpoint = useBreakpoint();
  const dark = useColorScheme() === "dark";
  const navigate = useNavigate();

  const days = useMemo(
    () =>
      monthGrid(year, month).map((cell) => ({
        ...cell,
        events: events.filter((e) => occupies(e, cell.date)).sort(cellOrder),
      })),
    [year, month, events],
  );

  const initials = useMemo(() => kindInitials(kinds.kinds), [kinds.kinds]);
  const chipKind = (event: Event): ChipKind => {
    const kind = kinds.byId(event.kindId);
    if (kind === undefined || kind.deletedAt !== null) {
      return { status: "removed" };
    }
    return { status: "live", kind, initial: initials.get(kind.id) ?? "" };
  };

  const todayKey = dayKey(today);
  // PO decision 7: no event in any of the 42 visible cells.
  const empty = !loading && days.every((d) => d.events.length === 0);
  const weeks = Array.from({ length: 6 }, (_, w) =>
    days.slice(w * 7, w * 7 + 7),
  );
  const shown = CHIPS_PER_CELL[breakpoint];

  const dot = (event: Event) => {
    const k = chipKind(event);
    if (k.status === "removed") {
      return <i key={event.id} className={styles.dot} data-neutral="true" />;
    }
    const background = dark ? k.kind.colorDark : k.kind.colorLight;
    return <i key={event.id} className={styles.dot} style={{ background }} />;
  };

  return (
    <div className={styles.month}>
      {/* biome-ignore lint/a11y/useSemanticElements: Contract Block 6 pins this ARIA grid as divs with explicit roles (accessibility.md, Roles and names) */}
      <div
        role="grid"
        aria-label={format(new Date(year, month - 1, 1), "MMMM yyyy")}
        aria-busy={loading ? "true" : undefined}
        data-breakpoint={breakpoint}
        className={styles.grid}
      >
        {/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: as the grid above; focus is the roving tabindex CAL-011 adds, and Block 6 says no tabIndex yet */}
        <div role="row" className={styles.row}>
          {WEEKDAYS.map((name) => (
            // biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: as the grid above
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
          // biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: as the grid above
          <div
            key={dayKey(week[0]?.date ?? new Date(0))}
            role="row"
            className={styles.row}
          >
            {week.map(({ date, inMonth, events: dayEvents }) => {
              const label = format(date, "EEEE d MMMM");
              const key = dayKey(date);
              const rest = dayEvents.length - shown;
              return (
                // biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: as the grid above; the roving focus is CAL-011's
                <div
                  key={key}
                  role="gridcell"
                  aria-label={`${label}, ${countLabel(dayEvents.length)}`}
                  aria-current={key === todayKey ? "date" : undefined}
                  data-outside={inMonth ? undefined : "true"}
                  className={styles.cell}
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
                        <EventChip key={e.id} event={e} kind={chipKind(e)} />
                      ))}
                      {rest > 0 && (
                        <button
                          type="button"
                          className={styles.more}
                          aria-label={`${rest} more ${rest === 1 ? "event" : "events"} on ${label}`}
                          onClick={() => navigate(`/day/${key}`)}
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
      {empty && <EmptyMonth />}
    </div>
  );
}
