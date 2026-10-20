import { afterAll, describe, expect, it, vi } from "vitest";
import {
  deletedLabel,
  moveEvent,
  movedLabel,
  moveToDay,
  moveToSlot,
  resizeBy,
  resizedLabel,
  STEP_MINUTES,
  type Span,
} from "./moveEvent";

// CAL-013 Contract, Block 1 (AC-1, and the arithmetic of AC-2 and AC-3).
// MECHANICAL: every expected instant is one of Block 1's worked examples, or
// a contrast case a plausible wrong implementation fails, with the wrong
// value it would give written beside it. Every instant is built with the
// local-time constructor.
//
// The zone is pinned HERE, not left to the machine: Sun 1 Nov 2026 02:00
// America/Chicago ends daylight saving, and every DST contrast below
// (elapsed-ms all-day moves, wall-time timed moves, +24h day moves) gives
// the right answer by accident in UTC, where a CI runner usually is -
// measured with node in both zones (story Handoff, negative controls).
// Node re-reads TZ on assignment; the first case checks that it did.
vi.stubEnv("TZ", "America/Chicago");
afterAll(() => {
  vi.unstubAllEnvs();
});

/** Local time, `month` 1..12. */
const at = (month: number, date: number, hour = 0, minute = 0) =>
  new Date(2026, month - 1, date, hour, minute);

const timed = (startsAt: Date, endsAt: Date) => ({
  startsAt,
  endsAt,
  allDay: false,
});
const allDay = (startsAt: Date, endsAt: Date) => ({
  startsAt,
  endsAt,
  allDay: true,
});
const span = (startsAt: Date, endsAt: Date): Span => ({ startsAt, endsAt });

describe("the zone these cases are written for", () => {
  it("is one where Sun 1 Nov 2026 ends daylight saving: 31 Oct is UTC-5, 2 Nov is UTC-6", () => {
    expect(at(10, 31, 12).getTimezoneOffset()).toBe(300);
    expect(at(11, 2, 12).getTimezoneOffset()).toBe(360);
  });
});

describe("STEP_MINUTES (components.md, Event chip: nudge and resize step)", () => {
  it("is 15", () => {
    expect(STEP_MINUTES).toBe(15);
  });
});

describe("moveEvent keeps the duration (AC-1, Block 1)", () => {
  it("a timed 14 Oct 09:00 - 10:30 moved to 15 Oct 14:00 is 15 Oct 14:00 - 15:30", () => {
    expect(
      moveEvent(timed(at(10, 14, 9), at(10, 14, 10, 30)), at(10, 15, 14)),
    ).toStrictEqual(span(at(10, 15, 14), at(10, 15, 15, 30)));
  });

  it("a timed move keeps the ELAPSED duration across the DST change: 30 Oct 23:00 - 31 Oct 03:00 (4 h) moved to 31 Oct 23:00 ends 1 Nov 02:00, not 03:00", () => {
    expect(
      moveEvent(timed(at(10, 30, 23), at(10, 31, 3)), at(10, 31, 23)),
    ).toStrictEqual(span(at(10, 31, 23), at(11, 1, 2)));
  });

  it("a timed event spanning the DST change (31 Oct 22:00 - 1 Nov 02:00, 5 h elapsed) moved to 2 Nov 09:00 ends 14:00, not 13:00", () => {
    expect(
      moveEvent(timed(at(10, 31, 22), at(11, 1, 2)), at(11, 2, 9)),
    ).toStrictEqual(span(at(11, 2, 9), at(11, 2, 14)));
  });

  it("an all-day [12 Oct, 15 Oct) - three days - moved to 20 Oct is [20 Oct, 23 Oct)", () => {
    expect(moveEvent(allDay(at(10, 12), at(10, 15)), at(10, 20))).toStrictEqual(
      span(at(10, 20), at(10, 23)),
    );
  });

  it("an all-day newStart is read as its calendar day: [12 Oct, 15 Oct) moved to 20 Oct 15:30 is [20 Oct, 23 Oct)", () => {
    expect(
      moveEvent(allDay(at(10, 12), at(10, 15)), at(10, 20, 15, 30)),
    ).toStrictEqual(span(at(10, 20), at(10, 23)));
  });

  it("Block 1's DST example: all-day [30 Oct, 2 Nov) moved to 31 Oct is [31 Oct, 3 Nov), both at local midnight", () => {
    const moved = moveEvent(allDay(at(10, 30), at(11, 2)), at(10, 31));
    expect(moved).toStrictEqual(span(at(10, 31), at(11, 3)));
    expect(moved.endsAt.getHours()).toBe(0);
  });

  it("an all-day [29 Oct, 31 Oct) moved onto the DST change (to 31 Oct) keeps two calendar days: [31 Oct, 2 Nov), not ending 1 Nov 23:00", () => {
    expect(moveEvent(allDay(at(10, 29), at(10, 31)), at(10, 31))).toStrictEqual(
      span(at(10, 31), at(11, 2)),
    );
  });

  it("an all-day [31 Oct, 2 Nov) moved off the DST change (to 5 Nov) keeps two calendar days: [5 Nov, 7 Nov), not ending 7 Nov 01:00", () => {
    expect(moveEvent(allDay(at(10, 31), at(11, 2)), at(11, 5))).toStrictEqual(
      span(at(11, 5), at(11, 7)),
    );
  });

  it("returns exactly { startsAt, endsAt } and leaves its input alone", () => {
    const input = timed(at(10, 14, 9), at(10, 14, 10, 30));
    const moved = moveEvent(input, at(10, 15, 14));
    expect(Object.keys(moved).sort()).toStrictEqual(["endsAt", "startsAt"]);
    expect(input).toStrictEqual(timed(at(10, 14, 9), at(10, 14, 10, 30)));
  });
});

