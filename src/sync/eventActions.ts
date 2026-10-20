import { type EventsRepo, eventsRepo } from "../data/events";
import type { Result } from "../data/result";
import type { Event, EventPatch, NewEvent } from "../data/rows";
import { supabase } from "../lib/supabase";
import { type EventsStore, eventsStore } from "./eventsStore";

// Event writes (CAL-012, Contract Block 2). Exactly kindActions.ts's
// discipline: online through the repository until CAL-015 routes them through
// the outbox behind the same signatures. Nothing throws and nothing retries;
// an ok result is not handed back until the store has refreshed, so a caller
// that awaits it sees the new snapshot.

export type EventActions = {
  createEvent(input: NewEvent): Promise<Result<Event>>;
  updateEvent(
    id: string,
    patch: EventPatch,
    expectedUpdatedAt: string,
  ): Promise<Result<Event>>;
  /** CAL-013 AC-4. Hides the event at once, then repo.remove(id, event.updatedAt). */
  removeEvent(event: Event): Promise<Result<Event>>;
  /** CAL-013 AC-5. repo.restore(deleted.id, deleted.updatedAt) - `deleted` is the row removeEvent returned. */
  restoreEvent(deleted: Event): Promise<Result<Event>>;
};

export function createEventActions(
  repo: Pick<EventsRepo, "insert" | "update" | "remove" | "restore">,
  store: Pick<EventsStore, "refresh" | "hide">,
): EventActions {
  const settle = async (pending: Promise<Result<Event>>) => {
    const result = await pending;
    if (result.status === "ok") await store.refresh();
    return result;
  };
  return {
    createEvent: (input) => settle(repo.insert(input)),
    updateEvent: (id, patch, expectedUpdatedAt) =>
      settle(repo.update(id, patch, expectedUpdatedAt)),
    removeEvent: async (event) => {
      // Hidden before the write is sent, so the view loses it at once.
      const reveal = store.hide(event.id);
      const result = await repo.remove(event.id, event.updatedAt);
      if (result.status === "ok") await store.refresh();
      reveal();
      return result;
    },
    restoreEvent: (deleted) =>
      settle(repo.restore(deleted.id, deleted.updatedAt)),
  };
}

/** The app's actions, over `eventsRepo(supabase)` and `eventsStore`. */
export const eventActions: EventActions = createEventActions(
  eventsRepo(supabase),
  eventsStore,
);
