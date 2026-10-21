import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import type { EventOverride, Event as EventRow, Kind } from "../data/rows";
import { CalendarDb } from "../sync/db";

// CAL-014 Contract, Block 7: shared builders for the cache suites. Every
// suite builds its own CalendarDb over a fresh `IDBFactory` from
// fake-indexeddb, so no state leaks between cases or files; the app's `db`
// (over the global IndexedDB that src/test/setup.ts installs) is used only by
// the cases about the app's singletons.
//
// Stamps are PostgREST's: six fractional digits and a `+00:00` offset, kept
// as strings (rows.ts). Event times are local-time `Date`s.

let serial = 0;

/** A CalendarDb nobody else can see. Constructing it does not open it. */
export function freshDb(): CalendarDb {
  serial += 1;
  return new CalendarDb(`cal-014-test-${serial}`, {
    indexedDB: new IDBFactory(),
    IDBKeyRange,
  });
}

/**
 * An IDBFactory whose `open` throws, as a browser with storage blocked does
 * (private mode with IndexedDB disabled, a quota or policy refusal). Dexie
 * rejects `open()` and every query on such a database.
 */
export function brokenFactory(): IDBFactory {
  const factory = new IDBFactory();
  factory.open = () => {
    throw new DOMException("IndexedDB is blocked", "SecurityError");
  };
  return factory;
}

/** A CalendarDb that cannot be opened. */
export function brokenDb(): CalendarDb {
  serial += 1;
  return new CalendarDb(`cal-014-broken-${serial}`, {
    indexedDB: brokenFactory(),
    IDBKeyRange,
  });
}

/** An IDBFactory that counts its `open` calls. */
export function countingFactory(): {
  factory: IDBFactory;
  opens: () => number;
} {
  const factory = new IDBFactory();
  const open = factory.open.bind(factory);
  let n = 0;
  factory.open = (name: string, version?: number) => {
    n += 1;
    return open(name, version);
  };
  return { factory, opens: () => n };
}

export const STAMP = "2026-10-16T08:00:00.000001+00:00";

/** `updatedAt` stamps in time order that differ only in the microseconds. */
export const T1 = "2026-10-16T08:00:00.000001+00:00";
export const T2 = "2026-10-16T08:00:00.000002+00:00";
export const T3 = "2026-10-16T08:00:00.000003+00:00";
export const T4 = "2026-10-16T08:00:00.000004+00:00";
export const T5 = "2026-10-16T08:00:00.000005+00:00";

/** Local time, `month` 1..12. */
export const at = (month: number, date: number, hour = 0, minute = 0) =>
  new Date(2026, month - 1, date, hour, minute);

export function kind(n: number, extra: Partial<Kind> = {}): Kind {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name: `Kind ${n}`,
    colorLight: "#2E7D32",
    colorDark: "#9BD69B",
    sortOrder: n,
    isDefault: true,
    deletedAt: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...extra,
  };
}

export function ev(
  n: number,
  startsAt: Date,
  endsAt: Date,
  extra: Partial<EventRow> = {},
): EventRow {
  return {
    id: `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    title: `Event ${n}`,
    kindId: kind(1).id,
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

export function override(
  n: number,
  occurrenceDate: string,
  extra: Partial<EventOverride> = {},
): EventOverride {
  return {
    id: `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    eventId: ev(1, at(10, 1), at(10, 1, 1)).id,
    occurrenceDate,
    cancelled: false,
    title: null,
    kindId: null,
    startsAt: null,
    endsAt: null,
    allDay: null,
    location: null,
    notes: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...extra,
  };
}

/** Rows by id, so a table's contents compare without depending on order. */
export function byId<T extends { id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.id.localeCompare(b.id));
}
