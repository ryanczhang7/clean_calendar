import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Event, Kind } from "../data/rows";
import {
  defaultKindId,
  END_ERROR,
  type EventFormValue,
  LAST_KIND_KEY,
  moveStart,
  newEventValue,
  patchOf,
  REPEAT_UNTIL_ERROR,
  readLastKind,
  repeatHelper,
  setAllDay,
  storeLastKind,
  TITLE_ERROR,
  TITLE_MAX,
  toInstants,
  toNewEvent,
  validate,
  valueFromEvent,
} from "./eventForm";

// CAL-012 Contract, Block 1 (AC-2, AC-3, AC-4, AC-5, AC-7). MECHANICAL: the
// copy is voice.md's, the stored shapes are rows.ts's, and every date is
// written out by hand with the local-time constructor - none is computed with
// a date library, so the oracle does not share the implementation's
// arithmetic. Form dates are yyyy-MM-dd and times HH:mm, local; an all-day
// event is stored [D 00:00, D+n 00:00) with ends_at exclusive (CAL-009) and
// shown with its last day inclusive.

const STAMP = "2026-10-16T08:00:00.000001+00:00";

function kind(n: number, name: string, extra: Partial<Kind> = {}): Kind {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name,
    colorLight: "#2E7D32",
    colorDark: "#9BD69B",
    sortOrder: n,
    isDefault: true,
    deletedAt: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...extra,
  };
}

const GYM = kind(1, "Gym");
const MOVIES = kind(2, "Movies");
const TRAVEL = kind(3, "Travel");

/** Local time on a day of October 2026. */
const oct = (date: number, hour = 0, minute = 0) =>
  new Date(2026, 9, date, hour, minute);

function event(extra: Partial<Event> = {}): Event {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    title: "Dentist",
    kindId: GYM.id,
    startsAt: oct(14, 9, 0),
    endsAt: oct(14, 10, 30),
    allDay: false,
    location: "Clinic",
    notes: null,
    recurrence: null,
    origin: "manual",
    captureJobId: null,
    deletedAt: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...extra,
  };
}

/** A timed value, 14 Oct 09:00 - 10:30, every other field filled. */
function timedValue(extra: Partial<EventFormValue> = {}): EventFormValue {
  return {
    title: "Dentist",
    kindId: GYM.id,
    allDay: false,
    startDate: "2026-10-14",
    startTime: "09:00",
    endDate: "2026-10-14",
    endTime: "10:30",
    location: "Clinic",
    notes: "",
    repeat: "none",
    repeatEnds: "never",
    repeatUntil: "",
    ...extra,
  };
}

/** An all-day value, 12 - 14 Oct inclusive. */
function allDayValue(extra: Partial<EventFormValue> = {}): EventFormValue {
  return timedValue({
    title: "Trip",
    allDay: true,
    startDate: "2026-10-12",
    endDate: "2026-10-14",
    ...extra,
  });
}

describe("the constants (Block 1, voice.md)", () => {
  it('the title error reads "Give the event a title."', () => {
    expect(TITLE_ERROR).toBe("Give the event a title.");
  });

  it('the end error reads "End must be after start."', () => {
    expect(END_ERROR).toBe("End must be after start.");
  });

  it("a title is at most 120 characters (components.md)", () => {
    expect(TITLE_MAX).toBe(120);
  });

  it('the last kind lives under "cc.lastKind"', () => {
    expect(LAST_KIND_KEY).toBe("cc.lastKind");
  });
});

describe("validate (AC-2, Block 1)", () => {
  it("a valid timed value has no errors: {}", () => {
    expect(validate(timedValue())).toStrictEqual({});
  });

  it("an empty title is the title error, and only that", () => {
    expect(validate(timedValue({ title: "" }))).toStrictEqual({
      title: TITLE_ERROR,
    });
  });

  it("a title of spaces only is still empty", () => {
    expect(validate(timedValue({ title: "   " }))).toStrictEqual({
      title: TITLE_ERROR,
    });
  });

  it("timed, end equal to start is the end error", () => {
    expect(
      validate(timedValue({ startTime: "09:00", endTime: "09:00" })),
    ).toStrictEqual({ end: END_ERROR });
  });

  it("timed, end one minute before start is the end error", () => {
    expect(
      validate(timedValue({ startTime: "09:00", endTime: "08:59" })),
    ).toStrictEqual({ end: END_ERROR });
  });

  it("timed, an earlier end time on a later end date is valid: the instants are compared, not the times", () => {
    expect(
      validate(
        timedValue({
          startDate: "2026-10-14",
          startTime: "22:00",
          endDate: "2026-10-15",
          endTime: "01:00",
        }),
      ),
    ).toStrictEqual({});
  });

  it("timed, a later end time on an earlier end date is the end error", () => {
    expect(
      validate(
        timedValue({
          startDate: "2026-10-14",
          startTime: "09:00",
          endDate: "2026-10-13",
          endTime: "10:00",
        }),
      ),
    ).toStrictEqual({ end: END_ERROR });
  });

  it("all-day, equal dates are one day and valid", () => {
    expect(
      validate(allDayValue({ startDate: "2026-10-14", endDate: "2026-10-14" })),
    ).toStrictEqual({});
  });

  it("all-day, equal dates are valid whatever the hidden times say", () => {
    expect(
      validate(
        allDayValue({
          startDate: "2026-10-14",
          endDate: "2026-10-14",
          startTime: "18:00",
          endTime: "08:00",
        }),
      ),
    ).toStrictEqual({});
  });

  it("all-day, an end date before the start date is the end error", () => {
    expect(
      validate(allDayValue({ startDate: "2026-10-14", endDate: "2026-10-13" })),
    ).toStrictEqual({ end: END_ERROR });
  });

  it("both errors at once: an empty title and an end before the start", () => {
    expect(validate(timedValue({ title: "", endTime: "08:00" }))).toStrictEqual(
      { title: TITLE_ERROR, end: END_ERROR },
    );
  });
});

