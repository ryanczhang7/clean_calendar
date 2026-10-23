import { renderHook, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import type { Event as RowEvent } from "../data/rows";
import { at, byId, freshDb } from "../test/cache-fixtures";
import {
  bindingsOf,
  changed,
  deletedPayload,
  type FakeRealtimeClient,
  fakeRealtimeClient,
  type Payload,
  reminderFull,
  reminderNulls,
  reminderRowFull,
  reminderRowNulls,
} from "../test/realtime-fixtures";
import {
  eventFull,
  eventNulls,
  eventRowFull,
  eventRowNulls,
  kindNulls,
  kindRowNulls,
  overrideFull,
  overrideRowFull,
  UPDATED_AT,
} from "../test/rows-fixtures";
import { createCachedEventsStore } from "./cachedStores";
import type { CalendarDb, OutboxOp } from "./db";
import { useEventsInRange } from "./eventsStore";
import type { SyncResult } from "./hydrate";
import {
  CHANNEL_NAME,
  createRealtime,
  type Realtime,
  type RealtimeClient,
  type RealtimeTable,
  TABLES,
  toReminderRow,
} from "./realtime";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-016 AC-2..AC-5, Contract Blocks 3 and 6. MECHANICAL throughout: which
// channel calls were made with which arguments, which rows the cache holds
// after a payload (`toStrictEqual` before and after), how many times the
// catch-up ran. Every case builds a real CalendarDb over a fresh
// fake-indexeddb factory, a hand-built Realtime client (realtime-fixtures.ts)
// and a vi.fn `sync.run`. The page is jsdom's own `document`: its
// `visibilityState` is overridden per case with Object.defineProperty and a
// `visibilitychange` dispatched on it (measured in RED: jsdom 30 starts
// "visible", a defined property wins, deleting it restores the prototype's).
//
// Stamps are PostgREST's strings and differ only in the microseconds, so a
// comparison through `Date` would call OLDER, BASE and NEWER equal.

const BASE = UPDATED_AT; // "2026-10-14T09:15:02.123456+00:00"
const OLDER = "2026-10-14T09:15:02.123455+00:00";
const NEWER = "2026-10-14T09:15:02.123457+00:00";
const NEWEST = "2026-10-14T09:15:02.123458+00:00";

type FakeSync = { run: Mock<() => Promise<SyncResult>> };

let db: CalendarDb;
let client: FakeRealtimeClient;
let sync: FakeSync;
const started: Realtime[] = [];
const dbs: CalendarDb[] = [];
const cleanups: (() => void)[] = [];

beforeEach(() => {
  db = freshDb();
  dbs.push(db);
  client = fakeRealtimeClient();
  sync = {
    run: vi.fn<() => Promise<SyncResult>>(async () => ({ status: "ok" })),
  };
});

afterEach(() => {
  for (const stop of cleanups.splice(0)) stop();
  for (const rt of started.splice(0)) rt.stop();
  Reflect.deleteProperty(document, "visibilityState");
  Reflect.deleteProperty(document, "hidden");
  for (const d of dbs.splice(0)) d.close();
});

const asClient = (c: FakeRealtimeClient) => c as unknown as RealtimeClient;

/** A Realtime over this case's db, client and sync; stopped in afterEach. */
function make(doc: Document = document): Realtime {
  const rt = createRealtime(asClient(client), db, sync, doc);
  started.push(rt);
  return rt;
}

/** Let any queued work (a microtask, fake-indexeddb, a timer) run. */
const settle = () => new Promise((done) => setTimeout(done, 20));

/** Put the page in `state` and tell it, as the browser does. */
function showPage(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => state === "hidden",
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

/** Every table the payloads touch, plus the outbox, as plain arrays. */
async function contents() {
  return {
    events: byId(await db.events.toArray()),
    overrides: byId(await db.overrides.toArray()),
    kinds: byId(await db.kinds.toArray()),
    reminders: byId(await db.reminders.toArray()),
    outbox: await db.outbox.toArray(),
  };
}

const runs = () => sync.run.mock.calls.length;

/** The only channel this case's client handed out. */
function onlyChannel() {
  expect(client.channels).toHaveLength(1);
  const [ch] = client.channels;
  if (ch === undefined) throw new Error("no channel");
  return ch;
}

const cachedEvent = (extra: Partial<RowEvent> = {}): RowEvent => ({
  ...eventNulls,
  title: "Cached",
  updatedAt: BASE,
  ...extra,
});

const eventPayload = (
  eventType: "INSERT" | "UPDATE",
  extra: Record<string, unknown> = {},
): Payload =>
  changed(eventType, "events", { ...eventRowNulls, title: "Server", ...extra });

function op(extra: Partial<OutboxOp>): OutboxOp {
  return {
    op: "update",
    table: "events",
    id: eventNulls.id,
    patch: { title: "Mine" },
    baseUpdatedAt: BASE,
    clientTs: "2026-10-22T09:00:00.000Z",
    status: "queued",
    ...extra,
  };
}

// ---------------------------------------------------------------------------

describe("the module's constants (Block 3)", () => {
  it("the channel is named cache and the tables are events, event_overrides, kinds, reminders in that order", () => {
    expect(CHANNEL_NAME).toBe("cache");
    expect([...TABLES]).toStrictEqual([
      "events",
      "event_overrides",
      "kinds",
      "reminders",
    ]);
  });
});

describe("one channel over the four tables (AC-2)", () => {
  it("constructing opens nothing; start() opens one channel named cache, binds postgres_changes for every event on the four tables in order, then subscribes once", () => {
    const rt = make();
    expect(client.channel).not.toHaveBeenCalled();

    rt.start();
    expect(client.channel.mock.calls).toStrictEqual([["cache"]]);
    const ch = onlyChannel();
    expect(bindingsOf(ch)).toStrictEqual([
      ["postgres_changes", { event: "*", schema: "public", table: "events" }],
      [
        "postgres_changes",
        { event: "*", schema: "public", table: "event_overrides" },
      ],
      ["postgres_changes", { event: "*", schema: "public", table: "kinds" }],
      [
        "postgres_changes",
        { event: "*", schema: "public", table: "reminders" },
      ],
    ]);
    expect(ch.on.mock.calls.map((c) => typeof c[2])).toStrictEqual([
      "function",
      "function",
      "function",
      "function",
    ]);
    expect(ch.subscribe).toHaveBeenCalledTimes(1);
    expect(typeof ch.subscribe.mock.calls[0]?.[0]).toBe("function");
    const lastOn = Math.max(...ch.on.mock.invocationCallOrder);
    const [subscribedAt] = ch.subscribe.mock.invocationCallOrder;
    expect(lastOn).toBeLessThan(subscribedAt ?? 0);
    expect(client.removeChannel).not.toHaveBeenCalled();
  });

  it("start() twice still makes one channel, four bindings and one subscription", () => {
    const rt = make();
    rt.start();
    rt.start();
    expect(client.channel).toHaveBeenCalledTimes(1);
    const ch = onlyChannel();
    expect(ch.on).toHaveBeenCalledTimes(4);
    expect(ch.subscribe).toHaveBeenCalledTimes(1);
  });

  it("each table's binding applies a payload to that table's cache", async () => {
    make().start();
    const ch = onlyChannel();
    ch.deliver(changed("INSERT", "events", eventRowNulls));
    ch.deliver(changed("INSERT", "event_overrides", overrideRowFull));
    ch.deliver(changed("INSERT", "kinds", kindRowNulls));
    ch.deliver(changed("INSERT", "reminders", reminderRowFull));
    await vi.waitFor(async () =>
      expect(await contents()).toStrictEqual({
        events: [eventNulls],
        overrides: [overrideFull],
        kinds: [kindNulls],
        reminders: [reminderFull],
        outbox: [],
      }),
    );
  });
});

describe("a payload from another device updates the cache (AC-3)", () => {
  it("a newer payload replaces the cached row", async () => {
    await db.events.put(cachedEvent());
    const rt = make();
    await expect(
      rt.apply("events", eventPayload("UPDATE", { updated_at: NEWER })),
    ).resolves.toBeUndefined();
    expect(await contents()).toStrictEqual({
      events: [{ ...eventNulls, title: "Server", updatedAt: NEWER }],
      overrides: [],
      kinds: [],
      reminders: [],
      outbox: [],
    });
  });

  it("an older payload for a cached row is ignored", async () => {
    await db.events.put(cachedEvent());
    const rt = make();
    const before = await contents();
    await rt.apply("events", eventPayload("UPDATE", { updated_at: OLDER }));
    expect(await contents()).toStrictEqual(before);
    expect(before.events).toStrictEqual([cachedEvent()]);

    // The same row, newer: applied - the case above was the stamp, not the row.
    await rt.apply("events", eventPayload("UPDATE", { updated_at: NEWER }));
    expect(await db.events.toArray()).toStrictEqual([
      { ...eventNulls, title: "Server", updatedAt: NEWER },
    ]);
  });

  it("an equal updated_at is ignored", async () => {
    await db.events.put(cachedEvent());
    const rt = make();
    const before = await contents();
    await rt.apply("events", eventPayload("UPDATE", { updated_at: BASE }));
    await rt.apply("events", eventPayload("INSERT", { updated_at: BASE }));
    expect(await contents()).toStrictEqual(before);

    await rt.apply("events", eventPayload("UPDATE", { updated_at: NEWER }));
    expect((await db.events.get(eventNulls.id))?.title).toBe("Server");
  });

  it("stamps are compared as strings: one microsecond newer is newer, and an older payload after it changes nothing", async () => {
    await db.events.put(cachedEvent());
    const rt = make();
    await rt.apply("events", eventPayload("UPDATE", { updated_at: NEWEST }));
    await rt.apply(
      "events",
      eventPayload("UPDATE", { title: "Stale", updated_at: NEWER }),
    );
    expect(await db.events.toArray()).toStrictEqual([
      { ...eventNulls, title: "Server", updatedAt: NEWEST },
    ]);
  });

  it("an INSERT for a row the cache does not hold is inserted", async () => {
    await db.events.put(eventFull);
    const rt = make();
    await rt.apply("events", changed("INSERT", "events", eventRowNulls));
    expect(byId(await db.events.toArray())).toStrictEqual(
      byId([eventFull, eventNulls]),
    );
  });

  it("an UPDATE for a row the cache does not hold is inserted too", async () => {
    const rt = make();
    await rt.apply("events", changed("UPDATE", "events", eventRowNulls));
    expect(await db.events.toArray()).toStrictEqual([eventNulls]);
  });

  it("a soft delete arrives as an UPDATE and is applied: the cached row carries deletedAt", async () => {
    await db.events.put({ ...eventNulls, updatedAt: BASE });
    const rt = make();
    await rt.apply(
      "events",
      changed("UPDATE", "events", {
        ...eventRowNulls,
        deleted_at: NEWER,
        updated_at: NEWER,
      }),
    );
    expect(await db.events.toArray()).toStrictEqual([
      { ...eventNulls, deletedAt: NEWER, updatedAt: NEWER },
    ]);
  });

  it.each<{
    table: RealtimeTable;
    row: Record<string, unknown>;
    read: (d: CalendarDb) => Promise<unknown[]>;
    expected: unknown[];
  }>([
    {
      table: "events",
      row: eventRowFull,
      read: (d) => d.events.toArray(),
      expected: [eventFull],
    },
    {
      table: "event_overrides",
      row: overrideRowFull,
      read: (d) => d.overrides.toArray(),
      expected: [overrideFull],
    },
    {
      table: "kinds",
      row: kindRowNulls,
      read: (d) => d.kinds.toArray(),
      expected: [kindNulls],
    },
    {
      table: "reminders",
      row: reminderRowNulls,
      read: (d) => d.reminders.toArray(),
      expected: [reminderNulls],
    },
  ])(
    "$table: a payload lands in its own cache table as the mapped domain object, and in no other",
    async ({ table, row, read, expected }) => {
      const rt = make();
      await rt.apply(table, changed("INSERT", table, row));
      expect(await read(db)).toStrictEqual(expected);
      const all = await contents();
      const total =
        all.events.length +
        all.overrides.length +
        all.kinds.length +
        all.reminders.length;
      expect(total).toBe(1);
      expect(all.outbox).toStrictEqual([]);
    },
  );

  it("a DELETE payload is ignored: the cached row stays", async () => {
    await db.events.put(cachedEvent());
    const rt = make();
    const before = await contents();
    await expect(
      rt.apply("events", deletedPayload("events", eventNulls.id)),
    ).resolves.toBeUndefined();
    expect(await contents()).toStrictEqual(before);
    expect(before.events).toHaveLength(1);

    await rt.apply("events", eventPayload("UPDATE", { updated_at: NEWER }));
    expect((await db.events.get(eventNulls.id))?.title).toBe("Server");
  });

  it.each<RealtimeTable>(["events", "event_overrides", "kinds", "reminders"])(
    "%s: a malformed payload (new is null, or has no id) is ignored, apply resolves, and a good payload after it lands",
    async (table) => {
      await db.events.put(cachedEvent());
      const rt = make();
      const before = await contents();
      const nullNew = {
        ...changed("INSERT", table, {}),
        new: null,
      } as unknown as Payload;
      await expect(rt.apply(table, nullNew)).resolves.toBeUndefined();
      await expect(
        rt.apply(table, changed("UPDATE", table, {})),
      ).resolves.toBeUndefined();
      expect(await contents()).toStrictEqual(before);

      await rt.apply("events", eventPayload("UPDATE", { updated_at: NEWER }));
      expect((await db.events.get(eventNulls.id))?.title).toBe("Server");
    },
  );

  it("a mounted month view shows a newer row from another device without a reload or a remount", async () => {
    // November 2026, local time; Dentist is 3 Nov.
    await db.events.put(cachedEvent({ title: "Dentist" }));
    const store = createCachedEventsStore(db, sync);
    let mounts = 0;
    const { result } = renderHook(() => {
      useEffect(() => {
        mounts += 1;
      }, []);
      return useEventsInRange(at(11, 1), at(12, 1), store);
    });
    await waitFor(() =>
      expect(result.current.events.map((e) => e.title)).toStrictEqual([
        "Dentist",
      ]),
    );
    await settle();
    const runsBefore = runs();

    const rt = make();
    await rt.apply(
      "events",
      eventPayload("UPDATE", { title: "Dentist (moved)", updated_at: NEWER }),
    );
    await waitFor(() =>
      expect(result.current.events.map((e) => e.title)).toStrictEqual([
        "Dentist (moved)",
      ]),
    );
    // A stale echo of the old title does not bring it back.
    await rt.apply(
      "events",
      eventPayload("UPDATE", { title: "Dentist", updated_at: OLDER }),
    );
    await settle();
    expect(result.current.events.map((e) => e.title)).toStrictEqual([
      "Dentist (moved)",
    ]);
    expect(mounts).toBe(1);
    expect(runs()).toBe(runsBefore);
  });
});

describe("a pending local op wins over the stream (AC-4)", () => {
  it("a payload for a row with a queued op leaves the cache and the op alone", async () => {
    await db.events.put(cachedEvent({ title: "Mine" }));
    await db.outbox.add(op({ status: "queued" }));
    const rt = make();
    const before = await contents();
    await expect(
      rt.apply("events", eventPayload("UPDATE", { updated_at: NEWER })),
    ).resolves.toBeUndefined();
    expect(await contents()).toStrictEqual(before);
    expect(before.events.map((e) => e.title)).toStrictEqual(["Mine"]);
    expect(before.outbox.map((o) => [o.id, o.status])).toStrictEqual([
      [eventNulls.id, "queued"],
    ]);

    // A row with no op, in the same breath: applied.
    await rt.apply("events", changed("INSERT", "events", eventRowFull));
    expect(byId(await db.events.toArray())).toStrictEqual(
      byId([eventFull, cachedEvent({ title: "Mine" })]),
    );
    expect(await db.outbox.toArray()).toStrictEqual(before.outbox);
  });

  it("a failed op holds the row too, and the op stays failed with its error", async () => {
    await db.events.put(cachedEvent({ title: "Mine" }));
    await db.outbox.add(
      op({
        status: "failed",
        error: { code: "23514", message: "check violated", http: 400 },
      }),
    );
    const rt = make();
    const before = await contents();
    await rt.apply("events", eventPayload("UPDATE", { updated_at: NEWER }));
    expect(await contents()).toStrictEqual(before);

    await rt.apply("events", changed("INSERT", "events", eventRowFull));
    expect(await db.events.count()).toBe(2);
  });

  it("an op queued for a row the cache does not hold yet (an offline insert in flight) keeps the payload out", async () => {
    await db.outbox.add(op({ op: "insert", baseUpdatedAt: null }));
    const rt = make();
    await rt.apply("events", changed("INSERT", "events", eventRowNulls));
    expect(await db.events.toArray()).toStrictEqual([]);
    expect(await db.outbox.count()).toBe(1);
  });

  it.each<{
    table: RealtimeTable;
    outboxTable: OutboxOp["table"];
    seed: (d: CalendarDb) => Promise<unknown>;
    row: Record<string, unknown>;
    id: string;
  }>([
    {
      table: "event_overrides",
      outboxTable: "event_overrides",
      seed: (d) => d.overrides.put({ ...overrideFull, title: "Mine" }),
      row: { ...overrideRowFull, updated_at: NEWER },
      id: overrideFull.id,
    },
    {
      table: "kinds",
      outboxTable: "kinds",
      seed: (d) => d.kinds.put({ ...kindNulls, name: "Mine", updatedAt: BASE }),
      row: { ...kindRowNulls, updated_at: NEWER },
      id: kindNulls.id,
    },
    {
      table: "reminders",
      outboxTable: "reminders",
      seed: (d) => d.reminders.put({ ...reminderFull, minutesBefore: 5 }),
      row: { ...reminderRowFull, updated_at: NEWER },
      id: reminderFull.id,
    },
  ])(
    "$table: an op under the outbox name $outboxTable holds the row",
    async ({ table, outboxTable, seed, row, id }) => {
      await seed(db);
      await db.outbox.add(op({ table: outboxTable, id }));
      const rt = make();
      const before = await contents();
      await rt.apply(table, changed("UPDATE", table, row));
      expect(await contents()).toStrictEqual(before);
    },
  );

  it("an op on another table with the same id does not hold the row back", async () => {
    await db.events.put(cachedEvent());
    await db.outbox.add(op({ table: "kinds", id: eventNulls.id }));
    const rt = make();
    await rt.apply("events", eventPayload("UPDATE", { updated_at: NEWER }));
    expect(await db.events.toArray()).toStrictEqual([
      { ...eventNulls, title: "Server", updatedAt: NEWER },
    ]);
    expect(await db.outbox.count()).toBe(1);
  });

  it("once the op is gone, the next newer payload is applied", async () => {
    await db.events.put(cachedEvent({ title: "Mine" }));
    const seq = await db.outbox.add(op({}));
    const rt = make();
    await rt.apply("events", eventPayload("UPDATE", { updated_at: NEWER }));
    expect((await db.events.get(eventNulls.id))?.title).toBe("Mine");

    await db.outbox.delete(seq);
    await rt.apply("events", eventPayload("UPDATE", { updated_at: NEWEST }));
    expect(await db.events.toArray()).toStrictEqual([
      { ...eventNulls, title: "Server", updatedAt: NEWEST },
    ]);
  });
});

describe("catch-up on rejoin and on return to the foreground (AC-5)", () => {
  it("the first SUBSCRIBED after start() runs no catch-up", async () => {
    make().start();
    const ch = onlyChannel();
    ch.report("SUBSCRIBED");
    await settle();
    expect(runs()).toBe(0);

    ch.report("SUBSCRIBED");
    await settle();
    expect(sync.run.mock.calls).toStrictEqual([[]]);
  });

  it("a SUBSCRIBED after a disconnect runs one catch-up", async () => {
    make().start();
    const ch = onlyChannel();
    ch.report("SUBSCRIBED");
    await settle();
    ch.report("CLOSED");
    await settle();
    const before = runs();
    ch.report("SUBSCRIBED");
    await settle();
    expect(runs()).toBe(before + 1);

    ch.report("CHANNEL_ERROR");
    ch.report("SUBSCRIBED");
    await settle();
    expect(runs()).toBe(before + 2);
  });

  it("TIMED_OUT, CLOSED and CHANNEL_ERROR run nothing; the SUBSCRIBED that follows them runs one", async () => {
    make().start();
    const ch = onlyChannel();
    ch.report("SUBSCRIBED");
    ch.report("TIMED_OUT");
    ch.report("CHANNEL_ERROR");
    ch.report("CLOSED");
    await settle();
    expect(runs()).toBe(0);

    ch.report("SUBSCRIBED");
    await settle();
    expect(runs()).toBe(1);
  });

  it("the app returning to the foreground runs one catch-up per return; going to the background runs none", async () => {
    make().start();
    showPage("hidden");
    await settle();
    expect(runs()).toBe(0);

    showPage("visible");
    await settle();
    expect(runs()).toBe(1);
    showPage("hidden");
    showPage("visible");
    await settle();
    expect(sync.run.mock.calls).toStrictEqual([[], []]);
  });

  it("the page is watched only once started", async () => {
    const rt = make();
    showPage("visible");
    await settle();
    expect(runs()).toBe(0);

    rt.start();
    showPage("visible");
    await settle();
    expect(runs()).toBe(1);
  });

  it("with no document given, the page's own document is watched", async () => {
    const rt = createRealtime(asClient(client), db, sync);
    started.push(rt);
    rt.start();
    showPage("visible");
    await settle();
    expect(runs()).toBe(1);
  });

  it("start() twice still runs one catch-up per return to the foreground", async () => {
    const rt = make();
    rt.start();
    rt.start();
    showPage("visible");
    await settle();
    expect(runs()).toBe(1);
  });

  it("after stop() the channel is removed, and neither the page nor the old channel runs a catch-up", async () => {
    const rt = make();
    rt.start();
    const ch = onlyChannel();
    ch.report("SUBSCRIBED");
    ch.report("SUBSCRIBED");
    await settle();
    expect(runs()).toBe(1);

    rt.stop();
    expect(client.removeChannel.mock.calls).toStrictEqual([[ch]]);
    showPage("visible");
    ch.report("SUBSCRIBED");
    await settle();
    expect(runs()).toBe(1);
  });

  it("stop() is idempotent: twice removes the channel once, and before start() removes nothing", () => {
    const rt = make();
    rt.stop();
    expect(client.removeChannel).not.toHaveBeenCalled();
    rt.start();
    rt.stop();
    rt.stop();
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
  });

  it("start() after stop() subscribes a fresh channel whose first SUBSCRIBED is silent again", async () => {
    const rt = make();
    rt.start();
    client.channels[0]?.report("SUBSCRIBED");
    rt.stop();
    rt.start();

    expect(client.channel.mock.calls).toStrictEqual([["cache"], ["cache"]]);
    const [first, second] = client.channels;
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    expect(second?.on).toHaveBeenCalledTimes(4);
    expect(second?.subscribe).toHaveBeenCalledTimes(1);

    second?.report("SUBSCRIBED");
    await settle();
    expect(runs()).toBe(0);
    second?.report("SUBSCRIBED");
    await settle();
    expect(runs()).toBe(1);

    // One page listener after a restart, not two.
    showPage("visible");
    await settle();
    expect(runs()).toBe(2);
  });
});

describe("toReminderRow (PO decision 7)", () => {
  it("maps every column, a sent reminder for one occurrence", () => {
    expect(toReminderRow(reminderRowFull)).toStrictEqual(reminderFull);
  });

  it("keeps the nulls of an unsent reminder for every occurrence", () => {
    expect(toReminderRow(reminderRowNulls)).toStrictEqual(reminderNulls);
  });
});
