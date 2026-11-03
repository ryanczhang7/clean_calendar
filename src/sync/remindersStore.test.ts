import { act, renderHook, waitFor } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import type { Reminder } from "../data/rows";
import { byId, freshDb, reminder, T1, T2, T3 } from "../test/cache-fixtures";
import { createCachedRemindersStore } from "./cachedStores";
import { db as appDb, type CalendarDb } from "./db";
import type { SyncResult } from "./hydrate";
import {
  liveTemplate,
  type RemindersStore,
  remindersStore,
  useReminder,
} from "./remindersStore";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-026 AC-5, Contract Block 8: the reminders read model. MECHANICAL: the
// exact row liveTemplate and useReminder return - the event's live template,
// or null - and the exact snapshot the cached store publishes. The store is
// the same discipline as the overrides store (cachedStores.ts): a cached store
// over Dexie, every row in the cache. "Live" is `deletedAt == null`, so a row
// streamed before this story, with no deletedAt key at all, is live (Block 2).

const EVENT_ID = reminder(1).eventId;
const OTHER_EVENT_ID = "10000000-0000-4000-8000-000000000002";

const template = reminder(1, { minutesBefore: 15, updatedAt: T1 });
const cleared = reminder(2, { deletedAt: T2, updatedAt: T2 });
const materialised = reminder(3, {
  occurrenceDate: "2026-10-27",
  sentAt: "2026-10-27T08:45:00.000001+00:00",
});
const otherEvents = reminder(4, { eventId: OTHER_EVENT_ID, minutesBefore: 5 });

type FakeSync = { run: Mock<() => Promise<SyncResult>> };

let db: CalendarDb;
let sync: FakeSync;
const stops: (() => void)[] = [];

beforeEach(() => {
  db = freshDb();
  sync = {
    run: vi.fn<() => Promise<SyncResult>>(async () => ({ status: "ok" })),
  };
});

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  db.close();
});

describe("liveTemplate(reminders, eventId) (AC-5, Block 8)", () => {
  it("is the event's template - occurrenceDate null, not deleted - among its per-occurrence rows, a cleared one and another event's", () => {
    expect(
      liveTemplate([materialised, cleared, otherEvents, template], EVENT_ID),
    ).toStrictEqual(template);
  });

  it("is null when the event has no reminder", () => {
    expect(liveTemplate([], EVENT_ID)).toBeNull();
    expect(liveTemplate([otherEvents], EVENT_ID)).toBeNull();
  });

  it("is null when the event's only template is soft-deleted", () => {
    expect(liveTemplate([cleared], EVENT_ID)).toBeNull();
  });

  it("is null when the event has only per-occurrence rows", () => {
    expect(
      liveTemplate(
        [materialised, reminder(5, { occurrenceDate: "2026-11-03" })],
        EVENT_ID,
      ),
    ).toBeNull();
  });

  it("another event's live template is not this event's", () => {
    expect(liveTemplate([otherEvents], OTHER_EVENT_ID)).toStrictEqual(
      otherEvents,
    );
    expect(liveTemplate([otherEvents], EVENT_ID)).toBeNull();
  });

  it("a cached template with no deletedAt key (streamed before this story) is live", () => {
    const { deletedAt: _d, ...legacy } = template;
    expect(liveTemplate([legacy as Reminder], EVENT_ID)).toStrictEqual(legacy);
  });
});

describe("createCachedRemindersStore(db, sync) (Block 8)", () => {
  it("constructing it reads nothing and runs no sync: loading, no reminders", () => {
    const store = createCachedRemindersStore(db, sync);
    expect(store.getSnapshot()).toStrictEqual({
      status: "loading",
      reminders: [],
    });
    expect(sync.run).not.toHaveBeenCalled();
  });

  it("on subscribe: ready with every cached reminder - templates live and cleared, per-occurrence rows, every event's", async () => {
    await db.reminders.bulkPut([template, cleared, materialised, otherEvents]);
    const store = createCachedRemindersStore(db, sync);
    stops.push(store.subscribe(() => {}));
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe("ready"));
    expect(byId(store.getSnapshot().reminders)).toStrictEqual(
      byId([template, cleared, materialised, otherEvents]),
    );
  });

  it("refresh() runs the sync and resolves with the snapshot showing what it wrote", async () => {
    const store = createCachedRemindersStore(db, sync);
    sync.run.mockImplementationOnce(async () => {
      await db.reminders.put(template);
      return { status: "ok" };
    });
    await store.refresh();
    expect(sync.run).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toStrictEqual({
      status: "ready",
      reminders: [template],
    });
  });

  it("a failed sync leaves the cached reminders ready", async () => {
    await db.reminders.put(template);
    sync.run.mockResolvedValue({ status: "unavailable" });
    const store = createCachedRemindersStore(db, sync);
    await expect(store.refresh()).resolves.toBeUndefined();
    expect(store.getSnapshot()).toStrictEqual({
      status: "ready",
      reminders: [template],
    });
  });
});

