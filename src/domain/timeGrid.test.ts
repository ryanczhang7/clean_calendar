import { describe, expect, it } from "vitest";
import type { Event } from "../data/rows";
import {
  ALL_DAY_CHIP_HEIGHT,
  ALL_DAY_MAX_CHIPS,
  ALL_DAY_ROW_PADDING,
  allDayRowHeight,
  blockGeometry,
  clipToDay,
  daysFrom,
  HOUR_HEIGHT,
  initialScrollTop,
  MIN_BLOCK_HEIGHT,
  minuteOfDay,
  overlapColumns,
  SCROLL_FALLBACK_HOUR,
  weekStart,
} from "./timeGrid";

// CAL-010 AC-1, AC-2, AC-4, AC-5 (the pure half), Contract Block 1.
// SETTLED: AC-1's and AC-4's numbers are READ OUT of layout.md ("Grid maths
// that tests can pin") and Block 1's list - 48 / 56 px per hour, the 20px
// floor, 24px chips plus 8px padding, three chips at most - and are never
// derived from the implementation. MECHANICAL WITH WORKED EXAMPLES: AC-2's
// column assignments are Block 1's examples, one `it` each; the touching
// case is the deferred verification's target. Every instant is built with
// the local-time constructor, so the suite holds in any zone.

const STAMP = "2026-10-16T08:00:00.000001+00:00";

/** Local time on a day of October 2026. */
const oct = (date: number, hour = 0, minute = 0) =>
  new Date(2026, 9, date, hour, minute);

/** A timed event `id` on Wed 14 Oct 2026 from `[h, m]` to `[h, m]`. */
function on14(
  id: string,
  from: [number, number],
  to: [number, number],
  title = id,
): Event {
  return ev(id, oct(14, from[0], from[1]), oct(14, to[0], to[1]), title);
}

