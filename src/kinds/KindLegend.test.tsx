import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type JSX, useState } from "react";
import { MemoryRouter, Outlet, Route, Routes, useLocation } from "react-router";
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
import { createKindsStore, type KindsStore } from "../sync/kindsStore";
import { KindLegend } from "./KindLegend";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-008 AC-1, AC-2, AC-3, AC-4; Contract Block 2 (Block 5: rendered
// directly in a MemoryRouter over createKindsStore on a vi.fn-per-member
// repository fake). The shell owns `open`; here a small harness stands in
// for it, with one Legend button carrying data-legend-toggle. The /kinds
// route is a stand-in that prints the URL's search and the router state, so
// the legend's links are asserted without the real page.

const STAMP = "2026-10-16T08:00:00.000001+00:00";
/** The route the legend is opened on; `from` is pathname + search. */
const OPENED_ON = "/month/2026-10?focus=2026-10-14";

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

/** The shell's part: owns `open`, renders the toggle and the legend. */
function Harness(props: {
  store: KindsStore;
  onToggle: (open: boolean) => void;
  modal: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const toggle = (next: boolean) => {
    props.onToggle(next);
    setOpen(next);
  };
  return (
    <div>
      <label>
        Notes
        <input type="text" />
      </label>
      <label>
        Comment
        <textarea />
      </label>
      <button
        type="button"
        data-legend-toggle
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Legend
      </button>
      <KindLegend open={open} onToggle={toggle} store={props.store} />
      <p>Outside the legend</p>
      {props.modal ? (
        <dialog open aria-label="Some modal">
          <button type="button">Inside the modal</button>
        </dialog>
      ) : null}
      <Outlet />
    </div>
  );
}

function KindsStandIn(): JSX.Element {
  const location = useLocation();
  return (
    <section aria-label="Kinds stand-in">
      <p>search={location.search}</p>
      <p>state={JSON.stringify(location.state ?? null)}</p>
    </section>
  );
}

/**
 * Renders the harness. The store is loaded first (unless `prime` is false)
 * so no test depends on whether the legend reads the store while closed:
 * the Contract does not say, and a closed legend renders null.
 */
async function renderLegend(
  options: { modal?: boolean; prime?: boolean } = {},
) {
  const user = userEvent.setup();
  const store = createKindsStore(repo);
  if (options.prime ?? true) {
    await store.refresh();
    expect(store.getSnapshot().status).toBe("ready");
  }
  const onToggle = vi.fn<(open: boolean) => void>();
  render(
    <MemoryRouter initialEntries={[OPENED_ON]}>
      <Routes>
        <Route
          element={
            <Harness
              store={store}
              onToggle={onToggle}
              modal={options.modal ?? false}
            />
          }
        >
          <Route path="/month/:ym" element={<p>Month stand-in</p>} />
          <Route path="/kinds" element={<KindsStandIn />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  return { user, store, onToggle };
}

const legendButton = () => screen.getByRole("button", { name: "Legend" });
const legend = () => screen.getByRole("dialog", { name: "Kind legend" });
const queryLegend = () => screen.queryByRole("dialog", { name: "Kind legend" });

/** Opens the legend with a click on Legend. */
async function openWithClick(user: ReturnType<typeof userEvent.setup>) {
  await user.click(legendButton());
  return legend();
}

function swatchOf(row: HTMLElement): HTMLElement {
  const swatch = row.querySelector<HTMLElement>('[aria-hidden="true"]');
  if (swatch === null) throw new Error("the row has no aria-hidden swatch");
  return swatch;
}

function standIn() {
  const section = screen.getByRole("region", { name: "Kinds stand-in" });
  const [search, state] = within(section)
    .getAllByText(/^(search|state)=/)
    .map((p) => p.textContent);
  return { search, state };
}

describe("the kind legend with live kinds (AC-1, Block 2)", () => {
  it('is absent until Legend is pressed, then is a dialog named by its heading "Kind legend"', async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES));
    const { user } = await renderLegend();
    expect(queryLegend()).toBeNull();
    const dialog = await openWithClick(user);
    const title = within(dialog).getByRole("heading", {
      level: 2,
      name: "Kind legend",
    });
    expect(dialog).toHaveAttribute("aria-labelledby", title.id);
    expect(dialog).toHaveAttribute("data-legend");
    expect(dialog.firstElementChild).toBe(title);
  });

  it("lists every live kind as a list item, in sort_order, leaving soft-deleted kinds out", async () => {
    repo.listAll.mockResolvedValue(rows(GYM, ENTERTAINMENT, GONE, MOVIES));
    const { user } = await renderLegend();
    const dialog = await openWithClick(user);
    const list = within(dialog).getByRole("list");
    expect(list.tagName).toBe("UL");
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => li.tagName)).toStrictEqual(["LI", "LI", "LI"]);
    for (const [i, name] of ["Movies", "Entertainment", "Gym"].entries()) {
      expect(
        within(items[i] as HTMLElement).getByRole("link"),
      ).toHaveAccessibleName(name);
    }
    expect(within(dialog).queryByText("Flights")).toBeNull();
  });

  it("each row is exactly one link named by the kind's name, to /kinds?kind={id}", async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES, ENTERTAINMENT, GYM));
    const { user } = await renderLegend();
    const dialog = await openWithClick(user);
    const items = within(within(dialog).getByRole("list")).getAllByRole(
      "listitem",
    );
    for (const [i, k] of [MOVIES, ENTERTAINMENT, GYM].entries()) {
      const item = items[i] as HTMLElement;
      const links = within(item).getAllByRole("link");
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAccessibleName(k.name);
      expect(links[0]).toHaveAttribute("href", `/kinds?kind=${k.id}`);
    }
    expect(
      within(dialog).getByRole("link", { name: "Movies" }),
    ).toBeInTheDocument();
  });

  it("each row shows the swatch with the initial and both themes' colours, then the name in a span", async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES, ENTERTAINMENT));
    const { user } = await renderLegend();
    const dialog = await openWithClick(user);
    const movies = within(dialog).getByRole("link", { name: "Movies" });
    const swatch = swatchOf(movies);
    expect(swatch.tagName).toBe("SPAN");
    expect(swatch).toHaveTextContent(/^M$/);
    expect(swatch.style.getPropertyValue("--swatch-light")).toBe("#7E3FB8");
    expect(swatch.style.getPropertyValue("--swatch-dark")).toBe("#CFA8F0");
    const name = within(movies).getByText("Movies");
    expect(name.tagName).toBe("SPAN");
    expect(
      swatch.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const ent = swatchOf(
      within(dialog).getByRole("link", { name: "Entertainment" }),
    );
    expect(ent).toHaveTextContent(/^E$/);
    expect(ent.style.getPropertyValue("--swatch-light")).toBe("#BD8200");
    expect(ent.style.getPropertyValue("--swatch-dark")).toBe("#F5CC6A");
  });

  it('ends with a "Manage kinds" link to /kinds after the list, and holds no other control', async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES, GYM));
    const { user } = await renderLegend();
    const dialog = await openWithClick(user);
    const manage = within(dialog).getByRole("link", { name: "Manage kinds" });
    expect(manage).toHaveAttribute("href", "/kinds");
    const list = within(dialog).getByRole("list");
    expect(
      list.compareDocumentPosition(manage) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(list).not.toContainElement(manage);
    const links = within(dialog).getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAccessibleName("Movies");
    expect(links[1]).toHaveAccessibleName("Gym");
    expect(links[2]).toBe(manage);
    expect(within(dialog).queryAllByRole("button")).toHaveLength(0);
    expect(within(dialog).queryByText("No kinds. Add one.")).toBeNull();
  });

  it("moves focus to the first row link when it opens", async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES, GYM));
    const { user } = await renderLegend();
    const dialog = await openWithClick(user);
    expect(within(dialog).getByRole("link", { name: "Movies" })).toHaveFocus();
  });

  it("while the kinds are still loading, shows the heading only", async () => {
    repo.listAll.mockReturnValue(new Promise<ListResult<Kind>>(() => {}));
    const { user } = await renderLegend({ prime: false });
    await user.click(legendButton());
    const dialog = legend();
    expect(
      within(dialog).getByRole("heading", { name: "Kind legend" }),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole("list")).toBeNull();
    expect(within(dialog).queryAllByRole("link")).toHaveLength(0);
    expect(within(dialog).queryAllByRole("button")).toHaveLength(0);
    expect(within(dialog).queryByText("No kinds. Add one.")).toBeNull();
  });
});

