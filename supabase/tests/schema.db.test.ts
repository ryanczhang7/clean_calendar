// CAL-004 AC-1 (shape of the seven tables, the uniqueness rules, RLS enabled,
// the policies and the predicate) and AC-6 (trigger-maintained updated_at),
// inspected through direct SQL as `postgres`. Needs a running local stack
// with the migration applied (`pnpm exec supabase db reset`).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ALL_TABLES,
  CLIENT_TABLES,
  closeSql,
  insertFixture,
  insertParents,
  LOOKALIKE_EMAIL,
  type LocalEnv,
  loadLocalEnv,
  OTHER_EMAIL,
  OWNER_EMAIL,
  rowFor,
  serviceClient,
  sql,
  truncateClientTables,
} from "./helpers";

// Budget: every statement here is one local round trip (measured locally,
// 2026-10-14, see the story's Handoff); 30 s is far above any of them and
// covers a cold `supabase status` in beforeAll.
const BUDGET_MS = 30_000;

type Col = [name: string, dataType: string, nullable: "YES" | "NO"];

const UUID = "uuid";
const TS = "timestamp with time zone";
const TEXT = "text";
const INT = "integer";
const BOOL = "boolean";
const JSONB = "jsonb";
const DATE = "date";

const COMMON: Col[] = [
  ["id", UUID, "NO"],
  ["created_at", TS, "NO"],
  ["updated_at", TS, "NO"],
];

/** The Contract's column table, verbatim: name, data_type, is_nullable. */
const COLUMNS: Record<(typeof ALL_TABLES)[number], Col[]> = {
  app_config: [
    ...COMMON,
    ["owner_email", TEXT, "NO"],
    ["singleton", BOOL, "NO"],
  ],
  kinds: [
    ...COMMON,
    ["name", TEXT, "NO"],
    ["color_light", TEXT, "NO"],
    ["color_dark", TEXT, "NO"],
    ["sort_order", INT, "NO"],
    ["is_default", BOOL, "NO"],
    ["deleted_at", TS, "YES"],
  ],
  events: [
    ...COMMON,
    ["title", TEXT, "NO"],
    ["kind_id", UUID, "NO"],
    ["starts_at", TS, "NO"],
    ["ends_at", TS, "NO"],
    ["all_day", BOOL, "NO"],
    ["location", TEXT, "YES"],
    ["notes", TEXT, "YES"],
    ["recurrence", JSONB, "YES"],
    ["origin", TEXT, "NO"],
    ["capture_job_id", UUID, "YES"],
    ["deleted_at", TS, "YES"],
  ],
  event_overrides: [
    ...COMMON,
    ["event_id", UUID, "NO"],
    ["occurrence_date", DATE, "NO"],
    ["cancelled", BOOL, "NO"],
    ["title", TEXT, "YES"],
    ["kind_id", UUID, "YES"],
    ["starts_at", TS, "YES"],
    ["ends_at", TS, "YES"],
    ["all_day", BOOL, "YES"],
    ["location", TEXT, "YES"],
    ["notes", TEXT, "YES"],
  ],
  reminders: [
    ...COMMON,
    ["event_id", UUID, "NO"],
    ["minutes_before", INT, "NO"],
    ["sent_at", TS, "YES"],
    ["occurrence_date", DATE, "YES"],
  ],
  push_subscriptions: [
    ...COMMON,
    ["endpoint", TEXT, "NO"],
    ["p256dh", TEXT, "NO"],
    ["auth", TEXT, "NO"],
    ["user_agent", TEXT, "YES"],
    ["last_seen_at", TS, "NO"],
  ],
  capture_jobs: [
    ...COMMON,
    ["input_kind", TEXT, "NO"],
    ["input_hash", TEXT, "NO"],
    ["model", TEXT, "NO"],
    ["proposal", JSONB, "YES"],
    ["confidence", JSONB, "YES"],
    ["status", TEXT, "NO"],
    ["error", TEXT, "YES"],
    ["latency_ms", INT, "YES"],
  ],
};

const byName = (a: Col, b: Col) => a[0].localeCompare(b[0]);

// pg_get_constraintdef / pg_get_expr qualify a name only when it is not on the
// session search_path; strip the schema so the pin is about the definition.
const unq = (s: string | null): string | null =>
  s === null ? null : s.replaceAll("public.", "");

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

