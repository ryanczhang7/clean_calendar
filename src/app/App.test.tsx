import { act, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installServer, onTable } from "../test/msw";
import {
  CREATED,
  EXISTING,
  type FakeSubscription,
  installPushBrowser,
  type Permission,
  type PushBrowser,
  VAPID_KEY,
} from "../test/push";
import {
  answerEvents,
  answerKindsSeed,
  fake,
  OWNER_EMAIL,
  sessionFor,
} from "../test/supabase-mock";
import { App } from "./App";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-006 Block 7: the owner path seeds the default kinds through a real
// PostgREST call, which MSW answers (an empty table, then the insert echoed).
// An unanswered request fails the test.
installServer();

beforeEach(() => {
  fake.reset();
  fake.setSession(sessionFor(OWNER_EMAIL));
  sessionStorage.clear();
  // CAL-007 Block 8: an onboarded device, so a calendar route renders the
  // calendar rather than redirecting to the kinds walkthrough.
  localStorage.clear();
  localStorage.setItem("cc.onboarded", "1");
  answerKindsSeed();
  // CAL-009 Block 9: the calendar page now reads events too.
  answerEvents();
});

// Smoke test only (CAL-002 Contract, Router): routing is tested through
// createMemoryRouter in routes.test.tsx, never through App. jsdom's URL is
// "/", so App must show the calendar placeholder inside the shell - signed
// in as the owner since CAL-003, whose session answers asynchronously.
/** A month view's title, "October 2026" (CAL-011 Block 1). */
const MONTH_TITLE = /^[A-Z][a-z]+ \d{4}$/;

describe("App", () => {
  it("renders the routed shell at / with a main landmark and the month's title as its heading", async () => {
    render(<App />);
    const h1 = await screen.findByRole("heading", { level: 1 });
    // CAL-011 PO decision 1: the <h1> is the period title, e.g. "October
    // 2026". The clock is not pinned here, so the shape is asserted.
    expect(h1).toHaveAccessibleName(MONTH_TITLE);
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});

// CAL-014 AC-6, Contract Block 6: `App` renders the router at once and opens
// the cache in an effect; a cache that cannot be opened replaces the router
// with the full-page error. The `cache` is injected (default: the app's db).
describe("App when the cache cannot be opened (CAL-014 AC-6)", () => {
  it('renders "Can\'t open the calendar", "Reload to try again." and a Reload button instead of the calendar', async () => {
    const open = vi.fn(() => Promise.reject(new Error("IndexedDB is blocked")));
    render(<App cache={{ open }} />);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Can't open the calendar",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Reload to try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    // Instead of, not beside: no shell, no month title.
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("the first render never waits on the open: with an open still pending, the calendar shows", async () => {
    const open = vi.fn(() => new Promise<never>(() => {}));
    render(<App cache={{ open }} />);
    const h1 = await screen.findByRole("heading", { level: 1 });
    expect(h1).toHaveAccessibleName(MONTH_TITLE);
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Reload to try again.")).not.toBeInTheDocument();
  });

  it("an open that succeeds leaves the calendar in place", async () => {
    const open = vi.fn(() => Promise.resolve(undefined));
    render(<App cache={{ open }} />);
    const h1 = await screen.findByRole("heading", { level: 1 });
    expect(h1).toHaveAccessibleName(MONTH_TITLE);
    expect(open).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("heading", { name: "Can't open the calendar" }),
    ).not.toBeInTheDocument();
  });
});

// CAL-027 Contract, Block 6 (AC-4, AC-1). One more mount effect: with
// permission already granted the app re-reads (or re-creates) this device's
// subscription and upserts it with a fresh last_seen_at; it never requests
// permission. The browser is src/test/push.ts; only `Date` is faked, so the
// clock is pinned and MSW, React and findBy run on real timers. The upsert
// is a real PostgREST POST through the mocked client, which MSW answers.
describe("CAL-027 App start registers a granted device (AC-4, Block 6)", () => {
  const NOW = "2026-11-11T08:30:00.000Z";
  let browser: PushBrowser | null = null;

  afterEach(() => {
    browser?.restore();
    browser = null;
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  function answerUpsert() {
    return onTable("push_subscriptions", (req) =>
      HttpResponse.json(
        [
          {
            id: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
            endpoint: (req.body as { endpoint: string }).endpoint,
          },
        ],
        { status: 201 },
      ),
    );
  }

  function start(permission: Permission, existing: FakeSubscription | null) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW));
    browser = installPushBrowser({ permission, existing });
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", VAPID_KEY);
    return browser;
  }

  it("granted, with a subscription: it is re-read, not re-created, and upserted once by endpoint with last_seen_at = now", async () => {
    const b = start("granted", EXISTING);
    const seen = answerUpsert();
    render(<App />);
    await waitFor(() => expect(seen).toHaveLength(1));
    await screen.findByRole("heading", { level: 1 });
    expect(seen[0]?.method).toBe("POST");
    expect(seen[0]?.url.searchParams.get("on_conflict")).toBe("endpoint");
    expect(seen[0]?.body).toStrictEqual({
      endpoint: EXISTING.endpoint,
      p256dh: "BExisting_p256dh-key",
      auth: "existing-auth_1",
      user_agent: navigator.userAgent,
      last_seen_at: NOW,
    });
    expect(b.getSubscription).toHaveBeenCalledTimes(1);
    expect(b.subscribe).not.toHaveBeenCalled();
    expect(b.requestPermission).not.toHaveBeenCalled();
    expect(seen).toHaveLength(1);
  });

  it("granted, with the subscription missing: it is re-created with userVisibleOnly and the VAPID key, and the new one upserted", async () => {
    const b = start("granted", null);
    const seen = answerUpsert();
    render(<App />);
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(b.subscribe).toHaveBeenCalledTimes(1);
    const options = b.subscribe.mock.calls[0]?.[0];
    expect(options?.userVisibleOnly).toBe(true);
    expect(
      Array.from(options?.applicationServerKey as Uint8Array),
    ).toStrictEqual(Array.from(Buffer.from(VAPID_KEY, "base64url")));
    expect(seen[0]?.body).toMatchObject({
      endpoint: CREATED.endpoint,
      last_seen_at: NOW,
    });
    expect(b.requestPermission).not.toHaveBeenCalled();
  });
});

// AC-1: "Given permission is `default`, when the app opens, then no prompt is
// shown." These assertions also hold on the tree before CAL-027 - they earn
// their place through the story's first deferred verification (GATES): with
// requestPermission() called from App's start effect, the first must fail.
describe("CAL-027 App start never prompts (AC-1, Block 6)", () => {
  let browser: PushBrowser | null = null;

  afterEach(() => {
    browser?.restore();
    browser = null;
    vi.unstubAllEnvs();
  });

  it.each(["default", "denied"] as const)(
    "permission %s: the app opens without requesting permission, subscribing, upserting or showing the card",
    async (permission) => {
      browser = installPushBrowser({ permission, existing: EXISTING });
      vi.stubEnv("VITE_VAPID_PUBLIC_KEY", VAPID_KEY);
      const seen = onTable("push_subscriptions", () =>
        HttpResponse.json([], { status: 201 }),
      );
      render(<App />);
      await screen.findByRole("heading", { level: 1 });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(browser.requestPermission).not.toHaveBeenCalled();
      expect(browser.getSubscription).not.toHaveBeenCalled();
      expect(browser.subscribe).not.toHaveBeenCalled();
      expect(seen).toHaveLength(0);
      expect(
        screen.queryByRole("region", { name: "Get reminders on this device" }),
      ).toBeNull();
    },
  );
});
