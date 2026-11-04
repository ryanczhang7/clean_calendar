import { assertEquals } from "@std/assert";
import {
  expand,
  type Occurrence,
  type Recurrence,
} from "../../../shared/recurrence.ts";
import { WINDOW_MS } from "./handler.ts";
import {
  expansionRange,
  liveTemplate,
  LOOKAHEAD_MS,
  LOOKBACK_MS,
  type NewReminder,
  type OccurrenceReminder,
  type OverrideRow,
  plan,
  type SeriesReminderRow,
  type SeriesRow,
  toOverride,
  toRecurrence,
  toSeries,
} from "./materialise.ts";

// CAL-029 Contract Block 2: materialise.ts is pure - rows in, a plan out. Every
// instant below is read out of the Contract (Blocks 2, 5 and 6), never
// calibrated, and every zone is the series' recurrence.tz, so nothing depends on
// the host zone. Expected occurrences are written as literals rather than
// computed with `expand`, so a plan that hands `expand` the wrong series (the
// wrong zone, the wrong start) disagrees with something independent of it.

const HOUR = 3_600_000;
const MIN = 60_000;

const UTC_WEEKLY: Recurrence = { freq: "weekly", until: null, tz: "UTC" };
const UTC_DAILY: Recurrence = { freq: "daily", until: null, tz: "UTC" };
const LONDON_WEEKLY: Recurrence = {
  freq: "weekly",
  until: null,
  tz: "Europe/London",
};

/** Monday 2 November 2026 08:00Z - Block 6's run. */
const MON_0800 = new Date("2026-11-02T08:00:00.000Z");

// ---------------------------------------------------------------- fixtures

function template(
  id: string,
  minutesBefore: number,
  deletedAt: string | null = null,
): SeriesReminderRow {
  return {
    id,
    minutes_before: minutesBefore,
    sent_at: null,
    occurrence_date: null,
    deleted_at: deletedAt,
  };
}

function materialised(
  id: string,
  occurrenceDate: string,
  minutesBefore: number,
  sentAt: string | null = null,
  deletedAt: string | null = null,
): SeriesReminderRow {
  return {
    id,
    minutes_before: minutesBefore,
    sent_at: sentAt,
    occurrence_date: occurrenceDate,
    deleted_at: deletedAt,
  };
}

function override(
  occurrenceDate: string,
  fields: Partial<OverrideRow> = {},
): OverrideRow {
  return {
    occurrence_date: occurrenceDate,
    cancelled: false,
    title: null,
    kind_id: null,
    starts_at: null,
    ends_at: null,
    all_day: null,
    location: null,
    notes: null,
    ...fields,
  };
}

function seriesRow(
  fields: Partial<SeriesRow> & Pick<SeriesRow, "id" | "starts_at" | "ends_at">,
): SeriesRow {
  return {
    title: `Title ${fields.id}`,
    kind_id: "kind-1",
    all_day: false,
    location: null,
    notes: null,
    recurrence: UTC_WEEKLY,
    reminders: [],
    event_overrides: [],
    ...fields,
  };
}

/** The occurrence `expand` returns for `row` on `date`, written out by hand. */
function occ(
  row: SeriesRow,
  date: string,
  startsAt: string,
  endsAt: string,
  fields: Partial<Occurrence> = {},
): Occurrence {
  return {
    seriesId: row.id,
    occurrenceDate: date,
    title: row.title,
    kindId: row.kind_id,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
    allDay: row.all_day,
    location: row.location,
    notes: row.notes,
    ...fields,
  };
}

/** Block 6: weekly, first occurrence Monday 2 November 2026 08:30Z, 30 min. */
const WEEKLY = seriesRow({
  id: "s-weekly",
  starts_at: "2026-11-02T08:30:00+00:00",
  ends_at: "2026-11-02T09:30:00+00:00",
  recurrence: UTC_WEEKLY,
  reminders: [template("t-weekly", 30)],
});

/** Block 6: the same, daily. */
const DAILY = seriesRow({
  id: "s-daily",
  starts_at: "2026-11-02T08:30:00+00:00",
  ends_at: "2026-11-02T09:30:00+00:00",
  recurrence: UTC_DAILY,
  reminders: [template("t-daily", 30)],
});

