// CAL-057 Contract, Block 1 (components.md "Event sheet", field 8; voice.md:
// "reminder", never "notification"). The one place a reminder's choices,
// labels and phrases live. Pure.
//
// `minutes_before` counts back from the event's start, so an all-day event's
// "At time" is ALL_DAY_AT, -540: 540 minutes AFTER its local-midnight start,
// 09:00 on the day (AC-4).

export type ReminderChoice =
  | "none"
  | "at"
  | "5"
  | "10"
  | "15"
  | "30"
  | "60"
  | "120"
  | "1440";

/** In the select's order (components.md, field 8). */
export const REMINDER_OPTIONS: readonly {
  choice: ReminderChoice;
  label: string;
}[] = [
  { choice: "none", label: "None" },
  { choice: "at", label: "At time" },
  { choice: "5", label: "5 minutes before" },
  { choice: "10", label: "10 minutes before" },
  { choice: "15", label: "15 minutes before" },
  { choice: "30", label: "30 minutes before" },
  { choice: "60", label: "1 hour before" },
  { choice: "120", label: "2 hours before" },
  { choice: "1440", label: "1 day before" },
];

/** 09:00 after an all-day event's local-midnight start, as minutes BEFORE it. */
export const ALL_DAY_AT = -540;

const NUMBERED: readonly ReminderChoice[] = [
  "5",
  "10",
  "15",
  "30",
  "60",
  "120",
  "1440",
];

export function minutesFor(
  choice: ReminderChoice,
  allDay: boolean,
): number | null {
  if (choice === "none") return null;
  if (choice === "at") return allDay ? ALL_DAY_AT : 0;
  return Number(choice);
}

/** The choice a stored value shows as; an unlisted value shows "None" (display only). */
export function choiceFor(minutesBefore: number | null): ReminderChoice {
  if (minutesBefore === null) return "none";
  if (minutesBefore === 0 || minutesBefore === ALL_DAY_AT) return "at";
  return NUMBERED.find((c) => Number(c) === minutesBefore) ?? "none";
}

export function reminderHelper(
  choice: ReminderChoice,
  allDay: boolean,
): string | null {
  return choice === "at" && allDay ? "At 09:00 on the day" : null;
}

/** The chip name's reminder part (AC-5), after "reminder ". */
export function reminderPhrase(minutesBefore: number): string {
  if (minutesBefore === 0) return "at start time";
  if (minutesBefore === ALL_DAY_AT) return "at 09:00 on the day";
  if (minutesBefore === 60) return "1 hour before";
  if (minutesBefore === 120) return "2 hours before";
  if (minutesBefore === 1440) return "1 day before";
  return `${minutesBefore} minutes before`;
}
