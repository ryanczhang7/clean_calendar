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
