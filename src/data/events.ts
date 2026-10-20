import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import {
  fromPostgrest,
  fromPostgrestOne,
  type ListResult,
  type Result,
} from "./result";
import {
  type Event,
  type EventPatch,
  fromEventPatch,
  fromNewEvent,
  type NewEvent,
  toEvent,
} from "./rows";

// The events repository (CAL-005). Same shape as kinds.ts; see there.

export type EventsRepo = {
  listLive(): Promise<ListResult<Event>>;
  listSince(since: string): Promise<ListResult<Event>>;
  insert(input: NewEvent): Promise<Result<Event>>;
  update(
    id: string,
    patch: EventPatch,
    expectedUpdatedAt: string,
  ): Promise<Result<Event>>;
  remove(id: string, expectedUpdatedAt: string): Promise<Result<Event>>;
  /** CAL-013: the mirror of remove - clears deleted_at. */
  restore(id: string, expectedUpdatedAt: string): Promise<Result<Event>>;
};

export function eventsRepo(client: SupabaseClient<Database>): EventsRepo {
  const table = () => client.from("events");

  const patchIfUnchanged = async (
    id: string,
    body: Database["public"]["Tables"]["events"]["Update"],
    expectedUpdatedAt: string,
  ) =>
    fromPostgrestOne(
      await table()
        .update(body)
        .eq("id", id)
        .eq("updated_at", expectedUpdatedAt)
        .select("*"),
      toEvent,
    );

  return {
    listLive: async () =>
      fromPostgrest(
        await table()
          .select("*")
          .is("deleted_at", null)
          .order("starts_at", { ascending: true }),
        toEvent,
      ),
    listSince: async (since) =>
      fromPostgrest(
        await table()
          .select("*")
          .gt("updated_at", since)
          .order("updated_at", { ascending: true }),
        toEvent,
      ),
    insert: async (input) =>
      fromPostgrestOne(
        await table().insert(fromNewEvent(input)).select("*"),
        toEvent,
      ),
    update: (id, patch, expectedUpdatedAt) =>
      patchIfUnchanged(id, fromEventPatch(patch), expectedUpdatedAt),
    remove: (id, expectedUpdatedAt) =>
      patchIfUnchanged(
        id,
        { deleted_at: new Date().toISOString() },
        expectedUpdatedAt,
      ),
    restore: (id, expectedUpdatedAt) =>
      patchIfUnchanged(id, { deleted_at: null }, expectedUpdatedAt),
  };
}
