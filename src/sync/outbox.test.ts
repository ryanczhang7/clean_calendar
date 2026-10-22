import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Event, Kind } from "../data/rows";
import { at, ev, freshDb, kind, T1, T2 } from "../test/cache-fixtures";
import {
  asRepos,
  type FakeRepos,
  fakeRepos,
  NEW_EVENT,
  NEW_KIND,
  NOW,
  NOW_TS,
  okRow,
  ops,
  opsWithoutSeq,
  S9,
  U1,
  U2,
} from "../test/outbox-fixtures";
import type { CalendarDb, OutboxOp } from "./db";
import { eventsInRange } from "./eventsStore";
import {
  discardOp,
  enqueueDelete,
  enqueueInsert,
  enqueueRestore,
  enqueueUpdate,
  failedCount,
  newId,
  nowTs,
  queuedCount,
  retryOp,
} from "./outbox";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-015 AC-1, Contract Blocks 2 and 4. MECHANICAL: the exact cache row and
// the exact op (minus `seq`) after each enqueue, in seq order. The cache is a
// real CalendarDb over a fresh fake-indexeddb factory; the client clock is
// pinned with a Date-only fake (fake-indexeddb schedules on real timers, so
// nothing else is faked) and `crypto.randomUUID` answers U1, U2 in turn.

let db: CalendarDb;
let repos: FakeRepos;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  db = freshDb();
  repos = fakeRepos();
  vi.spyOn(crypto, "randomUUID")
    .mockReturnValueOnce(U1)
    .mockReturnValueOnce(U2);
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** A cached event with the server stamp T1. */
const CACHED: Event = ev(1, at(10, 22, 9), at(10, 22, 10), {
  title: "Dentist",
  location: "Main St",
  updatedAt: T1,
});
const CACHED_KIND: Kind = kind(1, { name: "Gym", updatedAt: T1 });

describe("newId() and nowTs() (Block 2)", () => {
  it("newId() is crypto.randomUUID()", () => {
    expect(newId()).toBe(U1);
    expect(newId()).toBe(U2);
  });

  it("nowTs() is the client clock as an ISO string", () => {
    expect(nowTs()).toBe(NOW_TS);
  });
});

describe("enqueueInsert (AC-1, Block 2)", () => {
  it("an event: the cache row is the input with the new id, the client stamp as createdAt and updatedAt, not deleted - and it is returned", async () => {
    const want: Event = {
      ...NEW_EVENT,
      id: U1,
      createdAt: NOW_TS,
      updatedAt: NOW_TS,
      deletedAt: null,
    };
    await expect(enqueueInsert(db, "events", NEW_EVENT)).resolves.toStrictEqual(
      want,
    );
    expect(await db.events.get(U1)).toStrictEqual(want);
    expect(await db.events.count()).toBe(1);
  });

  it("an event: queues exactly one insert op carrying the input as its patch, no base stamp, queued", async () => {
    await enqueueInsert(db, "events", NEW_EVENT);
    expect(await opsWithoutSeq(db)).toStrictEqual([
      {
        op: "insert",
        table: "events",
        id: U1,
        patch: NEW_EVENT,
        baseUpdatedAt: null,
        clientTs: NOW_TS,
        status: "queued",
      },
    ]);
    expect((await ops(db))[0]?.seq).toBe(1);
  });

  it("a kind: the cache row and one insert op, the same way", async () => {
    const want: Kind = {
      ...NEW_KIND,
      id: U1,
      createdAt: NOW_TS,
      updatedAt: NOW_TS,
      deletedAt: null,
    };
    await expect(enqueueInsert(db, "kinds", NEW_KIND)).resolves.toStrictEqual(
      want,
    );
    expect(await db.kinds.get(U1)).toStrictEqual(want);
    expect(await opsWithoutSeq(db)).toStrictEqual([
      {
        op: "insert",
        table: "kinds",
        id: U1,
        patch: NEW_KIND,
        baseUpdatedAt: null,
        clientTs: NOW_TS,
        status: "queued",
      },
    ]);
  });
});

