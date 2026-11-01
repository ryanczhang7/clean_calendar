import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import type { Event, EventOverride } from "../data/rows";
import { at, ev, override } from "../test/cache-fixtures";
import {
  type EventsSnapshot,
  type EventsStore,
  eventsStore,
} from "./eventsStore";
import {
  type OverridesSnapshot,
  type OverridesStore,
  overridesStore,
} from "./overridesStore";
import { chipKey, occurrencesIn, useOccurrences } from "./useOccurrences";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-024 Contract, Blocks 3 and 4 (AC-3, AC-5). occurrencesIn is the pure
// core over CAL-023's REAL expander (shared/recurrence.ts) - nothing here
// mocks it. Every expected occurrence is written out by hand with the
// local-time constructor (`at`, month 1..12), and every series is stored in
// the device's own zone, read from Intl, so "09:00 every Wednesday" is 09:00
// local on every Wednesday in any zone the suite runs in, across that zone's
// DST change (the range below spans late October to early December).
//
// The hook is driven over hand-written fake stores (the EventsStore and
// OverridesStore shapes, a vi.fn refresh), as eventsStore.test.ts drives
// useEventsInRange.

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Spin: Wednesdays 09:00 - 10:00 from Wednesday 14 October 2026, no end. */
const SPIN = ev(1, at(10, 14, 9), at(10, 14, 10), {
  title: "Spin",
  location: "Studio A",
  recurrence: { freq: "weekly", until: null, tz: TZ },
});

/** The occurrence of SPIN on a Wednesday, `month` 1..12. */
function spinOn(
  month: number,
  date: number,
  extra: Partial<Event> = {},
): Event {
  return {
    ...SPIN,
    startsAt: at(month, date, 9),
    endsAt: at(month, date, 10),
    occurrenceDate: `2026-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`,
    ...extra,
  };
}

// November 2026's month grid: [Monday 26 October, Monday 7 December).
const GRID_START = at(10, 26);
const GRID_END = at(12, 7);

/** The six Wednesdays of that grid. */
const GRID_WEDNESDAYS = [
  spinOn(10, 28),
  spinOn(11, 4),
  spinOn(11, 11),
  spinOn(11, 18),
  spinOn(11, 25),
  spinOn(12, 2),
];

const cancel = (n: number, eventId: string, date: string): EventOverride =>
  override(n, date, { eventId, cancelled: true });

