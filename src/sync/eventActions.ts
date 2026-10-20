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
};

export function createEventActions(
  repo: Pick<EventsRepo, "insert" | "update">,
  store: Pick<EventsStore, "refresh">,
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
  };
}

/** The app's actions, over `eventsRepo(supabase)` and `eventsStore`. */
export const eventActions: EventActions = createEventActions(
  eventsRepo(supabase),
  eventsStore,
);