/** Block 5: weekly 09:00 London from Monday 19 October 2026 (BST). */
const LONDON = seriesRow({
  id: "s-london",
  starts_at: "2026-10-19T08:00:00+00:00",
  ends_at: "2026-10-19T09:00:00+00:00",
  recurrence: LONDON_WEEKLY,
  reminders: [template("t-london", 30)],
});

// ================================================================ constants

Deno.test("LOOKAHEAD_MS is the 48 hours AC-1 names", () => {
  assertEquals(LOOKAHEAD_MS, 48 * HOUR);
});

Deno.test("LOOKBACK_MS is five minutes, equal to the due window WINDOW_MS", () => {
  assertEquals(LOOKBACK_MS, 5 * MIN);
  assertEquals(LOOKBACK_MS, WINDOW_MS);
});

// ================================================================ expansionRange

Deno.test("expansionRange is [now - 5 min, now + 48 h): Monday 08:00 gives 07:55 Monday to 08:00 Wednesday", () => {
  assertEquals(expansionRange(MON_0800), {
    start: new Date("2026-11-02T07:55:00.000Z"),
    end: new Date("2026-11-04T08:00:00.000Z"),
  });
});

Deno.test("expansionRange for Block 5's Saturday run is [09:55Z Saturday, 10:00Z Monday)", () => {
  const now = new Date("2026-10-24T10:00:00.000Z");
  assertEquals(expansionRange(now), {
    start: new Date("2026-10-24T09:55:00.000Z"),
    end: new Date("2026-10-26T10:00:00.000Z"),
  });
  assertEquals(
    now.toISOString(),
    "2026-10-24T10:00:00.000Z",
    "expansionRange changed the Date it was given",
  );
});

// ================================================================ toRecurrence

Deno.test("toRecurrence accepts daily, weekly and yearly with a tz and an until that is a date or null", () => {
  assertEquals(toRecurrence({ freq: "daily", until: null, tz: "UTC" }), {
    freq: "daily",
    until: null,
    tz: "UTC",
  });
  assertEquals(
    toRecurrence({ freq: "weekly", until: "2026-12-31", tz: "Europe/London" }),
    { freq: "weekly", until: "2026-12-31", tz: "Europe/London" },
  );
  assertEquals(
    toRecurrence({ freq: "yearly", until: null, tz: "America/Chicago" }),
    { freq: "yearly", until: null, tz: "America/Chicago" },
  );
});

Deno.test("toRecurrence keeps only freq, until and tz - an extra jsonb key does not reach the expander", () => {
  assertEquals(
    toRecurrence({ freq: "weekly", until: null, tz: "UTC", byDay: ["MO"] }),
    { freq: "weekly", until: null, tz: "UTC" },
  );
});

Deno.test("toRecurrence rejects an array, a missing tz, freq monthly, and every other malformed value as null", () => {
  const cases: [string, unknown][] = [
    ["an array", [{ freq: "weekly", until: null, tz: "UTC" }]],
    ["a missing tz", { freq: "weekly", until: null }],
    ['freq "monthly"', { freq: "monthly", until: null, tz: "UTC" }],
    ["a missing freq", { until: null, tz: "UTC" }],
    ["a numeric tz", { freq: "weekly", until: null, tz: 0 }],
    ["a numeric until", { freq: "weekly", until: 20261231, tz: "UTC" }],
    ["a missing until", { freq: "weekly", tz: "UTC" }],
    ["null", null],
    ["a string", "weekly"],
    ["a number", 7],
    ["an empty array", []],
  ];
  for (const [label, value] of cases) {
    assertEquals(toRecurrence(value), null, `${label} was accepted`);
  }
});

// ================================================================ toSeries / toOverride

Deno.test("toSeries maps the row to camel case, parses the instants, and carries the validated recurrence", () => {
  const row = seriesRow({
    id: "s-1",
    title: "Gym",
    kind_id: "kind-9",
    starts_at: "2026-10-19T08:00:00+00:00",
    ends_at: "2026-10-19T09:00:00+00:00",
    all_day: false,
    location: "Leisure centre",
    notes: "bring a lock",
    recurrence: { freq: "weekly", until: null, tz: "Europe/London" },
  });
  assertEquals(toSeries(row, LONDON_WEEKLY), {
    id: "s-1",
    title: "Gym",
    kindId: "kind-9",
    startsAt: new Date("2026-10-19T08:00:00.000Z"),
    endsAt: new Date("2026-10-19T09:00:00.000Z"),
    allDay: false,
    location: "Leisure centre",
    notes: "bring a lock",
    recurrence: { freq: "weekly", until: null, tz: "Europe/London" },
  });
  const allDay = toSeries(
    seriesRow({
      id: "s-2",
      starts_at: "2026-11-02T00:00:00+00:00",
      ends_at: "2026-11-03T00:00:00+00:00",
      all_day: true,
    }),
    UTC_DAILY,
  );
  assertEquals(allDay.allDay, true);
  assertEquals(allDay.recurrence, UTC_DAILY);
  assertEquals(allDay.location, null);
  assertEquals(allDay.notes, null);
});

