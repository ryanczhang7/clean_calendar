import { format } from "date-fns";
import {
  type CSSProperties,
  type JSX,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { useNavigate } from "react-router";
import type { Event } from "../data/rows";
import { kindInitials } from "../domain/kindInitials";
import { dayKey } from "../domain/monthGrid";
import {
  ALL_DAY_MAX_CHIPS,
  allDayRowHeight,
  blockGeometry,
  clipToDay,
  HOUR_HEIGHT,
  initialScrollTop,
  minuteOfDay,
  overlapColumns,
} from "../domain/timeGrid";
import type { KindsSnapshot } from "../sync/kindsStore";
import { type ChipKind, EventChip } from "./EventChip";
import { useBreakpoint } from "./media";
import styles from "./TimeGrid.module.css";

// CAL-010 AC-1 to AC-5, Contract Block 3. The week / day time grid: a header
// row, an all-day row, then 24 hour rows under a scroll container with the
// timed blocks laid over them, one overlay column per day. Local time
// throughout. No roving focus, no click-to-create, no drag (CAL-011..013).

const HOURS = Array.from(
  { length: 24 },
  (_, h) => `${String(h).padStart(2, "0")}:00`,
);

const dayName = (d: Date) => format(d, "EEEE d MMMM");

/** All-day chips: ascending startsAt, then title. */
function allDayOrder(a: Event, b: Event): number {
  return (
    a.startsAt.getTime() - b.startsAt.getTime() ||
    a.title.localeCompare(b.title)
  );
}

type Block = {
  event: Event;
  style: CSSProperties;
  height: number;
};

export function TimeGrid(props: {
  /** Local midnights, in column order; 1, 3 or 7 of them. */
  days: Date[];
  /** The grid's accessible name. */
  label: string;
  /** Already limited to the days' range by the caller; any order. */
  events: Event[];
  kinds: KindsSnapshot;
  now: Date;
  loading: boolean;
}): JSX.Element {
  const { days, label, events, kinds, now, loading } = props;
  const breakpoint = useBreakpoint();
  const hourHeight = HOUR_HEIGHT[breakpoint];
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  const initials = useMemo(() => kindInitials(kinds.kinds), [kinds.kinds]);
  const chipKind = (event: Event): ChipKind => {
    const kind = kinds.byId(event.kindId);
    if (kind === undefined || kind.deletedAt !== null) {
      return { status: "removed" };
    }
    return { status: "live", kind, initial: initials.get(kind.id) ?? "" };
  };

  const columns = useMemo(
    () =>
      days.map((day) => {
        const allDay = events
          .filter((e) => e.allDay && clipToDay(e, day) !== null)
          .sort(allDayOrder);
        // Overlap is decided by the CLIPPED interval for this day.
        const clipped: Event[] = [];
        for (const e of events) {
          if (e.allDay) continue;
          const clip = clipToDay(e, day);
          if (clip === null) continue;
          clipped.push({ ...e, startsAt: clip.start, endsAt: clip.end });
        }
        const layout = overlapColumns(clipped);
        const blocks: Block[] = clipped.map((c) => {
          const { top, height } = blockGeometry(
            c.startsAt,
            c.endsAt,
            hourHeight,
          );
          const { column, columns: n } = layout.get(c.id) ?? {
            column: 0,
            columns: 1,
          };
          return {
            event: events.find((e) => e.id === c.id) ?? c,
            height,
            style: {
              top: `${top}px`,
              height: `${height}px`,
              left: `${(column / n) * 100}%`,
              width: `calc(100% / ${n} - 2px)`,
            },
          };
        });
        return { day, key: dayKey(day), name: dayName(day), allDay, blocks };
      }),
    [days, events, hourHeight],
  );

  const todayKey = dayKey(now);
  const todayInView = columns.some((c) => c.key === todayKey);
  const nowTop = (minuteOfDay(now) / 60) * hourHeight;
  const maxAllDay = Math.max(0, ...columns.map((c) => c.allDay.length));

  // AC-5: once, on mount - now one third from the top, or 08:00.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Block 3 sets the initial scroll once on mount; later renders must not move the user's scroll
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (scroll === null) return;
    scroll.scrollTop = initialScrollTop(
      todayInView ? nowTop : null,
      hourHeight,
      scroll.clientHeight,
    );
  }, []);

  return (
    <div
      className={styles.timeGrid}
      data-breakpoint={breakpoint}
      style={{ "--hour-height": `${hourHeight}px` } as CSSProperties}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: Contract Block 3 pins this ARIA grid as divs with explicit roles (accessibility.md, Roles and names) */}
      <div
        role="grid"
        aria-label={label}
        aria-busy={loading ? "true" : undefined}
        className={styles.grid}
      >
        {/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: as the grid above; focus is the roving tabindex CAL-011 adds, and Block 3 says no tabIndex yet */}
        <div role="row" className={styles.header}>
          <div className={styles.gutter} aria-hidden="true" />
          {columns.map(({ day, key, name }) => (
            // biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: as the grid above
            <div
              key={key}
              role="columnheader"
              aria-label={name}
              aria-current={key === todayKey ? "date" : undefined}
              className={styles.head}
            >
              <span aria-hidden="true">
                {format(day, "EEE d").toUpperCase()}
              </span>
            </div>
          ))}
        </div>
        {/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: as the grid above */}
        <div
          role="row"
          className={styles.allDay}
          style={{ height: `${allDayRowHeight(maxAllDay)}px` }}
        >
          <div className={styles.gutter} aria-hidden="true">
            all day
          </div>
          {columns.map(({ key, name, allDay }) => {
            const rest = allDay.length - ALL_DAY_MAX_CHIPS;
            return (
              // biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: as the grid above; the roving focus is CAL-011's
              <div
                key={key}
                role="gridcell"
                aria-label={`${name}, all day`}
                className={styles.allDayCell}
              >
                {allDay.slice(0, ALL_DAY_MAX_CHIPS).map((e) => (
                  <EventChip key={e.id} event={e} kind={chipKind(e)} />
                ))}
                {rest > 0 && (
                  <button
                    type="button"
                    className={styles.more}
                    aria-label={`${rest} more all-day ${rest === 1 ? "event" : "events"} on ${name}`}
                    onClick={() => navigate(`/day/${key}`)}
                  >
                    {`+${rest}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div ref={scrollRef} className={styles.scroll} data-scroll>
          {HOURS.map((hour) => (
            // biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: as the grid above
            <div key={hour} role="row" className={styles.hour}>
              <div className={styles.gutter} aria-hidden="true">
                {hour}
              </div>
              {columns.map(({ key, name }) => (
                // biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: as the grid above; the roving focus is CAL-011's
                <div
                  key={key}
                  role="gridcell"
                  aria-label={`${name}, ${hour}`}
                  className={styles.slot}
                />
              ))}
            </div>
          ))}
          <div className={styles.overlay}>
            <div className={styles.gutter} aria-hidden="true" />
            {columns.map(({ key, blocks }) => (
              <div key={key} className={styles.column} data-day={key}>
                {blocks.map(({ event, style, height }) => (
                  <div key={event.id} className={styles.block} style={style}>
                    <EventChip
                      event={event}
                      kind={chipKind(event)}
                      variant="block"
                      height={height}
                    />
                  </div>
                ))}
                {key === todayKey && (
                  <div
                    className={styles.nowLine}
                    aria-hidden="true"
                    data-now
                    style={{ top: `${nowTop}px` }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
