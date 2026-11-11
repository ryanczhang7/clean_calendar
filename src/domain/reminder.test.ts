import { describe, expect, it } from "vitest";
import {
  ALL_DAY_AT,
  choiceFor,
  minutesFor,
  REMINDER_OPTIONS,
  type ReminderChoice,
  reminderHelper,
  reminderPhrase,
} from "./reminder";

// CAL-057 Contract, Block 1 (AC-1, AC-4, AC-5's phrases; components.md
// "Event sheet", field 8; voice.md "reminder"). Pure. MECHANICAL: every
// label, value and phrase is written out by hand from the Contract and the
// AC text, never computed with the module under test, so the oracle does not
// share the implementation.

const ORDER: readonly (readonly [ReminderChoice, string, number | null])[] = [
  ["none", "None", null],
  ["at", "At time", 0],
  ["5", "5 minutes before", 5],
  ["10", "10 minutes before", 10],
  ["15", "15 minutes before", 15],
  ["30", "30 minutes before", 30],
  ["60", "1 hour before", 60],
  ["120", "2 hours before", 120],
  ["1440", "1 day before", 1440],
];

describe("CAL-057 REMINDER_OPTIONS (AC-1, Block 1)", () => {
  it("lists the nine choices with their labels, in the select's order: None, At time, 5, 10, 15, 30 minutes, 1 hour, 2 hours, 1 day before", () => {
    expect(REMINDER_OPTIONS.map((o) => [o.choice, o.label])).toStrictEqual(
      ORDER.map(([choice, label]) => [choice, label]),
    );
  });

  it('no label says "notification" (voice.md: a reminder is the thing set on the event)', () => {
    for (const { label } of REMINDER_OPTIONS) {
      expect(label.toLowerCase()).not.toContain("notification");
    }
  });
});

describe("CAL-057 minutesFor(choice, allDay) (AC-1, AC-4, Block 1)", () => {
  it.each(ORDER)("a timed event: %s (%s) -> %j", (choice, _label, minutes) => {
    expect(minutesFor(choice, false)).toBe(minutes);
  });

  it("ALL_DAY_AT is -540: 540 minutes AFTER an all-day event's local-midnight start, 09:00 on the day", () => {
    expect(ALL_DAY_AT).toBe(-540);
  });

  it('an all-day event, "At time" -> -540 (AC-4)', () => {
    expect(minutesFor("at", true)).toBe(-540);
  });

  it.each(ORDER.filter(([choice]) => choice !== "at"))(
    "an all-day event: every other choice is unchanged, %s -> %j",
    (choice, _label, minutes) => {
      expect(minutesFor(choice, true)).toBe(minutes);
    },
  );
});

describe("CAL-057 choiceFor(minutesBefore) (AC-3, Block 1)", () => {
  it.each([
    [null, "none"],
    [0, "at"],
    [-540, "at"],
    [5, "5"],
    [10, "10"],
    [15, "15"],
    [30, "30"],
    [60, "60"],
    [120, "120"],
    [1440, "1440"],
  ] as const)("%j -> %j", (minutes, choice) => {
    expect(choiceFor(minutes)).toBe(choice);
  });

  it.each([45, 1, 2880, -60])(
    'an unlisted value (another client\'s) %j -> "none", for display only',
    (minutes) => {
      expect(choiceFor(minutes)).toBe("none");
    },
  );
});

describe("CAL-057 reminderHelper(choice, allDay) (AC-4, Block 1)", () => {
  it('"At time" on an all-day event reads "At 09:00 on the day"', () => {
    expect(reminderHelper("at", true)).toBe("At 09:00 on the day");
  });

  it('"At time" on a timed event has no helper', () => {
    expect(reminderHelper("at", false)).toBeNull();
  });

  it.each(ORDER.filter(([choice]) => choice !== "at"))(
    "%s has no helper, all-day or timed",
    (choice) => {
      expect(reminderHelper(choice, true)).toBeNull();
      expect(reminderHelper(choice, false)).toBeNull();
    },
  );
});

describe("CAL-057 reminderPhrase(minutesBefore) (AC-5, Block 1)", () => {
  it.each([
    [0, "at start time"],
    [-540, "at 09:00 on the day"],
    [5, "5 minutes before"],
    [10, "10 minutes before"],
    [15, "15 minutes before"],
    [30, "30 minutes before"],
    [60, "1 hour before"],
    [120, "2 hours before"],
    [1440, "1 day before"],
    [45, "45 minutes before"],
  ] as const)("%j -> %j", (minutes, phrase) => {
    expect(reminderPhrase(minutes)).toBe(phrase);
  });
});
