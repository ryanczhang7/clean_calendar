import type {
  RealtimePostgresChangesPayload,
  REALTIME_SUBSCRIBE_STATES,
} from "@supabase/supabase-js";
import { type Mock, vi } from "vitest";
import type { Database } from "../data/database.types";
import type { ReminderRow } from "../sync/db";
import { CREATED_AT, EVENT_ID, UPDATED_AT } from "./rows-fixtures";

// CAL-016 Contract, Block 6: shared builders for the Realtime suites
// (realtime.test.ts, startSync.test.ts) and the channel stub the mocked app
// client carries (supabase-mock.ts).
//
// A FakeRealtimeClient has exactly the two members `realtime.ts` uses,
// `channel(name)` and `removeChannel(channel)`. `channel()` returns a
// chainable FakeChannel that records every `on(...)` binding and captures the
// `subscribe(...)` callback; nothing is sent anywhere, and no status is
// reported until a test calls `report(status)`, as the socket would.

export type Payload = RealtimePostgresChangesPayload<Record<string, unknown>>;
export type SubscribeStatus = `${REALTIME_SUBSCRIBE_STATES}`;
export type ChangesFilter = { event: string; schema: string; table: string };

export type FakeChannel = {
  name: string;
  on: Mock<
    (
      type: string,
      filter: ChangesFilter,
      callback: (payload: Payload) => void,
    ) => FakeChannel
  >;
  subscribe: Mock<
    (callback?: (status: SubscribeStatus, err?: Error) => void) => FakeChannel
  >;
  /** Report a subscribe status to the captured callback, as the socket does. */
  report(status: SubscribeStatus): void;
  /** Hand `payload` to every binding whose filter names its table. */
  deliver(payload: Payload): void;
};

export type FakeRealtimeClient = {
  channel: Mock<(name: string) => FakeChannel>;
  removeChannel: Mock<(channel: FakeChannel) => Promise<"ok">>;
  /** Every channel `channel()` returned, in order. */
  channels: FakeChannel[];
  /** Forget every channel and recorded call; implementations stay. */
  clear(): void;
};

function fakeChannel(name: string): FakeChannel {
  const bindings: {
    filter: ChangesFilter;
    callback: (payload: Payload) => void;
  }[] = [];
  let onStatus: ((status: SubscribeStatus, err?: Error) => void) | undefined;
  const channel: FakeChannel = {
    name,
    on: vi.fn(),
    subscribe: vi.fn(),
    report(status) {
      if (onStatus === undefined) {
        throw new Error(
          `channel ${name}: report(${status}) before subscribe()`,
        );
      }
      onStatus(status);
    },
    deliver(payload) {
      for (const b of bindings) {
        if (b.filter.table === payload.table) b.callback(payload);
      }
    },
  };
  channel.on.mockImplementation((_type, filter, callback) => {
    bindings.push({ filter, callback });
    return channel;
  });
  channel.subscribe.mockImplementation((callback) => {
    onStatus = callback;
    return channel;
  });
  return channel;
}

export function fakeRealtimeClient(): FakeRealtimeClient {
  const channels: FakeChannel[] = [];
  const client: FakeRealtimeClient = {
    channel: vi.fn((name: string) => {
      const ch = fakeChannel(name);
      channels.push(ch);
      return ch;
    }),
    removeChannel: vi.fn(async () => "ok" as const),
    channels,
    clear() {
      channels.length = 0;
      client.channel.mockClear();
      client.removeChannel.mockClear();
    },
  };
  return client;
}

/** The (table, filter) of every `on` call, in order. */
export const bindingsOf = (ch: FakeChannel) =>
  ch.on.mock.calls.map(([type, filter]) => [type, filter]);

const COMMIT = "2026-10-22T10:00:00.000Z";

/** An INSERT or UPDATE payload carrying `row` as `new`, as Realtime sends it. */
export function changed(
  eventType: "INSERT" | "UPDATE",
  table: string,
  row: Record<string, unknown>,
): Payload {
  return eventType === "INSERT"
    ? {
        eventType,
        schema: "public",
        table,
        commit_timestamp: COMMIT,
        errors: [],
        new: row,
        old: {},
      }
    : {
        eventType,
        schema: "public",
        table,
        commit_timestamp: COMMIT,
        errors: [],
        new: row,
        old: { id: row.id },
      };
}

/** A DELETE payload: `new` is empty, `old` carries the primary key. */
export function deletedPayload(table: string, id: string): Payload {
  return {
    eventType: "DELETE",
    schema: "public",
    table,
    commit_timestamp: COMMIT,
    errors: [],
    new: {},
    old: { id },
  };
}

// --- reminders -----------------------------------------------------------------
// rows.ts has no reminders mapper (PO decision 7); these are written out by
// hand, as rows-fixtures.ts does for the other tables.

export type ReminderPgRow = Database["public"]["Tables"]["reminders"]["Row"];

export const REMINDER_ID = "7d6c5b4a-3928-4170-8e6f-5a4b3c2d1e01";
export const REMINDER_ID_2 = "7d6c5b4a-3928-4170-8e6f-5a4b3c2d1e02";

export const reminderRowFull: ReminderPgRow = {
  id: REMINDER_ID,
  event_id: EVENT_ID,
  minutes_before: 15,
  sent_at: "2026-10-20T08:45:00.000007+00:00",
  occurrence_date: "2026-10-20",
  created_at: CREATED_AT,
  updated_at: UPDATED_AT,
};

export const reminderFull: ReminderRow = {
  id: REMINDER_ID,
  eventId: EVENT_ID,
  minutesBefore: 15,
  sentAt: "2026-10-20T08:45:00.000007+00:00",
  occurrenceDate: "2026-10-20",
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

export const reminderRowNulls: ReminderPgRow = {
  id: REMINDER_ID_2,
  event_id: EVENT_ID,
  minutes_before: 0,
  sent_at: null,
  occurrence_date: null,
  created_at: "2026-10-03T10:00:00.000004+00:00",
  updated_at: "2026-10-03T10:00:00.000004+00:00",
};

export const reminderNulls: ReminderRow = {
  id: REMINDER_ID_2,
  eventId: EVENT_ID,
  minutesBefore: 0,
  sentAt: null,
  occurrenceDate: null,
  createdAt: "2026-10-03T10:00:00.000004+00:00",
  updatedAt: "2026-10-03T10:00:00.000004+00:00",
};
