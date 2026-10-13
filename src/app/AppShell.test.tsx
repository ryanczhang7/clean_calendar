import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fake, OWNER_EMAIL, sessionFor } from "../test/supabase-mock";
import { routes } from "./routes";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// AC-3. The shell is a layout route, so it is rendered through the real
// route table (CAL-002 Contract, Shell). Today is pinned to Wed 14 Oct 2026.
// Since CAL-003 the shell sits behind RequireOwner: these tests run signed in
// as the owner, and renderAt waits for the session to answer.

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
});

afterEach(() => {
  vi.useRealTimers();
});

const CALENDAR_ROUTES = [
  "/",
  "/month/2026-10",
  "/week/2026-10-12",
  "/day/2026-10-14",
];

describe("app shell top bar (AC-3)", () => {
  it.each(CALENDAR_ROUTES)(
    "%s has a top bar and a bottom navigation",
    async (path) => {
      await renderAt(path);
      expect(screen.getByRole("banner")).toBeInTheDocument();
      expect(
        screen.getByRole("navigation", { name: "Bottom navigation" }),
      ).toBeInTheDocument();
    },
  );

  it("holds a Capture link to /capture in the top bar", async () => {
    await renderAt("/month/2026-10");
    const banner = screen.getByRole("banner");
    expect(
      within(banner).getByRole("link", { name: "Capture" }),
    ).toHaveAttribute("href", "/capture");
  });

  it("holds a collapsed Legend button in the top bar", async () => {
    await renderAt("/month/2026-10");
    const banner = screen.getByRole("banner");
    expect(
      within(banner).getByRole("button", { name: "Legend" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("holds an Account menu button, collapsed until pressed", async () => {
    await renderAt("/month/2026-10");
    const account = within(screen.getByRole("banner")).getByRole("button", {
      name: "Account",
    });
    expect(account).toHaveAttribute("aria-haspopup", "menu");
    expect(account).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens the Account menu with Kinds, Notifications and Sign out items", async () => {
    const user = userEvent.setup();
    await renderAt("/month/2026-10");
    const account = screen.getByRole("button", { name: "Account" });
    await user.click(account);
    expect(account).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu", { name: "Account" });
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "Kinds",
      "Notifications",
      "Sign out",
    ]);
    expect(
      within(menu).getByRole("menuitem", { name: "Kinds" }),
    ).toHaveAttribute("href", "/kinds");
    expect(
      within(menu).getByRole("menuitem", { name: "Notifications" }),
    ).toHaveAttribute("href", "/settings/notifications");
  });

  it("closes the Account menu on Escape and returns focus to its button", async () => {
    const user = userEvent.setup();
    await renderAt("/month/2026-10");
    const account = screen.getByRole("button", { name: "Account" });
    await user.click(account);
    within(screen.getByRole("menu"))
      .getByRole("menuitem", { name: "Kinds" })
      .focus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(account).toHaveAttribute("aria-expanded", "false");
    expect(account).toHaveFocus();
  });

  it("closes the Account menu and navigates when an item is chosen", async () => {
    const user = userEvent.setup();
    await renderAt("/month/2026-10");
    await user.click(screen.getByRole("button", { name: "Account" }));
    await user.click(screen.getByRole("menuitem", { name: "Kinds" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Event kinds" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("signing out from the account menu (CAL-003 AC-6)", () => {
  it("offers Sign out as a button, last in the menu", async () => {
    const user = userEvent.setup();
    await renderAt("/month/2026-10");
    await user.click(screen.getByRole("button", { name: "Account" }));
    const item = within(
      screen.getByRole("menu", { name: "Account" }),
    ).getByRole("menuitem", { name: "Sign out" });
    expect(item.tagName).toBe("BUTTON");
    expect(item).toHaveAttribute("type", "button");
    expect(fake.auth.signOut).not.toHaveBeenCalled();
  });

  it("calls signOut and shows the sign-in page when Sign out is chosen", async () => {
    const user = userEvent.setup();
    const router = await renderAt("/month/2026-10");
    await user.click(screen.getByRole("button", { name: "Account" }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(fake.auth.signOut).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("button", { name: "Sign in with Google" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Clean Calendar" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/signin");
    expect(screen.queryByRole("banner")).toBeNull();
  });
});

describe("app shell bottom navigation (AC-3)", () => {
  it("holds Month, Week and Day links to today's period, a Legend button and a Capture link, in that order", async () => {
    await renderAt("/month/2026-10");
    const nav = screen.getByRole("navigation", { name: "Bottom navigation" });
    const v = within(nav);
    expect(v.getByRole("link", { name: "Month" })).toHaveAttribute(
      "href",
      "/month/2026-10",
    );
    expect(v.getByRole("link", { name: "Week" })).toHaveAttribute(
      "href",
      "/week/2026-10-14",
    );
    expect(v.getByRole("link", { name: "Day" })).toHaveAttribute(
      "href",
      "/day/2026-10-14",
    );
    expect(v.getByRole("link", { name: "Capture" })).toHaveAttribute(
      "href",
      "/capture",
    );
    expect(v.getByRole("button", { name: "Legend" })).toBeInTheDocument();
    const controls = [...nav.querySelectorAll("a, button")].map(
      (el) => el.textContent,
    );
    expect(controls).toEqual(["Month", "Week", "Day", "Legend", "Capture"]);
  });

  it("follows the system date, not the route, for its links", async () => {
    vi.setSystemTime(new Date(2027, 0, 3, 9, 0, 0));
    await renderAt("/month/2026-10");
    const v = within(
      screen.getByRole("navigation", { name: "Bottom navigation" }),
    );
    expect(v.getByRole("link", { name: "Month" })).toHaveAttribute(
      "href",
      "/month/2027-01",
    );
    expect(v.getByRole("link", { name: "Week" })).toHaveAttribute(
      "href",
      "/week/2027-01-03",
    );
    expect(v.getByRole("link", { name: "Day" })).toHaveAttribute(
      "href",
      "/day/2027-01-03",
    );
  });

  it("comes after the main landmark in DOM order, and the top bar before it", async () => {
    await renderAt("/month/2026-10");
    const banner = screen.getByRole("banner");
    const main = screen.getByRole("main");
    const nav = screen.getByRole("navigation", { name: "Bottom navigation" });
    expect(
      main.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      banner.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(main).not.toContainElement(nav);
  });
});

describe("app shell live regions (AC-5, Contract)", () => {
  it("hosts the sync status and the one toast status region", async () => {
    await renderAt("/month/2026-10");
    const regions = screen.getAllByRole("status");
    expect(regions).toHaveLength(2);
    expect(
      screen.getByRole("status", { name: "Sync status" }),
    ).toBeInTheDocument();
    const toast = regions.filter(
      (r) => r.getAttribute("aria-label") !== "Sync status",
    );
    expect(toast).toHaveLength(1);
    expect(toast[0]).toHaveAttribute("aria-live", "polite");
  });
});
