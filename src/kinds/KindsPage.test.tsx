import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSX } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import type { KindsRepo } from "../data/kinds";
import type { ListResult } from "../data/result";
import type { Kind } from "../data/rows";
import { createKindActions } from "../sync/kindActions";
import { createKindsStore } from "../sync/kindsStore";
import { ToastHost, ToastProvider } from "../ui/Toast";
import { KindsPage } from "./KindsPage";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-008 AC-3, AC-4, AC-5; Contract Block 3 (Block 5: rendered directly in
// a MemoryRouter and a ToastProvider, over createKindsStore and
// createKindActions on a vi.fn-per-member repository fake). Every other path
// is a stand-in that prints where Back went. The editor's own behaviour is
// CAL-007's; this suite checks only that the page opens it and that one
// rename persists through it.

const STAMP = "2026-10-16T08:00:00.000001+00:00";
const LATER = "2026-10-16T09:30:00.000002+00:00";
const WALKTHROUGH_LINE =
  "Every event gets a kind, and the kind decides its colour. Rename, recolour or remove these, or add your own. You can change them later.";

function kind(
  n: number,
  name: string,
  colorLight: string,
  colorDark: string,
  extra: Partial<Kind> = {},
): Kind {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name,
    colorLight,
    colorDark,
    sortOrder: n,
    isDefault: true,
    deletedAt: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...extra,
  };
}

const MOVIES = kind(1, "Movies", "#7E3FB8", "#CFA8F0");
const ENTERTAINMENT = kind(2, "Entertainment", "#BD8200", "#F5CC6A");
const GONE = kind(3, "Flights", "#0B6E80", "#7AD4E4", { deletedAt: STAMP });
const GYM = kind(8, "Gym", "#2E7D32", "#9BD69B");

type Repo = Pick<
  KindsRepo,
  "listAll" | "insertMany" | "insert" | "update" | "remove"
>;
type FakeRepo = { [K in keyof Repo]: Mock<Repo[K]> };

let repo: FakeRepo;

beforeEach(() => {
  localStorage.clear();
  repo = {
    listAll: vi.fn<Repo["listAll"]>(),
    insertMany: vi.fn<Repo["insertMany"]>(),
    insert: vi.fn<Repo["insert"]>(),
    update: vi.fn<Repo["update"]>(),
    remove: vi.fn<Repo["remove"]>(),
  };
});

afterEach(() => {
  localStorage.clear();
});

const rows = (...kinds: Kind[]): ListResult<Kind> => ({
  status: "ok",
  rows: kinds,
});

/** Wherever Back leads: prints the path it landed on. */
function Elsewhere(): JSX.Element {
  const { pathname } = useLocation();
  return <h1>Landed on {pathname}</h1>;
}

/**
 * Renders /kinds. The store is loaded first, as the shell's owner gate
 * does before any shell route renders (RequireOwner seeds it), unless
 * `prime` is false - the case of a store that answers late.
 */
async function renderPage(
  options: { search?: string; state?: unknown; prime?: boolean } = {},
) {
  const user = userEvent.setup();
  const store = createKindsStore(repo);
  if (options.prime ?? true) {
    await store.refresh();
    expect(store.getSnapshot().status).toBe("ready");
  }
  const actions = createKindActions(repo, store);
  render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: "/kinds",
          search: options.search ?? "",
          state: options.state,
        },
      ]}
    >
      <ToastProvider>
        <Routes>
          <Route
            path="/kinds"
            element={<KindsPage store={store} actions={actions} />}
          />
          <Route path="*" element={<Elsewhere />} />
        </Routes>
        <ToastHost />
      </ToastProvider>
    </MemoryRouter>,
  );
  return { user, store };
}

/** The visible names of the rows, in DOM order. */
function rowNames(): string[] {
  const list = screen.getByRole("list", { name: "Kinds" });
  return within(list)
    .queryAllByRole("listitem")
    .map((li) =>
      (within(li).getByRole("button").getAttribute("aria-label") ?? "").replace(
        /^Edit /,
        "",
      ),
    );
}

