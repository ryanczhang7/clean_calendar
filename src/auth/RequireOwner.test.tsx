import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse } from "msw";
import {
  createMemoryRouter,
  type RouteObject,
  RouterProvider,
} from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../app/routes";
import type { KindsStore } from "../sync/kindsStore";
import { installServer, onTable, pgError } from "../test/msw";
import { kindRowNulls } from "../test/rows-fixtures";
import {
  answerKindsSeed,
  fake,
  OWNER_EMAIL,
  sessionFor,
} from "../test/supabase-mock";
import { RequireOwner } from "./RequireOwner";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-006 Block 6: RequireOwner seeds through the app store `kindsStore`,
// which remembers a settled seed for its life - i.e. for this whole file.
// Each test gets a fresh store behind the same export (beforeEach bumps the
// generation; the next call builds a new store), so a test that pins the seed
// requests does not depend on which test ran first. The store is real
// (createKindsStore over kindsRepo over the mocked client), so every request
// is a real PostgREST call that MSW answers. Everything is built inside the
// factory, which runs only once something imports ../sync/kindsStore: the
// test file itself imports nothing from it but a type.
const generation = vi.hoisted(() => ({ value: 0 }));
vi.mock("../sync/kindsStore", async (importOriginal) => {
  const real = await importOriginal<typeof import("../sync/kindsStore")>();
  const { kindsRepo } = await import("../data/kinds");
  const { supabaseModule } = await import("../test/supabase-mock");
  let built = -1;
  let current: KindsStore | undefined;
  const store = (): KindsStore => {
    if (current === undefined || built !== generation.value) {
      built = generation.value;
      current = real.createKindsStore(kindsRepo(supabaseModule.supabase));
    }
    return current;
  };
  const delegate: KindsStore = {
    ensureSeeded: () => store().ensureSeeded(),
    refresh: () => store().refresh(),
    subscribe: (listener) => store().subscribe(listener),
    getSnapshot: () => store().getSnapshot(),
  };
  return { ...real, kindsStore: delegate };
});

installServer();

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
  generation.value += 1;
  // Where the seed is not what a test is about: an empty table, seeded.
  answerKindsSeed();
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

describe("the owner's sign-in seeds the default kinds first (CAL-006 AC-3, Block 6)", () => {
  const TABLE: RouteObject[] = [
    {
      element: <RequireOwner />,
      children: [{ path: "/secret", element: <h1>Secret page</h1> }],
    },
    { path: "/signin", element: <h1>Sign-in stand-in</h1> },
  ];

  /** A kinds GET the test answers by hand; a POST is echoed as inserted. */
  function holdKindsRead() {
    let release: (res: Response) => void = () => {};
    const gate = new Promise<Response>((done) => {
      release = done;
    });
    const seen = onTable("kinds", (req) => {
      if (req.method === "GET") return gate;
      const inputs = req.body as Array<Record<string, unknown>>;
      return HttpResponse.json(
        inputs.map((input, i) => ({
          ...input,
          id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
          deleted_at: null,
          created_at: "2026-10-16T08:00:00.000001+00:00",
          updated_at: "2026-10-16T08:00:00.000001+00:00",
        })),
        { status: 201 },
      );
    });
    return { seen, release };
  }

  it("does not render the page until the seed settles, then seeds an empty table with one GET and one POST of the eleven defaults", async () => {
    const kinds = holdKindsRead();
    fake.setSession(sessionFor(OWNER_EMAIL));
    renderAt("/secret", TABLE);
    await settle();
    expect(screen.queryByRole("heading", { name: "Secret page" })).toBeNull();
    await waitFor(() => expect(kinds.seen).toHaveLength(1));
    expect(kinds.seen[0]?.method).toBe("GET");
    expect(screen.queryByRole("heading", { name: "Secret page" })).toBeNull();

    kinds.release(HttpResponse.json([]));
    expect(
      await screen.findByRole("heading", { name: "Secret page" }),
    ).toBeInTheDocument();
    expect(kinds.seen.map((r) => r.method)).toStrictEqual(["GET", "POST"]);
    const body = kinds.seen[1]?.body as Array<{
      name: string;
      is_default: boolean;
    }>;
    expect(body).toHaveLength(11);
    expect(body[0]?.name).toBe("Movies");
    expect(body.every((row) => row.is_default === true)).toBe(true);
  });

  it("renders the page after one GET and no insert when kinds already exist", async () => {
    const seen = onTable("kinds", () => HttpResponse.json([kindRowNulls]));
    fake.setSession(sessionFor(OWNER_EMAIL));
    renderAt("/secret", TABLE);
    expect(
      await screen.findByRole("heading", { name: "Secret page" }),
    ).toBeInTheDocument();
    expect(seen.map((r) => r.method)).toStrictEqual(["GET"]);
  });

  it("still renders the page when the seed is unavailable (a 500 on the read) - the owner is never locked out", async () => {
    const seen = onTable("kinds", () =>
      pgError(500, "XX000", "internal error"),
    );
    fake.setSession(sessionFor(OWNER_EMAIL));
    renderAt("/secret", TABLE);
    expect(
      await screen.findByRole("heading", { name: "Secret page" }),
    ).toBeInTheDocument();
    expect(seen.map((r) => r.method)).toStrictEqual(["GET"]);
  });

  it("makes no kinds request for a signed-out visitor", async () => {
    const seen = onTable("kinds", () => HttpResponse.json([]));
    renderAt("/secret", TABLE);
    await screen.findByRole("heading", { name: "Sign-in stand-in" });
    await settle();
    expect(seen).toStrictEqual([]);
  });

  it("makes no kinds request for another account", async () => {
    const seen = onTable("kinds", () => HttpResponse.json([]));
    fake.setSession(sessionFor("someone@else.test"));
    renderAt("/secret", TABLE);
    await screen.findByRole("alert");
    await settle();
    expect(seen).toStrictEqual([]);
  });

  it("focuses the page's <h1> once the seed has settled and the page appears", async () => {
    const kinds = holdKindsRead();
    fake.setSession(sessionFor(OWNER_EMAIL));
    renderAt("/kinds");
    await settle();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    await waitFor(() => expect(kinds.seen).toHaveLength(1));
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();

    kinds.release(HttpResponse.json([kindRowNulls]));
    const h1 = await screen.findByRole("heading", {
      level: 1,
      name: "Event kinds",
    });
    await waitFor(() => expect(document.activeElement).toBe(h1));
  });
});
