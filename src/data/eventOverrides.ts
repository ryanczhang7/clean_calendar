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
  type EventOverrideInsert,
  type EventOverridePatch,
  fromEventOverridePatch,
  fromNewEventOverride,
  type NewEventOverride,
  toEventOverride,
} from "./rows";

// The event_overrides repository (CAL-005). Same shape as kinds.ts, except
// that an override has no deleted_at column and so no `remove`: it is
// cancelled or hard-deleted by the story that owns that behaviour. CAL-056
// Block 4 adds what the outbox drain needs, as events.ts has it (CAL-015
// Block 8): a client-chosen id on insert, and `get`.

export type EventOverridesRepo = {
  listLive(): Promise<ListResult<EventOverride>>;
  listSince(since: string): Promise<ListResult<EventOverride>>;
  /** CAL-056 Block 4: `id`, when given, is POSTed as the row's id. */
  insert(input: NewEventOverride, id?: string): Promise<Result<EventOverride>>;
  /** CAL-056 Block 4: one override by id; zero rows → conflict. */
  get(id: string): Promise<Result<EventOverride>>;
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
    insert: async (input, id) => {
      const body: EventOverrideInsert & { id?: string } =
        fromNewEventOverride(input);
      if (id !== undefined) body.id = id;
      return fromPostgrestOne(
        await table().insert(body).select("*"),
        toEventOverride,
      );
    },
    get: async (id) =>
      fromPostgrestOne(await table().select("*").eq("id", id), toEventOverride),
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
