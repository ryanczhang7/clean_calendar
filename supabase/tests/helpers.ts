// Test harness for the `db` Vitest project (CAL-004 Contract, "The local stack
// and the test harness"). Runs under Node against a RUNNING local stack
// (`bash scripts/task.sh supabase-start` / `pnpm exec supabase start`); the
// gate does not start it.
import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres from "postgres";

export type LocalEnv = {
  url: string;
  anonKey: string;
  serviceKey: string;
  dbUrl: string;
};

/** The value `supabase/seed.sql` inserts into `app_config.owner_email`. */
export const OWNER_EMAIL = "owner@example.com";
/** Any other account: refused by every policy. */
export const OTHER_EMAIL = "someone-else@example.com";
/** The CAL-003 lookalike: contains the owner's address but is not it. */
export const LOOKALIKE_EMAIL = "owner@example.com.evil.test";

/** Fixed, local-only password for the users the suites create. */
export const TEST_PASSWORD = "local-test-password-CAL-004";

/** The six tables the client writes (everything but `app_config`). */
export const CLIENT_TABLES = [
  "kinds",
  "events",
  "event_overrides",
  "reminders",
  "push_subscriptions",
  "capture_jobs",
] as const;

/** All seven tables the migration creates. */
export const ALL_TABLES = ["app_config", ...CLIENT_TABLES] as const;

let cachedEnv: LocalEnv | undefined;

/**
 * Parse `supabase status -o env`. Measured on CLI 2.120.0 (2026-10-14): lines
 * of the form `KEY="value"` on stdout, e.g. `API_URL="http://127.0.0.1:54321"`,
 * plus notices ("Stopped services: ...", "A new version ...") that are not
 * KEY=value and are ignored. The quotes are stripped.
 */
export function parseStatusEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(raw.trim());
    if (!m) continue;
    const key = m[1] as string;
    let value = (m[2] as string).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function readStatus(): Record<string, string> {
  let stdout: string;
  try {
    // A single command string through the shell: `pnpm` is `pnpm.cmd` on
    // Windows, which execFile cannot launch without `shell`.
    stdout = execSync("pnpm exec supabase status -o env", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    });
  } catch (error) {
    throw new Error(
      "db tests: `pnpm exec supabase status -o env` failed - is the local " +
        "stack running? Start it with `pnpm exec supabase start`.\n" +
        String(error),
    );
  }
  return parseStatusEnv(stdout);
}

