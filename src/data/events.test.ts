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
  CAPTURE_JOB_ID,
  EVENT_ID,
  eventFull,
  eventNulls,
  eventRowFull,
  eventRowNulls,
  KIND_ID,
  UPDATED_AT,
} from "../test/rows-fixtures";
import { eventsRepo } from "./events";

installServer();

const SINCE = "2026-10-13T18:00:00.000001+00:00";

describe("events.listLive", () => {
  test("requests only rows with deleted_at is null, ordered by starts_at ascending", async () => {
    const seen = onTable("events", () => HttpResponse.json([]));
    await eventsRepo(testClient()).listLive();

    expect(seen).toHaveLength(1);
    const [req] = seen;
    expect(req?.method).toBe("GET");
    expect(req?.url.pathname).toBe("/rest/v1/events");
    expect(req?.url.searchParams.get("deleted_at")).toBe("is.null");
    expect(req?.url.searchParams.get("order")).toBe("starts_at.asc");
    expect(req?.url.searchParams.get("select")).toBe("*");
  });

  test("returns the rows mapped to Event objects with Date event times", async () => {
    onTable("events", () => HttpResponse.json([eventRowNulls, eventRowFull]));
    const result = await eventsRepo(testClient()).listLive();
    expect(result).toStrictEqual({
      status: "ok",
      rows: [eventNulls, eventFull],
    });
    if (result.status !== "ok") return;
    expect(result.rows[0]?.startsAt).toBeInstanceOf(Date);
  });
});

describe("events.listSince (AC-3)", () => {
  test("requests rows with updated_at > since, ordered by updated_at, with no deleted_at filter", async () => {
    const seen = onTable("events", () => HttpResponse.json([]));
    await eventsRepo(testClient()).listSince(SINCE);

    expect(seen).toHaveLength(1);
    const [req] = seen;
    expect(req?.method).toBe("GET");
    expect(req?.url.pathname).toBe("/rest/v1/events");
    expect(req?.url.searchParams.get("updated_at")).toBe(`gt.${SINCE}`);
    expect(req?.url.searchParams.get("order")).toBe("updated_at.asc");
    expect(req?.url.searchParams.has("deleted_at")).toBe(false);
  });

  test("a soft-deleted event comes back so another device's deletion can be applied", async () => {
    onTable("events", () => HttpResponse.json([eventRowFull]));
    await expect(
      eventsRepo(testClient()).listSince(SINCE),
    ).resolves.toStrictEqual({ status: "ok", rows: [eventFull] });
  });
});

describe("events.insert", () => {
  const input = {
    title: "Quarterly review",
    kindId: KIND_ID,
    startsAt: new Date("2026-10-20T09:00:00Z"),
    endsAt: new Date("2026-10-20T10:30:00Z"),
    allDay: true,
    location: "Room 4",
    notes: "Bring the slides",
    recurrence: {
      freq: "weekly" as const,
      until: "2026-12-31",
      tz: "Europe/London",
    },
    origin: "capture" as const,
    captureJobId: CAPTURE_JOB_ID,
  };

  test("POSTs every non-bookkeeping column in snake_case, event times as ISO strings", async () => {
    const seen = onTable("events", () =>
      HttpResponse.json([eventRowFull], { status: 201 }),
    );
    await eventsRepo(testClient()).insert(input);

    expect(seen.map((r) => r.method)).toStrictEqual(["POST"]);
    const [req] = seen;
    expect(req?.url.pathname).toBe("/rest/v1/events");
    expect(req?.url.searchParams.get("select")).toBe("*");
    expect(preferTokens(req?.prefer ?? null)).toContain(
      "return=representation",
    );
    expect(req?.body).toStrictEqual({
      title: "Quarterly review",
      kind_id: KIND_ID,
      starts_at: "2026-10-20T09:00:00.000Z",
      ends_at: "2026-10-20T10:30:00.000Z",
      all_day: true,
      location: "Room 4",
      notes: "Bring the slides",
      recurrence: { freq: "weekly", until: "2026-12-31", tz: "Europe/London" },
      origin: "capture",
      capture_job_id: CAPTURE_JOB_ID,
    });
  });

  test("returns the inserted row mapped to an Event", async () => {
    onTable("events", () => HttpResponse.json([eventRowFull], { status: 201 }));
    await expect(eventsRepo(testClient()).insert(input)).resolves.toStrictEqual(
      { status: "ok", row: eventFull },
    );
  });
});

