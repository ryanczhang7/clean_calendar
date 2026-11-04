import { execSync } from "node:child_process";
import { type BrowserContext, test as base, expect } from "@playwright/test";
import type { Session } from "@supabase/supabase-js";
import { DEFAULT_KINDS } from "../../src/kinds/defaultKinds.ts";

// CAL-031 Contract Block 2: the owner's session, injected rather than signed
// in through Google, and a PostgREST helper so a spec does not walk the UI for
// state its criterion is not about. Everything talks to the LOCAL stack that
// `pnpm exec supabase start` runs; the keys are the CLI's local ones, read
// from `supabase status -o env` and never printed.

export { expect };

export const OWNER_EMAIL = "owner@example.com";
/** Local Auth only, not a secret. */
export const OWNER_PASSWORD = "e2e-owner-password";

/**
 * supabase-js's default storage key, `sb-<first label of the API host>-auth-token`
 * (createClient in @supabase/supabase-js 2.117.3, `baseUrl.hostname.split(".")[0]`);
 * the host is 127.0.0.1, so the label is "127".
 */
export const STORAGE_KEY = "sb-127-auth-token";
/** src/kinds/onboarding.ts's ONBOARDED_KEY: "1" skips the walkthrough. */
export const ONBOARDED_KEY = "cc.onboarded";

export type Local = { url: string; anonKey: string; serviceKey: string };

// Cached in process.env as well as here: Playwright loads the config (and so
// this module) again in every worker, and a worker inherits the runner's env.
const ENV_URL = "CAL031_SUPABASE_URL";
const ENV_ANON = "CAL031_SUPABASE_ANON_KEY";
const ENV_SERVICE = "CAL031_SUPABASE_SERVICE_KEY";

let cached: Local | null = null;

/** `KEY="value"` / `KEY=value` lines, as `supabase status -o env` prints them. */
export function parseStatusEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m === null) continue;
    const [, key, raw] = m;
    if (key === undefined || raw === undefined) continue;
    out[key] = raw.replace(/^"(.*)"$/, "$1");
  }
  return out;
}

/** The local stack's URL and keys; throws when `supabase status` cannot answer. */
export function local(): Local {
  if (cached !== null) return cached;
  const fromEnv = {
    url: process.env[ENV_URL],
    anonKey: process.env[ENV_ANON],
    serviceKey: process.env[ENV_SERVICE],
  };
  if (fromEnv.url && fromEnv.anonKey && fromEnv.serviceKey) {
    cached = fromEnv as Local;
    return cached;
  }
  const text = execSync("pnpm exec supabase status -o env", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const env = parseStatusEnv(text);
  const url = env.API_URL;
  const anonKey = env.ANON_KEY;
  const serviceKey = env.SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    throw new Error(
      "supabase status -o env printed no API_URL, ANON_KEY or SERVICE_ROLE_KEY: is `pnpm exec supabase start` running?",
    );
  }
  process.env[ENV_URL] = url;
  process.env[ENV_ANON] = anonKey;
  process.env[ENV_SERVICE] = serviceKey;
  cached = { url, anonKey, serviceKey };
  return cached;
}

function adminHeaders(): Record<string, string> {
  const { serviceKey } = local();
  return {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    "content-type": "application/json",
  };
}

async function failure(what: string, res: Response): Promise<Error> {
  return new Error(`${what}: HTTP ${res.status} ${await res.text()}`);
}

/**
 * The owner's local Auth user, with OWNER_PASSWORD, confirmed. Idempotent: a
 * 422 "already registered" finds the user and resets its password, because a
 * user another suite created (the db tests make one) has a different password
 * and the password grant would then refuse it.
 */
