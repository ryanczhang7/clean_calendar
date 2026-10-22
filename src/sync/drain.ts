import type { Result } from "../data/result";
import type { Event, Kind } from "../data/rows";
import type { CalendarDb, OutboxOp } from "./db";
import {
  type CacheTable,
  cacheTable,
  enqueueDelete,
  type Repos,
} from "./outbox";

// The outbox drain (CAL-015 AC-2 to AC-6, Contract Block 3; architecture.md,
// conflict rule). One pass sends the queued ops one at a time in `seq` order:
// it repeatedly takes the queued op with the lowest seq above the last one it
// handled, so an op queued mid-pass - or a delete the pass re-queues - is sent
// by the same pass. The conditional token is the cache row's CURRENT
// `updatedAt`: optimistic writes never change it, and an op that landed
// earlier in the pass has already written the server's new one.
//
//   ok        → the cache row takes the server's stamps only, the op goes.
//   conflict  → get(id): deleted there → replaced, dropped, silent (AC-4);
//               live and ours a delete → replaced, delete queued again (AC-4);
//               live otherwise → replaced, dropped, `conflict` notice (AC-3).
//   4xx       → marked failed, `failed` notice, the pass goes on (AC-5).
//   5xx, no http status, offline → left queued untouched, the pass stops (AC-6).
//
// Nothing throws. The drain knows nothing of React; SyncStatus turns the
// notices into toasts (PO decision 7).

type NoticeTable = "events" | "kinds";
type OpError = { code: string; message: string; http?: number };

export type DrainNotice =
  /** AC-2's toast; only an announced pass that sent something. */
  | { kind: "drained"; count: number }
  /** AC-3. `title` is the fresh server row's (a kind: its name). */
  | {
      kind: "conflict";
      table: NoticeTable;
      id: string;
      title: string;
      fields: string[];
      patch: unknown;
      freshUpdatedAt: string;
    }
  /** AC-5. `title` is the cache row's at the time - what the user typed. */
  | {
      kind: "failed";
      seq: number;
      table: NoticeTable;
      id: string;
      title: string;
      error: OpError;
    }
  /** The outbox changed: counts are worth re-reading. */
  | { kind: "changed" };

export type DrainResult = {
  sent: number;
  stoppedAt: "end" | "offline" | "server";
};

export type Drain = {
  /** One pass over the queued ops in seq order; concurrent calls share a pass. */
  run(opts?: { announce?: boolean }): Promise<DrainResult>;
  subscribe(listener: (n: DrainNotice) => void): () => void;
};

type Row = Event | Kind;

/** The members a pass calls, the same for both tables (kinds have no restore). */
type AnyRepo = {
  insert(input: never, id: string): Promise<Result<Row>>;
  update(id: string, patch: never, token: string): Promise<Result<Row>>;
  remove(id: string, token: string): Promise<Result<Row>>;
  restore?(id: string, token: string): Promise<Result<Row>>;
  get(id: string): Promise<Result<Row>>;
};

const titleOf = (row: Row): string => ("title" in row ? row.title : row.name);

/** A title for a row the cache no longer holds: the op's own, if it names one. */
function titleFromPatch(patch: unknown): string {
  if (typeof patch !== "object" || patch === null) return "";
  const p = patch as { title?: unknown; name?: unknown };
  if (typeof p.title === "string") return p.title;
  return typeof p.name === "string" ? p.name : "";
}

/** What a pass does with an answer that is neither ok nor a conflict. */
type Failure = Exclude<Result<Row>, { status: "ok" } | { status: "conflict" }>;
type Verdict = { stop: "offline" | "server" } | { failed: OpError };

function judge(failure: Failure): Verdict {
  if (failure.status === "offline") return { stop: "offline" };
  const { code, message, http } = failure;
  if (http !== undefined && http >= 400 && http < 500) {
    return { failed: { code, message, http } };
  }
  return { stop: "server" };
}

