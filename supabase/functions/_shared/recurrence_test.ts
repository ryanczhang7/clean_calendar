import { assertEquals } from "@std/assert";
import {
  expand,
  type Occurrence,
  type Override,
  type Series,
} from "../../../shared/recurrence.ts";

// CAL-023 AC-7: the same fixture the Vitest suite runs, under Deno. One
// Deno.test per case; every instant is UTC and every zone is recurrence.tz,
// so nothing depends on the host zone.

type WireOccurrence = Omit<Occurrence, "startsAt" | "endsAt"> & {
  startsAt: string;
  endsAt: string;
};

type FixtureCase = {
  name: string;
  series: Omit<Series, "startsAt" | "endsAt"> & {
    startsAt: string;
    endsAt: string;
  };
  overrides: (Omit<Override, "startsAt" | "endsAt"> & {
    startsAt: string | null;
    endsAt: string | null;
  })[];
  range: { start: string; end: string };
  expected: WireOccurrence[];
};

const fixture: { cases: FixtureCase[] } = JSON.parse(
  await Deno.readTextFile(
    new URL("../../../shared/tests/recurrence-fixtures.json", import.meta.url),
  ),
);

const atOrNull = (iso: string | null): Date | null =>
  iso === null ? null : new Date(iso);

function serialise(occurrences: Occurrence[]): WireOccurrence[] {
  return occurrences.map((o) => ({
    ...o,
    startsAt: o.startsAt.toISOString(),
    endsAt: o.endsAt.toISOString(),
  }));
}

Deno.test("recurrence fixture carries a case for every one of AC-1 to AC-6", () => {
  const missing = ["AC-1", "AC-2", "AC-3", "AC-4", "AC-5", "AC-6"].filter(
    (ac) => !fixture.cases.some((c) => c.name.includes(ac)),
  );
  assertEquals(missing, []);
});

for (const c of fixture.cases) {
  Deno.test(`recurrence fixture: ${c.name}`, () => {
    const got = expand(
      {
        ...c.series,
        startsAt: new Date(c.series.startsAt),
        endsAt: new Date(c.series.endsAt),
      },
      c.overrides.map((o) => ({
        ...o,
        startsAt: atOrNull(o.startsAt),
        endsAt: atOrNull(o.endsAt),
      })),
      { start: new Date(c.range.start), end: new Date(c.range.end) },
    );
    assertEquals(serialise(got), c.expected);
  });
}
