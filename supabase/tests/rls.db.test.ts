// CAL-004 AC-2 .. AC-5: row-level security, driven through PostgREST with
// real GoTrue sessions, as the app does. ONE describe PER TABLE, so a missing
// or wrong policy names its table (AC-3's control: drop the `events` policies
// and only the `events` describe goes red).
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  anonClient,
  CLIENT_TABLES,
  type ClientTable,
  clientFor,
  closeSql,
  insertFixture,
  insertParents,
  LOOKALIKE_EMAIL,
  type LocalEnv,
  loadLocalEnv,
  OTHER_EMAIL,
  OWNER_EMAIL,
  PATCH,
  type Parents,
  rowFor,
  serviceClient,
  truncateClientTables,
} from "./helpers";

// Budget: each test is a handful of local HTTP round trips; beforeAll signs
// three users in. Measured locally 2026-10-14 (see the story's Handoff).
const BUDGET_MS = 30_000;

/** Tables that soft-delete (`deleted_at`); the other four hard-delete. */
const SOFT_DELETE: ReadonlySet<ClientTable> = new Set(["kinds", "events"]);

let env: LocalEnv;
let owner: SupabaseClient;
let strangers: [label: string, client: SupabaseClient][];

beforeAll(async () => {
  env = await loadLocalEnv();
  owner = await clientFor(env, OWNER_EMAIL);
  strangers = [
    ["another e-mail", await clientFor(env, OTHER_EMAIL)],
    ["the lookalike e-mail", await clientFor(env, LOOKALIKE_EMAIL)],
  ];
}, BUDGET_MS);

afterAll(async () => {
  await closeSql();
}, BUDGET_MS);

/** Re-read a row through the service client (bypasses RLS). */
async function serviceRead(
  table: string,
  id: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await serviceClient(env)
    .from(table)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  expect(error).toBeNull();
  return data as Record<string, unknown> | null;
}

async function serviceCount(table: string): Promise<number> {
  const { count, error } = await serviceClient(env)
    .from(table)
    .select("*", { count: "exact", head: true });
  expect(error).toBeNull();
  return count ?? -1;
}

