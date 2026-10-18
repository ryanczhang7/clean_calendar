import type { Event } from "../data/rows";

// CAL-010 AC-1, AC-2, AC-4, AC-5, Contract Block 1. Pure maths for the week
// and day time grid; the numbers are layout.md's ("Grid maths that tests can
// pin"). Local time throughout: a day is [D 00:00, D+1 00:00).

export const MIN_BLOCK_HEIGHT = 20;
export const ALL_DAY_CHIP_HEIGHT = 24;
export const ALL_DAY_ROW_PADDING = 8;
export const ALL_DAY_MAX_CHIPS = 3;
export const HOUR_HEIGHT = { phone: 56, tablet: 48, desktop: 48 } as const;
export const SCROLL_FALLBACK_HOUR = 8;

const MINUTE = 60_000;

const nextMidnight = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

/** Whole minutes since local midnight: hours × 60 + minutes; seconds ignored. */
export function minuteOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** AC-1. top = minuteOfDay(start) / 60 × hourHeight; height = max(duration / 60 × hourHeight, MIN_BLOCK_HEIGHT). */
export function blockGeometry(
  start: Date,
  end: Date,
  hourHeight: number,
): { top: number; height: number } {
  const minutes = (end.getTime() - start.getTime()) / MINUTE;
  return {
    top: (minuteOfDay(start) / 60) * hourHeight,
    height: Math.max((minutes / 60) * hourHeight, MIN_BLOCK_HEIGHT),
  };
}

/** The [start, end) of `event` clipped to the local day `day` (a midnight); null when it does not occupy the day. */
export function clipToDay(
  event: Event,
  day: Date,
): { start: Date; end: Date } | null {
  const next = nextMidnight(day);
  if (
    !(
      event.startsAt.getTime() < next.getTime() &&
      event.endsAt.getTime() > day.getTime()
    )
  ) {
    return null;
  }
  return {
    start: new Date(Math.max(event.startsAt.getTime(), day.getTime())),
    end: new Date(Math.min(event.endsAt.getTime(), next.getTime())),
  };
}

/** Start ascending, then end descending (the longer first), then title. */
function startOrder(a: Event, b: Event): number {
  return (
    a.startsAt.getTime() - b.startsAt.getTime() ||
    b.endsAt.getTime() - a.endsAt.getTime() ||
    a.title.localeCompare(b.title)
  );
}

/** AC-2. Column index and column count per event id, for the timed events of ONE day. */
export function overlapColumns(
  events: Event[],
): Map<string, { column: number; columns: number }> {
  const result = new Map<string, { column: number; columns: number }>();
  const sorted = events.filter((e) => !e.allDay).sort(startOrder);

  let cluster: { id: string; column: number }[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  const close = () => {
    const columns = columnEnds.length;
    for (const { id, column } of cluster) result.set(id, { column, columns });
    cluster = [];
    columnEnds = [];
  };

  for (const event of sorted) {
    const start = event.startsAt.getTime();
    const end = event.endsAt.getTime();
    // Earlier members all start at or before this one, so it overlaps one
    // of them iff the latest end among them is after its start - strict:
    // touching end-to-start is not overlapping.
    if (!(start < clusterEnd)) {
      close();
      clusterEnd = Number.NEGATIVE_INFINITY;
    }
    let column = columnEnds.findIndex(
      (occupiedUntil) => occupiedUntil <= start,
    );
    if (column === -1) column = columnEnds.length;
    columnEnds[column] = end;
    cluster.push({ id: event.id, column });
    clusterEnd = Math.max(clusterEnd, end);
  }
  close();
  return result;
}

/** AC-4. max(1, min(ALL_DAY_MAX_CHIPS, count)) × ALL_DAY_CHIP_HEIGHT + ALL_DAY_ROW_PADDING. */
export function allDayRowHeight(count: number): number {
  return (
    Math.max(1, Math.min(ALL_DAY_MAX_CHIPS, count)) * ALL_DAY_CHIP_HEIGHT +
    ALL_DAY_ROW_PADDING
  );
}

/** AC-5. With `nowTop` a number: max(0, nowTop − viewportHeight / 3); with null: SCROLL_FALLBACK_HOUR × hourHeight. */
export function initialScrollTop(
  nowTop: number | null,
  hourHeight: number,
  viewportHeight: number,
): number {
  if (nowTop === null) return SCROLL_FALLBACK_HOUR * hourHeight;
  return Math.max(0, nowTop - viewportHeight / 3);
}

/** Monday 00:00 local of the week holding `d`. */
export function weekStart(d: Date): Date {
  const sinceMonday = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - sinceMonday);
}

/** `n` consecutive local midnights from `first`. */
export function daysFrom(first: Date, n: number): Date[] {
  return Array.from(
    { length: n },
    (_, i) =>
      new Date(first.getFullYear(), first.getMonth(), first.getDate() + i),
  );
}
