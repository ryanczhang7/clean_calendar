import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { ListResult } from "../data/result";
import type { Event } from "../data/rows";
import {
  createEventsStore,
  type EventsReader,
  eventsInRange,
  eventsStore,
  useEventsInRange,
} from "./eventsStore";
import { HttpResponse } from "msw";
import { installServer, onTable } from "../test/msw";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-014: the app's eventsStore reaches the server through MSW (see the
// last describe); the cases using hand-written fakes make no request.
installServer();

// CAL-009 Contract, Block 4. The events read model, the same shape and
// discipline as kindsStore.ts, over a hand-written EventsReader fake (vi.fn
// per member). The overlap rule `startsAt < end && endsAt > start` is the
// story's central claim (Contract, "A day is [D 00:00, D+1 00:00) local");
// every instant is built with the local-time constructor.

const STAMP = "2026-10-16T08:00:00.000001+00:00";

/** Local time, `month` 1..12. */
const at = (month: number, date: number, hour = 0, minute = 0) =>
  new Date(2026, month - 1, date, hour, minute);

function ev(
  n: number,
  startsAt: Date,
  endsAt: Date,
  extra: Partial<Event> = {},
): Event {
  return {
    id: `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    title: `Event ${n}`,
    kindId: "00000000-0000-4000-8000-000000000001",
    startsAt,
    endsAt,
    allDay: false,
    location: null,
    notes: null,
    recurrence: null,
    origin: "manual",
    captureJobId: null,
    deletedAt: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...extra,
  };
}

type FakeReader = { listLive: Mock<EventsReader["listLive"]> };

let repo: FakeReader;

beforeEach(() => {
  repo = { listLive: vi.fn<EventsReader["listLive"]>() };
});

/** A listLive answer the test releases by hand. */
function held(): {
  promise: Promise<ListResult<Event>>;
  release: (r: ListResult<Event>) => void;
} {
  let release: (r: ListResult<Event>) => void = () => {};
  const promise = new Promise<ListResult<Event>>((done) => {
    release = done;
  });
  return { promise, release };
}

const ids = (events: Event[]) => events.map((e) => e.id).sort();

// The week of Monday 12 October 2026: [12 Oct 00:00, 19 Oct 00:00).
const START = at(10, 12);
const END = at(10, 19);

describe("eventsInRange(events, start, end) - the overlap rule (Block 4)", () => {
  const inside = ev(1, at(10, 14, 9), at(10, 14, 10));
  const straddlesStart = ev(2, at(10, 11, 22), at(10, 12, 1));
  const straddlesEnd = ev(3, at(10, 18, 23), at(10, 19, 1));
  const covers = ev(4, at(10, 5), at(10, 25));
  const endsAtStart = ev(5, at(10, 11, 23), at(10, 12, 0));
  const startsAtEnd = ev(6, at(10, 19, 0), at(10, 19, 1));
  const startsAtStart = ev(7, at(10, 12, 0), at(10, 12, 1));
  const endsAtEnd = ev(8, at(10, 18, 23), at(10, 19, 0));
  const before = ev(9, at(10, 1, 9), at(10, 1, 10));
  const after = ev(10, at(10, 20, 9), at(10, 20, 10));

  it("keeps an event wholly inside the range", () => {
    expect(ids(eventsInRange([inside], START, END))).toStrictEqual(
      ids([inside]),
    );
  });

  it("keeps an event straddling the start, one straddling the end, and one covering the whole range", () => {
    expect(
      ids(eventsInRange([straddlesStart, straddlesEnd, covers], START, END)),
    ).toStrictEqual(ids([straddlesStart, straddlesEnd, covers]));
  });

  it("drops an event that ends exactly at start: the end is exclusive", () => {
    expect(eventsInRange([endsAtStart], START, END)).toStrictEqual([]);
  });

  it("drops an event that starts exactly at end: the range is half-open", () => {
    expect(eventsInRange([startsAtEnd], START, END)).toStrictEqual([]);
  });

  it("keeps an event that starts exactly at start, and one that ends exactly at end", () => {
    expect(
      ids(eventsInRange([startsAtStart, endsAtEnd], START, END)),
    ).toStrictEqual(ids([startsAtStart, endsAtEnd]));
  });

  it("drops events wholly before or after the range", () => {
    expect(eventsInRange([before, after], START, END)).toStrictEqual([]);
  });

  it("drops a soft-deleted event even when it overlaps", () => {
    const gone = ev(11, at(10, 14, 9), at(10, 14, 10), { deletedAt: STAMP });
    expect(ids(eventsInRange([inside, gone], START, END))).toStrictEqual(
      ids([inside]),
    );
  });

  it("returns exactly the overlapping ones out of a mixed list, and does not touch its input", () => {
    const all = [
      after,
      inside,
      endsAtStart,
      straddlesStart,
      startsAtEnd,
      covers,
      before,
      startsAtStart,
      straddlesEnd,
      endsAtEnd,
    ];
    const copy = [...all];
    expect(ids(eventsInRange(all, START, END))).toStrictEqual(
      ids([
        inside,
        straddlesStart,
        covers,
        startsAtStart,
        straddlesEnd,
        endsAtEnd,
      ]),
    );
    expect(all).toStrictEqual(copy);
  });

  it("returns [] for no events", () => {
    expect(eventsInRange([], START, END)).toStrictEqual([]);
  });
});

describe("createEventsStore(repo) (Block 4)", () => {
  it("is loading with no events before any load, and has not asked the repository", () => {
    const store = createEventsStore(repo);
    expect(store.getSnapshot()).toStrictEqual({
      status: "loading",
      events: [],
    });
    expect(repo.listLive).not.toHaveBeenCalled();
  });

  it("refresh() publishes ready with the live events in ascending startsAt, then createdAt", async () => {
    const late = ev(1, at(10, 20, 9), at(10, 20, 10));
    const early = ev(2, at(10, 2, 9), at(10, 2, 10));
    const tieSecond = ev(3, at(10, 14, 9), at(10, 14, 10), {
      createdAt: "2026-10-02T00:00:00+00:00",
    });
    const tieFirst = ev(4, at(10, 14, 9), at(10, 14, 11), {
      createdAt: "2026-10-01T00:00:00+00:00",
    });
    const gone = ev(5, at(10, 3, 9), at(10, 3, 10), { deletedAt: STAMP });
    repo.listLive.mockResolvedValueOnce({
      status: "ok",
      rows: [late, tieSecond, gone, early, tieFirst],
    });
    const store = createEventsStore(repo);
    await store.refresh();
    const snap = store.getSnapshot();
    expect(snap.status).toBe("ready");
    expect(snap.events).toStrictEqual([early, tieFirst, tieSecond, late]);
    expect(repo.listLive).toHaveBeenCalledTimes(1);
  });

  it("an unavailable repository reports unavailable and keeps the last rows", async () => {
    const a = ev(1, at(10, 14, 9), at(10, 14, 10));
    repo.listLive
      .mockResolvedValueOnce({ status: "ok", rows: [a] })
      .mockResolvedValueOnce({ status: "offline" });
    const store = createEventsStore(repo);
    await store.refresh();
    await store.refresh();
    expect(store.getSnapshot()).toStrictEqual({
      status: "unavailable",
      events: [a],
    });
  });

  it("an unavailable first load reports unavailable with no events", async () => {
    repo.listLive.mockResolvedValueOnce({
      status: "error",
      code: "42501",
      message: "denied",
    });
    const store = createEventsStore(repo);
    await store.refresh();
    expect(store.getSnapshot()).toStrictEqual({
      status: "unavailable",
      events: [],
    });
  });

  it("two concurrent refreshes share one listLive call", async () => {
    const answer = held();
    repo.listLive.mockReturnValueOnce(answer.promise);
    const store = createEventsStore(repo);
    const first = store.refresh();
    const second = store.refresh();
    answer.release({ status: "ok", rows: [] });
    await Promise.all([first, second]);
    expect(repo.listLive).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().status).toBe("ready");
  });

  it("a refresh after one has settled asks again", async () => {
    repo.listLive.mockResolvedValue({ status: "ok", rows: [] });
    const store = createEventsStore(repo);
    await store.refresh();
    await store.refresh();
    expect(repo.listLive).toHaveBeenCalledTimes(2);
  });

  it("getSnapshot() is the same object between changes and a new one after a load", async () => {
    repo.listLive.mockResolvedValueOnce({ status: "ok", rows: [] });
    const store = createEventsStore(repo);
    const before = store.getSnapshot();
    expect(store.getSnapshot()).toBe(before);
    await store.refresh();
    const after = store.getSnapshot();
    expect(after).not.toBe(before);
    expect(store.getSnapshot()).toBe(after);
  });

  it("notifies a subscriber on a change, and not after it unsubscribes", async () => {
    repo.listLive.mockResolvedValue({ status: "ok", rows: [] });
    const store = createEventsStore(repo);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    await store.refresh();
    expect(listener).toHaveBeenCalled();
    const calls = listener.mock.calls.length;
    unsubscribe();
    await store.refresh();
    expect(listener).toHaveBeenCalledTimes(calls);
  });
});

describe("eventsStore, the app's one store (Block 4)", () => {
  it("is an EventsStore that has not loaded yet", () => {
    expect(typeof eventsStore.refresh).toBe("function");
    expect(typeof eventsStore.subscribe).toBe("function");
    expect(eventsStore.getSnapshot().status).toBe("loading");
  });
});

describe("useEventsInRange(start, end, store) (Block 4)", () => {
  const inWeek = ev(1, at(10, 14, 9), at(10, 14, 10));
  const nextWeek = ev(2, at(10, 21, 9), at(10, 21, 10));

  it("asks a loading store to refresh once, then returns ready with only the events in range", async () => {
    repo.listLive.mockResolvedValue({ status: "ok", rows: [nextWeek, inWeek] });
    const store = createEventsStore(repo);
    const { result } = renderHook(() =>
      useEventsInRange(at(10, 12), at(10, 19), store),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.events).toStrictEqual([inWeek]);
    expect(repo.listLive).toHaveBeenCalledTimes(1);
  });

  it("is loading with no events while the first load is in flight", () => {
    repo.listLive.mockReturnValueOnce(held().promise);
    const store = createEventsStore(repo);
    const { result } = renderHook(() =>
      useEventsInRange(at(10, 12), at(10, 19), store),
    );
    expect(result.current).toStrictEqual({ status: "loading", events: [] });
    expect(repo.listLive).toHaveBeenCalledTimes(1);
  });

  it("does not refresh a store that has already loaded", async () => {
    repo.listLive.mockResolvedValue({ status: "ok", rows: [inWeek] });
    const store = createEventsStore(repo);
    await store.refresh();
    const { result } = renderHook(() =>
      useEventsInRange(at(10, 12), at(10, 19), store),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(repo.listLive).toHaveBeenCalledTimes(1);
    expect(result.current.events).toStrictEqual([inWeek]);
  });

  it("re-rendered with new but equal Date objects, makes no new request and returns the same events array", async () => {
    repo.listLive.mockResolvedValue({ status: "ok", rows: [nextWeek, inWeek] });
    const store = createEventsStore(repo);
    const { result, rerender } = renderHook(
      ({ start, end }: { start: Date; end: Date }) =>
        useEventsInRange(start, end, store),
      { initialProps: { start: at(10, 12), end: at(10, 19) } },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const first = result.current.events;
    rerender({ start: at(10, 12), end: at(10, 19) });
    rerender({ start: at(10, 12), end: at(10, 19) });
    expect(result.current.events).toBe(first);
    expect(repo.listLive).toHaveBeenCalledTimes(1);
  });

  it("re-filters when the range moves", async () => {
    repo.listLive.mockResolvedValue({ status: "ok", rows: [nextWeek, inWeek] });
    const store = createEventsStore(repo);
    const { result, rerender } = renderHook(
      ({ start, end }: { start: Date; end: Date }) =>
        useEventsInRange(start, end, store),
      { initialProps: { start: at(10, 12), end: at(10, 19) } },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    rerender({ start: at(10, 19), end: at(10, 26) });
    expect(result.current.events).toStrictEqual([nextWeek]);
    expect(repo.listLive).toHaveBeenCalledTimes(1);
  });

  it("re-renders when the store changes", async () => {
    repo.listLive
      .mockResolvedValueOnce({ status: "ok", rows: [] })
      .mockResolvedValueOnce({ status: "ok", rows: [inWeek] });
    const store = createEventsStore(repo);
    await store.refresh();
    const { result } = renderHook(() =>
      useEventsInRange(at(10, 12), at(10, 19), store),
    );
    expect(result.current.events).toStrictEqual([]);
    await act(async () => {
      await store.refresh();
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.events).toStrictEqual([inWeek]);
  });

  it("reports unavailable with the last rows still filtered", async () => {
    repo.listLive
      .mockResolvedValueOnce({ status: "ok", rows: [nextWeek, inWeek] })
      .mockResolvedValueOnce({ status: "offline" });
    const store = createEventsStore(repo);
    await store.refresh();
    await store.refresh();
    const { result } = renderHook(() =>
      useEventsInRange(at(10, 12), at(10, 19), store),
    );
    expect(result.current).toStrictEqual({
      status: "unavailable",
      events: [inWeek],
    });
  });
});

// CAL-013 Contract, Block 2 (AC-4's "disappears from the view at once"):
// hide(id) drops one event from every snapshot synchronously, keeps it out
// across refreshes, and the returned reveal() lets it back - only if the
// store's rows still hold it. A count per id: two outstanding hides need two
// reveals. Each reveal() acts once (Block 2 as amended by RED).
describe("hide(id) and its reveal() (CAL-013 Block 2)", () => {
  const a = ev(1, at(10, 14, 9), at(10, 14, 10));
  const b = ev(2, at(10, 15, 9), at(10, 15, 10));

  async function loaded(): Promise<ReturnType<typeof createEventsStore>> {
    repo.listLive.mockResolvedValue({ status: "ok", rows: [a, b] });
    const store = createEventsStore(repo);
    await store.refresh();
    return store;
  }

  it("publishes, at once and without a request, a snapshot without the event - status unchanged", async () => {
    const store = await loaded();
    const listener = vi.fn();
    store.subscribe(listener);
    store.hide(a.id);
    expect(store.getSnapshot()).toStrictEqual({ status: "ready", events: [b] });
    expect(listener).toHaveBeenCalled();
    expect(repo.listLive).toHaveBeenCalledTimes(1);
  });

  it("getSnapshot() is a new object after hide, and the same one until the next change", async () => {
    const store = await loaded();
    const before = store.getSnapshot();
    store.hide(a.id);
    const after = store.getSnapshot();
    expect(after).not.toBe(before);
    expect(store.getSnapshot()).toBe(after);
  });

  it("stays hidden across a refresh that still returns it", async () => {
    const store = await loaded();
    store.hide(a.id);
    await store.refresh();
    expect(repo.listLive).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().events).toStrictEqual([b]);
  });

  it("reveal() brings back a row the store still holds, in its sorted place", async () => {
    const store = await loaded();
    const reveal = store.hide(a.id);
    await store.refresh();
    reveal();
    expect(store.getSnapshot()).toStrictEqual({
      status: "ready",
      events: [a, b],
    });
  });

  it("reveal() after the row was deleted brings nothing back: the refresh already dropped it", async () => {
    const store = await loaded();
    const reveal = store.hide(a.id);
    repo.listLive.mockResolvedValue({ status: "ok", rows: [b] });
    await store.refresh();
    reveal();
    expect(store.getSnapshot().events).toStrictEqual([b]);
    // Not vacuous: a row that does come back later is shown.
    repo.listLive.mockResolvedValue({ status: "ok", rows: [a, b] });
    await store.refresh();
    expect(store.getSnapshot().events).toStrictEqual([a, b]);
  });

  it("two hides of one id need two reveals", async () => {
    const store = await loaded();
    const first = store.hide(a.id);
    const second = store.hide(a.id);
    first();
    expect(store.getSnapshot().events).toStrictEqual([b]);
    second();
    expect(store.getSnapshot().events).toStrictEqual([a, b]);
  });

  it("one reveal() called twice counts once: the other hide still holds", async () => {
    const store = await loaded();
    const first = store.hide(a.id);
    store.hide(a.id);
    first();
    first();
    expect(store.getSnapshot().events).toStrictEqual([b]);
  });

  it("hiding one event leaves another hidden one hidden when it is revealed", async () => {
    const store = await loaded();
    const revealA = store.hide(a.id);
    store.hide(b.id);
    expect(store.getSnapshot().events).toStrictEqual([]);
    revealA();
    expect(store.getSnapshot().events).toStrictEqual([a]);
  });

  it("useEventsInRange re-renders without the hidden event", async () => {
    const store = await loaded();
    const { result } = renderHook(() =>
      useEventsInRange(at(10, 12), at(10, 19), store),
    );
    expect(result.current.events).toStrictEqual([a, b]);
    let reveal: () => void = () => {};
    act(() => {
      reveal = store.hide(a.id);
    });
    expect(result.current.events).toStrictEqual([b]);
    act(() => {
      reveal();
    });
    expect(result.current.events).toStrictEqual([a, b]);
  });
});

// CAL-014 Contract, Block 5 (PO decisions 1 and 2): the app's eventsStore is
// the CACHED store, over the app's `db` and `appSync`.
describe("eventsStore over the app's cache (CAL-014 Block 5)", () => {
  // Imported inside each case, through a specifier Vite does not analyse,
  // so that while ./db does not exist (CAL-014 RED) only these cases fail and
  // every case above still runs. The type is the real module's.
  const DB_MODULE = "./db";
  const appDb = async () =>
    ((await import(/* @vite-ignore */ DB_MODULE)) as typeof import("./db")).db;
  const EPOCH = "1970-01-01T00:00:00+00:00"; // hydrate.test.ts pins the export

  it("serves its snapshot from the app's db: live events sorted, a soft-deleted one left out", async () => {
    const db = await appDb();
    await Promise.all(db.tables.map((t) => t.clear()));
    const later = ev(31, at(10, 15, 9), at(10, 15, 10));
    const earlier = ev(32, at(10, 14, 9), at(10, 14, 10));
    const gone = ev(33, at(10, 13, 9), at(10, 13, 10), { deletedAt: STAMP });
    await db.events.bulkPut([later, gone, earlier]);
    const stop = eventsStore.subscribe(() => {});
    try {
      await vi.waitFor(() =>
        expect(eventsStore.getSnapshot()).toStrictEqual({
          status: "ready",
          events: [earlier, later],
        }),
      );
    } finally {
      stop();
    }
  });

  it("refresh() runs the app's sync: each table asked for rows since its mark, and the rows land in the snapshot", async () => {
    const db = await appDb();
    await Promise.all(db.tables.map((t) => t.clear()));
    const kinds = onTable("kinds", () => HttpResponse.json([]));
    const events = onTable("events", () =>
      HttpResponse.json([
        {
          id: "10000000-0000-4000-8000-000000000041",
          title: "From the server",
          kind_id: "00000000-0000-4000-8000-000000000001",
          starts_at: "2026-10-14T14:00:00+00:00",
          ends_at: "2026-10-14T15:00:00+00:00",
          all_day: false,
          location: null,
          notes: null,
          recurrence: null,
          origin: "manual",
          capture_job_id: null,
          deleted_at: null,
          created_at: STAMP,
          updated_at: STAMP,
        },
      ]),
    );
    const overrides = onTable("event_overrides", () => HttpResponse.json([]));
    await eventsStore.refresh();
    const since = (r: typeof kinds) =>
      r.map((q) => q.url.searchParams.get("updated_at"));
    expect(since(kinds)).toStrictEqual([`gt.${EPOCH}`]);
    expect(since(events)).toStrictEqual([`gt.${EPOCH}`]);
    expect(since(overrides)).toStrictEqual([`gt.${EPOCH}`]);
    expect(eventsStore.getSnapshot().events.map((e) => e.title)).toStrictEqual([
      "From the server",
    ]);
  });
});
