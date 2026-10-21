import { liveQuery, type Subscription } from "dexie";
import type { EventOverride, Kind } from "../data/rows";
import {
  ensureDefaultKinds,
  type SeedOutcome,
  type SeedRepo,
} from "../kinds/seedKinds";
import type { CalendarDb } from "./db";
import type { EventsSnapshot, EventsStore } from "./eventsStore";
import type { Sync } from "./hydrate";
import type { KindsSnapshot, KindsStore } from "./kindsStore";
import type { OverridesSnapshot, OverridesStore } from "./overridesStore";
import { liveSorted, snapshotOf } from "./snapshots";

// The cached stores (CAL-014 Contract, Block 4): the KindsStore / EventsStore
// types and hooks of CAL-006 and CAL-009, with every snapshot read from the
// Dexie cache. The network is reached only through `sync`.
//
// - Nothing at construction: no open, no query, no sync until the first
//   subscribe() (AC-3; module import must stay side-effect free).
// - The first subscribe() starts a liveQuery over the whole table; each
//   emission publishes "ready", even an empty one. The last unsubscribe stops
//   it. liveQuery is silent on a database that cannot open (Block 4, amended
//   by RED), so the same subscribe() also opens the database itself and
//   publishes "unavailable" if that rejects.
// - refresh() runs the sync, then re-reads the table and publishes, and only
//   then resolves. A failed sync changes nothing; only a cache that cannot be
//   read publishes "unavailable". Nothing throws or rejects.

type Status = "loading" | "ready" | "unavailable";

type CachedTable<Snapshot> = {
  refresh(): Promise<void>;
  subscribe(listener: () => void): () => void;
  getSnapshot(): Snapshot;
  /** Rebuild the snapshot from the same rows (for hide/reveal). */
  republish(): void;
};

function cachedTable<Row, Snapshot>(
  db: CalendarDb,
  sync: Sync,
  read: () => Promise<Row[]>,
  build: (status: Status, rows: Row[]) => Snapshot,
): CachedTable<Snapshot> {
  let status: Status = "loading";
  let rows: Row[] = [];
  // Replaced only on a change, so getSnapshot() is stable in between
  // (useSyncExternalStore requires it).
  let snapshot = build(status, rows);
  const listeners = new Set<() => void>();
  let live: Subscription | null = null;

  const publish = (nextStatus: Status, nextRows: Row[]) => {
    status = nextStatus;
    rows = nextRows;
    snapshot = build(status, rows);
    for (const listener of listeners) listener();
  };
  const unavailable = () => publish("unavailable", []);

  const reread = async () => {
    try {
      publish("ready", await read());
    } catch {
      unavailable();
    }
  };

  return {
    async refresh() {
      try {
        await sync.run();
      } catch {
        // A Sync never rejects; should one, the cache is still the answer.
      }
      await reread();
    },
    subscribe(listener) {
      listeners.add(listener);
      if (live === null) {
        db.open().catch(unavailable);
        live = liveQuery(read).subscribe({
          next: (next) => publish("ready", next),
          error: unavailable,
        });
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && live !== null) {
          live.unsubscribe();
          live = null;
        }
      };
    },
    getSnapshot: () => snapshot,
    republish: () => publish(status, rows),
  };
}

export function createCachedKindsStore(
  db: CalendarDb,
  seedRepo: SeedRepo,
  sync: Sync,
): KindsStore {
  const table = cachedTable<Kind, KindsSnapshot>(
    db,
    sync,
    () => db.kinds.toArray(),
    snapshotOf,
  );
  let seeding: Promise<SeedOutcome> | null = null;
  let seeded: SeedOutcome | null = null;

  // CAL-006's seed, decided by the server; then one sync, so the seeded kinds
  // are in the cache before the caller goes on (PO decision 2). The rows the
  // insert returned are written first: they are the server's own and newer
  // than anything cached, and they stay even if the sync after the seed
  // fails. A cache that cannot be written is left to the sync to report.
  const ensureSeeded = (): Promise<SeedOutcome> => {
    if (seeded !== null) return Promise.resolve(seeded);
    if (seeding !== null) return seeding;
    seeding = ensureDefaultKinds(seedRepo).then(async ({ outcome, kinds }) => {
      if (outcome === "seeded") await db.kinds.bulkPut(kinds).catch(() => {});
      if (outcome !== "unavailable") {
        await sync.run();
        // Not remembered when unavailable: the next call tries again.
        seeded = outcome;
      }
      seeding = null;
      return outcome;
    });
    return seeding;
  };

  return {
    ensureSeeded,
    refresh: table.refresh,
    subscribe: table.subscribe,
    getSnapshot: table.getSnapshot,
  };
}

export function createCachedEventsStore(
  db: CalendarDb,
  sync: Sync,
): EventsStore {
  // CAL-013: the outstanding hides per id, applied to every snapshot.
  const hidden = new Map<string, number>();
  const table = cachedTable(
    db,
    sync,
    () => db.events.toArray(),
    (status, rows): EventsSnapshot => {
      const events = liveSorted(rows);
      return {
        status,
        events:
          hidden.size === 0 ? events : events.filter((e) => !hidden.has(e.id)),
      };
    },
  );

  return {
    refresh: table.refresh,
    subscribe: table.subscribe,
    getSnapshot: table.getSnapshot,
    hide(id) {
      hidden.set(id, (hidden.get(id) ?? 0) + 1);
      table.republish();
      let revealed = false;
      return () => {
        if (revealed) return;
        revealed = true;
        const count = (hidden.get(id) ?? 1) - 1;
        if (count > 0) hidden.set(id, count);
        else hidden.delete(id);
        table.republish();
      };
    },
  };
}

/** Every override, cancelled included, by occurrenceDate then createdAt. */
function ordered(rows: EventOverride[]): EventOverride[] {
  return [...rows].sort(
    (a, b) =>
      a.occurrenceDate.localeCompare(b.occurrenceDate) ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

export function createCachedOverridesStore(
  db: CalendarDb,
  sync: Sync,
): OverridesStore {
  const table = cachedTable(
    db,
    sync,
    () => db.overrides.toArray(),
    (status, rows): OverridesSnapshot => ({ status, overrides: ordered(rows) }),
  );
  return {
    refresh: table.refresh,
    subscribe: table.subscribe,
    getSnapshot: table.getSnapshot,
  };
}
