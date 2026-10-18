import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../app/routes";
import { installServer } from "../test/msw";
import {
  answerEvents,
  answerKindsSeed,
  fake,
  OWNER_EMAIL,
  sessionFor,
} from "../test/supabase-mock";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-006 Block 7: an owner arriving at /signin is sent on through
// RequireOwner, which seeds the default kinds through a real PostgREST call.
// MSW answers it (an empty table, then the insert echoed); an unanswered
// request fails the test.
installServer();

// CAL-003 AC-1, AC-2, AC-3, AC-4 (on /signin) and AC-5, through the real
// route table so redirects land where a user would see them. Copy:
// voice.md, "Sign-in screen"; markup: Contract, Sign-in screen.

const LINE = "Your calendar, with every event coloured by what it is.";
const FOOTNOTE = "One account, yours only.";
// CAL-011 PO decision 1: the calendar's <h1> is the period title in the top
// bar, not "Calendar". The clock is not pinned in this suite, so presence is
// asserted by the month title's shape ("October 2026") - "/" shows the month
// with no stored view - and absence by any period title (each ends in a
// year, as "Clean Calendar", "Your event kinds" and "Event kinds" do not).
const MONTH_TITLE = /^[A-Z][a-z]+ \d{4}$/;
const PERIOD_TITLE = /\d{4}$/;
const REFUSAL =
  "This calendar belongs to another account. Sign out and try the right one.";
const OFFLINE = "Sign-in needs a connection";

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

/** The sign-in button, once the page has settled on the card. */
function signInButton() {
  return screen.findByRole("button", { name: "Sign in with Google" });
}

