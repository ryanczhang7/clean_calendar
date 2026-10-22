import { HttpResponse } from "msw";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";
import { installServer, onTable, type Recorded } from "../test/msw";
import {
  eventFull,
  eventRowFull,
  kindFull,
  kindNulls,
  kindRowFull,
  kindRowNulls,
  overrideFull,
  overrideRowFull,
} from "../test/rows-fixtures";
import { held } from "../test/outbox-fixtures";
import { changed } from "../test/realtime-fixtures";
import { fake } from "../test/supabase-mock";
import { db } from "./db";
import type { Drain, DrainNotice } from "./drain";
import { EPOCH, type Sync } from "./hydrate";
import {
  appDrain,
  appRealtime,
  appSync,
  installOnlineSync,
  startSync,
} from "./startSync";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-014 AC-1, Contract Block 3: the app's sync, over the real repositories
// on the (mocked) app client and the app's `db`. Every request is a real
// PostgREST fetch that MSW answers; an unanswered one fails the test. The
// app's db lives on the global fake-indexeddb that src/test/setup.ts
// installs, so every table is cleared before each case.

installServer();

let seen: { kinds: Recorded[]; events: Recorded[]; overrides: Recorded[] };

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  seen = {
    kinds: onTable("kinds", () =>
      HttpResponse.json([kindRowNulls, kindRowFull]),
    ),
    events: onTable("events", () => HttpResponse.json([eventRowFull])),
    overrides: onTable("event_overrides", () =>
      HttpResponse.json([overrideRowFull]),
    ),
  };
});

const since = (r: Recorded[]) =>
  r.map((req) => [req.method, req.url.searchParams.get("updated_at")]);

