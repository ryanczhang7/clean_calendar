import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { type JSX, useEffect, useLayoutEffect, useRef } from "react";
import { MemoryRouter } from "react-router";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import type { ListResult } from "../data/result";
import type { Event, EventOverride, Kind } from "../data/rows";
import type { SeedRepo } from "../kinds/seedKinds";
import { CalendarPage } from "../calendar/CalendarPage";
import { setSelected } from "../calendar/selection";
import {
  at,
  brokenDb,
  countingFactory,
  ev,
  freshDb,
  kind,
  STAMP,
  T1,
  T2,
} from "../test/cache-fixtures";
import { installMatchMedia } from "../test/media";
import {
  createCachedEventsStore,
  createCachedKindsStore,
  createCachedOverridesStore,
} from "./cachedStores";
import { CalendarDb, type OutboxOp } from "./db";
import { type EventsStore, useEventsInRange } from "./eventsStore";
import { createSync, type SyncResult, type SyncRepos } from "./hydrate";
import { type KindsStore, useKinds } from "./kindsStore";
import { IDBKeyRange } from "fake-indexeddb";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-014 AC-3, AC-4, AC-5 and Contract Block 4: the cached stores behind
// the existing KindsStore / EventsStore types and hooks. Every case builds a
// real CalendarDb over a fresh fake-indexeddb factory and seeds it directly;
// the network is reached only through a Sync, which is a vi.fn fake or a
// real createSync over vi.fn repositories. No fake timers: fake-indexeddb
// schedules its work on real ones.

type FakeSync = { run: Mock<() => Promise<SyncResult>> };
type FakeSeed = {
  listAll: Mock<SeedRepo["listAll"]>;
  insertMany: Mock<SeedRepo["insertMany"]>;
};
type Repos = {
  kinds: { listSince: Mock<(since: string) => Promise<ListResult<Kind>>> };
  events: { listSince: Mock<(since: string) => Promise<ListResult<Event>>> };
  overrides: {
    listSince: Mock<(since: string) => Promise<ListResult<EventOverride>>>;
  };
};

let db: CalendarDb;
let sync: FakeSync;
let seed: FakeSeed;
const cleanups: (() => void)[] = [];
const dbs: CalendarDb[] = [];

beforeEach(() => {
  db = freshDb();
  dbs.push(db);
  sync = {
    run: vi.fn<() => Promise<SyncResult>>(async () => ({ status: "ok" })),
  };
  seed = {
    listAll: vi.fn<SeedRepo["listAll"]>(),
    insertMany: vi.fn<SeedRepo["insertMany"]>(),
  };
});

afterEach(() => {
  for (const stop of cleanups.splice(0)) stop();
  for (const d of dbs.splice(0)) d.close();
});

/** Repositories that answer every listSince with `offline`. */
function offlineRepos(): Repos {
  return {
    kinds: {
      listSince: vi.fn<(since: string) => Promise<ListResult<Kind>>>(
        async () => ({ status: "offline" }),
      ),
    },
    events: {
      listSince: vi.fn<(since: string) => Promise<ListResult<Event>>>(
        async () => ({ status: "offline" }),
      ),
    },
    overrides: {
      listSince: vi.fn<(since: string) => Promise<ListResult<EventOverride>>>(
        async () => ({ status: "offline" }),
      ),
    },
  };
}

const listSinceCalls = (r: Repos) =>
  r.kinds.listSince.mock.calls.length +
  r.events.listSince.mock.calls.length +
  r.overrides.listSince.mock.calls.length;

/** Subscribe for the rest of the test (unsubscribed in afterEach). */
function keep(
  store: { subscribe(l: () => void): () => void },
  listener = () => {},
) {
  cleanups.push(store.subscribe(listener));
}

const titles = (events: Event[]) => events.map((e) => e.title);

/** Let fake-indexeddb and Dexie's liveQuery run their queued work. */
const settle = () => new Promise((done) => setTimeout(done, 30));

const A = kind(1, { name: "Gym" });
const B = kind(2, { name: "Golf" });
const C = kind(3, { name: "Movies" });
const GONE = kind(4, { name: "Gardening", sortOrder: 0, deletedAt: STAMP });