describe("toInstants (AC-3, Block 1)", () => {
  it("timed: the two local date-times", () => {
    expect(toInstants(timedValue())).toStrictEqual({
      startsAt: oct(14, 9, 0),
      endsAt: oct(14, 10, 30),
    });
  });

  it("all-day 12 - 14 Oct (inclusive) is stored [12 Oct 00:00, 15 Oct 00:00)", () => {
    expect(toInstants(allDayValue())).toStrictEqual({
      startsAt: oct(12),
      endsAt: oct(15),
    });
  });

  it("all-day ignores the hidden times", () => {
    expect(
      toInstants(allDayValue({ startTime: "14:15", endTime: "16:45" })),
    ).toStrictEqual({ startsAt: oct(12), endsAt: oct(15) });
  });

  it("all-day ending 31 Oct is stored ending 1 Nov 00:00", () => {
    expect(
      toInstants(
        allDayValue({ startDate: "2026-10-31", endDate: "2026-10-31" }),
      ),
    ).toStrictEqual({
      startsAt: oct(31),
      endsAt: new Date(2026, 10, 1),
    });
  });
});

describe("valueFromEvent (AC-3, AC-5, Block 1)", () => {
  it("a timed event's every field, blank location and notes as empty strings", () => {
    expect(
      valueFromEvent(event({ location: null, notes: null })),
    ).toStrictEqual({
      title: "Dentist",
      kindId: GYM.id,
      allDay: false,
      startDate: "2026-10-14",
      startTime: "09:00",
      endDate: "2026-10-14",
      endTime: "10:30",
      location: "",
      notes: "",
      repeat: "none",
      repeatEnds: "never",
      repeatUntil: "",
    });
  });

  it("carries location and notes when set", () => {
    const value = valueFromEvent(
      event({ location: "Clinic", notes: "Bring the card" }),
    );
    expect(value.location).toBe("Clinic");
    expect(value.notes).toBe("Bring the card");
  });

  // Deferred verification 3's target: with valueFromEvent showing endsAt's
  // own date this must fail, while toInstants's cases above stay green.
  it("an all-day 12 - 15 Oct (exclusive) event shows startDate 2026-10-12 and endDate 2026-10-14", () => {
    const value = valueFromEvent(
      event({
        title: "Trip",
        allDay: true,
        startsAt: oct(12),
        endsAt: oct(15),
      }),
    );
    expect(value.allDay).toBe(true);
    expect(value.startDate).toBe("2026-10-12");
    expect(value.endDate).toBe("2026-10-14");
  });

  it("a one-day all-day event shows the same start and end date", () => {
    const value = valueFromEvent(
      event({ allDay: true, startsAt: oct(14), endsAt: oct(15) }),
    );
    expect(value.startDate).toBe("2026-10-14");
    expect(value.endDate).toBe("2026-10-14");
  });

  it("round trip: toInstants of an all-day event's value is its stored range", () => {
    const stored = event({ allDay: true, startsAt: oct(12), endsAt: oct(15) });
    expect(toInstants(valueFromEvent(stored))).toStrictEqual({
      startsAt: oct(12),
      endsAt: oct(15),
    });
  });

  it("round trip: toInstants of a timed event's value is its stored range", () => {
    expect(toInstants(valueFromEvent(event()))).toStrictEqual({
      startsAt: oct(14, 9, 0),
      endsAt: oct(14, 10, 30),
    });
  });
});