describe("events.update is conditional on the updated_at the client saw (AC-4)", () => {
  test("PATCHes filtered on both id and the exact expected updated_at, body = the mapped patch only", async () => {
    const seen = onTable("events", () => HttpResponse.json([eventRowFull]));
    await eventsRepo(testClient()).update(
      EVENT_ID,
      { title: "Moved", startsAt: new Date("2026-10-20T10:00:00Z") },
      UPDATED_AT,
    );

    expect(seen.map((r) => r.method)).toStrictEqual(["PATCH"]);
    const [req] = seen;
    expect(req?.url.pathname).toBe("/rest/v1/events");
    expect(req?.url.searchParams.get("id")).toBe(`eq.${EVENT_ID}`);
    expect(req?.url.searchParams.get("updated_at")).toBe(`eq.${UPDATED_AT}`);
    expect(req?.url.searchParams.get("select")).toBe("*");
    expect(preferTokens(req?.prefer ?? null)).toContain(
      "return=representation",
    );
    expect(req?.body).toStrictEqual({
      title: "Moved",
      starts_at: "2026-10-20T10:00:00.000Z",
    });
  });

  test("one row matched is ok with that row, mapped", async () => {
    onTable("events", () => HttpResponse.json([eventRowFull]));
    await expect(
      eventsRepo(testClient()).update(EVENT_ID, { title: "Moved" }, UPDATED_AT),
    ).resolves.toStrictEqual({ status: "ok", row: eventFull });
  });

  // The AC-4 negative control (owned by GATES) removes the updated_at filter
  // from events.update and expects THIS test, or the filter assertion above,
  // to go red.
  test("zero rows matched - another device changed it first - is a conflict, and does not throw", async () => {
    const seen = onTable("events", ({ url }) =>
      HttpResponse.json(
        url.searchParams.get("updated_at") === `eq.${UPDATED_AT}`
          ? []
          : [eventRowFull],
      ),
    );
    await expect(
      eventsRepo(testClient()).update(EVENT_ID, { title: "Moved" }, UPDATED_AT),
    ).resolves.toStrictEqual({ status: "conflict" });
    expect(seen).toHaveLength(1);
  });
});

describe("events.remove is a soft delete (AC-5)", () => {
  test("issues a PATCH setting only deleted_at to now - never an HTTP DELETE", async () => {
    const seen = onTable("events", () => HttpResponse.json([eventRowFull]));
    const before = Date.now();
    await eventsRepo(testClient()).remove(EVENT_ID, UPDATED_AT);
    const after = Date.now();

    expect(seen.map((r) => r.method)).toStrictEqual(["PATCH"]);
    const [req] = seen;
    expect(req?.url.pathname).toBe("/rest/v1/events");
    expect(req?.url.searchParams.get("id")).toBe(`eq.${EVENT_ID}`);
    expect(req?.url.searchParams.get("updated_at")).toBe(`eq.${UPDATED_AT}`);
    const body = req?.body as Record<string, unknown>;
    expect(Object.keys(body)).toStrictEqual(["deleted_at"]);
    expect(typeof body.deleted_at).toBe("string");
    const at = Date.parse(body.deleted_at as string);
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(after);
  });

  test("zero rows matched is a conflict, and does not throw", async () => {
    onTable("events", () => HttpResponse.json([]));
    await expect(
      eventsRepo(testClient()).remove(EVENT_ID, UPDATED_AT),
    ).resolves.toStrictEqual({ status: "conflict" });
  });

  test("one row matched is ok with the soft-deleted row", async () => {
    onTable("events", () => HttpResponse.json([eventRowFull]));
    await expect(
      eventsRepo(testClient()).remove(EVENT_ID, UPDATED_AT),
    ).resolves.toStrictEqual({ status: "ok", row: eventFull });
  });
});