// The week of Monday 12 October 2026: [12 Oct 00:00, 19 Oct 00:00).
const START = at(10, 12);
const END = at(10, 19);

describe("nothing at construction (Block 4; AC-3's 'no request before the first render')", () => {
  it("constructing the three stores opens no database, runs no sync, reads no seed, and each is loading and empty", async () => {
    const { factory, opens } = countingFactory();
    const lazy = new CalendarDb("cal-014-construct", {
      indexedDB: factory,
      IDBKeyRange,
    });
    dbs.push(lazy);
    const kinds = createCachedKindsStore(lazy, seed, sync);
    const events = createCachedEventsStore(lazy, sync);
    const overrides = createCachedOverridesStore(lazy, sync);
    // getSnapshot is what a render calls; it must not open anything either.
    const k = kinds.getSnapshot();
    const e = events.getSnapshot();
    const o = overrides.getSnapshot();
    // Dexie opens on a later tick; give an eager open the time to show.
    await settle();
    expect(opens()).toBe(0);
    expect(lazy.isOpen()).toBe(false);
    expect(sync.run).not.toHaveBeenCalled();
    expect(seed.listAll).not.toHaveBeenCalled();
    expect([k.status, k.kinds, k.byId(A.id)]).toStrictEqual([
      "loading",
      [],
      undefined,
    ]);
    expect(e).toStrictEqual({ status: "loading", events: [] });
    expect(o).toStrictEqual({ status: "loading", overrides: [] });
  });
});

describe("the first subscribe reads the cache (Block 4)", () => {
  it("kinds: ready with the live kinds by sortOrder, a soft-deleted kind found by id only", async () => {
    await db.kinds.bulkPut([C, GONE, A, B]);
    const store = createCachedKindsStore(db, seed, sync);
    keep(store);
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe("ready"));
    const snap = store.getSnapshot();
    expect(snap.kinds).toStrictEqual([A, B, C]);
    expect(snap.byId(GONE.id)).toStrictEqual(GONE);
    expect(snap.byId("ffffffff-ffff-4fff-8fff-ffffffffffff")).toBeUndefined();
  });

  it("kinds sharing a sortOrder are ordered by createdAt", async () => {
    const later = kind(5, { sortOrder: 1, createdAt: T2 });
    const earlier = kind(6, { sortOrder: 1, createdAt: T1 });
    await db.kinds.bulkPut([later, earlier]);
    const store = createCachedKindsStore(db, seed, sync);
    keep(store);
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe("ready"));
    expect(store.getSnapshot().kinds).toStrictEqual([earlier, later]);
  });

  it("events: ready with the live events by startsAt then createdAt; a soft-deleted one is left out", async () => {
    const second = ev(1, at(10, 14, 9), at(10, 14, 10), { createdAt: T2 });
    const first = ev(2, at(10, 14, 9), at(10, 14, 10), { createdAt: T1 });
    const earliest = ev(3, at(10, 13, 9), at(10, 13, 10));
    const gone = ev(4, at(10, 12, 9), at(10, 12, 10), { deletedAt: STAMP });
    await db.events.bulkPut([second, gone, first, earliest]);
    const store = createCachedEventsStore(db, sync);
    keep(store);
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe("ready"));
    expect(store.getSnapshot().events).toStrictEqual([earliest, first, second]);
  });

  it("an empty cache is ready and empty, not unavailable (PO decision 5)", async () => {
    const kinds = createCachedKindsStore(db, seed, sync);
    const events = createCachedEventsStore(db, sync);
    keep(kinds);
    keep(events);
    await vi.waitFor(() => {
      expect(kinds.getSnapshot().status).toBe("ready");
      expect(events.getSnapshot()).toStrictEqual({
        status: "ready",
        events: [],
      });
    });
    expect(kinds.getSnapshot().kinds).toStrictEqual([]);
  });

  it("getSnapshot is the same object between changes, and a new one after a cache write", async () => {
    await db.events.put(ev(1, at(10, 14, 9), at(10, 14, 10)));
    const store = createCachedEventsStore(db, sync);
    keep(store);
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe("ready"));
    const before = store.getSnapshot();
    await settle();
    expect(store.getSnapshot()).toBe(before);
    await db.events.put(ev(2, at(10, 15, 9), at(10, 15, 10)));
    await vi.waitFor(() => expect(store.getSnapshot().events).toHaveLength(2));
    expect(store.getSnapshot()).not.toBe(before);
  });

  it("a subscriber is called when the cache changes, and not after it unsubscribed", async () => {
    const store = createCachedEventsStore(db, sync);
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe("ready"));
    listener.mockClear();
    await db.events.put(ev(1, at(10, 14, 9), at(10, 14, 10)));
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    stop();
    listener.mockClear();
    await db.events.put(ev(2, at(10, 15, 9), at(10, 15, 10)));
    await settle();
    expect(listener).not.toHaveBeenCalled();
  });

  it("subscribing again after the last unsubscribe reads the cache again", async () => {
    const store = createCachedEventsStore(db, sync);
    const stop = store.subscribe(() => {});
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe("ready"));
    stop();
    await db.events.put(
      ev(1, at(10, 14, 9), at(10, 14, 10), { title: "Later" }),
    );
    keep(store);
    await vi.waitFor(() =>
      expect(titles(store.getSnapshot().events)).toStrictEqual(["Later"]),
    );
  });
});

