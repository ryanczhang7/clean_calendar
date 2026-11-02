import type { Result } from "../data/result";
import type {
  EventOverride,
  EventOverridePatch,
  NewEventOverride,
} from "../data/rows";
import { type CalendarDb, db } from "./db";
import type { Drain } from "./drain";
import { enqueueInsert, enqueueUpdate, queuedResult } from "./outbox";
import { appDrain } from "./startSync";

// Override writes through the outbox (CAL-056 Contract, Block 1). Editing or
// cancelling one occurrence writes the override for (eventId, occurrenceDate):
// merged into the cached one when it exists, inserted otherwise - lookup and
// write in one Dexie transaction. An override has no deleted_at, so cancelling
// is `cancelled = true` and undoing it `cancelled = false` on the same row.
// Each action resolves with the cache row (queuedResult), never waiting for
// the server.

export type OverrideFields = Partial<
  Pick<
    NewEventOverride,
    "title" | "kindId" | "startsAt" | "endsAt" | "allDay" | "location" | "notes"
  >
>;

export type OverrideActions = {
  /** Upsert for (eventId, occurrenceDate): merge `fields` into the existing override, or create one. */
  setOverride(
    eventId: string,
    occurrenceDate: string,
    fields: OverrideFields,
  ): Promise<Result<EventOverride>>;
  /** cancelled = true on that occurrence's override (created if absent). */
  cancelOccurrence(
    eventId: string,
    occurrenceDate: string,
  ): Promise<Result<EventOverride>>;
  /** cancelled = false on the row cancelOccurrence returned. */
  restoreOccurrence(cancelled: EventOverride): Promise<Result<EventOverride>>;
};

/** The patch without its `undefined` keys: an undefined is "not given". */
function given(patch: EventOverridePatch): EventOverridePatch {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as EventOverridePatch;
}

/**
 * The override for (eventId, occurrenceDate) with `patch` applied: an update
 * of the cached one (none queued for an empty patch), or a new override with
 * every field not given null.
 */
function upsert(
  db: CalendarDb,
  eventId: string,
  occurrenceDate: string,
  patch: EventOverridePatch,
): Promise<EventOverride | null> {
  const named = given(patch);
  return db.transaction("rw", db.overrides, db.outbox, async () => {
    // (eventId, occurrenceDate) is the key the database holds unique.
    const existing = await db.overrides
      .where("eventId")
      .equals(eventId)
      .filter((o) => o.occurrenceDate === occurrenceDate)
      .first();
    if (existing === undefined) {
      const input: NewEventOverride = {
        eventId,
        occurrenceDate,
        cancelled: false,
        title: null,
        kindId: null,
        startsAt: null,
        endsAt: null,
        allDay: null,
        location: null,
        notes: null,
        ...named,
      };
      return enqueueInsert(db, "event_overrides", input);
    }
    if (Object.keys(named).length === 0) return existing;
    return enqueueUpdate(db, "event_overrides", existing.id, named);
  });
}

export function createOutboxOverrideActions(
  db: CalendarDb,
  drain: Pick<Drain, "run">,
  online: () => boolean = () => navigator.onLine,
): OverrideActions {
  return {
    setOverride: async (eventId, occurrenceDate, fields) =>
      queuedResult(
        await upsert(db, eventId, occurrenceDate, fields),
        drain,
        online,
      ),
    cancelOccurrence: async (eventId, occurrenceDate) =>
      queuedResult(
        await upsert(db, eventId, occurrenceDate, { cancelled: true }),
        drain,
        online,
      ),
    restoreOccurrence: async (cancelled) =>
      queuedResult(
        await enqueueUpdate(db, "event_overrides", cancelled.id, {
          cancelled: false,
        }),
        drain,
        online,
      ),
  };
}

/** The app's override actions: the outbox over the app's `db`, sent by `appDrain`. */
export const overrideActions: OverrideActions = createOutboxOverrideActions(
  db,
  appDrain,
);