describe("events failures resolve, never throw (AC-6)", () => {
  test("a 400 on insert is an error carrying the PostgREST code and message", async () => {
    onTable("events", () =>
      pgError(
        400,
        "23514",
        'new row violates check constraint "ends_after_start"',
      ),
    );
    await expect(
      eventsRepo(testClient()).insert({
        title: "x",
        kindId: KIND_ID,
        startsAt: new Date("2026-10-20T10:00:00Z"),
        endsAt: new Date("2026-10-20T09:00:00Z"),
        allDay: false,
        location: null,
        notes: null,
        recurrence: null,
        origin: "manual",
        captureJobId: null,
      }),
    ).resolves.toStrictEqual({
      status: "error",
      code: "23514",
      message: 'new row violates check constraint "ends_after_start"',
      http: 400,
    });
  });

  test("a 401 on listSince is an error carrying the PostgREST code", async () => {
    onTable("events", () => pgError(401, "PGRST301", "JWT expired"));
    await expect(
      eventsRepo(testClient()).listSince(SINCE),
    ).resolves.toStrictEqual({
      status: "error",
      code: "PGRST301",
      message: "JWT expired",
      http: 401,
    });
  });

  test("a network failure on listSince is offline", async () => {
    onTable("events", () => HttpResponse.error());
    await expect(
      eventsRepo(testClient()).listSince(SINCE),
    ).resolves.toStrictEqual({ status: "offline" });
  });

  test("a network failure on update is offline", async () => {
    onTable("events", () => HttpResponse.error());
    await expect(
      eventsRepo(testClient()).update(EVENT_ID, { title: "x" }, UPDATED_AT),
    ).resolves.toStrictEqual({ status: "offline" });
  });
});

// CAL-013 Contract, Block 2: restore is the mirror of remove - the undo of a
// delete is a patch of deleted_at = null (components.md, Undo toast for
// delete), conditional on the token the delete returned.
describe("events.restore clears deleted_at (CAL-013 AC-5, Block 2)", () => {
  test("issues a PATCH whose body is exactly { deleted_at: null }, filtered on the id and the exact expected updated_at", async () => {
    const seen = onTable("events", () => HttpResponse.json([eventRowFull]));
    await eventsRepo(testClient()).restore(EVENT_ID, UPDATED_AT);

    expect(seen.map((r) => r.method)).toStrictEqual(["PATCH"]);
    const [req] = seen;
    expect(req?.url.pathname).toBe("/rest/v1/events");
    expect(req?.url.searchParams.get("id")).toBe(`eq.${EVENT_ID}`);
    expect(req?.url.searchParams.get("updated_at")).toBe(`eq.${UPDATED_AT}`);
    expect(req?.url.searchParams.get("select")).toBe("*");
    expect(preferTokens(req?.prefer ?? null)).toContain(
      "return=representation",
    );
    expect(req?.body).toStrictEqual({ deleted_at: null });
  });

  test("one row matched is ok with the restored row, mapped", async () => {
    onTable("events", () => HttpResponse.json([eventRowFull]));
    await expect(
      eventsRepo(testClient()).restore(EVENT_ID, UPDATED_AT),
    ).resolves.toStrictEqual({ status: "ok", row: eventFull });
  });

  test("zero rows matched - the token is stale - is a conflict, and does not throw", async () => {
    onTable("events", () => HttpResponse.json([]));
    await expect(
      eventsRepo(testClient()).restore(EVENT_ID, UPDATED_AT),
    ).resolves.toStrictEqual({ status: "conflict" });
  });

  test("a network failure is offline", async () => {
    onTable("events", () => HttpResponse.error());
    await expect(
      eventsRepo(testClient()).restore(EVENT_ID, UPDATED_AT),
    ).resolves.toStrictEqual({ status: "offline" });
  });
});