describe("moveToDay: the date changes, the time of day stays (AC-2 month drop, AC-3 Alt+arrows; Block 1)", () => {
  it("14 Oct 09:00 - 10:30 moved to 16 Oct is 16 Oct 09:00 - 10:30", () => {
    expect(
      moveToDay(timed(at(10, 14, 9), at(10, 14, 10, 30)), at(10, 16)),
    ).toStrictEqual(span(at(10, 16, 9), at(10, 16, 10, 30)));
  });

  it("only the day's date counts: moved to 16 Oct 18:45 it is still 16 Oct 09:00 - 10:30", () => {
    expect(
      moveToDay(timed(at(10, 14, 9), at(10, 14, 10, 30)), at(10, 16, 18, 45)),
    ).toStrictEqual(span(at(10, 16, 9), at(10, 16, 10, 30)));
  });

  it("the wall time is kept across the DST change: 31 Oct 09:00 - 10:00 moved to 2 Nov is 2 Nov 09:00 - 10:00, not 08:00", () => {
    expect(
      moveToDay(timed(at(10, 31, 9), at(10, 31, 10)), at(11, 2)),
    ).toStrictEqual(span(at(11, 2, 9), at(11, 2, 10)));
  });

  it("an event crossing midnight keeps its length: 14 Oct 22:00 - 15 Oct 01:00 moved to 16 Oct is 16 Oct 22:00 - 17 Oct 01:00", () => {
    expect(
      moveToDay(timed(at(10, 14, 22), at(10, 15, 1)), at(10, 16)),
    ).toStrictEqual(span(at(10, 16, 22), at(10, 17, 1)));
  });

  it("an all-day [12 Oct, 15 Oct) moved to 20 Oct is [20 Oct, 23 Oct)", () => {
    expect(moveToDay(allDay(at(10, 12), at(10, 15)), at(10, 20))).toStrictEqual(
      span(at(10, 20), at(10, 23)),
    );
  });
});

describe("moveToSlot: a timed event starts at the slot (AC-2 time-grid drop, Block 1, PO decision 2)", () => {
  it("14 Oct 09:00 - 10:30 dropped on 15 Oct 14:00 is 15 Oct 14:00 - 15:30", () => {
    expect(
      moveToSlot(timed(at(10, 14, 9), at(10, 14, 10, 30)), at(10, 15, 14)),
    ).toStrictEqual(span(at(10, 15, 14), at(10, 15, 15, 30)));
  });

  it("an all-day [14 Oct, 15 Oct) dropped on 16 Oct 14:00 stays all-day on that day: [16 Oct, 17 Oct)", () => {
    expect(
      moveToSlot(allDay(at(10, 14), at(10, 15)), at(10, 16, 14)),
    ).toStrictEqual(span(at(10, 16), at(10, 17)));
  });
});

describe("resizeBy: the end moves by 15 minutes, never closer than 15 to the start (AC-3, Block 1)", () => {
  it("10:00 - 11:15 lengthened by 15 is 10:00 - 11:30", () => {
    expect(
      resizeBy(timed(at(10, 14, 10), at(10, 14, 11, 15)), 15),
    ).toStrictEqual(span(at(10, 14, 10), at(10, 14, 11, 30)));
  });

  it("10:00 - 10:30 shortened by 15 is 10:00 - 10:15", () => {
    expect(
      resizeBy(timed(at(10, 14, 10), at(10, 14, 10, 30)), -15),
    ).toStrictEqual(span(at(10, 14, 10), at(10, 14, 10, 15)));
  });

  it("10:00 - 10:15 shortened by 15 is null: it would end at its start", () => {
    expect(resizeBy(timed(at(10, 14, 10), at(10, 14, 10, 15)), -15)).toBeNull();
  });

  it("10:00 - 10:20 shortened by 15 is null: 10:05 is after the start but less than 15 minutes after it", () => {
    expect(resizeBy(timed(at(10, 14, 10), at(10, 14, 10, 20)), -15)).toBeNull();
  });

  it("an all-day event is never resized: null", () => {
    expect(resizeBy(allDay(at(10, 14), at(10, 15)), 15)).toBeNull();
  });
});

describe("the toast copy (voice.md, Toasts; Block 1; PO decision 5)", () => {
  it('a timed move reads "Moved to Wed 14 Oct, 10:00" - no "today", though 14 Oct is today in every suite', () => {
    expect(movedLabel(span(at(10, 14, 10), at(10, 14, 11)), false)).toBe(
      "Moved to Wed 14 Oct, 10:00",
    );
  });

  it('hours and minutes are two digits: "Moved to Mon 2 Nov, 09:05"', () => {
    expect(movedLabel(span(at(11, 2, 9, 5), at(11, 2, 10)), false)).toBe(
      "Moved to Mon 2 Nov, 09:05",
    );
  });

  it('an all-day move has no time: "Moved to Wed 14 Oct"', () => {
    expect(movedLabel(span(at(10, 14), at(10, 15)), true)).toBe(
      "Moved to Wed 14 Oct",
    );
  });

  it('a resize reads the new end: "Now ends at 11:30"', () => {
    expect(resizedLabel(span(at(10, 14, 10), at(10, 14, 11, 30)))).toBe(
      "Now ends at 11:30",
    );
  });

  it('a resize end before 10:00 is two digits: "Now ends at 09:05"', () => {
    expect(resizedLabel(span(at(10, 14, 8, 50), at(10, 14, 9, 5)))).toBe(
      "Now ends at 09:05",
    );
  });

  it('a delete reads "Deleted Dinner at Nopa"', () => {
    expect(deletedLabel("Dinner at Nopa")).toBe("Deleted Dinner at Nopa");
  });
});
