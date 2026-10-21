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
import { freshDb, override, T1, T2, T3 } from "../test/cache-fixtures";
import { createCachedOverridesStore } from "./cachedStores";
import { type CalendarDb, db as appDb } from "./db";
import type { SyncResult } from "./hydrate";
import {
  type OverridesSnapshot,
  type OverridesStore,
  overridesStore,
  useOverrides,
} from "./overridesStore";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-014 Contract, Blocks 4 and 5: the overrides read model CAL-024 will
// expand recurrences with. The same discipline as useKinds: a cached store
// over Dexie, every override (an override has no deleted_at; a cancelled one
// is data the expansion needs), ordered by occurrenceDate then createdAt.

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

const ids = (s: OverridesSnapshot) => s.overrides.map((o) => o.id);

const lateDate = override(1, "2026-10-21", { createdAt: T1 });
const sameDayLater = override(2, "2026-10-14", { createdAt: T3 });
const sameDayEarlier = override(3, "2026-10-14", { createdAt: T2 });
const cancelled = override(4, "2026-10-07", { cancelled: true });

describe("createCachedOverridesStore(db, sync) (Block 4)", () => {
  it("on subscribe: ready with every override, cancelled ones included, by occurrenceDate then createdAt", async () => {
    await db.overrides.bulkPut([
      lateDate,
      sameDayLater,
      cancelled,
      sameDayEarlier,
    ]);
    const store = createCachedOverridesStore(db, sync);
    stops.push(store.subscribe(() => {}));
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe("ready"));
    expect(store.getSnapshot().overrides).toStrictEqual([
      cancelled,
      sameDayEarlier,
      sameDayLater,
      lateDate,
    ]);
  });

  it("an empty cache is ready with no overrides", async () => {
    const store = createCachedOverridesStore(db, sync);
    stops.push(store.subscribe(() => {}));
    await vi.waitFor(() =>
      expect(store.getSnapshot()).toStrictEqual({
        status: "ready",
        overrides: [],
      }),
    );
  });

  it("refresh() runs the sync and resolves with the snapshot showing what it wrote", async () => {
    const store = createCachedOverridesStore(db, sync);
    sync.run.mockImplementationOnce(async () => {
      await db.overrides.put(lateDate);
      return { status: "ok" };
    });
    await store.refresh();
    expect(sync.run).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toStrictEqual({
      status: "ready",
      overrides: [lateDate],
    });
  });

  it("a failed sync leaves the cached overrides ready", async () => {
    await db.overrides.put(lateDate);
    sync.run.mockResolvedValue({ status: "unavailable" });
    const store = createCachedOverridesStore(db, sync);
    await expect(store.refresh()).resolves.toBeUndefined();
    expect(store.getSnapshot()).toStrictEqual({
      status: "ready",
      overrides: [lateDate],
    });
  });
});

describe("useOverrides(store) (Block 5)", () => {
  it("on a store that has never loaded, asks it to refresh exactly once, and re-renders ready", async () => {
    await db.overrides.put(sameDayEarlier);
    const store = createCachedOverridesStore(db, sync);
    const { result } = renderHook(() => useOverrides(store));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(ids(result.current)).toStrictEqual([sameDayEarlier.id]);
    expect(sync.run).toHaveBeenCalledTimes(1);
  });

  it("re-renders when an override changes in the cache", async () => {
    await db.overrides.put(sameDayEarlier);
    const store: OverridesStore = createCachedOverridesStore(db, sync);
    const { result } = renderHook(() => useOverrides(store));
    await waitFor(() =>
      expect(ids(result.current)).toStrictEqual([sameDayEarlier.id]),
    );
    await db.overrides.put({
      ...sameDayEarlier,
      cancelled: true,
      updatedAt: T3,
    });
    await waitFor(() =>
      expect(result.current.overrides[0]?.cancelled).toBe(true),
    );
  });
});

describe("overridesStore, the app's one store (Block 5)", () => {
  it("has not loaded at import", () => {
    expect(overridesStore.getSnapshot()).toStrictEqual({
      status: "loading",
      overrides: [],
    });
  });

  it("reads the app's db, and is what useOverrides() reads by default", async () => {
    await appDb.overrides.clear();
    await appDb.overrides.put(lateDate);
    stops.push(overridesStore.subscribe(() => {}));
    await vi.waitFor(() =>
      expect(overridesStore.getSnapshot()).toStrictEqual({
        status: "ready",
        overrides: [lateDate],
      }),
    );
    const { result } = renderHook(() => useOverrides());
    expect(result.current).toBe(overridesStore.getSnapshot());
  });
});