describe("occurrencesIn(events, overrides, start, end) - Block 4", () => {
  it("a weekly series in November's grid: one occurrence per Wednesday, 28 Oct to 2 Dec, each 09:00 - 10:00 local", () => {
    expect(occurrencesIn([SPIN], [], GRID_START, GRID_END)).toStrictEqual(
      GRID_WEDNESDAYS,
    );
  });

  it("the series' own stored row is never included as itself: in its first week there is exactly occurrence 0", () => {
    expect(occurrencesIn([SPIN], [], at(10, 12), at(10, 19))).toStrictEqual([
      { ...SPIN, occurrenceDate: "2026-10-14" },
    ]);
  });

  it("an occurrence is an Event with the SERIES id, the series' recurrence, origin, stamps and sync, and its occurrenceDate (Block 3)", () => {
    const series = { ...SPIN, sync: "saving" as const };
    const [first] = occurrencesIn([series], [], at(11, 2), at(11, 9));
    expect(first).toStrictEqual({
      ...series,
      startsAt: at(11, 4, 9),
      endsAt: at(11, 4, 10),
      occurrenceDate: "2026-11-04",
    });
    expect(first?.id).toBe(SPIN.id);
  });

  it("a range with no Wednesday in it has no occurrence, and no series row", () => {
    expect(occurrencesIn([SPIN], [], at(11, 5), at(11, 11))).toStrictEqual([]);
  });

  it("a series ending 11 November stops there: 28 Oct, 4 and 11 Nov", () => {
    const ending = {
      ...SPIN,
      recurrence: { freq: "weekly" as const, until: "2026-11-11", tz: TZ },
    };
    expect(
      occurrencesIn([ending], [], GRID_START, GRID_END).map(
        (e) => e.occurrenceDate,
      ),
    ).toStrictEqual(["2026-10-28", "2026-11-04", "2026-11-11"]);
  });

  it("daily until 30 November, from 28 November: three occurrences", () => {
    const daily = ev(4, at(11, 28, 7), at(11, 28, 7, 30), {
      title: "Run",
      recurrence: { freq: "daily", until: "2026-11-30", tz: TZ },
    });
    expect(occurrencesIn([daily], [], GRID_START, GRID_END)).toStrictEqual([
      { ...daily, occurrenceDate: "2026-11-28" },
      {
        ...daily,
        startsAt: at(11, 29, 7),
        endsAt: at(11, 29, 7, 30),
        occurrenceDate: "2026-11-29",
      },
      {
        ...daily,
        startsAt: at(11, 30, 7),
        endsAt: at(11, 30, 7, 30),
        occurrenceDate: "2026-11-30",
      },
    ]);
  });

  it("a yearly all-day birthday first stored in 2020 appears once, on 14 November 2026, all day", () => {
    const birthday = ev(5, new Date(2020, 10, 14), new Date(2020, 10, 15), {
      title: "Ana's birthday",
      allDay: true,
      recurrence: { freq: "yearly", until: null, tz: TZ },
    });
    expect(occurrencesIn([birthday], [], GRID_START, GRID_END)).toStrictEqual([
      {
        ...birthday,
        startsAt: at(11, 14),
        endsAt: at(11, 15),
        occurrenceDate: "2026-11-14",
      },
    ]);
  });

  it("a non-recurring event is included iff it overlaps the range - the eventsInRange rule - and as itself, with no occurrenceDate key", () => {
    const inside = ev(2, at(11, 3, 12), at(11, 3, 13));
    const endsAtStart = ev(3, at(10, 25, 23), at(10, 26));
    const startsAtEnd = ev(6, at(12, 7), at(12, 7, 1));
    const straddles = ev(7, at(10, 25, 23), at(10, 26, 1));
    const result = occurrencesIn(
      [inside, endsAtStart, startsAtEnd, straddles],
      [],
      GRID_START,
      GRID_END,
    );
    expect(result).toStrictEqual([straddles, inside]);
    for (const e of result) {
      expect(Object.hasOwn(e, "occurrenceDate")).toBe(false);
    }
  });

  it("a soft-deleted event is left out, recurring or not", () => {
    const deletedOne = ev(2, at(11, 3, 12), at(11, 3, 13), {
      deletedAt: "2026-10-20T10:00:00.000001+00:00",
    });
    const deletedSeries = {
      ...SPIN,
      deletedAt: "2026-10-20T10:00:00.000001+00:00",
    };
    expect(
      occurrencesIn([deletedOne, deletedSeries], [], GRID_START, GRID_END),
    ).toStrictEqual([]);
  });

  it("non-recurring events and occurrences together, by startsAt, ties by id - not by input order", () => {
    // Same instant as Spin's 4 Nov occurrence, and a smaller id than Spin's.
    const tie = ev(0, at(11, 4, 9), at(11, 4, 9, 30), { title: "Call" });
    const early = ev(2, at(11, 4, 8), at(11, 4, 8, 30), { title: "Coffee" });
    expect(
      occurrencesIn([SPIN, tie, early], [], at(11, 2), at(11, 9)),
    ).toStrictEqual([early, tie, spinOn(11, 4)]);
    expect(tie.id < SPIN.id).toBe(true);
  });

  it("returns [] for no events", () => {
    expect(occurrencesIn([], [], GRID_START, GRID_END)).toStrictEqual([]);
  });
});

