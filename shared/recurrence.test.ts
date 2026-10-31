import { describe, expect, it } from "vitest";
import {
  expand,
  type Occurrence,
  type Override,
  type Range,
  type Recurrence,
  type Series,
} from "./recurrence.ts";
import fixture from "./tests/recurrence-fixtures.json";

// CAL-023. The fixture is the shared oracle (AC-1..AC-6 under both runtimes,
// AC-7); the inline cases below pin the mechanical rules of Contract Blocks
// 3-6. Every expected instant is hand-computed from London's published
// offsets (story, ## Test plan). Nothing here reads the host zone: every zone
// is recurrence.tz and every instant is written in UTC.

type Wire<T> = {
  [K in keyof T]: T[K] extends Date
    ? string
    : T[K] extends Date | null
      ? string | null
      : T[K];
};

type FixtureCase = {
  name: string;
  series: Omit<Wire<Series>, "recurrence"> & { recurrence: Recurrence };
  overrides: Wire<Override>[];
  range: Wire<Range>;
  expected: Wire<Occurrence>[];
};

const at = (iso: string): Date => new Date(iso);
const atOrNull = (iso: string | null): Date | null =>
  iso === null ? null : new Date(iso);

function parseSeries(raw: FixtureCase["series"]): Series {
  return { ...raw, startsAt: at(raw.startsAt), endsAt: at(raw.endsAt) };
}

function parseOverride(raw: Wire<Override>): Override {
  return {
    ...raw,
    startsAt: atOrNull(raw.startsAt),
    endsAt: atOrNull(raw.endsAt),
  };
}

function parseRange(raw: Wire<Range>): Range {
  return { start: at(raw.start), end: at(raw.end) };
}

// Spreads every key the occurrence carries, so an extra field fails the
// strict comparison; toISOString throws if startsAt/endsAt is not a Date.
function serialise(occurrences: Occurrence[]): Wire<Occurrence>[] {
  return occurrences.map((o) => ({
    ...o,
    startsAt: o.startsAt.toISOString(),
    endsAt: o.endsAt.toISOString(),
  }));
}

const cases = (fixture as { cases: FixtureCase[] }).cases;

describe("recurrence fixture (shared with the Deno suite, AC-7)", () => {
  it("carries at least one case for every one of AC-1 to AC-6", () => {
    for (const ac of ["AC-1", "AC-2", "AC-3", "AC-4", "AC-5", "AC-6"]) {
      expect(cases.some((c) => c.name.includes(ac))).toBe(true);
    }
  });

  for (const c of cases) {
    it(c.name, () => {
      const got = expand(
        parseSeries(c.series),
        c.overrides.map(parseOverride),
        parseRange(c.range),
      );
      expect(serialise(got)).toStrictEqual(c.expected);
    });
  }
});

// --- inline mechanical pins ------------------------------------------------

const LONDON = "Europe/London";

function series(overrides: Partial<Series> & Pick<Series, "recurrence">) {
  const base: Series = {
    id: "s1",
    title: "Gym",
    kindId: "k1",
    // Monday 12 October 2026 09:00-10:00 BST (+01:00)
    startsAt: at("2026-10-12T08:00:00.000Z"),
    endsAt: at("2026-10-12T09:00:00.000Z"),
    allDay: false,
    location: null,
    notes: null,
    recurrence: overrides.recurrence,
  };
  return { ...base, ...overrides };
}

const weekly = (until: string | null = null, tz = LONDON): Recurrence => ({
  freq: "weekly",
  until,
  tz,
});

function override(
  occurrenceDate: string,
  fields: Partial<Omit<Override, "occurrenceDate">> = {},
): Override {
  return {
    occurrenceDate,
    cancelled: false,
    title: null,
    kindId: null,
    startsAt: null,
    endsAt: null,
    allDay: null,
    location: null,
    notes: null,
    ...fields,
  };
}

const range = (start: string, end: string): Range => ({
  start: at(start),
  end: at(end),
});

const starts = (os: Occurrence[]) => os.map((o) => o.startsAt.toISOString());
const dates = (os: Occurrence[]) => os.map((o) => o.occurrenceDate);

