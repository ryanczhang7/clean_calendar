import { renderHook, waitFor } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import type { Result } from "../data/result";
import type { EventOverride, NewEventOverride } from "../data/rows";
import { freshDb, override, STAMP, T1 } from "../test/cache-fixtures";
import {
  asRepos,
  fakeRepos,
  NOW,
  NOW_TS,
  okRow,
  opsWithoutSeq,
  S1,
  S2,
  S3,
  U1,
  U2,
} from "../test/outbox-fixtures";
import { createCachedOverridesStore } from "./cachedStores";
import type { CalendarDb, OutboxOp } from "./db";
import { createDrain, type Drain } from "./drain";
import type { SyncResult } from "./hydrate";
import { queuedCount } from "./outbox";
import {
  createOutboxOverrideActions,
  type OverrideActions,
  type OverrideFields,
  overrideActions,
} from "./overrideActions";
import { useOverrides } from "./overridesStore";
import { appRepos } from "./startSync";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-056 AC-1, AC-2, AC-3, AC-6 and Contract Block 1: the override actions
// over the outbox. MECHANICAL: the exact cache rows and the exact queued ops
// (minus `seq`) after each action, and the exact result. A real CalendarDb
// over a fresh fake-indexeddb factory; the client clock is a Date-only fake
// and `crypto.randomUUID` answers U1, then U2. The drain is a vi.fn whose run
// never settles - an action must not wait for it - except in AC-6, where a
// real drain over vi.fn repositories shows that nothing is sent offline.

const EVENT_ID = override(1, "2026-10-27").eventId;
const OTHER_EVENT_ID = "10000000-0000-4000-8000-000000000002";
const DATE = "2026-10-27";

/** An override cached for EVENT_ID on DATE, with the server stamp T1. */
const EXISTING: EventOverride = override(1, DATE, {
  title: "Quarterly review (moved)",
  location: "Room 9",
  updatedAt: T1,
});

/** The override setOverride creates: U1, the client stamp, nothing but `extra` set. */
const created = (extra: Partial<EventOverride> = {}): EventOverride => ({
  id: U1,
  eventId: EVENT_ID,
  occurrenceDate: DATE,
  cancelled: false,
  title: null,
  kindId: null,
  startsAt: null,
  endsAt: null,
  allDay: null,
  location: null,
  notes: null,
  createdAt: NOW_TS,
  updatedAt: NOW_TS,
  ...extra,
});

/** A new override's insert patch: the row without its id and stamps. */
const inputOf = (row: EventOverride): NewEventOverride => {
  const { id: _id, createdAt: _c, updatedAt: _u, ...input } = row;
  return input;
};

/** The op an action queues, `seq` aside. */
const queuedOp = (
  op: "insert" | "update",
  id: string,
  patch: unknown,
  baseUpdatedAt: string | null,
): Omit<OutboxOp, "seq"> => ({
  op,
  table: "event_overrides",
  id,
  patch,
  baseUpdatedAt,
  clientTs: NOW_TS,
  status: "queued",
});

const MOVED: OverrideFields = {
  title: "Review (moved)",
  startsAt: new Date(2026, 9, 27, 13, 0),
  endsAt: new Date(2026, 9, 27, 14, 30),
};

let db: CalendarDb;
let run: Mock<Pick<Drain, "run">["run"]>;
let actions: OverrideActions;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.spyOn(crypto, "randomUUID")
    .mockReturnValueOnce(U1)
    .mockReturnValueOnce(U2);
  db = freshDb();
  // A pass that never settles: an action must not wait for it.
  run = vi.fn<Pick<Drain, "run">["run"]>(() => new Promise(() => {}));
  actions = createOutboxOverrideActions(db, { run }, () => false);
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete (navigator as { onLine?: boolean }).onLine;
});

