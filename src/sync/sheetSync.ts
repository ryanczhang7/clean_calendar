import type { Event } from "../data/rows";
import { type CalendarDb, db } from "./db";
import type { Drain } from "./drain";
import { discardOp, type Repos, retryOp } from "./outbox";
import { appDrain, appRepos } from "./startSync";

// CAL-045 Contract, Block 1: the event sheet's door to the outbox. The sheet
// is a component and does not read Dexie itself; this factory over injected
// parts (shaped like eventActions) is what it is handed, defaulting to the
// app's instance below.

/** An event's failed op: its seq, and the stored error's message. */
export type FailedOp = { seq: number; message: string };

export type SheetSync = {
  /** The event's failed `events` op with the lowest seq, or null. Queued ops never count. */
  failedOp(eventId: string): Promise<FailedOp | null>;
  /** retryOp(db, seq), then one drain pass (drain.run()). */
  retry(seq: number): Promise<void>;
  /** discardOp(db, seq, repos), then the event's cache row as it now is (null if gone). */
  discard(seq: number, eventId: string): Promise<Event | null>;
};

export function createSheetSync(
  db: CalendarDb,
  drain: Pick<Drain, "run">,
  repos: Repos,
): SheetSync {
  return {
    async failedOp(eventId) {
      const op = (await db.outbox.orderBy("seq").toArray()).find(
        (o) =>
          o.status === "failed" && o.table === "events" && o.id === eventId,
      );
      if (op === undefined || op.seq === undefined) return null;
      return { seq: op.seq, message: op.error?.message ?? "" };
    },
    async retry(seq) {
      await retryOp(db, seq);
      await drain.run();
    },
    async discard(seq, eventId) {
      await discardOp(db, seq, repos);
      return (await db.events.get(eventId)) ?? null;
    },
  };
}

/** The app's: db, appDrain, appRepos (startSync.ts). */
export const sheetSync: SheetSync = createSheetSync(db, appDrain, appRepos);
