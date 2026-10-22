import { act, renderHook } from "@testing-library/react";
import { IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countingFactory, freshDb, T1 } from "../test/cache-fixtures";
import { NOW_TS } from "../test/outbox-fixtures";
import { CalendarDb, type OutboxOp } from "./db";
import type { DrainNotice } from "./drain";
import {
  createSyncStateStore,
  type SyncState,
  statusLabel,
  syncState,
  useSyncState,
} from "./syncState";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-015 AC-7, Contract Block 7. MECHANICAL: the exact labels of voice.md,
// singular and plural, and the precedence offline > failed > queued >
// synced; the store's counts follow the outbox on every `changed` notice and
// `online` follows navigator.onLine and the window's online / offline events.

describe("statusLabel(state) - voice.md's sync labels (AC-7)", () => {
  const s = (online: boolean, queued: number, failed: number): SyncState => ({
    online,
    queued,
    failed,
  });

  it.each([
    [s(true, 0, 0), "Synced"],
    [s(true, 1, 0), "Syncing 1 change"],
    [s(true, 3, 0), "Syncing 3 changes"],
    [s(false, 0, 0), "Offline — changes will sync later"],
    [s(true, 0, 1), "1 change couldn't sync"],
    [s(true, 0, 2), "2 changes couldn't sync"],
  ])("%j reads %s", (state, label) => {
    expect(statusLabel(state)).toBe(label);
  });

  it("offline wins over failed and queued", () => {
    expect(statusLabel(s(false, 3, 2))).toBe(
      "Offline — changes will sync later",
    );
  });

  it("failed wins over queued", () => {
    expect(statusLabel(s(true, 3, 1))).toBe("1 change couldn't sync");
  });
});

let db: CalendarDb;
let listeners: ((n: DrainNotice) => void)[];
let unsubscribed: number;
const drain = {
  subscribe: vi.fn((l: (n: DrainNotice) => void) => {
    listeners.push(l);
    return () => {
      unsubscribed += 1;
      listeners = listeners.filter((x) => x !== l);
    };
  }),
};
const emit = (n: DrainNotice) => {
  for (const l of listeners) l(n);
};
const setOnline = (value: boolean) => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value });
  window.dispatchEvent(new Event(value ? "online" : "offline"));
};
const op = (id: string, status: "queued" | "failed"): OutboxOp => ({
  op: "update",
  table: "events",
  id,
  patch: { title: "x" },
  baseUpdatedAt: T1,
  clientTs: NOW_TS,
  status,
  ...(status === "failed"
    ? { error: { code: "22P02", message: "bad", http: 400 } }
    : {}),
});
const cleanups: (() => void)[] = [];

beforeEach(() => {
  db = freshDb();
  listeners = [];
  unsubscribed = 0;
  drain.subscribe.mockClear();
});

afterEach(() => {
  for (const stop of cleanups.splice(0)) stop();
  db.close();
  delete (navigator as { onLine?: boolean }).onLine;
});