async function assertApiAnswers(env: LocalEnv): Promise<void> {
  try {
    const res = await fetch(`${env.url}/auth/v1/health`, {
      headers: { apikey: env.anonKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (error) {
    throw new Error(
      `db tests: the local Supabase API at ${env.url} does not answer ` +
        `(${String(error)}). Start it with \`pnpm exec supabase start\`.`,
    );
  }
}

export async function loadLocalEnv(): Promise<LocalEnv> {
  if (cachedEnv) return cachedEnv;
  const p = process.env;
  let env: LocalEnv;
  if (
    p.SUPABASE_URL &&
    p.SUPABASE_ANON_KEY &&
    p.SUPABASE_SERVICE_ROLE_KEY &&
    p.SUPABASE_DB_URL
  ) {
    env = {
      url: p.SUPABASE_URL,
      anonKey: p.SUPABASE_ANON_KEY,
      serviceKey: p.SUPABASE_SERVICE_ROLE_KEY,
      dbUrl: p.SUPABASE_DB_URL,
    };
  } else {
    const s = readStatus();
    const missing = [
      "API_URL",
      "ANON_KEY",
      "SERVICE_ROLE_KEY",
      "DB_URL",
    ].filter((k) => !s[k]);
    if (missing.length > 0) {
      throw new Error(
        `db tests: \`supabase status -o env\` did not report ${missing.join(", ")}` +
          " - is the local stack running?",
      );
    }
    env = {
      url: s.API_URL as string,
      anonKey: s.ANON_KEY as string,
      serviceKey: s.SERVICE_ROLE_KEY as string,
      dbUrl: s.DB_URL as string,
    };
  }
  await assertApiAnswers(env);
  cachedEnv = env;
  return env;
}

const noSession = { persistSession: false, autoRefreshToken: false };

/** Service role: bypasses RLS. Used for fixtures and AC-5's "the service role can". */
export function serviceClient(env: LocalEnv): SupabaseClient {
  return createClient(env.url, env.serviceKey, { auth: noSession });
}

/** Anon key, no session (AC-4). */
export function anonClient(env: LocalEnv): SupabaseClient {
  return createClient(env.url, env.anonKey, { auth: noSession });
}

const signedIn = new Map<string, SupabaseClient>();

/**
 * A client carrying a real GoTrue access token for `email` (the `email` claim
 * is what `public.is_owner()` reads). Creates the user if needed.
 */
export async function clientFor(
  env: LocalEnv,
  email: string,
): Promise<SupabaseClient> {
  const cached = signedIn.get(email);
  if (cached) return cached;
  const admin = serviceClient(env);
  const created = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (
    created.error &&
    !/already (been )?registered|already exists/i.test(created.error.message)
  ) {
    throw new Error(
      `db tests: could not create ${email}: ${created.error.message}`,
    );
  }
  const auth = createClient(env.url, env.anonKey, { auth: noSession });
  const { data, error } = await auth.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (error || !data.session) {
    throw new Error(
      `db tests: could not sign in as ${email}: ${error?.message ?? "no session"}`,
    );
  }
  const client = createClient(env.url, env.anonKey, {
    auth: noSession,
    global: {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    },
  });
  signedIn.set(email, client);
  return client;
}

let cachedSql: postgres.Sql | undefined;

/** Direct SQL as `postgres` (schema inspection and truncation only). */
export function sql(env: LocalEnv): postgres.Sql {
  if (!cachedSql) {
    cachedSql = postgres(env.dbUrl, { max: 2, onnotice: () => {} });
  }
  return cachedSql;
}

export async function closeSql(): Promise<void> {
  if (cachedSql) {
    const s = cachedSql;
    cachedSql = undefined;
    await s.end({ timeout: 5 });
  }
}

/**
 * Empty the six client tables. Only the tables that exist are named, so that
 * while the schema is absent (RED) or partial, each test still reaches its own
 * assertion and fails there, naming what is missing - rather than every test
 * failing identically in this fixture. It is never a pass: no assertion in
 * either suite is satisfied by a missing table.
 */
export async function truncateClientTables(env: LocalEnv): Promise<void> {
  const db = sql(env);
  const present = await db<{ name: string }[]>`
    select t as name from unnest(${[...CLIENT_TABLES]}::text[]) as t
    where to_regclass('public.' || t) is not null`;
  if (present.length === 0) return;
  await db.unsafe(
    `truncate ${present.map((r) => `public.${r.name}`).join(", ")} ` +
      "restart identity cascade",
  );
}

// ---------------------------------------------------------------------------
// Fixtures. Rows are written through the SERVICE client (bypasses RLS), so a
// per-table RLS assertion isolates the table under test (Contract, "Rows that
// need parents").

export type ClientTable = (typeof CLIENT_TABLES)[number];
export type AnyTable = (typeof ALL_TABLES)[number];
export type Row = Record<string, unknown> & { id: string };

/** Which parent rows a table's fixture needs. */
export const PARENTS: Record<ClientTable, "none" | "kind" | "event"> = {
  kinds: "none",
  events: "kind",
  event_overrides: "event",
  reminders: "event",
  push_subscriptions: "none",
  capture_jobs: "none",
};

export type Parents = { kindId?: string; eventId?: string };

let serial = 0;

/**
 * A valid new row for `table`. `n` keeps unique columns distinct (kind names,
 * push endpoints, reminder occurrence dates).
 */
export function rowFor(
  table: ClientTable,
  parents: Parents,
  n: number = ++serial,
): Record<string, unknown> {
  switch (table) {
    case "kinds":
      return {
        name: `Kind ${n}`,
        color_light: "#112233",
        color_dark: "#445566",
      };
    case "events":
      return {
        title: `Event ${n}`,
        kind_id: parents.kindId,
        starts_at: "2026-11-01T09:00:00Z",
        ends_at: "2026-11-01T10:00:00Z",
      };
    case "event_overrides":
      return {
        event_id: parents.eventId,
        occurrence_date: dateFor(n),
      };
    case "reminders":
      return {
        event_id: parents.eventId,
        minutes_before: 15,
        occurrence_date: dateFor(n),
      };
    case "push_subscriptions":
      return {
        endpoint: `https://push.example.test/sub/${n}`,
        p256dh: "p256dh-key",
        auth: "auth-secret",
      };
    case "capture_jobs":
      return { input_kind: "text", input_hash: `hash-${n}`, model: "test" };
  }
}

/** A distinct calendar date per n, so (event_id, occurrence_date) stays unique. */
function dateFor(n: number): string {
  const d = new Date(Date.UTC(2026, 0, 1) + (n % 3650) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** A column update that every table accepts, and the value to read back. */
export const PATCH: Record<ClientTable, Record<string, unknown>> = {
  kinds: { name: "Renamed kind" },
  events: { title: "Renamed event" },
  event_overrides: { cancelled: true },
  reminders: { minutes_before: 30 },
  push_subscriptions: { user_agent: "patched-agent" },
  capture_jobs: { status: "confirmed" },
};

async function insertOne(
  env: LocalEnv,
  table: string,
  row: Record<string, unknown>,
): Promise<Row> {
  const { data, error } = await serviceClient(env)
    .from(table)
    .insert(row)
    .select()
    .single();
  if (error || !data) {
    throw new Error(
      `db tests: fixture insert into ${table} failed: ${error?.code} ${error?.message}`,
    );
  }
  return data as Row;
}

/** Insert the parents `table` needs, through the service client. */
export async function insertParents(
  env: LocalEnv,
  table: ClientTable,
): Promise<Parents> {
  const need = PARENTS[table];
  if (need === "none") return {};
  const kind = await insertOne(env, "kinds", rowFor("kinds", {}));
  if (need === "kind") return { kindId: kind.id };
  const event = await insertOne(
    env,
    "events",
    rowFor("events", { kindId: kind.id }),
  );
  return { kindId: kind.id, eventId: event.id };
}

/** Insert one `table` row (and its parents) through the service client. */
export async function insertFixture(
  env: LocalEnv,
  table: ClientTable,
  parents?: Parents,
): Promise<Row> {
  const p = parents ?? (await insertParents(env, table));
  return insertOne(env, table, rowFor(table, p));
}
