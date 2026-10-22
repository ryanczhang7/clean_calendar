import { eventOverridesRepo } from "../data/eventOverrides";
import { eventsRepo } from "../data/events";
import { kindsRepo } from "../data/kinds";
import { supabase } from "../lib/supabase";
import { db } from "./db";
import { createDrain, type Drain } from "./drain";
import { createSync, type Sync, type SyncResult } from "./hydrate";
import type { Repos } from "./outbox";

// CAL-014 Contract, Block 3. The app's sync over the real repositories and
// the app's `db`. Constructing it asks nothing; the cached kinds store runs it
// once seeding settles (PO decision 2), and every store's refresh runs it.
// CAL-015 Block 5 adds the app's drain: it runs before every pull, so the
// pull sees our own rows with their server stamps (PO decision 6).

/** The app's sync over the real repositories and `db`. */
export const appSync: Sync = createSync(db, {
  kinds: kindsRepo(supabase),
  events: eventsRepo(supabase),
  overrides: eventOverridesRepo(supabase),
});

/** The repositories the app's drain and the sync problems dialog write through. */
export const appRepos: Repos = {
  events: eventsRepo(supabase),
  kinds: kindsRepo(supabase),
};

/** The app's outbox drain over `db`; online is `navigator.onLine`. */
export const appDrain: Drain = createDrain(db, appRepos);

/**
 * One announced drain, then one pass of `appSync`; what "sync starts after
 * sign-in" and every `online` event call. Both are reached through the
 * exported objects at call time.
 */
export async function startSync(): Promise<SyncResult> {
  await appDrain.run({ announce: true });
  return appSync.run();
}

// One listener function for every install, so the DOM de-duplicates it and
// installing twice still runs once per event.
const onOnline = () => {
  void startSync();
};

/** window "online" → startSync(); returns the uninstaller. Idempotent. */
export function installOnlineSync(target: Window = window): () => void {
  target.addEventListener("online", onOnline);
  return () => target.removeEventListener("online", onOnline);
}
