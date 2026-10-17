import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_KINDS } from "../kinds/defaultKinds";
import { installServer } from "../test/msw";
import {
  answerEvents,
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
  // CAL-007 Block 8: an onboarded device, so a calendar route renders the
  // calendar rather than redirecting to the kinds walkthrough.
  localStorage.clear();
  localStorage.setItem("cc.onboarded", "1");
  answerKindsSeed();
  // CAL-009 Block 9: the calendar page now reads events too.
  answerEvents();
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

// CAL-008 Contract Block 4: the two Legend buttons open one KindLegend, owned
// by the shell, through the real routes over the seeded default kinds.
describe("the kind legend in the shell (CAL-008 AC-1, AC-2, AC-3, Block 4)", () => {
  const topLegend = () =>
    within(screen.getByRole("banner")).getByRole("button", { name: "Legend" });
  const navLegend = () =>
    within(
      screen.getByRole("navigation", { name: "Bottom navigation" }),
    ).getByRole("button", { name: "Legend" });
  const legends = () =>
    screen.queryAllByRole("dialog", { name: "Kind legend" });

  /** The legend lists rows once the seeded kinds are in the store. */
  async function openedLegend(): Promise<HTMLElement> {
    const dialog = screen.getByRole("dialog", { name: "Kind legend" });
    await within(dialog).findByRole("link", { name: "Movies" });
    return dialog;
  }

  it("both Legend buttons carry data-legend-toggle and are type=button", async () => {
    await renderAt("/month/2026-10");
    for (const button of [topLegend(), navLegend()]) {
      expect(button).toHaveAttribute("data-legend-toggle");
      expect(button).toHaveAttribute("type", "button");
      expect(button).toHaveAttribute("aria-expanded", "false");
    }
    expect(legends()).toHaveLength(0);
  });

  it("the top-bar Legend opens the one legend, right after itself, listing the eleven defaults in order, then Manage kinds", async () => {
    const user = userEvent.setup();
    await renderAt("/month/2026-10");
    await user.click(topLegend());
    expect(legends()).toHaveLength(1);
    const dialog = await openedLegend();
    expect(topLegend().nextElementSibling).toBe(dialog);
    const items = within(within(dialog).getByRole("list")).getAllByRole(
      "listitem",
    );
    expect(items).toHaveLength(DEFAULT_KINDS.length);
    for (const [i, k] of DEFAULT_KINDS.entries()) {
      expect(
        within(items[i] as HTMLElement).getByRole("link"),
      ).toHaveAccessibleName(k.name);
    }
    expect(
      within(dialog).getByRole("link", { name: "Manage kinds" }),
    ).toHaveAttribute("href", "/kinds");
  });

  it("both buttons toggle the same legend, and aria-expanded follows it on both", async () => {
    const user = userEvent.setup();
    await renderAt("/week/2026-10-12");
    await user.click(topLegend());
    expect(legends()).toHaveLength(1);
    expect(topLegend()).toHaveAttribute("aria-expanded", "true");
    expect(navLegend()).toHaveAttribute("aria-expanded", "true");
    await user.click(navLegend());
    expect(legends()).toHaveLength(0);
    expect(topLegend()).toHaveAttribute("aria-expanded", "false");
    expect(navLegend()).toHaveAttribute("aria-expanded", "false");
    await user.click(navLegend());
    expect(legends()).toHaveLength(1);
    expect(topLegend()).toHaveAttribute("aria-expanded", "true");
    expect(navLegend()).toHaveAttribute("aria-expanded", "true");
    await user.click(topLegend());
    expect(legends()).toHaveLength(0);
  });

  it.each([
    ["top-bar", topLegend],
    ["bottom-nav", navLegend],
  ])(
    "Escape closes the legend opened by the %s Legend and returns focus to that button",
    async (_where, button) => {
      const user = userEvent.setup();
      await renderAt("/month/2026-10");
      await user.click(button());
      await openedLegend();
      await user.keyboard("{Escape}");
      expect(legends()).toHaveLength(0);
      expect(button()).toHaveAttribute("aria-expanded", "false");
      expect(button()).toHaveFocus();
    },
  );

  it("L from the page toggles the legend, and both buttons follow it", async () => {
    const user = userEvent.setup();
    await renderAt("/day/2026-10-14");
    await vi.waitFor(() => expect(document.activeElement?.tagName).toBe("H1"));
    await user.keyboard("l");
    expect(legends()).toHaveLength(1);
    expect(topLegend()).toHaveAttribute("aria-expanded", "true");
    expect(navLegend()).toHaveAttribute("aria-expanded", "true");
    await openedLegend();
    await user.keyboard("l");
    expect(legends()).toHaveLength(0);
    expect(topLegend()).toHaveAttribute("aria-expanded", "false");
  });

  it("a legend row opens /kinds?kind={id} with that kind's editor open, carrying the calendar route as state.from (AC-3)", async () => {
    const user = userEvent.setup();
    const router = await renderAt("/week/2026-10-12");
    await user.click(topLegend());
    const dialog = await openedLegend();
    await user.click(within(dialog).getByRole("link", { name: "Movies" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Event kinds" }),
    ).toBeInTheDocument();
    const editor = await screen.findByRole("dialog", { name: "Edit Movies" });
    expect(within(editor).getByRole("textbox", { name: "Name" })).toHaveValue(
      "Movies",
    );
    expect(legends()).toHaveLength(0);
    expect(router.state.location.pathname).toBe("/kinds");
    expect(router.state.location.search).toBe(
      "?kind=00000000-0000-4000-8000-000000000001",
    );
    expect(router.state.location.state).toStrictEqual({
      from: "/week/2026-10-12",
    });
  });

  it("the account menu's Kinds item carries the calendar route as state.from too", async () => {
    const user = userEvent.setup();
    const router = await renderAt("/month/2026-10");
    await user.click(screen.getByRole("button", { name: "Account" }));
    await user.click(screen.getByRole("menuitem", { name: "Kinds" }));
    await screen.findByRole("heading", { level: 1, name: "Event kinds" });
    expect(router.state.location.pathname).toBe("/kinds");
    expect(router.state.location.state).toStrictEqual({
      from: "/month/2026-10",
    });
  });
});