Deno.test("toOverride maps to camel case, parses instants, and keeps null as null (null = keep the series value)", () => {
  assertEquals(
    toOverride(override("2026-11-02", {
      title: "Gym (late)",
      kind_id: "kind-2",
      starts_at: "2026-11-02T10:00:00+00:00",
      ends_at: "2026-11-02T11:00:00+00:00",
      all_day: false,
      location: "Pool",
      notes: "moved",
    })),
    {
      occurrenceDate: "2026-11-02",
      cancelled: false,
      title: "Gym (late)",
      kindId: "kind-2",
      startsAt: new Date("2026-11-02T10:00:00.000Z"),
      endsAt: new Date("2026-11-02T11:00:00.000Z"),
      allDay: false,
      location: "Pool",
      notes: "moved",
    },
  );
  assertEquals(toOverride(override("2026-11-03", { cancelled: true })), {
    occurrenceDate: "2026-11-03",
    cancelled: true,
    title: null,
    kindId: null,
    startsAt: null,
    endsAt: null,
    allDay: null,
    location: null,
    notes: null,
  });
});

// ================================================================ liveTemplate

Deno.test("liveTemplate is the one embedded reminder with no occurrence_date and no deleted_at", () => {
  const tmpl = template("t-1", 30);
  const row = (reminders: SeriesReminderRow[]) =>
    seriesRow({
      id: "s-1",
      starts_at: "2026-11-02T08:30:00+00:00",
      ends_at: "2026-11-02T09:30:00+00:00",
      reminders,
    });
  assertEquals(liveTemplate(row([])), null, "a series with no reminder");
  assertEquals(
    liveTemplate(row([materialised("m-1", "2026-11-02", 30)])),
    null,
    "a materialised row is not a template",
  );
  assertEquals(
    liveTemplate(row([template("t-1", 30, "2026-11-01T12:00:00+00:00")])),
    null,
    "AC-5: a soft-deleted template is no template",
  );
  assertEquals(
    liveTemplate(row([
      materialised("m-1", "2026-11-02", 15),
      tmpl,
      materialised("m-2", "2026-11-09", 15),
    ])),
    tmpl,
  );
});

// ================================================================ plan: AC-1

Deno.test("AC-1: a weekly series run at Monday 08:00 inserts one row, for Monday's 08:30 occurrence, with the template's minutes_before", () => {
  assertEquals(plan([WEEKLY], MON_0800), {
    inserts: [
      {
        event_id: "s-weekly",
        occurrence_date: "2026-11-02",
        minutes_before: 30,
      },
    ],
    candidates: [],
    skipped: [],
  });
});

Deno.test("AC-1: a daily series run at Monday 08:00 inserts Monday and Tuesday 08:30, and not Wednesday 08:30, which is on the range end", () => {
  assertEquals(plan([DAILY], MON_0800).inserts, [
    { event_id: "s-daily", occurrence_date: "2026-11-02", minutes_before: 30 },
    { event_id: "s-daily", occurrence_date: "2026-11-03", minutes_before: 30 },
  ]);
});

Deno.test("AC-1: a second run inserts nothing - every occurrence already has a row, a soft-deleted one and a sent one included", () => {
  const row: SeriesRow = {
    ...DAILY,
    reminders: [
      template("t-daily", 30),
      materialised(
        "m-mon",
        "2026-11-02",
        30,
        null,
        "2026-11-01T20:00:00+00:00",
      ),
      materialised("m-tue", "2026-11-03", 30, "2026-11-03T08:00:04+00:00"),
    ],
  };
  const p = plan([row], MON_0800);
  assertEquals(
    p.inserts,
    [],
    "a row that exists in any state was inserted again",
  );
  assertEquals(p.skipped, []);
  assertEquals(
    p.candidates.map((c: OccurrenceReminder) => c.id),
    ["m-tue"],
    "the soft-deleted row is not a candidate; the sent one is (isDue decides)",
  );
});