/**
 * Reads both hooks, and records - when it first committed - how many
 * listSince requests and how many sync passes had been started.
 */
function Calendar(props: {
  kinds: KindsStore;
  events: EventsStore;
  repos: Repos;
  runs: () => number;
  atFirstCommit: { calls: number | null; runs: number | null };
}): JSX.Element {
  const kinds = useKinds(props.kinds);
  const events = useEventsInRange(START, END, props.events);
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      props.atFirstCommit.calls = listSinceCalls(props.repos);
      props.atFirstCommit.runs = props.runs();
    }
  });
  return (
    <div>
      <p>
        kinds {kinds.status}: {kinds.kinds.map((k) => k.name).join(", ")}
      </p>
      <p>
        events {events.status}: {titles(events.events).join(", ")}
      </p>
    </div>
  );
}

describe("offline, from a populated cache (AC-3)", () => {
  it("useKinds and useEventsInRange return the cached rows, ready, with no request and no sync started before the first render committed", async () => {
    await db.kinds.bulkPut([A, B]);
    await db.events.bulkPut([
      ev(1, at(10, 14, 7), at(10, 14, 8), { title: "Swim" }),
      ev(2, at(10, 15, 9), at(10, 15, 10), { title: "Dentist" }),
    ]);
    const repos = offlineRepos();
    const realSync = createSync(db, repos as SyncRepos);
    const run = vi.spyOn(realSync, "run");
    const kinds = createCachedKindsStore(db, seed, realSync);
    const events = createCachedEventsStore(db, realSync);
    const atFirstCommit = {
      calls: null as number | null,
      runs: null as number | null,
    };

    expect(listSinceCalls(repos)).toBe(0);
    render(
      <Calendar
        kinds={kinds}
        events={events}
        repos={repos}
        runs={() => run.mock.calls.length}
        atFirstCommit={atFirstCommit}
      />,
    );
    // A pass reads its mark before it asks, so a request alone could lag a
    // pass already started: both are counted.
    expect(atFirstCommit).toStrictEqual({ calls: 0, runs: 0 });

    await screen.findByText("kinds ready: Gym, Golf");
    await screen.findByText("events ready: Swim, Dentist");

    // The sync the hooks ask for runs after the render, finds the network
    // down, and changes nothing: still ready, still the cached rows.
    await vi.waitFor(() => expect(run).toHaveBeenCalled());
    await Promise.all(run.mock.results.map((r) => r.value));
    expect(repos.kinds.listSince).toHaveBeenCalled();
    await settle();
    expect(screen.getByText("kinds ready: Gym, Golf")).toBeInTheDocument();
    expect(screen.getByText("events ready: Swim, Dentist")).toBeInTheDocument();
  });

  it("the month page renders a cached event's chip with the network down", async () => {
    const media = installMatchMedia({ width: 1280, colorScheme: "light" });
    cleanups.push(() => media.restore());
    localStorage.clear();
    act(() => setSelected(null));
    cleanups.push(() => act(() => setSelected(null)));

    await db.kinds.put(A);
    await db.events.put(ev(1, at(10, 15, 7), at(10, 15, 8), { title: "Swim" }));
    const realSync = createSync(db, offlineRepos() as SyncRepos);
    render(
      <MemoryRouter initialEntries={["/month/2026-10"]}>
        <CalendarPage
          kinds={createCachedKindsStore(db, seed, realSync)}
          events={createCachedEventsStore(db, realSync)}
          now={() => at(10, 14, 12)}
        />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("button", { name: "Swim, Gym, 07:00 to 08:00" }),
    ).toBeInTheDocument();
  });
});

