import { liveQuery, type Subscription } from "dexie";
import { useSyncExternalStore } from "react";
import { type CalendarDb, db as appDb } from "./db";
import type { Drain } from "./drain";
import { failedCount, queuedCount } from "./outbox";
import { appDrain } from "./startSync";

// The sync status's state (CAL-015 AC-7, Contract Block 7). `online` follows
// navigator.onLine and the window's online / offline events; the counts are
// read on subscribe, re-read on every `changed` notice from the drain, and
// also follow the outbox itself through a liveQuery, so an edit queued while
// no pass runs - offline, or behind a 5xx - is counted at once. Nothing is
// opened or subscribed before the first subscribe(); getSnapshot() is the same
// object until a value changes (useSyncExternalStore requires it).

export type SyncState = { online: boolean; queued: number; failed: number };

export type SyncStateStore = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): SyncState;
};

const isOnline = (): boolean =>
  typeof navigator === "undefined" ? true : navigator.onLine;

export function createSyncStateStore(
  db: CalendarDb,
  drain: Pick<Drain, "subscribe">,
  target?: Window,
): SyncStateStore {
  let state: SyncState = { online: isOnline(), queued: 0, failed: 0 };
  const listeners = new Set<() => void>();
  let stop: (() => void) | null = null;

  const set = (next: SyncState) => {
    if (
      next.online === state.online &&
      next.queued === state.queued &&
      next.failed === state.failed
    ) {
      return;
    }
    state = next;
    for (const listener of [...listeners]) listener();
  };
  const counts = async () => {
    try {
      const [queued, failed] = [await queuedCount(db), await failedCount(db)];
      if (stop !== null) set({ ...state, queued, failed });
    } catch {
      // A cache that cannot be read: the counts stay as they were.
    }
  };

  const start = (): (() => void) => {
    const win = target ?? (typeof window === "undefined" ? undefined : window);
    const onNetwork = () => set({ ...state, online: isOnline() });
    win?.addEventListener("online", onNetwork);
    win?.addEventListener("offline", onNetwork);
    const leaveDrain = drain.subscribe((notice) => {
      if (notice.kind === "changed") void counts();
    });
    const live: Subscription = liveQuery(async () => ({
      queued: await queuedCount(db),
      failed: await failedCount(db),
    })).subscribe({
      next: ({ queued, failed }) => {
        if (stop !== null) set({ ...state, queued, failed });
      },
      error: () => {},
    });
    set({ ...state, online: isOnline() });
    return () => {
      win?.removeEventListener("online", onNetwork);
      win?.removeEventListener("offline", onNetwork);
      leaveDrain();
      live.unsubscribe();
    };
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (stop === null) {
        stop = start();
        void counts();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && stop !== null) {
          const leave = stop;
          stop = null;
          leave();
        }
      };
    },
    getSnapshot: () => state,
  };
}

/** The app's sync state: the app's `db` and `appDrain`, the global window. */
export const syncState: SyncStateStore = createSyncStateStore(appDb, appDrain);

export function useSyncState(store: SyncStateStore = syncState): SyncState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

/** voice.md's labels. Precedence: offline, then failed, then queued, then synced. */
export function statusLabel(s: SyncState): string {
  if (!s.online) return "Offline — changes will sync later";
  if (s.failed > 0) {
    return s.failed === 1
      ? "1 change couldn't sync"
      : `${s.failed} changes couldn't sync`;
  }
  if (s.queued > 0) {
    return s.queued === 1 ? "Syncing 1 change" : `Syncing ${s.queued} changes`;
  }
  return "Synced";
}
