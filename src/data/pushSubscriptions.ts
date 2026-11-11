import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Database } from "./database.types";
import { fromPostgrestOne, type Result } from "./result";

// The device subscription repository (CAL-027 Contract, Block 1). One upsert
// by endpoint, so a returning device updates its own row rather than adding
// one. Schema, unique key and owner RLS: 0001_core_schema.sql.

export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
};

export type PushSubscriptionsRepo = {
  /** POST /rest/v1/push_subscriptions?on_conflict=endpoint, merging a duplicate. */
  upsert(
    input: PushSubscriptionInput,
  ): Promise<Result<{ id: string; endpoint: string }>>;
};

export function pushSubscriptionsRepo(
  client: SupabaseClient<Database>,
): PushSubscriptionsRepo {
  return {
    // One object, not an array: an array body adds a `columns=` query key.
    // `last_seen_at` is sent on every call because the column default only
    // fires on insert (AC-4's "fresh").
    upsert: async (input) =>
      fromPostgrestOne(
        await client
          .from("push_subscriptions")
          .upsert(
            {
              endpoint: input.endpoint,
              p256dh: input.p256dh,
              auth: input.auth,
              user_agent: input.userAgent,
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: "endpoint" },
          )
          .select("id, endpoint"),
        (row) => ({ id: row.id, endpoint: row.endpoint }),
      ),
  };
}

export const pushSubscriptions: PushSubscriptionsRepo =
  pushSubscriptionsRepo(supabase);