Deno.test("AC-1: inserts only the occurrences without a row, keeping the ones that have one as candidates", () => {
  const row: SeriesRow = {
    ...DAILY,
    reminders: [
      template("t-daily", 30),
      materialised("m-mon", "2026-11-02", 30),
    ],
  };
  const p = plan([row], MON_0800);
  assertEquals(p.inserts, [
    { event_id: "s-daily", occurrence_date: "2026-11-03", minutes_before: 30 },
  ]);
  assertEquals(p.candidates.map((c: OccurrenceReminder) => c.id), ["m-mon"]);
});

Deno.test("AC-1: a candidate is the row's id, minutes_before and sent_at joined to its occurrence", () => {
  const row: SeriesRow = {
    ...WEEKLY,
    location: "Leisure centre",
    reminders: [
      template("t-weekly", 30),
      materialised("m-mon", "2026-11-02", 30, "2026-10-26T08:00:02+00:00"),
    ],
  };
  assertEquals(plan([row], MON_0800).candidates, [
    {
      id: "m-mon",
      minutes_before: 30,
      sent_at: "2026-10-26T08:00:02+00:00",
      occurrence: occ(
        row,
        "2026-11-02",
        "2026-11-02T08:30:00.000Z",
        "2026-11-02T09:30:00.000Z",
      ),
    },
  ]);
});

Deno.test("AC-1 / PO decision 2: a candidate's minutes_before is the materialised row's, not the template's", () => {
  const row: SeriesRow = {
    ...WEEKLY,
    reminders: [
      template("t-weekly", 30),
      materialised("m-mon", "2026-11-02", 15),
    ],
  };
  const p = plan([row], MON_0800);
  assertEquals(
    p.candidates.map((c: OccurrenceReminder) => [c.id, c.minutes_before]),
    [["m-mon", 15]],
  );
  assertEquals(p.inserts, []);
});

Deno.test("AC-1: a materialised row whose occurrence is outside the range is not a candidate", () => {
  const row: SeriesRow = {
    ...DAILY,
    reminders: [
      template("t-daily", 30),
      materialised("m-sun", "2026-11-01", 30),
      materialised("m-mon", "2026-11-02", 30),
      materialised("m-tue", "2026-11-03", 30),
      materialised("m-wed", "2026-11-04", 30),
    ],
  };
  const p = plan([row], MON_0800);
  assertEquals(p.candidates.map((c: OccurrenceReminder) => c.id), [
    "m-mon",
    "m-tue",
  ]);
  assertEquals(p.inserts, []);
});

Deno.test("AC-1 (Block 6 lookback control): a daily all-day series is materialised at 08:00 though today's occurrence started at midnight", () => {
  const allDay = seriesRow({
    id: "s-all-day",
    starts_at: "2026-11-02T00:00:00+00:00",
    ends_at: "2026-11-03T00:00:00+00:00",
    all_day: true,
    recurrence: UTC_DAILY,
    reminders: [template("t-all-day", -540)],
  });
  assertEquals(plan([allDay], MON_0800).inserts, [
    {
      event_id: "s-all-day",
      occurrence_date: "2026-11-02",
      minutes_before: -540,
    },
    {
      event_id: "s-all-day",
      occurrence_date: "2026-11-03",
      minutes_before: -540,
    },
    {
      event_id: "s-all-day",
      occurrence_date: "2026-11-04",
      minutes_before: -540,
    },
  ]);
  const later = plan(
    [{
      ...allDay,
      reminders: [
        template("t-all-day", -540),
        materialised("m-mon", "2026-11-02", -540),
      ],
    }],
    new Date("2026-11-02T09:00:00.000Z"),
  );
  assertEquals(later.candidates.map((c: OccurrenceReminder) => c.id), [
    "m-mon",
  ]);
  assertEquals(
    later.candidates[0]!.occurrence.startsAt.toISOString(),
    "2026-11-02T00:00:00.000Z",
  );
});