describe("AC-1: the seven tables and their columns", () => {
  it("public holds exactly the seven tables the data model names", async () => {
    const rows = await sql(env)<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name`;
    expect(rows.map((r) => r.table_name)).toEqual([...ALL_TABLES].sort());
  });

  for (const table of ALL_TABLES) {
    it(`${table} has exactly the pinned columns, types and nullability`, async () => {
      const rows = await sql(env)<
        { column_name: string; data_type: string; is_nullable: "YES" | "NO" }[]
      >`
        select column_name, data_type, is_nullable
        from information_schema.columns
        where table_schema = 'public' and table_name = ${table}`;
      const actual: Col[] = rows
        .map((r): Col => [r.column_name, r.data_type, r.is_nullable])
        .sort(byName);
      expect(actual).toEqual([...COLUMNS[table]].sort(byName));
    });

    it(`${table}.id defaults to gen_random_uuid() and the timestamps to now()`, async () => {
      const rows = await sql(env)<
        { column_name: string; column_default: string | null }[]
      >`
        select column_name, column_default from information_schema.columns
        where table_schema = 'public' and table_name = ${table}
          and column_name in ('id', 'created_at', 'updated_at')
        order by column_name`;
      expect(rows.map((r) => [r.column_name, r.column_default])).toEqual([
        ["created_at", "now()"],
        ["id", "gen_random_uuid()"],
        ["updated_at", "now()"],
      ]);
    });
  }

  it("events.capture_job_id references capture_jobs and kind_id references kinds", async () => {
    const rows = await sql(env)<{ conname: string; def: string }[]>`
      select conname, pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'public.events'::regclass and contype = 'f'`;
    const defs = rows.map((r) => unq(r.def)).sort();
    expect(defs).toEqual(
      [
        "FOREIGN KEY (capture_job_id) REFERENCES capture_jobs(id) ON DELETE SET NULL",
        "FOREIGN KEY (kind_id) REFERENCES kinds(id) ON DELETE RESTRICT",
      ].sort(),
    );
  });
});

describe("AC-1: uniqueness rules", () => {
  it("kinds has the partial unique index on lower(name) for live rows", async () => {
    const rows = await sql(env)<{ indexdef: string }[]>`
      select indexdef from pg_indexes
      where schemaname = 'public' and indexname = 'kinds_live_name_key'`;
    expect(rows.map((r) => r.indexdef)).toEqual([
      "CREATE UNIQUE INDEX kinds_live_name_key ON public.kinds USING btree (lower(name)) WHERE (deleted_at IS NULL)",
    ]);
  });

  it("two live kinds whose names differ only in case are refused, a soft-deleted one is not counted", async () => {
    const db = sql(env);
    await db`insert into public.kinds (name, color_light, color_dark)
             values ('Work', '#112233', '#445566')`;
    await expect(
      db`insert into public.kinds (name, color_light, color_dark)
         values ('WORK', '#112233', '#445566')`,
    ).rejects.toMatchObject({ code: "23505" });
    await db`update public.kinds set deleted_at = now() where name = 'Work'`;
    await db`insert into public.kinds (name, color_light, color_dark)
             values ('WORK', '#112233', '#445566')`;
    const counted = await db<{ n: number }[]>`
      select count(*)::int as n from public.kinds`;
    expect(counted[0]?.n).toBe(2);
  });

  it("reminders is unique on (event_id, occurrence_date) with nulls not distinct", async () => {
    const rows = await sql(env)<{ def: string }[]>`
      select pg_get_constraintdef(oid) as def from pg_constraint
      where conname = 'reminders_event_occurrence_key'
        and conrelid = 'public.reminders'::regclass and contype = 'u'`;
    expect(rows.map((r) => r.def)).toEqual([
      "UNIQUE NULLS NOT DISTINCT (event_id, occurrence_date)",
    ]);
  });

  it("a second reminder for the same event with a null occurrence_date is refused", async () => {
    const { eventId } = await insertParents(env, "reminders");
    const db = sql(env);
    await db`insert into public.reminders (event_id, minutes_before)
             values (${eventId as string}, 10)`;
    await expect(
      db`insert into public.reminders (event_id, minutes_before)
         values (${eventId as string}, 20)`,
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("push_subscriptions is unique on endpoint", async () => {
    const rows = await sql(env)<{ def: string }[]>`
      select pg_get_constraintdef(oid) as def from pg_constraint
      where conname = 'push_subscriptions_endpoint_key'
        and conrelid = 'public.push_subscriptions'::regclass and contype = 'u'`;
    expect(rows.map((r) => r.def)).toEqual(["UNIQUE (endpoint)"]);
    const db = sql(env);
    await db`insert into public.push_subscriptions (endpoint, p256dh, auth)
             values ('https://push.example.test/x', 'k', 'a')`;
    await expect(
      db`insert into public.push_subscriptions (endpoint, p256dh, auth)
         values ('https://push.example.test/x', 'k2', 'a2')`,
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("event_overrides is unique on (event_id, occurrence_date)", async () => {
    const rows = await sql(env)<{ def: string }[]>`
      select pg_get_constraintdef(oid) as def from pg_constraint
      where conname = 'event_overrides_event_occurrence_key'
        and conrelid = 'public.event_overrides'::regclass and contype = 'u'`;
    expect(rows.map((r) => r.def)).toEqual([
      "UNIQUE (event_id, occurrence_date)",
    ]);
  });

  it("events is indexed on starts_at and on kind_id", async () => {
    const rows = await sql(env)<{ indexdef: string }[]>`
      select indexdef from pg_indexes
      where schemaname = 'public' and tablename = 'events'`;
    const defs = rows.map((r) => r.indexdef);
    expect(defs.some((d) => d.endsWith("USING btree (starts_at)"))).toBe(true);
    expect(defs.some((d) => d.endsWith("USING btree (kind_id)"))).toBe(true);
  });
});

describe("AC-1/AC-3: row-level security is on, policies and predicate as pinned", () => {
  it("RLS is enabled (and not forced) on all seven tables", async () => {
    const rows = await sql(env)<
      { relname: string; rls: boolean; forced: boolean }[]
    >`
      select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as forced
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname`;
    expect(rows.map((r) => [r.relname, r.rls, r.forced])).toEqual(
      [...ALL_TABLES].sort().map((t) => [t, true, false]),
    );
  });

  for (const table of CLIENT_TABLES) {
    it(`${table} has exactly the four owner policies, for authenticated, on is_owner()`, async () => {
      const rows = await sql(env)<
        {
          policyname: string;
          cmd: string;
          roles: string[];
          qual: string | null;
          with_check: string | null;
        }[]
      >`
        select policyname, cmd, roles, qual, with_check from pg_policies
        where schemaname = 'public' and tablename = ${table}
        order by policyname`;
      expect(
        rows.map((r) => [
          r.policyname,
          r.cmd,
          r.roles,
          unq(r.qual),
          unq(r.with_check),
        ]),
      ).toEqual([
        [
          `${table}_delete_owner`,
          "DELETE",
          ["authenticated"],
          "is_owner()",
          null,
        ],
        [
          `${table}_insert_owner`,
          "INSERT",
          ["authenticated"],
          null,
          "is_owner()",
        ],
        [
          `${table}_select_owner`,
          "SELECT",
          ["authenticated"],
          "is_owner()",
          null,
        ],
        [
          `${table}_update_owner`,
          "UPDATE",
          ["authenticated"],
          "is_owner()",
          "is_owner()",
        ],
      ]);
    });
  }

  it("app_config has only the owner select policy", async () => {
    const rows = await sql(env)<
      { policyname: string; cmd: string; roles: string[]; qual: string }[]
    >`
      select policyname, cmd, roles, qual from pg_policies
      where schemaname = 'public' and tablename = 'app_config'`;
    expect(
      rows.map((r) => [r.policyname, r.cmd, r.roles, unq(r.qual)]),
    ).toEqual([
      ["app_config_select_owner", "SELECT", ["authenticated"], "is_owner()"],
    ]);
  });

  it("is_owner() may be executed by authenticated and service_role, not anon", async () => {
    const [row] = await sql(env)<
      { anon: boolean; authenticated: boolean; service: boolean }[]
    >`
      select
        has_function_privilege('anon', 'public.is_owner()', 'execute') as anon,
        has_function_privilege('authenticated', 'public.is_owner()', 'execute') as authenticated,
        has_function_privilege('service_role', 'public.is_owner()', 'execute') as service`;
    expect(row).toEqual({ anon: false, authenticated: true, service: true });
  });

  // The predicate itself, evaluated as `authenticated` with a given claim set.
  // Same rule as CAL-003's isOwnerEmail: trim + lower-case both sides, then
  // exact equality; an empty or missing claim is never the owner.
  const cases: [
    label: string,
    claims: Record<string, unknown>,
    owner: boolean,
  ][] = [
    ["the owner's e-mail", { email: OWNER_EMAIL }, true],
    [
      "the owner's e-mail, upper-cased and padded",
      { email: `  ${OWNER_EMAIL.toUpperCase()} ` },
      true,
    ],
    ["another e-mail", { email: OTHER_EMAIL }, false],
    [
      "the lookalike that contains the owner's e-mail",
      { email: LOOKALIKE_EMAIL },
      false,
    ],
    ["the owner's e-mail with a prefix", { email: `x${OWNER_EMAIL}` }, false],
    ["an empty e-mail claim", { email: "" }, false],
    ["a blank e-mail claim", { email: "   " }, false],
    [
      "no e-mail claim at all",
      { sub: "00000000-0000-0000-0000-000000000000" },
      false,
    ],
  ];
  for (const [label, claims, owner] of cases) {
    it(`is_owner() is ${owner} for ${label}`, async () => {
      const result = await sql(env).begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
        await tx`set local role authenticated`;
        const [r] = await tx<{ owner: boolean | null }[]>`
          select public.is_owner() as owner`;
        return r?.owner;
      });
      expect(result).toBe(owner);
    });
  }
});

describe("AC-1/AC-6: updated_at is maintained by a trigger", () => {
  it("every one of the seven tables has a BEFORE UPDATE FOR EACH ROW trigger calling set_updated_at()", async () => {
    const rows = await sql(env)<{ relname: string; tgtype: number }[]>`
      select c.relname, t.tgtype from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_proc p on p.oid = t.tgfoid
      join pg_namespace pn on pn.oid = p.pronamespace
      where n.nspname = 'public' and not t.tgisinternal
        and pn.nspname = 'public' and p.proname = 'set_updated_at'
      order by c.relname`;
    // tgtype bits: 1 = ROW, 2 = BEFORE, 16 = UPDATE.
    expect(
      rows.map((r) => [
        r.relname,
        (r.tgtype & 1) === 1,
        (r.tgtype & 2) === 2,
        (r.tgtype & 16) === 16,
      ]),
    ).toEqual([...ALL_TABLES].sort().map((t) => [t, true, true, true]));
  });

  it("a kind updated through the service client with updated_at = 2000-01-01 reads back strictly later than before", async () => {
    const svc = serviceClient(env);
    const { data: inserted, error } = await svc
      .from("kinds")
      .insert(rowFor("kinds", {}))
      .select("id, updated_at")
      .single();
    expect(error).toBeNull();
    const id = (inserted as { id: string }).id;
    const [before] = await sql(env)<{ updated_at: string }[]>`
      select updated_at::text as updated_at from public.kinds where id = ${id}`;
    const upd = await svc
      .from("kinds")
      .update({ name: "Touched", updated_at: "2000-01-01T00:00:00Z" })
      .eq("id", id)
      .select("id");
    expect(upd.error).toBeNull();
    expect(upd.data).toHaveLength(1);
    const [after] = await sql(env)<{ later: boolean; year: number }[]>`
      select updated_at > ${before?.updated_at as string}::timestamptz as later,
             extract(year from updated_at)::int as year
      from public.kinds where id = ${id}`;
    expect(after).toEqual({ later: true, year: expect.any(Number) });
    expect(after?.year).not.toBe(2000);
  });

  it("inside one transaction, insert then two updates still give three strictly increasing updated_at values", async () => {
    // now() is the transaction's start time, so a trigger built on it would
    // leave all three equal here; the Contract's trigger uses
    // greatest(clock_timestamp(), old.updated_at + 1 microsecond).
    const seen = await sql(env).begin(async (tx) => {
      const out: string[] = [];
      const [ins] = await tx<{ id: string; u: string }[]>`
        insert into public.kinds (name, color_light, color_dark)
        values ('Same tx', '#112233', '#445566')
        returning id, updated_at::text as u`;
      out.push(ins?.u as string);
      for (const name of ["Same tx 2", "Same tx 3"]) {
        const [r] = await tx<{ u: string }[]>`
          update public.kinds set name = ${name}
          where id = ${ins?.id as string} returning updated_at::text as u`;
        out.push(r?.u as string);
      }
      const [cmp] = await tx<{ ok: boolean }[]>`
        select ${out[0] as string}::timestamptz < ${out[1] as string}::timestamptz
           and ${out[1] as string}::timestamptz < ${out[2] as string}::timestamptz as ok`;
      return { values: out, increasing: cmp?.ok };
    });
    expect(seen).toEqual({ values: seen.values, increasing: true });
  });

  it("on every table, an update that sends an old updated_at, or none, still advances it", async () => {
    const db = sql(env);
    const failures: string[] = [];
    for (const table of ALL_TABLES) {
      const id =
        table === "app_config"
          ? (
              await db<
                { id: string }[]
              >`select id from public.app_config limit 1`
            )[0]?.id
          : (await insertFixture(env, table)).id;
      if (!id) {
        failures.push(`${table}: no row to update`);
        continue;
      }
      for (const sent of ["'2000-01-01'::timestamptz", "t.updated_at"]) {
        const [r] = await db.unsafe<{ later: boolean }[]>(
          `with prev as (select updated_at from public.${table} where id = $1)
           update public.${table} t set updated_at = ${sent}
           from prev where t.id = $1
           returning t.updated_at > prev.updated_at as later`,
          [id],
        );
        if (r?.later !== true) failures.push(`${table} (sent ${sent})`);
      }
    }
    expect(failures).toEqual([]);
  });
});