describe("closing the legend and returning focus (AC-2, Block 2)", () => {
  it("Escape closes it, asks the shell to close with onToggle(false), and returns focus to Legend", async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES));
    const { user, onToggle } = await renderLegend();
    await openWithClick(user);
    expect(legendButton()).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(queryLegend()).toBeNull();
    expect(onToggle).toHaveBeenLastCalledWith(false);
    expect(legendButton()).toHaveAttribute("aria-expanded", "false");
    expect(legendButton()).toHaveFocus();
  });

  it("a pointer going down outside the legend closes it and returns focus to Legend", async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES));
    const { user, onToggle } = await renderLegend();
    await openWithClick(user);
    await user.click(screen.getByText("Outside the legend"));
    expect(queryLegend()).toBeNull();
    expect(onToggle).toHaveBeenLastCalledWith(false);
    // See Block 2 (amended in RED): the pointer's own mousedown blurs to
    // <body> after a pointerdown listener runs, so the return may land a
    // tick later. It must land.
    await vi.waitFor(() => expect(legendButton()).toHaveFocus());
  });

  it("a pointer going down inside the legend leaves it open", async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES));
    const { user } = await renderLegend();
    const dialog = await openWithClick(user);
    await user.click(
      within(dialog).getByRole("heading", { name: "Kind legend" }),
    );
    expect(legend()).toBeInTheDocument();
  });

  it("pressing Legend again closes it: a pointer on the toggle is not an outside click", async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES));
    const { user } = await renderLegend();
    await openWithClick(user);
    await user.click(legendButton());
    expect(queryLegend()).toBeNull();
    expect(legendButton()).toHaveAttribute("aria-expanded", "false");
    await user.click(legendButton());
    expect(legend()).toBeInTheDocument();
  });

  it("when opened with L from nowhere, Escape returns focus to the Legend toggle", async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES));
    const { user } = await renderLegend();
    expect(document.activeElement).toBe(document.body);
    await user.keyboard("l");
    expect(legend()).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(queryLegend()).toBeNull();
    expect(legendButton()).toHaveFocus();
  });
});

