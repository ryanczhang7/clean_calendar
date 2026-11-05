import { describe, expect, test } from "vitest";
import {
  reminderFull,
  reminderNulls,
  reminderRowFull,
  reminderRowNulls,
} from "../test/realtime-fixtures";
import { roundTripMismatches } from "../test/roundtrip";
import {
  eventFull,
  eventNulls,
  eventRowFull,
  eventRowNulls,
  kindFull,
  kindNulls,
  kindRowFull,
  kindRowNulls,
  overrideFull,
  overrideNulls,
  overrideRowFull,
  overrideRowNulls,
} from "../test/rows-fixtures";
import {
  fromEvent,
  fromEventOverride,
  fromEventOverridePatch,
  fromEventPatch,
  fromKind,
  fromKindPatch,
  fromNewReminder,
  fromReminderPatch,
  toEvent,
  toEventOverride,
  toKind,
  toReminder,
} from "./rows";

const EVENT_INSTANTS = ["starts_at", "ends_at"] as const;

describe("kinds rows map to camelCase domain objects and back (AC-1)", () => {
  test("a full kinds row maps to the camelCase Kind with every column", () => {
    expect(toKind(kindRowFull)).toStrictEqual(kindFull);
  });

  test("a kinds row with every nullable column null maps to nulls", () => {
    expect(toKind(kindRowNulls)).toStrictEqual(kindNulls);
  });

  test("bookkeeping stamps stay the server's exact strings, microseconds and +00:00 included", () => {
    const kind = toKind(kindRowFull);
    expect(kind.updatedAt).toBe("2026-10-14T09:15:02.123456+00:00");
    expect(kind.createdAt).toBe("2026-10-01T08:00:00.654321+00:00");
    expect(kind.deletedAt).toBe("2026-10-14T09:15:02.123456+00:00");
    expect(kind.updatedAt).not.toBeInstanceOf(Date);
  });

  test.each([
    ["full", kindRowFull],
    ["nulls", kindRowNulls],
  ])(
    "a %s kinds row survives fromKind(toKind(row)) byte for byte",
    (_, row) => {
      expect(roundTripMismatches(row, fromKind(toKind(row)), [])).toStrictEqual(
        [],
      );
    },
  );
});

describe("events rows map to camelCase domain objects and back (AC-1)", () => {
  test("a full events row maps to the camelCase Event with Date event times", () => {
    expect(toEvent(eventRowFull)).toStrictEqual(eventFull);
  });

  test("an events row with every nullable column null maps to nulls", () => {
    expect(toEvent(eventRowNulls)).toStrictEqual(eventNulls);
  });

  test("event times are Date instances; the stamps are strings, not Dates", () => {
    const event = toEvent(eventRowFull);
    expect(event.startsAt).toBeInstanceOf(Date);
    expect(event.endsAt).toBeInstanceOf(Date);
    expect(event.startsAt.getTime()).toBe(Date.parse("2026-10-20T09:00:00Z"));
    expect(event.endsAt.getTime()).toBe(Date.parse("2026-10-20T10:30:00Z"));
    expect(event.updatedAt).toBe("2026-10-14T09:15:02.123456+00:00");
    expect(event.updatedAt).not.toBeInstanceOf(Date);
    expect(event.createdAt).not.toBeInstanceOf(Date);
    expect(event.deletedAt).not.toBeInstanceOf(Date);
  });

  test.each([
    ["full", eventRowFull],
    ["nulls", eventRowNulls],
  ])(
    "a %s events row survives fromEvent(toEvent(row)): byte for byte, event times as instants",
    (_, row) => {
      expect(
        roundTripMismatches(row, fromEvent(toEvent(row)), EVENT_INSTANTS),
      ).toStrictEqual([]);
    },
  );

  test("fromEvent writes the event times as toISOString()", () => {
    const row = fromEvent(eventFull);
    expect(row.starts_at).toBe("2026-10-20T09:00:00.000Z");
    expect(row.ends_at).toBe("2026-10-20T10:30:00.000Z");
  });

  test("a recurrence with no end date survives the round trip", () => {
    const row = {
      ...eventRowFull,
      recurrence: { freq: "yearly", until: null, tz: "UTC" },
    };
    expect(toEvent(row).recurrence).toStrictEqual({
      freq: "yearly",
      until: null,
      tz: "UTC",
    });
    expect(
      roundTripMismatches(row, fromEvent(toEvent(row)), EVENT_INSTANTS),
    ).toStrictEqual([]);
  });

  test.each(["daily", "yearly"] as const)(
    "a %s recurrence is kept exactly and survives the round trip (CAL-035 AC-3)",
    (freq) => {
      const recurrence = { freq, until: null, tz: "Europe/London" };
      const row = { ...eventRowFull, recurrence };
      expect(toEvent(row).recurrence).toStrictEqual({
        freq,
        until: null,
        tz: "Europe/London",
      });
      expect(
        roundTripMismatches(row, fromEvent(toEvent(row)), EVENT_INSTANTS),
      ).toStrictEqual([]);
    },
  );

  test.each([
    ["an unknown freq", { freq: "monthly", until: null, tz: "UTC" }],
    ["a missing tz", { freq: "daily", until: null }],
    ["a non-string tz", { freq: "daily", until: null, tz: 1 }],
    ["a missing freq", { until: null, tz: "UTC" }],
    ["a bare string", "weekly"],
    ["a number", 7],
    ["an array", [{ freq: "daily", until: null, tz: "UTC" }]],
  ])(
    "a malformed recurrence (%s) maps to null and does not throw",
    (_, recurrence) => {
      const row = { ...eventRowFull, recurrence };
      expect(toEvent(row).recurrence).toBeNull();
    },
  );
});

