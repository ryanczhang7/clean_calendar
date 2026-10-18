import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isCalendarPath,
  moveDay,
  navNames,
  type Period,
  parsePath,
  periodOf,
  periodPath,
  periodTitle,
  readView,
  shiftPeriod,
  storeView,
  VIEW_KEY,
  type View,
} from "./period";

// CAL-011 AC-1, AC-2, AC-5 (moveDay) and AC-6 (readView), Contract Block 1.
// MECHANICAL: every title, path and date below is read out of Block 1 and
// accessibility.md ("In the month grid"), not derived with a date library.
// Every date is built with the local-time constructor; today is Wed 14 Oct
// 2026 (mid-afternoon, so "today is a date, not an instant").

/** Local midnight of `day` `month` (1..12) `year`. */
const d = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day);

const TODAY = new Date(2026, 9, 14, 15, 30);

const p = (view: View, date: Date): Period => ({ view, date });

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("the stored view preference (AC-6, Block 1)", () => {
  it('is kept under localStorage "cc.view"', () => {
    expect(VIEW_KEY).toBe("cc.view");
  });

  it('reads "month" when nothing is stored', () => {
    expect(readView()).toBe("month");
  });

  it.each(["month", "week", "day"] as const)(
    'reads back a stored "%s"',
    (view) => {
      localStorage.setItem("cc.view", view);
      expect(readView()).toBe(view);
    },
  );

  it.each(["year", "Week", "", " week", "null"])(
    'reads "month" for a stored junk value %j',
    (junk) => {
      localStorage.setItem("cc.view", junk);
      expect(readView()).toBe("month");
    },
  );

  it('reads "month" when localStorage throws on read', () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(readView()).toBe("month");
  });

  it.each(["month", "week", "day"] as const)(
    'storeView("%s") writes it under cc.view, and readView reads it back',
    (view) => {
      storeView(view);
      expect(localStorage.getItem("cc.view")).toBe(view);
      expect(readView()).toBe(view);
    },
  );

  it("storeView swallows a localStorage that throws on write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => storeView("week")).not.toThrow();
  });
});

// PO decision 13, Block 1: whether a pathname is a calendar route at all -
// the toolbar renders null only when this is false; a calendar path whose
// date does not parse still gets the toolbar, at today's month.
describe("isCalendarPath (Block 1, PO decision 13)", () => {
  it.each([
    "/",
    "/month/2026-10",
    "/week/2026-10-14",
    "/day/2026-10-14",
    "/month/2026-13",
    "/week/not-a-date",
  ])("%s is a calendar path", (path) => {
    expect(isCalendarPath(path)).toBe(true);
  });

  it.each([
    "/kinds",
    "/capture",
    "/settings/notifications",
    "/welcome",
    "/monthly",
    "/months/2026-10",
    "/weekly/2026-10-14",
    "/days",
    "/signin",
    "/unknown/x",
  ])("%s is not a calendar path", (path) => {
    expect(isCalendarPath(path)).toBe(false);
  });
});
describe("parsePath: the period a URL names (AC-1, AC-6, Block 1)", () => {
  it("/month/2026-10 is the month view at the 1st of October 2026", () => {
    expect(parsePath("/month/2026-10", "month", TODAY)).toStrictEqual(
      p("month", d(2026, 10, 1)),
    );
  });

  it("/month/2027-02 is February 2027 whatever today is", () => {
    expect(parsePath("/month/2027-02", "week", TODAY)).toStrictEqual(
      p("month", d(2027, 2, 1)),
    );
  });

  it("/week/2026-10-14 keeps the Wednesday: the URL is not rewritten to the Monday (PO decision 2)", () => {
    expect(parsePath("/week/2026-10-14", "month", TODAY)).toStrictEqual(
      p("week", d(2026, 10, 14)),
    );
  });

  it("/day/2026-10-14 is the day view of Wednesday 14 October 2026", () => {
    expect(parsePath("/day/2026-10-14", "month", TODAY)).toStrictEqual(
      p("day", d(2026, 10, 14)),
    );
  });

  it("/day/2026-11-02 parses a zero-padded day and month", () => {
    expect(parsePath("/day/2026-11-02", "month", TODAY)).toStrictEqual(
      p("day", d(2026, 11, 2)),
    );
  });

  it("/ with the month fallback is today's month, at its 1st", () => {
    expect(parsePath("/", "month", TODAY)).toStrictEqual(
      p("month", d(2026, 10, 1)),
    );
  });

  it("/ with the week fallback is the week holding today, dated today's local midnight", () => {
    expect(parsePath("/", "week", TODAY)).toStrictEqual(
      p("week", d(2026, 10, 14)),
    );
  });

  it("/ with the day fallback is today, at local midnight", () => {
    expect(parsePath("/", "day", TODAY)).toStrictEqual(
      p("day", d(2026, 10, 14)),
    );
  });

  it.each([
    ["another route", "/kinds"],
    ["another route", "/capture"],
    ["another route", "/settings/notifications"],
    ["an unknown path", "/unknown/x"],
    ["month 13", "/month/2026-13"],
    ["month 00", "/month/2026-00"],
    ["an unpadded month", "/month/2026-1"],
    ["an impossible date", "/day/2026-02-30"],
    ["an impossible date", "/week/2026-09-31"],
    ["a bare /week/", "/week/"],
    ["a bare /month/", "/month/"],
    ["a word", "/week/not-a-date"],
    ["a trailing slash", "/month/2026-10/"],
    ["a trailing slash", "/day/2026-10-14/"],
    ["a day where a month belongs", "/month/2026-10-14"],
    ["a month where a day belongs", "/day/2026-10"],
  ])("rejects %s (%s) with null", (_why, path) => {
    expect(parsePath(path, "month", TODAY)).toBeNull();
  });
});