describe("occurrencesIn with overrides (AC-5, Block 4)", () => {
  it("a cancelled override for 11 November removes that occurrence and keeps the other five", () => {
    expect(
      occurrencesIn(
        [SPIN],
        [cancel(1, SPIN.id, "2026-11-11")],
        GRID_START,
        GRID_END,
      ),
    ).toStrictEqual(
      GRID_WEDNESDAYS.filter((e) => e.occurrenceDate !== "2026-11-11"),
    );
  });

  it("an override's set fields replace the occurrence's; the null ones keep the series'", () => {
    const moved = override(2, "2026-11-18", {
      eventId: SPIN.id,
      title: "Spin (late)",
      startsAt: at(11, 18, 18),
      endsAt: at(11, 18, 19),
      location: "Studio B",
    });
    const result = occurrencesIn([SPIN], [moved], at(11, 16), at(11, 23));
    expect(result).toStrictEqual([
      spinOn(11, 18, {
        title: "Spin (late)",
        startsAt: at(11, 18, 18),
        endsAt: at(11, 18, 19),
        location: "Studio B",
      }),
    ]);
  });

  it("an override belongs to its own series only: cancelling Yoga's 11 Nov leaves Spin's, and the other way round", () => {
    const yoga = ev(3, at(10, 14, 18), at(10, 14, 19), {
      title: "Yoga",
      recurrence: { freq: "weekly", until: null, tz: TZ },
    });
    const yogaOn11 = {
      ...yoga,
      startsAt: at(11, 11, 18),
      endsAt: at(11, 11, 19),
      occurrenceDate: "2026-11-11",
    };
    expect(
      occurrencesIn(
        [SPIN, yoga],
        [cancel(1, yoga.id, "2026-11-11")],
        at(11, 9),
        at(11, 16),
      ),
    ).toStrictEqual([spinOn(11, 11)]);
    expect(
      occurrencesIn(
        [SPIN, yoga],
        [cancel(2, SPIN.id, "2026-11-11")],
        at(11, 9),
        at(11, 16),
      ),
    ).toStrictEqual([yogaOn11]);
  });

  it("an override for a non-recurring event is ignored: the event is shown as stored", () => {
    const dentist = ev(2, at(11, 3, 12), at(11, 3, 13));
    expect(
      occurrencesIn(
        [dentist],
        [
          cancel(1, dentist.id, "2026-11-03"),
          override(2, "2026-11-03", { eventId: dentist.id, title: "Moved" }),
        ],
        GRID_START,
        GRID_END,
      ),
    ).toStrictEqual([dentist]);
  });

  it("does not touch its inputs", () => {
    const events = [SPIN];
    const overrides = [cancel(1, SPIN.id, "2026-11-11")];
    occurrencesIn(events, overrides, GRID_START, GRID_END);
    expect(events).toStrictEqual([SPIN]);
    expect(Object.hasOwn(SPIN, "occurrenceDate")).toBe(false);
    expect(overrides).toHaveLength(1);
  });
});

describe("chipKey(event) - Block 4", () => {
  it("a stored event's key is its id", () => {
    const one = ev(2, at(11, 3, 12), at(11, 3, 13));
    expect(chipKey(one)).toBe(one.id);
  });

  it("an occurrence's key is its id, an @ and its occurrenceDate", () => {
    expect(chipKey(spinOn(11, 18))).toBe(`${SPIN.id}@2026-11-18`);
  });

  it("two occurrences of one series have different keys", () => {
    const keys = GRID_WEDNESDAYS.map(chipKey);
    expect(new Set(keys).size).toBe(6);
  });
});

// --- the hook ---------------------------------------------------------------

type Fake<S> = {
  refresh: Mock<() => Promise<void>>;
  subscribe(listener: () => void): () => void;
  getSnapshot(): S;
  /** Publish a new snapshot to every subscriber. */
  set(next: S): void;
};

function fake<S>(initial: S, loaded?: S): Fake<S> {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const store: Fake<S> = {
    refresh: vi.fn(async () => {
      if (loaded !== undefined) store.set(loaded);
    }),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    set(next) {
      snapshot = next;
      for (const listener of listeners) listener();
    },
  };
  return store;
}

