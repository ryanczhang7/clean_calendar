import { eventOverridesRepo } from "../data/eventOverrides";
import { eventsRepo } from "../data/events";
import { kindsRepo } from "../data/kinds";
import { supabase } from "../lib/supabase";
import { db } from "./db";
import { createSync, type Sync, type SyncResult } from "./hydrate";

// CAL-014 Contract, Block 3. The app's sync over the real repositories and
// the app's `db`. Constructing it asks nothing; the cached kinds store runs it
// once seeding settles (PO decision 2), and every store's refresh runs it.

/** The app's sync over the real repositories and `db`. */
export const appSync: Sync = createSync(db, {
  kinds: kindsRepo(supabase),
  events: eventsRepo(supabase),
  overrides: eventOverridesRepo(supabase),
});

/** One pass of `appSync`; what "sync starts after sign-in" calls. */
export function startSync(): Promise<SyncResult> {
  return appSync.run();
}
