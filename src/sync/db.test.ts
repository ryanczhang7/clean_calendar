import { afterEach, describe, expect, it } from "vitest";
import {
  at,
  countingFactory,
  ev,
  freshDb,
  kind,
  override,
} from "../test/cache-fixtures";
import { CalendarDb, DB_NAME, db, type OutboxOp } from "./db";
import { IDBKeyRange } from "fake-indexeddb";

const STAMP_A = "2026-10-14T09:15:02.123456+00:00";

// CAL-014 Contract, Block 1. The cache's schema, version 1: one table per
// synced row type, the reminders table CAL-026 fills, the outbox CAL-015
// fills, and a key-value meta table for the high-water marks. Rows are the
// domain objects of rows.ts - Date fields stay Dates (structured clone), the
// server's stamps stay its exact strings.

const opened: CalendarDb[] = [];
function track(d: CalendarDb): CalendarDb {
  opened.push(d);
  return d;
}

afterEach(() => {
  for (const d of opened.splice(0)) d.close();
});

/** Each table's primary key and secondary indexes, as Dexie parsed them. */
function schemaOf(d: CalendarDb) {
  return Object.fromEntries(
    d.tables.map((t) => [
      t.name,
      {
        primKey: t.schema.primKey.keyPath,
        auto: t.schema.primKey.auto,
        indexes: t.schema.indexes.map((i) => i.keyPath).sort(),
      },
    ]),
  );
}

describe("the app's database (Block 1)", () => {
  it('is named "clean-calendar", and importing it opens nothing', () => {
    expect(DB_NAME).toBe("clean-calendar");
    expect(db).toBeInstanceOf(CalendarDb);
    expect(db.name).toBe("clean-calendar");
    expect(db.isOpen()).toBe(false);
  });

  it("constructing a CalendarDb does not open it; the first query does", async () => {
    const { factory, opens } = countingFactory();
    const d = track(
      new CalendarDb("cal-014-lazy", { indexedDB: factory, IDBKeyRange }),
    );
    // Dexie opens on a later tick; give an eager open the time to show.
    await new Promise((done) => setTimeout(done, 30));
    expect(d.isOpen()).toBe(false);
    expect(opens()).toBe(0);
    await d.kinds.count();
    expect(d.isOpen()).toBe(true);
    expect(opens()).toBeGreaterThan(0);
  });
});

describe("the schema, version 1 (Block 1)", () => {
  it("has exactly the six tables, each with its primary key and indexes", () => {
    const d = track(freshDb());
    expect(d.verno).toBe(1);
    expect(schemaOf(d)).toStrictEqual({
      kinds: { primKey: "id", auto: false, indexes: ["updatedAt"] },
      events: {
        primKey: "id",
        auto: false,
        indexes: ["endsAt", "startsAt", "updatedAt"],
      },
      overrides: {
        primKey: "id",
        auto: false,
        indexes: ["eventId", "updatedAt"],
      },
      reminders: { primKey: "id", auto: false, indexes: ["eventId"] },
      outbox: { primKey: "seq", auto: true, indexes: [] },
      meta: { primKey: "key", auto: false, indexes: [] },
    });
  });

  it("exposes each table as a property of the same name", () => {
    const d = track(freshDb());
    expect(d.kinds.name).toBe("kinds");
    expect(d.events.name).toBe("events");
    expect(d.overrides.name).toBe("overrides");
    expect(d.reminders.name).toBe("reminders");
    expect(d.outbox.name).toBe("outbox");
    expect(d.meta.name).toBe("meta");
  });
});

describe("rows are stored as domain objects (Block 1)", () => {
  it("an event's startsAt and endsAt come back as Dates at the same instant, every other field byte for byte", async () => {
    const d = track(freshDb());
    const row = ev(1, at(10, 14, 9, 30), at(10, 14, 10, 45), {
      title: "Dentist",
      location: "Main St",
      notes: "bring card",
      recurrence: {
        freq: "weekly",
        until: "2026-12-31",
        tz: "America/Chicago",
      },
      updatedAt: "2026-10-14T09:15:02.123456+00:00",
      deletedAt: "2026-10-14T09:15:02.123456+00:00",
    });
    await d.events.put(row);
    const back = await d.events.get(row.id);
    expect(back?.startsAt).toBeInstanceOf(Date);
    expect(back?.endsAt).toBeInstanceOf(Date);
    expect(back).toStrictEqual(row);
  });

  it("an override's Date and null instants both survive", async () => {
    const d = track(freshDb());
    const moved = override(1, "2026-10-14", {
      startsAt: at(10, 14, 11),
      endsAt: at(10, 14, 12),
      allDay: false,
    });
    const cancelled = override(2, "2026-10-21", { cancelled: true });
    await d.overrides.bulkPut([moved, cancelled]);
    const back = await d.overrides.get(moved.id);
    expect(back?.startsAt).toBeInstanceOf(Date);
    expect(back).toStrictEqual(moved);
    expect(await d.overrides.get(cancelled.id)).toStrictEqual(cancelled);
  });

  it("a kind, live or soft-deleted, round-trips exactly", async () => {
    const d = track(freshDb());
    const live = kind(1);
    const gone = kind(2, { deletedAt: "2026-10-14T09:15:02.123456+00:00" });
    await d.kinds.bulkPut([live, gone]);
    expect(await d.kinds.get(live.id)).toStrictEqual(live);
    expect(await d.kinds.get(gone.id)).toStrictEqual(gone);
  });

  it("the outbox numbers its operations 1, 2, … in the order they were added", async () => {
    const d = track(freshDb());
    const op = (id: string): OutboxOp => ({
      op: "update",
      table: "events",
      id,
      patch: { title: "x" },
      expectedUpdatedAt: STAMP_A,
      clientTs: "2026-10-14T09:00:00.000Z",
    });
    await d.outbox.add(op("a"));
    await d.outbox.add(op("b"));
    const rows = await d.outbox.toArray();
    expect(rows.map((r) => [r.seq, r.id])).toStrictEqual([
      [1, "a"],
      [2, "b"],
    ]);
  });

  it("meta holds string values by key", async () => {
    const d = track(freshDb());
    await d.meta.put({ key: "mark:kinds", value: STAMP_A });
    expect(await d.meta.get("mark:kinds")).toStrictEqual({
      key: "mark:kinds",
      value: STAMP_A,
    });
  });

  it("a reminder row is stored by id and found by its eventId", async () => {
    const d = track(freshDb());
    const r = {
      id: "30000000-0000-4000-8000-000000000001",
      eventId: ev(1, at(10, 1), at(10, 1, 1)).id,
      minutesBefore: 15,
      sentAt: null,
      occurrenceDate: null,
      createdAt: STAMP_A,
      updatedAt: STAMP_A,
    };
    await d.reminders.put(r);
    expect(
      await d.reminders.where("eventId").equals(r.eventId).toArray(),
    ).toStrictEqual([r]);
  });
});
