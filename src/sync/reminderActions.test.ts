import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import type { NewReminder, Reminder } from "../data/rows";
import { freshDb, reminder, STAMP, T1, T2 } from "../test/cache-fixtures";
import {
  asRepos,
  fakeRepos,
  NOW,
  NOW_TS,
  okRow,
  opsWithoutSeq,
  S1,
  SERVER_CREATED,
  U1,
  U2,
} from "../test/outbox-fixtures";
import type { CalendarDb, OutboxOp } from "./db";
import { createDrain, type Drain } from "./drain";
import { queuedCount } from "./outbox";
import {
  createOutboxReminderActions,
  type ReminderActions,
  reminderActions,
} from "./reminderActions";
import { appRepos } from "./startSync";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-026 AC-1, AC-2, AC-3 and Contract Block 4: the reminder actions over the
// outbox. MECHANICAL: the exact cache rows (`toStrictEqual`) and the exact
// queued ops (minus `seq`) after each action, and the exact result. A real
// CalendarDb over a fresh fake-indexeddb factory; the client clock is a
// Date-only fake and `crypto.randomUUID` answers U1, then U2. The drain is a
// vi.fn whose run never settles - an action must not wait for it - except in
// the offline case, where a real drain over vi.fn repositories shows that
// nothing is sent until it runs online.
//
// "The event's template" is the cached reminder with that eventId and
// occurrenceDate null, live or soft-deleted (Block 4). A per-occurrence row
// (occurrenceDate set; the scheduler's, CAL-029) is never the template.

const EVENT_ID = reminder(1).eventId;
const OTHER_EVENT_ID = "10000000-0000-4000-8000-000000000002";

/** A live template cached for EVENT_ID, 15 minutes, server stamp T1. */
const LIVE: Reminder = reminder(1, { minutesBefore: 15, updatedAt: T1 });
/** The same template soft-deleted on the server: deletedAt T2, stamp T2. */
const CLEARED: Reminder = reminder(1, {
  minutesBefore: 15,
  deletedAt: T2,
  updatedAt: T2,
});

/** The template setReminder inserts: U1, the client stamp, unsent, live. */
const created = (minutesBefore: number): Reminder => ({
  id: U1,
  eventId: EVENT_ID,
  minutesBefore,
  sentAt: null,
  occurrenceDate: null,
  deletedAt: null,
  createdAt: NOW_TS,
  updatedAt: NOW_TS,
});

/** A new template's insert patch: the NewReminder, no id, stamps or deletedAt. */
const inputOf = (minutesBefore: number): NewReminder => ({
  eventId: EVENT_ID,
  minutesBefore,
  sentAt: null,
  occurrenceDate: null,
});

/** The op an action queues, `seq` aside. */
const queuedOp = (
  op: OutboxOp["op"],
  id: string,
  patch: unknown,
  baseUpdatedAt: string | null,
): Omit<OutboxOp, "seq"> => ({
  op,
  table: "reminders",
  id,
  patch,
  baseUpdatedAt,
  clientTs: NOW_TS,
  status: "queued",
});

/** Every cached template (occurrenceDate null) of `eventId`, deleted or not. */
const templatesOf = async (db: CalendarDb, eventId: string) =>
  (await db.reminders.toArray()).filter(
    (r) => r.eventId === eventId && r.occurrenceDate === null,
  );

let db: CalendarDb;
let run: Mock<Pick<Drain, "run">["run"]>;
let actions: ReminderActions;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.spyOn(crypto, "randomUUID")
    .mockReturnValueOnce(U1)
    .mockReturnValueOnce(U2);
  db = freshDb();
  // A pass that never settles: an action must not wait for it.
  run = vi.fn<Pick<Drain, "run">["run"]>(() => new Promise(() => {}));
  actions = createOutboxReminderActions(db, { run }, () => false);
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete (navigator as { onLine?: boolean }).onLine;
});

