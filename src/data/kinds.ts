import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import {
  fromPostgrest,
  fromPostgrestOne,
  type ListResult,
  type Result,
} from "./result";
import {
  fromKindPatch,
  fromNewKind,
  type Kind,
  type KindPatch,
  type NewKind,
  toKind,
} from "./rows";

// The kinds repository (CAL-005). The client is injected: the production
// caller passes the app's client, a test passes one pointed at MSW. Retry is
// the client's policy, so nothing here calls `.retry()`.

export type KindsRepo = {
  listLive(): Promise<ListResult<Kind>>;
  listSince(since: string): Promise<ListResult<Kind>>;
  insert(input: NewKind): Promise<Result<Kind>>;
  update(
    id: string,
    patch: KindPatch,
    expectedUpdatedAt: string,
  ): Promise<Result<Kind>>;
  remove(id: string, expectedUpdatedAt: string): Promise<Result<Kind>>;
  /** Every row, live and soft-deleted, ascending sort_order (CAL-006). */
  listAll(): Promise<ListResult<Kind>>;
  /** One POST carrying a JSON array; PostgREST inserts it as one statement. */
  insertMany(inputs: NewKind[]): Promise<ListResult<Kind>>;
};

export function kindsRepo(client: SupabaseClient<Database>): KindsRepo {
  const table = () => client.from("kinds");

  // Conditional on the updated_at the caller last saw (architecture.md,
  // conflict rule): zero rows back is a conflict. `.select()`, never
  // `.single()`, so zero rows is data rather than a PGRST116 error.
  const patchIfUnchanged = async (
    id: string,
    body: Database["public"]["Tables"]["kinds"]["Update"],
    expectedUpdatedAt: string,
  ) =>
    fromPostgrestOne(
      await table()
        .update(body)
        .eq("id", id)
        .eq("updated_at", expectedUpdatedAt)
        .select("*"),
      toKind,
    );

  return {
    listLive: async () =>
      fromPostgrest(
        await table()
          .select("*")
          .is("deleted_at", null)
          .order("sort_order", { ascending: true }),
        toKind,
      ),
    listSince: async (since) =>
      fromPostgrest(
        await table()
          .select("*")
          .gt("updated_at", since)
          .order("updated_at", { ascending: true }),
        toKind,
      ),
    insert: async (input) =>
      fromPostgrestOne(
        await table().insert(fromNewKind(input)).select("*"),
        toKind,
      ),
    update: (id, patch, expectedUpdatedAt) =>
      patchIfUnchanged(id, fromKindPatch(patch), expectedUpdatedAt),
    // A soft delete: a PATCH of deleted_at, never an HTTP DELETE.
    remove: (id, expectedUpdatedAt) =>
      patchIfUnchanged(
        id,
        { deleted_at: new Date().toISOString() },
        expectedUpdatedAt,
      ),
    // No deleted_at filter: the seed counts soft-deleted rows (CAL-006 AC-4).
    listAll: async () =>
      fromPostgrest(
        await table().select("*").order("sort_order", { ascending: true }),
        toKind,
      ),
    // One atomic statement, so two racing devices cannot each land a subset
    // (CAL-006 AC-5). A 23505 comes back as an error; nothing retries.
    insertMany: async (inputs) =>
      fromPostgrest(
        await table().insert(inputs.map(fromNewKind)).select("*"),
        toKind,
      ),
  };
}
