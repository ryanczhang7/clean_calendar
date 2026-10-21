import { HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installServer, onTable, type Recorded } from "../test/msw";
import {
  eventFull,
  eventRowFull,
  kindFull,
  kindNulls,
  kindRowFull,
  kindRowNulls,
  overrideFull,
  overrideRowFull,
} from "../test/rows-fixtures";
import { db } from "./db";
import { EPOCH } from "./hydrate";
import { appSync, startSync } from "./startSync";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-014 AC-1, Contract Block 3: the app's sync, over the real repositories
// on the (mocked) app client and the app's `db`. Every request is a real
// PostgREST fetch that MSW answers; an unanswered one fails the test. The
// app's db lives on the global fake-indexeddb that src/test/setup.ts
// installs, so every table is cleared before each case.

installServer();

let seen: { kinds: Recorded[]; events: Recorded[]; overrides: Recorded[] };

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  seen = {
    kinds: onTable("kinds", () =>
      HttpResponse.json([kindRowNulls, kindRowFull]),
    ),
    events: onTable("events", () => HttpResponse.json([eventRowFull])),
    overrides: onTable("event_overrides", () =>
      HttpResponse.json([overrideRowFull]),
    ),
  };
});

const since = (r: Recorded[]) =>
  r.map((req) => [req.method, req.url.searchParams.get("updated_at")]);

describe("startSync() - sync starts after sign-in (AC-1, Block 3)", () => {
  it("over an empty cache, GETs kinds, events and event_overrides once each with updated_at=gt.EPOCH, and resolves ok", async () => {
    await expect(startSync()).resolves.toStrictEqual({ status: "ok" });
    expect(since(seen.kinds)).toStrictEqual([["GET", `gt.${EPOCH}`]]);
    expect(since(seen.events)).toStrictEqual([["GET", `gt.${EPOCH}`]]);
    expect(since(seen.overrides)).toStrictEqual([["GET", `gt.${EPOCH}`]]);
  });

  it("writes the server's rows, live and soft-deleted, into the app's db as domain objects, with each table's mark", async () => {
    await startSync();
    const kinds = await db.kinds.toArray();
    expect(kinds.sort((a, b) => a.id.localeCompare(b.id))).toStrictEqual(
      [kindFull, kindNulls].sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(await db.events.toArray()).toStrictEqual([eventFull]);
    expect(await db.overrides.toArray()).toStrictEqual([overrideFull]);
    expect(await db.meta.get("mark:kinds")).toStrictEqual({
      key: "mark:kinds",
      value: kindRowFull.updated_at,
    });
    expect((await db.meta.get("mark:events"))?.value).toBe(
      eventRowFull.updated_at,
    );
    expect((await db.meta.get("mark:overrides"))?.value).toBe(
      overrideRowFull.updated_at,
    );
  });

  it("a second startSync() sends each table's stored mark, byte for byte", async () => {
    await startSync();
    await startSync();
    expect(since(seen.kinds)[1]).toStrictEqual([
      "GET",
      `gt.${kindRowFull.updated_at}`,
    ]);
    expect(since(seen.events)[1]).toStrictEqual([
      "GET",
      `gt.${eventRowFull.updated_at}`,
    ]);
    expect(since(seen.overrides)[1]).toStrictEqual([
      "GET",
      `gt.${overrideRowFull.updated_at}`,
    ]);
  });

  it("two concurrent startSync() calls share one pass: one request per table", async () => {
    await Promise.all([startSync(), appSync.run()]);
    expect(seen.kinds).toHaveLength(1);
    expect(seen.events).toHaveLength(1);
    expect(seen.overrides).toHaveLength(1);
  });
});
