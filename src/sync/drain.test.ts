import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Result } from "../data/result";
import type {
  Event,
  EventOverride,
  Kind,
  NewEventOverride,
  NewReminder,
  Reminder,
} from "../data/rows";
import {
  at,
  ev,
  freshDb,
  kind,
  override,
  reminder,
  T1,
  T2,
} from "../test/cache-fixtures";
import {
  asRepos,
  type FakeRepos,
  fakeRepos,
  held,
  NEW_EVENT,
  NOW,
  NOW_TS,
  okRow,
  ops,
  opsWithoutSeq,
  S1,
  S2,
  S3,
  S9,
  SERVER_CREATED,
  SERVER_DELETED,
  U1,
} from "../test/outbox-fixtures";
import type { CalendarDb, OutboxOp } from "./db";
import {
  conflictCopy,
  createDrain,
  type Drain,
  type DrainNotice,
  fieldNames,
} from "./drain";
import {
  enqueueDelete,
  enqueueInsert,
  enqueueRestore,
  enqueueUpdate,
} from "./outbox";

// CAL-015 AC-2 to AC-6, Contract Block 3. MECHANICAL: which repository member
// is called with which arguments and in which order (`mock.invocationCallOrder`),
// what the cache and the outbox hold after the pass, and which notices the
// subscriber received. A real CalendarDb over a fresh fake-indexeddb factory;
// vi.fn repositories (outbox-fixtures). The client clock is a Date-only fake.

let db: CalendarDb;
let repos: FakeRepos;
let online: boolean;
let drain: Drain;
let notices: DrainNotice[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(U1);
  db = freshDb();
  repos = fakeRepos();
  online = true;
  drain = createDrain(db, asRepos(repos), () => online);
  notices = [];
  drain.subscribe((n) => notices.push(n));
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete (navigator as { onLine?: boolean }).onLine;
});

const ROW: Event = ev(1, at(10, 22, 9), at(10, 22, 10), {
  title: "Dentist",
  location: "Main St",
  updatedAt: T1,
});
const OTHER: Event = ev(2, at(10, 23, 9), at(10, 23, 10), {
  title: "Gym",
  updatedAt: T1,
});
const KIND: Kind = kind(1, { name: "Gym", updatedAt: T1 });

/** The server's copy of `row`: its fields, the server's stamps. */
const server = (row: Event, extra: Partial<Event> = {}): Event => ({
  ...row,
  createdAt: SERVER_CREATED,
  updatedAt: S1,
  ...extra,
});

const of = <K extends DrainNotice["kind"]>(kindName: K) =>
  notices.filter(
    (n): n is Extract<DrainNotice, { kind: K }> => n.kind === kindName,
  );

const ERR = (http?: number): Result<Event> =>
  http === undefined
    ? { status: "error", code: "XX000", message: "boom" }
    : { status: "error", code: "22P02", message: "invalid input", http };

describe("ops are sent in seq order and leave the outbox as the server accepts them (AC-2)", () => {
  it("ops for one row drain in seq order: the insert, then the update with the stamp the insert returned", async () => {
    online = false;
    await enqueueInsert(db, "events", NEW_EVENT);
    await enqueueUpdate(db, "events", U1, { title: "Swim, lane 3" });
    const inserted = server({ ...NEW_EVENT, id: U1 } as Event, {
      deletedAt: null,
      updatedAt: S1,
    });
    repos.events.insert.mockResolvedValue(okRow(inserted));
    repos.events.update.mockResolvedValue(
      okRow({ ...inserted, title: "Swim, lane 3", updatedAt: S2 }),
    );
    online = true;
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 2,
      stoppedAt: "end",
    });
    expect(repos.events.insert.mock.calls).toStrictEqual([[NEW_EVENT, U1]]);
    expect(repos.events.update.mock.calls).toStrictEqual([
      [U1, { title: "Swim, lane 3" }, S1],
    ]);
    const [insertAt] = repos.events.insert.mock.invocationCallOrder;
    const [updateAt] = repos.events.update.mock.invocationCallOrder;
    expect(insertAt).toBeLessThan(updateAt ?? 0);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.events.get(U1)).toStrictEqual({
      ...NEW_EVENT,
      id: U1,
      title: "Swim, lane 3",
      createdAt: SERVER_CREATED,
      updatedAt: S2,
      deletedAt: null,
    });
  });

  it("an op stays in the outbox while its request is in flight and is removed once the server accepts it", async () => {
    await db.events.put(ROW);
    await enqueueUpdate(db, "events", ROW.id, { title: "Dentist (moved)" });
    const answer = held<Result<Event>>();
    repos.events.update.mockReturnValue(answer.promise);
    const pass = drain.run();
    await vi.waitFor(() => expect(repos.events.update).toHaveBeenCalled());
    expect(await db.outbox.count()).toBe(1);
    answer.release(okRow(server(ROW, { title: "Dentist (moved)" })));
    await pass;
    expect(await db.outbox.count()).toBe(0);
  });

  it("each op is sent with the cache row's current stamp: a second edit of a row goes with the stamp the first one got", async () => {
    await db.events.put(ROW);
    await enqueueUpdate(db, "events", ROW.id, { title: "A" });
    await enqueueUpdate(db, "events", ROW.id, { notes: "B" });
    repos.events.update
      .mockResolvedValueOnce(okRow(server(ROW, { title: "A", updatedAt: S1 })))
      .mockResolvedValueOnce(
        okRow(server(ROW, { title: "A", notes: "B", updatedAt: S2 })),
      );
    await drain.run();
    expect(repos.events.update.mock.calls).toStrictEqual([
      [ROW.id, { title: "A" }, T1],
      [ROW.id, { notes: "B" }, S1],
    ]);
    expect((await db.events.get(ROW.id))?.updatedAt).toBe(S2);
  });

  it("the cache row takes only the server's stamps: a later queued patch stays visible after an earlier op lands", async () => {
    await db.events.put(ROW);
    await enqueueUpdate(db, "events", ROW.id, { title: "A" });
    await enqueueUpdate(db, "events", ROW.id, { location: "Pool" });
    const second = held<Result<Event>>();
    // The server's row after op 1 still has the OLD location.
    repos.events.update
      .mockResolvedValueOnce(okRow(server(ROW, { title: "A", updatedAt: S1 })))
      .mockReturnValueOnce(second.promise);
    const pass = drain.run();
    await vi.waitFor(() =>
      expect(repos.events.update).toHaveBeenCalledTimes(2),
    );
    expect(await db.events.get(ROW.id)).toStrictEqual({
      ...ROW,
      title: "A",
      location: "Pool",
      createdAt: SERVER_CREATED,
      updatedAt: S1,
    });
    second.release(
      okRow(server(ROW, { title: "A", location: "Pool", updatedAt: S2 })),
    );
    await pass;
  });

  it("a delete and a restore that land take the server's deletedAt and stamp", async () => {
    await db.events.bulkPut([ROW, OTHER]);
    await enqueueDelete(db, "events", ROW.id);
    await db.events.put({ ...OTHER, deletedAt: T1 });
    await db.outbox.add({
      op: "restore",
      table: "events",
      id: OTHER.id,
      patch: null,
      baseUpdatedAt: T1,
      clientTs: NOW_TS,
      status: "queued",
    });
    await db.events.update(OTHER.id, { deletedAt: null });
    repos.events.remove.mockResolvedValue(
      okRow(server(ROW, { deletedAt: SERVER_DELETED, updatedAt: S1 })),
    );
    repos.events.restore.mockResolvedValue(
      okRow(server(OTHER, { deletedAt: null, updatedAt: S2 })),
    );
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 2,
      stoppedAt: "end",
    });
    expect(repos.events.remove.mock.calls).toStrictEqual([[ROW.id, T1]]);
    expect(repos.events.restore.mock.calls).toStrictEqual([[OTHER.id, T1]]);
    expect(await db.events.get(ROW.id)).toStrictEqual({
      ...ROW,
      deletedAt: SERVER_DELETED,
      createdAt: SERVER_CREATED,
      updatedAt: S1,
    });
    expect(await db.events.get(OTHER.id)).toStrictEqual({
      ...OTHER,
      deletedAt: null,
      createdAt: SERVER_CREATED,
      updatedAt: S2,
    });
  });

  it("a kind's ops go to the kinds repository: insert with the client id, update with the cached stamp", async () => {
    await db.kinds.put(KIND);
    await enqueueUpdate(db, "kinds", KIND.id, { name: "Workouts" });
    repos.kinds.update.mockResolvedValue(
      okRow({ ...KIND, name: "Workouts", updatedAt: S1 }),
    );
    await drain.run();
    expect(repos.kinds.update.mock.calls).toStrictEqual([
      [KIND.id, { name: "Workouts" }, T1],
    ]);
    expect(repos.events.update).not.toHaveBeenCalled();
    expect(await db.kinds.get(KIND.id)).toStrictEqual({
      ...KIND,
      name: "Workouts",
      updatedAt: S1,
    });
  });

  it("an op queued while a pass is in flight is sent by that pass", async () => {
    await db.events.bulkPut([ROW, OTHER]);
    await enqueueUpdate(db, "events", ROW.id, { title: "A" });
    const first = held<Result<Event>>();
    repos.events.update
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(okRow(server(OTHER, { title: "B" })));
    const pass = drain.run();
    await vi.waitFor(() => expect(repos.events.update).toHaveBeenCalled());
    await enqueueUpdate(db, "events", OTHER.id, { title: "B" });
    first.release(okRow(server(ROW, { title: "A" })));
    await expect(pass).resolves.toStrictEqual({ sent: 2, stoppedAt: "end" });
    expect(repos.events.update.mock.calls.map((c) => c[0])).toStrictEqual([
      ROW.id,
      OTHER.id,
    ]);
  });
});

