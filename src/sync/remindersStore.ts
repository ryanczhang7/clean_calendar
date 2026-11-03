import { useEffect, useSyncExternalStore } from "react";
import type { Reminder } from "../data/rows";
import { createCachedRemindersStore } from "./cachedStores";
import { db } from "./db";
import { appSync } from "./startSync";

// The reminders read model (CAL-026 Contract, Block 8): the same discipline as
// useOverrides, over the cache. The snapshot holds every cached reminder -
// templates live and cleared, per-occurrence rows, every event's; a caller
// asks `useReminder(eventId)` for the one that is the event's live template.

export type RemindersSnapshot = {
  status: "loading" | "ready" | "unavailable";
  reminders: Reminder[];
};
export type RemindersStore = {
  refresh(): Promise<void>;
  subscribe(l: () => void): () => void;
  getSnapshot(): RemindersSnapshot;
};

/** The app's one store, over the app's `db` and `appSync`. */
export const remindersStore: RemindersStore = createCachedRemindersStore(
  db,
  appSync,
);

/**
 * The event's live template: `occurrenceDate` null and `deletedAt == null` (a
 * row with no `deletedAt` key, streamed before CAL-026, is live); else null.
 */
export function liveTemplate(
  reminders: readonly Reminder[],
  eventId: string,
): Reminder | null {
  return (
    reminders.find(
      (r) =>
        r.eventId === eventId &&
        r.occurrenceDate === null &&
        r.deletedAt == null,
    ) ?? null
  );
}

export function useReminder(
  eventId: string,
  store: RemindersStore = remindersStore,
): Reminder | null {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  // A store that has never loaded is asked once, from an effect - never
  // during render.
  useEffect(() => {
    if (store.getSnapshot().status === "loading") void store.refresh();
  }, [store]);
  return liveTemplate(snapshot.reminders, eventId);
}
