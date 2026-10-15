import { describe, expect, test } from "vitest";
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
import { roundTripMismatches } from "../test/roundtrip";
import {
  fromEvent,
  fromEventOverride,
  fromEventOverridePatch,
  fromEventPatch,
  fromKind,
  fromKindPatch,
  toEvent,
  toEventOverride,
  toKind,
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