describe("setReminder on an event with no reminder (AC-1)", () => {
  it("adds one template to the cache - the eventId, the minutes, occurrenceDate null, sentAt null, deletedAt null, a new id, the client stamp - and resolves ok with it", async () => {
    await expect(actions.setReminder(EVENT_ID, 30)).resolves.toStrictEqual({
      status: "ok",
      row: created(30),
    });
    expect(await db.reminders.toArray()).toStrictEqual([created(30)]);
  });

  it("queues exactly one insert op on reminders, its patch the new template without id, stamps or deletedAt", async () => {
    await actions.setReminder(EVENT_ID, 30);
    expect(await opsWithoutSeq(db)).toStrictEqual([
      queuedOp("insert", U1, inputOf(30), null),
    ]);
  });

  it("a negative minutesBefore (CAL-057's all-day 09:00) is stored and queued as given", async () => {
    await expect(actions.setReminder(EVENT_ID, -540)).resolves.toStrictEqual({
      status: "ok",
      row: created(-540),
    });
    expect(await opsWithoutSeq(db)).toStrictEqual([
      queuedOp("insert", U1, inputOf(-540), null),
    ]);
  });

  it("another event's template, and this event's per-occurrence rows, are not its template: a new template is inserted and they are untouched", async () => {
    const otherEvent = reminder(2, {
      eventId: OTHER_EVENT_ID,
      updatedAt: T1,
    });
    const materialised = reminder(3, {
      occurrenceDate: "2026-10-27",
      sentAt: "2026-10-27T08:45:00.000001+00:00",
      updatedAt: T1,
    });
    await db.reminders.bulkPut([otherEvent, materialised]);
    await expect(actions.setReminder(EVENT_ID, 30)).resolves.toStrictEqual({
      status: "ok",
      row: created(30),
    });
    expect(await db.reminders.get(otherEvent.id)).toStrictEqual(otherEvent);
    expect(await db.reminders.get(materialised.id)).toStrictEqual(materialised);
    expect(await db.reminders.count()).toBe(3);
    expect(await opsWithoutSeq(db)).toStrictEqual([
      queuedOp("insert", U1, inputOf(30), null),
    ]);
  });
});

describe("setReminder on an event with a live template (AC-2)", () => {
  it("another value: the same row - same id - takes the new minutesBefore, every other field and the stamps kept, and resolves ok with it", async () => {
    await db.reminders.put(LIVE);
    const want: Reminder = { ...LIVE, minutesBefore: 60 };
    await expect(actions.setReminder(EVENT_ID, 60)).resolves.toStrictEqual({
      status: "ok",
      row: want,
    });
    expect(await db.reminders.toArray()).toStrictEqual([want]);
    // The contrast a naive optimistic write fails: it re-stamps the row.
    expect((await db.reminders.get(LIVE.id))?.updatedAt).toBe(T1);
    expect((await db.reminders.get(LIVE.id))?.createdAt).toBe(STAMP);
  });

  it("another value: one update op { minutesBefore } is queued on that id, based on the cached stamp - no insert", async () => {
    await db.reminders.put(LIVE);
    await actions.setReminder(EVENT_ID, 60);
    expect(await opsWithoutSeq(db)).toStrictEqual([
      queuedOp("update", LIVE.id, { minutesBefore: 60 }, T1),
    ]);
  });

  it("the same value: nothing is queued, the row is unchanged, and it resolves ok with that row", async () => {
    await db.reminders.put(LIVE);
    await expect(actions.setReminder(EVENT_ID, 15)).resolves.toStrictEqual({
      status: "ok",
      row: LIVE,
    });
    expect(await db.reminders.toArray()).toStrictEqual([LIVE]);
    expect(await db.outbox.count()).toBe(0);
  });

  it("a second set merges into the template the first created: one row, the same id, an insert then an update; a third with the same value queues nothing", async () => {
    await actions.setReminder(EVENT_ID, 10);
    await expect(actions.setReminder(EVENT_ID, 20)).resolves.toStrictEqual({
      status: "ok",
      row: created(20),
    });
    await expect(actions.setReminder(EVENT_ID, 20)).resolves.toStrictEqual({
      status: "ok",
      row: created(20),
    });
    expect(await db.reminders.toArray()).toStrictEqual([created(20)]);
    expect(await opsWithoutSeq(db)).toStrictEqual([
      queuedOp("insert", U1, inputOf(10), null),
      queuedOp("update", U1, { minutesBefore: 20 }, NOW_TS),
    ]);
  });

  it("two calls at once over no template leave one template, not two: an insert, then an update of that same row", async () => {
    const [first, second] = await Promise.all([
      actions.setReminder(EVENT_ID, 10),
      actions.setReminder(EVENT_ID, 20),
    ]);
    expect(first).toStrictEqual({ status: "ok", row: created(10) });
    expect(second).toStrictEqual({ status: "ok", row: created(20) });
    expect(await templatesOf(db, EVENT_ID)).toStrictEqual([created(20)]);
    expect(await opsWithoutSeq(db)).toStrictEqual([
      queuedOp("insert", U1, inputOf(10), null),
      queuedOp("update", U1, { minutesBefore: 20 }, NOW_TS),
    ]);
  });

  it("a per-occurrence row beside the live template is left alone: the template is updated, the materialised row is not", async () => {
    const materialised = reminder(3, {
      occurrenceDate: "2026-10-27",
      minutesBefore: 15,
      updatedAt: T1,
    });
    await db.reminders.bulkPut([LIVE, materialised]);
    await actions.setReminder(EVENT_ID, 60);
    expect(await db.reminders.get(materialised.id)).toStrictEqual(materialised);
    expect(await opsWithoutSeq(db)).toStrictEqual([
      queuedOp("update", LIVE.id, { minutesBefore: 60 }, T1),
    ]);
  });

  it("a cached template with no deletedAt key (streamed before this story) counts as live: another value is an update, never a restore", async () => {
    const { deletedAt: _d, ...legacy } = LIVE;
    await db.reminders.put(legacy as Reminder);
    await actions.setReminder(EVENT_ID, 60);
    expect(await opsWithoutSeq(db)).toStrictEqual([
      queuedOp("update", LIVE.id, { minutesBefore: 60 }, T1),
    ]);
  });
});

