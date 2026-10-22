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
  EVENT_ID,
  KIND_ID_2,
  OVERRIDE_ID,
  overrideFull,
  overrideNulls,
  overrideRowFull,
  overrideRowNulls,
  UPDATED_AT,
} from "../test/rows-fixtures";
import { eventOverridesRepo } from "./eventOverrides";

installServer();

const SINCE = "2026-10-13T18:00:00.000001+00:00";

describe("eventOverrides.listLive", () => {
  test("requests every override ordered by occurrence_date ascending, with no deleted_at filter", async () => {
    const seen = onTable("event_overrides", () => HttpResponse.json([]));
    await eventOverridesRepo(testClient()).listLive();

    expect(seen).toHaveLength(1);
    const [req] = seen;
    expect(req?.method).toBe("GET");
    expect(req?.url.pathname).toBe("/rest/v1/event_overrides");
    expect(req?.url.searchParams.get("order")).toBe("occurrence_date.asc");
    expect(req?.url.searchParams.get("select")).toBe("*");
    expect(req?.url.searchParams.has("deleted_at")).toBe(false);
  });

  test("returns the rows mapped to EventOverride objects", async () => {
    onTable("event_overrides", () =>
      HttpResponse.json([overrideRowFull, overrideRowNulls]),
    );
    await expect(
      eventOverridesRepo(testClient()).listLive(),
    ).resolves.toStrictEqual({
      status: "ok",
      rows: [overrideFull, overrideNulls],
    });
  });
});

describe("eventOverrides.listSince (AC-3)", () => {
  test("requests rows with updated_at > since, ordered by updated_at, with no deleted_at filter", async () => {
    const seen = onTable("event_overrides", () =>
      HttpResponse.json([overrideRowNulls]),
    );
    const result = await eventOverridesRepo(testClient()).listSince(SINCE);

    expect(seen).toHaveLength(1);
    const [req] = seen;
    expect(req?.method).toBe("GET");
    expect(req?.url.pathname).toBe("/rest/v1/event_overrides");
    expect(req?.url.searchParams.get("updated_at")).toBe(`gt.${SINCE}`);
    expect(req?.url.searchParams.get("order")).toBe("updated_at.asc");
    expect(req?.url.searchParams.has("deleted_at")).toBe(false);
    expect(result).toStrictEqual({ status: "ok", rows: [overrideNulls] });
  });
});

describe("eventOverrides.insert", () => {
  test("POSTs the snake_case columns only - no id, no stamps - occurrence_date as given", async () => {
    const seen = onTable("event_overrides", () =>
      HttpResponse.json([overrideRowFull], { status: 201 }),
    );
    const result = await eventOverridesRepo(testClient()).insert({
      eventId: EVENT_ID,
      occurrenceDate: "2026-10-27",
      cancelled: true,
      title: "Quarterly review (moved)",
      kindId: KIND_ID_2,
      startsAt: new Date("2026-10-27T13:00:00Z"),
      endsAt: new Date("2026-10-27T14:30:00Z"),
      allDay: true,
      location: "Room 9",
      notes: "Moved after lunch",
    });

    expect(seen.map((r) => r.method)).toStrictEqual(["POST"]);
    const [req] = seen;
    expect(req?.url.pathname).toBe("/rest/v1/event_overrides");
    expect(req?.url.searchParams.get("select")).toBe("*");
    expect(preferTokens(req?.prefer ?? null)).toContain(
      "return=representation",
    );
    expect(req?.body).toStrictEqual({
      event_id: EVENT_ID,
      occurrence_date: "2026-10-27",
      cancelled: true,
      title: "Quarterly review (moved)",
      kind_id: KIND_ID_2,
      starts_at: "2026-10-27T13:00:00.000Z",
      ends_at: "2026-10-27T14:30:00.000Z",
      all_day: true,
      location: "Room 9",
      notes: "Moved after lunch",
    });
    expect(result).toStrictEqual({ status: "ok", row: overrideFull });
  });

  test("null override times are sent as null, not as a date", async () => {
    const seen = onTable("event_overrides", () =>
      HttpResponse.json([overrideRowNulls], { status: 201 }),
    );
    await eventOverridesRepo(testClient()).insert({
      eventId: EVENT_ID,
      occurrenceDate: "2026-11-03",
      cancelled: false,
      title: null,
      kindId: null,
      startsAt: null,
      endsAt: null,
      allDay: null,
      location: null,
      notes: null,
    });
    expect(seen[0]?.body).toStrictEqual({
      event_id: EVENT_ID,
      occurrence_date: "2026-11-03",
      cancelled: false,
      title: null,
      kind_id: null,
      starts_at: null,
      ends_at: null,
      all_day: null,
      location: null,
      notes: null,
    });
  });
});

