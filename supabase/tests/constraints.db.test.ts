// CAL-034: the CHECK constraints, the single app_config row and the
// reminders -> events cascade (audit epic-01-2026-10-15, mutants M11 to M15 and
// M18). Every write goes through the service client, which bypasses RLS, so a
// refusal here can only come from the schema. Each refusal is pinned to its
// exact SQLSTATE (23514 check_violation): an error from a misspelt column or a
// missing table would otherwise satisfy "it was refused". Needs a running local
// stack with the migrations applied (`pnpm exec supabase db reset`).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  closeSql,
  insertFixture,
  insertParents,
  type LocalEnv,
  loadLocalEnv,
  rowFor,
  serviceClient,
  sql,
  truncateClientTables,
} from "./helpers";

// Budget: every statement here is one local round trip, as in
// schema.db.test.ts; 30 s is far above any of them and covers a cold
// `supabase status` in beforeAll.
const BUDGET_MS = 30_000;

/** Postgres SQLSTATE check_violation, which PostgREST passes through as `code`. */
const CHECK_VIOLATION = "23514";

let env: LocalEnv;

beforeAll(async () => {
  env = await loadLocalEnv();
}, BUDGET_MS);

afterAll(async () => {
  await closeSql();
}, BUDGET_MS);

beforeEach(async () => {
  await truncateClientTables(env);
}, BUDGET_MS);

/** Insert through the service client; no `.single()`, so a refusal is `error`. */
async function insert(table: string, row: Record<string, unknown>) {
  const { data, error } = await serviceClient(env)
    .from(table)
    .insert(row)
    .select("id");
  return { data, code: error?.code ?? null, error };
}

async function eventRow(
  overrides: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { kindId } = await insertParents(env, "events");
  return { ...rowFor("events", { kindId }), ...overrides };
}

describe("AC-1: an event must have positive length", () => {
  it("an event whose end equals its start is refused as a check violation (CAL-034 AC-1)", async () => {
    const row = await eventRow({
      starts_at: "2026-11-01T09:00:00Z",
      ends_at: "2026-11-01T09:00:00Z",
    });
    const { code } = await insert("events", row);
    expect(code).toBe(CHECK_VIOLATION);
  });

  it("an event ending one second after its start is accepted (CAL-034 AC-1)", async () => {
    const row = await eventRow({
      starts_at: "2026-11-01T09:00:00Z",
      ends_at: "2026-11-01T09:00:01Z",
    });
    const { data, error } = await insert("events", row);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});

describe("AC-2: a kind name is 1 to 32 characters after trimming", () => {
  for (const [label, name] of [
    ["an empty name", ""],
    ["a name of only spaces", "   "],
    ["a 33-character name", "a".repeat(33)],
  ] as const) {
    it(`${label} is refused as a check violation (CAL-034 AC-2)`, async () => {
      const { code } = await insert("kinds", { ...rowFor("kinds", {}), name });
      expect(code).toBe(CHECK_VIOLATION);
    });
  }

  it("a 32-character name is accepted (CAL-034 AC-2)", async () => {
    const { data, error } = await insert("kinds", {
      ...rowFor("kinds", {}),
      name: "a".repeat(32),
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});

describe("AC-3: an event's origin is 'manual' or 'capture'", () => {
  it("an event with origin 'other' is refused as a check violation (CAL-034 AC-3)", async () => {
    const { code } = await insert(
      "events",
      await eventRow({ origin: "other" }),
    );
    expect(code).toBe(CHECK_VIOLATION);
  });

  it("an event with origin 'capture' is accepted (CAL-034 AC-3)", async () => {
    const { data, error } = await insert(
      "events",
      await eventRow({ origin: "capture" }),
    );
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});

describe("AC-4: a kind's colours are #rrggbb hex", () => {
  for (const column of ["color_light", "color_dark"] as const) {
    it(`${column} '#12345' and 'red' are each refused as a check violation (CAL-034 AC-4)`, async () => {
      const codes: (string | null)[] = [];
      for (const value of ["#12345", "red"]) {
        const { code } = await insert("kinds", {
          ...rowFor("kinds", {}),
          [column]: value,
        });
        codes.push(code);
      }
      expect(codes).toEqual([CHECK_VIOLATION, CHECK_VIOLATION]);
    });
  }
});

describe("AC-5: app_config holds exactly one row", () => {
  it("a second app_config row with singleton = false is refused and the seeded row stays alone (CAL-034 AC-5)", async () => {
    try {
      const { code } = await insert("app_config", {
        owner_email: "second@example.com",
        singleton: false,
      });
      const counts = await sql(env)<{ n: number }[]>`
        select count(*)::int as n from public.app_config`;
      expect({ code, rows: counts.map((r) => r.n) }).toEqual({
        code: CHECK_VIOLATION,
        rows: [1],
      });
    } finally {
      // app_config is not a client table, so truncateClientTables never
      // touches it: a row a broken constraint let in must not outlive this test.
      await sql(env)`delete from public.app_config where singleton = false`;
    }
  });
});

describe("AC-6: hard-deleting an event removes its reminders", () => {
  it("deleting an event that has a reminder succeeds and leaves no reminder behind (CAL-034 AC-6)", async () => {
    const reminder = await insertFixture(env, "reminders");
    const eventId = reminder.event_id as string;
    const { data, error } = await serviceClient(env)
      .from("events")
      .delete()
      .eq("id", eventId)
      .select("id");
    expect(error?.code ?? null).toBeNull();
    expect(data).toHaveLength(1);
    const counts = await sql(env)<{ n: number }[]>`
      select count(*)::int as n from public.reminders where event_id = ${eventId}`;
    expect(counts.map((r) => r.n)).toEqual([0]);
  });
});