describe("occurrence 0 is the series itself (Block 3)", () => {
  it("returns the series' own start and end instants byte for byte, milliseconds included, even when tz is not the zone the instant was written in", () => {
    const s = series({
      startsAt: at("2026-10-12T08:17:23.456Z"),
      endsAt: at("2026-10-12T09:41:07.891Z"),
      title: "Odd",
      kindId: "k9",
      location: "Room 4",
      notes: "n",
      recurrence: { freq: "daily", until: null, tz: "Asia/Kolkata" },
    });
    const [first] = expand(
      s,
      [],
      range("2026-10-12T00:00:00.000Z", "2026-10-12T12:00:00.000Z"),
    );
    expect(first).toBeDefined();
    expect(first?.startsAt.getTime()).toBe(s.startsAt.getTime());
    expect(first?.endsAt.getTime()).toBe(s.endsAt.getTime());
    expect(first).toMatchObject({
      seriesId: "s1",
      title: "Odd",
      kindId: "k9",
      allDay: false,
      location: "Room 4",
      notes: "n",
      // 08:17Z is 13:47 in Kolkata (+05:30), still 12 October there
      occurrenceDate: "2026-10-12",
    });
  });

  it("keeps the wall-clock hours, minutes and seconds of the start in tz for later occurrences", () => {
    // 13:47:23 IST (+05:30, no DST) every day = 08:17:23Z
    const s = series({
      startsAt: at("2026-10-12T08:17:23.000Z"),
      endsAt: at("2026-10-12T08:47:23.000Z"),
      recurrence: { freq: "daily", until: null, tz: "Asia/Kolkata" },
    });
    const got = expand(
      s,
      [],
      range("2026-10-13T00:00:00.000Z", "2026-10-15T00:00:00.000Z"),
    );
    expect(starts(got)).toEqual([
      "2026-10-13T08:17:23.000Z",
      "2026-10-14T08:17:23.000Z",
    ]);
  });
});

describe("zone is recurrence.tz, never the host (Block 3, Block 7)", () => {
  it("keeps 09:00 New York wall time across the US end of DST on 1 November 2026 (13:00Z EDT, then 14:00Z EST)", () => {
    // Monday 26 October 2026 09:00 EDT (-04:00) = 13:00Z
    const s = series({
      startsAt: at("2026-10-26T13:00:00.000Z"),
      endsAt: at("2026-10-26T14:00:00.000Z"),
      recurrence: weekly(null, "America/New_York"),
    });
    const got = expand(
      s,
      [],
      range("2026-10-26T00:00:00.000Z", "2026-11-10T00:00:00.000Z"),
    );
    expect(starts(got)).toEqual([
      "2026-10-26T13:00:00.000Z",
      "2026-11-02T14:00:00.000Z",
      "2026-11-09T14:00:00.000Z",
    ]);
  });

  it("dates each occurrence in tz, not in UTC: 20:00 Los Angeles on 12 October is 03:00Z on the 13th but occurrenceDate 2026-10-12", () => {
    // 20:00 PDT (-07:00) = 03:00Z next day
    const s = series({
      startsAt: at("2026-10-13T03:00:00.000Z"),
      endsAt: at("2026-10-13T04:00:00.000Z"),
      recurrence: weekly(null, "America/Los_Angeles"),
    });
    const got = expand(
      s,
      [],
      range("2026-10-13T00:00:00.000Z", "2026-10-21T00:00:00.000Z"),
    );
    expect(dates(got)).toEqual(["2026-10-12", "2026-10-19"]);
    expect(starts(got)).toEqual([
      "2026-10-13T03:00:00.000Z",
      "2026-10-20T03:00:00.000Z",
    ]);
  });

  it("compares until against the occurrence's date in tz: until 2026-10-19 keeps the Los Angeles evening of the 19th (03:00Z on the 20th)", () => {
    const s = series({
      startsAt: at("2026-10-13T03:00:00.000Z"),
      endsAt: at("2026-10-13T04:00:00.000Z"),
      recurrence: weekly("2026-10-19", "America/Los_Angeles"),
    });
    const got = expand(
      s,
      [],
      range("2026-10-01T00:00:00.000Z", "2026-12-01T00:00:00.000Z"),
    );
    expect(dates(got)).toEqual(["2026-10-12", "2026-10-19"]);
  });
});