describe("a mounted consumer follows the cache (AC-4)", () => {
  function mountWeek(store: EventsStore) {
    let mounts = 0;
    const hook = renderHook(() => {
      useEffect(() => {
        mounts += 1;
      }, []);
      return useEventsInRange(START, END, store);
    });
    return { ...hook, mounts: () => mounts };
  }

  it("re-renders with a row changed in the cache outside it - no remount, no reload", async () => {
    const swim = ev(1, at(10, 14, 7), at(10, 14, 8), { title: "Swim" });
    await db.events.put(swim);
    const store = createCachedEventsStore(db, sync);
    const { result, mounts } = mountWeek(store);
    await waitFor(() =>
      expect(titles(result.current.events)).toStrictEqual(["Swim"]),
    );

    await db.events.put({
      ...swim,
      title: "Swim (pool closed)",
      updatedAt: T2,
    });
    await waitFor(() =>
      expect(titles(result.current.events)).toStrictEqual([
        "Swim (pool closed)",
      ]),
    );
    expect(mounts()).toBe(1);
  });

  it("re-renders when a sync writes a new row and soft-deletes another - the deleted one leaves the view", async () => {
    const swim = ev(1, at(10, 14, 7), at(10, 14, 8), { title: "Swim" });
    await db.events.put(swim);
    await db.meta.put({ key: "mark:events", value: T1 });
    const repos = offlineRepos();
    repos.kinds.listSince.mockResolvedValue({ status: "ok", rows: [] });
    repos.overrides.listSince.mockResolvedValue({ status: "ok", rows: [] });
    const realSync = createSync(db, repos as SyncRepos);
    const store = createCachedEventsStore(db, sync);
    const { result, mounts } = mountWeek(store);
    await waitFor(() =>
      expect(titles(result.current.events)).toStrictEqual(["Swim"]),
    );

    const dentist = ev(2, at(10, 15, 9), at(10, 15, 10), {
      title: "Dentist",
      updatedAt: T2,
    });
    repos.events.listSince.mockResolvedValueOnce({
      status: "ok",
      rows: [{ ...swim, deletedAt: T2, updatedAt: T2 }, dentist],
    });
    await realSync.run();
    await waitFor(() =>
      expect(titles(result.current.events)).toStrictEqual(["Dentist"]),
    );
    expect(mounts()).toBe(1);
    expect((await db.events.get(swim.id))?.deletedAt).toBe(T2);
  });
});

describe("useEventsInRange over the cache: exactly the live events overlapping [start, end) (AC-5)", () => {
  it("keeps inside, straddling either edge and covering; drops touching either edge, outside, and soft-deleted", async () => {
    const inside = ev(1, at(10, 14, 9), at(10, 14, 10), { title: "inside" });
    const straddlesStart = ev(2, at(10, 11, 22), at(10, 12, 1), {
      title: "straddles start",
    });
    const straddlesEnd = ev(3, at(10, 18, 23), at(10, 19, 1), {
      title: "straddles end",
    });
    const covers = ev(4, at(10, 5), at(10, 25), { title: "covers" });
    const endsAtStart = ev(5, at(10, 11, 23), at(10, 12, 0), {
      title: "ends at start",
    });
    const startsAtEnd = ev(6, at(10, 19, 0), at(10, 19, 1), {
      title: "starts at end",
    });
    const before = ev(7, at(10, 1, 9), at(10, 1, 10), { title: "before" });
    const after = ev(8, at(10, 25, 9), at(10, 25, 10), { title: "after" });
    const deleted = ev(9, at(10, 14, 11), at(10, 14, 12), {
      title: "deleted",
      deletedAt: STAMP,
    });
    await db.events.bulkPut([
      after,
      deleted,
      startsAtEnd,
      inside,
      before,
      endsAtStart,
      straddlesEnd,
      covers,
      straddlesStart,
    ]);
    const store = createCachedEventsStore(db, sync);
    const { result } = renderHook(() => useEventsInRange(START, END, store));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(titles(result.current.events)).toStrictEqual([
      "covers",
      "straddles start",
      "inside",
      "straddles end",
    ]);
    // The soft-deleted row is still in the cache; only the view leaves it out.
    expect(await db.events.get(deleted.id)).toStrictEqual(deleted);
  });
});