describe("run() (Block 3)", () => {
  it("an empty outbox: nothing is sent, the pass ends", async () => {
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 0,
      stoppedAt: "end",
    });
  });

  it("offline at the start: returns at once, nothing sent, the ops untouched", async () => {
    await db.events.put(ROW);
    await enqueueUpdate(db, "events", ROW.id, { title: "A" });
    const before = await ops(db);
    online = false;
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 0,
      stoppedAt: "offline",
    });
    expect(repos.events.update).not.toHaveBeenCalled();
    expect(await ops(db)).toStrictEqual(before);
  });

  it("online defaults to navigator.onLine", async () => {
    await db.events.put(ROW);
    await enqueueUpdate(db, "events", ROW.id, { title: "A" });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    const byNavigator = createDrain(db, asRepos(repos));
    await expect(byNavigator.run()).resolves.toStrictEqual({
      sent: 0,
      stoppedAt: "offline",
    });
    expect(repos.events.update).not.toHaveBeenCalled();
  });

  it("two concurrent run() calls share one pass: each op sent once, both resolve with the same result", async () => {
    await db.events.put(ROW);
    await enqueueUpdate(db, "events", ROW.id, { title: "A" });
    repos.events.update.mockResolvedValue(okRow(server(ROW, { title: "A" })));
    const [a, b] = await Promise.all([drain.run(), drain.run()]);
    expect(repos.events.update).toHaveBeenCalledTimes(1);
    expect(a).toStrictEqual({ sent: 1, stoppedAt: "end" });
    expect(b).toStrictEqual(a);
  });

  it("a run() after the previous pass settled is a new pass", async () => {
    await db.events.put(ROW);
    await enqueueUpdate(db, "events", ROW.id, { title: "A" });
    repos.events.update.mockResolvedValue(okRow(server(ROW, { title: "A" })));
    await drain.run();
    await enqueueUpdate(db, "events", ROW.id, { title: "B" });
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 1,
      stoppedAt: "end",
    });
    expect(repos.events.update).toHaveBeenCalledTimes(2);
  });

  it("unsubscribing stops the notices", async () => {
    const late: DrainNotice[] = [];
    const stop = drain.subscribe((n) => late.push(n));
    stop();
    await db.events.put(ROW);
    await enqueueUpdate(db, "events", ROW.id, { title: "A" });
    repos.events.update.mockResolvedValue(okRow(server(ROW, { title: "A" })));
    await drain.run({ announce: true });
    expect(late).toStrictEqual([]);
    expect(of("drained")).toHaveLength(1);
  });
});