describe("periodPath: the URL of a period (Block 1)", () => {
  it.each([
    ["/month/2026-10", p("month", d(2026, 10, 1))],
    ["/month/2027-02", p("month", d(2027, 2, 1))],
    ["/week/2026-10-14", p("week", d(2026, 10, 14))],
    ["/week/2026-10-12", p("week", d(2026, 10, 12))],
    ["/day/2026-11-02", p("day", d(2026, 11, 2))],
    ["/day/2027-01-01", p("day", d(2027, 1, 1))],
  ])("%s is the path of its period", (path, period) => {
    expect(periodPath(period)).toBe(path);
  });

  it.each(["/month/2026-10", "/week/2026-10-14", "/day/2026-02-28"])(
    "round-trips %s through parsePath",
    (path) => {
      const period = parsePath(path, "month", TODAY);
      expect(period).not.toBeNull();
      expect(periodPath(period as Period)).toBe(path);
    },
  );
});

describe("periodOf: the period of a view holding a date (AC-2 Today, AC-3, Block 1)", () => {
  it.each([false, true])(
    "month (phone %s) is the 1st of that date's month",
    (phone) => {
      expect(periodOf("month", TODAY, phone)).toStrictEqual(
        p("month", d(2026, 10, 1)),
      );
    },
  );

  it("week on tablet/desktop is the Monday of that date's week: 14 Oct -> 12 Oct", () => {
    expect(periodOf("week", TODAY, false)).toStrictEqual(
      p("week", d(2026, 10, 12)),
    );
  });

  it("week on tablet/desktop from a Sunday is the Monday before: 18 Oct -> 12 Oct", () => {
    expect(periodOf("week", d(2026, 10, 18), false)).toStrictEqual(
      p("week", d(2026, 10, 12)),
    );
  });

  it("week on the phone is the date itself, at local midnight (PO decision 3)", () => {
    expect(periodOf("week", TODAY, true)).toStrictEqual(
      p("week", d(2026, 10, 14)),
    );
  });

  it.each([false, true])(
    "day (phone %s) is the date itself, at local midnight",
    (phone) => {
      expect(periodOf("day", TODAY, phone)).toStrictEqual(
        p("day", d(2026, 10, 14)),
      );
    },
  );
});