// CAL-015 Contract, Block 8 (PO decision 2) and Block 1 (PO decision 4): the
// client names a new row, `get` re-fetches one row for the drain's conflict
// path, and a failure carries the HTTP status so the drain can tell a 4xx
// (failed) from a 5xx (retried).
describe("events.insert with a client id (CAL-015 Block 8)", () => {
  const input = {
    title: "Swim",
    kindId: KIND_ID,
    startsAt: new Date("2026-10-22T07:00:00Z"),
    endsAt: new Date("2026-10-22T08:00:00Z"),
    allDay: false,
    location: null,
    notes: null,
    recurrence: null,
    origin: "manual" as const,
    captureJobId: null,
  };

  test("POSTs the id the client chose beside the mapped columns", async () => {
    const seen = onTable("events", () =>
      HttpResponse.json([eventRowFull], { status: 201 }),
    );
    await eventsRepo(testClient()).insert(input, EVENT_ID);
    expect(seen.map((r) => r.method)).toStrictEqual(["POST"]);
    expect(seen[0]?.body).toStrictEqual({
      id: EVENT_ID,
      title: "Swim",
      kind_id: KIND_ID,
      starts_at: "2026-10-22T07:00:00.000Z",
      ends_at: "2026-10-22T08:00:00.000Z",
      all_day: false,
      location: null,
      notes: null,
      recurrence: null,
      origin: "manual",
      capture_job_id: null,
    });
  });

  test("without an id the body carries no id key", async () => {
    const seen = onTable("events", () =>
      HttpResponse.json([eventRowFull], { status: 201 }),
    );
    await eventsRepo(testClient()).insert(input);
    expect(Object.keys(seen[0]?.body as object)).not.toContain("id");
  });
});

describe("events.get (CAL-015 Block 8)", () => {
  test("GETs the one row by id, select=*, with no deleted_at filter", async () => {
    const seen = onTable("events", () => HttpResponse.json([eventRowFull]));
    await eventsRepo(testClient()).get(EVENT_ID);
    expect(seen).toHaveLength(1);
    const [req] = seen;
    expect(req?.method).toBe("GET");
    expect(req?.url.pathname).toBe("/rest/v1/events");
    expect(req?.url.searchParams.get("id")).toBe(`eq.${EVENT_ID}`);
    expect(req?.url.searchParams.get("select")).toBe("*");
    expect(req?.url.searchParams.has("deleted_at")).toBe(false);
  });

  test("one row is ok with the row mapped - a soft-deleted one included", async () => {
    onTable("events", () => HttpResponse.json([eventRowFull]));
    await expect(eventsRepo(testClient()).get(EVENT_ID)).resolves.toStrictEqual(
      { status: "ok", row: eventFull },
    );
  });

  test("zero rows is a conflict (the row is gone)", async () => {
    onTable("events", () => HttpResponse.json([]));
    await expect(eventsRepo(testClient()).get(EVENT_ID)).resolves.toStrictEqual(
      { status: "conflict" },
    );
  });

  test("a network failure is offline", async () => {
    onTable("events", () => HttpResponse.error());
    await expect(eventsRepo(testClient()).get(EVENT_ID)).resolves.toStrictEqual(
      { status: "offline" },
    );
  });
});

describe("events failures carry the HTTP status (CAL-015 Block 1, PO decision 4)", () => {
  test.each([400, 404, 422, 500, 503])(
    "a %i on update is an error with http set to it",
    async (status) => {
      onTable("events", () => pgError(status, "XX000", "refused"));
      await expect(
        eventsRepo(testClient()).update(EVENT_ID, { title: "x" }, UPDATED_AT),
      ).resolves.toStrictEqual({
        status: "error",
        code: "XX000",
        message: "refused",
        http: status,
      });
    },
  );

  test("a 404 on get is an error with http 404", async () => {
    onTable("events", () => pgError(404, "PGRST205", "not found"));
    await expect(eventsRepo(testClient()).get(EVENT_ID)).resolves.toStrictEqual(
      {
        status: "error",
        code: "PGRST205",
        message: "not found",
        http: 404,
      },
    );
  });
});