describe("setOverride on an occurrence with no override (AC-1)", () => {
  it("adds one override to the cache - cancelled false, the given fields, every other field null, a new id, the client stamp - and resolves ok with it", async () => {
    const want = created(MOVED);
    await expect(
      actions.setOverride(EVENT_ID, DATE, MOVED),
    ).resolves.toStrictEqual({ status: "ok", row: want });
    expect(await db.overrides.toArray()).toStrictEqual([want]);
  });

  it("queues exactly one insert op on event_overrides, its patch the new override without id or stamps", async () => {
    await actions.setOverride(EVENT_ID, DATE, MOVED);
    expect(await opsWithoutSeq(db)).toStrictEqual([
      queuedOp("insert", U1, inputOf(created(MOVED)), null),
    ]);
  });

  it("useOverrides sees the new override", async () => {
    const sync = {
      run: vi.fn<() => Promise<SyncResult>>(async () => ({ status: "ok" })),
    };
    const store = createCachedOverridesStore(db, sync);
    const { result } = renderHook(() => useOverrides(store));
    await waitFor(() =>
      expect(result.current).toStrictEqual({ status: "ready", overrides: [] }),
    );
    await actions.setOverride(EVENT_ID, DATE, MOVED);
    await waitFor(() =>
      expect(result.current.overrides).toStrictEqual([created(MOVED)]),
    );
  });

  it("an override for the same event on another date, or for another event on the same date, is not the existing one: a new override is inserted", async () => {
    const otherDate = override(2, "2026-10-20", { updatedAt: T1 });
    const otherEvent = override(3, DATE, {
      eventId: OTHER_EVENT_ID,
      updatedAt: T1,
    });
    await db.overrides.bulkPut([otherDate, otherEvent]);
    await expect(
      actions.setOverride(EVENT_ID, DATE, { title: "Mine" }),
    ).resolves.toStrictEqual({
      status: "ok",
      row: created({ title: "Mine" }),
    });
    expect(await db.overrides.get(otherDate.id)).toStrictEqual(otherDate);
    expect(await db.overrides.get(otherEvent.id)).toStrictEqual(otherEvent);
    expect(await db.overrides.count()).toBe(3);
    expect((await opsWithoutSeq(db)).map((o) => [o.op, o.id])).toStrictEqual([
      ["insert", U1],
    ]);
  });

  it("a field given as undefined is not given: it is null in the new override", async () => {
    await actions.setOverride(EVENT_ID, DATE, {
      title: "Mine",
      notes: undefined,
    });
    expect(await db.overrides.get(U1)).toStrictEqual(
      created({ title: "Mine" }),
    );
    expect((await opsWithoutSeq(db))[0]?.patch).toStrictEqual(
      inputOf(created({ title: "Mine" })),
    );
  });
});

describe("setOverride on an occurrence that already has an override (AC-2)", () => {
  it("updates that override in place - same id, only the given fields, every other field kept, updatedAt untouched - and resolves ok with it", async () => {
    await db.overrides.put(EXISTING);
    const want: EventOverride = {
      ...EXISTING,
      title: "Review (moved again)",
      allDay: true,
    };
    await expect(
      actions.setOverride(EVENT_ID, DATE, {
        title: "Review (moved again)",
        allDay: true,
      }),
    ).resolves.toStrictEqual({ status: "ok", row: want });
    expect(await db.overrides.toArray()).toStrictEqual([want]);
    // The contrast a naive optimistic write fails: it re-stamps the row.
    expect((await db.overrides.get(EXISTING.id))?.updatedAt).toBe(T1);
    expect((await db.overrides.get(EXISTING.id))?.createdAt).toBe(STAMP);
  });

  it("queues one update op whose patch holds only the given fields, based on the cached stamp", async () => {
    await db.overrides.put(EXISTING);
    await actions.setOverride(EVENT_ID, DATE, {
      title: "Review (moved again)",
      allDay: true,
    });
    expect(await opsWithoutSeq(db)).toStrictEqual([
      queuedOp(
        "update",
        EXISTING.id,
        { title: "Review (moved again)", allDay: true },
        T1,
      ),
    ]);
  });

  it("a second edit of the same occurrence merges into the override the first created: one row, the same id, an insert then an update", async () => {
    const first = await actions.setOverride(EVENT_ID, DATE, MOVED);
    const second = await actions.setOverride(EVENT_ID, DATE, {
      location: "Pool",
    });
    const want = created({ ...MOVED, location: "Pool" });
    expect(first.status === "ok" && first.row.id).toBe(U1);
    expect(second).toStrictEqual({ status: "ok", row: want });
    expect(await db.overrides.toArray()).toStrictEqual([want]);
    expect(await opsWithoutSeq(db)).toStrictEqual([
      queuedOp("insert", U1, inputOf(created(MOVED)), null),
      queuedOp("update", U1, { location: "Pool" }, NOW_TS),
    ]);
  });

  it("null clears a field, and a field given as undefined is left out of the patch and the row", async () => {
    await db.overrides.put({ ...EXISTING, notes: "Bring slides" });
    await expect(
      actions.setOverride(EVENT_ID, DATE, {
        location: null,
        notes: undefined,
      }),
    ).resolves.toStrictEqual({
      status: "ok",
      row: { ...EXISTING, notes: "Bring slides", location: null },
    });
    expect(await opsWithoutSeq(db)).toStrictEqual([
      queuedOp("update", EXISTING.id, { location: null }, T1),
    ]);
  });
});

