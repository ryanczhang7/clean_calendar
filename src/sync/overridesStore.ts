import { useEffect, useSyncExternalStore } from "react";
import type { EventOverride } from "../data/rows";
import { createCachedOverridesStore } from "./cachedStores";
import { db } from "./db";
import { appSync } from "./startSync";

// The overrides read model (CAL-014 Contract, Block 5), for CAL-024's
// recurrence expansion. The same discipline as useKinds, over the cache.

export type OverridesSnapshot = {
  status: "loading" | "ready" | "unavailable";
  /** Every override, cancelled included, by occurrenceDate then createdAt. */
  overrides: EventOverride[];
};
export type OverridesStore = {
  refresh(): Promise<void>;
  subscribe(l: () => void): () => void;
  getSnapshot(): OverridesSnapshot;
};

/** The app's one store, over the app's `db` and `appSync`. */
export const overridesStore: OverridesStore = createCachedOverridesStore(
  db,
  appSync,
);

export function useOverrides(
  store: OverridesStore = overridesStore,
): OverridesSnapshot {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  // A store that has never loaded is asked once, from an effect - never
  // during render.
  useEffect(() => {
    if (store.getSnapshot().status === "loading") void store.refresh();
  }, [store]);
  return snapshot;
}