describe("newEventValue (AC-1, Block 1)", () => {
  it("all-day on 14 Oct: both dates the 14th, times 09:00 / 10:00, everything else blank", () => {
    expect(newEventValue(oct(14), oct(15), true, GYM.id)).toStrictEqual({
      title: "",
      kindId: GYM.id,
      allDay: true,
      startDate: "2026-10-14",
      startTime: "09:00",
      endDate: "2026-10-14",
      endTime: "10:00",
      location: "",
      notes: "",
      repeat: "none",
      repeatEnds: "never",
      repeatUntil: "",
    });
  });

  it("all-day: the dates are equal even when start and end are the same instant", () => {
    const value = newEventValue(oct(20), oct(20), true, GYM.id);
    expect(value.startDate).toBe("2026-10-20");
    expect(value.endDate).toBe("2026-10-20");
  });

  it("timed 15 Oct 14:00 - 15:00: the dates and times as given", () => {
    expect(
      newEventValue(oct(15, 14, 0), oct(15, 15, 0), false, MOVIES.id),
    ).toStrictEqual({
      title: "",
      kindId: MOVIES.id,
      allDay: false,
      startDate: "2026-10-15",
      startTime: "14:00",
      endDate: "2026-10-15",
      endTime: "15:00",
      location: "",
      notes: "",
      repeat: "none",
      repeatEnds: "never",
      repeatUntil: "",
    });
  });

  it("timed 23:00 - 00:00 ends on the next date", () => {
    const value = newEventValue(oct(14, 23, 0), oct(15, 0, 0), false, null);
    expect(value.endDate).toBe("2026-10-15");
    expect(value.endTime).toBe("00:00");
    expect(value.kindId).toBeNull();
  });
});

describe("moveStart keeps the duration (AC-3, Block 1)", () => {
  // Deferred verification 2's target: with moveStart leaving the end where
  // it was this must fail, and the "only the start moves" case stay green.
  it("09:00 - 10:30 on the 14th, start moved to 15 Oct 14:00: end is 15 Oct 15:30", () => {
    const moved = moveStart(timedValue(), "2026-10-15", "14:00");
    expect(moved).toStrictEqual(
      timedValue({
        startDate: "2026-10-15",
        startTime: "14:00",
        endDate: "2026-10-15",
        endTime: "15:30",
      }),
    );
  });

  it("end not after start (10:00 - 09:00): only the start moves", () => {
    const value = timedValue({ startTime: "10:00", endTime: "09:00" });
    expect(moveStart(value, "2026-10-15", "14:00")).toStrictEqual(
      timedValue({
        startDate: "2026-10-15",
        startTime: "14:00",
        endDate: "2026-10-14",
        endTime: "09:00",
      }),
    );
  });

  it("end equal to start: only the start moves", () => {
    const value = timedValue({ startTime: "09:00", endTime: "09:00" });
    const moved = moveStart(value, "2026-10-14", "11:00");
    expect(moved.startTime).toBe("11:00");
    expect(moved.endDate).toBe("2026-10-14");
    expect(moved.endTime).toBe("09:00");
  });

  it("the time alone: 09:00 - 10:30 moved to 11:15 ends 12:45", () => {
    const moved = moveStart(timedValue(), "2026-10-14", "11:15");
    expect(moved.endDate).toBe("2026-10-14");
    expect(moved.endTime).toBe("12:45");
  });

  it("a duration across midnight carries the end across too: 22:00 - 01:00, start moved to 15 Oct 23:30, ends 16 Oct 02:30", () => {
    const value = timedValue({
      startDate: "2026-10-14",
      startTime: "22:00",
      endDate: "2026-10-15",
      endTime: "01:00",
    });
    const moved = moveStart(value, "2026-10-15", "23:30");
    expect(moved.endDate).toBe("2026-10-16");
    expect(moved.endTime).toBe("02:30");
  });

  it("moving the start earlier moves the end earlier: 09:00 - 10:30 to 13 Oct 08:00 ends 13 Oct 09:30", () => {
    const moved = moveStart(timedValue(), "2026-10-13", "08:00");
    expect(moved.endDate).toBe("2026-10-13");
    expect(moved.endTime).toBe("09:30");
  });

  it("all-day 12 - 14 Oct, start moved to the 20th: end date the 22nd", () => {
    const moved = moveStart(allDayValue(), "2026-10-20", "09:00");
    expect(moved.startDate).toBe("2026-10-20");
    expect(moved.endDate).toBe("2026-10-22");
    expect(moved.allDay).toBe(true);
  });

  it("a one-day all-day event read from the store, start moved to the 16th: end date the 16th", () => {
    const value = valueFromEvent(
      event({ allDay: true, startsAt: oct(14), endsAt: oct(15) }),
    );
    const moved = moveStart(value, "2026-10-16", value.startTime);
    expect(moved.startDate).toBe("2026-10-16");
    expect(moved.endDate).toBe("2026-10-16");
  });

  it("touches nothing but the four date and time fields", () => {
    const moved = moveStart(timedValue(), "2026-10-15", "14:00");
    expect(moved.title).toBe("Dentist");
    expect(moved.kindId).toBe(GYM.id);
    expect(moved.location).toBe("Clinic");
    expect(moved.allDay).toBe(false);
  });
});