describe("refresh() (Block 4)", () => {
  it("runs the sync once, and resolves only after the snapshot shows what the sync wrote", async () => {
    await db.events.put(
      ev(1, at(10, 14, 9), at(10, 14, 10), { title: "Swim" }),
    );
    const store = createCachedEventsStore(db, sync);
    keep(store);
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe("ready"));
    sync.run.mockImplementationOnce(async () => {
      await db.events.put(
        ev(2, at(10, 15, 9), at(10, 15, 10), { title: "Dentist" }),
      );
      return { status: "ok" };
    });
    await store.refresh();
    expect(sync.run).toHaveBeenCalledTimes(1);
    expect(titles(store.getSnapshot().events)).toStrictEqual([
      "Swim",
      "Dentist",
    ]);
  });

  it("with no subscriber, still re-reads the cache: ready with what the sync wrote once it resolves", async () => {
    const store = createCachedKindsStore(db, seed, sync);
    sync.run.mockImplementationOnce(async () => {
      await db.kinds.put(A);
      return { status: "ok" };
    });
    await store.refresh();
    expect(store.getSnapshot().status).toBe("ready");
    expect(store.getSnapshot().kinds).toStrictEqual([A]);
  });

  it("a failed sync never changes the status: a loading store becomes ready with the cached rows, not unavailable", async () => {
    await db.events.put(
      ev(1, at(10, 14, 9), at(10, 14, 10), { title: "Swim" }),
    );
    sync.run.mockResolvedValue({ status: "unavailable" });
    const store = createCachedEventsStore(db, sync);
    await expect(store.refresh()).resolves.toBeUndefined();
    expect(store.getSnapshot().status).toBe("ready");
    expect(titles(store.getSnapshot().events)).toStrictEqual(["Swim"]);
  });

  it("a failed sync leaves a ready kinds store ready with its rows", async () => {
    await db.kinds.put(A);
    sync.run.mockResolvedValue({ status: "unavailable" });
    const store = createCachedKindsStore(db, seed, sync);
    keep(store);
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe("ready"));
    await store.refresh();
    expect(store.getSnapshot().status).toBe("ready");
    expect(store.getSnapshot().kinds).toStrictEqual([A]);
  });
});

describe("a cache that cannot be read (Block 4)", () => {
  it("publishes unavailable on subscribe; refresh resolves and nothing throws", async () => {
    const broken = brokenDb();
    dbs.push(broken);
    const kinds = createCachedKindsStore(broken, seed, sync);
    const events = createCachedEventsStore(broken, sync);
    keep(kinds);
    keep(events);
    await vi.waitFor(() => {
      expect(kinds.getSnapshot().status).toBe("unavailable");
      expect(events.getSnapshot()).toStrictEqual({
        status: "unavailable",
        events: [],
      });
    });
    await expect(events.refresh()).resolves.toBeUndefined();
    await expect(kinds.refresh()).resolves.toBeUndefined();
    expect(events.getSnapshot().status).toBe("unavailable");
    expect(kinds.getSnapshot().status).toBe("unavailable");
  });
});