describe('"Back online. {n} changes synced." is announced only by an announced pass (AC-2, PO decision 7)', () => {
  async function queueThree() {
    await db.events.bulkPut([ROW, OTHER]);
    await enqueueUpdate(db, "events", ROW.id, { title: "A" });
    await enqueueUpdate(db, "events", OTHER.id, { title: "B" });
    await enqueueUpdate(db, "events", ROW.id, { notes: "C" });
    repos.events.update.mockImplementation(async (id) =>
      okRow(server(id === ROW.id ? ROW : OTHER)),
    );
  }

  it("an announced pass that sent three ops emits one drained notice with count 3", async () => {
    await queueThree();
    await drain.run({ announce: true });
    expect(of("drained")).toStrictEqual([{ kind: "drained", count: 3 }]);
  });

  it("an unannounced pass sends the same ops and announces nothing", async () => {
    await queueThree();
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 3,
      stoppedAt: "end",
    });
    expect(of("drained")).toStrictEqual([]);
  });

  it("an announced pass that sent nothing announces nothing", async () => {
    await drain.run({ announce: true });
    expect(of("drained")).toStrictEqual([]);
  });

  it("a pass that changed the outbox emits a changed notice", async () => {
    await queueThree();
    await drain.run();
    expect(of("changed").length).toBeGreaterThan(0);
    expect(of("changed")[0]).toStrictEqual({ kind: "changed" });
  });
});

describe("a conditional update that matches zero rows (AC-3)", () => {
  it("re-fetches the row once, replaces the cache copy whole, drops the op and emits a conflict notice", async () => {
    await db.events.put(ROW);
    await enqueueUpdate(db, "events", ROW.id, { title: "Mine" });
    const fresh = server(ROW, { title: "Theirs", notes: "x", updatedAt: S9 });
    repos.events.update.mockResolvedValue({ status: "conflict" });
    repos.events.get.mockResolvedValue(okRow(fresh));
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 0,
      stoppedAt: "end",
    });
    expect(repos.events.get.mock.calls).toStrictEqual([[ROW.id]]);
    expect(await db.events.get(ROW.id)).toStrictEqual(fresh);
    expect(await db.outbox.count()).toBe(0);
    expect(of("conflict")).toStrictEqual([
      {
        kind: "conflict",
        table: "events",
        id: ROW.id,
        title: "Theirs",
        fields: ["title"],
        patch: { title: "Mine" },
        freshUpdatedAt: S9,
      },
    ]);
  });

  it("several fields are named in the notice, in voice.md's order", async () => {
    await db.events.put(ROW);
    await enqueueUpdate(db, "events", ROW.id, {
      location: "Pool",
      title: "Mine",
    });
    repos.events.update.mockResolvedValue({ status: "conflict" });
    repos.events.get.mockResolvedValue(okRow(server(ROW, { updatedAt: S9 })));
    await drain.run();
    expect(of("conflict").map((n) => n.fields)).toStrictEqual([
      ["title", "location"],
    ]);
  });

  it("a later op for the same row stays queued and is sent with the fresh stamp", async () => {
    await db.events.put(ROW);
    await enqueueUpdate(db, "events", ROW.id, { title: "Mine" });
    await enqueueUpdate(db, "events", ROW.id, { notes: "N" });
    repos.events.update
      .mockResolvedValueOnce({ status: "conflict" })
      .mockResolvedValueOnce(okRow(server(ROW, { notes: "N", updatedAt: S3 })));
    repos.events.get.mockResolvedValue(okRow(server(ROW, { updatedAt: S9 })));
    await drain.run();
    expect(repos.events.update.mock.calls).toStrictEqual([
      [ROW.id, { title: "Mine" }, T1],
      [ROW.id, { notes: "N" }, S9],
    ]);
    expect(await db.outbox.count()).toBe(0);
  });

  it("a kind's conflict names the kind's fields and its fresh name", async () => {
    await db.kinds.put(KIND);
    await enqueueUpdate(db, "kinds", KIND.id, {
      colorLight: "#000000",
      colorDark: "#FFFFFF",
    });
    const fresh: Kind = { ...KIND, name: "Workouts", updatedAt: S9 };
    repos.kinds.update.mockResolvedValue({ status: "conflict" });
    repos.kinds.get.mockResolvedValue(okRow(fresh));
    await drain.run();
    expect(repos.kinds.get.mock.calls).toStrictEqual([[KIND.id]]);
    expect(await db.kinds.get(KIND.id)).toStrictEqual(fresh);
    expect(of("conflict")).toStrictEqual([
      {
        kind: "conflict",
        table: "kinds",
        id: KIND.id,
        title: "Workouts",
        fields: ["colour"],
        patch: { colorLight: "#000000", colorDark: "#FFFFFF" },
        freshUpdatedAt: S9,
      },
    ]);
  });

  it("a re-fetch that is offline leaves the op queued and unchanged and stops the pass", async () => {
    await db.events.bulkPut([ROW, OTHER]);
    await enqueueUpdate(db, "events", ROW.id, { title: "Mine" });
    await enqueueDelete(db, "events", OTHER.id);
    const before = await ops(db);
    repos.events.update.mockResolvedValue({ status: "conflict" });
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 0,
      stoppedAt: "offline",
    });
    expect(await ops(db)).toStrictEqual(before);
    expect(repos.events.remove).not.toHaveBeenCalled();
    expect(of("conflict")).toStrictEqual([]);
  });
});

describe("deletes win over edits, in either order (AC-4, PO decision 5)", () => {
  it("an edit that reaches the server after a delete is dropped without a notice, and the row ends deleted", async () => {
    await db.events.bulkPut([ROW, OTHER]);
    await enqueueUpdate(db, "events", ROW.id, { title: "Mine" });
    await enqueueUpdate(db, "events", OTHER.id, { title: "Mine too" });
    const theirDelete = server(ROW, {
      deletedAt: SERVER_DELETED,
      updatedAt: S9,
    });
    const theirEdit = server(OTHER, { title: "Theirs", updatedAt: S9 });
    repos.events.update.mockResolvedValue({ status: "conflict" });
    repos.events.get.mockImplementation(async (id) =>
      okRow(id === ROW.id ? theirDelete : theirEdit),
    );
    await drain.run();
    expect(await db.events.get(ROW.id)).toStrictEqual(theirDelete);
    expect(await db.outbox.count()).toBe(0);
    // Silent for the deleted row; the live conflict beside it is announced,
    // so the subscriber was listening.
    expect(of("conflict").map((n) => n.id)).toStrictEqual([OTHER.id]);
    expect(of("failed")).toStrictEqual([]);
  });

  it("a delete that conflicts with a newer live row is queued again over the fresh row", async () => {
    await db.events.put(ROW);
    await enqueueDelete(db, "events", ROW.id);
    const theirEdit = server(ROW, { title: "Theirs", updatedAt: S9 });
    const finalRow = server(ROW, {
      title: "Theirs",
      deletedAt: SERVER_DELETED,
      updatedAt: S3,
    });
    repos.events.remove
      .mockResolvedValueOnce({ status: "conflict" })
      .mockResolvedValueOnce(okRow(finalRow));
    repos.events.get.mockResolvedValue(okRow(theirEdit));
    await drain.run();
    expect(repos.events.get.mock.calls).toStrictEqual([[ROW.id]]);
    expect(repos.events.remove.mock.calls).toStrictEqual([
      [ROW.id, T1],
      [ROW.id, S9],
    ]);
    expect(await db.events.get(ROW.id)).toStrictEqual(finalRow);
    expect(await db.outbox.count()).toBe(0);
    expect(of("conflict")).toStrictEqual([]);
  });

  it("the re-queued delete, while it waits, keeps the row out of the views and records the fresh stamp", async () => {
    await db.events.put(ROW);
    await enqueueDelete(db, "events", ROW.id);
    repos.events.remove
      .mockResolvedValueOnce({ status: "conflict" })
      .mockResolvedValueOnce({ status: "offline" });
    repos.events.get.mockResolvedValue(
      okRow(server(ROW, { title: "Theirs", updatedAt: S9 })),
    );
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 0,
      stoppedAt: "offline",
    });
    expect(await opsWithoutSeq(db)).toStrictEqual([
      {
        op: "delete",
        table: "events",
        id: ROW.id,
        patch: null,
        baseUpdatedAt: S9,
        clientTs: NOW_TS,
        status: "queued",
      },
    ]);
    expect(await db.events.get(ROW.id)).toStrictEqual(
      server(ROW, { title: "Theirs", updatedAt: S9, deletedAt: NOW_TS }),
    );
  });
});