describe("setAllDay (AC-3, Block 1)", () => {
  it("on: allDay true, dates and times kept", () => {
    expect(setAllDay(timedValue(), true)).toStrictEqual(
      timedValue({ allDay: true }),
    );
  });

  it("off again: back to the timed value, the times having been kept", () => {
    expect(setAllDay(setAllDay(timedValue(), true), false)).toStrictEqual(
      timedValue(),
    );
  });
});

describe("toNewEvent (AC-4, Block 1)", () => {
  it("a timed value becomes the full NewEvent: origin manual, recurrence and captureJobId null, blank notes null", () => {
    expect(toNewEvent(timedValue({ title: "Swim" }), MOVIES.id)).toStrictEqual({
      title: "Swim",
      kindId: MOVIES.id,
      startsAt: oct(14, 9, 0),
      endsAt: oct(14, 10, 30),
      allDay: false,
      location: "Clinic",
      notes: null,
      origin: "manual",
      recurrence: null,
      captureJobId: null,
    });
  });

  it("blank location becomes null; notes kept", () => {
    const made = toNewEvent(
      timedValue({ location: "", notes: "Locker 12" }),
      GYM.id,
    );
    expect(made.location).toBeNull();
    expect(made.notes).toBe("Locker 12");
  });

  it("an all-day value is stored with its exclusive end", () => {
    const made = toNewEvent(allDayValue(), GYM.id);
    expect(made.allDay).toBe(true);
    expect(made.startsAt).toStrictEqual(oct(12));
    expect(made.endsAt).toStrictEqual(oct(15));
  });

  it("the kind is the argument, not the value's", () => {
    expect(toNewEvent(timedValue({ kindId: null }), TRAVEL.id).kindId).toBe(
      TRAVEL.id,
    );
  });
});

describe("patchOf sends only what changed (AC-5, AC-7, Block 1)", () => {
  const ORIGINAL = event({ location: null, notes: null });
  const opened = () => valueFromEvent(ORIGINAL);

  // Deferred verification 1's targets: with patchOf returning every field,
  // each case here must fail.
  it("nothing changed: {}", () => {
    expect(patchOf(ORIGINAL, opened())).toStrictEqual({});
  });

  it("the same title typed again: {}", () => {
    expect(patchOf(ORIGINAL, { ...opened(), title: "Dentist" })).toStrictEqual(
      {},
    );
  });

  it("the title alone: { title }", () => {
    expect(
      patchOf(ORIGINAL, { ...opened(), title: "Dentist at noon" }),
    ).toStrictEqual({ title: "Dentist at noon" });
  });

  it("the kind alone: { kindId }", () => {
    expect(patchOf(ORIGINAL, { ...opened(), kindId: MOVIES.id })).toStrictEqual(
      { kindId: MOVIES.id },
    );
  });

  it("a null kindId (a removed kind kept) never appears in the patch (AC-7)", () => {
    expect(patchOf(ORIGINAL, { ...opened(), kindId: null })).toStrictEqual({});
    expect(
      patchOf(ORIGINAL, { ...opened(), kindId: null, title: "Renamed" }),
    ).toStrictEqual({ title: "Renamed" });
  });

  it("the start time alone: { startsAt }", () => {
    expect(
      patchOf(ORIGINAL, { ...opened(), startTime: "09:15" }),
    ).toStrictEqual({ startsAt: oct(14, 9, 15) });
  });

  it("the end time alone: { endsAt }", () => {
    expect(patchOf(ORIGINAL, { ...opened(), endTime: "11:00" })).toStrictEqual({
      endsAt: oct(14, 11, 0),
    });
  });

  it("the start moved with moveStart: { startsAt, endsAt }", () => {
    expect(
      patchOf(ORIGINAL, moveStart(opened(), "2026-10-15", "14:00")),
    ).toStrictEqual({ startsAt: oct(15, 14, 0), endsAt: oct(15, 15, 30) });
  });

  it("All day on: { allDay, startsAt, endsAt } - the stored instants change with it", () => {
    expect(patchOf(ORIGINAL, setAllDay(opened(), true))).toStrictEqual({
      allDay: true,
      startsAt: oct(14),
      endsAt: oct(15),
    });
  });

  it("the location alone, from null: { location }", () => {
    expect(patchOf(ORIGINAL, { ...opened(), location: "Pool" })).toStrictEqual({
      location: "Pool",
    });
  });

  it("the location cleared: { location: null }", () => {
    const withPlace = event({ location: "Pool", notes: null });
    expect(
      patchOf(withPlace, { ...valueFromEvent(withPlace), location: "" }),
    ).toStrictEqual({ location: null });
  });

  it("the notes alone: { notes }", () => {
    expect(
      patchOf(ORIGINAL, { ...opened(), notes: "Bring the card" }),
    ).toStrictEqual({ notes: "Bring the card" });
  });

  it("an all-day event opened and not changed: {} (the inclusive end maps back to the stored one)", () => {
    const trip = event({ allDay: true, startsAt: oct(12), endsAt: oct(15) });
    expect(patchOf(trip, valueFromEvent(trip))).toStrictEqual({});
  });

  it("two fields at once: exactly those two", () => {
    expect(
      patchOf(ORIGINAL, { ...opened(), title: "Swim", notes: "Lane 3" }),
    ).toStrictEqual({ title: "Swim", notes: "Lane 3" });
  });
});

