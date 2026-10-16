import { useEffect, useSyncExternalStore } from "react";
import { kindsRepo } from "../data/kinds";
import type { Kind } from "../data/rows";
import { supabase } from "../lib/supabase";
import {
  ensureDefaultKinds,
  type SeedOutcome,
  type SeedRepo,
} from "../kinds/seedKinds";

// The kinds read model (CAL-006, AC-6; Contract Block 5). It reads through
// the repository online until CAL-014 moves it onto the local cache behind
// the same signature.

export type KindsStatus = "loading" | "ready" | "unavailable";
export type KindsSnapshot = {
  status: KindsStatus;
  /** Live kinds (deletedAt null), ascending sortOrder, then createdAt. */
  kinds: Kind[];
  /** Any row by id, soft-deleted included; unknown id → undefined. */
  byId: (id: string) => Kind | undefined;
};
export type KindsStore = {
  ensureSeeded(): Promise<SeedOutcome>;
  refresh(): Promise<void>;
  subscribe(listener: () => void): () => void;
  getSnapshot(): KindsSnapshot;
};

function snapshotOf(status: KindsStatus, rows: Kind[]): KindsSnapshot {
  const index = new Map(rows.map((k) => [k.id, k]));
  const kinds = rows
    .filter((k) => k.deletedAt === null)
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt),
    );
  return { status, kinds, byId: (id) => index.get(id) };
}

export function createKindsStore(repo: SeedRepo): KindsStore {
  let rows: Kind[] = [];
  // Replaced only on a change, so getSnapshot() is stable in between
  // (useSyncExternalStore requires it).
  let snapshot = snapshotOf("loading", rows);
  const listeners = new Set<() => void>();
  let seeding: Promise<SeedOutcome> | null = null;
  let seeded: SeedOutcome | null = null;
  let refreshing: Promise<void> | null = null;

  const publish = (status: KindsStatus, next: Kind[] = rows) => {
    rows = next;
    snapshot = snapshotOf(status, rows);
    for (const listener of listeners) listener();
  };

  const ensureSeeded = (): Promise<SeedOutcome> => {
    if (seeded !== null) return Promise.resolve(seeded);
    if (seeding !== null) return seeding;
    seeding = ensureDefaultKinds(repo).then(({ outcome, kinds }) => {
      seeding = null;
      if (outcome === "unavailable") {
        // Not remembered: the next call tries again.
        publish("unavailable");
      } else {
        seeded = outcome;
        publish("ready", kinds);
      }
      return outcome;
    });
    return seeding;
  };

  const refresh = (): Promise<void> => {
    if (refreshing !== null) return refreshing;
    refreshing = repo.listAll().then((result) => {
      refreshing = null;
      if (result.status === "ok") publish("ready", result.rows);
      else publish("unavailable");
    });
    return refreshing;
  };

  return {
    ensureSeeded,
    refresh,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
  };
}

/**
 * The app's one store, over `kindsRepo(supabase)` from `../lib/supabase`.
 * That module builds the client from the environment when evaluated, so
 * tests that import this module mock it, as every other suite reaching it
 * does (`vi.mock("../lib/supabase", …)`).
 */
export const kindsStore: KindsStore = createKindsStore(kindsRepo(supabase));

export function useKinds(store: KindsStore = kindsStore): KindsSnapshot {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  // A store that has never loaded is asked once, from an effect - never
  // during render. Concurrent refreshes share one request.
  useEffect(() => {
    if (store.getSnapshot().status === "loading") void store.refresh();
  }, [store]);
  return snapshot;
}