// CAL-044 AC-1 and AC-2, Contract Block 3. MECHANICAL. The owner's undo of a
// delete is a restore op; when its conditional write matches zero rows, the
// deletes-win rule above must not swallow it. "No notice" is pinned as the
// whole notice stream: the pass's own `changed` signal and nothing else.
describe("a conflicted restore keeps the owner's undo (CAL-044 AC-1, AC-2)", () => {
  /** ROW as the cache holds it after the owner's delete landed: deleted, stamp T1. */
  const deletedRow: Event = { ...ROW, deletedAt: T1 };

  it("a restore that meets a row the other device re-stamped while deleted is queued again over the fresh row, sent by the same pass, and lands silently", async () => {
    await db.events.put(deletedRow);
    await enqueueRestore(db, "events", ROW.id);
    const theirs = server(ROW, { deletedAt: SERVER_DELETED, updatedAt: S9 });
    const finalRow = server(ROW, { deletedAt: null, updatedAt: S3 });
    repos.events.restore
      .mockResolvedValueOnce({ status: "conflict" })
      .mockResolvedValueOnce(okRow(finalRow));
    repos.events.get.mockResolvedValue(okRow(theirs));
    await drain.run();
    expect(repos.events.restore.mock.calls).toStrictEqual([
      [ROW.id, T1],
      [ROW.id, S9],
    ]);
    expect(repos.events.get.mock.calls).toStrictEqual([[ROW.id]]);
    expect(await db.events.get(ROW.id)).toStrictEqual(finalRow);
    expect(await db.outbox.count()).toBe(0);
    expect(notices).toStrictEqual([{ kind: "changed" }]);
  });

  it("the re-queued restore, while it waits, keeps the row live in the views and records the fresh stamp", async () => {
    await db.events.put(deletedRow);
    await enqueueRestore(db, "events", ROW.id);
    const theirs = server(ROW, { deletedAt: SERVER_DELETED, updatedAt: S9 });
    repos.events.restore
      .mockResolvedValueOnce({ status: "conflict" })
      .mockResolvedValueOnce({ status: "offline" });
    repos.events.get.mockResolvedValue(okRow(theirs));
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 0,
      stoppedAt: "offline",
    });
    expect(await opsWithoutSeq(db)).toStrictEqual([
      {
        op: "restore",
        table: "events",
        id: ROW.id,
        patch: null,
        baseUpdatedAt: S9,
        clientTs: NOW_TS,
        status: "queued",
      },
    ]);
    expect(await db.events.get(ROW.id)).toStrictEqual({
      ...theirs,
      deletedAt: null,
    });
    expect(notices).toStrictEqual([{ kind: "changed" }]);
  });

  it("a restore that meets a row another device already restored is dropped without a notice and the cache takes the server copy", async () => {
    await db.events.bulkPut([deletedRow, OTHER]);
    await enqueueRestore(db, "events", ROW.id);
    await enqueueUpdate(db, "events", OTHER.id, { title: "Mine too" });
    const theirRestore = server(ROW, { deletedAt: null, updatedAt: S9 });
    const theirEdit = server(OTHER, { title: "Theirs", updatedAt: S9 });
    repos.events.restore.mockResolvedValue({ status: "conflict" });
    repos.events.update.mockResolvedValue({ status: "conflict" });
    repos.events.get.mockImplementation(async (id) =>
      okRow(id === ROW.id ? theirRestore : theirEdit),
    );
    await drain.run();
    expect(repos.events.restore.mock.calls).toStrictEqual([[ROW.id, T1]]);
    expect(await db.events.get(ROW.id)).toStrictEqual(theirRestore);
    expect(await db.outbox.count()).toBe(0);
    // Silent for the restored row; the ordinary conflict beside it is
    // announced, so the subscriber was listening.
    expect(notices).toStrictEqual([
      {
        kind: "conflict",
        table: "events",
        id: OTHER.id,
        title: "Theirs",
        fields: ["title"],
        patch: { title: "Mine too" },
        freshUpdatedAt: S9,
      },
      { kind: "changed" },
    ]);
  });
});