describe("defaultKindId (AC-4, Block 1)", () => {
  it("the last kind, when it is live", () => {
    expect(defaultKindId([GYM, MOVIES, TRAVEL], MOVIES.id)).toBe(MOVIES.id);
  });

  it("a stale last id (no live kind has it): the first live kind", () => {
    expect(
      defaultKindId([GYM, MOVIES], "ffffffff-ffff-4fff-8fff-ffffffffffff"),
    ).toBe(GYM.id);
  });

  it("no last kind: the first live kind", () => {
    expect(defaultKindId([TRAVEL, GYM], null)).toBe(TRAVEL.id);
  });

  it("no live kinds: null, with or without a last kind", () => {
    expect(defaultKindId([], null)).toBeNull();
    expect(defaultKindId([], GYM.id)).toBeNull();
  });
});

describe("the last kind on this device (AC-4, Block 1)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const denied = (): never => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };

  it("reads null on a device that never stored one", () => {
    expect(readLastKind()).toBeNull();
  });

  it('reads what is stored under "cc.lastKind"', () => {
    localStorage.setItem("cc.lastKind", MOVIES.id);
    expect(readLastKind()).toBe(MOVIES.id);
  });

  it('storeLastKind writes the id under "cc.lastKind", and it reads back', () => {
    storeLastKind(TRAVEL.id);
    expect(localStorage.getItem("cc.lastKind")).toBe(TRAVEL.id);
    expect(readLastKind()).toBe(TRAVEL.id);
  });

  it("a storage that throws on read reads as null", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(denied);
    expect(readLastKind()).toBeNull();
  });

  it("a storage that throws on write is swallowed", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(denied);
    expect(() => storeLastKind(GYM.id)).not.toThrow();
    // Not vacuous: the write was really attempted, and really threw.
    expect(setItem).toHaveBeenCalledWith("cc.lastKind", GYM.id);
  });
});

describe("moveStart and setAllDay from an empty start (CAL-021 Block 3, AC-2)", () => {
  // The confirm screen blanks a missing start and end (blankMissing). With no
  // previous start there is no duration to keep: the start is set and the
  // end is left exactly as it is - empty stays empty, filled stays filled.
  // Measured in RED: the shipped moveStart already does this (an invalid old
  // start returns `moved`), so these passed on arrival and are earned by the
  // mutate.sh probe recorded in the story's handoff.
  const blankStart = (extra: Partial<EventFormValue> = {}) =>
    timedValue({ startDate: "", startTime: "", ...extra });

  it("timed, start and end both empty: the start is set and the end stays empty", () => {
    const value = blankStart({ endDate: "", endTime: "" });
    expect(moveStart(value, "2026-10-15", "")).toStrictEqual(
      blankStart({ startDate: "2026-10-15", endDate: "", endTime: "" }),
    );
    expect(moveStart(value, "2026-10-15", "14:00")).toStrictEqual(
      blankStart({
        startDate: "2026-10-15",
        startTime: "14:00",
        endDate: "",
        endTime: "",
      }),
    );
  });

  it("timed, start empty and end filled: the start is set and the filled end stays where it was", () => {
    expect(moveStart(blankStart(), "2026-10-20", "08:00")).toStrictEqual(
      timedValue({ startDate: "2026-10-20", startTime: "08:00" }),
    );
  });

  it("timed, start filled and end empty: moving the start leaves the end empty", () => {
    const value = timedValue({ endDate: "", endTime: "" });
    expect(moveStart(value, "2026-10-15", "14:00")).toStrictEqual(
      timedValue({
        startDate: "2026-10-15",
        startTime: "14:00",
        endDate: "",
        endTime: "",
      }),
    );
  });

  it("all day, start and end empty: the start date is set and the end date stays empty", () => {
    const value = allDayValue({ startDate: "", endDate: "" });
    expect(moveStart(value, "2026-10-20", value.startTime)).toStrictEqual(
      allDayValue({ startDate: "2026-10-20", endDate: "" }),
    );
  });

  it("all day, start empty and end filled: the end date stays the 14th", () => {
    const value = allDayValue({ startDate: "" });
    expect(moveStart(value, "2026-10-20", value.startTime)).toStrictEqual(
      allDayValue({ startDate: "2026-10-20", endDate: "2026-10-14" }),
    );
  });

  it("toggling All day with an empty start keeps it (and the end) empty, both ways", () => {
    const value = blankStart({ endDate: "", endTime: "" });
    expect(setAllDay(value, true)).toStrictEqual({ ...value, allDay: true });
    expect(setAllDay(setAllDay(value, true), false)).toStrictEqual(value);
  });
});

