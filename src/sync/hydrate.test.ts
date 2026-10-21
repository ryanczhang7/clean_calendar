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
import {
  at,
  brokenDb,
  byId,
  ev,
  freshDb,
  kind,
  override,
  T1,
  T2,
  T3,
  T4,
  T5,
} from "../test/cache-fixtures";
import type { CalendarDb } from "./db";
import { createSync, EPOCH, hydrate, type SyncRepos } from "./hydrate";

// CAL-014 AC-1 and AC-2, Contract Block 2. MECHANICAL: the exact listSince
// argument per table, the exact rows in each Dexie table, the exact meta
// values. The repositories are vi.fn fakes (their HTTP shape is
// kinds/events/eventOverrides.test.ts's business); the cache is a real
// CalendarDb over a fresh fake-indexeddb factory.
//
// The marks are strings compared as strings: every stamp below differs from
// its neighbours only in the microseconds, which a Date cannot hold, so a
// Date-based mark ("…08:00:00.000Z") fails every exact-value assertion.

type Repos = {
  kinds: { listSince: Mock<(since: string) => Promise<ListResult<Kind>>> };
  events: { listSince: Mock<(since: string) => Promise<ListResult<Event>>> };
  overrides: {
    listSince: Mock<(since: string) => Promise<ListResult<EventOverride>>>;
  };
};

let db: CalendarDb;
let repos: Repos;

/** Every repository answers with an empty list unless a test says otherwise. */
beforeEach(() => {
  db = freshDb();
  repos = {
    kinds: {
      listSince: vi.fn<(since: string) => Promise<ListResult<Kind>>>(async () =>
        ok([]),
      ),
    },
    events: {
      listSince: vi.fn<(since: string) => Promise<ListResult<Event>>>(
        async () => ok([]),
      ),
    },
    overrides: {
      listSince: vi.fn<(since: string) => Promise<ListResult<EventOverride>>>(
        async () => ok([]),
      ),
    },
  };
});

afterEach(() => {
  db.close();
});

const asRepos = (r: Repos): SyncRepos => r;

const ok = <T>(rows: T[]): ListResult<T> => ({ status: "ok", rows });