describe("enqueueUpdate (AC-1, Block 2)", () => {
  it("applies the patch to the cached row and returns it - updatedAt stays the server's stamp", async () => {
    await db.events.put(CACHED);
    const patch = { title: "Dentist (moved)", startsAt: at(10, 23, 9) };
    const want: Event = { ...CACHED, ...patch };
    await expect(
      enqueueUpdate(db, "events", CACHED.id, patch),
    ).resolves.toStrictEqual(want);
    const row = await db.events.get(CACHED.id);
    expect(row).toStrictEqual(want);
    // The contrast a naive optimistic write fails: it re-stamps the row.
    expect(row?.updatedAt).toBe(T1);
  });

  it("queues one update op: the patch as given, the cached stamp as baseUpdatedAt", async () => {
    await db.events.put(CACHED);
    await enqueueUpdate(db, "events", CACHED.id, { notes: "Bring card" });
    expect(await opsWithoutSeq(db)).toStrictEqual([
      {
        op: "update",
        table: "events",
        id: CACHED.id,
        patch: { notes: "Bring card" },
        baseUpdatedAt: T1,
        clientTs: NOW_TS,
        status: "queued",
      },
    ]);
  });

  it("a row the cache does not hold: resolves null and queues nothing", async () => {
    await expect(
      enqueueUpdate(db, "events", CACHED.id, { title: "x" }),
    ).resolves.toBeNull();
    expect(await db.outbox.count()).toBe(0);
    expect(await db.events.count()).toBe(0);
  });

  it("a kind: patched in the cache, one update op with its stamp", async () => {
    await db.kinds.put(CACHED_KIND);
    await expect(
      enqueueUpdate(db, "kinds", CACHED_KIND.id, { name: "Workouts" }),
    ).resolves.toStrictEqual({ ...CACHED_KIND, name: "Workouts" });
    expect(await opsWithoutSeq(db)).toStrictEqual([
      {
        op: "update",
        table: "kinds",
        id: CACHED_KIND.id,
        patch: { name: "Workouts" },
        baseUpdatedAt: T1,
        clientTs: NOW_TS,
        status: "queued",
      },
    ]);
  });
});

describe("enqueueDelete and enqueueRestore (AC-1, Block 2)", () => {
  it("delete: the cached row is marked deleted at the client stamp and leaves every view at once", async () => {
    await db.events.put(CACHED);
    const want: Event = { ...CACHED, deletedAt: NOW_TS };
    await expect(enqueueDelete(db, "events", CACHED.id)).resolves.toStrictEqual(
      want,
    );
    const rows = await db.events.toArray();
    expect(rows).toStrictEqual([want]);
    // The contrast: a delete that leaves the row live keeps it in the range.
    expect(eventsInRange(rows, at(10, 19), at(10, 26))).toStrictEqual([]);
  });

  it("delete: queues one delete op with no patch and the cached stamp", async () => {
    await db.events.put(CACHED);
    await enqueueDelete(db, "events", CACHED.id);
    expect(await opsWithoutSeq(db)).toStrictEqual([
      {
        op: "delete",
        table: "events",
        id: CACHED.id,
        patch: null,
        baseUpdatedAt: T1,
        clientTs: NOW_TS,
        status: "queued",
      },
    ]);
  });

  it("restore: the cached row is live again, and one restore op is queued", async () => {
    const deleted = { ...CACHED, deletedAt: T1, updatedAt: T2 };
    await db.events.put(deleted);
    await expect(
      enqueueRestore(db, "events", CACHED.id),
    ).resolves.toStrictEqual({ ...deleted, deletedAt: null });
    expect(await opsWithoutSeq(db)).toStrictEqual([
      {
        op: "restore",
        table: "events",
        id: CACHED.id,
        patch: null,
        baseUpdatedAt: T2,
        clientTs: NOW_TS,
        status: "queued",
      },
    ]);
  });

  it("delete or restore of a row the cache does not hold: null, nothing queued", async () => {
    await expect(enqueueDelete(db, "events", CACHED.id)).resolves.toBeNull();
    await expect(
      enqueueRestore(db, "kinds", CACHED_KIND.id),
    ).resolves.toBeNull();
    expect(await db.outbox.count()).toBe(0);
  });

  it("a kind delete marks the cached kind deleted and queues a delete op", async () => {
    await db.kinds.put(CACHED_KIND);
    await expect(
      enqueueDelete(db, "kinds", CACHED_KIND.id),
    ).resolves.toStrictEqual({ ...CACHED_KIND, deletedAt: NOW_TS });
    expect((await opsWithoutSeq(db)).map((o) => [o.op, o.table])).toStrictEqual(
      [["delete", "kinds"]],
    );
  });
});

describe("one op per action, in order, nothing coalesced (AC-1)", () => {
  it("create, edit, edit and delete of one new event: four ops in seq order, the cache row carrying every change", async () => {
    const created = await enqueueInsert(db, "events", NEW_EVENT);
    await enqueueUpdate(db, "events", created.id, { title: "Swim, lane 3" });
    await enqueueUpdate(db, "events", created.id, { location: "Pool" });
    await enqueueDelete(db, "events", created.id);
    const all = await ops(db);
    expect(all.map((o) => o.seq)).toStrictEqual([1, 2, 3, 4]);
    expect(await opsWithoutSeq(db)).toStrictEqual([
      {
        op: "insert",
        table: "events",
        id: U1,
        patch: NEW_EVENT,
        baseUpdatedAt: null,
        clientTs: NOW_TS,
        status: "queued",
      },
      {
        op: "update",
        table: "events",
        id: U1,
        patch: { title: "Swim, lane 3" },
        baseUpdatedAt: NOW_TS,
        clientTs: NOW_TS,
        status: "queued",
      },
      {
        op: "update",
        table: "events",
        id: U1,
        patch: { location: "Pool" },
        baseUpdatedAt: NOW_TS,
        clientTs: NOW_TS,
        status: "queued",
      },
      {
        op: "delete",
        table: "events",
        id: U1,
        patch: null,
        baseUpdatedAt: NOW_TS,
        clientTs: NOW_TS,
        status: "queued",
      },
    ]);
    expect(await db.events.get(U1)).toStrictEqual({
      ...NEW_EVENT,
      id: U1,
      title: "Swim, lane 3",
      location: "Pool",
      createdAt: NOW_TS,
      updatedAt: NOW_TS,
      deletedAt: NOW_TS,
    });
  });
});

