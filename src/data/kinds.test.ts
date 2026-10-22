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
  KIND_ID,
  kindFull,
  kindNulls,
  kindRowFull,
  kindRowNulls,
  UPDATED_AT,
} from "../test/rows-fixtures";
import { kindsRepo } from "./kinds";

installServer();

const SINCE = "2026-10-13T18:00:00.000001+00:00";

describe("kinds.listLive (AC-2)", () => {
  test("requests only rows with deleted_at is null, ordered by sort_order ascending", async () => {
    const seen = onTable("kinds", () =>
      HttpResponse.json([kindRowNulls, kindRowFull]),
    );
    await kindsRepo(testClient()).listLive();

    expect(seen).toHaveLength(1);
    const [req] = seen;
    expect(req?.method).toBe("GET");
    expect(req?.url.pathname).toBe("/rest/v1/kinds");
    expect(req?.url.searchParams.get("deleted_at")).toBe("is.null");
    expect(req?.url.searchParams.getAll("deleted_at")).toHaveLength(1);
    expect(req?.url.searchParams.get("order")).toBe("sort_order.asc");
    expect(req?.url.searchParams.get("select")).toBe("*");
  });

  test("returns the rows mapped to Kind objects, in the server's order", async () => {
    onTable("kinds", () => HttpResponse.json([kindRowNulls, kindRowFull]));
    await expect(kindsRepo(testClient()).listLive()).resolves.toStrictEqual({
      status: "ok",
      rows: [kindNulls, kindFull],
    });
  });

  test("an empty table is ok with no rows", async () => {
    onTable("kinds", () => HttpResponse.json([]));
    await expect(kindsRepo(testClient()).listLive()).resolves.toStrictEqual({
      status: "ok",
      rows: [],
    });
  });
});

describe("kinds.listSince (AC-3)", () => {
  test("requests rows with updated_at > since, the exact server string, ordered by updated_at", async () => {
    const seen = onTable("kinds", () => HttpResponse.json([]));
    await kindsRepo(testClient()).listSince(SINCE);

    expect(seen).toHaveLength(1);
    const [req] = seen;
    expect(req?.method).toBe("GET");
    expect(req?.url.pathname).toBe("/rest/v1/kinds");
    expect(req?.url.searchParams.get("updated_at")).toBe(`gt.${SINCE}`);
    expect(req?.url.searchParams.get("order")).toBe("updated_at.asc");
    expect(req?.url.searchParams.get("select")).toBe("*");
  });

  test("does not filter out soft-deleted rows: no deleted_at parameter at all", async () => {
    const seen = onTable("kinds", () => HttpResponse.json([]));
    await kindsRepo(testClient()).listSince(SINCE);
    expect(seen[0]?.url.searchParams.has("deleted_at")).toBe(false);
  });

  test("a soft-deleted row comes back with its deletedAt stamp", async () => {
    onTable("kinds", () => HttpResponse.json([kindRowFull]));
    await expect(
      kindsRepo(testClient()).listSince(SINCE),
    ).resolves.toStrictEqual({ status: "ok", rows: [kindFull] });
  });
});

describe("kinds.insert", () => {
  const input = {
    name: "Work",
    colorLight: "#1a73e8",
    colorDark: "#8ab4f8",
    sortOrder: 3,
    isDefault: true,
  };

  test("POSTs the snake_case columns only - no id, no stamps - asking for the row back", async () => {
    const seen = onTable("kinds", () =>
      HttpResponse.json([kindRowFull], { status: 201 }),
    );
    await kindsRepo(testClient()).insert(input);

    expect(seen.map((r) => r.method)).toStrictEqual(["POST"]);
    const [req] = seen;
    expect(req?.url.pathname).toBe("/rest/v1/kinds");
    expect(req?.url.searchParams.get("select")).toBe("*");
    expect(preferTokens(req?.prefer ?? null)).toContain(
      "return=representation",
    );
    expect(req?.body).toStrictEqual({
      name: "Work",
      color_light: "#1a73e8",
      color_dark: "#8ab4f8",
      sort_order: 3,
      is_default: true,
    });
  });

  test("returns the inserted row mapped to a Kind", async () => {
    onTable("kinds", () => HttpResponse.json([kindRowFull], { status: 201 }));
    await expect(kindsRepo(testClient()).insert(input)).resolves.toStrictEqual({
      status: "ok",
      row: kindFull,
    });
  });
});

