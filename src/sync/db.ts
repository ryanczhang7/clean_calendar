import Dexie, { type DexieOptions, type Table } from "dexie";
import type { Event, EventOverride, Kind } from "../data/rows";

// The local cache (CAL-014 Contract, Block 1; architecture.md, "Where state
// lives"): the UI renders only from this copy. Rows are the domain objects of
// rows.ts - `Date` fields stay `Date`s (structured clone keeps them), the
// server's stamps stay its exact strings.

export type OutboxOp = {
  seq?: number;
  op: "insert" | "update" | "delete";
  table: "kinds" | "events" | "event_overrides" | "reminders";
  id: string;
  patch: unknown;
  expectedUpdatedAt: string | null;
  clientTs: string;
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
  /** Declared here, filled by CAL-015. */
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
