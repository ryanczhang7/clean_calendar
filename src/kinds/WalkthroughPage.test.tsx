import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
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
import { WalkthroughPage } from "./WalkthroughPage";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-007 AC-1, AC-2, AC-5, AC-6, AC-7; Contract Block 6 (Block 8: rendered
// directly in a MemoryRouter and a ToastProvider, over createKindsStore and
// createKindActions on a hand-written repository fake). The "/" route is a
// stand-in, so "Done" is observed as a navigation, not as a calendar.

const LINE =
  "Every event gets a kind, and the kind decides its colour. Rename, recolour or remove these, or add your own. You can change them later.";
const STAMP = "2026-10-16T08:00:00.000001+00:00";
const LATER = "2026-10-16T09:30:00.000002+00:00";

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

function renderPage() {
  const user = userEvent.setup();
  const store = createKindsStore(repo);
  const actions = createKindActions(repo, store);
  render(
    <MemoryRouter initialEntries={["/welcome"]}>
      <ToastProvider>
        <Routes>
          <Route
            path="/welcome"
            element={<WalkthroughPage store={store} actions={actions} />}
          />
          <Route path="/" element={<h1>Calendar stand-in</h1>} />
        </Routes>
        <ToastHost />
      </ToastProvider>
    </MemoryRouter>,
  );
  return { user, store };
}

const done = () =>
  screen.getByRole("button", { name: "Done, show my calendar" });

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

describe("the walkthrough page (AC-1, Block 6)", () => {
  it('has the heading "Your event kinds", focusable by script, and the voice.md line', async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES));
    renderPage();
    const h1 = screen.getByRole("heading", {
      level: 1,
      name: "Your event kinds",
    });
    expect(h1).toHaveAttribute("tabindex", "-1");
    const line = screen.getByText(LINE);
    expect(line.tagName).toBe("P");
    await screen.findByRole("button", { name: "Edit Movies" });
  });

  it("lists the live kinds from the store in sort_order, leaving soft-deleted ones out", async () => {
    repo.listAll.mockResolvedValue(rows(ENTERTAINMENT, GONE, MOVIES));
    renderPage();
    await screen.findByRole("button", { name: "Edit Movies" });
    expect(rowNames()).toStrictEqual(["Movies", "Entertainment"]);
  });

  it('offers "Add kind" and "Done, show my calendar", in that order after the list, and no Back or reorder control', async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES));
    renderPage();
    await screen.findByRole("button", { name: "Edit Movies" });
    const add = screen.getByRole("button", { name: "Add kind" });
    expect(add).toHaveAttribute("type", "button");
    expect(done()).toHaveAttribute("type", "button");
    const list = screen.getByRole("list", { name: "Kinds" });
    expect(
      list.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      add.compareDocumentPosition(done()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(
      screen
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label") ?? b.textContent),
    ).toStrictEqual(["Edit Movies", "Add kind", "Done, show my calendar"]);
  });

  it("opens the editor for a row's kind when its Edit button is pressed", async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES, GYM));
    const { user } = renderPage();
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(await screen.findByRole("button", { name: "Edit Gym" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Gym" });
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue(
      "Gym",
    );
  });

  it('opens an empty editor titled "Add kind" when Add kind is pressed', async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES));
    const { user } = renderPage();
    await screen.findByRole("button", { name: "Edit Movies" });
    await user.click(screen.getByRole("button", { name: "Add kind" }));
    const dialog = screen.getByRole("dialog", { name: "Add kind" });
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue(
      "",
    );
  });
});