for (const table of CLIENT_TABLES) {
  describe(`${table}`, () => {
    let parents: Parents;
    let existing: Record<string, unknown> & { id: string };

    beforeEach(async () => {
      await truncateClientTables(env);
      parents = await insertParents(env, table);
      existing = await insertFixture(env, table, parents);
    }, BUDGET_MS);

    // ---- AC-2: the owner can do everything --------------------------------

    it(`AC-2: the owner reads a ${table} row the service wrote`, async () => {
      const { data, error } = await owner.from(table).select("*");
      expect(error).toBeNull();
      expect((data ?? []).map((r) => r.id)).toEqual([existing.id]);
    });

    it(`AC-2: the owner inserts a ${table} row`, async () => {
      const { data, error } = await owner
        .from(table)
        .insert(rowFor(table, parents))
        .select();
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(await serviceCount(table)).toBe(2);
    });

    it(`AC-2: the owner updates a ${table} row`, async () => {
      const patch = PATCH[table];
      const { data, error } = await owner
        .from(table)
        .update(patch)
        .eq("id", existing.id)
        .select();
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(await serviceRead(table, existing.id)).toMatchObject(patch);
    });

    if (SOFT_DELETE.has(table)) {
      it(`AC-2: the owner soft-deletes a ${table} row (sets deleted_at)`, async () => {
        const { data, error } = await owner
          .from(table)
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", existing.id)
          .select();
        expect(error).toBeNull();
        expect(data).toHaveLength(1);
        const after = await serviceRead(table, existing.id);
        expect(after?.deleted_at).toEqual(expect.any(String));
      });
    } else {
      it(`AC-2: the owner deletes a ${table} row`, async () => {
        const { data, error } = await owner
          .from(table)
          .delete()
          .eq("id", existing.id)
          .select();
        expect(error).toBeNull();
        expect(data).toHaveLength(1);
        expect(await serviceRead(table, existing.id)).toBeNull();
      });
    }

    // ---- AC-3: anyone else is shut out -------------------------------------

    for (const [label, email] of [
      ["another e-mail", OTHER_EMAIL],
      ["the lookalike e-mail", LOOKALIKE_EMAIL],
    ] as const) {
      const who = () => {
        const found = strangers.find(([l]) => l === label);
        if (!found) throw new Error(`no client for ${label}`);
        return found[1];
      };

      it(`AC-3: ${label} (${email}) selects zero ${table} rows`, async () => {
        const { data, error } = await who().from(table).select("*");
        expect(error).toBeNull();
        expect(data).toEqual([]);
      });

      it(`AC-3: ${label} (${email}) is refused an insert into ${table}`, async () => {
        const { error } = await who()
          .from(table)
          .insert(rowFor(table, parents));
        expect(error?.code).toBe("42501");
        expect(await serviceCount(table)).toBe(1);
      });

      it(`AC-3: ${label} (${email}) updates zero ${table} rows`, async () => {
        const { data, error } = await who()
          .from(table)
          .update(PATCH[table])
          .eq("id", existing.id)
          .select();
        expect(error).toBeNull();
        expect(data).toEqual([]);
        expect(await serviceRead(table, existing.id)).toEqual(existing);
      });

      it(`AC-3: ${label} (${email}) deletes zero ${table} rows`, async () => {
        const { data, error } = await who()
          .from(table)
          .delete()
          .eq("id", existing.id)
          .select();
        expect(error).toBeNull();
        expect(data).toEqual([]);
        expect(await serviceRead(table, existing.id)).toEqual(existing);
      });
    }

    // ---- AC-4: no session reads nothing ------------------------------------

    it(`AC-4: the anon key alone selects zero ${table} rows`, async () => {
      const { data, error } = await anonClient(env).from(table).select("*");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });
}

describe("app_config", () => {
  beforeEach(async () => {
    await truncateClientTables(env);
  }, BUDGET_MS);

  async function seeded(): Promise<Record<string, unknown>[]> {
    const { data, error } = await serviceClient(env)
      .from("app_config")
      .select("*");
    expect(error).toBeNull();
    return data ?? [];
  }

  it("AC-5: the owner reads the one seeded row, holding the owner's e-mail", async () => {
    const { data, error } = await owner.from("app_config").select("*");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.owner_email).toBe(OWNER_EMAIL);
  });

  it("AC-5: the owner is refused an insert into app_config", async () => {
    const { error } = await owner
      .from("app_config")
      .insert({ owner_email: "attacker@example.com" });
    expect(error?.code).toBe("42501");
    expect(await seeded()).toHaveLength(1);
  });

  it("AC-5: the owner's update of app_config changes nothing", async () => {
    const before = await seeded();
    const { data, error } = await owner
      .from("app_config")
      .update({ owner_email: "attacker@example.com" })
      .eq("id", before[0]?.id as string)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(await seeded()).toEqual(before);
  });

  it("AC-5: the owner's delete of app_config removes nothing", async () => {
    const before = await seeded();
    const { data, error } = await owner
      .from("app_config")
      .delete()
      .eq("id", before[0]?.id as string)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(await seeded()).toEqual(before);
  });

  it("AC-5: the service role can update app_config", async () => {
    const before = await seeded();
    const id = before[0]?.id as string;
    const svc = serviceClient(env);
    try {
      const { data, error } = await svc
        .from("app_config")
        .update({ owner_email: "new-owner@example.com" })
        .eq("id", id)
        .select();
      expect(error).toBeNull();
      expect(data?.[0]?.owner_email).toBe("new-owner@example.com");
    } finally {
      await svc
        .from("app_config")
        .update({ owner_email: OWNER_EMAIL })
        .eq("id", id);
    }
    expect((await seeded())[0]?.owner_email).toBe(OWNER_EMAIL);
  });

  it("AC-3: another e-mail and the lookalike read zero app_config rows", async () => {
    for (const [, client] of strangers) {
      const { data, error } = await client.from("app_config").select("*");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  it("AC-4: the anon key alone selects zero app_config rows", async () => {
    const { data, error } = await anonClient(env)
      .from("app_config")
      .select("*");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