describe("the L shortcut (AC-2, Block 2)", () => {
  it("L toggles the legend open and closed when focus is not in a text field", async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES));
    const { user, onToggle } = await renderLegend();
    await user.keyboard("l");
    expect(onToggle).toHaveBeenLastCalledWith(true);
    expect(legend()).toBeInTheDocument();
    expect(legendButton()).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("L");
    expect(onToggle).toHaveBeenLastCalledWith(false);
    expect(queryLegend()).toBeNull();
  });

  it("upper-case L opens it too, with focus on a non-text control", async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES));
    const { user } = await renderLegend();
    legendButton().focus();
    await user.keyboard("L");
    expect(legend()).toBeInTheDocument();
  });

  it.each([
    ["Notes", "an input"],
    ["Comment", "a textarea"],
  ])(
    "L typed into %s (%s) types the letter and does not toggle the legend",
    async (label) => {
      repo.listAll.mockResolvedValue(rows(MOVIES));
      const { user, onToggle } = await renderLegend();
      const field = screen.getByLabelText(label);
      await user.click(field);
      await user.keyboard("lL");
      expect(field).toHaveValue("lL");
      expect(queryLegend()).toBeNull();
      expect(onToggle).not.toHaveBeenCalled();
      // The listener is live: the same key from outside the field opens it.
      legendButton().focus();
      await user.keyboard("l");
      expect(legend()).toBeInTheDocument();
    },
  );

  it("L typed into a text field does not close an open legend either", async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES));
    const { user } = await renderLegend();
    await openWithClick(user);
    screen.getByLabelText("Notes").focus();
    await user.keyboard("l");
    expect(legend()).toBeInTheDocument();
  });

  it.each([
    ["Control", "{Control>}l{/Control}"],
    ["Meta", "{Meta>}l{/Meta}"],
    ["Alt", "{Alt>}l{/Alt}"],
  ])("L with %s held does not toggle the legend", async (_name, keys) => {
    repo.listAll.mockResolvedValue(rows(MOVIES));
    const { user, onToggle } = await renderLegend();
    await user.keyboard(keys);
    expect(queryLegend()).toBeNull();
    expect(onToggle).not.toHaveBeenCalled();
    // The listener is live: the bare key opens it.
    await user.keyboard("l");
    expect(legend()).toBeInTheDocument();
  });

  it("L pressed inside an open modal dialog does not toggle the legend", async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES));
    const { user, onToggle } = await renderLegend({ modal: true });
    screen.getByRole("button", { name: "Inside the modal" }).focus();
    await user.keyboard("l");
    expect(queryLegend()).toBeNull();
    expect(onToggle).not.toHaveBeenCalled();
    // The listener is live: the same key outside the modal opens it.
    legendButton().focus();
    await user.keyboard("l");
    expect(legend()).toBeInTheDocument();
  });
});

