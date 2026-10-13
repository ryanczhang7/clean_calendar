import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

// Smoke test only (CAL-002 Contract, Router): routing is tested through
// createMemoryRouter in routes.test.tsx, never through App. jsdom's URL is
// "/", so App must show the calendar placeholder inside the shell.
describe("App", () => {
  it("renders the routed shell at / with a main landmark and the Calendar heading", () => {
    render(<App />);
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveAccessibleName("Calendar");
  });
});
