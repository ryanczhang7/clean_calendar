import type { Result } from "../data/result";
import type { Reminder } from "../data/rows";
import { type CalendarDb, db } from "./db";
import type { Drain } from "./drain";
import {
  enqueueDelete,
  enqueueInsert,
  enqueueRestore,
  enqueueUpdate,
  queuedResult,
} from "./outbox";
import { appDrain } from "./startSync";

// Reminder writes through the outbox (CAL-026 Contract, Block 4). An event has
// at most one template: the cached reminder with its eventId and
// occurrenceDate null, live or soft-deleted. Setting a reminder updates that
// row, restores it when it was cleared, or inserts one when there is none -
// never a second template, because the database holds (event_id,
// occurrence_date) unique even for a cleared row. Lookup and writes run in one
// Dexie transaction, so two calls at once cannot both insert. Each action
// resolves with the cache row (queuedResult), never waiting for the server.

export type ReminderActions = {
  /** Set the event's template to `minutesBefore`: insert, update, or restore + update. */
  setReminder(
    eventId: string,
    minutesBefore: number,
  ): Promise<Result<Reminder>>;
  /** Soft-delete the event's live template; `ok` with `row: null` when there is none. */
  clearReminder(eventId: string): Promise<Result<Reminder | null>>;
};

const isLive = (r: Reminder): boolean => r.deletedAt == null;

/** The event's template, a live one first; must run inside the transaction. */
async function templateOf(
  db: CalendarDb,
  eventId: string,
): Promise<Reminder | undefined> {
  const templates = await db.reminders
    .where("eventId")
    .equals(eventId)
    .filter((r) => r.occurrenceDate === null)
    .toArray();
  return templates.find(isLive) ?? templates[0];
}

function set(
  db: CalendarDb,
  eventId: string,
  minutesBefore: number,
): Promise<Reminder | null> {
  return db.transaction("rw", db.reminders, db.outbox, async () => {
    const existing = await templateOf(db, eventId);
    if (existing === undefined) {
      return enqueueInsert(db, "reminders", {
        eventId,
        minutesBefore,
        sentAt: null,
        occurrenceDate: null,
      });
    }
    let row: Reminder | null = existing;
    if (!isLive(existing)) {
      row = await enqueueRestore(db, "reminders", existing.id);
    }
    if (row === null || row.minutesBefore === minutesBefore) return row;
    return enqueueUpdate(db, "reminders", existing.id, { minutesBefore });
  });
}

/** The cleared row, `"none"` when there was no live template to clear. */
function clear(db: CalendarDb, eventId: string): Promise<Reminder | "none"> {
  return db.transaction("rw", db.reminders, db.outbox, async () => {
    const existing = await templateOf(db, eventId);
    if (existing === undefined || !isLive(existing)) return "none";
    return (await enqueueDelete(db, "reminders", existing.id)) ?? "none";
  });
}

export function createOutboxReminderActions(
  db: CalendarDb,
  drain: Pick<Drain, "run">,
  online: () => boolean = () => navigator.onLine,
): ReminderActions {
  return {
    setReminder: async (eventId, minutesBefore) =>
      queuedResult(await set(db, eventId, minutesBefore), drain, online),
    clearReminder: async (eventId) => {
      const cleared = await clear(db, eventId);
      if (cleared === "none") return { status: "ok", row: null };
      return queuedResult<Reminder | null>(cleared, drain, online);
    },
  };
}

/** The app's reminder actions: the outbox over the app's `db`, sent by `appDrain`. */
export const reminderActions: ReminderActions = createOutboxReminderActions(
  db,
  appDrain,
);