Deno.test("AC-1 (lookback control): an occurrence that ended 2 minutes ago is still found, so its reminder can fire inside the due window", () => {
  // 08:57-08:58, minutes_before 0, run at 09:00: fires 08:57, inside
  // [08:55, 09:00]. A range starting at `now` would not return it.
  const row = seriesRow({
    id: "s-minute",
    starts_at: "2026-11-02T08:57:00+00:00",
    ends_at: "2026-11-02T08:58:00+00:00",
    recurrence: UTC_DAILY,
    reminders: [
      template("t-minute", 0),
      materialised("m-mon", "2026-11-02", 0),
    ],
  });
  const p = plan([row], new Date("2026-11-02T09:00:00.000Z"));
  assertEquals(p.candidates.map((c: OccurrenceReminder) => c.id), ["m-mon"]);
  assertEquals(p.inserts.map((i: NewReminder) => i.occurrence_date), [
    "2026-11-03",
    "2026-11-04",
  ]);
});

Deno.test("AC-1: several series are planned in row order, each series' inserts in occurrence order", () => {
  const p = plan([DAILY, WEEKLY], MON_0800);
  assertEquals(p.inserts, [
    { event_id: "s-daily", occurrence_date: "2026-11-02", minutes_before: 30 },
    { event_id: "s-daily", occurrence_date: "2026-11-03", minutes_before: 30 },
    { event_id: "s-weekly", occurrence_date: "2026-11-02", minutes_before: 30 },
  ]);
});

Deno.test("plan of no series is empty", () => {
  assertEquals(plan([], MON_0800), {
    inserts: [],
    candidates: [],
    skipped: [],
  });
});

// ================================================================ plan: AC-2

Deno.test("AC-2: a cancelled occurrence gets no row, and a row materialised before the cancellation is not a candidate", () => {
  const row: SeriesRow = {
    ...DAILY,
    reminders: [
      template("t-daily", 30),
      materialised("m-mon", "2026-11-02", 30),
      materialised("m-tue", "2026-11-03", 30),
    ],
    event_overrides: [override("2026-11-03", { cancelled: true })],
  };
  const p = plan([row], MON_0800);
  assertEquals(p.inserts, [], "the cancelled Tuesday was inserted");
  assertEquals(
    p.candidates.map((c: OccurrenceReminder) => c.id),
    ["m-mon"],
    "Tuesday's row was a candidate after Tuesday was cancelled",
  );
  const fresh = plan(
    [{ ...row, reminders: [template("t-daily", 30)] }],
    MON_0800,
  );
  assertEquals(fresh.inserts, [
    { event_id: "s-daily", occurrence_date: "2026-11-02", minutes_before: 30 },
  ]);
});

Deno.test("AC-2: an occurrence moved to 10:00 is still materialised, and its candidate carries the moved start", () => {
  const moved = seriesRow({
    id: "s-moved",
    starts_at: "2026-11-02T09:00:00+00:00",
    ends_at: "2026-11-02T10:00:00+00:00",
    recurrence: UTC_WEEKLY,
    reminders: [template("t-moved", 30)],
    event_overrides: [override("2026-11-02", {
      starts_at: "2026-11-02T10:00:00+00:00",
      ends_at: "2026-11-02T11:00:00+00:00",
      title: "Gym (late)",
    })],
  });
  assertEquals(plan([moved], MON_0800).inserts, [
    { event_id: "s-moved", occurrence_date: "2026-11-02", minutes_before: 30 },
  ]);
  const withRow: SeriesRow = {
    ...moved,
    reminders: [
      template("t-moved", 30),
      materialised("m-mon", "2026-11-02", 30),
    ],
  };
  assertEquals(plan([withRow], MON_0800).candidates, [
    {
      id: "m-mon",
      minutes_before: 30,
      sent_at: null,
      occurrence: occ(
        moved,
        "2026-11-02",
        "2026-11-02T10:00:00.000Z",
        "2026-11-02T11:00:00.000Z",
        { title: "Gym (late)" },
      ),
    },
  ]);
});

// ================================================================ plan: AC-4

Deno.test("AC-4: run Saturday 24 October 10:00Z, a 09:00 London weekly series inserts Monday 26 October (after the clocks go back)", () => {
  assertEquals(plan([LONDON], new Date("2026-10-24T10:00:00.000Z")), {
    inserts: [
      {
        event_id: "s-london",
        occurrence_date: "2026-10-26",
        minutes_before: 30,
      },
    ],
    candidates: [],
    skipped: [],
  });
});

