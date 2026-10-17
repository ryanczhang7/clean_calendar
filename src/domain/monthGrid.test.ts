import { describe, expect, it } from "vitest";
import { dayKey, type MonthCell, monthGrid } from "./monthGrid";

// CAL-009 AC-1, Contract Block 1. SETTLED: the numbers are read out of
// layout.md ("Grid maths that tests can pin": six rows, 42 cells, weeks start
// Monday) and Block 1 (October 2026 runs Mon 28 Sep .. Sun 8 Nov; June 2026's
// 1st is a Monday, so it runs 1 June .. 12 July). Nothing here is derived
// from the implementation. Every expected date is built with the local-time
// constructor, so the suite holds in any zone; `new Date(y, m, d + i)` lets
// the constructor carry the day across month ends, DST changes included.

/** Local midnight, `month` 1..12. */
const day = (year: number, month: number, date: number) =>
  new Date(year, month - 1, date);

const times = (cells: MonthCell[]) => cells.map((c) => c.date.getTime());

/** The 42 local midnights from `first`, one day apart. */
function run(first: Date): number[] {
  return Array.from({ length: 42 }, (_, i) =>
    new Date(
      first.getFullYear(),
      first.getMonth(),
      first.getDate() + i,
    ).getTime(),
  );
}

/** Indices whose cell is flagged inMonth. */
const inMonthIndices = (cells: MonthCell[]) =>
  cells.flatMap((c, i) => (c.inMonth ? [i] : []));

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("monthGrid(2026, 10) - October 2026 (AC-1, settled)", () => {
  const cells = monthGrid(2026, 10);

  it("returns exactly 42 cells", () => {
    expect(cells).toHaveLength(42);
  });

  it("starts on Monday 28 September 2026 and ends on Sunday 8 November 2026", () => {
    expect(cells[0]?.date.getTime()).toBe(day(2026, 9, 28).getTime());
    expect(cells[41]?.date.getTime()).toBe(day(2026, 11, 8).getTime());
  });

  it("runs one day at a time, in order, each cell at local midnight", () => {
    expect(times(cells)).toStrictEqual(run(day(2026, 9, 28)));
  });

  it("puts 1 October at cell 3, 14 October at cell 16 and 31 October at cell 33", () => {
    expect(cells[3]?.date.getTime()).toBe(day(2026, 10, 1).getTime());
    expect(cells[16]?.date.getTime()).toBe(day(2026, 10, 14).getTime());
    expect(cells[33]?.date.getTime()).toBe(day(2026, 10, 31).getTime());
    expect(cells[34]?.date.getTime()).toBe(day(2026, 11, 1).getTime());
  });

  it("flags exactly the 31 October days inMonth: cells 3 to 33", () => {
    expect(inMonthIndices(cells)).toStrictEqual(range(3, 33));
    expect(cells.filter((c) => c.inMonth)).toHaveLength(31);
  });

  it("has seven columns Monday to Sunday: every cell's weekday follows its column", () => {
    const weekdays = cells.map((c) => c.date.getDay());
    const expected = Array.from(
      { length: 42 },
      (_, i) => [1, 2, 3, 4, 5, 6, 0][i % 7],
    );
    expect(weekdays).toStrictEqual(expected);
  });

  it("hands out Date objects with nothing but the date in them", () => {
    for (const c of cells) {
      expect(c.date).toBeInstanceOf(Date);
      expect([
        c.date.getHours(),
        c.date.getMinutes(),
        c.date.getSeconds(),
        c.date.getMilliseconds(),
      ]).toStrictEqual([0, 0, 0, 0]);
    }
  });
});

