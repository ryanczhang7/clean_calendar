import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import {
  fromPostgrest,
  fromPostgrestOne,
  type ListResult,
  type Result,
} from "./result";
import {
  fromNewReminder,
  fromReminderPatch,
  type NewReminder,
  type Reminder,
  type ReminderInsert,
  type ReminderPatch,
  toReminder,
} from "./rows";

// The reminders repository (CAL-026 Block 3). Shaped as events.ts: a
// client-chosen id on insert, `get` for the drain's conflict path, and every
// write conditional on the updated_at the client saw. `remove` and `restore`
// are soft (deleted_at), so a cleared template keeps its unique key and is
// restored rather than inserted again (AC-3).

export type RemindersRepo = {
  /** updated_at > since, ascending; soft-deleted rows included. */
  listSince(since: string): Promise<ListResult<Reminder>>;
  /** `id`, when given, is POSTed as the row's id. */
  insert(input: NewReminder, id?: string): Promise<Result<Reminder>>;
  /** One reminder by id; zero rows -> conflict. */
  get(id: string): Promise<Result<Reminder>>;
  update(
    id: string,
    patch: ReminderPatch,
    expectedUpdatedAt: string,
  ): Promise<Result<Reminder>>;
  /** deleted_at = now. */
  remove(id: string, expectedUpdatedAt: string): Promise<Result<Reminder>>;
  /** deleted_at = null. */
  restore(id: string, expectedUpdatedAt: string): Promise<Result<Reminder>>;
};

export function remindersRepo(client: SupabaseClient<Database>): RemindersRepo {
  const table = () => client.from("reminders");

  const patchIfUnchanged = async (
    id: string,
    body: Database["public"]["Tables"]["reminders"]["Update"],
    expectedUpdatedAt: string,
  ) =>
    fromPostgrestOne(
      await table()
        .update(body)
        .eq("id", id)
        .eq("updated_at", expectedUpdatedAt)
        .select("*"),
      toReminder,
    );

  return {
    listSince: async (since) =>
      fromPostgrest(
        await table()
          .select("*")
          .gt("updated_at", since)
          .order("updated_at", { ascending: true }),
        toReminder,
      ),
    insert: async (input, id) => {
      const body: ReminderInsert & { id?: string } =
        id === undefined
          ? fromNewReminder(input)
          : { id, ...fromNewReminder(input) };
      return fromPostgrestOne(
        await table().insert(body).select("*"),
        toReminder,
      );
    },
    get: async (id) =>
      fromPostgrestOne(await table().select("*").eq("id", id), toReminder),
    update: (id, patch, expectedUpdatedAt) =>
      patchIfUnchanged(id, fromReminderPatch(patch), expectedUpdatedAt),
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
