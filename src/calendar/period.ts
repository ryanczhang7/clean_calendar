import { format } from "date-fns";
import { dayKey } from "../domain/monthGrid";
import { weekStart } from "../domain/timeGrid";

// CAL-011 Contract, Block 1. Pure period maths: which view and date a URL
// names, the URL of a period, previous/next, the title and the month grid's
// keyboard steps. Local time throughout; every `date` is a local midnight.

export type View = "month" | "week" | "day";
/** `date` is a local midnight: the 1st for month; for week the URL's day (any weekday); for day the day. */
export type Period = { view: View; date: Date };

export const VIEW_KEY = "cc.view";

const VIEWS: readonly View[] = ["month", "week", "day"];

const isView = (value: unknown): value is View => VIEWS.includes(value as View);

/** localStorage[VIEW_KEY] when it is one of the three views; "month" otherwise, or when storage throws. */
export function readView(): View {
  try {
    const stored = localStorage.getItem(VIEW_KEY);
    return isView(stored) ? stored : "month";
  } catch {
    return "month";
  }
}

/** Writes VIEW_KEY; a throwing storage is swallowed (as `onboarding.ts` does). */
export function storeView(view: View): void {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Not remembered; `/` then shows the month, which is harmless.
  }
}

const midnight = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** True for `/` and any path under `/month/`, `/week/` or `/day/` (PO decision 13). */
export function isCalendarPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname.startsWith("/month/") ||
    pathname.startsWith("/week/") ||
    pathname.startsWith("/day/")
  );
}

const MONTH_PATH = /^\/month\/(\d{4})-(0[1-9]|1[0-2])$/;
const DAY_PATH = /^\/(week|day)\/(\d{4})-(0[1-9]|1[0-2])-(\d{2})$/;

/** `/` → `{ fallback, today }` normalised; the three calendar routes → that period; anything else → null. */
export function parsePath(
  pathname: string,
  fallback: View,
  today: Date,
): Period | null {
  if (pathname === "/") {
    return fallback === "month"
      ? { view: "month", date: periodOf("month", today, false).date }
      : { view: fallback, date: midnight(today) };
  }
  const month = MONTH_PATH.exec(pathname);
  if (month !== null) {
    return {
      view: "month",
      date: new Date(Number(month[1]), Number(month[2]) - 1, 1),
    };
  }
  const day = DAY_PATH.exec(pathname);
  if (day === null) return null;
  const [y, m, dd] = [Number(day[2]), Number(day[3]), Number(day[4])];
  const date = new Date(y, m - 1, dd);
  // A real calendar date: 2026-02-30 does not parse.
  if (date.getMonth() !== m - 1 || date.getDate() !== dd) return null;
  return { view: day[1] as View, date };
}

/** `/month/2026-10`, `/week/2026-10-14`, `/day/2026-10-14` - the date as held, zero-padded. */
export function periodPath(period: Period): string {
  const key = dayKey(period.date);
  return period.view === "month"
    ? `/month/${key.slice(0, 7)}`
    : `/${period.view}/${key}`;
}

/** The period of view `view` holding `date`: month → its 1st; week → `date` (phone) or `weekStart(date)`; day → `date`. */
export function periodOf(view: View, date: Date, phone: boolean): Period {
  if (view === "month") {
    return { view, date: new Date(date.getFullYear(), date.getMonth(), 1) };
  }
  if (view === "week" && !phone) return { view, date: weekStart(date) };
  return { view, date: midnight(date) };
}

/** ±1 month (to the 1st) / ±7 days from the Monday / ±1 day; week on phone moves ±1 day. */
export function shiftPeriod(
  period: Period,
  dir: 1 | -1,
  phone: boolean,
): Period {
  const { view, date } = period;
  if (view === "month") {
    return {
      view,
      date: new Date(date.getFullYear(), date.getMonth() + dir, 1),
    };
  }
  if (view === "week" && !phone) {
    return { view, date: addDays(weekStart(date), 7 * dir) };
  }
  return { view, date: addDays(date, dir) };
}

/** The visible title (Block 1's table). */
export function periodTitle(period: Period, phone: boolean): string {
  const { view, date } = period;
  if (view === "month") return format(date, "MMMM yyyy");
  if (view === "day") return format(date, "EEEE d MMMM yyyy");
  if (phone) {
    const first = addDays(date, -1);
    const last = addDays(date, 1);
    const sameMonth = first.getMonth() === last.getMonth();
    return `${format(first, sameMonth ? "EEE d" : "EEE d MMM")} – ${format(last, "EEE d MMM")}`;
  }
  const first = weekStart(date);
  const last = addDays(first, 6);
  if (first.getFullYear() !== last.getFullYear()) {
    return `${format(first, "d MMM yyyy")} – ${format(last, "d MMM yyyy")}`;
  }
  const head = first.getMonth() === last.getMonth() ? "d" : "d MMM";
  return `${format(first, head)} – ${format(last, "d MMM yyyy")}`;
}

/** "Previous month" / "Next month" etc.; week on phone says "day". */
export function navNames(
  view: View,
  phone: boolean,
): { previous: string; next: string } {
  const unit = view === "week" && phone ? "day" : view;
  return { previous: `Previous ${unit}`, next: `Next ${unit}` };
}

/** ±1 month keeping the day of the month, clamped to the target month's last day. */
function addMonthClamped(date: Date, dir: 1 | -1): Date {
  const y = date.getFullYear();
  const m = date.getMonth() + dir;
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(date.getDate(), last));
}

/** One keyboard step from `date` in the month grid, or null for a key it does not handle. */
export function moveDay(date: Date, key: string): Date | null {
  const day = midnight(date);
  switch (key) {
    case "ArrowLeft":
      return addDays(day, -1);
    case "ArrowRight":
      return addDays(day, 1);
    case "ArrowUp":
      return addDays(day, -7);
    case "ArrowDown":
      return addDays(day, 7);
    case "Home":
      return weekStart(day);
    case "End":
      return addDays(weekStart(day), 6);
    case "PageUp":
      return addMonthClamped(day, -1);
    case "PageDown":
      return addMonthClamped(day, 1);
    default:
      return null;
  }
}
