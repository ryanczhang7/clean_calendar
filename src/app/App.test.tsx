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