export function createDrain(
  db: CalendarDb,
  repos: Repos,
  online: () => boolean = () => navigator.onLine,
): Drain {
  const listeners = new Set<(n: DrainNotice) => void>();
  const emit = (notice: DrainNotice) => {
    for (const listener of [...listeners]) listener(notice);
  };
  let inFlight: Promise<DrainResult> | null = null;
  let announce = false;

  const repoFor = (table: CacheTable): AnyRepo =>
    table === "events" ? repos.events : repos.kinds;

  /** Sends one op. "offline" / "server" end the pass; anything else goes on. */
  async function send(
    op: OutboxOp & { seq: number; table: CacheTable },
  ): Promise<"sent" | "changed" | "skipped" | "offline" | "server"> {
    const table = op.table;
    const rows = cacheTable(db, table);
    const repo = repoFor(table);
    const cached = await rows.get(op.id);
    const token = cached?.updatedAt ?? op.baseUpdatedAt ?? "";

    let result: Result<Row>;
    switch (op.op) {
      case "insert":
        result = await repo.insert(op.patch as never, op.id);
        break;
      case "update":
        result = await repo.update(op.id, op.patch as never, token);
        break;
      case "delete":
        result = await repo.remove(op.id, token);
        break;
      case "restore":
        if (repo.restore === undefined) return "skipped";
        result = await repo.restore(op.id, token);
        break;
    }

    if (result.status === "ok") {
      const { updatedAt, createdAt, deletedAt } = result.row;
      // The stamps only, so a later queued patch on the row stays visible.
      await db.transaction("rw", rows, db.outbox, async () => {
        await rows.update(op.id, { updatedAt, createdAt, deletedAt });
        await db.outbox.delete(op.seq);
      });
      return "sent";
    }

    if (result.status === "conflict") {
      const fresh = await repo.get(op.id);
      if (fresh.status === "conflict") {
        // The row is gone from the server altogether: nothing to apply to.
        await db.transaction("rw", rows, db.outbox, async () => {
          await rows.delete(op.id);
          await db.outbox.delete(op.seq);
        });
        return "changed";
      }
      if (fresh.status !== "ok") return verdict(op, judge(fresh), cached);
      const row = fresh.row;
      await db.transaction("rw", rows, db.outbox, async () => {
        await rows.put(row);
        await db.outbox.delete(op.seq);
        // Deletes win (AC-4): ours goes again, over the fresh stamp.
        if (row.deletedAt === null && op.op === "delete") {
          await enqueueDelete(db, table, op.id);
        }
      });
      if (row.deletedAt === null && op.op !== "delete") {
        emit({
          kind: "conflict",
          table,
          id: op.id,
          title: titleOf(row),
          fields: fieldNames(table, op.patch),
          patch: op.patch,
          freshUpdatedAt: row.updatedAt,
        });
      }
      return "changed";
    }

    return verdict(op, judge(result), cached);
  }

  async function verdict(
    op: OutboxOp & { seq: number; table: CacheTable },
    v: Verdict,
    cached: Row | undefined,
  ): Promise<"changed" | "offline" | "server"> {
    if ("stop" in v) return v.stop;
    await db.outbox.update(op.seq, { status: "failed", error: v.failed });
    emit({
      kind: "failed",
      seq: op.seq,
      table: op.table,
      id: op.id,
      title: cached === undefined ? titleFromPatch(op.patch) : titleOf(cached),
      error: v.failed,
    });
    return "changed";
  }

  async function pass(): Promise<DrainResult> {
    if (!online()) return { sent: 0, stoppedAt: "offline" };
    let sent = 0;
    let changed = false;
    let stoppedAt: DrainResult["stoppedAt"] = "end";
    let last = 0;
    try {
      for (;;) {
        const op = await db.outbox
          .where("seq")
          .above(last)
          .filter((o) => o.status === "queued")
          .first();
        if (op === undefined || op.seq === undefined) break;
        last = op.seq;
        // Override and reminder ops arrive with CAL-025 / CAL-026.
        if (op.table !== "events" && op.table !== "kinds") continue;
        const outcome = await send({ ...op, seq: op.seq, table: op.table });
        if (outcome === "sent") {
          sent += 1;
          changed = true;
        } else if (outcome === "changed") {
          changed = true;
        } else if (outcome !== "skipped") {
          stoppedAt = outcome;
          break;
        }
      }
    } catch {
      // A cache that cannot be read or written: stop, keep what is queued.
      stoppedAt = "server";
    }
    if (changed) emit({ kind: "changed" });
    if (announce && sent > 0) emit({ kind: "drained", count: sent });
    return { sent, stoppedAt };
  }

  return {
    run(opts) {
      // A joiner that asks for the announcement gets it for the shared pass.
      if (opts?.announce === true) announce = true;
      if (inFlight === null) {
        inFlight = pass().finally(() => {
          inFlight = null;
          announce = false;
        });
      }
      return inFlight;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// --- copy ---------------------------------------------------------------------

/** voice.md's plain field names, in voice.md's order. */
const EVENT_FIELDS: [key: string, name: string][] = [
  ["title", "title"],
  ["kindId", "kind"],
  ["startsAt", "start time"],
  ["endsAt", "end time"],
  ["allDay", "all day"],
  ["location", "location"],
  ["notes", "notes"],
  ["recurrence", "repeat"],
];
const KIND_FIELDS: [key: string, name: string][] = [
  ["name", "name"],
  ["colorLight", "colour"],
  ["colorDark", "colour"],
  ["sortOrder", "order"],
];

/** Plain field names, voice.md: title, kind, start time, end time, all day, location, notes, repeat; kinds: name, colour, order. */
export function fieldNames(
  table: "events" | "kinds",
  patch: unknown,
): string[] {
  if (typeof patch !== "object" || patch === null) return [];
  const keys = Object.keys(patch);
  const known = table === "events" ? EVENT_FIELDS : KIND_FIELDS;
  const names: string[] = [];
  for (const [key, name] of known) {
    if (keys.includes(key) && !names.includes(name)) names.push(name);
  }
  // A key voice.md does not name (origin, captureJobId, …) reads as itself.
  const mapped = new Set(known.map(([key]) => key));
  for (const key of keys) if (!mapped.has(key)) names.push(key);
  return names;
}

/** "a", "a and b", "a, b and c". */
function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** voice.md's conflict toast, singular or plural. */
export function conflictCopy(fields: string[]): string {
  return fields.length === 1
    ? `Edited elsewhere; your change to ${list(fields)} was not applied.`
    : `Edited elsewhere; your changes to ${list(fields)} were not applied.`;
}