describe("event_overrides rows map to camelCase domain objects and back (AC-1)", () => {
  test("a full event_overrides row maps to the camelCase EventOverride", () => {
    expect(toEventOverride(overrideRowFull)).toStrictEqual(overrideFull);
  });

  test("an event_overrides row with every nullable column null maps to nulls", () => {
    expect(toEventOverride(overrideRowNulls)).toStrictEqual(overrideNulls);
  });

  test("occurrenceDate stays a YYYY-MM-DD string, never a Date; the times are Dates", () => {
    const o = toEventOverride(overrideRowFull);
    expect(o.occurrenceDate).toBe("2026-10-27");
    expect(o.occurrenceDate).not.toBeInstanceOf(Date);
    expect(o.startsAt).toBeInstanceOf(Date);
    expect(o.endsAt).toBeInstanceOf(Date);
    expect(o.updatedAt).toBe("2026-10-14T09:15:02.123456+00:00");
    expect(o.updatedAt).not.toBeInstanceOf(Date);
  });

  test.each([
    ["full", overrideRowFull],
    ["nulls", overrideRowNulls],
  ])(
    "a %s event_overrides row survives fromEventOverride(toEventOverride(row))",
    (_, row) => {
      expect(
        roundTripMismatches(
          row,
          fromEventOverride(toEventOverride(row)),
          EVENT_INSTANTS,
        ),
      ).toStrictEqual([]);
    },
  );
});

describe("patches carry only the columns the caller named", () => {
  test("an empty kinds patch maps to an empty body", () => {
    expect(fromKindPatch({})).toStrictEqual({});
  });

  test("an undefined value in a kinds patch is dropped, not sent", () => {
    const body = fromKindPatch({ name: "Renamed", sortOrder: undefined });
    expect(body).toStrictEqual({ name: "Renamed" });
    expect(Object.keys(body)).toStrictEqual(["name"]);
  });

  test("every kinds patch field maps to its snake_case column", () => {
    expect(
      fromKindPatch({
        name: "Gym",
        colorLight: "#000001",
        colorDark: "#000002",
        sortOrder: 7,
        isDefault: false,
      }),
    ).toStrictEqual({
      name: "Gym",
      color_light: "#000001",
      color_dark: "#000002",
      sort_order: 7,
      is_default: false,
    });
  });

  test("an events patch writes Date fields as ISO strings and keeps an explicit null", () => {
    expect(
      fromEventPatch({
        startsAt: new Date("2026-10-20T10:00:00Z"),
        recurrence: null,
        captureJobId: null,
        title: undefined,
      }),
    ).toStrictEqual({
      starts_at: "2026-10-20T10:00:00.000Z",
      recurrence: null,
      capture_job_id: null,
    });
  });

  test("every events patch field maps to its own snake_case column (CAL-035 AC-1)", () => {
    expect(
      fromEventPatch({
        title: "Patch title",
        kindId: "kind-patch",
        startsAt: new Date("2026-11-02T08:15:00Z"),
        endsAt: new Date("2026-11-02T09:45:00Z"),
        allDay: true,
        location: "Patch location",
        notes: "Patch notes",
        recurrence: {
          freq: "weekly",
          until: "2026-12-31",
          tz: "Europe/London",
        },
        origin: "capture",
        captureJobId: "capture-job-patch",
      }),
    ).toStrictEqual({
      title: "Patch title",
      kind_id: "kind-patch",
      starts_at: "2026-11-02T08:15:00.000Z",
      ends_at: "2026-11-02T09:45:00.000Z",
      all_day: true,
      location: "Patch location",
      notes: "Patch notes",
      recurrence: { freq: "weekly", until: "2026-12-31", tz: "Europe/London" },
      origin: "capture",
      capture_job_id: "capture-job-patch",
    });
  });

  test("every event_overrides patch field maps to its own snake_case column (CAL-035 AC-2)", () => {
    expect(
      fromEventOverridePatch({
        eventId: "event-override-patch",
        occurrenceDate: "2026-11-03",
        cancelled: true,
        title: "Override title",
        kindId: "kind-override-patch",
        startsAt: new Date("2026-11-03T13:00:00Z"),
        endsAt: new Date("2026-11-03T14:20:00Z"),
        allDay: false,
        location: "Override location",
        notes: "Override notes",
      }),
    ).toStrictEqual({
      event_id: "event-override-patch",
      occurrence_date: "2026-11-03",
      cancelled: true,
      title: "Override title",
      kind_id: "kind-override-patch",
      starts_at: "2026-11-03T13:00:00.000Z",
      ends_at: "2026-11-03T14:20:00.000Z",
      all_day: false,
      location: "Override location",
      notes: "Override notes",
    });
  });

  test("an empty events patch maps to an empty body", () => {
    expect(fromEventPatch({})).toStrictEqual({});
  });

  test("an event_overrides patch maps only the named fields, null times kept as null", () => {
    expect(
      fromEventOverridePatch({ cancelled: true, startsAt: null, kindId: null }),
    ).toStrictEqual({ cancelled: true, starts_at: null, kind_id: null });
    expect(fromEventOverridePatch({})).toStrictEqual({});
  });
});