describe("clearReminder, and setReminder after it (AC-3)", () => {
  it("clearReminder over a live template: the row gets the client stamp as deletedAt, one delete op is queued, and it resolves ok with the cleared row", async () => {
    await db.reminders.put(LIVE);
    const want: Reminder = { ...LIVE, deletedAt: NOW_TS };
    await expect(actions.clearReminder(EVENT_ID)).resolves.toStrictEqual({
      status: "ok",
      row: want,
    });
    expect(await db.reminders.toArray()).toStrictEqual([want]);
    expect(await opsWithoutSeq(db)).toStrictEqual([
      queuedOp("delete", LIVE.id, null, T1),
    ]);
  });

  it("clearReminder with no template: nothing is queued, nothing is cached, and it resolves ok with row null", async () => {
    await expect(actions.clearReminder(EVENT_ID)).resolves.toStrictEqual({
      status: "ok",
      row: null,
    });
    expect(await db.outbox.count()).toBe(0);
    expect(await db.reminders.count()).toBe(0);
  });

  it("clearReminder over a template already cleared: nothing is queued, the row is unchanged, and it resolves ok with row null", async () => {
    await db.reminders.put(CLEARED);
    await expect(actions.clearReminder(EVENT_ID)).resolves.toStrictEqual({
      status: "ok",
      row: null,
    });
    expect(await db.reminders.toArray()).toStrictEqual([CLEARED]);
    expect(await db.outbox.count()).toBe(0);
  });

  it("clearReminder leaves a per-occurrence row of the event alone, with no template: nothing is queued", async () => {
    const materialised = reminder(3, {
      occurrenceDate: "2026-10-27",
      updatedAt: T1,
    });
    await db.reminders.put(materialised);
    await expect(actions.clearReminder(EVENT_ID)).resolves.toStrictEqual({
      status: "ok",
      row: null,
    });
    expect(await db.reminders.toArray()).toStrictEqual([materialised]);
    expect(await db.outbox.count()).toBe(0);
  });

  it("setReminder over a cleared template with another value: that same row is restored and given the value - one restore op, then one update op, never a second insert", async () => {
    await db.reminders.put(CLEARED);
    const want: Reminder = { ...CLEARED, deletedAt: null, minutesBefore: 45 };
    await expect(actions.setReminder(EVENT_ID, 45)).resolves.toStrictEqual({
      status: "ok",
      row: want,
    });
    expect(await db.reminders.toArray()).toStrictEqual([want]);
    expect(await opsWithoutSeq(db)).toStrictEqual([
      queuedOp("restore", CLEARED.id, null, T2),
      queuedOp("update", CLEARED.id, { minutesBefore: 45 }, T2),
    ]);
  });

  it("setReminder over a cleared template with the value it had: restored only - one restore op, no update", async () => {
    await db.reminders.put(CLEARED);
    const want: Reminder = { ...CLEARED, deletedAt: null };
    await expect(actions.setReminder(EVENT_ID, 15)).resolves.toStrictEqual({
      status: "ok",
      row: want,
    });
    expect(await db.reminders.toArray()).toStrictEqual([want]);
    expect(await opsWithoutSeq(db)).toStrictEqual([
      queuedOp("restore", CLEARED.id, null, T2),
    ]);
  });

  it("set, clear, set again of a new template: one row with id U1 throughout - insert, delete, restore, update - and no second insert", async () => {
    await actions.setReminder(EVENT_ID, 15);
    await actions.clearReminder(EVENT_ID);
    await expect(actions.setReminder(EVENT_ID, 30)).resolves.toStrictEqual({
      status: "ok",
      row: created(30),
    });
    expect(await db.reminders.toArray()).toStrictEqual([created(30)]);
    expect(await opsWithoutSeq(db)).toStrictEqual([
      queuedOp("insert", U1, inputOf(15), null),
      queuedOp("delete", U1, null, NOW_TS),
      queuedOp("restore", U1, null, NOW_TS),
      queuedOp("update", U1, { minutesBefore: 30 }, NOW_TS),
    ]);
  });
});