describe("DST resolution of a shifted wall time (Block 3)", () => {
  it("resolves a wall time that does not exist (01:30 on 29 March 2026 in London) with the pre-transition offset, to 01:30Z", () => {
    // Daily 01:30-03:30 London, from Friday 27 March 2026 (GMT, +00:00).
    // 29 March: clocks go 01:00 GMT -> 02:00 BST at 01:00Z, so 01:30 is
    // skipped; the GMT reading gives 01:30Z. 03:30 BST = 02:30Z.
    const s = series({
      startsAt: at("2026-03-27T01:30:00.000Z"),
      endsAt: at("2026-03-27T03:30:00.000Z"),
      recurrence: { freq: "daily", until: null, tz: LONDON },
    });
    const got = expand(
      s,
      [],
      range("2026-03-28T12:00:00.000Z", "2026-03-30T00:00:00.000Z"),
    );
    expect(dates(got)).toEqual(["2026-03-29"]);
    expect(got[0]?.startsAt.toISOString()).toBe("2026-03-29T01:30:00.000Z");
    expect(got[0]?.endsAt.toISOString()).toBe("2026-03-29T02:30:00.000Z");
  });

  it("resolves a wall time that exists twice (01:30 on 25 October 2026 in London) to the earlier, BST, instant 00:30Z", () => {
    // Daily 01:30-02:30 London from Saturday 24 October (BST): 00:30Z-01:30Z.
    // 25 October: 01:30 occurs at 00:30Z (BST) and 01:30Z (GMT); earlier wins.
    // 02:30 occurs once, in GMT: 02:30Z.
    const s = series({
      startsAt: at("2026-10-24T00:30:00.000Z"),
      endsAt: at("2026-10-24T01:30:00.000Z"),
      recurrence: { freq: "daily", until: null, tz: LONDON },
    });
    const got = expand(
      s,
      [],
      range("2026-10-24T12:00:00.000Z", "2026-10-25T12:00:00.000Z"),
    );
    expect(dates(got)).toEqual(["2026-10-25"]);
    expect(got[0]?.startsAt.toISOString()).toBe("2026-10-25T00:30:00.000Z");
    expect(got[0]?.endsAt.toISOString()).toBe("2026-10-25T02:30:00.000Z");
  });

  it("shifts the end in wall time, not by elapsed ms: a two-day all-day event over the change still ends at local midnight two days later (49 hours elapsed)", () => {
    // Saturday 17 - Sunday 18 October 2026, all day: local midnight BST.
    // start 2026-10-17 00:00 BST = 16T23:00Z; end 2026-10-19 00:00 BST = 18T23:00Z.
    // k=1: 24 Oct 00:00 BST = 23T23:00Z; 26 Oct 00:00 GMT = 26T00:00Z (49h).
    // k=2: 31 Oct 00:00 GMT = 31T00:00Z; 2 Nov 00:00 GMT = 02T00:00Z.
    const s = series({
      title: "Weekend away",
      allDay: true,
      startsAt: at("2026-10-16T23:00:00.000Z"),
      endsAt: at("2026-10-18T23:00:00.000Z"),
      recurrence: weekly(),
    });
    const got = expand(
      s,
      [],
      range("2026-10-20T00:00:00.000Z", "2026-11-03T00:00:00.000Z"),
    );
    expect(
      got.map((o) => [
        o.occurrenceDate,
        o.startsAt.toISOString(),
        o.endsAt.toISOString(),
      ]),
    ).toEqual([
      ["2026-10-24", "2026-10-23T23:00:00.000Z", "2026-10-26T00:00:00.000Z"],
      ["2026-10-31", "2026-10-31T00:00:00.000Z", "2026-11-02T00:00:00.000Z"],
    ]);
    expect(got.every((o) => o.allDay)).toBe(true);
  });
});

describe("range is half-open and judged on original times (Block 4)", () => {
  it("returns [] for a range entirely before the series", () => {
    expect(
      expand(
        series({ recurrence: weekly() }),
        [],
        range("2026-01-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z"),
      ),
    ).toEqual([]);
  });

  it("excludes an occurrence ending exactly at range.start and one starting exactly at range.end, and includes one starting exactly at range.start", () => {
    const s = series({ recurrence: weekly() });
    // 19 Oct ends 09:00Z; 26 Oct is 09:00Z-10:00Z; 2 Nov starts 09:00Z.
    expect(
      dates(
        expand(
          s,
          [],
          range("2026-10-19T09:00:00.000Z", "2026-11-02T09:00:00.000Z"),
        ),
      ),
    ).toEqual(["2026-10-26"]);
    expect(
      dates(
        expand(
          s,
          [],
          range("2026-10-26T09:00:00.000Z", "2026-10-26T09:00:00.001Z"),
        ),
      ),
    ).toEqual(["2026-10-26"]);
  });

  it("includes an occurrence whose original time is in range even when its override moves it outside", () => {
    const s = series({ recurrence: weekly() });
    const got = expand(
      s,
      [
        override("2026-11-02", {
          startsAt: at("2026-12-25T10:00:00.000Z"),
          endsAt: at("2026-12-25T11:00:00.000Z"),
        }),
      ],
      range("2026-11-01T00:00:00.000Z", "2026-11-08T00:00:00.000Z"),
    );
    expect(dates(got)).toEqual(["2026-11-02"]);
    expect(got[0]?.startsAt.toISOString()).toBe("2026-12-25T10:00:00.000Z");
  });

  it("excludes an occurrence whose original time is outside the range even when its override moves it inside", () => {
    const s = series({ recurrence: weekly() });
    const got = expand(
      s,
      [
        override("2026-11-09", {
          startsAt: at("2026-11-03T10:00:00.000Z"),
          endsAt: at("2026-11-03T11:00:00.000Z"),
        }),
      ],
      range("2026-11-01T00:00:00.000Z", "2026-11-08T00:00:00.000Z"),
    );
    expect(dates(got)).toEqual(["2026-11-02"]);
  });

  it("returns occurrences in ascending original start, even when an override reorders their times", () => {
    const s = series({ recurrence: weekly() });
    const got = expand(
      s,
      [
        override("2026-11-02", {
          startsAt: at("2026-11-20T10:00:00.000Z"),
          endsAt: at("2026-11-20T11:00:00.000Z"),
        }),
      ],
      range("2026-11-01T00:00:00.000Z", "2026-11-17T00:00:00.000Z"),
    );
    expect(dates(got)).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
  });
});