describe("months whose 1st is a Monday (AC-1, Block 1)", () => {
  it("June 2026: cell 0 is Monday 1 June itself and cell 41 is Sunday 12 July", () => {
    const cells = monthGrid(2026, 6);
    expect(cells).toHaveLength(42);
    expect(cells[0]?.date.getTime()).toBe(day(2026, 6, 1).getTime());
    expect(cells[41]?.date.getTime()).toBe(day(2026, 7, 12).getTime());
    expect(times(cells)).toStrictEqual(run(day(2026, 6, 1)));
    expect(inMonthIndices(cells)).toStrictEqual(range(0, 29));
  });

  it("February 2027 fits in four weeks and still gets 42 cells: 1 February .. 14 March", () => {
    const cells = monthGrid(2027, 2);
    expect(cells).toHaveLength(42);
    expect(cells[0]?.date.getTime()).toBe(day(2027, 2, 1).getTime());
    expect(cells[41]?.date.getTime()).toBe(day(2027, 3, 14).getTime());
    expect(inMonthIndices(cells)).toStrictEqual(range(0, 27));
  });
});

describe("other months (AC-1: every month returns exactly 42)", () => {
  it("February 2026 (1st a Sunday): Monday 26 January .. Sunday 8 March, 28 days in month", () => {
    const cells = monthGrid(2026, 2);
    expect(cells).toHaveLength(42);
    expect(cells[0]?.date.getTime()).toBe(day(2026, 1, 26).getTime());
    expect(cells[41]?.date.getTime()).toBe(day(2026, 3, 8).getTime());
    expect(inMonthIndices(cells)).toStrictEqual(range(6, 33));
  });

  it("February 2028 (leap year, 1st a Tuesday): 29 days in month from cell 1", () => {
    const cells = monthGrid(2028, 2);
    expect(cells[0]?.date.getTime()).toBe(day(2028, 1, 31).getTime());
    expect(inMonthIndices(cells)).toStrictEqual(range(1, 29));
  });

  it("January 2026 reaches back into December 2025: cell 0 is Monday 29 December 2025", () => {
    const cells = monthGrid(2026, 1);
    expect(cells[0]?.date.getTime()).toBe(day(2025, 12, 29).getTime());
    expect(inMonthIndices(cells)).toStrictEqual(range(3, 33));
  });

  it("December 2026 reaches forward into January 2027: Monday 30 November .. Sunday 10 January", () => {
    const cells = monthGrid(2026, 12);
    expect(cells[0]?.date.getTime()).toBe(day(2026, 11, 30).getTime());
    expect(cells[41]?.date.getTime()).toBe(day(2027, 1, 10).getTime());
    expect(inMonthIndices(cells)).toStrictEqual(range(1, 31));
  });

  it.each(range(1, 12))(
    "2026-%i: 42 consecutive local midnights from a Monday, the month's days flagged and no others",
    (month) => {
      const cells = monthGrid(2026, month);
      expect(cells).toHaveLength(42);
      const first = cells[0]?.date as Date;
      expect(first.getDay()).toBe(1);
      expect(times(cells)).toStrictEqual(run(first));
      const daysInMonth = new Date(2026, month, 0).getDate();
      const flagged = cells.filter((c) => c.inMonth).map((c) => c.date);
      expect(flagged).toHaveLength(daysInMonth);
      expect(flagged.map((d) => d.getDate())).toStrictEqual(
        range(1, daysInMonth),
      );
      expect(flagged.every((d) => d.getMonth() === month - 1)).toBe(true);
      // The 1st sits in the first row.
      expect(cells.findIndex((c) => c.inMonth)).toBeLessThan(7);
    },
  );
});

describe("a month out of 1..12 (Block 1)", () => {
  it.each([0, 13, -1])("monthGrid(2026, %i) throws a RangeError", (month) => {
    expect(() => monthGrid(2026, month)).toThrow(RangeError);
  });
});

describe("dayKey(date) (Block 1)", () => {
  it("is the local yyyy-MM-dd of the date", () => {
    expect(dayKey(day(2026, 10, 14))).toBe("2026-10-14");
  });

  it("zero-pads the month and the day", () => {
    expect(dayKey(day(2026, 1, 5))).toBe("2026-01-05");
    expect(dayKey(day(2026, 11, 2))).toBe("2026-11-02");
  });

  it("reads the LOCAL date, just after midnight and just before the next", () => {
    // In any zone but UTC, one of these two differs from toISOString's date.
    expect(dayKey(new Date(2026, 0, 5, 0, 30))).toBe("2026-01-05");
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