describe("shiftPeriod: previous and next (AC-2, Block 1)", () => {
  it.each([
    ["month next", p("month", d(2026, 10, 1)), 1, false, d(2026, 11, 1)],
    ["month previous", p("month", d(2026, 10, 1)), -1, false, d(2026, 9, 1)],
    [
      "month next across a year",
      p("month", d(2026, 12, 1)),
      1,
      false,
      d(2027, 1, 1),
    ],
    [
      "month previous across a year",
      p("month", d(2027, 1, 1)),
      -1,
      false,
      d(2026, 12, 1),
    ],
    [
      "month next on the phone",
      p("month", d(2026, 10, 1)),
      1,
      true,
      d(2026, 11, 1),
    ],
    [
      "desktop week next, from the Monday of a Wednesday",
      p("week", d(2026, 10, 14)),
      1,
      false,
      d(2026, 10, 19),
    ],
    [
      "desktop week previous, from the Monday of a Wednesday",
      p("week", d(2026, 10, 14)),
      -1,
      false,
      d(2026, 10, 5),
    ],
    [
      "desktop week next from a Monday",
      p("week", d(2026, 10, 12)),
      1,
      false,
      d(2026, 10, 19),
    ],
    [
      "desktop week next across a year",
      p("week", d(2026, 12, 31)),
      1,
      false,
      d(2027, 1, 4),
    ],
    [
      "desktop week previous across a year",
      p("week", d(2027, 1, 6)),
      -1,
      false,
      d(2026, 12, 28),
    ],
    [
      "phone week next: one day",
      p("week", d(2026, 10, 14)),
      1,
      true,
      d(2026, 10, 15),
    ],
    [
      "phone week previous: one day",
      p("week", d(2026, 10, 14)),
      -1,
      true,
      d(2026, 10, 13),
    ],
    [
      "phone week next across a year",
      p("week", d(2026, 12, 31)),
      1,
      true,
      d(2027, 1, 1),
    ],
    ["day next", p("day", d(2026, 10, 14)), 1, false, d(2026, 10, 15)],
    ["day previous", p("day", d(2026, 10, 14)), -1, false, d(2026, 10, 13)],
    [
      "day next across a year",
      p("day", d(2026, 12, 31)),
      1,
      false,
      d(2027, 1, 1),
    ],
    [
      "day previous across a year",
      p("day", d(2027, 1, 1)),
      -1,
      true,
      d(2026, 12, 31),
    ],
  ] as const)("%s", (_name, period, dir, phone, date) => {
    expect(shiftPeriod(period, dir, phone)).toStrictEqual(p(period.view, date));
  });
});

describe("periodTitle: the <h1> (AC-1, Block 1's table)", () => {
  it.each([false, true])('a month reads "October 2026" (phone %s)', (phone) => {
    expect(periodTitle(p("month", d(2026, 10, 1)), phone)).toBe("October 2026");
  });

  it.each([false, true])(
    'a day reads "Wednesday 14 October 2026" (phone %s)',
    (phone) => {
      expect(periodTitle(p("day", d(2026, 10, 14)), phone)).toBe(
        "Wednesday 14 October 2026",
      );
    },
  );

  // The deferred week-normalisation target: with weekStart mutated to a
  // Sunday start this reads "11 – 17 Oct 2026" and must fail.
  it('/week/2026-10-14 is titled "12 – 18 Oct 2026": a Wednesday normalises to its Monday-to-Sunday week', () => {
    const period = parsePath("/week/2026-10-14", "month", TODAY) as Period;
    expect(periodTitle(period, false)).toBe("12 – 18 Oct 2026");
  });

  it.each([
    ["the Monday", d(2026, 10, 12), "12 – 18 Oct 2026"],
    ["the Sunday", d(2026, 10, 18), "12 – 18 Oct 2026"],
    ["a week across a month", d(2026, 10, 1), "28 Sep – 4 Oct 2026"],
    ["a week across a year", d(2026, 1, 1), "29 Dec 2025 – 4 Jan 2026"],
  ])("a desktop week from %s reads %j", (_name, date, title) => {
    expect(periodTitle(p("week", date), false)).toBe(title);
  });

  it.each([
    ["Wednesday 14 Oct", d(2026, 10, 14), "Tue 13 – Thu 15 Oct"],
    ["a window across a month", d(2026, 10, 1), "Wed 30 Sep – Fri 2 Oct"],
    [
      "a window across a year (no year)",
      d(2027, 1, 1),
      "Thu 31 Dec – Sat 2 Jan",
    ],
  ])("a phone week around %s reads %j", (_name, date, title) => {
    expect(periodTitle(p("week", date), true)).toBe(title);
  });

  it("the week title uses an en dash with a space either side", () => {
    const title = periodTitle(p("week", d(2026, 10, 14)), false);
    expect(title).toContain(" – ");
    expect(title).not.toContain("-");
  });
});