describe("createSyncStateStore (Block 7)", () => {
  it("constructing it opens nothing and subscribes to nothing", async () => {
    const { factory, opens } = countingFactory();
    const lazy = new CalendarDb("cal-015-sync-state-lazy", {
      indexedDB: factory,
      IDBKeyRange,
    });
    const store = createSyncStateStore(lazy, drain, window);
    store.getSnapshot();
    await new Promise((done) => setTimeout(done, 30));
    expect(opens()).toBe(0);
    expect(drain.subscribe).not.toHaveBeenCalled();
    lazy.close();
  });

  it("on subscribe, reads the counts: two queued and one failed, online", async () => {
    await db.outbox.bulkAdd([op("a", "queued"), op("b", "queued")]);
    await db.outbox.add(op("c", "failed"));
    const store = createSyncStateStore(db, drain, window);
    cleanups.push(store.subscribe(() => {}));
    await vi.waitFor(() =>
      expect(store.getSnapshot()).toStrictEqual({
        online: true,
        queued: 2,
        failed: 1,
      }),
    );
  });

  it("re-reads the counts on every changed notice, and calls its listener", async () => {
    const store = createSyncStateStore(db, drain, window);
    const listener = vi.fn();
    cleanups.push(store.subscribe(listener));
    await vi.waitFor(() => expect(drain.subscribe).toHaveBeenCalled());
    await db.outbox.add(op("a", "queued"));
    emit({ kind: "changed" });
    await vi.waitFor(() => expect(store.getSnapshot().queued).toBe(1));
    expect(listener).toHaveBeenCalled();
  });

  // CAL-015 Return 1 (Regressions): an edit queued while no pass runs -
  // offline, or behind a 5xx - gets no `changed` notice, and must still be
  // counted (AC-7). This drain fake never emits; only the outbox moves.
  it("follows the outbox itself with no drain notice: a queued op reads Syncing 1 change, then a failed op is counted", async () => {
    const store = createSyncStateStore(db, drain, window);
    cleanups.push(store.subscribe(() => {}));
    await vi.waitFor(() => expect(drain.subscribe).toHaveBeenCalled());
    // Let the read made on subscribe settle first, so only the outbox
    // following can see the writes below.
    await new Promise((done) => setTimeout(done, 30));
    expect(store.getSnapshot()).toStrictEqual({
      online: true,
      queued: 0,
      failed: 0,
    });

    await db.outbox.add(op("a", "queued"));
    await vi.waitFor(() =>
      expect(store.getSnapshot()).toStrictEqual({
        online: true,
        queued: 1,
        failed: 0,
      }),
    );
    expect(statusLabel(store.getSnapshot())).toBe("Syncing 1 change");

    await db.outbox.add(op("b", "failed"));
    await vi.waitFor(() =>
      expect(store.getSnapshot()).toStrictEqual({
        online: true,
        queued: 1,
        failed: 1,
      }),
    );
  });

  it("follows the window's offline and online events and navigator.onLine", async () => {
    const store = createSyncStateStore(db, drain, window);
    cleanups.push(store.subscribe(() => {}));
    setOnline(false);
    await vi.waitFor(() => expect(store.getSnapshot().online).toBe(false));
    setOnline(true);
    await vi.waitFor(() => expect(store.getSnapshot().online).toBe(true));
  });

  it("getSnapshot is the same object between changes, a new one after", async () => {
    const store = createSyncStateStore(db, drain, window);
    cleanups.push(store.subscribe(() => {}));
    await vi.waitFor(() => expect(drain.subscribe).toHaveBeenCalled());
    await new Promise((done) => setTimeout(done, 30));
    const before = store.getSnapshot();
    expect(store.getSnapshot()).toBe(before);
    setOnline(false);
    await vi.waitFor(() => expect(store.getSnapshot()).not.toBe(before));
  });

  it("after the last unsubscribe it leaves the drain and the window alone", async () => {
    const store = createSyncStateStore(db, drain, window);
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    await vi.waitFor(() => expect(drain.subscribe).toHaveBeenCalled());
    stop();
    expect(unsubscribed).toBe(1);
    listener.mockClear();
    setOnline(false);
    await new Promise((done) => setTimeout(done, 30));
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("useSyncState and the app's store (Block 7)", () => {
  it("useSyncState(store) returns the store's snapshot and follows it", async () => {
    const store = createSyncStateStore(db, drain, window);
    const { result } = renderHook(() => useSyncState(store));
    await vi.waitFor(() =>
      expect(result.current).toStrictEqual({
        online: true,
        queued: 0,
        failed: 0,
      }),
    );
    await act(async () => {
      setOnline(false);
    });
    await vi.waitFor(() => expect(result.current.online).toBe(false));
  });

  it("syncState is a store: subscribe and getSnapshot", () => {
    expect(typeof syncState.subscribe).toBe("function");
    expect(syncState.getSnapshot()).toHaveProperty("online");
  });
});