// CAL-024 Contract, Block 1 (AC-1, AC-2). MECHANICAL: the helper copy is
// components.md's ("Every Tuesday") with date-fns' English names, the error
// is voice.md's "Event form" line, and the stored recurrence is rows.ts's
// shape. The device zone is read from the same Intl expression the Contract
// names, never written as a literal, so the suite holds in any zone.

const DEVICE_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
/** A zone guaranteed not to be the device's, for "stored elsewhere" cases. */
const OTHER_TZ =
  DEVICE_TZ === "Pacific/Auckland" ? "Europe/Oslo" : "Pacific/Auckland";

/** Weekly, ending on the given date (or never). */
const weekly = (until: string | null): Partial<EventFormValue> =>
  until === null
    ? { repeat: "weekly", repeatEnds: "never", repeatUntil: "" }
    : { repeat: "weekly", repeatEnds: "on", repeatUntil: until };

describe("REPEAT_UNTIL_ERROR (CAL-024 AC-2, voice.md)", () => {
  it('reads "The series must end after it starts."', () => {
    expect(REPEAT_UNTIL_ERROR).toBe("The series must end after it starts.");
  });
});

describe("repeatHelper - the Repeat field's helper text (CAL-024 AC-1, Block 1)", () => {
  it('weekly on a start of Wednesday 14 October 2026 reads "Every Wednesday"', () => {
    expect(repeatHelper(timedValue({ repeat: "weekly" }))).toBe(
      "Every Wednesday",
    );
  });

  it('weekly takes the weekday of the START date: Tuesday 13 October reads "Every Tuesday"', () => {
    expect(
      repeatHelper(
        timedValue({
          repeat: "weekly",
          startDate: "2026-10-13",
          endDate: "2026-10-20",
        }),
      ),
    ).toBe("Every Tuesday");
  });

  it('yearly on 14 October reads "Every year on 14 October"', () => {
    expect(repeatHelper(timedValue({ repeat: "yearly" }))).toBe(
      "Every year on 14 October",
    );
  });

  it('yearly on 1 March writes the day unpadded: "Every year on 1 March"', () => {
    expect(
      repeatHelper(
        allDayValue({
          repeat: "yearly",
          startDate: "2026-03-01",
          endDate: "2026-03-01",
        }),
      ),
    ).toBe("Every year on 1 March");
  });

  it('daily reads "Every day"', () => {
    expect(repeatHelper(timedValue({ repeat: "daily" }))).toBe("Every day");
  });

  it('"none" (Does not repeat) has no helper: null', () => {
    expect(repeatHelper(timedValue())).toBeNull();
    expect(
      repeatHelper(
        timedValue({
          repeat: "none",
          repeatEnds: "on",
          repeatUntil: "2026-11-30",
        }),
      ),
    ).toBeNull();
  });
});