describe("a 4xx other than a conflict marks the op failed and the pass goes on (AC-5)", () => {
  it.each([400, 404, 422])(
    "http %i: the op stays, failed, with the error; the next op is still sent; one failed notice",
    async (http) => {
      await db.events.bulkPut([ROW, OTHER]);
      await enqueueUpdate(db, "events", ROW.id, { title: "Mine" });
      await enqueueUpdate(db, "events", OTHER.id, { title: "Next" });
      const [first] = await ops(db);
      repos.events.update
        .mockResolvedValueOnce(ERR(http))
        .mockResolvedValueOnce(okRow(server(OTHER, { title: "Next" })));
      await expect(drain.run()).resolves.toStrictEqual({
        sent: 1,
        stoppedAt: "end",
      });
      const error = { code: "22P02", message: "invalid input", http };
      expect(await ops(db)).toStrictEqual([
        { ...(first as OutboxOp), status: "failed", error },
      ]);
      expect(repos.events.update).toHaveBeenCalledTimes(2);
      expect(of("failed")).toStrictEqual([
        {
          kind: "failed",
          seq: first?.seq,
          table: "events",
          id: ROW.id,
          title: "Mine",
          error,
        },
      ]);
    },
  );

  it("a failed op is skipped by the next pass", async () => {
    await db.events.put(ROW);
    await enqueueUpdate(db, "events", ROW.id, { title: "Mine" });
    repos.events.update.mockResolvedValue(ERR(400));
    await drain.run();
    repos.events.update.mockClear();
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 0,
      stoppedAt: "end",
    });
    expect(repos.events.update).not.toHaveBeenCalled();
    expect((await ops(db))[0]?.status).toBe("failed");
  });

  it("a refused insert keeps its optimistic row in the cache", async () => {
    online = false;
    const created = await enqueueInsert(db, "events", NEW_EVENT);
    online = true;
    repos.events.insert.mockResolvedValue({
      status: "error",
      code: "23514",
      message: "check violated",
      http: 400,
    });
    await drain.run();
    expect(await db.events.get(U1)).toStrictEqual(created);
    expect((await ops(db))[0]?.status).toBe("failed");
  });
});

describe("a 5xx, a network error or offline keeps the op queued and stops the pass (AC-6)", () => {
  const cases: [string, Result<Event>, "server" | "offline"][] = [
    ["http 500", ERR(500), "server"],
    ["http 503", ERR(503), "server"],
    ["an error with no http status", ERR(), "server"],
    ["offline", { status: "offline" }, "offline"],
  ];

  it.each(cases)(
    "%s: the op is unchanged, the next op is not sent, and the next run() with the network back sends both in order",
    async (_name, answer, stoppedAt) => {
      await db.events.bulkPut([ROW, OTHER]);
      await enqueueUpdate(db, "events", ROW.id, { title: "Mine" });
      await enqueueDelete(db, "events", OTHER.id);
      const before = await ops(db);
      repos.events.update.mockResolvedValueOnce(answer);
      await expect(drain.run()).resolves.toStrictEqual({ sent: 0, stoppedAt });
      expect(await ops(db)).toStrictEqual(before);
      expect(repos.events.remove).not.toHaveBeenCalled();
      expect(of("failed")).toStrictEqual([]);

      repos.events.update.mockResolvedValueOnce(
        okRow(server(ROW, { title: "Mine" })),
      );
      repos.events.remove.mockResolvedValueOnce(
        okRow(server(OTHER, { deletedAt: SERVER_DELETED })),
      );
      await expect(drain.run({ announce: true })).resolves.toStrictEqual({
        sent: 2,
        stoppedAt: "end",
      });
      const [updateAt] = repos.events.update.mock.invocationCallOrder.slice(1);
      const [removeAt] = repos.events.remove.mock.invocationCallOrder;
      expect(updateAt).toBeLessThan(removeAt ?? 0);
      expect(await db.outbox.count()).toBe(0);
      expect(of("drained")).toStrictEqual([{ kind: "drained", count: 2 }]);
    },
  );
});

describe("fieldNames(table, patch) - voice.md's plain field names (AC-3, Block 3)", () => {
  it.each([
    ["title", { title: "x" }],
    ["kind", { kindId: "k" }],
    ["start time", { startsAt: at(10, 1) }],
    ["end time", { endsAt: at(10, 1) }],
    ["all day", { allDay: true }],
    ["location", { location: "x" }],
    ["notes", { notes: "x" }],
    ["repeat", { recurrence: null }],
  ])('an event patch naming one field reads "%s"', (name, patch) => {
    expect(fieldNames("events", patch)).toStrictEqual([name]);
  });

  it("keys never in a UI patch map to their own key", () => {
    expect(
      fieldNames("events", { origin: "capture", captureJobId: null }),
    ).toStrictEqual(["origin", "captureJobId"]);
  });

  it("every event field at once, in voice.md's order whatever the key order", () => {
    expect(
      fieldNames("events", {
        recurrence: null,
        notes: "n",
        location: "l",
        allDay: false,
        endsAt: at(10, 1),
        startsAt: at(10, 1),
        kindId: "k",
        title: "t",
      }),
    ).toStrictEqual([
      "title",
      "kind",
      "start time",
      "end time",
      "all day",
      "location",
      "notes",
      "repeat",
    ]);
  });

  it.each([
    [["name"], { name: "x" }],
    [["colour"], { colorLight: "#000000" }],
    [["colour"], { colorDark: "#000000" }],
    [["colour"], { colorLight: "#000000", colorDark: "#FFFFFF" }],
    [["order"], { sortOrder: 2 }],
    [["name", "colour", "order"], { sortOrder: 2, colorDark: "#0", name: "x" }],
  ])("a kind patch reads %j", (names, patch) => {
    expect(fieldNames("kinds", patch)).toStrictEqual(names);
  });
});

describe("conflictCopy(fields) - voice.md's conflict toast (AC-3)", () => {
  it("one field", () => {
    expect(conflictCopy(["title"])).toBe(
      "Edited elsewhere; your change to title was not applied.",
    );
  });

  it("two fields", () => {
    expect(conflictCopy(["title", "location"])).toBe(
      "Edited elsewhere; your changes to title and location were not applied.",
    );
  });

  it("three fields: a, b and c", () => {
    expect(conflictCopy(["title", "start time", "notes"])).toBe(
      "Edited elsewhere; your changes to title, start time and notes were not applied.",
    );
  });
});