export async function ensureOwnerUser(): Promise<void> {
  const { url } = local();
  const body = {
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    email_confirm: true,
  };
  const created = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  if (created.ok) {
    await created.body?.cancel();
    return;
  }
  if (created.status !== 422) throw await failure("create owner", created);
  await created.body?.cancel();
  const listed = await fetch(`${url}/auth/v1/admin/users?per_page=1000`, {
    headers: adminHeaders(),
  });
  if (!listed.ok) throw await failure("list users", listed);
  const { users } = (await listed.json()) as {
    users: { id: string; email?: string }[];
  };
  const owner = users.find((u) => u.email?.toLowerCase() === OWNER_EMAIL);
  if (owner === undefined) {
    throw new Error(`422 creating ${OWNER_EMAIL}, yet no such user is listed`);
  }
  const updated = await fetch(`${url}/auth/v1/admin/users/${owner.id}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify({ password: OWNER_PASSWORD, email_confirm: true }),
  });
  if (!updated.ok) throw await failure("reset owner password", updated);
  await updated.body?.cancel();
}

/** A password grant: the GoTrue session JSON supabase-js stores. */
export async function ownerSession(): Promise<Session> {
  const { url, anonKey } = local();
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
  });
  if (!res.ok) throw await failure("owner password grant", res);
  return (await res.json()) as Session;
}

/**
 * Before any page script runs, put `session` where supabase-js reads it and,
 * unless `onboarded` is false, mark this device past the walkthrough.
 */
export async function injectSession(
  context: BrowserContext,
  session: Session,
  options: { onboarded: boolean } = { onboarded: true },
): Promise<void> {
  await context.addInitScript(
    ({ key, value, onboardedKey, onboarded }) => {
      localStorage.setItem(key, value);
      if (onboarded) localStorage.setItem(onboardedKey, "1");
    },
    {
      key: STORAGE_KEY,
      value: JSON.stringify(session),
      onboardedKey: ONBOARDED_KEY,
      onboarded: options.onboarded,
    },
  );
}

// --- seed: PostgREST with the service-role key ------------------------------

export type SeededKind = {
  id: string;
  name: string;
  color_light: string;
  color_dark: string;
  sort_order: number;
};

export type SeedEvent = {
  title: string;
  kind_id: string;
  starts_at: string;
  ends_at: string;
  all_day?: boolean;
  recurrence?: { freq: "daily" | "weekly" | "yearly"; until: null; tz: string };
};

export type Seed = {
  /** The eleven DEFAULT_KINDS, live, in sortOrder: reads first, inserts only the missing names, returns only the defaults. */
  kinds(): Promise<SeededKind[]>;
  /** How many kind rows exist, live or soft-deleted. */
  kindCount(): Promise<number>;
  /** Inserts one event row and returns its id. */
  event(row: SeedEvent): Promise<string>;
  /** Deletes every event, override and reminder; kinds are kept. */
  clear(): Promise<void>;
};

async function rest(
  path: string,
  init: { method?: string; body?: unknown; prefer?: string } = {},
): Promise<unknown> {
  const { url } = local();
  const headers: Record<string, string> = adminHeaders();
  if (init.prefer !== undefined) headers.prefer = init.prefer;
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) throw await failure(`${init.method ?? "GET"} ${path}`, res);
  const text = await res.text();
  return text === "" ? null : JSON.parse(text);
}

const KIND_COLUMNS = "id,name,color_light,color_dark,sort_order";

export const seed: Seed = {
  async kinds() {
    const live = (await rest(
      `kinds?select=${KIND_COLUMNS}&deleted_at=is.null`,
    )) as SeededKind[];
    const have = new Set(live.map((k) => k.name.toLowerCase()));
    const missing = DEFAULT_KINDS.filter(
      (k) => !have.has(k.name.toLowerCase()),
    );
    if (missing.length > 0) {
      await rest("kinds", {
        method: "POST",
        prefer: "return=minimal",
        body: missing.map((k) => ({
          name: k.name,
          color_light: k.colorLight,
          color_dark: k.colorDark,
          sort_order: k.sortOrder,
          is_default: k.isDefault,
        })),
      });
    }
    const rows = (await rest(
      `kinds?select=${KIND_COLUMNS}&deleted_at=is.null&order=sort_order.asc`,
    )) as SeededKind[];
    // Only the defaults: a kind some other suite left behind is not one of them.
    const defaults = new Set(DEFAULT_KINDS.map((k) => k.name.toLowerCase()));
    return rows.filter((k) => defaults.has(k.name.toLowerCase()));
  },
  async kindCount() {
    const rows = (await rest("kinds?select=id")) as unknown[];
    return rows.length;
  },
  async event(row) {
    const [inserted] = (await rest("events", {
      method: "POST",
      prefer: "return=representation",
      body: { all_day: false, recurrence: null, ...row },
    })) as { id: string }[];
    if (inserted === undefined) throw new Error("event insert returned no row");
    return inserted.id;
  },
  async clear() {
    // PostgREST refuses an unfiltered DELETE; `id=not.is.null` is every row.
    for (const table of ["reminders", "event_overrides", "events"]) {
      await rest(`${table}?id=not.is.null`, {
        method: "DELETE",
        prefer: "return=minimal",
      });
    }
  },
};

type Fixtures = {
  /** Option: false leaves the walkthrough unseen (AC-1). Default true. */
  onboarded: boolean;
  /** The owner's session, injected into this test's context before any script. */
  owner: Session;
  seed: Seed;
};

export const test = base.extend<Fixtures>({
  onboarded: [true, { option: true }],
  owner: async ({ context, onboarded }, use) => {
    const session = await ownerSession();
    await injectSession(context, session, { onboarded });
    await use(session);
  },
  // biome-ignore lint/correctness/noEmptyPattern: Playwright's fixture signature takes the fixtures object first
  seed: async ({}, use) => {
    await use(seed);
  },
});