describe("validate: the series' end (CAL-024 AC-2, Block 1)", () => {
  it("Ends on a date before the start date is the repeat-until error, and only that", () => {
    expect(validate(timedValue(weekly("2026-10-13")))).toStrictEqual({
      repeatUntil: REPEAT_UNTIL_ERROR,
    });
  });

  it('Ends "On date" with no date given is the repeat-until error', () => {
    expect(validate(timedValue(weekly("")))).toStrictEqual({
      repeatUntil: REPEAT_UNTIL_ERROR,
    });
  });

  it("Ends on the start date itself is valid: a series of one", () => {
    expect(validate(timedValue(weekly("2026-10-14")))).toStrictEqual({});
  });

  it("Ends on 30 November 2026 is valid", () => {
    expect(validate(timedValue(weekly("2026-11-30")))).toStrictEqual({});
  });

  it('Ends "Never" ignores whatever date is held', () => {
    expect(
      validate(
        timedValue({
          repeat: "weekly",
          repeatEnds: "never",
          repeatUntil: "2026-01-01",
        }),
      ),
    ).toStrictEqual({});
  });

  it('"Does not repeat" ignores a stale Ends-on date entirely', () => {
    expect(
      validate(
        timedValue({
          repeat: "none",
          repeatEnds: "on",
          repeatUntil: "2026-01-01",
        }),
      ),
    ).toStrictEqual({});
    expect(
      validate(timedValue({ repeat: "none", repeatEnds: "on" })),
    ).toStrictEqual({});
  });

  it("compares against the start date for an all-day event too: before is refused, the same day is not", () => {
    // allDayValue starts 12 Oct.
    expect(
      validate(allDayValue({ ...weekly("2026-10-11"), repeat: "yearly" })),
    ).toStrictEqual({ repeatUntil: REPEAT_UNTIL_ERROR });
    expect(
      validate(allDayValue({ ...weekly("2026-10-12"), repeat: "daily" })),
    ).toStrictEqual({});
  });

  it("sits beside the other errors: an empty title, an end before the start and an early series end at once", () => {
    expect(
      validate(
        timedValue({
          title: "",
          endTime: "08:00",
          ...weekly("2026-10-01"),
        }),
      ),
    ).toStrictEqual({
      title: TITLE_ERROR,
      end: END_ERROR,
      repeatUntil: REPEAT_UNTIL_ERROR,
    });
  });
});

describe("toNewEvent: the stored recurrence (CAL-024 AC-2, Block 1)", () => {
  it("Weekly, Ends on 30 November 2026: { freq: weekly, until: 2026-11-30, tz: the device zone }", () => {
    expect(
      toNewEvent(timedValue(weekly("2026-11-30")), GYM.id).recurrence,
    ).toStrictEqual({ freq: "weekly", until: "2026-11-30", tz: DEVICE_TZ });
  });

  it("the rest of the NewEvent is what it was: only recurrence is new", () => {
    expect(
      toNewEvent(timedValue({ title: "Swim", ...weekly(null) }), MOVIES.id),
    ).toStrictEqual({
      title: "Swim",
      kindId: MOVIES.id,
      startsAt: oct(14, 9, 0),
      endsAt: oct(14, 10, 30),
      allDay: false,
      location: "Clinic",
      notes: null,
      origin: "manual",
      recurrence: { freq: "weekly", until: null, tz: DEVICE_TZ },
      captureJobId: null,
    });
  });

  it('Ends "Never" stores until null, whatever date is held', () => {
    expect(
      toNewEvent(
        timedValue({
          repeat: "daily",
          repeatEnds: "never",
          repeatUntil: "2026-11-30",
        }),
        GYM.id,
      ).recurrence,
    ).toStrictEqual({ freq: "daily", until: null, tz: DEVICE_TZ });
  });

  it("Yearly carries its freq through", () => {
    expect(
      toNewEvent(allDayValue({ repeat: "yearly" }), GYM.id).recurrence,
    ).toStrictEqual({ freq: "yearly", until: null, tz: DEVICE_TZ });
  });

  it('"Does not repeat" stores null, even with an Ends-on date held', () => {
    expect(toNewEvent(timedValue(), GYM.id).recurrence).toBeNull();
    expect(
      toNewEvent(
        timedValue({
          repeat: "none",
          repeatEnds: "on",
          repeatUntil: "2026-11-30",
        }),
        GYM.id,
      ).recurrence,
    ).toBeNull();
  });
});

describe("valueFromEvent: the series' repeat settings (CAL-024 AC-6, Block 1)", () => {
  it("a weekly series ending 30 November: Weekly, Ends on, 2026-11-30", () => {
    const value = valueFromEvent(
      event({
        recurrence: { freq: "weekly", until: "2026-11-30", tz: DEVICE_TZ },
      }),
    );
    expect([value.repeat, value.repeatEnds, value.repeatUntil]).toStrictEqual([
      "weekly",
      "on",
      "2026-11-30",
    ]);
  });

  it('a yearly series with no end: Yearly, Ends "never", repeatUntil ""', () => {
    const value = valueFromEvent(
      event({ recurrence: { freq: "yearly", until: null, tz: OTHER_TZ } }),
    );
    expect([value.repeat, value.repeatEnds, value.repeatUntil]).toStrictEqual([
      "yearly",
      "never",
      "",
    ]);
  });

  it("a daily series keeps every other field as before", () => {
    expect(
      valueFromEvent(
        event({
          location: null,
          recurrence: { freq: "daily", until: null, tz: DEVICE_TZ },
        }),
      ),
    ).toStrictEqual({
      title: "Dentist",
      kindId: GYM.id,
      allDay: false,
      startDate: "2026-10-14",
      startTime: "09:00",
      endDate: "2026-10-14",
      endTime: "10:30",
      location: "",
      notes: "",
      repeat: "daily",
      repeatEnds: "never",
      repeatUntil: "",
    });
  });

  it("an occurrence shows its own date and time with the series' repeat settings (Blocks 3 and 7)", () => {
    const value = valueFromEvent(
      event({
        startsAt: new Date(2026, 10, 18, 9, 0),
        endsAt: new Date(2026, 10, 18, 10, 30),
        recurrence: { freq: "weekly", until: null, tz: DEVICE_TZ },
        occurrenceDate: "2026-11-18",
      }),
    );
    expect(value.startDate).toBe("2026-11-18");
    expect(value.startTime).toBe("09:00");
    expect(value.repeat).toBe("weekly");
    expect(value.repeatEnds).toBe("never");
  });

  it("round trip: toNewEvent of a device-zone series' value stores its recurrence back", () => {
    const recurrence = {
      freq: "weekly" as const,
      until: "2026-11-30",
      tz: DEVICE_TZ,
    };
    expect(
      toNewEvent(valueFromEvent(event({ recurrence })), GYM.id).recurrence,
    ).toStrictEqual(recurrence);
  });
});

