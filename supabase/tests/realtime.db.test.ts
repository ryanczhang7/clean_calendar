// CAL-016 AC-1 (Contract, Block 2): after `supabase db reset`, the
// `supabase_realtime` publication streams exactly the four tables the client
// caches - events, event_overrides, kinds, reminders - and no other table of
// ours (app_config, push_subscriptions, capture_jobs stay out). Inspected
// through direct SQL as `postgres`. Needs a running local stack with the
// migrations applied (`pnpm exec supabase db reset`); on a machine without
// Docker the `db` gate is BLOCKED (project.conf), and CI judges this suite.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeSql, type LocalEnv, loadLocalEnv, sql } from "./helpers";

// Budget: as schema.db.test.ts - every statement is one local round trip;
// 30 s covers a cold `supabase status` in beforeAll and the pool's close.
const BUDGET_MS = 30_000;

let env: LocalEnv;

beforeAll(async () => {
  env = await loadLocalEnv();
}, BUDGET_MS);

afterAll(async () => {
  await closeSql();
}, BUDGET_MS);

describe("AC-1: the supabase_realtime publication", () => {
  it(
    "lists exactly event_overrides, events, kinds and reminders from public",
    async () => {
      const rows = await sql(env)<{ tablename: string }[]>`
        select tablename from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public'
        order by 1`;
      expect(rows.map((r) => r.tablename)).toStrictEqual([
        "event_overrides",
        "events",
        "kinds",
        "reminders",
      ]);
    },
    BUDGET_MS,
  );

  it(
    "exists once and is not a FOR ALL TABLES publication",
    async () => {
      const rows = await sql(env)<{ pubname: string; puballtables: boolean }[]>`
        select pubname, puballtables from pg_publication
        where pubname = 'supabase_realtime'`;
      expect(rows.map((r) => ({ ...r }))).toStrictEqual([
        { pubname: "supabase_realtime", puballtables: false },
      ]);
    },
    BUDGET_MS,
  );
});
