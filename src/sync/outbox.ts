import type { Table } from "dexie";
import type { EventsRepo } from "../data/events";
import type { KindsRepo } from "../data/kinds";
import type { Result } from "../data/result";
import type {
  Event,
  EventPatch,
  Kind,
  KindPatch,
  NewEvent,
  NewKind,
} from "../data/rows";
import type { CalendarDb, OutboxOp } from "./db";
// Types only: drain.ts imports this module at run time, never the reverse.
import type { Drain } from "./drain";

// The optimistic write (CAL-015 AC-1, Contract Blocks 2 and 4;
// architecture.md, "Where state lives"). Every enqueue writes the cache row
// and appends one op in one Dexie transaction, and resolves with the cache row
// as it now is - never waiting for the server. An optimistic write never
// touches `updatedAt`: it stays the last stamp the server gave, which is the
// conditional token the drain sends (PO decision 3). Nothing coalesces.

/** The repository members the drain and `discardOp` need (Block 2, amended by RED). */
export type Repos = {
  events: Pick<EventsRepo, "insert" | "update" | "remove" | "restore" | "get">;
  kinds: Pick<KindsRepo, "insert" | "update" | "remove" | "get">;
};

export type CacheTable = "events" | "kinds";
type Row = Event | Kind;

export function newId(): string {
  return crypto.randomUUID();
}

export function nowTs(): string {
  return new Date().toISOString();
}

/** The cache table an op's `table` names. One type for both, so callers stay generic. */
export function cacheTable(
  db: CalendarDb,
  table: CacheTable,
): Table<Row, string> {
  return (table === "events" ? db.events : db.kinds) as Table<Row, string>;
}

/** The patch without its `undefined` keys: an undefined is "not mentioned" (rows.ts). */
function defined<P extends object>(patch: P): P {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) out[key] = value;
  }
  return out as P;
}

function queued(
  op: OutboxOp["op"],
  table: CacheTable,
  id: string,
  patch: unknown,
  baseUpdatedAt: string | null,
  clientTs: string,
): OutboxOp {
  return { op, table, id, patch, baseUpdatedAt, clientTs, status: "queued" };
}

export function enqueueInsert(
  db: CalendarDb,
  table: "events",
  input: NewEvent,
): Promise<Event>;
export function enqueueInsert(
  db: CalendarDb,
  table: "kinds",
  input: NewKind,
): Promise<Kind>;
export async function enqueueInsert(
  db: CalendarDb,
  table: CacheTable,
  input: NewEvent | NewKind,
): Promise<Row> {
  const id = newId();
  const ts = nowTs();
  const row = {
    ...input,
    id,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  } as Row;
  const rows = cacheTable(db, table);
  await db.transaction("rw", rows, db.outbox, async () => {
    await rows.put(row);
    await db.outbox.add(queued("insert", table, id, input, null, ts));
  });
  return row;
}

/**
 * Reads the cached row, writes `change(row)` back and queues one op based on
 * the row's stamp - all in one transaction. A row the cache does not hold
 * resolves null and queues nothing.
 */
function rewrite(
  db: CalendarDb,
  table: CacheTable,
  id: string,
  op: OutboxOp["op"],
  patch: unknown,
  change: (row: Row, ts: string) => Row,
): Promise<Row | null> {
  const rows = cacheTable(db, table);
  const ts = nowTs();
  return db.transaction("rw", rows, db.outbox, async () => {
    const current = await rows.get(id);
    if (current === undefined) return null;
    const next = change(current, ts);
    await rows.put(next);
    await db.outbox.add(queued(op, table, id, patch, current.updatedAt, ts));
    return next;
  });
}

export function enqueueUpdate(
  db: CalendarDb,
  table: "events",
  id: string,
  patch: EventPatch,
): Promise<Event | null>;
export function enqueueUpdate(
  db: CalendarDb,
  table: "kinds",
  id: string,
  patch: KindPatch,
): Promise<Kind | null>;
export function enqueueUpdate(
  db: CalendarDb,
  table: CacheTable,
  id: string,
  patch: EventPatch | KindPatch,
): Promise<Row | null> {
  const named = defined(patch);
  // `updatedAt` is not touched: the patch carries domain fields only.
  return rewrite(db, table, id, "update", named, (row) => ({
    ...row,
    ...named,
  }));
}

export function enqueueDelete(
  db: CalendarDb,
  table: "events",
  id: string,
): Promise<Event | null>;
export function enqueueDelete(
  db: CalendarDb,
  table: "kinds",
  id: string,
): Promise<Kind | null>;
export function enqueueDelete(
  db: CalendarDb,
  table: CacheTable,
  id: string,
): Promise<Event | Kind | null>;
export function enqueueDelete(
  db: CalendarDb,
  table: CacheTable,
  id: string,
): Promise<Row | null> {
  // Marked deleted at the client stamp, so it leaves every view at once.
  return rewrite(db, table, id, "delete", null, (row, ts) => ({
    ...row,
    deletedAt: ts,
  }));
}

export function enqueueRestore(
  db: CalendarDb,
  table: "events",
  id: string,
): Promise<Event | null>;
export function enqueueRestore(
  db: CalendarDb,
  table: "kinds",
  id: string,
): Promise<Kind | null>;
export function enqueueRestore(
  db: CalendarDb,
  table: CacheTable,
  id: string,
): Promise<Event | Kind | null>;
export function enqueueRestore(
  db: CalendarDb,
  table: CacheTable,
  id: string,
): Promise<Row | null> {
  return rewrite(db, table, id, "restore", null, (row) => ({
    ...row,
    deletedAt: null,
  }));
}

/** A failed op back to queued, its `error` key removed. Runs no drain: its callers do. */
export async function retryOp(db: CalendarDb, seq: number): Promise<void> {
  await db.transaction("rw", db.outbox, async () => {
    const op = await db.outbox.get(seq);
    if (op === undefined) return;
    const { error: _error, ...rest } = op;
    await db.outbox.put({ ...rest, status: "queued" });
  });
}

/**
 * Drops the op. An insert's cache row goes with it; any other op's row is
 * replaced by the server copy, fetched by id - left as it is when the fetch
 * is not ok (AC-5, Block 4).
 */
export async function discardOp(
  db: CalendarDb,
  seq: number,
  repos: Repos,
): Promise<void> {
  const op = await db.outbox.get(seq);
  if (op === undefined) return;
  await db.outbox.delete(seq);
  if (op.table !== "events" && op.table !== "kinds") return;
  const rows = cacheTable(db, op.table);
  if (op.op === "insert") {
    await rows.delete(op.id);
    return;
  }
  const fresh = await repos[op.table].get(op.id);
  if (fresh.status === "ok") await rows.put(fresh.row);
}

/**
 * What an outbox action resolves to (Block 4): the enqueued cache row, or a
 * conflict for a row the cache does not hold. Online, the op is sent at once
 * by one drain run that is neither awaited nor announced (PO decision 7).
 */
export function queuedResult<T>(
  row: T | null,
  drain: Pick<Drain, "run">,
  online: () => boolean,
): Result<T> {
  if (row === null) return { status: "conflict" };
  if (online()) void drain.run();
  return { status: "ok", row };
}

export function queuedCount(db: CalendarDb): Promise<number> {
  return db.outbox.filter((op) => op.status === "queued").count();
}

export function failedCount(db: CalendarDb): Promise<number> {
  return db.outbox.filter((op) => op.status === "failed").count();
}