describe("activating a legend link (AC-3, Block 2)", () => {
  it("a row link goes to /kinds?kind={id}, carries the route it was opened on as state.from, and closes the legend", async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES, ENTERTAINMENT));
    const { user, onToggle } = await renderLegend();
    const dialog = await openWithClick(user);
    await user.click(
      within(dialog).getByRole("link", { name: "Entertainment" }),
    );
    expect(standIn()).toStrictEqual({
      search: `search=?kind=${ENTERTAINMENT.id}`,
      state: `state=${JSON.stringify({ from: OPENED_ON })}`,
    });
    expect(queryLegend()).toBeNull();
    expect(onToggle).toHaveBeenLastCalledWith(false);
    // PO decision 5: a close by navigation leaves focus to the route change.
    expect(legendButton()).not.toHaveFocus();
  });

  it('"Manage kinds" goes to /kinds with no search, carries state.from, and closes the legend', async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES));
    const { user } = await renderLegend();
    const dialog = await openWithClick(user);
    await user.click(
      within(dialog).getByRole("link", { name: "Manage kinds" }),
    );
    expect(standIn()).toStrictEqual({
      search: "search=",
      state: `state=${JSON.stringify({ from: OPENED_ON })}`,
    });
    expect(queryLegend()).toBeNull();
    expect(legendButton()).not.toHaveFocus();
  });
});

describe("the kind legend with zero live kinds (AC-4, Block 2)", () => {
  it('reads "No kinds. Add one." with an Add button, and no list and no Manage kinds link', async () => {
    repo.listAll.mockResolvedValue(rows(GONE));
    const { user } = await renderLegend();
    const dialog = await openWithClick(user);
    const line = within(dialog).getByText("No kinds. Add one.");
    expect(line.tagName).toBe("P");
    const add = within(dialog).getByRole("button", { name: "Add" });
    expect(add).toHaveAttribute("type", "button");
    expect(
      line.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(dialog).queryByRole("list")).toBeNull();
    expect(dialog.querySelector("ul")).toBeNull();
    expect(
      within(dialog).queryByRole("link", { name: "Manage kinds" }),
    ).toBeNull();
    expect(within(dialog).queryAllByRole("link")).toHaveLength(0);
    expect(within(dialog).queryByText("Flights")).toBeNull();
  });

  it("moves focus to Add when it opens", async () => {
    repo.listAll.mockResolvedValue(rows(GONE));
    const { user } = await renderLegend();
    const dialog = await openWithClick(user);
    expect(within(dialog).getByRole("button", { name: "Add" })).toHaveFocus();
  });

  it("Add goes to /kinds?kind=new with state.from and closes the legend", async () => {
    repo.listAll.mockResolvedValue(rows(GONE));
    const { user, onToggle } = await renderLegend();
    const dialog = await openWithClick(user);
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(standIn()).toStrictEqual({
      search: "search=?kind=new",
      state: `state=${JSON.stringify({ from: OPENED_ON })}`,
    });
    expect(queryLegend()).toBeNull();
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });
});