/** Puts an op straight into the outbox and returns its seq. */
async function put(op: OutboxOp): Promise<number> {
  return db.outbox.add(op);
}
const queuedOp = (id: string, extra: Partial<OutboxOp> = {}): OutboxOp => ({
  op: "update",
  table: "events",
  id,
  patch: { title: "Mine" },
  baseUpdatedAt: T1,
  clientTs: NOW_TS,
  status: "queued",
  ...extra,
});
const ERROR = { code: "23514", message: "check violated", http: 400 };

describe("queuedCount and failedCount (Block 2)", () => {
  it("count the ops by status: none, then two queued and one failed", async () => {
    expect([await queuedCount(db), await failedCount(db)]).toStrictEqual([
      0, 0,
    ]);
    await put(queuedOp("a"));
    await put(queuedOp("b", { status: "failed", error: ERROR }));
    await put(queuedOp("c", { table: "kinds" }));
    expect([await queuedCount(db), await failedCount(db)]).toStrictEqual([
      2, 1,
    ]);
  });
});

describe("retryOp (AC-5, Block 4)", () => {
  it("puts a failed op back to queued with its error removed, everything else unchanged", async () => {
    const failed = queuedOp(CACHED.id, { status: "failed", error: ERROR });
    const seq = await put(failed);
    await retryOp(db, seq);
    const back = await db.outbox.get(seq);
    expect(back).toStrictEqual({ ...queuedOp(CACHED.id), seq });
    expect(back !== undefined && "error" in back).toBe(false);
  });
});

describe("discardOp (AC-5, Block 4)", () => {
  it("an update: the op is removed and the server copy, fetched once by id, replaces the cache row", async () => {
    await db.events.put({ ...CACHED, title: "Mine" });
    const server: Event = { ...CACHED, title: "Theirs", updatedAt: S9 };
    repos.events.get.mockResolvedValue(okRow(server));
    const seq = await put(
      queuedOp(CACHED.id, { status: "failed", error: ERROR }),
    );
    await put(queuedOp("other"));
    await discardOp(db, seq, asRepos(repos));
    expect(repos.events.get).toHaveBeenCalledTimes(1);
    expect(repos.events.get).toHaveBeenCalledWith(CACHED.id);
    expect(await db.events.get(CACHED.id)).toStrictEqual(server);
    expect((await ops(db)).map((o) => o.id)).toStrictEqual(["other"]);
  });

  it("an insert: the op and the cache row are both removed, and nothing is fetched", async () => {
    const created = await enqueueInsert(db, "events", NEW_EVENT);
    const [op] = await ops(db);
    await db.outbox.update(op?.seq ?? 0, { status: "failed", error: ERROR });
    await discardOp(db, op?.seq ?? 0, asRepos(repos));
    expect(await db.events.get(created.id)).toBeUndefined();
    expect(await db.outbox.count()).toBe(0);
    expect(repos.events.get).not.toHaveBeenCalled();
  });

  it("a fetch that is not ok removes the op and leaves the cache row as it is", async () => {
    const mine = { ...CACHED, title: "Mine" };
    await db.events.put(mine);
    const seq = await put(
      queuedOp(CACHED.id, { status: "failed", error: ERROR }),
    );
    await discardOp(db, seq, asRepos(repos)); // get answers offline
    expect(await db.outbox.count()).toBe(0);
    expect(await db.events.get(CACHED.id)).toStrictEqual(mine);
  });

  it("a kind's op is restored from the kinds repository, not the events one", async () => {
    await db.kinds.put({ ...CACHED_KIND, name: "Mine" });
    const server: Kind = { ...CACHED_KIND, name: "Theirs", updatedAt: S9 };
    repos.kinds.get.mockResolvedValue(okRow(server));
    const seq = await put(
      queuedOp(CACHED_KIND.id, {
        table: "kinds",
        patch: { name: "Mine" },
        status: "failed",
        error: ERROR,
      }),
    );
    await discardOp(db, seq, asRepos(repos));
    expect(repos.kinds.get).toHaveBeenCalledWith(CACHED_KIND.id);
    expect(repos.events.get).not.toHaveBeenCalled();
    expect(await db.kinds.get(CACHED_KIND.id)).toStrictEqual(server);
  });
});