describe("kinds.update is conditional on the updated_at the client saw (AC-4)", () => {
  test("PATCHes filtered on both id and the exact expected updated_at, body = the mapped patch only", async () => {
    const seen = onTable("kinds", () => HttpResponse.json([kindRowFull]));
    await kindsRepo(testClient()).update(
      KIND_ID,
      { name: "Renamed", colorDark: "#111111" },
      UPDATED_AT,
    );

    expect(seen.map((r) => r.method)).toStrictEqual(["PATCH"]);
    const [req] = seen;
    expect(req?.url.pathname).toBe("/rest/v1/kinds");
    expect(req?.url.searchParams.get("id")).toBe(`eq.${KIND_ID}`);
    expect(req?.url.searchParams.get("updated_at")).toBe(`eq.${UPDATED_AT}`);
    expect(req?.url.searchParams.get("select")).toBe("*");
    expect(preferTokens(req?.prefer ?? null)).toContain(
      "return=representation",
    );
    expect(req?.body).toStrictEqual({
      name: "Renamed",
      color_dark: "#111111",
    });
  });

  test("one row matched is ok with that row, mapped", async () => {
    onTable("kinds", () => HttpResponse.json([kindRowFull]));
    await expect(
      kindsRepo(testClient()).update(KIND_ID, { name: "Work" }, UPDATED_AT),
    ).resolves.toStrictEqual({ status: "ok", row: kindFull });
  });

  test("zero rows matched is a conflict, and does not throw", async () => {
    onTable("kinds", () => HttpResponse.json([]));
    await expect(
      kindsRepo(testClient()).update(KIND_ID, { name: "Work" }, UPDATED_AT),
    ).resolves.toStrictEqual({ status: "conflict" });
  });
});

describe("kinds.remove is a soft delete (AC-5)", () => {
  test("issues a PATCH setting only deleted_at to now - never an HTTP DELETE", async () => {
    const seen = onTable("kinds", () => HttpResponse.json([kindRowFull]));
    const before = Date.now();
    await kindsRepo(testClient()).remove(KIND_ID, UPDATED_AT);
    const after = Date.now();

    expect(seen.map((r) => r.method)).toStrictEqual(["PATCH"]);
    const [req] = seen;
    expect(req?.url.pathname).toBe("/rest/v1/kinds");
    expect(req?.url.searchParams.get("id")).toBe(`eq.${KIND_ID}`);
    expect(req?.url.searchParams.get("updated_at")).toBe(`eq.${UPDATED_AT}`);
    const body = req?.body as Record<string, unknown>;
    expect(Object.keys(body)).toStrictEqual(["deleted_at"]);
    expect(typeof body.deleted_at).toBe("string");
    const at = Date.parse(body.deleted_at as string);
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(after);
  });

  test("one row matched is ok with the soft-deleted row", async () => {
    onTable("kinds", () => HttpResponse.json([kindRowFull]));
    await expect(
      kindsRepo(testClient()).remove(KIND_ID, UPDATED_AT),
    ).resolves.toStrictEqual({ status: "ok", row: kindFull });
  });

  test("zero rows matched is a conflict, and does not throw", async () => {
    onTable("kinds", () => HttpResponse.json([]));
    await expect(
      kindsRepo(testClient()).remove(KIND_ID, UPDATED_AT),
    ).resolves.toStrictEqual({ status: "conflict" });
  });
});

describe("kinds failures resolve, never throw (AC-6)", () => {
  test("a 403 on listLive is an error carrying the PostgREST code and message", async () => {
    onTable("kinds", () =>
      pgError(403, "42501", 'permission denied for table "kinds"'),
    );
    await expect(kindsRepo(testClient()).listLive()).resolves.toStrictEqual({
      status: "error",
      code: "42501",
      message: 'permission denied for table "kinds"',
      http: 403,
    });
  });

  test("a 409 on update is an error, not a conflict", async () => {
    onTable("kinds", () =>
      pgError(409, "23505", "duplicate key value violates unique constraint"),
    );
    await expect(
      kindsRepo(testClient()).update(KIND_ID, { name: "Work" }, UPDATED_AT),
    ).resolves.toStrictEqual({
      status: "error",
      code: "23505",
      message: "duplicate key value violates unique constraint",
      http: 409,
    });
  });

  test("a network failure on listLive is offline", async () => {
    onTable("kinds", () => HttpResponse.error());
    await expect(kindsRepo(testClient()).listLive()).resolves.toStrictEqual({
      status: "offline",
    });
  });

  test("a network failure on remove is offline", async () => {
    onTable("kinds", () => HttpResponse.error());
    await expect(
      kindsRepo(testClient()).remove(KIND_ID, UPDATED_AT),
    ).resolves.toStrictEqual({ status: "offline" });
  });
});

