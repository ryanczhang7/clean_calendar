// CAL-009 AC-1, Contract Block 1 (layout.md, "Grid maths that tests can
// pin"): six Monday-start weeks, 42 cells, local time throughout.

export type MonthCell = {
  /** Local midnight of the day. */
  date: Date;
  /** True for the days of the requested month, false for the leading and trailing ones. */
  inMonth: boolean;
};

/** Six Monday-start weeks (42 cells) covering `month` (1..12) of `year`. */
export function monthGrid(year: number, month: number): MonthCell[] {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`month must be 1..12, got ${month}`);
  }
  const first = new Date(year, month - 1, 1);
  // getDay(): Sunday 0 .. Saturday 6; days back to the Monday on or before.
  const lead = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    // The constructor carries the day across month ends and DST changes.
    const date = new Date(year, month - 1, 1 - lead + i);
    return { date, inMonth: date.getMonth() === month - 1 };
  });
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The ISO `yyyy-MM-dd` of a local date, for keys and `/day/` URLs. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