// Block 1 lets RED pin setOverride(..., {}) either way. Pinned: with an
// existing override it is a no-op that resolves ok with that row and queues
// nothing; with none, it inserts an override with every field null.
describe("setOverride with no fields (Block 1, as pinned by RED)", () => {
  it("over an existing override: resolves ok with it unchanged and queues nothing", async () => {
    await db.overrides.put(EXISTING);
    await expect(
      actions.setOverride(EVENT_ID, DATE, {}),
    ).resolves.toStrictEqual({ status: "ok", row: EXISTING });
    expect(await db.overrides.toArray()).toStrictEqual([EXISTING]);
    expect(await db.outbox.count()).toBe(0);
  });

  it("with no override: inserts one with every field null and queues its insert", async () => {
    await expect(
      actions.setOverride(EVENT_ID, DATE, {}),
    ).resolves.toStrictEqual({ status: "ok", row: created() });
    expect(await opsWithoutSeq(db)).toStrictEqual([
      queuedOp("insert", U1, inputOf(created()), null),
    ]);
  });
});

describe("cancelOccurrence and restoreOccurrence (AC-3)", () => {
  it("cancelOccurrence with no override: inserts one with cancelled true and every field null, and queues one insert", async () => {
    const want = created({ cancelled: true });
    await expect(
      actions.cancelOccurrence(EVENT_ID, DATE),
    ).resolves.toStrictEqual({ status: "ok", row: want });
    expect(await db.overrides.toArray()).toStrictEqual([want]);
    expect(await opsWithoutSeq(db)).toStrictEqual([
      queuedOp("insert", U1, inputOf(want), null),
    ]);
  });

  it("cancelOccurrence over an existing override: sets cancelled true on it, keeps its fields, and queues one update {cancelled: true}", async () => {
    await db.overrides.put(EXISTING);
    const want: EventOverride = { ...EXISTING, cancelled: true };
    await expect(
      actions.cancelOccurrence(EVENT_ID, DATE),
    ).resolves.toStrictEqual({ status: "ok", row: want });
    expect(await db.overrides.toArray()).toStrictEqual([want]);
    expect(await opsWithoutSeq(db)).toStrictEqual([
      queuedOp("update", EXISTING.id, { cancelled: true }, T1),
    ]);
  });

  it("restoreOccurrence with the row cancelOccurrence returned: that override is cancelled false again, and one update {cancelled: false} is queued", async () => {
    const cancelled = await actions.cancelOccurrence(EVENT_ID, DATE);
    if (cancelled.status !== "ok") throw new Error("cancel was not ok");
    await expect(
      actions.restoreOccurrence(cancelled.row),
    ).resolves.toStrictEqual({ status: "ok", row: created() });
    expect(await db.overrides.toArray()).toStrictEqual([created()]);
    expect(await opsWithoutSeq(db)).toStrictEqual([
      queuedOp("insert", U1, inputOf(created({ cancelled: true })), null),
      queuedOp("update", U1, { cancelled: false }, NOW_TS),
    ]);
  });

  it("restoring a cancelled edited occurrence brings back the override as it was before the cancel", async () => {
    await db.overrides.put(EXISTING);
    const cancelled = await actions.cancelOccurrence(EVENT_ID, DATE);
    if (cancelled.status !== "ok") throw new Error("cancel was not ok");
    await expect(
      actions.restoreOccurrence(cancelled.row),
    ).resolves.toStrictEqual({ status: "ok", row: EXISTING });
    expect(await db.overrides.toArray()).toStrictEqual([EXISTING]);
    expect((await opsWithoutSeq(db))[1]).toStrictEqual(
      queuedOp("update", EXISTING.id, { cancelled: false }, T1),
    );
  });

  it("restoreOccurrence of an override the cache does not hold resolves conflict and queues nothing (queuedResult)", async () => {
    await expect(
      actions.restoreOccurrence({ ...EXISTING, cancelled: true }),
    ).resolves.toStrictEqual({ status: "conflict" });
    expect(await db.outbox.count()).toBe(0);
    expect(await db.overrides.count()).toBe(0);
  });
});