describe("navNames: the previous/next button names (AC-2, Block 1)", () => {
  it.each([
    ["month", false, "Previous month", "Next month"],
    ["month", true, "Previous month", "Next month"],
    ["week", false, "Previous week", "Next week"],
    ["week", true, "Previous day", "Next day"],
    ["day", false, "Previous day", "Next day"],
    ["day", true, "Previous day", "Next day"],
  ] as const)("%s, phone %s: %j / %j", (view, phone, previous, next) => {
    expect(navNames(view, phone)).toStrictEqual({ previous, next });
  });
});

describe("moveDay: one keyboard step in the month grid (AC-5, accessibility.md)", () => {
  it.each([
    ["ArrowLeft", "13 October", d(2026, 10, 13)],
    ["ArrowRight", "15 October", d(2026, 10, 15)],
    ["ArrowUp", "7 October", d(2026, 10, 7)],
    ["ArrowDown", "21 October", d(2026, 10, 21)],
    ["Home", "Monday 12 October", d(2026, 10, 12)],
    ["End", "Sunday 18 October", d(2026, 10, 18)],
    ["PageUp", "14 September", d(2026, 9, 14)],
    ["PageDown", "14 November", d(2026, 11, 14)],
  ])("from Wednesday 14 October, %s lands on %s", (key, _label, date) => {
    expect(moveDay(d(2026, 10, 14), key)).toStrictEqual(date);
  });

  // The deferred "defect put back" target: with the clamp removed, 31 Oct
  // + 1 month overflows to 1 Dec and this must fail.
  it("PageDown from 31 October lands on 30 November (clamped to the month's last day)", () => {
    expect(moveDay(d(2026, 10, 31), "PageDown")).toStrictEqual(d(2026, 11, 30));
  });

  // Must stay green when the clamp is removed: it does not page.
  it("ArrowDown from 31 October lands on 7 November", () => {
    expect(moveDay(d(2026, 10, 31), "ArrowDown")).toStrictEqual(d(2026, 11, 7));
  });

  it("PageDown from 31 January 2027 lands on 28 February 2027", () => {
    expect(moveDay(d(2027, 1, 31), "PageDown")).toStrictEqual(d(2027, 2, 28));
  });

  it.each([
    ["PageUp from 31 October", d(2026, 10, 31), "PageUp", d(2026, 9, 30)],
    ["PageUp from 31 March 2027", d(2027, 3, 31), "PageUp", d(2027, 2, 28)],
    ["PageDown across a year", d(2026, 12, 31), "PageDown", d(2027, 1, 31)],
    ["PageUp across a year", d(2027, 1, 15), "PageUp", d(2026, 12, 15)],
    [
      "ArrowRight across a month",
      d(2026, 10, 31),
      "ArrowRight",
      d(2026, 11, 1),
    ],
    ["ArrowLeft across a year", d(2027, 1, 1), "ArrowLeft", d(2026, 12, 31)],
    ["ArrowUp across a month", d(2026, 10, 3), "ArrowUp", d(2026, 9, 26)],
    ["Home across a month (Thu 1 Oct)", d(2026, 10, 1), "Home", d(2026, 9, 28)],
    ["End across a year (Wed 30 Dec)", d(2026, 12, 30), "End", d(2027, 1, 3)],
    ["Home on a Monday stays", d(2026, 10, 12), "Home", d(2026, 10, 12)],
    ["End on a Sunday stays", d(2026, 10, 18), "End", d(2026, 10, 18)],
  ])("%s", (_name, from, key, to) => {
    expect(moveDay(from, key)).toStrictEqual(to);
  });

  it.each(["Enter", " ", "Tab", "Escape", "a", "t", "Delete", "Shift"])(
    "returns null for a key it does not handle: %j",
    (key) => {
      expect(moveDay(d(2026, 10, 14), key)).toBeNull();
    },
  );
});