Deno.test("AC-4: run Monday 26 October 08:31Z with that row embedded, the candidate's occurrence starts 09:00 GMT = 09:00Z, not 08:00Z", () => {
  const row: SeriesRow = {
    ...LONDON,
    reminders: [
      template("t-london", 30),
      materialised("m-26", "2026-10-26", 30),
    ],
  };
  const p = plan([row], new Date("2026-10-26T08:31:00.000Z"));
  assertEquals(p.inserts, []);
  assertEquals(p.candidates, [
    {
      id: "m-26",
      minutes_before: 30,
      sent_at: null,
      occurrence: occ(
        row,
        "2026-10-26",
        "2026-10-26T09:00:00.000Z",
        "2026-10-26T10:00:00.000Z",
      ),
    },
  ]);
});

// ================================================================ plan: AC-5

Deno.test("AC-5: a series whose template is soft-deleted inserts nothing and has no candidates, even with a live materialised row", () => {
  const row: SeriesRow = {
    ...DAILY,
    reminders: [
      template("t-daily", 30, "2026-11-01T18:00:00+00:00"),
      materialised("m-mon", "2026-11-02", 30),
    ],
  };
  assertEquals(plan([row], MON_0800), {
    inserts: [],
    candidates: [],
    skipped: [],
  });
});

Deno.test("AC-5: a series with no reminder at all contributes nothing and is not reported as skipped", () => {
  assertEquals(plan([{ ...DAILY, reminders: [] }], MON_0800), {
    inserts: [],
    candidates: [],
    skipped: [],
  });
});

Deno.test("AC-5: a soft-deleted template does not stop the next series being planned", () => {
  const dead: SeriesRow = {
    ...DAILY,
    id: "s-dead",
    reminders: [template("t-dead", 30, "2026-11-01T18:00:00+00:00")],
  };
  assertEquals(plan([dead, WEEKLY], MON_0800).inserts, [
    { event_id: "s-weekly", occurrence_date: "2026-11-02", minutes_before: 30 },
  ]);
});

// ================================================================ plan: skipped

Deno.test('a series whose recurrence is malformed is skipped with reason "recurrence", contributes nothing, and the next series is planned', () => {
  const bad: SeriesRow = {
    ...DAILY,
    id: "s-bad",
    recurrence: { freq: "monthly", until: null, tz: "UTC" },
    reminders: [template("t-bad", 30), materialised("m-bad", "2026-11-02", 30)],
  };
  assertEquals(plan([bad, WEEKLY], MON_0800), {
    inserts: [
      {
        event_id: "s-weekly",
        occurrence_date: "2026-11-02",
        minutes_before: 30,
      },
    ],
    candidates: [],
    skipped: [{ seriesId: "s-bad", reason: "recurrence" }],
  });
});

Deno.test("a series in an unknown zone is skipped with the expander's message, contributes nothing, and the next series is planned", () => {
  const mars: SeriesRow = {
    ...DAILY,
    id: "s-mars",
    recurrence: { freq: "daily", until: null, tz: "Mars/Olympus" },
    reminders: [
      template("t-mars", 30),
      materialised("m-mars", "2026-11-02", 30),
    ],
  };
  // The reason is String(err.message) of what `expand` throws; read it from
  // the expander itself rather than pinning a runtime's wording.
  let message = "";
  try {
    expand(
      {
        id: "s-mars",
        title: "x",
        kindId: "k",
        startsAt: new Date("2026-11-02T08:30:00Z"),
        endsAt: new Date("2026-11-02T09:30:00Z"),
        allDay: false,
        location: null,
        notes: null,
        recurrence: { freq: "daily", until: null, tz: "Mars/Olympus" },
      },
      [],
      { start: MON_0800, end: new Date("2026-11-04T08:00:00Z") },
    );
  } catch (err) {
    message = String((err as Error).message);
  }
  assertEquals(
    message.includes("Mars/Olympus"),
    true,
    `expand did not throw a message naming the zone: "${message}"`,
  );
  assertEquals(plan([mars, WEEKLY], MON_0800), {
    inserts: [
      {
        event_id: "s-weekly",
        occurrence_date: "2026-11-02",
        minutes_before: 30,
      },
    ],
    candidates: [],
    skipped: [{ seriesId: "s-mars", reason: message }],
  });
});