describe("offline and online (AC-1, Block 4)", () => {
  it("offline: setReminder and clearReminder each resolve ok at once, queuedCount counts their ops, and nothing reaches a repository until a drain runs online", async () => {
    let network = false;
    const repos = fakeRepos();
    const drain = createDrain(db, asRepos(repos), () => network);
    const outbox = createOutboxReminderActions(db, drain, () => network);

    const set = await outbox.setReminder(EVENT_ID, 30);
    const cleared = await outbox.clearReminder(EVENT_ID);
    expect([set.status, cleared.status]).toStrictEqual(["ok", "ok"]);
    expect(await queuedCount(db)).toBe(2);
    for (const table of Object.values(repos)) {
      for (const member of Object.values(table)) {
        expect(member).not.toHaveBeenCalled();
      }
    }

    network = true;
    repos.reminders.insert.mockResolvedValue(
      okRow({ ...created(30), createdAt: SERVER_CREATED, updatedAt: S1 }),
    );
    repos.reminders.remove.mockResolvedValue(
      okRow({
        ...created(30),
        createdAt: SERVER_CREATED,
        deletedAt: "2026-10-21T10:00:00.000002+00:00",
        updatedAt: "2026-10-21T10:00:00.000002+00:00",
      }),
    );
    await expect(drain.run()).resolves.toStrictEqual({
      sent: 2,
      stoppedAt: "end",
    });
    expect(repos.reminders.insert.mock.calls).toStrictEqual([
      [inputOf(30), U1],
    ]);
    expect(repos.reminders.remove.mock.calls).toStrictEqual([[U1, S1]]);
    expect(await queuedCount(db)).toBe(0);
  });

  it("offline: no drain run is started", async () => {
    await actions.setReminder(EVENT_ID, 30);
    await actions.clearReminder(EVENT_ID);
    expect(run).not.toHaveBeenCalled();
  });

  it("online: setReminder and clearReminder each start one drain run, unannounced, and resolve without waiting for it", async () => {
    const outbox = createOutboxReminderActions(db, { run }, () => true);
    await expect(outbox.setReminder(EVENT_ID, 30)).resolves.toStrictEqual({
      status: "ok",
      row: created(30),
    });
    expect(run).toHaveBeenCalledTimes(1);
    await outbox.clearReminder(EVENT_ID);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls.map((c) => c[0]?.announce === true)).toStrictEqual([
      false,
      false,
    ]);
  });

  it("online defaults to navigator.onLine", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    const outbox = createOutboxReminderActions(db, { run });
    await outbox.setReminder(EVENT_ID, 30);
    expect(run).not.toHaveBeenCalled();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    await outbox.setReminder(EVENT_ID, 45);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("the app's reminder actions and repositories (Block 4, Block 7)", () => {
  it("reminderActions are outbox actions over the app's db: offline, setReminder writes the app's outbox and sends nothing", async () => {
    const { db: appDb } = await import("./db");
    await Promise.all(appDb.tables.map((t) => t.clear()));
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(
      reminderActions.setReminder(EVENT_ID, 30),
    ).resolves.toStrictEqual({ status: "ok", row: created(30) });
    expect(network).not.toHaveBeenCalled();
    expect(
      (await appDb.outbox.toArray()).map((o) => [o.op, o.table, o.id]),
    ).toStrictEqual([["insert", "reminders", U1]]);
    await Promise.all(appDb.tables.map((t) => t.clear()));
  });

  it("appRepos carries the reminders repository the app's drain sends through", () => {
    expect(typeof appRepos.reminders.insert).toBe("function");
    expect(typeof appRepos.reminders.update).toBe("function");
    expect(typeof appRepos.reminders.remove).toBe("function");
    expect(typeof appRepos.reminders.restore).toBe("function");
    expect(typeof appRepos.reminders.get).toBe("function");
  });
});