/** The meta table, as [key, value] pairs ordered by key. */
async function marks(): Promise<[string, string][]> {
  const rows = await db.meta.toArray();
  return rows
    .map((r): [string, string] => [r.key, r.value])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

const sinceArgs = (r: Repos) => ({
  kinds: r.kinds.listSince.mock.calls,
  events: r.events.listSince.mock.calls,
  overrides: r.overrides.listSince.mock.calls,
});

// Rows: a live and a soft-deleted kind; a live and a soft-deleted event; a
// moved and a cancelled override (an override has no deleted_at).
const liveKind = kind(1, { updatedAt: T1 });
const goneKind = kind(2, { deletedAt: T3, updatedAt: T3 });
const liveEvent = ev(1, at(10, 14, 9), at(10, 14, 10), { updatedAt: T2 });
const goneEvent = ev(2, at(10, 15, 9), at(10, 15, 10), {
  deletedAt: T4,
  updatedAt: T4,
});
const movedOverride = override(1, "2026-10-14", {
  startsAt: at(10, 14, 11),
  endsAt: at(10, 14, 12),
  allDay: false,
  updatedAt: T5,
});
const cancelledOverride = override(2, "2026-10-21", {
  cancelled: true,
  updatedAt: T1,
});

describe("EPOCH (Block 2)", () => {
  it("is the start of 1970 in PostgREST's own format", () => {
    expect(EPOCH).toBe("1970-01-01T00:00:00+00:00");
  });
});

describe("the first pass over an empty cache (AC-1)", () => {
  it("asks each of kinds, events and overrides once, for rows since EPOCH", async () => {
    await hydrate(db, asRepos(repos));
    expect(sinceArgs(repos)).toStrictEqual({
      kinds: [[EPOCH]],
      events: [[EPOCH]],
      overrides: [[EPOCH]],
    });
  });

  it("asks kinds, then events, then overrides", async () => {
    await hydrate(db, asRepos(repos));
    const first = (m: Mock) => m.mock.invocationCallOrder[0] ?? -1;
    const k = first(repos.kinds.listSince);
    const e = first(repos.events.listSince);
    const o = first(repos.overrides.listSince);
    expect(k).toBeGreaterThan(0);
    expect(e).toBeGreaterThan(k);
    expect(o).toBeGreaterThan(e);
  });

  it("writes every row returned, live and soft-deleted, into its table exactly as returned, and resolves ok", async () => {
    repos.kinds.listSince.mockResolvedValueOnce(ok([goneKind, liveKind]));
    repos.events.listSince.mockResolvedValueOnce(ok([liveEvent, goneEvent]));
    repos.overrides.listSince.mockResolvedValueOnce(
      ok([movedOverride, cancelledOverride]),
    );
    await expect(hydrate(db, asRepos(repos))).resolves.toStrictEqual({
      status: "ok",
    });
    expect(byId(await db.kinds.toArray())).toStrictEqual(
      byId([liveKind, goneKind]),
    );
    expect(byId(await db.events.toArray())).toStrictEqual(
      byId([liveEvent, goneEvent]),
    );
    expect(byId(await db.overrides.toArray())).toStrictEqual(
      byId([movedOverride, cancelledOverride]),
    );
  });

  it("stores each table's mark: the greatest updatedAt it returned, as the exact string", async () => {
    repos.kinds.listSince.mockResolvedValueOnce(ok([goneKind, liveKind]));
    repos.events.listSince.mockResolvedValueOnce(ok([liveEvent, goneEvent]));
    repos.overrides.listSince.mockResolvedValueOnce(
      ok([movedOverride, cancelledOverride]),
    );
    await hydrate(db, asRepos(repos));
    expect(await marks()).toStrictEqual([
      ["mark:events", T4],
      ["mark:kinds", T3],
      ["mark:overrides", T5],
    ]);
  });

  it("takes the greatest updatedAt, not the last row's: rows answered out of order", async () => {
    // T5 is in the middle; the last row carries T2.
    repos.events.listSince.mockResolvedValueOnce(
      ok([
        ev(1, at(10, 1), at(10, 1, 1), { updatedAt: T3 }),
        ev(2, at(10, 2), at(10, 2, 1), { updatedAt: T5 }),
        ev(3, at(10, 3), at(10, 3, 1), { updatedAt: T1 }),
        ev(4, at(10, 4), at(10, 4, 1), { updatedAt: T2 }),
      ]),
    );
    await hydrate(db, asRepos(repos));
    expect(await db.meta.get("mark:events")).toStrictEqual({
      key: "mark:events",
      value: T5,
    });
  });

  it("keeps the microseconds: marks differing only in the sixth fractional digit are told apart", async () => {
    const a = "2026-10-14T09:15:02.123455+00:00";
    const b = "2026-10-14T09:15:02.123457+00:00";
    const c = "2026-10-14T09:15:02.123456+00:00";
    repos.kinds.listSince.mockResolvedValueOnce(
      ok([
        kind(1, { updatedAt: a }),
        kind(2, { updatedAt: b }),
        kind(3, { updatedAt: c }),
      ]),
    );
    await hydrate(db, asRepos(repos));
    expect((await db.meta.get("mark:kinds"))?.value).toBe(b);
  });

  it("compares PostgREST's trimmed fractions correctly: no fraction < .123456 < .5 within one second", async () => {
    // PostgREST drops trailing zeros (rows-fixtures: "…12:00:00.5+00:00");
    // "+" sorts below every digit, so string order is still time order.
    const none = "2026-10-16T08:00:00+00:00";
    const long = "2026-10-16T08:00:00.123456+00:00";
    const half = "2026-10-16T08:00:00.5+00:00";
    repos.kinds.listSince.mockResolvedValueOnce(
      ok([
        kind(1, { updatedAt: half }),
        kind(2, { updatedAt: none }),
        kind(3, { updatedAt: long }),
      ]),
    );
    await hydrate(db, asRepos(repos));
    expect((await db.meta.get("mark:kinds"))?.value).toBe(half);
  });

  it("stores no mark for a table that returned no rows", async () => {
    repos.kinds.listSince.mockResolvedValueOnce(ok([liveKind]));
    await hydrate(db, asRepos(repos));
    expect(await marks()).toStrictEqual([["mark:kinds", T1]]);
  });
});

describe("a second pass over a populated cache (AC-2)", () => {
  it("a second pass asks each table for rows since its stored mark", async () => {
    repos.kinds.listSince.mockResolvedValueOnce(ok([goneKind, liveKind]));
    repos.events.listSince.mockResolvedValueOnce(ok([liveEvent, goneEvent]));
    repos.overrides.listSince.mockResolvedValueOnce(
      ok([movedOverride, cancelledOverride]),
    );
    await hydrate(db, asRepos(repos));
    for (const r of Object.values(repos)) r.listSince.mockClear();

    await hydrate(db, asRepos(repos));
    expect(sinceArgs(repos)).toStrictEqual({
      kinds: [[T3]],
      events: [[T4]],
      overrides: [[T5]],
    });
  });

  it("reads each table's own mark from meta: only the events mark stored → kinds and overrides still since EPOCH", async () => {
    await db.meta.put({ key: "mark:events", value: T2 });
    await hydrate(db, asRepos(repos));
    expect(sinceArgs(repos)).toStrictEqual({
      kinds: [[EPOCH]],
      events: [[T2]],
      overrides: [[EPOCH]],
    });
  });

  it("upserts: a row now soft-deleted replaces its live copy and stays in the cache, a new row is added, untouched rows remain", async () => {
    await db.events.bulkPut([
      liveEvent,
      ev(3, at(10, 16), at(10, 16, 1), { updatedAt: T1 }),
    ]);
    await db.meta.put({ key: "mark:events", value: T2 });
    const nowDeleted: Event = { ...liveEvent, deletedAt: T4, updatedAt: T4 };
    const added = ev(4, at(10, 17), at(10, 17, 1), { updatedAt: T3 });
    repos.events.listSince.mockResolvedValueOnce(ok([nowDeleted, added]));

    await hydrate(db, asRepos(repos));
    expect(byId(await db.events.toArray())).toStrictEqual(
      byId([
        nowDeleted,
        ev(3, at(10, 16), at(10, 16, 1), { updatedAt: T1 }),
        added,
      ]),
    );
    expect((await db.meta.get("mark:events"))?.value).toBe(T4);
  });

  it("a kind soft-deleted on the server is kept, marked deleted", async () => {
    await db.kinds.put(liveKind);
    await db.meta.put({ key: "mark:kinds", value: T1 });
    const nowDeleted: Kind = { ...liveKind, deletedAt: T2, updatedAt: T2 };
    repos.kinds.listSince.mockResolvedValueOnce(ok([nowDeleted]));
    await hydrate(db, asRepos(repos));
    expect(await db.kinds.toArray()).toStrictEqual([nowDeleted]);
  });

  it("a pass that returns nothing leaves the stored mark as it was", async () => {
    await db.meta.bulkPut([
      { key: "mark:kinds", value: T1 },
      { key: "mark:events", value: T2 },
      { key: "mark:overrides", value: T3 },
    ]);
    await hydrate(db, asRepos(repos));
    expect(await marks()).toStrictEqual([
      ["mark:events", T2],
      ["mark:kinds", T1],
      ["mark:overrides", T3],
    ]);
  });
});

describe("a pass that fails part way (Block 2)", () => {
  const populate = async () => {
    await db.kinds.put(liveKind);
    await db.events.put(liveEvent);
    await db.overrides.put(cancelledOverride);
    await db.meta.bulkPut([
      { key: "mark:kinds", value: T1 },
      { key: "mark:events", value: T2 },
      { key: "mark:overrides", value: T1 },
    ]);
  };

  it("events offline: kinds keep what they wrote, events and overrides are untouched, overrides never asked, and the result is unavailable", async () => {
    await populate();
    const newKind = kind(3, { updatedAt: T5 });
    repos.kinds.listSince.mockResolvedValueOnce(ok([newKind]));
    repos.events.listSince.mockResolvedValueOnce({ status: "offline" });

    await expect(hydrate(db, asRepos(repos))).resolves.toStrictEqual({
      status: "unavailable",
    });
    expect(repos.overrides.listSince).not.toHaveBeenCalled();
    expect(byId(await db.kinds.toArray())).toStrictEqual(
      byId([liveKind, newKind]),
    );
    expect(await db.events.toArray()).toStrictEqual([liveEvent]);
    expect(await db.overrides.toArray()).toStrictEqual([cancelledOverride]);
    expect(await marks()).toStrictEqual([
      ["mark:events", T2],
      ["mark:kinds", T5],
      ["mark:overrides", T1],
    ]);
  });

  it("kinds answering a server error: nothing after it is asked, no mark moves", async () => {
    await populate();
    repos.kinds.listSince.mockResolvedValueOnce({
      status: "error",
      code: "42501",
      message: "permission denied",
    });
    await expect(hydrate(db, asRepos(repos))).resolves.toStrictEqual({
      status: "unavailable",
    });
    expect(repos.events.listSince).not.toHaveBeenCalled();
    expect(repos.overrides.listSince).not.toHaveBeenCalled();
    expect(await marks()).toStrictEqual([
      ["mark:events", T2],
      ["mark:kinds", T1],
      ["mark:overrides", T1],
    ]);
  });

  it("overrides offline after kinds and events answered: their marks move, the overrides mark does not", async () => {
    repos.kinds.listSince.mockResolvedValueOnce(ok([liveKind]));
    repos.events.listSince.mockResolvedValueOnce(ok([liveEvent]));
    repos.overrides.listSince.mockResolvedValueOnce({ status: "offline" });
    await expect(hydrate(db, asRepos(repos))).resolves.toStrictEqual({
      status: "unavailable",
    });
    expect(await marks()).toStrictEqual([
      ["mark:events", T2],
      ["mark:kinds", T1],
    ]);
  });

  it("a cache that cannot be opened resolves unavailable - it does not reject", async () => {
    const broken = brokenDb();
    await expect(hydrate(broken, asRepos(repos))).resolves.toStrictEqual({
      status: "unavailable",
    });
  });
});

describe("createSync(db, repos) (Block 2)", () => {
  it("constructing it asks nothing", () => {
    createSync(db, asRepos(repos));
    expect(sinceArgs(repos)).toStrictEqual({
      kinds: [],
      events: [],
      overrides: [],
    });
  });

  it("run() is one pass: it resolves with the pass's result", async () => {
    const sync = createSync(db, asRepos(repos));
    await expect(sync.run()).resolves.toStrictEqual({ status: "ok" });
    repos.events.listSince.mockResolvedValueOnce({ status: "offline" });
    await expect(sync.run()).resolves.toStrictEqual({ status: "unavailable" });
  });

  it("two concurrent run() calls share one pass: each table asked once, both resolve with the same result", async () => {
    let release: (r: ListResult<Kind>) => void = () => {};
    repos.kinds.listSince.mockReturnValueOnce(
      new Promise((done) => {
        release = done;
      }),
    );
    const sync = createSync(db, asRepos(repos));
    const first = sync.run();
    const second = sync.run();
    // The pass may read its mark before asking; let it get there.
    await vi.waitFor(() => expect(repos.kinds.listSince).toHaveBeenCalled());
    release(ok([liveKind]));
    const results = await Promise.all([first, second]);
    expect(results).toStrictEqual([{ status: "ok" }, { status: "ok" }]);
    expect(sinceArgs(repos)).toStrictEqual({
      kinds: [[EPOCH]],
      events: [[EPOCH]],
      overrides: [[EPOCH]],
    });
  });

  it("a run() after the previous one settled is a new pass, from the marks that pass stored", async () => {
    repos.kinds.listSince.mockResolvedValueOnce(ok([liveKind]));
    const sync = createSync(db, asRepos(repos));
    await sync.run();
    await sync.run();
    expect(repos.kinds.listSince.mock.calls).toStrictEqual([[EPOCH], [T1]]);
  });
});