function ev(
  id: string,
  startsAt: Date,
  endsAt: Date,
  title = id,
  allDay = false,
): Event {
  return {
    id,
    title,
    kindId: "00000000-0000-4000-8000-000000000001",
    startsAt,
    endsAt,
    allDay,
    location: null,
    notes: null,
    recurrence: null,
    origin: "manual",
    captureJobId: null,
    deletedAt: null,
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

const cols = (column: number, columns: number) => ({ column, columns });

describe("the exported constants are layout.md's numbers", () => {
  it("MIN_BLOCK_HEIGHT 20, all-day chips 24 + 8 padding, at most 3, fallback hour 8", () => {
    expect(MIN_BLOCK_HEIGHT).toBe(20);
    expect(ALL_DAY_CHIP_HEIGHT).toBe(24);
    expect(ALL_DAY_ROW_PADDING).toBe(8);
    expect(ALL_DAY_MAX_CHIPS).toBe(3);
    expect(SCROLL_FALLBACK_HOUR).toBe(8);
  });

  it("the hour is 56px on phone and 48px on tablet and desktop", () => {
    expect(HOUR_HEIGHT).toStrictEqual({ phone: 56, tablet: 48, desktop: 48 });
  });
});

describe("minuteOfDay(d) - whole minutes since local midnight", () => {
  it.each([
    [oct(14, 0, 0), 0],
    [oct(14, 9, 30), 570],
    [oct(14, 23, 59), 1439],
  ])("%s is minute %i", (d, minute) => {
    expect(minuteOfDay(d)).toBe(minute);
  });

  it("ignores seconds and milliseconds", () => {
    expect(minuteOfDay(new Date(2026, 9, 14, 9, 30, 59, 999))).toBe(570);
  });
});

describe("blockGeometry(start, end, hourHeight) - AC-1, settled", () => {
  it("09:00-10:30 at 48px/h is top 432, height 72", () => {
    expect(blockGeometry(oct(14, 9, 0), oct(14, 10, 30), 48)).toStrictEqual({
      top: 432,
      height: 72,
    });
  });

  it("a 15-minute event (09:15-09:30) is held at the 20px floor: top 444, height 20, not 12", () => {
    expect(blockGeometry(oct(14, 9, 15), oct(14, 9, 30), 48)).toStrictEqual({
      top: 444,
      height: 20,
    });
  });

  it("a whole day 00:00 to the next midnight is top 0, height 1152", () => {
    expect(blockGeometry(oct(14), oct(15), 48)).toStrictEqual({
      top: 0,
      height: 1152,
    });
  });

  it("at the phone's 56px/h, 09:00-10:00 is top 504, height 56", () => {
    expect(blockGeometry(oct(14, 9, 0), oct(14, 10, 0), 56)).toStrictEqual({
      top: 504,
      height: 56,
    });
  });

  it("an end equal to the start, or before it, gets the 20px floor", () => {
    expect(blockGeometry(oct(14, 9, 0), oct(14, 9, 0), 48)).toStrictEqual({
      top: 432,
      height: 20,
    });
    expect(blockGeometry(oct(14, 9, 0), oct(14, 8, 0), 48)).toStrictEqual({
      top: 432,
      height: 20,
    });
  });
});

describe("clipToDay(event, day) - CAL-009's occupancy, clipped", () => {
  it("an event inside the day comes back as its own start and end", () => {
    expect(
      clipToDay(ev("a", oct(14, 9), oct(14, 10, 30)), oct(14)),
    ).toStrictEqual({ start: oct(14, 9), end: oct(14, 10, 30) });
  });

  it("an event ending exactly at the day's midnight belongs to the day before: null", () => {
    const late = ev("a", oct(13, 23), oct(14, 0));
    expect(clipToDay(late, oct(14))).toBeNull();
    expect(clipToDay(late, oct(13))).toStrictEqual({
      start: oct(13, 23),
      end: oct(14, 0),
    });
  });

  it("an event starting exactly at midnight belongs to that day, not the day before", () => {
    const early = ev("a", oct(14, 0), oct(14, 1));
    expect(clipToDay(early, oct(14))).toStrictEqual({
      start: oct(14, 0),
      end: oct(14, 1),
    });
    expect(clipToDay(early, oct(13))).toBeNull();
  });

  it("an event crossing midnight is [start, midnight) on the first day and [midnight, end) on the second", () => {
    const night = ev("a", oct(14, 23), oct(15, 1));
    expect(clipToDay(night, oct(14))).toStrictEqual({
      start: oct(14, 23),
      end: oct(15, 0),
    });
    expect(clipToDay(night, oct(15))).toStrictEqual({
      start: oct(15, 0),
      end: oct(15, 1),
    });
    expect(clipToDay(night, oct(16))).toBeNull();
  });

  it("an event on another day is null", () => {
    expect(clipToDay(ev("a", oct(16, 9), oct(16, 10)), oct(14))).toBeNull();
  });
});

describe("overlapColumns(events) - AC-2, Block 1's worked examples", () => {
  it("A 09-10 and B 09:30-10:30 overlap: A takes column 0 of 2, B column 1 of 2", () => {
    const a = on14("A", [9, 0], [10, 0]);
    const b = on14("B", [9, 30], [10, 30]);
    expect(overlapColumns([a, b])).toStrictEqual(
      new Map([
        ["A", cols(0, 2)],
        ["B", cols(1, 2)],
      ]),
    );
  });

  it("adding C 10-11 (overlaps B, not A) puts C back in column 0 and keeps two columns for all three", () => {
    const a = on14("A", [9, 0], [10, 0]);
    const b = on14("B", [9, 30], [10, 30]);
    const c = on14("C", [10, 0], [11, 0]);
    expect(overlapColumns([a, b, c])).toStrictEqual(
      new Map([
        ["A", cols(0, 2)],
        ["B", cols(1, 2)],
        ["C", cols(0, 2)],
      ]),
    );
  });

  it("three identical 09-10 events take columns 0, 1, 2 of 3, ordered by title when start and end tie", () => {
    const c = on14("c", [9, 0], [10, 0], "Charlie");
    const a = on14("a", [9, 0], [10, 0], "Alpha");
    const b = on14("b", [9, 0], [10, 0], "Bravo");
    expect(overlapColumns([c, a, b])).toStrictEqual(
      new Map([
        ["a", cols(0, 3)],
        ["b", cols(1, 3)],
        ["c", cols(2, 3)],
      ]),
    );
  });

  it("touching end-to-start is not overlapping: 09-10 and 10-11 each take the full width, and a pair before a touching event does not widen it", () => {
    const a = on14("A", [9, 0], [10, 0]);
    const b = on14("B", [10, 0], [11, 0]);
    expect(overlapColumns([a, b])).toStrictEqual(
      new Map([
        ["A", cols(0, 1)],
        ["B", cols(0, 1)],
      ]),
    );
    // The same boundary seen by the cluster rule rather than the column
    // rule: C touches the 09-10 pair and overlaps neither, so it is its own
    // one-column cluster.
    const x = on14("X", [9, 0], [10, 0]);
    const y = on14("Y", [9, 0], [10, 0]);
    const c = on14("C", [10, 0], [11, 0]);
    expect(overlapColumns([x, y, c])).toStrictEqual(
      new Map([
        ["X", cols(0, 2)],
        ["Y", cols(1, 2)],
        ["C", cols(0, 1)],
      ]),
    );
  });

  it("a lone event takes the full width: column 0 of 1", () => {
    expect(overlapColumns([on14("A", [9, 0], [10, 0])])).toStrictEqual(
      new Map([["A", cols(0, 1)]]),
    );
  });

  it("two clusters in one day are sized apart: the 09-10 pair in halves, 14-15 alone at full width", () => {
    const x = on14("X", [9, 0], [10, 0]);
    const y = on14("Y", [9, 0], [10, 0]);
    const z = on14("Z", [14, 0], [15, 0]);
    expect(overlapColumns([z, y, x])).toStrictEqual(
      new Map([
        ["X", cols(0, 2)],
        ["Y", cols(1, 2)],
        ["Z", cols(0, 1)],
      ]),
    );
  });

  it("start order decides the columns, whatever order the events arrive in; on a tied start the longer goes first", () => {
    const short = on14("short", [9, 0], [10, 0], "Alpha");
    const long = on14("long", [9, 0], [11, 0], "Zulu");
    const later = on14("later", [9, 30], [10, 0], "Bravo");
    expect(overlapColumns([later, short, long])).toStrictEqual(
      new Map([
        ["long", cols(0, 3)],
        ["short", cols(1, 3)],
        ["later", cols(2, 3)],
      ]),
    );
  });

  it("an all-day event passed in is ignored - it is not in the map", () => {
    const hotel = ev("H", oct(14), oct(15), "Hotel", true);
    const a = on14("A", [9, 0], [10, 0]);
    expect(overlapColumns([hotel, a])).toStrictEqual(
      new Map([["A", cols(0, 1)]]),
    );
  });

  it("no events give an empty map", () => {
    expect(overlapColumns([])).toStrictEqual(new Map());
  });
});

describe("allDayRowHeight(count) - AC-4, settled", () => {
  it.each([
    [0, 32],
    [1, 32],
    [2, 56],
    [3, 80],
    [4, 80],
    [9, 80],
  ])("%i all-day events -> %ipx", (count, px) => {
    expect(allDayRowHeight(count)).toBe(px);
  });
});

describe("initialScrollTop(nowTop, hourHeight, viewportHeight) - AC-5", () => {
  it("puts now one third from the top: (432, 48, 600) -> 232", () => {
    expect(initialScrollTop(432, 48, 600)).toBe(232);
  });

  it("clamps at 0 when now is in the first third: (100, 48, 600) -> 0", () => {
    expect(initialScrollTop(100, 48, 600)).toBe(0);
  });

  it("with now not in view puts 08:00 at the top: (null, 48, 600) -> 384", () => {
    expect(initialScrollTop(null, 48, 600)).toBe(384);
  });

  it("the fallback follows the hour height, not the viewport: (null, 56, 0) -> 448", () => {
    expect(initialScrollTop(null, 56, 0)).toBe(448);
  });
});

describe("weekStart(d) - Monday 00:00 local of d's week", () => {
  it.each([12, 13, 14, 15, 16, 17, 18])(
    "any instant on %i October 2026 is in the week of Monday 12 October",
    (date) => {
      expect(weekStart(oct(date, 15, 30))).toStrictEqual(oct(12));
    },
  );

  it("Monday at 00:00 exactly is its own week start", () => {
    expect(weekStart(oct(12))).toStrictEqual(oct(12));
  });

  it("Sunday 1 November 23:59 is in the week of Monday 26 October", () => {
    expect(weekStart(new Date(2026, 10, 1, 23, 59))).toStrictEqual(oct(26));
  });

  it("a week crossing the year: Friday 1 January 2027 is in the week of Monday 28 December 2026", () => {
    expect(weekStart(new Date(2027, 0, 1, 12))).toStrictEqual(
      new Date(2026, 11, 28),
    );
  });
});

describe("daysFrom(first, n) - n consecutive local midnights", () => {
  it("runs across a month end: 30 Oct, 31 Oct, 1 Nov, 2 Nov", () => {
    expect(daysFrom(oct(30), 4)).toStrictEqual([
      oct(30),
      oct(31),
      new Date(2026, 10, 1),
      new Date(2026, 10, 2),
    ]);
  });

  it("every day is a local midnight across 24 Oct - 2 Nov, whichever DST change the zone has", () => {
    const expected = Array.from({ length: 10 }, (_, i) => oct(24 + i));
    expect(daysFrom(oct(24), 10)).toStrictEqual(expected);
  });

  it("n = 1 is the day alone; n = 0 is empty", () => {
    expect(daysFrom(oct(14), 1)).toStrictEqual([oct(14)]);
    expect(daysFrom(oct(14), 0)).toStrictEqual([]);
  });
});
