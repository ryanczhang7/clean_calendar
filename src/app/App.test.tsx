import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installServer } from "../test/msw";
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
