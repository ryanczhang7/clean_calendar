import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installServer } from "../test/msw";
import {
  answerKindsSeed,
  fake,
  OWNER_EMAIL,
  sessionFor,
} from "../test/supabase-mock";
import { routes } from "./routes";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-006 Block 7: the owner path seeds the default kinds through a real
// PostgREST call, which MSW answers (an empty table, then the insert echoed).
// An unanswered request fails the test.
installServer();

// AC-2 (one <h1> per route, the not-found page) and AC-4 (focus on the new
// page's <h1> after a route change). Headings: CAL-002 Contract, Router.
// Since CAL-003 every shell route sits behind RequireOwner, so these tests
// run signed in as the owner (the session answers asynchronously, hence the
// awaited renderAt), and /signin is visited signed out - an owner arriving
// there is sent on to the app (CAL-003 AC-3).

async function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { level: 1 });
  return router;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0, 0));
  fake.reset();
  fake.setSession(sessionFor(OWNER_EMAIL));
  sessionStorage.clear();
  answerKindsSeed();
});

afterEach(() => {
  vi.useRealTimers();
});

const PAGES: Array<[path: string, heading: string]> = [
  ["/", "Calendar"],
  ["/month/2026-10", "Calendar"],
  ["/week/2026-10-12", "Calendar"],
  ["/day/2026-10-14", "Calendar"],
  ["/welcome", "Your event kinds"],
  ["/kinds", "Event kinds"],
  ["/capture", "Capture"],
  ["/capture/confirm", "Check the details"],
  ["/settings/notifications", "Notifications"],
];

describe("routes (AC-2)", () => {
  it.each(PAGES)(
    "%s renders exactly one <h1>, reading %j",
    async (path, heading) => {
      await renderAt(path);
      const h1s = screen.getAllByRole("heading", { level: 1 });
      expect(h1s).toHaveLength(1);
      expect(h1s[0]).toHaveAccessibleName(heading);
      expect(document.querySelectorAll("h1")).toHaveLength(1);
    },
  );

  it('/signin renders exactly one <h1>, reading "Clean Calendar", signed out', async () => {
    fake.setSession(null);
    await renderAt("/signin");
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveAccessibleName("Clean Calendar");
    expect(document.querySelectorAll("h1")).toHaveLength(1);
  });

  it.each(PAGES)("%s renders inside the app shell", async (path) => {
    await renderAt(path);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toContainElement(
      screen.getByRole("heading", { level: 1 }),
    );
  });

  it("renders /signin outside the app shell, with no top bar or bottom navigation", async () => {
    fake.setSession(null);
    await renderAt("/signin");
    expect(screen.queryByRole("banner")).toBeNull();
    expect(
      screen.queryByRole("navigation", { name: "Bottom navigation" }),
    ).toBeNull();
  });

  it("renders 'Nothing here' with a 'Go to today' link to / for an unknown path", async () => {
    await renderAt("/unknown/x");
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveAccessibleName("Nothing here");
    expect(screen.getByRole("link", { name: "Go to today" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("takes the user to today's calendar from the not-found page", async () => {
    const user = userEvent.setup();
    await renderAt("/unknown/x");
    await user.click(screen.getByRole("link", { name: "Go to today" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Calendar" }),
    ).toBeInTheDocument();
  });
});

describe("focus on route change (AC-4)", () => {
  it("focuses the page's <h1> on first render", async () => {
    await renderAt("/");
    const h1 = screen.getByRole("heading", { level: 1, name: "Calendar" });
    await waitFor(() => expect(h1).toHaveFocus());
  });

  it("moves focus to the new page's <h1> after following the Capture link", async () => {
    const user = userEvent.setup();
    await renderAt("/");
    await user.click(
      within(screen.getByRole("banner")).getByRole("link", { name: "Capture" }),
    );
    const h1 = await screen.findByRole("heading", {
      level: 1,
      name: "Capture",
    });
    await waitFor(() => expect(h1).toHaveFocus());
  });

  it("moves focus to the new page's <h1> on a programmatic navigation", async () => {
    const router = await renderAt("/month/2026-10");
    await act(async () => {
      await router.navigate("/kinds");
    });
    const h1 = await screen.findByRole("heading", {
      level: 1,
      name: "Event kinds",
    });
    await waitFor(() => expect(h1).toHaveFocus());
  });

  it("moves focus to the <h1> again when only the calendar date changes", async () => {
    const router = await renderAt("/month/2026-10");
    const before = screen.getByRole("heading", { level: 1, name: "Calendar" });
    await waitFor(() => expect(before).toHaveFocus());
    before.blur();
    expect(before).not.toHaveFocus();
    await act(async () => {
      await router.navigate("/month/2026-11");
    });
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: "Calendar" }),
      ).toHaveFocus(),
    );
  });

  it("focuses the sign-in page's <h1>, outside the shell, after a signed-out visitor is redirected there", async () => {
    fake.setSession(null);
    const router = await renderAt("/");
    const h1 = await screen.findByRole("heading", {
      level: 1,
      name: "Clean Calendar",
    });
    expect(router.state.location.pathname).toBe("/signin");
    await waitFor(() => expect(h1).toHaveFocus());
  });
});
