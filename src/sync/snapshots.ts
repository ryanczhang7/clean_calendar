import type { Event, Kind } from "../data/rows";
import type { KindsSnapshot, KindsStatus } from "./kindsStore";

// The pure snapshot builders shared by the in-memory stores (kindsStore.ts,
// eventsStore.ts) and the cached ones (cachedStores.ts). They live apart from
// both so that neither store module imports the other at run time: the
// singletons in kindsStore.ts / eventsStore.ts are built by cachedStores.ts,
// and a cycle there surfaces as "not a function" at import (CAL-014 RED
// handoff, "For GREEN" 5). Only types cross back, and types are erased.

/** Live kinds sorted by sortOrder then createdAt; `byId` over every row. */
export function snapshotOf(status: KindsStatus, rows: Kind[]): KindsSnapshot {
  const index = new Map(rows.map((k) => [k.id, k]));
  const kinds = rows
    .filter((k) => k.deletedAt === null)
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt),
    );
  return { status, kinds, byId: (id) => index.get(id) };
}

/** Live events (deletedAt null), ascending startsAt, then createdAt. */
export function liveSorted(rows: Event[]): Event[] {
  return rows
    .filter((e) => e.deletedAt === null)
    .sort(
      (a, b) =>
        a.startsAt.getTime() - b.startsAt.getTime() ||
        a.createdAt.localeCompare(b.createdAt),
    );
}