describe("useReminder(eventId, store) (AC-5, Block 8)", () => {
  it("returns the event's live template once the store has loaded, asking it to refresh exactly once", async () => {
    await db.reminders.bulkPut([template, materialised, otherEvents]);
    const store = createCachedRemindersStore(db, sync);
    const { result } = renderHook(() => useReminder(EVENT_ID, store));
    await waitFor(() => expect(result.current).toStrictEqual(template));
    expect(sync.run).toHaveBeenCalledTimes(1);
  });

  it("returns null for an event with no reminder, one with only a cleared template, and one with only per-occurrence rows", async () => {
    const clearedOnly = reminder(6, {
      eventId: "10000000-0000-4000-8000-000000000006",
      deletedAt: T2,
    });
    const occurrencesOnly = reminder(7, {
      eventId: "10000000-0000-4000-8000-000000000007",
      occurrenceDate: "2026-10-27",
    });
    await db.reminders.bulkPut([template, clearedOnly, occurrencesOnly]);
    const store = createCachedRemindersStore(db, sync);
    stops.push(store.subscribe(() => {}));
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe("ready"));
    const read = (id: string) =>
      renderHook(() => useReminder(id, store)).result.current;
    expect(read(OTHER_EVENT_ID)).toBeNull();
    expect(read(clearedOnly.eventId)).toBeNull();
    expect(read(occurrencesOnly.eventId)).toBeNull();
    // The contrast: the same store does answer for an event that has one.
    expect(read(EVENT_ID)).toStrictEqual(template);
  });

  it("follows the cache: a new value, a clear and a restore each re-render it", async () => {
    await db.reminders.put(template);
    const store: RemindersStore = createCachedRemindersStore(db, sync);
    const { result } = renderHook(() => useReminder(EVENT_ID, store));
    await waitFor(() => expect(result.current).toStrictEqual(template));

    const changed = { ...template, minutesBefore: 60, updatedAt: T2 };
    await act(() => db.reminders.put(changed));
    await waitFor(() => expect(result.current).toStrictEqual(changed));

    await act(() =>
      db.reminders.put({ ...changed, deletedAt: T3, updatedAt: T3 }),
    );
    await waitFor(() => expect(result.current).toBeNull());

    const restored = { ...changed, deletedAt: null, updatedAt: T3 };
    await act(() => db.reminders.put(restored));
    await waitFor(() => expect(result.current).toStrictEqual(restored));
  });

  it("is null while the store is loading, and the template once it is ready", async () => {
    await db.reminders.put(template);
    const store = createCachedRemindersStore(db, sync);
    const { result } = renderHook(() => useReminder(EVENT_ID, store));
    expect(store.getSnapshot().status).toBe("loading");
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toStrictEqual(template));
  });
});

describe("remindersStore, the app's one store (Block 8)", () => {
  it("has not loaded at import", () => {
    expect(remindersStore.getSnapshot()).toStrictEqual({
      status: "loading",
      reminders: [],
    });
  });

  it("reads the app's db, and is what useReminder(eventId) reads by default", async () => {
    await appDb.reminders.clear();
    await appDb.reminders.put(template);
    stops.push(remindersStore.subscribe(() => {}));
    await vi.waitFor(() =>
      expect(remindersStore.getSnapshot()).toStrictEqual({
        status: "ready",
        reminders: [template],
      }),
    );
    const { result } = renderHook(() => useReminder(EVENT_ID));
    expect(result.current).toStrictEqual(template);
    await appDb.reminders.clear();
  });
});