// CAL-006 Contract, Block 3: the two members the seed needs.

describe("kinds.listAll (CAL-006 AC-4: soft-deleted rows count)", () => {
  test("GETs every row ordered by sort_order ascending, with no deleted_at filter at all", async () => {
    const seen = onTable("kinds", () => HttpResponse.json([]));
    await kindsRepo(testClient()).listAll();

    expect(seen).toHaveLength(1);
    const [req] = seen;
    expect(req?.method).toBe("GET");
    expect(req?.url.pathname).toBe("/rest/v1/kinds");
    expect(req?.url.searchParams.get("select")).toBe("*");
    expect(req?.url.searchParams.get("order")).toBe("sort_order.asc");
    expect(req?.url.searchParams.has("deleted_at")).toBe(false);
    expect([...(req?.url.searchParams.keys() ?? [])].sort()).toStrictEqual([
      "order",
      "select",
    ]);
  });

  test("returns live and soft-deleted rows mapped to Kind objects, in the server's order", async () => {
    onTable("kinds", () => HttpResponse.json([kindRowNulls, kindRowFull]));
    await expect(kindsRepo(testClient()).listAll()).resolves.toStrictEqual({
      status: "ok",
      rows: [kindNulls, kindFull],
    });
  });

  test("an empty table is ok with no rows", async () => {
    onTable("kinds", () => HttpResponse.json([]));
    await expect(kindsRepo(testClient()).listAll()).resolves.toStrictEqual({
      status: "ok",
      rows: [],
    });
  });

  test("a network failure is offline", async () => {
    onTable("kinds", () => HttpResponse.error());
    await expect(kindsRepo(testClient()).listAll()).resolves.toStrictEqual({
      status: "offline",
    });
  });
});

describe("kinds.insertMany (CAL-006 AC-3, AC-5: one atomic statement)", () => {
  const inputs = [
    {
      name: "Movies",
      colorLight: "#7E3FB8",
      colorDark: "#CFA8F0",
      sortOrder: 1,
      isDefault: true,
    },
    {
      name: "Entertainment",
      colorLight: "#BD8200",
      colorDark: "#F5CC6A",
      sortOrder: 2,
      isDefault: false,
    },
  ];

  const rowMovies = {
    id: "0b6f7c1e-3d0a-4c55-9a51-6a2f6f0e9a11",
    name: "Movies",
    color_light: "#7E3FB8",
    color_dark: "#CFA8F0",
    sort_order: 1,
    is_default: true,
    deleted_at: null,
    created_at: "2026-10-16T08:00:00.000001+00:00",
    updated_at: "2026-10-16T08:00:00.000002+00:00",
  };
  const rowEntertainment = {
    id: "0b6f7c1e-3d0a-4c55-9a51-6a2f6f0e9a12",
    name: "Entertainment",
    color_light: "#BD8200",
    color_dark: "#F5CC6A",
    sort_order: 2,
    is_default: false,
    deleted_at: null,
    created_at: "2026-10-16T08:00:00.000003+00:00",
    updated_at: "2026-10-16T08:00:00.000004+00:00",
  };
  const kindMovies = {
    id: "0b6f7c1e-3d0a-4c55-9a51-6a2f6f0e9a11",
    name: "Movies",
    colorLight: "#7E3FB8",
    colorDark: "#CFA8F0",
    sortOrder: 1,
    isDefault: true,
    deletedAt: null,
    createdAt: "2026-10-16T08:00:00.000001+00:00",
    updatedAt: "2026-10-16T08:00:00.000002+00:00",
  };
  const kindEntertainment = {
    id: "0b6f7c1e-3d0a-4c55-9a51-6a2f6f0e9a12",
    name: "Entertainment",
    colorLight: "#BD8200",
    colorDark: "#F5CC6A",
    sortOrder: 2,
    isDefault: false,
    deletedAt: null,
    createdAt: "2026-10-16T08:00:00.000003+00:00",
    updatedAt: "2026-10-16T08:00:00.000004+00:00",
  };

  test("sends ONE POST whose body is the array of snake_case rows, in order, asking for the rows back", async () => {
    const seen = onTable("kinds", () =>
      HttpResponse.json([rowMovies, rowEntertainment], { status: 201 }),
    );
    await kindsRepo(testClient()).insertMany(inputs);

    expect(seen.map((r) => r.method)).toStrictEqual(["POST"]);
    const [req] = seen;
    expect(req?.url.pathname).toBe("/rest/v1/kinds");
    expect(req?.url.searchParams.get("select")).toBe("*");
    expect(preferTokens(req?.prefer ?? null)).toContain(
      "return=representation",
    );
    expect(req?.body).toStrictEqual([
      {
        name: "Movies",
        color_light: "#7E3FB8",
        color_dark: "#CFA8F0",
        sort_order: 1,
        is_default: true,
      },
      {
        name: "Entertainment",
        color_light: "#BD8200",
        color_dark: "#F5CC6A",
        sort_order: 2,
        is_default: false,
      },
    ]);
  });

  test("returns every inserted row mapped to a Kind, in the server's order", async () => {
    onTable("kinds", () =>
      HttpResponse.json([rowEntertainment, rowMovies], { status: 201 }),
    );
    await expect(
      kindsRepo(testClient()).insertMany(inputs),
    ).resolves.toStrictEqual({
      status: "ok",
      rows: [kindEntertainment, kindMovies],
    });
  });

  test("a 23505 from the unique live-name index is an error carrying the code, and nothing retries", async () => {
    const seen = onTable("kinds", () =>
      pgError(
        409,
        "23505",
        'duplicate key value violates unique constraint "kinds_live_name_key"',
      ),
    );
    await expect(
      kindsRepo(testClient()).insertMany(inputs),
    ).resolves.toStrictEqual({
      status: "error",
      code: "23505",
      message:
        'duplicate key value violates unique constraint "kinds_live_name_key"',
      http: 409,
    });
    expect(seen).toHaveLength(1);
  });

  test("a network failure is offline, in one request", async () => {
    const seen = onTable("kinds", () => HttpResponse.error());
    await expect(
      kindsRepo(testClient()).insertMany(inputs),
    ).resolves.toStrictEqual({ status: "offline" });
    expect(seen).toHaveLength(1);
  });
});