describe("startSync() - sync starts after sign-in (AC-1, Block 3)", () => {
  it("over an empty cache, GETs kinds, events and event_overrides once each with updated_at=gt.EPOCH, and resolves ok", async () => {
    await expect(startSync()).resolves.toStrictEqual({ status: "ok" });
    expect(since(seen.kinds)).toStrictEqual([["GET", `gt.${EPOCH}`]]);
    expect(since(seen.events)).toStrictEqual([["GET", `gt.${EPOCH}`]]);
    expect(since(seen.overrides)).toStrictEqual([["GET", `gt.${EPOCH}`]]);
  });

  it("writes the server's rows, live and soft-deleted, into the app's db as domain objects, with each table's mark", async () => {
    await startSync();
    const kinds = await db.kinds.toArray();
    expect(kinds.sort((a, b) => a.id.localeCompare(b.id))).toStrictEqual(
      [kindFull, kindNulls].sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(await db.events.toArray()).toStrictEqual([eventFull]);
    expect(await db.overrides.toArray()).toStrictEqual([overrideFull]);
    expect(await db.meta.get("mark:kinds")).toStrictEqual({
      key: "mark:kinds",
      value: kindRowFull.updated_at,
    });
    expect((await db.meta.get("mark:events"))?.value).toBe(
      eventRowFull.updated_at,
    );
    expect((await db.meta.get("mark:overrides"))?.value).toBe(
      overrideRowFull.updated_at,
    );
  });

  it("a second startSync() sends each table's stored mark, byte for byte", async () => {
    await startSync();
    await startSync();
    expect(since(seen.kinds)[1]).toStrictEqual([
      "GET",
      `gt.${kindRowFull.updated_at}`,
    ]);
    expect(since(seen.events)[1]).toStrictEqual([
      "GET",
      `gt.${eventRowFull.updated_at}`,
    ]);
    expect(since(seen.overrides)[1]).toStrictEqual([
      "GET",
      `gt.${overrideRowFull.updated_at}`,
    ]);
  });

  it("two concurrent startSync() calls share one pass: one request per table", async () => {
    await Promise.all([startSync(), appSync.run()]);
    expect(seen.kinds).toHaveLength(1);
    expect(seen.events).toHaveLength(1);
    expect(seen.overrides).toHaveLength(1);
  });
});

// CAL-015 Contract, Block 5 (PO decisions 6 and 7): the app's drain runs
// before the pull, so the pull sees our rows with their server stamps; the
// pass startSync starts is announced. `installOnlineSync` runs both again on
// every window `online` event.
describe("startSync() drains the outbox first (CAL-015 Block 5)", () => {
  it("sends a queued edit before it asks for rows: the PATCH, with the cached stamp, precedes the GET; the pass is announced", async () => {
    const cached = { ...eventFull, title: "Mine" };
    await db.events.put(cached);
    await db.outbox.add({
      op: "update",
      table: "events",
      id: cached.id,
      patch: { title: "Mine" },
      baseUpdatedAt: cached.updatedAt,
      clientTs: "2026-10-21T09:00:00.000Z",
      status: "queued",
    });
    const order: Recorded[] = onTable("events", (req) =>
      req.method === "PATCH"
        ? HttpResponse.json([
            {
              ...eventRowFull,
              title: "Mine",
              updated_at: "2026-10-21T10:00:00.000001+00:00",
            },
          ])
        : HttpResponse.json([]),
    );
    const notices: DrainNotice[] = [];
    const stop = appDrain.subscribe((n) => notices.push(n));
    await expect(startSync()).resolves.toStrictEqual({ status: "ok" });
    stop();
    expect(order.map((r) => r.method)).toStrictEqual(["PATCH", "GET"]);
    expect(order[0]?.url.searchParams.get("id")).toBe(`eq.${cached.id}`);
    expect(order[0]?.url.searchParams.get("updated_at")).toBe(
      `eq.${cached.updatedAt}`,
    );
    expect(await db.outbox.count()).toBe(0);
    expect((await db.events.get(cached.id))?.updatedAt).toBe(
      "2026-10-21T10:00:00.000001+00:00",
    );
    expect(notices.filter((n) => n.kind === "drained")).toStrictEqual([
      { kind: "drained", count: 1 },
    ]);
  });

  it("asks appDrain.run({ announce: true }) and starts appSync.run() only after it settled", async () => {
    const pass = held<Awaited<ReturnType<Drain["run"]>>>();
    const drainRun = vi.spyOn(appDrain, "run").mockReturnValue(pass.promise);
    const syncRun = vi
      .spyOn(appSync, "run")
      .mockResolvedValue({ status: "ok" });
    const started = startSync();
    await new Promise((done) => setTimeout(done, 10));
    expect(drainRun.mock.calls).toStrictEqual([[{ announce: true }]]);
    expect(syncRun).not.toHaveBeenCalled();
    pass.release({ sent: 0, stoppedAt: "end" });
    await expect(started).resolves.toStrictEqual({ status: "ok" });
    expect(syncRun).toHaveBeenCalledTimes(1);
    drainRun.mockRestore();
    syncRun.mockRestore();
  });
});

describe("installOnlineSync(target) (CAL-015 Block 5)", () => {
  let drainRun: MockInstance<Drain["run"]>;
  let syncRun: MockInstance<Sync["run"]>;
  const uninstall: (() => void)[] = [];

  beforeEach(() => {
    drainRun = vi
      .spyOn(appDrain, "run")
      .mockResolvedValue({ sent: 0, stoppedAt: "end" });
    syncRun = vi.spyOn(appSync, "run").mockResolvedValue({ status: "ok" });
  });

  afterEach(() => {
    for (const stop of uninstall.splice(0)) stop();
    drainRun.mockRestore();
    syncRun.mockRestore();
  });

  const goOnline = async () => {
    window.dispatchEvent(new Event("online"));
    await new Promise((done) => setTimeout(done, 10));
  };

  it("installing runs nothing", async () => {
    uninstall.push(installOnlineSync(window));
    await new Promise((done) => setTimeout(done, 10));
    expect(drainRun).not.toHaveBeenCalled();
    expect(syncRun).not.toHaveBeenCalled();
  });

  it("each online event runs one announced drain, then one sync", async () => {
    uninstall.push(installOnlineSync(window));
    await goOnline();
    expect(drainRun.mock.calls).toStrictEqual([[{ announce: true }]]);
    expect(syncRun).toHaveBeenCalledTimes(1);
    const [drainAt] = drainRun.mock.invocationCallOrder;
    const [syncAt] = syncRun.mock.invocationCallOrder;
    expect(drainAt).toBeLessThan(syncAt ?? 0);
    await goOnline();
    expect(drainRun).toHaveBeenCalledTimes(2);
    expect(syncRun).toHaveBeenCalledTimes(2);
  });

  it("installing twice still runs once per event", async () => {
    uninstall.push(installOnlineSync(window));
    uninstall.push(installOnlineSync(window));
    await goOnline();
    expect(drainRun).toHaveBeenCalledTimes(1);
    expect(syncRun).toHaveBeenCalledTimes(1);
  });

  it("after the uninstaller ran, an online event runs nothing", async () => {
    const stop = installOnlineSync(window);
    stop();
    await goOnline();
    expect(drainRun).not.toHaveBeenCalled();
    expect(syncRun).not.toHaveBeenCalled();
  });
});

// CAL-016 Contract, Block 4 (PO decision 1): the installer SyncStatus mounts
// for as long as the owner is signed in also runs the app's Realtime stream,
// and its uninstaller stops it. `startSync()` is as shipped and does not
// touch the stream. The app's client is the mocked one, whose `channel` /
// `removeChannel` are the recording stub in supabase-mock.ts (`fake.realtime`).
describe("installOnlineSync() also runs the app's Realtime stream (CAL-016 Block 4)", () => {
  let drainRun: MockInstance<Drain["run"]>;
  let syncRun: MockInstance<Sync["run"]>;
  const uninstall: (() => void)[] = [];

  beforeEach(() => {
    fake.realtime.clear();
    drainRun = vi
      .spyOn(appDrain, "run")
      .mockResolvedValue({ sent: 0, stoppedAt: "end" });
    syncRun = vi.spyOn(appSync, "run").mockResolvedValue({ status: "ok" });
  });

  afterEach(() => {
    for (const stop of uninstall.splice(0)) stop();
    drainRun.mockRestore();
    syncRun.mockRestore();
  });

  const settle = () => new Promise((done) => setTimeout(done, 20));

  it("installing starts appRealtime once and the uninstaller stops it once", () => {
    const start = vi.spyOn(appRealtime, "start");
    const stop = vi.spyOn(appRealtime, "stop");
    try {
      const off = installOnlineSync(window);
      uninstall.push(off);
      expect(start).toHaveBeenCalledTimes(1);
      expect(stop).not.toHaveBeenCalled();
      off();
      expect(start).toHaveBeenCalledTimes(1);
      expect(stop).toHaveBeenCalledTimes(1);
    } finally {
      start.mockRestore();
      stop.mockRestore();
    }
  });

  it("startSync() neither starts nor stops appRealtime, and opens no channel", async () => {
    const start = vi.spyOn(appRealtime, "start");
    const stop = vi.spyOn(appRealtime, "stop");
    try {
      await expect(startSync()).resolves.toStrictEqual({ status: "ok" });
      expect(drainRun).toHaveBeenCalledTimes(1);
      expect(start).not.toHaveBeenCalled();
      expect(stop).not.toHaveBeenCalled();
      expect(fake.realtime.channel).not.toHaveBeenCalled();
    } finally {
      start.mockRestore();
      stop.mockRestore();
    }
  });

  it("the app's stream is one channel named cache on the app's client; a rejoin runs appSync once and no drain; the uninstaller removes that channel", async () => {
    const off = installOnlineSync(window);
    uninstall.push(off); // also on failure; a second call is a no-op stop
    expect(fake.realtime.channel.mock.calls).toStrictEqual([["cache"]]);
    const [ch] = fake.realtime.channels;
    expect(ch?.on).toHaveBeenCalledTimes(4);
    ch?.report("SUBSCRIBED");
    await settle();
    expect(syncRun).not.toHaveBeenCalled();
    ch?.report("SUBSCRIBED");
    await settle();
    expect(syncRun).toHaveBeenCalledTimes(1);
    expect(drainRun).not.toHaveBeenCalled();

    off();
    expect(fake.realtime.removeChannel.mock.calls).toStrictEqual([[ch]]);
  });

  it("a payload on the app's channel lands in the app's db", async () => {
    uninstall.push(installOnlineSync(window));
    const [ch] = fake.realtime.channels;
    ch?.deliver(changed("INSERT", "events", eventRowFull));
    await vi.waitFor(async () =>
      expect(await db.events.toArray()).toStrictEqual([eventFull]),
    );
  });
});
