import { HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installServer,
  onTable,
  pgError,
  preferTokens,
  testClient,
} from "../test/msw";
import { pushSubscriptions, pushSubscriptionsRepo } from "./pushSubscriptions";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-027 Contract, Block 1 (AC-2, AC-4). The device subscription repository
// in the captureJobs.ts shape: a real supabase-js client at TEST_ORIGIN, MSW
// answering /rest/v1/push_subscriptions (src/test/msw.ts). MECHANICAL: one
// upsert by endpoint, the request pinned exactly, `last_seen_at` equal to a
// faked clock. Only `Date` is faked, so MSW's own timers run.

installServer();

const NOW = "2026-11-11T08:30:00.000Z";
const ROW_ID = "5c1d7e2a-0b3f-4a6e-8d9c-1e2f3a4b5c6d";

const INPUT = {
  endpoint: "https://push.example.test/send/abc-123",
  p256dh:
    "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
  auth: "tBHItJI5svbpez7KI4CCXg",
  userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130",
};

/** What PostgREST sends back for a merged row (more than was selected). */
function echoRow(req: { body: unknown }) {
  const body = req.body as Record<string, unknown>;
  return HttpResponse.json(
    [{ id: ROW_ID, endpoint: body.endpoint as string }],
    { status: 201 },
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pushSubscriptions.upsert - the request (AC-2, AC-4, Block 1)", () => {
  it("is exactly one POST to /rest/v1/push_subscriptions", async () => {
    const seen = onTable("push_subscriptions", echoRow);
    await pushSubscriptionsRepo(testClient()).upsert(INPUT);
    expect(seen.map((r) => [r.method, r.url.pathname])).toStrictEqual([
      ["POST", "/rest/v1/push_subscriptions"],
    ]);
  });

  it("upserts by endpoint: the query is exactly on_conflict=endpoint and select=id,endpoint", async () => {
    const seen = onTable("push_subscriptions", echoRow);
    await pushSubscriptionsRepo(testClient()).upsert(INPUT);
    const params = seen[0]?.url.searchParams;
    expect(params?.get("on_conflict")).toBe("endpoint");
    expect(params?.get("select")).toBe("id,endpoint");
    expect([...(params?.keys() ?? [])].sort()).toStrictEqual([
      "on_conflict",
      "select",
    ]);
  });

  it("merges a duplicate rather than ignoring it, and asks for the row back (Prefer: resolution=merge-duplicates, return=representation)", async () => {
    const seen = onTable("push_subscriptions", echoRow);
    await pushSubscriptionsRepo(testClient()).upsert(INPUT);
    const tokens = preferTokens(seen[0]?.prefer ?? null);
    expect(tokens).toContain("resolution=merge-duplicates");
    expect(tokens).toContain("return=representation");
    expect(tokens).not.toContain("resolution=ignore-duplicates");
  });

  it("sends exactly {endpoint, p256dh, auth, user_agent, last_seen_at}, last_seen_at being the clock at the call - no id, created_at or updated_at", async () => {
    const seen = onTable("push_subscriptions", echoRow);
    await pushSubscriptionsRepo(testClient()).upsert(INPUT);
    expect(seen[0]?.body).toStrictEqual({
      endpoint: INPUT.endpoint,
      p256dh: INPUT.p256dh,
      auth: INPUT.auth,
      user_agent: INPUT.userAgent,
      last_seen_at: NOW,
    });
  });

  it("a null user agent is sent as user_agent: null, not left out", async () => {
    const seen = onTable("push_subscriptions", echoRow);
    await pushSubscriptionsRepo(testClient()).upsert({
      ...INPUT,
      userAgent: null,
    });
    const body = seen[0]?.body as Record<string, unknown>;
    expect(Object.hasOwn(body, "user_agent")).toBe(true);
    expect(body.user_agent).toBeNull();
  });

  it("last_seen_at is fresh on every call: the same device upserted an hour later carries the later time", async () => {
    const seen = onTable("push_subscriptions", echoRow);
    const repo = pushSubscriptionsRepo(testClient());
    await repo.upsert(INPUT);
    vi.setSystemTime(new Date("2026-11-11T09:30:00.000Z"));
    await repo.upsert(INPUT);
    expect(
      seen.map((r) => (r.body as Record<string, unknown>).last_seen_at),
    ).toStrictEqual([NOW, "2026-11-11T09:30:00.000Z"]);
  });
});

describe("pushSubscriptions.upsert - the result (Block 1)", () => {
  it("one row back is ok with that row's id and endpoint, and nothing else", async () => {
    onTable("push_subscriptions", (req) => {
      const body = req.body as Record<string, unknown>;
      return HttpResponse.json(
        [
          {
            id: ROW_ID,
            endpoint: body.endpoint,
            p256dh: body.p256dh,
            last_seen_at: NOW,
          },
        ],
        { status: 201 },
      );
    });
    await expect(
      pushSubscriptionsRepo(testClient()).upsert(INPUT),
    ).resolves.toStrictEqual({
      status: "ok",
      row: { id: ROW_ID, endpoint: INPUT.endpoint },
    });
  });

  it("zero rows back is conflict (fromPostgrestOne), not ok", async () => {
    onTable("push_subscriptions", () => HttpResponse.json([], { status: 201 }));
    await expect(
      pushSubscriptionsRepo(testClient()).upsert(INPUT),
    ).resolves.toStrictEqual({ status: "conflict" });
  });

  it("an HTTP refusal (RLS, signed out) is an error carrying PostgREST's code, message and the status", async () => {
    onTable("push_subscriptions", () =>
      pgError(
        401,
        "42501",
        'new row violates row-level security policy for table "push_subscriptions"',
      ),
    );
    await expect(
      pushSubscriptionsRepo(testClient()).upsert(INPUT),
    ).resolves.toStrictEqual({
      status: "error",
      code: "42501",
      message:
        'new row violates row-level security policy for table "push_subscriptions"',
      http: 401,
    });
  });

  it("a rejected fetch is offline, and does not throw", async () => {
    onTable("push_subscriptions", () => HttpResponse.error());
    await expect(
      pushSubscriptionsRepo(testClient()).upsert(INPUT),
    ).resolves.toStrictEqual({ status: "offline" });
  });
});

describe("pushSubscriptions, the app's instance (Block 1)", () => {
  it("is bound to the app's client: its upsert reaches the same push_subscriptions endpoint", async () => {
    const seen = onTable("push_subscriptions", echoRow);
    await expect(pushSubscriptions.upsert(INPUT)).resolves.toStrictEqual({
      status: "ok",
      row: { id: ROW_ID, endpoint: INPUT.endpoint },
    });
    expect(seen.map((r) => r.method)).toStrictEqual(["POST"]);
  });
});