describe("edits made in the walkthrough reach the repository and the list (AC-2, AC-5, AC-6)", () => {
  it("a rename is sent with the kind's own updatedAt, and the row then shows the new name (AC-2)", async () => {
    const renamed = { ...GYM, name: "Workouts", updatedAt: LATER };
    repo.listAll
      .mockResolvedValueOnce(rows(MOVIES, GYM))
      .mockResolvedValue(rows(MOVIES, renamed));
    repo.update.mockResolvedValue({ status: "ok", row: renamed });
    const { user } = renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit Gym" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Gym" });
    const name = within(dialog).getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Workouts");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await screen.findByRole("button", { name: "Edit Workouts" }),
    ).toBeInTheDocument();
    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(repo.update).toHaveBeenCalledWith(
      GYM.id,
      { name: "Workouts" },
      STAMP,
    );
    expect(rowNames()).toStrictEqual(["Movies", "Workouts"]);
    expect(screen.queryByRole("dialog", { name: "Edit Gym" })).toBeNull();
  });

  it("a confirmed delete soft-deletes the kind, its row disappears and the toast is shown (AC-5)", async () => {
    const deleted = { ...GYM, deletedAt: LATER, updatedAt: LATER };
    repo.listAll
      .mockResolvedValueOnce(rows(MOVIES, GYM))
      .mockResolvedValue(rows(MOVIES, deleted));
    repo.remove.mockResolvedValue({ status: "ok", row: deleted });
    const { user } = renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit Gym" }));
    await user.click(screen.getByRole("button", { name: "Delete Gym" }));
    const confirm = screen.getByRole("dialog", {
      name: "Delete the kind Gym?",
    });
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));
    expect(
      await screen.findByText(
        "Deleted the kind Gym. Its events now show as Kind removed.",
      ),
    ).toBeInTheDocument();
    expect(repo.remove).toHaveBeenCalledTimes(1);
    expect(repo.remove).toHaveBeenCalledWith(GYM.id, STAMP);
    expect(repo.update).not.toHaveBeenCalled();
    expect(rowNames()).toStrictEqual(["Movies"]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("an added kind is inserted with the next sort_order and appears last (AC-6)", async () => {
    const added = kind(9, "Climbing", "#BD8200", "#F5CC6A", {
      isDefault: false,
    });
    repo.listAll
      .mockResolvedValueOnce(rows(MOVIES, GYM))
      .mockResolvedValue(rows(MOVIES, GYM, added));
    repo.insert.mockResolvedValue({ status: "ok", row: added });
    const { user } = renderPage();
    await screen.findByRole("button", { name: "Edit Gym" });
    await user.click(screen.getByRole("button", { name: "Add kind" }));
    const dialog = screen.getByRole("dialog", { name: "Add kind" });
    await user.type(
      within(dialog).getByRole("textbox", { name: "Name" }),
      "Climbing",
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await screen.findByRole("button", { name: "Edit Climbing" }),
    ).toBeInTheDocument();
    expect(repo.insert).toHaveBeenCalledTimes(1);
    expect(repo.insert).toHaveBeenCalledWith({
      name: "Climbing",
      colorLight: "#BD8200",
      colorDark: "#F5CC6A",
      sortOrder: 9,
      isDefault: false,
    });
    expect(rowNames()).toStrictEqual(["Movies", "Gym", "Climbing"]);
  });
});

describe('"Done, show my calendar" (AC-7, Block 6)', () => {
  it("with kinds, sets cc.onboarded and goes to /", async () => {
    repo.listAll.mockResolvedValue(rows(MOVIES));
    const { user } = renderPage();
    await screen.findByRole("button", { name: "Edit Movies" });
    expect(done()).not.toHaveAttribute("aria-disabled", "true");
    await user.click(done());
    expect(localStorage.getItem("cc.onboarded")).toBe("1");
    expect(
      await screen.findByRole("heading", { name: "Calendar stand-in" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Your event kinds" }),
    ).toBeNull();
  });

  it("with zero live kinds is aria-disabled, and a click does nothing", async () => {
    repo.listAll.mockResolvedValue(rows(GONE));
    const { user, store } = renderPage();
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe("ready"));
    expect(rowNames()).toStrictEqual([]);
    expect(done()).toHaveAttribute("aria-disabled", "true");
    await user.click(done());
    expect(localStorage.getItem("cc.onboarded")).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Calendar stand-in" }),
    ).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Your event kinds" }),
    ).toBeInTheDocument();
  });

  it("is aria-disabled while the kinds are still loading", async () => {
    repo.listAll.mockReturnValue(new Promise<ListResult<Kind>>(() => {}));
    const { user } = renderPage();
    expect(done()).toHaveAttribute("aria-disabled", "true");
    await user.click(done());
    expect(localStorage.getItem("cc.onboarded")).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Calendar stand-in" }),
    ).toBeNull();
  });

  it("becomes aria-disabled once the last kind is deleted", async () => {
    const deleted = { ...MOVIES, deletedAt: LATER, updatedAt: LATER };
    repo.listAll
      .mockResolvedValueOnce(rows(MOVIES))
      .mockResolvedValue(rows(deleted));
    repo.remove.mockResolvedValue({ status: "ok", row: deleted });
    const { user } = renderPage();
    await user.click(
      await screen.findByRole("button", { name: "Edit Movies" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete Movies" }));
    const confirm = screen.getByRole("dialog", {
      name: "Delete the kind Movies?",
    });
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));
    await vi.waitFor(() => expect(rowNames()).toStrictEqual([]));
    expect(done()).toHaveAttribute("aria-disabled", "true");
  });
});