beforeEach(() => {
  fake.reset();
  sessionStorage.clear();
  // CAL-007 Block 8: an onboarded device, so an owner sent on to / sees the calendar, not the kinds walkthrough.
  localStorage.clear();
  localStorage.setItem("cc.onboarded", "1");
  answerKindsSeed();
  // CAL-009 Block 9: the calendar page now reads events too.
  answerEvents();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the sign-in card (AC-1)", () => {
  it("shows the heading, the line, the Google button and the footnote inside the main landmark", async () => {
    renderAt("/signin");
    const button = await signInButton();
    const main = screen.getByRole("main");
    expect(main).toContainElement(button);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveAccessibleName("Clean Calendar");
    expect(main).toContainElement(h1s[0] ?? null);
    expect(within(main).getByText(LINE, { exact: true })).toBeInTheDocument();
    expect(
      within(main).getByText(FOOTNOTE, { exact: true }),
    ).toBeInTheDocument();
  });

  it("has a plain button, not a link or a submit, and is not busy or disabled before it is pressed", async () => {
    renderAt("/signin");
    const button = await signInButton();
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
    expect(button).not.toHaveAttribute("aria-busy");
    expect(button).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText(OFFLINE)).toBeNull();
  });

  it("shows no app shell and no refusal", async () => {
    renderAt("/signin");
    await signInButton();
    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("pressing Sign in with Google (AC-2)", () => {
  it("calls signInWithOAuth once for Google with a redirect on this origin", async () => {
    const user = userEvent.setup();
    renderAt("/signin");
    await user.click(await signInButton());
    expect(fake.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
    const [args] = fake.auth.signInWithOAuth.mock.calls[0] ?? [];
    expect(args?.provider).toBe("google");
    expect(new URL(String(args?.options?.redirectTo)).origin).toBe(
      window.location.origin,
    );
  });

  it("puts the button into its busy state, and keeps it there", async () => {
    const user = userEvent.setup();
    renderAt("/signin");
    const button = await signInButton();
    expect(button).not.toHaveAttribute("aria-busy");
    await user.click(button);
    const after = screen.getByRole("button", { name: "Sign in with Google" });
    expect(after).toHaveAttribute("aria-busy", "true");
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      screen.getByRole("button", { name: "Sign in with Google" }),
    ).toHaveAttribute("aria-busy", "true");
  });
});

describe("arriving signed in as the owner (AC-3)", () => {
  it("renders the remembered path instead of the card", async () => {
    sessionStorage.setItem("cc.returnTo", "/kinds");
    fake.setSession(sessionFor(OWNER_EMAIL));
    const router = renderAt("/signin");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Event kinds" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/kinds");
    expect(
      screen.queryByRole("button", { name: "Sign in with Google" }),
    ).toBeNull();
  });

  it("clears the remembered path once it has been used", async () => {
    sessionStorage.setItem("cc.returnTo", "/kinds");
    fake.setSession(sessionFor(OWNER_EMAIL));
    renderAt("/signin");
    await screen.findByRole("heading", { level: 1, name: "Event kinds" });
    expect(sessionStorage.getItem("cc.returnTo")).toBeNull();
  });

  it("renders / when nothing was remembered", async () => {
    fake.setSession(sessionFor(OWNER_EMAIL));
    const router = renderAt("/signin");
    expect(
      await screen.findByRole("heading", { level: 1, name: MONTH_TITLE }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });

  it("admits the owner's address in another case with surrounding whitespace", async () => {
    fake.setSession(sessionFor("  OWNER@Example.com "));
    const router = renderAt("/signin");
    await screen.findByRole("heading", { level: 1, name: MONTH_TITLE });
    expect(router.state.location.pathname).toBe("/");
  });

  it("takes the owner from the page they first asked for, through sign-in, back to it", async () => {
    const router = renderAt("/settings/notifications");
    await signInButton();
    expect(router.state.location.pathname).toBe("/signin");
    act(() => fake.emit("SIGNED_IN", sessionFor(OWNER_EMAIL)));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Notifications" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/settings/notifications");
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });
});

describe("arriving at /signin signed in as someone else (AC-4)", () => {
  it("shows the refusal alert, not the card", async () => {
    fake.setSession(sessionFor("someone@else.test"));
    renderAt("/signin");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(REFUSAL);
    expect(
      screen.queryByRole("button", { name: "Sign in with Google" }),
    ).toBeNull();
    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.getByRole("main")).toContainElement(alert);
  });

  it("refuses an address that merely starts with the owner's (the AC-4 control)", async () => {
    fake.setSession(sessionFor(`${OWNER_EMAIL}.evil.test`));
    const router = renderAt("/signin");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(REFUSAL);
    expect(router.state.location.pathname).toBe("/signin");
    expect(screen.queryByRole("heading", { name: PERIOD_TITLE })).toBeNull();
  });

  it("signs out and shows the sign-in card when Sign out is pressed", async () => {
    const user = userEvent.setup();
    fake.setSession(sessionFor("someone@else.test"));
    const router = renderAt("/signin");
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(fake.auth.signOut).toHaveBeenCalledTimes(1);
    expect(await signInButton()).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(router.state.location.pathname).toBe("/signin");
  });
});

describe("offline (AC-5)", () => {
  it("marks the button aria-disabled and says sign-in needs a connection", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderAt("/signin");
    const button = await signInButton();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(OFFLINE, { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("main")).toContainElement(
      screen.getByText(OFFLINE, { exact: true }),
    );
  });

  it("calls nothing and does not go busy when the disabled button is pressed", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderAt("/signin");
    const button = await signInButton();
    await user.click(button);
    expect(fake.auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(button).not.toHaveAttribute("aria-busy", "true");
  });

  it("re-enables the button when the connection comes back", async () => {
    const user = userEvent.setup();
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderAt("/signin");
    await signInButton();
    onLine.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    const button = screen.getByRole("button", { name: "Sign in with Google" });
    expect(button).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText(OFFLINE)).toBeNull();
    await user.click(button);
    expect(fake.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
  });

  it("disables the button when the connection drops while the page is open", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    renderAt("/signin");
    await signInButton();
    expect(screen.queryByText(OFFLINE)).toBeNull();
    onLine.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(
      screen.getByRole("button", { name: "Sign in with Google" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(OFFLINE, { exact: true })).toBeInTheDocument();
  });
});
