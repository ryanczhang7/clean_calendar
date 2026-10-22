import Dexie, { type DexieOptions, type Table } from "dexie";
import type { Event, EventOverride, Kind } from "../data/rows";

// The local cache (CAL-014 Contract, Block 1; architecture.md, "Where state
// lives"): the UI renders only from this copy. Rows are the domain objects of
// rows.ts - `Date` fields stay `Date`s (structured clone keeps them), the
// server's stamps stay its exact strings.

// CAL-015 Contract, Block 1: one queued write. Stored whole under `++seq`, so
// filling the record in needed no schema version.
export type OutboxOp = {
  seq?: number;
  op: "insert" | "update" | "delete" | "restore";
  table: "kinds" | "events" | "event_overrides" | "reminders";
  id: string;
  /** insert: the NewEvent / NewKind; update: the EventPatch / KindPatch; delete, restore: null. */
  patch: unknown;
  /** The cache row's updatedAt when the op was queued; informational - the drain sends the cache row's current stamp. */
  baseUpdatedAt: string | null;
  clientTs: string;
  status: "queued" | "failed";
  /** Set with status "failed". */
  error?: { code: string; message: string; http?: number };
};
export type MetaRow = { key: string; value: string };
export type ReminderRow = {
  id: string;
  eventId: string;
  minutesBefore: number;
  sentAt: string | null;
  occurrenceDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export const DB_NAME = "clean-calendar";

export class CalendarDb extends Dexie {
  kinds!: Table<Kind, string>;
  events!: Table<Event, string>;
  overrides!: Table<EventOverride, string>;
  /** Declared here, filled by CAL-026. */
  reminders!: Table<ReminderRow, string>;
  /** The pending writes, in `seq` order (CAL-015; outbox.ts, drain.ts). */
  outbox!: Table<OutboxOp, number>;
  /** The high-water marks, `mark:<table>` → the greatest `updatedAt` seen. */
  meta!: Table<MetaRow, string>;

  constructor(name: string = DB_NAME, options?: DexieOptions) {
    super(name, options);
    this.version(1).stores({
      kinds: "id, updatedAt",
      events: "id, updatedAt, startsAt, endsAt",
      overrides: "id, eventId, updatedAt",
      reminders: "id, eventId",
      outbox: "++seq",
      meta: "key",
    });
  }
}

/** The app's database. Constructing it does not open it (Dexie opens lazily). */
export const db: CalendarDb = new CalendarDb(DB_NAME);
