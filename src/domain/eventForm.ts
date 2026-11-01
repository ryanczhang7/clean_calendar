import { addDays, differenceInCalendarDays, format } from "date-fns";
import type {
  Event,
  EventPatch,
  Kind,
  NewEvent,
  Recurrence,
} from "../data/rows";

// The event sheet's form model (CAL-012, Contract Block 1). Pure, apart from
// the two localStorage helpers at the end. Form dates are `yyyy-MM-dd` and
// times `HH:mm`, local; an all-day event is stored `[D 00:00, D+n 00:00)`
// with `endsAt` exclusive (CAL-009), and the form shows its last day
// inclusive.

export type EventFormValue = {
  title: string;
  kindId: string | null;
  allDay: boolean;
  /** yyyy-MM-dd */
  startDate: string;
  /** HH:mm; ignored while allDay */
  startTime: string;
  /** yyyy-MM-dd; inclusive while allDay */
  endDate: string;
  endTime: string;
  location: string;
  notes: string;
  /** CAL-024: "none" = Does not repeat. */
  repeat: RepeatFreq;
  /** Meaningful only while repeat !== "none". */
  repeatEnds: "never" | "on";
  /** yyyy-MM-dd; meaningful only while repeatEnds === "on". */
  repeatUntil: string;
};

export type RepeatFreq = "none" | "daily" | "weekly" | "yearly";

export type FormErrors = { title?: string; end?: string; repeatUntil?: string };

export const TITLE_ERROR = "Give the event a title.";
export const END_ERROR = "End must be after start.";
export const REPEAT_UNTIL_ERROR = "The series must end after it starts.";
export const TITLE_MAX = 120;
export const LAST_KIND_KEY = "cc.lastKind";

const DATE = "yyyy-MM-dd";
const TIME = "HH:mm";

/** The last kind used on this device; null when absent or storage throws. */
export function readLastKind(): string | null {
  try {
    return localStorage.getItem(LAST_KIND_KEY);
  } catch {
    return null;
  }
}

/** Remembers the kind; a storage that throws is swallowed (onboarding.ts). */
export function storeLastKind(id: string): void {
  try {
    localStorage.setItem(LAST_KIND_KEY, id);
  } catch {
    // Not remembered; the next sheet defaults to the first live kind.
  }
}

/** `last` when it names a live kind, else the first live kind, else null. */
export function defaultKindId(
  live: Kind[],
  last: string | null,
): string | null {
  if (last !== null && live.some((k) => k.id === last)) return last;
  return live[0]?.id ?? null;
}

/** Local midnight of a `yyyy-MM-dd`, or at `HH:mm` when given. Invalid input → an invalid Date. */
function local(date: string, time = "00:00"): Date {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (d === null || t === null) return new Date(Number.NaN);
  return new Date(
    Number(d[1]),
    Number(d[2]) - 1,
    Number(d[3]),
    Number(t[1]),
    Number(t[2]),
  );
}

const valid = (d: Date) => !Number.isNaN(d.getTime());

type RepeatPart = Pick<EventFormValue, "repeat" | "repeatEnds" | "repeatUntil">;

const NO_REPEAT: RepeatPart = {
  repeat: "none",
  repeatEnds: "never",
  repeatUntil: "",
};

/** A new event's value: all-day → the two dates equal, times "09:00"/"10:00"; timed → start and end as given. */
export function newEventValue(
  start: Date,
  end: Date,
  allDay: boolean,
  kindId: string | null,
): EventFormValue {
  const base = {
    title: "",
    kindId,
    allDay,
    location: "",
    notes: "",
    ...NO_REPEAT,
  };
  if (allDay) {
    const day = format(start, DATE);
    return {
      ...base,
      startDate: day,
      startTime: "09:00",
      endDate: day,
      endTime: "10:00",
    };
  }
  return {
    ...base,
    startDate: format(start, DATE),
    startTime: format(start, TIME),
    endDate: format(end, DATE),
    endTime: format(end, TIME),
  };
}

/** An existing event's value; an all-day event's endDate is the inclusive last day. */
export function valueFromEvent(event: Event): EventFormValue {
  const lastShown = event.allDay ? addDays(event.endsAt, -1) : event.endsAt;
  return {
    title: event.title,
    kindId: event.kindId,
    allDay: event.allDay,
    startDate: format(event.startsAt, DATE),
    startTime: format(event.startsAt, TIME),
    endDate: format(lastShown, DATE),
    endTime: format(event.endsAt, TIME),
    location: event.location ?? "",
    notes: event.notes ?? "",
    ...repeatOf(event.recurrence),
  };
}

function repeatOf(recurrence: Recurrence | null): RepeatPart {
  if (recurrence === null) return { ...NO_REPEAT };
  return {
    repeat: recurrence.freq,
    repeatEnds: recurrence.until === null ? "never" : "on",
    repeatUntil: recurrence.until ?? "",
  };
}

/** The helper under the Repeat select (AC-1); null while it does not repeat. The weekday is the start date's, device zone. */
export function repeatHelper(value: EventFormValue): string | null {
  const start = local(value.startDate);
  switch (value.repeat) {
    case "none":
      return null;
    case "daily":
      return "Every day";
    case "weekly":
      return `Every ${format(start, "EEEE")}`;
    case "yearly":
      return `Every year on ${format(start, "d MMMM")}`;
  }
}