// CAL-056 AC-4, Contract Block 3: the drain sends event_overrides ops through
// the overrides repository. The ops are put straight into the outbox, so these
// cases depend on the drain alone and not on outbox.ts's enqueue overloads. An
// override has no deleted_at: the ok branch copies createdAt and updatedAt only,
// and a live fresh row on a conflict is announced like an event's.
describe("event_overrides ops (CAL-056 AC-4, Block 3)", () => {
  const OVR: EventOverride = override(1, "2026-10-27", {
    title: "Review (moved)",
    location: "Room 9",
    updatedAt: T1,
  });
  const { id: _id, createdAt: _c, updatedAt: _u, ...OVR_INPUT } = OVR;
  const NEW_OVR: NewEventOverride = OVR_INPUT;

  const overrideOp = (extra: Partial<OutboxOp>): OutboxOp => ({
    op: "update",
    table: "event_overrides",
    id: OVR.id,
    patch: { cancelled: true },
    baseUpdatedAt: T2,
    clientTs: NOW_TS,
    status: "queued",
    ...extra,
  });

  it("an insert op calls the overrides repository's insert(patch, id), once, and no other repository", async () => {
    await db.overrides.put(OVR);
    await db.outbox.add(
      overrideOp({ op: "insert", patch: NEW_OVR, baseUpdatedAt: null }),
    );
    repos.overrides.insert.mockResolvedValue(
      okRow({ ...OVR, createdAt: SERVER_CREATED, updatedAt: S1 }),
    );
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 1,
      stoppedAt: "end",
    });
    expect(repos.overrides.insert.mock.calls).toStrictEqual([
      [NEW_OVR, OVR.id],
    ]);
    expect(repos.overrides.update).not.toHaveBeenCalled();
    expect(repos.events.insert).not.toHaveBeenCalled();
    expect(repos.kinds.insert).not.toHaveBeenCalled();
    expect(await db.outbox.count()).toBe(0);
  });

  it("an update op calls update(id, patch, the cache row's updatedAt) - not the op's baseUpdatedAt", async () => {
    await db.overrides.put(OVR);
    await db.outbox.add(overrideOp({}));
    repos.overrides.update.mockResolvedValue(
      okRow({ ...OVR, cancelled: true, updatedAt: S1 }),
    );
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 1,
      stoppedAt: "end",
    });
    expect(repos.overrides.update.mock.calls).toStrictEqual([
      [OVR.id, { cancelled: true }, T1],
    ]);
    expect(repos.events.update).not.toHaveBeenCalled();
    expect(repos.kinds.update).not.toHaveBeenCalled();
    expect(await db.outbox.count()).toBe(0);
  });

  it("on ok the cached override takes the server's createdAt and updatedAt only, and gains no deletedAt key", async () => {
    await db.overrides.put(OVR);
    await db.outbox.add(overrideOp({}));
    // The server's row differs in a field too: only the stamps are copied.
    repos.overrides.update.mockResolvedValue(
      okRow({
        ...OVR,
        title: "Server",
        cancelled: true,
        createdAt: SERVER_CREATED,
        updatedAt: S1,
      }),
    );
    await drain.run();
    const row = await db.overrides.get(OVR.id);
    expect(row).toStrictEqual({
      ...OVR,
      createdAt: SERVER_CREATED,
      updatedAt: S1,
    });
    expect(Object.keys(row ?? {})).not.toContain("deletedAt");
  });

  it("an insert then an update of one override drain in seq order, the update sent with the stamp the insert returned", async () => {
    await db.overrides.put(OVR);
    await db.outbox.add(
      overrideOp({ op: "insert", patch: NEW_OVR, baseUpdatedAt: null }),
    );
    await db.outbox.add(overrideOp({ baseUpdatedAt: OVR.updatedAt }));
    repos.overrides.insert.mockResolvedValue(
      okRow({ ...OVR, createdAt: SERVER_CREATED, updatedAt: S1 }),
    );
    repos.overrides.update.mockResolvedValue(
      okRow({ ...OVR, cancelled: true, updatedAt: S2 }),
    );
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 2,
      stoppedAt: "end",
    });
    expect(repos.overrides.update.mock.calls).toStrictEqual([
      [OVR.id, { cancelled: true }, S1],
    ]);
    expect((await db.overrides.get(OVR.id))?.updatedAt).toBe(S2);
  });

  it("a conflict: the fresh server override replaces the cached one, the op is dropped, and a conflict notice names the fields in voice.md's words", async () => {
    await db.overrides.put(OVR);
    await db.outbox.add(
      overrideOp({ patch: { cancelled: true, title: "Mine" } }),
    );
    const fresh: EventOverride = {
      ...OVR,
      title: "Theirs",
      notes: "x",
      updatedAt: S9,
    };
    repos.overrides.update.mockResolvedValue({ status: "conflict" });
    repos.overrides.get.mockResolvedValue(okRow(fresh));
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 0,
      stoppedAt: "end",
    });
    expect(repos.overrides.get.mock.calls).toStrictEqual([[OVR.id]]);
    expect(repos.events.get).not.toHaveBeenCalled();
    expect(await db.overrides.get(OVR.id)).toStrictEqual(fresh);
    expect(await db.outbox.count()).toBe(0);
    expect(of("conflict")).toStrictEqual([
      {
        kind: "conflict",
        table: "event_overrides",
        id: OVR.id,
        title: "Theirs",
        fields: ["title", "cancelled"],
        patch: { cancelled: true, title: "Mine" },
        freshUpdatedAt: S9,
      },
    ]);
  });

  it("a conflict over a fresh override with no title names an empty title (Block 3)", async () => {
    await db.overrides.put(OVR);
    await db.outbox.add(overrideOp({}));
    repos.overrides.update.mockResolvedValue({ status: "conflict" });
    repos.overrides.get.mockResolvedValue(
      okRow({ ...OVR, title: null, updatedAt: S9 }),
    );
    await drain.run();
    expect(of("conflict")).toStrictEqual([
      {
        kind: "conflict",
        table: "event_overrides",
        id: OVR.id,
        title: "",
        fields: ["cancelled"],
        patch: { cancelled: true },
        freshUpdatedAt: S9,
      },
    ]);
  });

  it("an override op queued between two event ops is sent in seq order, and the pass goes on to the event op after it", async () => {
    await db.events.put(ROW);
    await db.overrides.put(OVR);
    await enqueueUpdate(db, "events", ROW.id, { title: "First" });
    await db.outbox.add(overrideOp({}));
    await enqueueUpdate(db, "events", ROW.id, { notes: "Third" });
    repos.events.update.mockResolvedValue(okRow(server(ROW)));
    repos.overrides.update.mockResolvedValue(
      okRow({ ...OVR, cancelled: true, updatedAt: S2 }),
    );
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 3,
      stoppedAt: "end",
    });
    const [firstAt, thirdAt] = repos.events.update.mock.invocationCallOrder;
    const [overrideAt] = repos.overrides.update.mock.invocationCallOrder;
    expect(firstAt).toBeLessThan(overrideAt ?? 0);
    expect(overrideAt).toBeLessThan(thirdAt ?? 0);
    expect(await db.outbox.count()).toBe(0);
  });
});

