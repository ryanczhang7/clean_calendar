import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fake, OWNER_EMAIL, sessionFor } from "../test/supabase-mock";
import { App } from "./App";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

beforeEach(() => {
  fake.reset();
  fake.setSession(sessionFor(OWNER_EMAIL));
  sessionStorage.clear();
});

// Smoke test only (CAL-002 Contract, Router): routing is tested through
// createMemoryRouter in routes.test.tsx, never through App. jsdom's URL is
// "/", so App must show the calendar placeholder inside the shell - signed
// in as the owner since CAL-003, whose session answers asynchronously.
describe("App", () => {
  it("renders the routed shell at / with a main landmark and the Calendar heading", async () => {
    render(<App />);
    const h1 = await screen.findByRole("heading", { level: 1 });
    expect(h1).toHaveAccessibleName("Calendar");
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
