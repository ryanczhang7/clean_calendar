import { HttpResponse } from "msw";
import { describe, expect, test } from "vitest";
import {
  installServer,
  onTable,
  pgError,
  preferTokens,
  testClient,
} from "../test/msw";
import {
  REMINDER_ID,
  reminderFull,
  reminderNulls,
  reminderRowFull,
  reminderRowNulls,
} from "../test/realtime-fixtures";
import { EVENT_ID, UPDATED_AT } from "../test/rows-fixtures";
import { remindersRepo } from "./reminders";
import type { NewReminder } from "./rows";

// CAL-026 Contract, Block 3: the reminders repository, over a real
// supabase-js client whose PostgREST calls MSW answers (msw.ts). MECHANICAL:
// the exact method, path, filters and body of each request, and the exact
// Result. Every write is conditional on the updated_at the client saw, as
// events.ts's are; remove and restore are soft (deleted_at), never an HTTP
// DELETE - which is why a cleared template can be restored (AC-3).

installServer();

const SINCE = "2026-10-13T18:00:00.000001+00:00";

const TEMPLATE: NewReminder = {
  eventId: EVENT_ID,
  minutesBefore: 30,
  sentAt: null,
  occurrenceDate: null,
};

describe("reminders.listSince (Block 3; AC-5's catch-up)", () => {
  test("requests rows with updated_at > since, ordered by updated_at, with no deleted_at filter", async () => {
    const seen = onTable("reminders", () =>
      HttpResponse.json([reminderRowNulls, reminderRowFull]),
    );
    const result = await remindersRepo(testClient()).listSince(SINCE);

    expect(seen).toHaveLength(1);
    const [req] = seen;
    expect(req?.method).toBe("GET");
    expect(req?.url.pathname).toBe("/rest/v1/reminders");
    expect(req?.url.searchParams.get("select")).toBe("*");
    expect(req?.url.searchParams.get("updated_at")).toBe(`gt.${SINCE}`);
    expect(req?.url.searchParams.get("order")).toBe("updated_at.asc");
    // Soft-deleted rows are pulled too: that is how a clear reaches another device.
    expect(req?.url.searchParams.has("deleted_at")).toBe(false);
    expect(result).toStrictEqual({
      status: "ok",
      rows: [reminderNulls, reminderFull],
    });
  });

  test("a network failure is offline", async () => {
    onTable("reminders", () => HttpResponse.error());
    await expect(
      remindersRepo(testClient()).listSince(SINCE),
    ).resolves.toStrictEqual({ status: "offline" });
  });
});

describe("reminders.insert (Block 3; AC-4's insert(patch, id))", () => {
  test("POSTs the id the client chose beside the snake_case columns - no stamps, no deleted_at - and returns the row mapped", async () => {
    const seen = onTable("reminders", () =>
      HttpResponse.json([reminderRowNulls], { status: 201 }),
    );
    const result = await remindersRepo(testClient()).insert(
      TEMPLATE,
      REMINDER_ID,
    );

    expect(seen.map((r) => r.method)).toStrictEqual(["POST"]);
    const [req] = seen;
    expect(req?.url.pathname).toBe("/rest/v1/reminders");
    expect(req?.url.searchParams.get("select")).toBe("*");
    expect(preferTokens(req?.prefer ?? null)).toContain(
      "return=representation",
    );
    expect(req?.body).toStrictEqual({
      id: REMINDER_ID,
      event_id: EVENT_ID,
      minutes_before: 30,
      sent_at: null,
      occurrence_date: null,
    });
    expect(result).toStrictEqual({ status: "ok", row: reminderNulls });
  });

  test("without an id the body carries no id key", async () => {
    const seen = onTable("reminders", () =>
      HttpResponse.json([reminderRowNulls], { status: 201 }),
    );
    await remindersRepo(testClient()).insert(TEMPLATE);
    expect(seen[0]?.body).toStrictEqual({
      event_id: EVENT_ID,
      minutes_before: 30,
      sent_at: null,
      occurrence_date: null,
    });
  });

  test("a second template for the event - the unique violation - is an error with http 409, not a conflict", async () => {
    onTable("reminders", () =>
      pgError(
        409,
        "23505",
        'duplicate key value violates unique constraint "reminders_event_occurrence_key"',
      ),
    );
    await expect(
      remindersRepo(testClient()).insert(TEMPLATE, REMINDER_ID),
    ).resolves.toStrictEqual({
      status: "error",
      code: "23505",
      message:
        'duplicate key value violates unique constraint "reminders_event_occurrence_key"',
      http: 409,
    });
  });
});

describe("reminders.get (Block 3; the drain's conflict path and discardOp)", () => {
  test("GETs the one reminder by id, select=*, with no deleted_at filter", async () => {
    const seen = onTable("reminders", () =>
      HttpResponse.json([reminderRowFull]),
    );
    await remindersRepo(testClient()).get(REMINDER_ID);
    expect(seen).toHaveLength(1);
    const [req] = seen;
    expect(req?.method).toBe("GET");
    expect(req?.url.pathname).toBe("/rest/v1/reminders");
    expect(req?.url.searchParams.get("id")).toBe(`eq.${REMINDER_ID}`);
    expect(req?.url.searchParams.get("select")).toBe("*");
    expect(req?.url.searchParams.has("deleted_at")).toBe(false);
  });

  test("one row is ok with the row mapped - a soft-deleted one included", async () => {
    onTable("reminders", () => HttpResponse.json([reminderRowFull]));
    await expect(
      remindersRepo(testClient()).get(REMINDER_ID),
    ).resolves.toStrictEqual({ status: "ok", row: reminderFull });
  });

  test("zero rows is a conflict (the reminder is gone)", async () => {
    onTable("reminders", () => HttpResponse.json([]));
    await expect(
      remindersRepo(testClient()).get(REMINDER_ID),
    ).resolves.toStrictEqual({ status: "conflict" });
  });
});