describe("the Event kinds page (AC-5, Block 3)", () => {
  it('opens with the heading "Event kinds", focusable by script, then the kind list, and no walkthrough intro line', async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES));
    await renderPage();
    const h1 = screen.getByRole("heading", { level: 1, name: "Event kinds" });
    expect(h1).toHaveAttribute("tabindex", "-1");
    const list = await screen.findByRole("list", { name: "Kinds" });
    expect(
      h1.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText(WALKTHROUGH_LINE)).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Your event kinds" }),
    ).toBeNull();
  });

  it("lists the live kinds in sort_order through the kind list, leaving soft-deleted ones out", async () => {
    repo.listAll.mockResolvedValue(rows(GYM, ENTERTAINMENT, GONE, MOVIES));
    await renderPage();
    await screen.findByRole("button", { name: "Edit Movies" });
    expect(rowNames()).toStrictEqual(["Movies", "Entertainment", "Gym"]);
  });

  it('offers "Add kind" then "Back" after the list, and no Done', async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES));
    await renderPage();
    await screen.findByRole("button", { name: "Edit Movies" });
    const add = screen.getByRole("button", { name: "Add kind" });
    const back = screen.getByRole("button", { name: "Back" });
    expect(add).toHaveAttribute("type", "button");
    expect(back).toHaveAttribute("type", "button");
    const list = screen.getByRole("list", { name: "Kinds" });
    expect(
      list.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      add.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label") ?? b.textContent),
    ).toStrictEqual(["Edit Movies", "Add kind", "Back"]);
    expect(
      screen.queryByRole("button", { name: "Done, show my calendar" }),
    ).toBeNull();
  });

  it("Back is never disabled, even with zero live kinds", async () => {
    repo.listAll.mockResolvedValue(rows(GONE));
    await renderPage();
    expect(rowNames()).toStrictEqual([]);
    const back = screen.getByRole("button", { name: "Back" });
    expect(back).not.toHaveAttribute("aria-disabled");
    expect(back).toBeEnabled();
  });

  it("opens the editor for a row's kind when its Edit button is pressed", async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES, GYM));
    const { user } = await renderPage();
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(await screen.findByRole("button", { name: "Edit Gym" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Gym" });
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue(
      "Gym",
    );
  });

  it('opens an empty editor titled "Add kind" when Add kind is pressed', async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES));
    const { user } = await renderPage();
    await screen.findByRole("button", { name: "Edit Movies" });
    await user.click(screen.getByRole("button", { name: "Add kind" }));
    const dialog = screen.getByRole("dialog", { name: "Add kind" });
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue(
      "",
    );
  });

  it("a rename persists exactly as in the walkthrough: repo.update gets (id, { name }, updatedAt) and the row shows the new name", async () => {
    const renamed = { ...MOVIES, name: "Films", updatedAt: LATER };
    repo.listAll
      .mockResolvedValueOnce(rows(MOVIES, GYM))
      .mockResolvedValue(rows(renamed, GYM));
    repo.update.mockResolvedValue({ status: "ok", row: renamed });
    const { user } = await renderPage();
    await user.click(
      await screen.findByRole("button", { name: "Edit Movies" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Edit Movies" });
    const name = within(dialog).getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Films");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await screen.findByRole("button", { name: "Edit Films" }),
    ).toBeInTheDocument();
    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(repo.update).toHaveBeenCalledWith(
      MOVIES.id,
      { name: "Films" },
      MOVIES.updatedAt,
    );
    expect(rowNames()).toStrictEqual(["Films", "Gym"]);
  });
});

describe("?kind= opens the editor once the kinds are ready (AC-3, AC-4, Block 3)", () => {
  it("?kind={id} of a live kind renders with that kind's editor open, its Name holding the name", async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES, GYM));
    await renderPage({ search: `?kind=${MOVIES.id}` });
    const dialog = await screen.findByRole("dialog", { name: "Edit Movies" });
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue(
      "Movies",
    );
  });

  it("?kind={id} waits for a slow store, then opens the editor", async () => {
    let answer: (r: ListResult<Kind>) => void = () => {};
    repo.listAll.mockReturnValue(
      new Promise<ListResult<Kind>>((resolve) => {
        answer = resolve;
      }),
    );
    await renderPage({ search: `?kind=${GYM.id}`, prime: false });
    expect(screen.queryByRole("dialog")).toBeNull();
    answer(rows(MOVIES, GYM));
    const dialog = await screen.findByRole("dialog", { name: "Edit Gym" });
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue(
      "Gym",
    );
  });

  it('?kind=new opens the empty "Add kind" editor', async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES));
    await renderPage({ search: "?kind=new" });
    const dialog = await screen.findByRole("dialog", { name: "Add kind" });
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue(
      "",
    );
  });

  it('?kind=new opens the "Add kind" editor with zero live kinds (the legend\'s Add)', async () => {
    repo.listAll.mockResolvedValue(rows(GONE));
    await renderPage({ search: "?kind=new" });
    expect(
      await screen.findByRole("dialog", { name: "Add kind" }),
    ).toBeInTheDocument();
  });

  it.each([
    ["no ?kind=", ""],
    ["an unknown id", "?kind=00000000-0000-4000-8000-000000000099"],
    ["a soft-deleted kind's id", `?kind=${GONE.id}`],
    ["garbage", "?kind=movies"],
  ])("%s opens no editor", async (_label, search) => {
    repo.listAll.mockResolvedValue(rows(MOVIES, GONE));
    await renderPage({ search });
    await screen.findByRole("button", { name: "Edit Movies" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Back returns to the previous calendar route (AC-5, Block 3)", () => {
  it.each(["/week/2026-10-12", "/month/2026-10", "/day/2026-10-14", "/"])(
    "with state.from %s, goes there",
    async (from) => {
      repo.listAll.mockResolvedValue(rows(MOVIES));
      const { user } = await renderPage({ state: { from } });
      await user.click(screen.getByRole("button", { name: "Back" }));
      expect(
        await screen.findByRole("heading", { name: `Landed on ${from}` }),
      ).toBeInTheDocument();
    },
  );

  it.each([
    ["/capture, a shell route but not a calendar one", { from: "/capture" }],
    ["/kinds itself", { from: "/kinds" }],
    ["/monthly, which only looks like /month/", { from: "/monthly" }],
    ["a non-string from", { from: 42 }],
    ["no state at all", undefined],
  ])("with %s, goes to /", async (_label, state) => {
    repo.listAll.mockResolvedValue(rows(MOVIES));
    const { user } = await renderPage({ state });
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(
      await screen.findByRole("heading", { name: "Landed on /" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Event kinds" })).toBeNull();
  });
});
