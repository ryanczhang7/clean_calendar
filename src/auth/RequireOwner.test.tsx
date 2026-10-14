import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryRouter,
  type RouteObject,
  RouterProvider,
} from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../app/routes";
import { fake, OWNER_EMAIL, sessionFor } from "../test/supabase-mock";
import { RequireOwner } from "./RequireOwner";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-003 AC-1 (redirect and remembered path), AC-3 (the owner is
// admitted), AC-4 (anyone else is refused). Contract, Gate: RequireOwner is
// the layout route around AppShell in routes.tsx.

const REFUSAL =
  "This calendar belongs to another account. Sign out and try the right one.";

function renderAt(path: string, table: RouteObject[] = routes) {
  const router = createMemoryRouter(table, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

/** Let getSession's resolved promise and the renders after it land. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  fake.reset();
  sessionStorage.clear();
});

describe("RequireOwner on its own, around a stand-in page", () => {
  const TABLE: RouteObject[] = [
    {
      element: <RequireOwner />,
      children: [{ path: "/secret", element: <h1>Secret page</h1> }],
    },
    { path: "/signin", element: <h1>Sign-in stand-in</h1> },
  ];

  it("renders its child route for the owner", async () => {
    fake.setSession(sessionFor(OWNER_EMAIL));
    renderAt("/secret", TABLE);
    expect(
      await screen.findByRole("heading", { name: "Secret page" }),
    ).toBeInTheDocument();
  });

  it("sends a signed-out visitor to /signin and remembers the path and query", async () => {
    const router = renderAt("/secret?tab=2", TABLE);
    expect(
      await screen.findByRole("heading", { name: "Sign-in stand-in" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/signin");
    expect(sessionStorage.getItem("cc.returnTo")).toBe("/secret?tab=2");
  });

  it("replaces the history entry rather than pushing one", async () => {
    const router = renderAt("/secret", TABLE);
    await screen.findByRole("heading", { name: "Sign-in stand-in" });
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("refuses anyone else in place of its child route", async () => {
    fake.setSession(sessionFor("someone@else.test"));
    const router = renderAt("/secret", TABLE);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(REFUSAL);
    expect(screen.queryByRole("heading", { name: "Secret page" })).toBeNull();
    expect(router.state.location.pathname).toBe("/secret");
  });

  it("renders nothing at all while the session is loading", async () => {
    fake.holdSession();
    const router = renderAt("/secret", TABLE);
    await settle();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(router.state.location.pathname).toBe("/secret");
    expect(sessionStorage.getItem("cc.returnTo")).toBeNull();
  });
});

describe("a signed-out visitor (AC-1)", () => {
  it("visiting /kinds lands on the sign-in card and /kinds is remembered", async () => {
    const router = renderAt("/kinds");
    expect(
      await screen.findByRole("button", { name: "Sign in with Google" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/signin");
    expect(
      screen.getByRole("heading", { level: 1, name: "Clean Calendar" }),
    ).toBeInTheDocument();
    expect(sessionStorage.getItem("cc.returnTo")).toBe("/kinds");
    expect(screen.queryByRole("banner")).toBeNull();
  });

  it.each([
    "/",
    "/month/2026-10",
    "/capture",
    "/settings/notifications",
    "/no/such/page",
  ])("visiting %s is sent to /signin and remembered", async (path) => {
    const router = renderAt(path);
    await screen.findByRole("button", { name: "Sign in with Google" });
    expect(router.state.location.pathname).toBe("/signin");
    expect(sessionStorage.getItem("cc.returnTo")).toBe(path);
  });

  it("never remembers /signin itself", async () => {
    renderAt("/signin");
    await screen.findByRole("button", { name: "Sign in with Google" });
    await settle();
    expect(sessionStorage.getItem("cc.returnTo")).toBeNull();
  });

  it("does not overwrite a remembered path by visiting /signin directly", async () => {
    sessionStorage.setItem("cc.returnTo", "/kinds");
    renderAt("/signin");
    await screen.findByRole("button", { name: "Sign in with Google" });
    await settle();
    expect(sessionStorage.getItem("cc.returnTo")).toBe("/kinds");
  });

  it("an owner whose session ends is sent to /signin", async () => {
    fake.setSession(sessionFor(OWNER_EMAIL));
    const router = renderAt("/kinds");
    await screen.findByRole("heading", { level: 1, name: "Event kinds" });
    act(() => fake.emit("SIGNED_OUT", null));
    expect(
      await screen.findByRole("button", { name: "Sign in with Google" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/signin");
  });
});

describe("the owner (AC-3)", () => {
  it("sees the page they asked for, inside the shell", async () => {
    fake.setSession(sessionFor(OWNER_EMAIL));
    const router = renderAt("/kinds");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Event kinds" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/kinds");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("is admitted with the address in another case and surrounding whitespace", async () => {
    fake.setSession(sessionFor(" Owner@EXAMPLE.com\n"));
    renderAt("/kinds");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Event kinds" }),
    ).toBeInTheDocument();
  });
});

describe("anyone else (AC-4)", () => {
  it("sees the refusal alert and no app route", async () => {
    fake.setSession(sessionFor("someone@else.test"));
    renderAt("/kinds");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(REFUSAL);
    expect(screen.queryByRole("heading", { name: "Event kinds" })).toBeNull();
    expect(screen.queryByRole("banner")).toBeNull();
    expect(
      screen.queryByRole("navigation", { name: "Bottom navigation" }),
    ).toBeNull();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveAccessibleName("Clean Calendar");
    expect(screen.getByRole("main")).toContainElement(alert);
  });

  it("refuses an address that merely starts with the owner's (the AC-4 control)", async () => {
    fake.setSession(sessionFor("owner@example.com.evil.test"));
    renderAt("/");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(REFUSAL);
    expect(screen.queryByRole("heading", { name: "Calendar" })).toBeNull();
    expect(screen.queryByRole("banner")).toBeNull();
  });

  it("refuses an address that merely ends with the owner's", async () => {
    fake.setSession(sessionFor("xowner@example.com"));
    renderAt("/");
    expect((await screen.findByRole("alert")).textContent).toBe(REFUSAL);
  });

  it("signs out and returns to /signin when Sign out is pressed", async () => {
    const user = userEvent.setup();
    fake.setSession(sessionFor("someone@else.test"));
    const router = renderAt("/kinds");
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(fake.auth.signOut).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("button", { name: "Sign in with Google" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/signin");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