describe("overrides (Block 5)", () => {
  const s = series({ recurrence: weekly() });
  const nov = range("2026-11-01T00:00:00.000Z", "2026-11-10T00:00:00.000Z");

  it("replaces only the non-null fields and keeps the series value for every null one", () => {
    const got = expand(s, [override("2026-11-02", { title: "Swim" })], nov);
    expect(serialise(got)[0]).toStrictEqual({
      seriesId: "s1",
      occurrenceDate: "2026-11-02",
      title: "Swim",
      kindId: "k1",
      startsAt: "2026-11-02T09:00:00.000Z",
      endsAt: "2026-11-02T10:00:00.000Z",
      allDay: false,
      location: null,
      notes: null,
    });
  });

  it("applies every overridable field when all are non-null", () => {
    const got = expand(
      s,
      [
        override("2026-11-09", {
          title: "T",
          kindId: "k2",
          startsAt: at("2026-11-09T12:00:00.000Z"),
          endsAt: at("2026-11-10T00:00:00.000Z"),
          allDay: true,
          location: "Pool",
          notes: "towel",
        }),
      ],
      nov,
    );
    expect(serialise(got)[1]).toStrictEqual({
      seriesId: "s1",
      occurrenceDate: "2026-11-09",
      title: "T",
      kindId: "k2",
      startsAt: "2026-11-09T12:00:00.000Z",
      endsAt: "2026-11-10T00:00:00.000Z",
      allDay: true,
      location: "Pool",
      notes: "towel",
    });
  });

  it("lets the last of two overrides for the same date win", () => {
    const got = expand(
      s,
      [
        override("2026-11-02", { title: "First" }),
        override("2026-11-02", { title: "Second" }),
      ],
      nov,
    );
    expect(got.map((o) => o.title)).toEqual(["Second", "Gym"]);
  });

  it("lets a later non-cancelling override replace an earlier cancellation for the same date", () => {
    const got = expand(
      s,
      [
        override("2026-11-02", { cancelled: true }),
        override("2026-11-02", { title: "Back on" }),
      ],
      nov,
    );
    expect(got.map((o) => o.title)).toEqual(["Back on", "Gym"]);
  });

  it("ignores an override whose date matches no occurrence (a Tuesday of a Monday series)", () => {
    const got = expand(
      s,
      [override("2026-11-03", { title: "Nope", cancelled: true })],
      nov,
    );
    expect(serialise(got)).toStrictEqual(serialise(expand(s, [], nov)));
    expect(dates(got)).toEqual(["2026-11-02", "2026-11-09"]);
  });

  it("matches an override by the original date only, never by the overridden start", () => {
    const got = expand(
      s,
      [
        override("2026-11-02", {
          startsAt: at("2026-11-09T09:00:00.000Z"),
          endsAt: at("2026-11-09T10:00:00.000Z"),
        }),
        override("2026-11-09", { title: "Ninth" }),
      ],
      nov,
    );
    expect(got.map((o) => [o.occurrenceDate, o.title])).toEqual([
      ["2026-11-02", "Gym"],
      ["2026-11-09", "Ninth"],
    ]);
  });
});

describe("errors and purity (Block 6)", () => {
  it("throws a RangeError for an unknown time zone", () => {
    const s = series({ recurrence: weekly(null, "Not/AZone") });
    expect(() =>
      expand(
        s,
        [],
        range("2026-10-01T00:00:00.000Z", "2026-12-01T00:00:00.000Z"),
      ),
    ).toThrow(RangeError);
  });

  it("does not mutate the series, the overrides or the range", () => {
    const s = series({ recurrence: weekly("2026-12-31") });
    const os = [
      override("2026-10-19", { cancelled: true }),
      override("2026-11-02", {
        title: "Moved",
        startsAt: at("2026-11-02T10:00:00.000Z"),
        endsAt: at("2026-11-02T11:00:00.000Z"),
      }),
    ];
    const r = range("2026-10-01T00:00:00.000Z", "2026-12-01T00:00:00.000Z");
    const before = structuredClone({ s, os, r });
    const got = expand(s, os, r);
    expect(got.length).toBeGreaterThan(0);
    expect({ s, os, r }).toStrictEqual(before);
  });
});