describe("offline and online (AC-6, Block 1)", () => {
  it("offline: the three actions each resolve ok at once, queuedCount counts their ops, and nothing reaches the repository until a drain runs", async () => {
    let network = false;
    const repos = fakeRepos();
    const drain = createDrain(db, asRepos(repos), () => network);
    const outbox = createOutboxOverrideActions(db, drain, () => network);

    const set = await outbox.setOverride(EVENT_ID, DATE, MOVED);
    const cancelled = await outbox.cancelOccurrence(EVENT_ID, DATE);
    if (cancelled.status !== "ok") throw new Error("cancel was not ok");
    const restored = await outbox.restoreOccurrence(cancelled.row);
    expect([set.status, cancelled.status, restored.status]).toStrictEqual([
      "ok",
      "ok",
      "ok",
    ]);
    expect(await queuedCount(db)).toBe(3);
    for (const table of [repos.overrides, repos.events, repos.kinds]) {
      for (const member of Object.values(table)) {
        expect(member).not.toHaveBeenCalled();
      }
    }

    network = true;
    const server = created(MOVED);
    repos.overrides.insert.mockResolvedValue(
      okRow({ ...server, updatedAt: S1 }),
    );
    repos.overrides.update
      .mockResolvedValueOnce(
        okRow({ ...server, cancelled: true, updatedAt: S2 }),
      )
      .mockResolvedValueOnce(okRow({ ...server, updatedAt: S3 }));
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 3,
      stoppedAt: "end",
    });
    expect(repos.overrides.insert.mock.calls).toStrictEqual([
      [inputOf(created(MOVED)), U1],
    ]);
    expect(repos.overrides.update.mock.calls).toStrictEqual([
      [U1, { cancelled: true }, S1],
      [U1, { cancelled: false }, S2],
    ]);
    expect(await queuedCount(db)).toBe(0);
  });

  it("offline: no drain run is started", async () => {
    await actions.setOverride(EVENT_ID, DATE, MOVED);
    await actions.cancelOccurrence(EVENT_ID, DATE);
    expect(run).not.toHaveBeenCalled();
  });

  it("online: each action starts one drain run, unannounced, and resolves without waiting for it", async () => {
    const outbox = createOutboxOverrideActions(db, { run }, () => true);
    await expect(
      outbox.setOverride(EVENT_ID, DATE, MOVED),
    ).resolves.toStrictEqual({ status: "ok", row: created(MOVED) });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]?.announce).not.toBe(true);
    const cancelled: Result<EventOverride> = await outbox.cancelOccurrence(
      EVENT_ID,
      DATE,
    );
    expect(run).toHaveBeenCalledTimes(2);
    if (cancelled.status !== "ok") throw new Error("cancel was not ok");
    await outbox.restoreOccurrence(cancelled.row);
    expect(run).toHaveBeenCalledTimes(3);
    expect(run.mock.calls.map((c) => c[0]?.announce === true)).toStrictEqual([
      false,
      false,
      false,
    ]);
  });

  it("online defaults to navigator.onLine", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    const outbox = createOutboxOverrideActions(db, { run });
    await outbox.setOverride(EVENT_ID, DATE, MOVED);
    expect(run).not.toHaveBeenCalled();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    await outbox.cancelOccurrence(EVENT_ID, DATE);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("the app's override actions and repositories (Block 1, Block 4)", () => {
  it("overrideActions are outbox actions over the app's db: offline, setOverride writes the app's outbox and sends nothing", async () => {
    const { db: appDb } = await import("./db");
    await Promise.all(appDb.tables.map((t) => t.clear()));
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(
      overrideActions.setOverride(EVENT_ID, DATE, MOVED),
    ).resolves.toStrictEqual({ status: "ok", row: created(MOVED) });
    expect(network).not.toHaveBeenCalled();
    expect(
      (await appDb.outbox.toArray()).map((o) => [o.op, o.table, o.id]),
    ).toStrictEqual([["insert", "event_overrides", U1]]);
    await Promise.all(appDb.tables.map((t) => t.clear()));
  });

  it("appRepos carries the overrides repository the app's drain sends through", () => {
    expect(typeof appRepos.overrides.insert).toBe("function");
    expect(typeof appRepos.overrides.update).toBe("function");
    expect(typeof appRepos.overrides.get).toBe("function");
  });
});