describe("patchOf: recurrence only when it changed (CAL-024 AC-2, Block 1)", () => {
  const SERIES = event({
    location: null,
    notes: null,
    recurrence: { freq: "weekly", until: "2026-11-30", tz: DEVICE_TZ },
  });
  const opened = () => valueFromEvent(SERIES);

  it("a series opened and not changed: {} - an equal recurrence is not a change", () => {
    expect(patchOf(SERIES, opened())).toStrictEqual({});
  });

  it("a series with a title change: { title } alone", () => {
    expect(patchOf(SERIES, { ...opened(), title: "Swim" })).toStrictEqual({
      title: "Swim",
    });
  });

  it('a series set to "Does not repeat": { recurrence: null }', () => {
    expect(patchOf(SERIES, { ...opened(), repeat: "none" })).toStrictEqual({
      recurrence: null,
    });
  });

  it("a series' end moved: the whole new recurrence", () => {
    expect(
      patchOf(SERIES, { ...opened(), repeatUntil: "2026-12-31" }),
    ).toStrictEqual({
      recurrence: { freq: "weekly", until: "2026-12-31", tz: DEVICE_TZ },
    });
  });

  it('a series set to end "Never": until null', () => {
    expect(patchOf(SERIES, { ...opened(), repeatEnds: "never" })).toStrictEqual(
      {
        recurrence: { freq: "weekly", until: null, tz: DEVICE_TZ },
      },
    );
  });

  it("a series' freq changed: the new freq", () => {
    expect(patchOf(SERIES, { ...opened(), repeat: "daily" })).toStrictEqual({
      recurrence: { freq: "daily", until: "2026-11-30", tz: DEVICE_TZ },
    });
  });

  it("a series stored in another zone, opened and not changed: tz is compared too, so the patch re-zones it to the device's", () => {
    const elsewhere = event({
      location: null,
      notes: null,
      recurrence: { freq: "weekly", until: null, tz: OTHER_TZ },
    });
    expect(patchOf(elsewhere, valueFromEvent(elsewhere))).toStrictEqual({
      recurrence: { freq: "weekly", until: null, tz: DEVICE_TZ },
    });
  });

  it("a one-off event made weekly: { recurrence }", () => {
    const original = event({ location: null, notes: null });
    expect(
      patchOf(original, { ...valueFromEvent(original), ...weekly(null) }),
    ).toStrictEqual({
      recurrence: { freq: "weekly", until: null, tz: DEVICE_TZ },
    });
  });

  it("a one-off event left one-off: no recurrence key at all", () => {
    const original = event({ location: null, notes: null });
    const patch = patchOf(original, {
      ...valueFromEvent(original),
      title: "Swim",
    });
    expect("recurrence" in patch).toBe(false);
  });
});

describe("the stored zone is the device's at the time of saving (CAL-024 AC-2, Block 1)", () => {
  // Restored to the zone NAME in force before, never by deleting TZ (see
  // ConfirmPage.test.tsx's inZone: deleting leaves the last zone cached).
  function inZone<T>(tz: string, fn: () => T): T {
    const before =
      process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    process.env.TZ = tz;
    try {
      return fn();
    } finally {
      process.env.TZ = before;
    }
  }

  it.each(["Pacific/Auckland", "Europe/Rome"])(
    "with the device in %s, toNewEvent stores that zone - so no fixed zone can pass in both",
    (zone) => {
      const [device, stored] = inZone(zone, () => [
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        toNewEvent(timedValue(weekly(null)), GYM.id).recurrence?.tz,
      ]);
      // The instrument first: the zone switch took effect.
      expect(device).toBe(zone);
      expect(stored).toBe(device);
    },
  );
});
