import type { EventsRepo } from "../data/events";
import type { Result } from "../data/result";
import type { Event, EventPatch, NewEvent } from "../data/rows";
import { type CalendarDb, db } from "./db";
import type { Drain } from "./drain";
import type { EventsStore } from "./eventsStore";
import {
  enqueueDelete,
  enqueueInsert,
  enqueueRestore,
  enqueueUpdate,
  queuedResult,
} from "./outbox";
import { appDrain } from "./startSync";

// Event writes (CAL-012, Contract Block 2). Exactly kindActions.ts's
// discipline. `createEventActions` is the in-memory factory, online through
// the repository: nothing throws and nothing retries; an ok result is not
// handed back until the store has refreshed, so a caller that awaits it sees
// the new snapshot. CAL-015 routes the app's actions through the outbox
// behind the same type (`createOutboxEventActions`, below).

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

/**
 * CAL-015 Contract, Block 4 (PO decision 1): the same EventActions over the
 * outbox. Each action writes the cache and queues one op, then resolves with
 * the cache row - never waiting for the server. The caller's
 * `expectedUpdatedAt` is ignored: the cache row's stamp is the token the
 * drain sends (PO decision 3).
 */
export function createOutboxEventActions(
  db: CalendarDb,
  drain: Pick<Drain, "run">,
  online: () => boolean = () => navigator.onLine,
): EventActions {
  return {
    createEvent: async (input) =>
      queuedResult(await enqueueInsert(db, "events", input), drain, online),
    updateEvent: async (id, patch) =>
      queuedResult(await enqueueUpdate(db, "events", id, patch), drain, online),
    removeEvent: async (event) =>
      queuedResult(await enqueueDelete(db, "events", event.id), drain, online),
    restoreEvent: async (deleted) =>
      queuedResult(
        await enqueueRestore(db, "events", deleted.id),
        drain,
        online,
      ),
  };
}

/** The app's actions: the outbox over the app's `db`, sent by `appDrain`. */
export const eventActions: EventActions = createOutboxEventActions(
  db,
  appDrain,
);