describe("eventOverrides.update is conditional on the updated_at the client saw (AC-4)", () => {
  test("PATCHes filtered on both id and the exact expected updated_at, body = the mapped patch only", async () => {
    const seen = onTable("event_overrides", () =>
      HttpResponse.json([overrideRowFull]),
    );
    const result = await eventOverridesRepo(testClient()).update(
      OVERRIDE_ID,
      { cancelled: true },
      UPDATED_AT,
    );

    expect(seen.map((r) => r.method)).toStrictEqual(["PATCH"]);
    const [req] = seen;
    expect(req?.url.pathname).toBe("/rest/v1/event_overrides");
    expect(req?.url.searchParams.get("id")).toBe(`eq.${OVERRIDE_ID}`);
    expect(req?.url.searchParams.get("updated_at")).toBe(`eq.${UPDATED_AT}`);
    expect(req?.url.searchParams.get("select")).toBe("*");
    expect(preferTokens(req?.prefer ?? null)).toContain(
      "return=representation",
    );
    expect(req?.body).toStrictEqual({ cancelled: true });
    expect(result).toStrictEqual({ status: "ok", row: overrideFull });
  });

  test("zero rows matched is a conflict, and does not throw", async () => {
    onTable("event_overrides", () => HttpResponse.json([]));
    await expect(
      eventOverridesRepo(testClient()).update(
        OVERRIDE_ID,
        { cancelled: true },
        UPDATED_AT,
      ),
    ).resolves.toStrictEqual({ status: "conflict" });
  });
});

describe("eventOverrides has no soft delete (AC-5 scope)", () => {
  test("the repository offers no remove: an override has no deleted_at to set", () => {
    const repo = eventOverridesRepo(testClient());
    expect("remove" in repo).toBe(false);
    expect(typeof repo.listLive).toBe("function");
    expect(typeof repo.listSince).toBe("function");
    expect(typeof repo.insert).toBe("function");
    expect(typeof repo.update).toBe("function");
  });
});

describe("eventOverrides failures resolve, never throw (AC-6)", () => {
  test("a 403 on update is an error carrying the PostgREST code and message", async () => {
    onTable("event_overrides", () =>
      pgError(403, "42501", "new row violates row-level security policy"),
    );
    await expect(
      eventOverridesRepo(testClient()).update(
        OVERRIDE_ID,
        { cancelled: true },
        UPDATED_AT,
      ),
    ).resolves.toStrictEqual({
      status: "error",
      code: "42501",
      message: "new row violates row-level security policy",
      http: 403,
    });
  });

  test("a network failure on listLive is offline", async () => {
    onTable("event_overrides", () => HttpResponse.error());
    await expect(
      eventOverridesRepo(testClient()).listLive(),
    ).resolves.toStrictEqual({ status: "offline" });
  });

  test("a network failure on insert is offline", async () => {
    onTable("event_overrides", () => HttpResponse.error());
    await expect(
      eventOverridesRepo(testClient()).insert({
        eventId: EVENT_ID,
        occurrenceDate: "2026-11-03",
        cancelled: true,
        title: null,
        kindId: null,
        startsAt: null,
        endsAt: null,
        allDay: null,
        location: null,
        notes: null,
      }),
    ).resolves.toStrictEqual({ status: "offline" });
  });
});
