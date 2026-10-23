import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
  type RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import {
  type EventOverrideRow,
  type EventRow,
  type KindRow,
  toEvent,
  toEventOverride,
  toKind,
} from "../data/rows";
import type { CalendarDb, ReminderRow } from "./db";
import type { Sync } from "./hydrate";

// CAL-016 Contract, Block 3. One Realtime channel over the four client
// tables; each INSERT / UPDATE is applied to the Dexie cache the views
// already observe (CAL-014). A row with a pending op in the outbox keeps its
// local value (the drain settles it, CAL-015), and a payload no newer than
// the cached row - `updatedAt` compared as a string, the sync mark's rule -
// is ignored. Every rejoin after the first, and every return to the
// foreground, runs the incremental catch-up once.

/** The two members of SupabaseClient the module uses; tests hand a fake. */
export type RealtimeClient = {
  channel(name: string): RealtimeChannel;
  removeChannel(channel: RealtimeChannel): Promise<unknown>;
};

export const CHANNEL_NAME = "cache";
export const TABLES = [
  "events",
  "event_overrides",
  "kinds",
  "reminders",
] as const;
export type RealtimeTable = (typeof TABLES)[number];

type Payload = RealtimePostgresChangesPayload<Record<string, unknown>>;

export type Realtime = {
  /** Subscribes the one channel; idempotent while started. */
  start(): void;
  /** Removes the channel and the visibility listener; idempotent. */
  stop(): void;
  /** Apply one payload to the cache (exported for the tests; start() wires it to the channel). */
  apply(table: RealtimeTable, payload: Payload): Promise<void>;
};

type ReminderPgRow = {
  id: string;
  event_id: string;
  minutes_before: number;
  sent_at: string | null;
  occurrence_date: string | null;
  created_at: string;
  updated_at: string;
};

/** The reminders row mapper (rows.ts has none yet; CAL-026 may move it). */
export function toReminderRow(row: ReminderPgRow): ReminderRow {
  return {
    id: row.id,
    eventId: row.event_id,
    minutesBefore: row.minutes_before,
    sentAt: row.sent_at,
    occurrenceDate: row.occurrence_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type Cached = { id: string; updatedAt: string };

/** The Dexie table and the mapper for each streamed table. */
function target(db: CalendarDb, table: RealtimeTable, raw: unknown) {
  switch (table) {
    case "events":
      return { store: db.events, row: toEvent(raw as EventRow) };
    case "event_overrides":
      return {
        store: db.overrides,
        row: toEventOverride(raw as EventOverrideRow),
      };
    case "kinds":
      return { store: db.kinds, row: toKind(raw as KindRow) };
    case "reminders":
      return { store: db.reminders, row: toReminderRow(raw as ReminderPgRow) };
  }
}

export function createRealtime(
  client: RealtimeClient,
  db: CalendarDb,
  sync: Pick<Sync, "run">,
  doc: Document = document,
): Realtime {
  let channel: RealtimeChannel | undefined;
  let joined = false;

  const onVisible = () => {
    if (doc.visibilityState === "visible") void sync.run();
  };

  async function apply(table: RealtimeTable, payload: Payload): Promise<void> {
    try {
      if (payload.eventType === "DELETE") return;
      const { store, row } = target(db, table, payload.new);
      // The outbox names each table as Realtime does.
      const typed = store as unknown as {
        get(id: string): Promise<Cached | undefined>;
        put(row: Cached): Promise<unknown>;
      };
      await db.transaction("rw", store, db.outbox, async () => {
        const ops = await db.outbox.toArray();
        const held = ops.some((op) => op.table === table && op.id === row.id);
        if (held) return;
        const cached = await typed.get(row.id);
        if (cached !== undefined && cached.updatedAt >= row.updatedAt) return;
        await typed.put(row);
      });
    } catch {
      // A malformed payload (no row, no id) is ignored.
    }
  }

  function start(): void {
    if (channel !== undefined) return;
    const ch = client.channel(CHANNEL_NAME);
    channel = ch;
    joined = false;
    for (const table of TABLES) {
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload: Payload) => void apply(table, payload),
      );
    }
    ch.subscribe((status) => {
      if (channel !== ch) return;
      if (status !== REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) return;
      const rejoin = joined;
      joined = true;
      if (!rejoin) return;
      void sync.run();
    });
    doc.addEventListener("visibilitychange", onVisible);
  }

  function stop(): void {
    doc.removeEventListener("visibilitychange", onVisible);
    if (channel === undefined) return;
    const ch = channel;
    channel = undefined;
    client.removeChannel(ch).catch(() => undefined);
  }

  return { start, stop, apply };
}