describe("hide(id) over the cache keeps CAL-013's semantics (Block 4)", () => {
  const swim = ev(1, at(10, 14, 7), at(10, 14, 8), { title: "Swim" });
  const dentist = ev(2, at(10, 15, 9), at(10, 15, 10), { title: "Dentist" });

  async function readyStore(): Promise<EventsStore> {
    await db.events.bulkPut([swim, dentist]);
    const store = createCachedEventsStore(db, sync);
    keep(store);
    await vi.waitFor(() => expect(store.getSnapshot().events).toHaveLength(2));
    return store;
  }

  it("publishes at once, synchronously, a snapshot without the event - status unchanged, no sync", async () => {
    const store = await readyStore();
    const listener = vi.fn();
    keep(store, listener);
    const runs = sync.run.mock.calls.length;
    store.hide(swim.id);
    expect(store.getSnapshot()).toStrictEqual({
      status: "ready",
      events: [dentist],
    });
    expect(listener).toHaveBeenCalled();
    expect(sync.run).toHaveBeenCalledTimes(runs);
  });

  it("stays hidden across a refresh and across a cache write; reveal() brings it back", async () => {
    const store = await readyStore();
    const reveal = store.hide(swim.id);
    await store.refresh();
    expect(titles(store.getSnapshot().events)).toStrictEqual(["Dentist"]);
    await db.events.put({ ...swim, title: "Swim (moved)", updatedAt: T2 });
    await db.events.put({
      ...dentist,
      title: "Dentist (moved)",
      updatedAt: T2,
    });
    await vi.waitFor(() =>
      expect(titles(store.getSnapshot().events)).toStrictEqual([
        "Dentist (moved)",
      ]),
    );
    reveal();
    expect(titles(store.getSnapshot().events)).toStrictEqual([
      "Swim (moved)",
      "Dentist (moved)",
    ]);
  });

  it("two hides need two reveals, and one reveal called twice counts once", async () => {
    const store = await readyStore();
    const first = store.hide(swim.id);
    const second = store.hide(swim.id);
    first();
    first();
    expect(titles(store.getSnapshot().events)).toStrictEqual(["Dentist"]);
    second();
    expect(titles(store.getSnapshot().events)).toStrictEqual([
      "Swim",
      "Dentist",
    ]);
  });

  it("revealing an event deleted meanwhile brings nothing back", async () => {
    const store = await readyStore();
    const reveal = store.hide(swim.id);
    await db.events.put({ ...swim, deletedAt: T2, updatedAt: T2 });
    await settle();
    reveal();
    await settle();
    expect(titles(store.getSnapshot().events)).toStrictEqual(["Dentist"]);
  });
});

