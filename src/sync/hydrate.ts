import type { Table } from "dexie";
import type { ListResult } from "../data/result";
import type { Event, EventOverride, Kind } from "../data/rows";
import type { CalendarDb, OutboxOp } from "./db";

// Incremental hydration of the cache from the server (CAL-014 AC-1, AC-2;
// Contract Block 2). Each table keeps its own high-water mark in `meta`.
// The mark is the server's `updated_at` string, compared as a string and
// sent back byte for byte: PostgREST writes every stamp in one offset, so
// string order is time order there, and a `Date` would drop microseconds.
// Known limit (PO decision 8): a row committed after a pass with exactly the
// mark's stamp is missed by `gt`; CAL-033 owns `updated_at`.

export type SyncRepos = {
  kinds: { listSince(since: string): Promise<ListResult<Kind>> };
  events: { listSince(since: string): Promise<ListResult<Event>> };
  overrides: { listSince(since: string): Promise<ListResult<EventOverride>> };
};

export const EPOCH = "1970-01-01T00:00:00+00:00";

export type SyncResult = { status: "ok" } | { status: "unavailable" };

type Synced = { id: string; updatedAt: string };

// The outbox's name for each cached table (CAL-015 Block 5).
const OUTBOX_TABLE: Record<string, OutboxOp["table"]> = {
  kinds: "kinds",
  events: "events",
  overrides: "event_overrides",
};

/** One table's step of a pass; false when the server did not answer ok. */
async function pull<T extends Synced>(
  db: CalendarDb,
  table: Table<T, string>,
  repo: { listSince(since: string): Promise<ListResult<T>> },
): Promise<boolean> {
  const key = `mark:${table.name}`;
  const mark = (await db.meta.get(key))?.value ?? EPOCH;
  const result = await repo.listSince(mark);
  if (result.status !== "ok") return false;
  if (result.rows.length === 0) return true;
  let greatest = result.rows[0]?.updatedAt ?? mark;
  for (const row of result.rows) {
    if (row.updatedAt > greatest) greatest = row.updatedAt;
  }
  // Rows and mark together: a mark never moves past rows not written. A row
  // with a queued or failed op is not written (CAL-015 Block 5, PO decision
  // 6): the optimistic patch would be overwritten and reappear only when its
  // op lands. The mark still moves past it; the drain writes its stamps.
  await db.transaction("rw", table, db.meta, db.outbox, async () => {
    const opTable = OUTBOX_TABLE[table.name];
    const pending = new Set(
      (await db.outbox.toArray())
        .filter((op) => op.table === opTable)
        .map((op) => op.id),
    );
    await table.bulkPut(
      pending.size === 0
        ? result.rows
        : result.rows.filter((row) => !pending.has(row.id)),
    );
    await db.meta.put({ key, value: greatest });
  });
  return true;
}

/** One pass: kinds, then events, then overrides. Never throws. */
export async function hydrate(
  db: CalendarDb,
  repos: SyncRepos,
): Promise<SyncResult> {
  try {
    const ok =
      (await pull(db, db.kinds, repos.kinds)) &&
      (await pull(db, db.events, repos.events)) &&
      (await pull(db, db.overrides, repos.overrides));
    return ok ? { status: "ok" } : { status: "unavailable" };
  } catch {
    // A cache that cannot be opened or written.
    return { status: "unavailable" };
  }
}

export type Sync = { run(): Promise<SyncResult> };

/** Concurrent run() calls share one in-flight pass. */
export function createSync(db: CalendarDb, repos: SyncRepos): Sync {
  let inFlight: Promise<SyncResult> | null = null;
  return {
    run() {
      if (inFlight === null) {
        inFlight = hydrate(db, repos).finally(() => {
          inFlight = null;
        });
      }
      return inFlight;
    },
  };
}
