import { differenceInCalendarDays, format } from "date-fns";
import type { Event } from "../data/rows";

// CAL-013 Contract, Block 1. Pure arithmetic for moving, nudging and resizing
// an event, plus the toast copy (voice.md, "Toasts"). Local time throughout.
// Timed events keep their ELAPSED duration; all-day events keep their number
// of calendar days, so their ends stay on local midnights across DST.

export type Span = { startsAt: Date; endsAt: Date };
type Movable = Pick<Event, "startsAt" | "endsAt" | "allDay">;

/** The nudge and resize step (components.md, Event chip). */
export const STEP_MINUTES = 15;

const MINUTE = 60_000;

const atDay = (d: Date, days = 0) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

/** AC-1. Timed: the end moves by the same elapsed ms as the start. All-day:
 *  `newStart` is read as a calendar day and the end keeps the day count. */
export function moveEvent(event: Movable, newStart: Date): Span {
  if (event.allDay) {
    const days = differenceInCalendarDays(event.endsAt, event.startsAt);
    return { startsAt: atDay(newStart), endsAt: atDay(newStart, days) };
  }
  const duration = event.endsAt.getTime() - event.startsAt.getTime();
  return {
    startsAt: new Date(newStart.getTime()),
    endsAt: new Date(newStart.getTime() + duration),
  };
}

/** The date becomes `day`'s, the local time of day is kept (timed). */
export function moveToDay(event: Movable, day: Date): Span {
  if (event.allDay) return moveEvent(event, day);
  const s = event.startsAt;
  const newStart = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    s.getHours(),
    s.getMinutes(),
    s.getSeconds(),
    s.getMilliseconds(),
  );
  return moveEvent(event, newStart);
}

/** Timed: starts at `slotStart`. All-day: stays all-day, on that day. */
export function moveToSlot(event: Movable, slotStart: Date): Span {
  if (event.allDay) return moveToDay(event, slotStart);
  return moveEvent(event, slotStart);
}

/** The end moves by `minutes`; null for an all-day event, or when the end
 *  would be less than STEP_MINUTES after the start. */
export function resizeBy(event: Movable, minutes: number): Span | null {
  if (event.allDay) return null;
  const end = event.endsAt.getTime() + minutes * MINUTE;
  if (end - event.startsAt.getTime() < STEP_MINUTES * MINUTE) return null;
  return {
    startsAt: new Date(event.startsAt.getTime()),
    endsAt: new Date(end),
  };
}

/** "Moved to Wed 14 Oct, 10:00"; all-day "Moved to Wed 14 Oct". */
export function movedLabel(span: Span, allDay: boolean): string {
  return `Moved to ${format(span.startsAt, allDay ? "EEE d MMM" : "EEE d MMM, HH:mm")}`;
}

/** "Now ends at 11:30". */
export function resizedLabel(span: Span): string {
  return `Now ends at ${format(span.endsAt, "HH:mm")}`;
}

/** "Deleted {title}". */
export function deletedLabel(title: string): string {
  return `Deleted ${title}`;
}

const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

/** `series` moved by the wall-clock delta from `shown` to `next`. */
function shifted(series: Date, shown: Date, next: Date): Date {
  const days = differenceInCalendarDays(next, shown);
  const minutes = minutesOfDay(next) - minutesOfDay(shown);
  return new Date(
    series.getFullYear(),
    series.getMonth(),
    series.getDate() + days,
    series.getHours(),
    series.getMinutes() + minutes,
    series.getSeconds(),
    series.getMilliseconds(),
  );
}

/**
 * CAL-025 Contract, Block 5 (AC-6, PO decisions 6 and 8). The series' span
 * after "All events" moves the occurrence `shown` to `next`: start and end
 * each by their own delta, in device-local WALL TIME - calendar days plus
 * minutes of the day - so a series keeps its clock time across a DST change,
 * and never takes the occurrence's own dates.
 */
export function seriesSpan(series: Span, shown: Span, next: Span): Span {
  return {
    startsAt: shifted(series.startsAt, shown.startsAt, next.startsAt),
    endsAt: shifted(series.endsAt, shown.endsAt, next.endsAt),
  };
}

/** "Deleted {title} and all its occurrences" (voice.md, Toasts). */
export function deletedSeriesLabel(title: string): string {
  return `Deleted ${title} and all its occurrences`;
}