describe("reminders.update is conditional on the updated_at the client saw (Block 3)", () => {
  test("PATCHes filtered on both id and the exact expected updated_at, body = { minutes_before } only", async () => {
    const seen = onTable("reminders", () =>
      HttpResponse.json([reminderRowNulls]),
    );
    const result = await remindersRepo(testClient()).update(
      REMINDER_ID,
      { minutesBefore: 45 },
      UPDATED_AT,
    );

    expect(seen.map((r) => r.method)).toStrictEqual(["PATCH"]);
    const [req] = seen;
    expect(req?.url.pathname).toBe("/rest/v1/reminders");
    expect(req?.url.searchParams.get("id")).toBe(`eq.${REMINDER_ID}`);
    expect(req?.url.searchParams.get("updated_at")).toBe(`eq.${UPDATED_AT}`);
    expect(req?.url.searchParams.get("select")).toBe("*");
    expect(preferTokens(req?.prefer ?? null)).toContain(
      "return=representation",
    );
    expect(req?.body).toStrictEqual({ minutes_before: 45 });
    expect(result).toStrictEqual({ status: "ok", row: reminderNulls });
  });

  test("zero rows matched is a conflict, and does not throw", async () => {
    onTable("reminders", () => HttpResponse.json([]));
    await expect(
      remindersRepo(testClient()).update(
        REMINDER_ID,
        { minutesBefore: 45 },
        UPDATED_AT,
      ),
    ).resolves.toStrictEqual({ status: "conflict" });
  });

  test("a 403 is an error carrying the PostgREST code, message and http status", async () => {
    onTable("reminders", () =>
      pgError(403, "42501", "new row violates row-level security policy"),
    );
    await expect(
      remindersRepo(testClient()).update(
        REMINDER_ID,
        { minutesBefore: 45 },
        UPDATED_AT,
      ),
    ).resolves.toStrictEqual({
      status: "error",
      code: "42501",
      message: "new row violates row-level security policy",
      http: 403,
    });
  });
});

describe("reminders.remove is a soft delete (Block 3; AC-3's clear)", () => {
  test("issues a PATCH setting only deleted_at to now, on the id and the exact expected updated_at - never an HTTP DELETE", async () => {
    const seen = onTable("reminders", () =>
      HttpResponse.json([reminderRowFull]),
    );
    const before = Date.now();
    await remindersRepo(testClient()).remove(REMINDER_ID, UPDATED_AT);
    const after = Date.now();

    expect(seen.map((r) => r.method)).toStrictEqual(["PATCH"]);
    const [req] = seen;
    expect(req?.url.pathname).toBe("/rest/v1/reminders");
    expect(req?.url.searchParams.get("id")).toBe(`eq.${REMINDER_ID}`);
    expect(req?.url.searchParams.get("updated_at")).toBe(`eq.${UPDATED_AT}`);
    expect(req?.url.searchParams.get("select")).toBe("*");
    const body = req?.body as Record<string, unknown>;
    expect(Object.keys(body)).toStrictEqual(["deleted_at"]);
    expect(typeof body.deleted_at).toBe("string");
    const at = Date.parse(body.deleted_at as string);
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(after);
  });

  test("one row matched is ok with the soft-deleted row, mapped", async () => {
    onTable("reminders", () => HttpResponse.json([reminderRowFull]));
    await expect(
      remindersRepo(testClient()).remove(REMINDER_ID, UPDATED_AT),
    ).resolves.toStrictEqual({ status: "ok", row: reminderFull });
  });

  test("zero rows matched is a conflict, and does not throw", async () => {
    onTable("reminders", () => HttpResponse.json([]));
    await expect(
      remindersRepo(testClient()).remove(REMINDER_ID, UPDATED_AT),
    ).resolves.toStrictEqual({ status: "conflict" });
  });
});

describe("reminders.restore clears deleted_at (Block 3; AC-3's restore)", () => {
  test("issues a PATCH whose body is exactly { deleted_at: null }, filtered on the id and the exact expected updated_at", async () => {
    const seen = onTable("reminders", () =>
      HttpResponse.json([reminderRowNulls]),
    );
    await remindersRepo(testClient()).restore(REMINDER_ID, UPDATED_AT);

    expect(seen.map((r) => r.method)).toStrictEqual(["PATCH"]);
    const [req] = seen;
    expect(req?.url.pathname).toBe("/rest/v1/reminders");
    expect(req?.url.searchParams.get("id")).toBe(`eq.${REMINDER_ID}`);
    expect(req?.url.searchParams.get("updated_at")).toBe(`eq.${UPDATED_AT}`);
    expect(req?.url.searchParams.get("select")).toBe("*");
    expect(req?.body).toStrictEqual({ deleted_at: null });
  });

  test("one row matched is ok with the restored row, mapped", async () => {
    onTable("reminders", () => HttpResponse.json([reminderRowNulls]));
    await expect(
      remindersRepo(testClient()).restore(REMINDER_ID, UPDATED_AT),
    ).resolves.toStrictEqual({ status: "ok", row: reminderNulls });
  });

  test("zero rows matched - the token is stale - is a conflict", async () => {
    onTable("reminders", () => HttpResponse.json([]));
    await expect(
      remindersRepo(testClient()).restore(REMINDER_ID, UPDATED_AT),
    ).resolves.toStrictEqual({ status: "conflict" });
  });

  test("a network failure is offline", async () => {
    onTable("reminders", () => HttpResponse.error());
    await expect(
      remindersRepo(testClient()).restore(REMINDER_ID, UPDATED_AT),
    ).resolves.toStrictEqual({ status: "offline" });
  });
});
