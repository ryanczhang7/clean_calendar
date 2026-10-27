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
  readLastKind,
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