/**
 * Start moved: when the old end was after the old start, the end moves by the
 * same delta (duration kept); otherwise only the start changes. All-day works
 * on the dates alone, where equal dates count as "after" (one day).
 */
export function moveStart(
  value: EventFormValue,
  startDate: string,
  startTime: string,
): EventFormValue {
  const moved = { ...value, startDate, startTime };
  if (value.allDay) {
    const oldStart = local(value.startDate);
    const oldEnd = local(value.endDate);
    const newStart = local(startDate);
    if (!valid(oldStart) || !valid(oldEnd) || !valid(newStart)) return moved;
    if (oldEnd.getTime() < oldStart.getTime()) return moved;
    const days = differenceInCalendarDays(newStart, oldStart);
    return { ...moved, endDate: format(addDays(oldEnd, days), DATE) };
  }
  const oldStart = local(value.startDate, value.startTime);
  const oldEnd = local(value.endDate, value.endTime);
  const newStart = local(startDate, startTime);
  if (!valid(oldStart) || !valid(oldEnd) || !valid(newStart)) return moved;
  if (oldEnd.getTime() <= oldStart.getTime()) return moved;
  const newEnd = new Date(
    newStart.getTime() + (oldEnd.getTime() - oldStart.getTime()),
  );
  return {
    ...moved,
    endDate: format(newEnd, DATE),
    endTime: format(newEnd, TIME),
  };
}

/** All-day toggled: times are kept in the value (hidden by the form), dates untouched. */
export function setAllDay(
  value: EventFormValue,
  allDay: boolean,
): EventFormValue {
  return { ...value, allDay };
}

export function validate(value: EventFormValue): FormErrors {
  const errors: FormErrors = {};
  if (value.title.trim() === "") errors.title = TITLE_ERROR;
  if (value.allDay) {
    if (!(value.endDate >= value.startDate)) errors.end = END_ERROR;
  } else {
    const { startsAt, endsAt } = toInstants(value);
    if (!(endsAt.getTime() > startsAt.getTime())) errors.end = END_ERROR;
  }
  // Ends on the start date itself is a series of one, and valid.
  if (
    value.repeat !== "none" &&
    value.repeatEnds === "on" &&
    (value.repeatUntil === "" || value.repeatUntil < value.startDate)
  )
    errors.repeatUntil = REPEAT_UNTIL_ERROR;
  return errors;
}

/** The stored instants: timed → the two local date-times; all-day → startDate 00:00 and endDate + 1 day 00:00. */
export function toInstants(value: EventFormValue): {
  startsAt: Date;
  endsAt: Date;
} {
  if (value.allDay) {
    return {
      startsAt: local(value.startDate),
      endsAt: addDays(local(value.endDate), 1),
    };
  }
  return {
    startsAt: local(value.startDate, value.startTime),
    endsAt: local(value.endDate, value.endTime),
  };
}

const blankToNull = (text: string) => (text.trim() === "" ? null : text);

/** The stored recurrence (CAL-024 Block 1). The zone is read at call time: the device's when the event is saved. */
function recurrenceOf(value: EventFormValue): Recurrence | null {
  if (value.repeat === "none") return null;
  return {
    freq: value.repeat,
    until: value.repeatEnds === "on" ? value.repeatUntil : null,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/** Field by field; both null is equal. */
function sameRecurrence(a: Recurrence | null, b: Recurrence | null): boolean {
  if (a === null || b === null) return a === b;
  return a.freq === b.freq && a.until === b.until && a.tz === b.tz;
}

/** Requires a validated value and a kindId; blank location/notes → null; origin "manual", recurrence from Repeat, captureJobId null. */
export function toNewEvent(value: EventFormValue, kindId: string): NewEvent {
  const { startsAt, endsAt } = toInstants(value);
  return {
    title: value.title,
    kindId,
    startsAt,
    endsAt,
    allDay: value.allDay,
    location: blankToNull(value.location),
    notes: blankToNull(value.notes),
    origin: "manual",
    recurrence: recurrenceOf(value),
    captureJobId: null,
  };
}

/** Only the fields whose stored value would differ from `original`; instants compared by getTime; {} when nothing changed. */
export function patchOf(original: Event, value: EventFormValue): EventPatch {
  const patch: EventPatch = {};
  const { startsAt, endsAt } = toInstants(value);
  const location = blankToNull(value.location);
  const notes = blankToNull(value.notes);
  if (value.title !== original.title) patch.title = value.title;
  if (value.kindId !== null && value.kindId !== original.kindId)
    patch.kindId = value.kindId;
  if (startsAt.getTime() !== original.startsAt.getTime())
    patch.startsAt = startsAt;
  if (endsAt.getTime() !== original.endsAt.getTime()) patch.endsAt = endsAt;
  if (value.allDay !== original.allDay) patch.allDay = value.allDay;
  if (location !== original.location) patch.location = location;
  if (notes !== original.notes) patch.notes = notes;
  const recurrence = recurrenceOf(value);
  if (!sameRecurrence(recurrence, original.recurrence))
    patch.recurrence = recurrence;
  return patch;
}