describe("the cached kinds store's ensureSeeded() (Block 4, PO decision 2)", () => {
  it("an existing table: resolves existing only after sync.run() has resolved", async () => {
    seed.listAll.mockResolvedValue({ status: "ok", rows: [A] });
    let release: (r: SyncResult) => void = () => {};
    sync.run.mockReturnValueOnce(
      new Promise((done) => {
        release = done;
      }),
    );
    const store = createCachedKindsStore(db, seed, sync);
    let outcome: string | null = null;
    const pending = store.ensureSeeded().then((o) => {
      outcome = o;
    });
    await vi.waitFor(() => expect(sync.run).toHaveBeenCalledTimes(1));
    await settle();
    expect(outcome).toBeNull();
    release({ status: "ok" });
    await pending;
    expect(outcome).toBe("existing");
    expect(seed.insertMany).not.toHaveBeenCalled();
  });

  it("an empty table: seeds the defaults once, then runs the sync, then resolves seeded", async () => {
    seed.listAll.mockResolvedValue({ status: "ok", rows: [] });
    seed.insertMany.mockImplementation(async (inputs) => ({
      status: "ok",
      rows: inputs.map((input, i) => ({
        ...input,
        id: kind(i + 1).id,
        deletedAt: null,
        createdAt: STAMP,
        updatedAt: STAMP,
      })),
    }));
    const store = createCachedKindsStore(db, seed, sync);
    await expect(store.ensureSeeded()).resolves.toBe("seeded");
    expect(seed.insertMany).toHaveBeenCalledTimes(1);
    expect(sync.run).toHaveBeenCalledTimes(1);
    expect(sync.run.mock.invocationCallOrder[0]).toBeGreaterThan(
      seed.insertMany.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("an unavailable seed resolves unavailable and runs no sync", async () => {
    seed.listAll.mockResolvedValue({ status: "offline" });
    const store = createCachedKindsStore(db, seed, sync);
    await expect(store.ensureSeeded()).resolves.toBe("unavailable");
    expect(sync.run).not.toHaveBeenCalled();
  });

  it("two concurrent calls share one listAll request", async () => {
    seed.listAll.mockResolvedValue({ status: "ok", rows: [A] });
    const store = createCachedKindsStore(db, seed, sync);
    const outcomes = await Promise.all([
      store.ensureSeeded(),
      store.ensureSeeded(),
    ]);
    expect(outcomes).toStrictEqual(["existing", "existing"]);
    expect(seed.listAll).toHaveBeenCalledTimes(1);
  });
});

// CAL-015 Contract, Block 6 (AC-1, AC-5 on the chip): the cached events
// store also observes the outbox. An event with any queued op is published
// with `sync: "saving"`, with any failed op `sync: "failed"` (failed wins),
// and otherwise with NO `sync` key at all - which is what keeps every
// `toStrictEqual` case above green. Kinds carry no marker (PO decision 11).
describe("sync markers from the outbox (CAL-015 Block 6)", () => {
  const op = (
    id: string,
    status: "queued" | "failed",
    table: "events" | "kinds" = "events",
  ): OutboxOp => ({
    op: "update",
    table,
    id,
    patch: { title: "x" },
    baseUpdatedAt: STAMP,
    clientTs: "2026-10-21T09:00:00.000Z",
    status,
    ...(status === "failed"
      ? { error: { code: "22P02", message: "bad", http: 400 } }
      : {}),
  });
  const saving = ev(1, at(10, 14, 9), at(10, 14, 10));
  const failing = ev(2, at(10, 15, 9), at(10, 15, 10));
  const both = ev(3, at(10, 16, 9), at(10, 16, 10));
  const plain = ev(4, at(10, 17, 9), at(10, 17, 10));

  it("saving for a queued op, failed for a failed one, failed when both, no key without an op", async () => {
    await db.events.bulkPut([saving, failing, both, plain]);
    await db.outbox.bulkAdd([
      op(saving.id, "queued"),
      op(failing.id, "failed"),
      op(both.id, "queued"),
      op(both.id, "failed"),
    ]);
    const store = createCachedEventsStore(db, sync);
    keep(store);
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe("ready"));
    await vi.waitFor(() =>
      expect(store.getSnapshot().events).toStrictEqual([
        { ...saving, sync: "saving" },
        { ...failing, sync: "failed" },
        { ...both, sync: "failed" },
        plain,
      ]),
    );
    const last = store.getSnapshot().events[3];
    expect(last !== undefined && "sync" in last).toBe(false);
  });

  it("the marker follows the outbox: added when an op is queued, gone when it leaves", async () => {
    await db.events.put(saving);
    const store = createCachedEventsStore(db, sync);
    keep(store);
    await vi.waitFor(() =>
      expect(store.getSnapshot().events).toStrictEqual([saving]),
    );
    const seq = await db.outbox.add(op(saving.id, "queued"));
    await vi.waitFor(() =>
      expect(store.getSnapshot().events).toStrictEqual([
        { ...saving, sync: "saving" },
      ]),
    );
    await db.outbox.delete(seq);
    await vi.waitFor(() =>
      expect(store.getSnapshot().events).toStrictEqual([saving]),
    );
  });

  it("refresh() publishes the markers too, with no subscriber", async () => {
    await db.events.put(saving);
    await db.outbox.add(op(saving.id, "failed"));
    const store = createCachedEventsStore(db, sync);
    await store.refresh();
    expect(store.getSnapshot().events).toStrictEqual([
      { ...saving, sync: "failed" },
    ]);
  });

  it("a kind with a queued op is published as it is: kinds carry no marker", async () => {
    const k = kind(1);
    await db.kinds.put(k);
    await db.outbox.add(op(k.id, "queued", "kinds"));
    const kinds = createCachedKindsStore(db, seed, sync);
    keep(kinds);
    await vi.waitFor(() =>
      expect(kinds.getSnapshot().kinds).toStrictEqual([k]),
    );
  });
});
