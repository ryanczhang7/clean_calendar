import { useEffect, useMemo, useSyncExternalStore } from "react";
import { type EventsRepo, eventsRepo } from "../data/events";
import type { Event } from "../data/rows";
import { supabase } from "../lib/supabase";

// The events read model (CAL-009, Contract Block 4): the same shape and
// discipline as kindsStore.ts. It reads through the repository online, and
// filters by range on the client (PO decision 8), until CAL-014 moves it onto
// the local cache behind the same signature.

export type EventsStatus = "loading" | "ready" | "unavailable";
export type EventsSnapshot = {
  status: EventsStatus;
  /** Live events (deletedAt null), ascending startsAt, then createdAt. */
  events: Event[];
};
export type EventsStore = {
  refresh(): Promise<void>;
  subscribe(listener: () => void): () => void;
  getSnapshot(): EventsSnapshot;
  /** CAL-013 Block 2. Hide one event from every snapshot at once; it stays
   *  hidden across refreshes until the returned reveal() is called. A count
   *  per id; each reveal() acts at most once. */
  hide(id: string): () => void;
};
export type EventsReader = Pick<EventsRepo, "listLive">;

function liveSorted(rows: Event[]): Event[] {
  return rows
    .filter((e) => e.deletedAt === null)
    .sort(
      (a, b) =>
        a.startsAt.getTime() - b.startsAt.getTime() ||
        a.createdAt.localeCompare(b.createdAt),
    );
}

export function createEventsStore(repo: EventsReader): EventsStore {
  // Replaced only on a change, so getSnapshot() is stable in between
  // (useSyncExternalStore requires it).
  let snapshot: EventsSnapshot = { status: "loading", events: [] };
  const listeners = new Set<() => void>();
  let refreshing: Promise<void> | null = null;
  // The rows the last refresh returned, before hiding; and the outstanding
  // hides per id.
  let rows: Event[] = [];
  const hidden = new Map<string, number>();

  const visible = () =>
    hidden.size === 0 ? rows : rows.filter((e) => !hidden.has(e.id));

  const publish = (status: EventsStatus) => {
    snapshot = { status, events: visible() };
    for (const listener of listeners) listener();
  };

  const refresh = (): Promise<void> => {
    if (refreshing !== null) return refreshing;
    refreshing = repo.listLive().then((result) => {
      refreshing = null;
      if (result.status === "ok") {
        rows = liveSorted(result.rows);
        publish("ready");
      } else publish("unavailable");
    });
    return refreshing;
  };

  return {
    refresh,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    hide(id) {
      hidden.set(id, (hidden.get(id) ?? 0) + 1);
      publish(snapshot.status);
      let revealed = false;
      return () => {
        if (revealed) return;
        revealed = true;
        const count = (hidden.get(id) ?? 1) - 1;
        if (count > 0) hidden.set(id, count);
        else hidden.delete(id);
        publish(snapshot.status);
      };
    },
  };
}

/**
 * The app's one store, over `eventsRepo(supabase)` from `../lib/supabase`,
 * which tests mock as they do for kindsStore.
 */
export const eventsStore: EventsStore = createEventsStore(eventsRepo(supabase));

/** Pure: the events overlapping `[start, end)` - `startsAt < end && endsAt > start`. */
export function eventsInRange(
  events: Event[],
  start: Date,
  end: Date,
): Event[] {
  const from = start.getTime();
  const to = end.getTime();
  return events.filter(
    (e) =>
      e.deletedAt === null &&
      e.startsAt.getTime() < to &&
      e.endsAt.getTime() > from,
  );
}

export function useEventsInRange(
  start: Date,
  end: Date,
  store: EventsStore = eventsStore,
): EventsSnapshot {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  // A store that has never loaded is asked once, from an effect - never
  // during render. Concurrent refreshes share one request.
  useEffect(() => {
    if (store.getSnapshot().status === "loading") void store.refresh();
  }, [store]);
  const from = start.getTime();
  const to = end.getTime();
  return useMemo(
    () => ({
      status: snapshot.status,
      events: eventsInRange(snapshot.events, new Date(from), new Date(to)),
    }),
    [snapshot, from, to],
  );
}
