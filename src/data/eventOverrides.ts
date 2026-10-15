import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import {
  fromPostgrest,
  fromPostgrestOne,
  type ListResult,
  type Result,
} from "./result";
import {
  type EventOverride,
  type EventOverridePatch,
  fromEventOverridePatch,
  fromNewEventOverride,
  type NewEventOverride,
  toEventOverride,
} from "./rows";

// The event_overrides repository (CAL-005). Same shape as kinds.ts, except
// that an override has no deleted_at column and so no `remove`: it is
// cancelled or hard-deleted by the story that owns that behaviour.

export type EventOverridesRepo = {
  listLive(): Promise<ListResult<EventOverride>>;
  listSince(since: string): Promise<ListResult<EventOverride>>;
  insert(input: NewEventOverride): Promise<Result<EventOverride>>;
  update(
    id: string,
    patch: EventOverridePatch,
    expectedUpdatedAt: string,
  ): Promise<Result<EventOverride>>;
};

export function eventOverridesRepo(
  client: SupabaseClient<Database>,
): EventOverridesRepo {
  const table = () => client.from("event_overrides");

  return {
    listLive: async () =>
      fromPostgrest(
        await table().select("*").order("occurrence_date", { ascending: true }),
        toEventOverride,
      ),
    listSince: async (since) =>
      fromPostgrest(
        await table()
          .select("*")
          .gt("updated_at", since)
          .order("updated_at", { ascending: true }),
        toEventOverride,
      ),
    insert: async (input) =>
      fromPostgrestOne(
        await table().insert(fromNewEventOverride(input)).select("*"),
        toEventOverride,
      ),
    update: async (id, patch, expectedUpdatedAt) =>
      fromPostgrestOne(
        await table()
          .update(fromEventOverridePatch(patch))
          .eq("id", id)
          .eq("updated_at", expectedUpdatedAt)
          .select("*"),
        toEventOverride,
      ),
  };
}