const eventsSnap = (
  status: EventsSnapshot["status"],
  events: Event[] = [],
): EventsSnapshot => ({ status, events });
const overridesSnap = (
  status: OverridesSnapshot["status"],
  overrides: EventOverride[] = [],
): OverridesSnapshot => ({ status, overrides });

function eventsFake(initial: EventsSnapshot, loaded?: EventsSnapshot) {
  const f = fake(initial, loaded);
  const store: EventsStore = {
    refresh: f.refresh,
    subscribe: f.subscribe,
    getSnapshot: f.getSnapshot,
    hide: () => () => {},
  };
  return { fake: f, store };
}

function overridesFake(initial: OverridesSnapshot, loaded?: OverridesSnapshot) {
  const f = fake(initial, loaded);
  const store: OverridesStore = f;
  return { fake: f, store };
}

const dates = (events: Event[]) => events.map((e) => e.occurrenceDate);

describe("useOccurrences(start, end, stores) - Block 4", () => {
  it("asks each loading store to refresh exactly once, then is ready with the occurrences in range", async () => {
    const events = eventsFake(
      eventsSnap("loading"),
      eventsSnap("ready", [SPIN]),
    );
    const overrides = overridesFake(
      overridesSnap("loading"),
      overridesSnap("ready", [cancel(1, SPIN.id, "2026-11-11")]),
    );
    const { result } = renderHook(() =>
      useOccurrences(GRID_START, GRID_END, {
        events: events.store,
        overrides: overrides.store,
      }),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.events).toStrictEqual(
      GRID_WEDNESDAYS.filter((e) => e.occurrenceDate !== "2026-11-11"),
    );
    expect(events.fake.refresh).toHaveBeenCalledTimes(1);
    expect(overrides.fake.refresh).toHaveBeenCalledTimes(1);
  });

  it("is loading with no events while both first loads are in flight", () => {
    const events = eventsFake(eventsSnap("loading"));
    const overrides = overridesFake(overridesSnap("loading"));
    const { result } = renderHook(() =>
      useOccurrences(GRID_START, GRID_END, {
        events: events.store,
        overrides: overrides.store,
      }),
    );
    expect(result.current).toStrictEqual({ status: "loading", events: [] });
  });

  it("does not refresh stores that have already loaded", async () => {
    const events = eventsFake(eventsSnap("ready", [SPIN]));
    const overrides = overridesFake(overridesSnap("ready"));
    const { result } = renderHook(() =>
      useOccurrences(GRID_START, GRID_END, {
        events: events.store,
        overrides: overrides.store,
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(events.fake.refresh).not.toHaveBeenCalled();
    expect(overrides.fake.refresh).not.toHaveBeenCalled();
    expect(result.current.status).toBe("ready");
    expect(result.current.events).toStrictEqual(GRID_WEDNESDAYS);
  });

  it.each([
    ["ready", "ready", "ready"],
    ["loading", "ready", "loading"],
    ["ready", "loading", "loading"],
    ["unavailable", "ready", "unavailable"],
    ["ready", "unavailable", "unavailable"],
    ["unavailable", "loading", "unavailable"],
    ["loading", "unavailable", "unavailable"],
  ] as const)(
    "events %s and overrides %s: %s",
    (eventsStatus, overridesStatus, expected) => {
      const events = eventsFake(eventsSnap(eventsStatus, [SPIN]));
      const overrides = overridesFake(overridesSnap(overridesStatus));
      const { result } = renderHook(() =>
        useOccurrences(GRID_START, GRID_END, {
          events: events.store,
          overrides: overrides.store,
        }),
      );
      expect(result.current.status).toBe(expected);
    },
  );

  it("re-rendered with new but equal Date objects, returns the same events array and asks nothing", () => {
    const events = eventsFake(eventsSnap("ready", [SPIN]));
    const overrides = overridesFake(overridesSnap("ready"));
    const stores = { events: events.store, overrides: overrides.store };
    const { result, rerender } = renderHook(
      ({ start, end }: { start: Date; end: Date }) =>
        useOccurrences(start, end, stores),
      { initialProps: { start: at(10, 26), end: at(12, 7) } },
    );
    const first = result.current.events;
    rerender({ start: at(10, 26), end: at(12, 7) });
    rerender({ start: at(10, 26), end: at(12, 7) });
    expect(result.current.events).toBe(first);
    expect(events.fake.refresh).not.toHaveBeenCalled();
  });

  it("re-expands when the range moves", () => {
    const events = eventsFake(eventsSnap("ready", [SPIN]));
    const overrides = overridesFake(overridesSnap("ready"));
    const stores = { events: events.store, overrides: overrides.store };
    const { result, rerender } = renderHook(
      ({ start, end }: { start: Date; end: Date }) =>
        useOccurrences(start, end, stores),
      { initialProps: { start: at(11, 2), end: at(11, 9) } },
    );
    expect(dates(result.current.events)).toStrictEqual(["2026-11-04"]);
    rerender({ start: at(11, 9), end: at(11, 16) });
    expect(dates(result.current.events)).toStrictEqual(["2026-11-11"]);
  });

  it("re-renders when an override arrives: the cancelled occurrence goes, the others stay", () => {
    const events = eventsFake(eventsSnap("ready", [SPIN]));
    const overrides = overridesFake(overridesSnap("ready"));
    const { result } = renderHook(() =>
      useOccurrences(GRID_START, GRID_END, {
        events: events.store,
        overrides: overrides.store,
      }),
    );
    expect(result.current.events).toHaveLength(6);
    act(() =>
      overrides.fake.set(
        overridesSnap("ready", [cancel(1, SPIN.id, "2026-11-11")]),
      ),
    );
    expect(dates(result.current.events)).toStrictEqual([
      "2026-10-28",
      "2026-11-04",
      "2026-11-18",
      "2026-11-25",
      "2026-12-02",
    ]);
  });

  it("re-renders when the events change", () => {
    const events = eventsFake(eventsSnap("ready"));
    const overrides = overridesFake(overridesSnap("ready"));
    const { result } = renderHook(() =>
      useOccurrences(GRID_START, GRID_END, {
        events: events.store,
        overrides: overrides.store,
      }),
    );
    expect(result.current.events).toStrictEqual([]);
    act(() => events.fake.set(eventsSnap("ready", [SPIN])));
    expect(result.current.events).toStrictEqual(GRID_WEDNESDAYS);
  });
});

describe("useOccurrences's default stores (Block 4)", () => {
  const spies: { mockRestore(): void }[] = [];
  afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore();
  });

  it("with no stores given, subscribes to the app's eventsStore and overridesStore", () => {
    // refresh is stubbed so nothing reaches the sync; subscribe still runs
    // the real store's, over the app's (fake-indexeddb) db.
    const eventsSubscribe = vi.spyOn(eventsStore, "subscribe");
    const overridesSubscribe = vi.spyOn(overridesStore, "subscribe");
    spies.push(
      eventsSubscribe,
      overridesSubscribe,
      vi.spyOn(eventsStore, "refresh").mockResolvedValue(undefined),
      vi.spyOn(overridesStore, "refresh").mockResolvedValue(undefined),
    );
    const { unmount } = renderHook(() => useOccurrences(GRID_START, GRID_END));
    expect(eventsSubscribe).toHaveBeenCalled();
    expect(overridesSubscribe).toHaveBeenCalled();
    unmount();
  });

  it("with only an events store given, still reads the app's overridesStore", () => {
    const overridesSubscribe = vi.spyOn(overridesStore, "subscribe");
    spies.push(
      overridesSubscribe,
      vi.spyOn(overridesStore, "refresh").mockResolvedValue(undefined),
    );
    const events = eventsFake(eventsSnap("ready", [SPIN]));
    const { unmount } = renderHook(() =>
      useOccurrences(GRID_START, GRID_END, { events: events.store }),
    );
    expect(overridesSubscribe).toHaveBeenCalled();
    unmount();
  });
});