// CAL-015 Contract, Block 8 (PO decision 2) and Block 1 (PO decision 4).
describe("kinds.insert with a client id (CAL-015 Block 8)", () => {
  const input = {
    name: "Work",
    colorLight: "#1a73e8",
    colorDark: "#8ab4f8",
    sortOrder: 3,
    isDefault: false,
  };

  test("POSTs the id the client chose beside the mapped columns", async () => {
    const seen = onTable("kinds", () =>
      HttpResponse.json([kindRowFull], { status: 201 }),
    );
    await kindsRepo(testClient()).insert(input, KIND_ID);
    expect(seen[0]?.body).toStrictEqual({
      id: KIND_ID,
      name: "Work",
      color_light: "#1a73e8",
      color_dark: "#8ab4f8",
      sort_order: 3,
      is_default: false,
    });
  });
});

describe("kinds.get (CAL-015 Block 8)", () => {
  test("GETs the one row by id, select=*, with no deleted_at filter, and maps it", async () => {
    const seen = onTable("kinds", () => HttpResponse.json([kindRowFull]));
    await expect(kindsRepo(testClient()).get(KIND_ID)).resolves.toStrictEqual({
      status: "ok",
      row: kindFull,
    });
    const [req] = seen;
    expect(req?.method).toBe("GET");
    expect(req?.url.searchParams.get("id")).toBe(`eq.${KIND_ID}`);
    expect(req?.url.searchParams.get("select")).toBe("*");
    expect(req?.url.searchParams.has("deleted_at")).toBe(false);
  });

  test("zero rows is a conflict; a network failure is offline", async () => {
    onTable("kinds", () => HttpResponse.json([]));
    await expect(kindsRepo(testClient()).get(KIND_ID)).resolves.toStrictEqual({
      status: "conflict",
    });
    onTable("kinds", () => HttpResponse.error());
    await expect(kindsRepo(testClient()).get(KIND_ID)).resolves.toStrictEqual({
      status: "offline",
    });
  });
});

describe("kinds failures carry the HTTP status (CAL-015 Block 1, PO decision 4)", () => {
  test.each([400, 409, 500])(
    "a %i on remove is an error with http set to it",
    async (status) => {
      onTable("kinds", () => pgError(status, "XX000", "refused"));
      await expect(
        kindsRepo(testClient()).remove(KIND_ID, UPDATED_AT),
      ).resolves.toStrictEqual({
        status: "error",
        code: "XX000",
        message: "refused",
        http: status,
      });
    },
  );
});