// CAL-026 Contract, Block 2: the reminders mapper moves into rows.ts from
// realtime.ts and gains deleted_at. The stamps stay strings, as on every
// other table; minutes_before may be negative (CAL-057's all-day "At time").
describe("reminders rows map to camelCase domain objects (CAL-026 Block 2)", () => {
  test("a full reminders row - sent, for one occurrence, soft-deleted - maps to the camelCase Reminder with every column", () => {
    expect(toReminder(reminderRowFull)).toStrictEqual(reminderFull);
  });

  test("a reminders row with every nullable column null maps to nulls: the live, unsent template", () => {
    expect(toReminder(reminderRowNulls)).toStrictEqual(reminderNulls);
  });

  test("the stamps stay the server's exact strings, microseconds and +00:00 included; occurrence_date stays a date string", () => {
    const r = toReminder(reminderRowFull);
    expect(r.deletedAt).toBe("2026-10-20T09:00:00.000003+00:00");
    expect(r.sentAt).toBe("2026-10-20T08:45:00.000007+00:00");
    expect(r.updatedAt).toBe("2026-10-14T09:15:02.123456+00:00");
    expect(r.occurrenceDate).toBe("2026-10-20");
  });

  test("a negative minutes_before is kept as it is", () => {
    expect(
      toReminder({ ...reminderRowNulls, minutes_before: -540 }).minutesBefore,
    ).toBe(-540);
  });

  test("fromNewReminder writes the four insert columns only - no id, no stamps, no deleted_at", () => {
    expect(
      fromNewReminder({
        eventId: reminderFull.eventId,
        minutesBefore: 30,
        sentAt: null,
        occurrenceDate: null,
      }),
    ).toStrictEqual({
      event_id: reminderFull.eventId,
      minutes_before: 30,
      sent_at: null,
      occurrence_date: null,
    });
  });

  test("fromNewReminder keeps a sent per-occurrence reminder's values", () => {
    expect(
      fromNewReminder({
        eventId: reminderFull.eventId,
        minutesBefore: -540,
        sentAt: "2026-10-20T08:45:00.000007+00:00",
        occurrenceDate: "2026-10-20",
      }),
    ).toStrictEqual({
      event_id: reminderFull.eventId,
      minutes_before: -540,
      sent_at: "2026-10-20T08:45:00.000007+00:00",
      occurrence_date: "2026-10-20",
    });
  });

  test("fromReminderPatch maps minutesBefore to minutes_before, and nothing else", () => {
    expect(fromReminderPatch({ minutesBefore: 10 })).toStrictEqual({
      minutes_before: 10,
    });
    expect(fromReminderPatch({ minutesBefore: 0 })).toStrictEqual({
      minutes_before: 0,
    });
  });

  test("an empty or undefined reminders patch maps to an empty body", () => {
    expect(fromReminderPatch({})).toStrictEqual({});
    expect(fromReminderPatch({ minutesBefore: undefined })).toStrictEqual({});
  });
});