describe("fieldNames for event_overrides - voice.md's plain field names (CAL-056 AC-4, Block 3)", () => {
  it.each([
    ["title", { title: "x" }],
    ["start time", { startsAt: at(10, 1) }],
    ["end time", { endsAt: at(10, 1) }],
    ["all day", { allDay: true }],
    ["location", { location: "x" }],
    ["notes", { notes: "x" }],
    ["kind", { kindId: "k" }],
    ["cancelled", { cancelled: true }],
  ])('an override patch naming one field reads "%s"', (name, patch) => {
    expect(fieldNames("event_overrides", patch)).toStrictEqual([name]);
  });

  it("every override field at once, in Block 3's order whatever the key order", () => {
    expect(
      fieldNames("event_overrides", {
        cancelled: false,
        kindId: "k",
        notes: "n",
        location: "l",
        allDay: false,
        endsAt: at(10, 1),
        startsAt: at(10, 1),
        title: "t",
      }),
    ).toStrictEqual([
      "title",
      "start time",
      "end time",
      "all day",
      "location",
      "notes",
      "kind",
      "cancelled",
    ]);
  });
});

// CAL-026 AC-4, Contract Block 6: the fourth table. A reminders op is sent
// through the reminders repository exactly as an event op is through the
// events one - insert(patch, id), update / remove / restore with the cache
// row's CURRENT updatedAt - and on ok the cache row takes the server's stamps,
// deletedAt included. A conflict notice names the field "reminder" and is
// titled by the reminder's event (a reminder has no title of its own).
describe("reminders ops (CAL-026 AC-4, Block 6)", () => {
  const SERIES: Event = ev(5, at(10, 27, 9), at(10, 27, 10), {
    title: "Standup",
    updatedAt: T1,
  });
  const REM: Reminder = reminder(1, {
    eventId: SERIES.id,
    minutesBefore: 15,
    updatedAt: T1,
  });
  const NEW_REM: NewReminder = {
    eventId: SERIES.id,
    minutesBefore: 15,
    sentAt: null,
    occurrenceDate: null,
  };
  /** The server's copy of REM: its fields, the server's stamps. */
  const served = (extra: Partial<Reminder> = {}): Reminder => ({
    ...REM,
    createdAt: SERVER_CREATED,
    updatedAt: S1,
    ...extra,
  });

  const reminderOp = (extra: Partial<OutboxOp>): OutboxOp => ({
    op: "update",
    table: "reminders",
    id: REM.id,
    patch: { minutesBefore: 30 },
    baseUpdatedAt: T2,
    clientTs: NOW_TS,
    status: "queued",
    ...extra,
  });

  /** No member of the events, kinds or overrides repositories was called. */
  const othersUntouched = () => {
    for (const table of [repos.events, repos.kinds, repos.overrides]) {
      for (const member of Object.values(table)) {
        expect(member).not.toHaveBeenCalled();
      }
    }
  };

  it("an insert op calls the reminders repository's insert(patch, id), once, and no other repository", async () => {
    await db.reminders.put(REM);
    await db.outbox.add(
      reminderOp({ op: "insert", patch: NEW_REM, baseUpdatedAt: null }),
    );
    repos.reminders.insert.mockResolvedValue(okRow(served()));
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 1,
      stoppedAt: "end",
    });
    expect(repos.reminders.insert.mock.calls).toStrictEqual([
      [NEW_REM, REM.id],
    ]);
    othersUntouched();
    expect(await db.outbox.count()).toBe(0);
  });

  it("an update op calls update(id, patch, the cache row's updatedAt) - not the op's baseUpdatedAt", async () => {
    await db.reminders.put(REM);
    await db.outbox.add(reminderOp({}));
    repos.reminders.update.mockResolvedValue(
      okRow(served({ minutesBefore: 30 })),
    );
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 1,
      stoppedAt: "end",
    });
    expect(repos.reminders.update.mock.calls).toStrictEqual([
      [REM.id, { minutesBefore: 30 }, T1],
    ]);
    othersUntouched();
  });

  it("a delete op calls remove(id, the cache row's updatedAt), and on ok the cache row takes the server's deletedAt and stamps", async () => {
    await db.reminders.put({ ...REM, deletedAt: NOW_TS });
    await db.outbox.add(
      reminderOp({ op: "delete", patch: null, baseUpdatedAt: T1 }),
    );
    repos.reminders.remove.mockResolvedValue(
      okRow(served({ deletedAt: SERVER_DELETED })),
    );
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 1,
      stoppedAt: "end",
    });
    expect(repos.reminders.remove.mock.calls).toStrictEqual([[REM.id, T1]]);
    expect(await db.reminders.get(REM.id)).toStrictEqual(
      served({ deletedAt: SERVER_DELETED }),
    );
    othersUntouched();
    expect(await db.outbox.count()).toBe(0);
  });

  it("a restore op calls restore(id, the cache row's updatedAt), and on ok the cache row takes deletedAt null and the server's stamps", async () => {
    await db.reminders.put({ ...REM, deletedAt: null, updatedAt: T2 });
    await db.outbox.add(
      reminderOp({ op: "restore", patch: null, baseUpdatedAt: T2 }),
    );
    repos.reminders.restore.mockResolvedValue(okRow(served()));
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 1,
      stoppedAt: "end",
    });
    expect(repos.reminders.restore.mock.calls).toStrictEqual([[REM.id, T2]]);
    expect(await db.reminders.get(REM.id)).toStrictEqual(served());
    othersUntouched();
  });

  it("on ok only the stamps are copied: a minutesBefore the cache holds stays visible", async () => {
    await db.reminders.put({ ...REM, minutesBefore: 30 });
    await db.outbox.add(reminderOp({}));
    // The server's row differs in a field: only the stamps are copied.
    repos.reminders.update.mockResolvedValue(
      okRow(served({ minutesBefore: 99 })),
    );
    await drain.run();
    expect(await db.reminders.get(REM.id)).toStrictEqual(
      served({ minutesBefore: 30 }),
    );
  });

  it("restore then update (AC-3's set after a clear) drain in seq order, the update sent with the stamp the restore returned", async () => {
    await db.reminders.put({ ...REM, minutesBefore: 45 });
    await db.outbox.add(
      reminderOp({ op: "restore", patch: null, baseUpdatedAt: T1 }),
    );
    await db.outbox.add(
      reminderOp({ patch: { minutesBefore: 45 }, baseUpdatedAt: T1 }),
    );
    repos.reminders.restore.mockResolvedValue(okRow(served()));
    repos.reminders.update.mockResolvedValue(
      okRow(served({ minutesBefore: 45, updatedAt: S2 })),
    );
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 2,
      stoppedAt: "end",
    });
    expect(repos.reminders.restore.mock.calls).toStrictEqual([[REM.id, T1]]);
    expect(repos.reminders.update.mock.calls).toStrictEqual([
      [REM.id, { minutesBefore: 45 }, S1],
    ]);
    expect(await db.reminders.get(REM.id)).toStrictEqual(
      served({ minutesBefore: 45, updatedAt: S2 }),
    );
  });

  it("a reminders op queued between two event ops is sent in seq order, and the pass goes on to the event op after it", async () => {
    await db.events.put(ROW);
    await db.reminders.put(REM);
    await enqueueUpdate(db, "events", ROW.id, { title: "First" });
    await db.outbox.add(reminderOp({}));
    await enqueueUpdate(db, "events", ROW.id, { notes: "Third" });
    repos.events.update.mockResolvedValue(okRow(server(ROW)));
    repos.reminders.update.mockResolvedValue(
      okRow(served({ minutesBefore: 30, updatedAt: S2 })),
    );
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 3,
      stoppedAt: "end",
    });
    const [firstAt, thirdAt] = repos.events.update.mock.invocationCallOrder;
    const [reminderAt] = repos.reminders.update.mock.invocationCallOrder;
    expect(firstAt).toBeLessThan(reminderAt ?? 0);
    expect(reminderAt).toBeLessThan(thirdAt ?? 0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('a conflict: the fresh server reminder replaces the cached one, the op is dropped, and the notice names "reminder", titled by the cached event', async () => {
    await db.events.put(SERIES);
    await db.reminders.put(REM);
    await db.outbox.add(reminderOp({}));
    const fresh: Reminder = { ...REM, minutesBefore: 5, updatedAt: S9 };
    repos.reminders.update.mockResolvedValue({ status: "conflict" });
    repos.reminders.get.mockResolvedValue(okRow(fresh));
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 0,
      stoppedAt: "end",
    });
    expect(repos.reminders.get.mock.calls).toStrictEqual([[REM.id]]);
    expect(repos.events.get).not.toHaveBeenCalled();
    expect(await db.reminders.get(REM.id)).toStrictEqual(fresh);
    expect(await db.outbox.count()).toBe(0);
    expect(of("conflict")).toStrictEqual([
      {
        kind: "conflict",
        table: "reminders",
        id: REM.id,
        title: "Standup",
        fields: ["reminder"],
        patch: { minutesBefore: 30 },
        freshUpdatedAt: S9,
      },
    ]);
  });

  it("a conflict for a reminder whose event the cache does not hold is titled empty", async () => {
    await db.reminders.put(REM);
    await db.outbox.add(reminderOp({}));
    repos.reminders.update.mockResolvedValue({ status: "conflict" });
    repos.reminders.get.mockResolvedValue(okRow({ ...REM, updatedAt: S9 }));
    await drain.run();
    expect(of("conflict").map((n) => [n.table, n.title])).toStrictEqual([
      ["reminders", ""],
    ]);
  });

  it("an edit that meets a reminder cleared on the server is dropped without a notice, and the cache row ends cleared", async () => {
    await db.reminders.put(REM);
    await db.outbox.add(reminderOp({}));
    const theirClear = served({ deletedAt: SERVER_DELETED, updatedAt: S9 });
    repos.reminders.update.mockResolvedValue({ status: "conflict" });
    repos.reminders.get.mockResolvedValue(okRow(theirClear));
    await drain.run();
    expect(repos.reminders.get.mock.calls).toStrictEqual([[REM.id]]);
    expect(await db.reminders.get(REM.id)).toStrictEqual(theirClear);
    expect(await db.outbox.count()).toBe(0);
    expect(of("conflict")).toStrictEqual([]);
  });

  it("a delete that conflicts with a newer live reminder is queued again over the fresh row, and sent by the same pass", async () => {
    await db.reminders.put({ ...REM, deletedAt: NOW_TS });
    await db.outbox.add(
      reminderOp({ op: "delete", patch: null, baseUpdatedAt: T1 }),
    );
    const theirEdit = served({ minutesBefore: 5, updatedAt: S9 });
    const finalRow = served({
      minutesBefore: 5,
      deletedAt: SERVER_DELETED,
      updatedAt: S3,
    });
    repos.reminders.remove
      .mockResolvedValueOnce({ status: "conflict" })
      .mockResolvedValueOnce(okRow(finalRow));
    repos.reminders.get.mockResolvedValue(okRow(theirEdit));
    await drain.run();
    expect(repos.reminders.remove.mock.calls).toStrictEqual([
      [REM.id, T1],
      [REM.id, S9],
    ]);
    expect(await db.reminders.get(REM.id)).toStrictEqual(finalRow);
    expect(await db.outbox.count()).toBe(0);
    expect(of("conflict")).toStrictEqual([]);
  });

  it("a 4xx marks the reminders op failed, the pass goes on, and the failed notice is titled by the cached event", async () => {
    await db.events.put(SERIES);
    await db.reminders.put(REM);
    const seq = await db.outbox.add(reminderOp({}));
    const error = { code: "22P02", message: "invalid input", http: 400 };
    repos.reminders.update.mockResolvedValue({ status: "error", ...error });
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 0,
      stoppedAt: "end",
    });
    expect(await ops(db)).toStrictEqual([
      { ...reminderOp({}), seq, status: "failed", error },
    ]);
    expect(of("failed")).toStrictEqual([
      {
        kind: "failed",
        seq,
        table: "reminders",
        id: REM.id,
        title: "Standup",
        error,
      },
    ]);
  });

  it("offline, a reminders op stays queued and the pass stops at it", async () => {
    await db.reminders.put(REM);
    await db.outbox.add(reminderOp({}));
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 0,
      stoppedAt: "offline",
    });
    expect(repos.reminders.update).toHaveBeenCalledTimes(1);
    expect((await ops(db))[0]?.status).toBe("queued");
  });
});

describe("fieldNames for reminders - voice.md's plain field name (CAL-026 AC-4, Block 6)", () => {
  it('a reminders patch of minutesBefore reads "reminder"', () => {
    expect(fieldNames("reminders", { minutesBefore: 30 })).toStrictEqual([
      "reminder",
    ]);
  });

  it("a key voice.md does not name still reads as itself, after the named one", () => {
    expect(
      fieldNames("reminders", { sentAt: "x", minutesBefore: 30 }),
    ).toStrictEqual(["reminder", "sentAt"]);
  });

  it("conflictCopy over it reads as voice.md's singular toast", () => {
    expect(conflictCopy(fieldNames("reminders", { minutesBefore: 30 }))).toBe(
      "Edited elsewhere; your change to reminder was not applied.",
    );
  });
});
