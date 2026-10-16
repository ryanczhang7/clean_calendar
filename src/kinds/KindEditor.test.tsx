import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, type Mock, vi } from "vitest";
import type { Result } from "../data/result";
import type { Kind } from "../data/rows";
import type { KindActions } from "../sync/kindActions";
import { ToastHost, ToastProvider } from "../ui/Toast";
import { KindEditor } from "./KindEditor";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-007 AC-2..AC-6, Contract Block 5. KindEditor is rendered directly with
// a hand-written KindActions fake (Block 8); the repository behind the real
// actions is kindActions.test.ts's business.
//
// Oracles. Copy is quoted from the Contract (voice.md). Every contrast number
// is READ OUT: the chip-text ratios of palette colours from CAL-006's table
// (colour.test.ts, PALETTE and CONTROLS); the against-background ratios, the
// custom-colour ratios and the Block 1 hexes (#858585, #757575, #7EB4F1)
// from RED's standalone re-derivation, recorded in the story's handoff. None
// is computed here from src/domain/colour.

const STAMP = "2026-10-16T08:00:00.000001+00:00";

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
const GYM = kind(8, "Gym", "#2E7D32", "#9BD69B");
// Custom on both sides, so both hex inputs are showing when it opens.
const CLIMBING = kind(12, "Climbing", "#1565C0", "#7EB4F1", {
  isDefault: false,
});
const KINDS = [MOVIES, GYM, CLIMBING];

const PALETTE_NAMES = [
  "Movies",
  "Entertainment",
  "Flights",
  "Hotel stays",
  "Other travel",
  "Restaurant reservations",
  "Birthdays",
  "Gym",
  "Work / meetings",
  "Appointments",
  "Social / personal",
  "Custom…",
];

const PALETTE_LIGHTS = [
  "#7E3FB8",
  "#BD8200",
  "#0B6E80",
  "#5147C9",
  "#0D7265",
  "#BF4A17",
  "#C2185B",
  "#2E7D32",
  "#2A5BD7",
  "#7D5234",
  "#5E7114",
];

type FakeActions = {
  addKind: Mock<KindActions["addKind"]>;
  updateKind: Mock<KindActions["updateKind"]>;
  deleteKind: Mock<KindActions["deleteKind"]>;
};

function fakeActions(): FakeActions {
  return {
    addKind: vi.fn<KindActions["addKind"]>(async (input) => ({
      status: "ok",
      row: {
        ...kind(99, input.name, input.colorLight, input.colorDark),
        ...input,
      },
    })),
    updateKind: vi.fn<KindActions["updateKind"]>(async (k, patch) => ({
      status: "ok",
      row: { ...k, ...patch },
    })),
    deleteKind: vi.fn<KindActions["deleteKind"]>(async (k) => ({
      status: "ok",
      row: { ...k, deletedAt: STAMP },
    })),
  };
}

function renderEditor(
  props: { kind: Kind | null; kinds?: Kind[]; actions?: FakeActions } = {
    kind: GYM,
  },
) {
  const user = userEvent.setup();
  const actions = props.actions ?? fakeActions();
  const onClose = vi.fn<() => void>();
  render(
    <MemoryRouter>
      <ToastProvider>
        <KindEditor
          open
          kind={props.kind}
          kinds={props.kinds ?? KINDS}
          onClose={onClose}
          actions={actions}
        />
        <ToastHost />
      </ToastProvider>
    </MemoryRouter>,
  );
  const title = props.kind === null ? "Add kind" : `Edit ${props.kind.name}`;
  const dialog = screen.getByRole("dialog", { name: title });
  return { user, actions, onClose, dialog };
}

const group = (theme: "Light" | "Dark") =>
  screen.getByRole("radiogroup", { name: `${theme} theme colour` });
const radio = (theme: "Light" | "Dark", name: string) =>
  within(group(theme)).getByRole("radio", { name });
const hexInput = (theme: "Light" | "Dark") =>
  within(group(theme)).getByRole("textbox", { name: "Hex" });
const nameInput = () => screen.getByRole("textbox", { name: "Name" });
const saveButton = (dialog: HTMLElement) =>
  within(dialog).getByRole("button", { name: "Save" });

function preview(theme: "light" | "dark"): string {
  const p = document.querySelector(`p[data-preview="${theme}"]`);
  if (p === null) throw new Error(`no <p data-preview="${theme}">`);
  return p.textContent ?? "";
}

/** The radios of one group whose aria-checked is "true", by name. */
function checked(theme: "Light" | "Dark"): string[] {
  return within(group(theme))
    .getAllByRole("radio")
    .filter((r) => r.getAttribute("aria-checked") === "true")
    .map((r) => r.getAttribute("aria-label") ?? r.textContent ?? "");
}

async function replaceText(
  user: ReturnType<typeof userEvent.setup>,
  input: HTMLElement,
  text: string,
) {
  await user.clear(input);
  await user.type(input, text);
}

// --- the form ---------------------------------------------------------------

describe("the editor's fields (Block 5)", () => {
  it('is a dialog titled "Edit {name}" with the name field holding the kind\'s name, at most 32 characters', () => {
    renderEditor({ kind: GYM });
    expect(nameInput()).toHaveValue("Gym");
    expect(nameInput()).toHaveAttribute("maxlength", "32");
  });

  it('is titled "Add kind" with an empty name for a new kind', () => {
    renderEditor({ kind: null });
    expect(nameInput()).toHaveValue("");
  });

  it("offers the eleven palette colours and Custom… as radios in each theme's group, in palette order", () => {
    renderEditor({ kind: GYM });
    for (const theme of ["Light", "Dark"] as const) {
      const radios = within(group(theme)).getAllByRole("radio");
      expect(
        radios.map((r) => r.getAttribute("aria-label") ?? r.textContent),
      ).toStrictEqual(PALETTE_NAMES);
    }
  });

  it("checks the palette radio matching the kind's colour in each theme, and only that one", () => {
    renderEditor({ kind: GYM });
    expect(checked("Light")).toStrictEqual(["Gym"]);
    expect(checked("Dark")).toStrictEqual(["Gym"]);
  });

  it("matches a palette colour stored in lower case", () => {
    renderEditor({
      kind: kind(5, "Shows", "#bd8200", "#f5cc6a"),
      kinds: [kind(5, "Shows", "#bd8200", "#f5cc6a")],
    });
    expect(checked("Light")).toStrictEqual(["Entertainment"]);
    expect(checked("Dark")).toStrictEqual(["Entertainment"]);
  });

  it("checks Custom… and shows the hex and a colour picker when the colour is not a palette one", () => {
    renderEditor({ kind: CLIMBING });
    expect(checked("Light")).toStrictEqual(["Custom…"]);
    expect(checked("Dark")).toStrictEqual(["Custom…"]);
    expect(hexInput("Light")).toHaveValue("#1565C0");
    expect(hexInput("Dark")).toHaveValue("#7EB4F1");
    const picker = within(group("Light")).getByLabelText("Pick a colour");
    expect(picker).toHaveAttribute("type", "color");
  });

  it("shows no hex input while a palette colour is checked", () => {
    renderEditor({ kind: GYM });
    expect(
      within(group("Light")).queryByRole("textbox", { name: "Hex" }),
    ).toBeNull();
  });

  it("pressing Custom… checks it and reveals the hex input holding the current colour", async () => {
    const { user } = renderEditor({ kind: GYM });
    await user.click(radio("Light", "Custom…"));
    expect(checked("Light")).toStrictEqual(["Custom…"]);
    expect(hexInput("Light")).toHaveValue("#2E7D32");
  });

  it("disables Save while the trimmed name is empty", async () => {
    const { user, dialog } = renderEditor({ kind: GYM });
    expect(saveButton(dialog)).toBeEnabled();
    await replaceText(user, nameInput(), "   ");
    expect(saveButton(dialog)).toBeDisabled();
  });

  it("Save is a submit button and Cancel closes without saving", async () => {
    const { user, dialog, actions, onClose } = renderEditor({ kind: GYM });
    expect(saveButton(dialog)).toHaveAttribute("type", "submit");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(actions.updateKind).not.toHaveBeenCalled();
  });
});

// --- AC-2 -------------------------------------------------------------------

describe("renaming a kind (AC-2, Block 5)", () => {
  it("saves only the changed name through updateKind, once, then closes", async () => {
    const { user, dialog, actions, onClose } = renderEditor({ kind: GYM });
    await replaceText(user, nameInput(), "Workouts");
    await user.click(saveButton(dialog));
    expect(actions.updateKind).toHaveBeenCalledTimes(1);
    expect(actions.updateKind).toHaveBeenCalledWith(GYM, { name: "Workouts" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("trims the name it saves", async () => {
    const { user, dialog, actions } = renderEditor({ kind: GYM });
    await replaceText(user, nameInput(), "  Workouts ");
    await user.click(saveButton(dialog));
    expect(actions.updateKind).toHaveBeenCalledWith(GYM, { name: "Workouts" });
  });

  it("an unchanged kind saves an empty patch, and still calls updateKind", async () => {
    const { user, dialog, actions, onClose } = renderEditor({ kind: GYM });
    await user.click(saveButton(dialog));
    expect(actions.updateKind).toHaveBeenCalledTimes(1);
    expect(actions.updateKind).toHaveBeenCalledWith(GYM, {});
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("refuses a name that matches another live kind ignoring case (gym beside Gym) and saves nothing", async () => {
    const { user, dialog, actions, onClose } = renderEditor({ kind: MOVIES });
    await replaceText(user, nameInput(), "gym");
    expect(saveButton(dialog)).toBeEnabled();
    await user.click(saveButton(dialog));
    expect(nameInput()).toHaveAttribute("aria-invalid", "true");
    expect(nameInput()).toHaveAccessibleDescription(
      "You already have a kind called Gym.",
    );
    expect(nameInput()).toHaveFocus();
    expect(actions.updateKind).not.toHaveBeenCalled();
    expect(actions.addKind).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("refuses a name that exactly matches another live kind (Gym beside Gym) and saves nothing", async () => {
    const { user, dialog, actions, onClose } = renderEditor({ kind: MOVIES });
    await replaceText(user, nameInput(), "Gym");
    await user.click(saveButton(dialog));
    expect(nameInput()).toHaveAttribute("aria-invalid", "true");
    expect(nameInput()).toHaveAccessibleDescription(
      "You already have a kind called Gym.",
    );
    expect(nameInput()).toHaveFocus();
    expect(actions.updateKind).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("compares trimmed names: ' Gym ' beside Gym is refused", async () => {
    const { user, dialog, actions } = renderEditor({ kind: MOVIES });
    await replaceText(user, nameInput(), " Gym ");
    await user.click(saveButton(dialog));
    expect(nameInput()).toHaveAccessibleDescription(
      "You already have a kind called Gym.",
    );
    expect(actions.updateKind).not.toHaveBeenCalled();
  });

  it("names the other kind as it is stored, whatever case was typed", async () => {
    const { user, dialog } = renderEditor({ kind: GYM });
    await replaceText(user, nameInput(), "CLIMBING");
    await user.click(saveButton(dialog));
    expect(nameInput()).toHaveAccessibleDescription(
      "You already have a kind called Climbing.",
    );
  });

  it("is not a duplicate of itself: renaming Gym to GYM saves", async () => {
    const { user, dialog, actions, onClose } = renderEditor({ kind: GYM });
    await replaceText(user, nameInput(), "GYM");
    await user.click(saveButton(dialog));
    expect(nameInput()).not.toHaveAttribute("aria-invalid", "true");
    expect(actions.updateKind).toHaveBeenCalledWith(GYM, { name: "GYM" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("marks Save busy while the save is pending", async () => {
    const actions = fakeActions();
    let finish: (r: Result<Kind>) => void = () => {};
    actions.updateKind.mockImplementation(
      () =>
        new Promise<Result<Kind>>((done) => {
          finish = done;
        }),
    );
    const { user, dialog } = renderEditor({ kind: GYM, actions });
    await replaceText(user, nameInput(), "Workouts");
    await user.click(saveButton(dialog));
    expect(saveButton(dialog)).toHaveAttribute("aria-busy", "true");
    finish({ status: "ok", row: { ...GYM, name: "Workouts" } });
  });

  it.each<[string, Result<Kind>]>([
    ["offline", { status: "offline" }],
    ["conflict", { status: "conflict" }],
    ["error", { status: "error", code: "23505", message: "duplicate key" }],
  ])(
    "a save that comes back %s shows the alert strip and keeps the editor open",
    async (_label, result) => {
      const actions = fakeActions();
      actions.updateKind.mockResolvedValue(result);
      const { user, dialog, onClose } = renderEditor({ kind: GYM, actions });
      expect(within(dialog).queryByRole("alert")).toBeNull();
      await replaceText(user, nameInput(), "Workouts");
      await user.click(saveButton(dialog));
      const alert = await within(dialog).findByRole("alert");
      expect(alert).toHaveTextContent(/^Couldn't save\. Try again\.$/);
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: "Edit Gym" })).toBe(dialog);
    },
  );
});

// --- AC-3 -------------------------------------------------------------------

const ENTERTAINMENT_LIGHT_PREVIEW =
  "Text contrast 5.20:1 · Against background 3.30:1";
const ENTERTAINMENT_DARK_PREVIEW =
  "Text contrast 11.22:1 · Against background 12.06:1";

describe("choosing colours (AC-3, Block 5)", () => {
  it("picking Entertainment for the light theme moves the dark theme to Entertainment's dark colour", async () => {
    const { user, dialog, actions } = renderEditor({ kind: GYM });
    await user.click(radio("Light", "Entertainment"));
    expect(checked("Light")).toStrictEqual(["Entertainment"]);
    expect(checked("Dark")).toStrictEqual(["Entertainment"]);
    await user.click(saveButton(dialog));
    expect(actions.updateKind).toHaveBeenCalledWith(GYM, {
      colorLight: "#BD8200",
      colorDark: "#F5CC6A",
    });
  });

  it("the preview reads each theme's text contrast and contrast against its own surface", async () => {
    const { user } = renderEditor({ kind: GYM });
    await user.click(radio("Light", "Entertainment"));
    expect(preview("light")).toBe(ENTERTAINMENT_LIGHT_PREVIEW);
    expect(preview("dark")).toBe(ENTERTAINMENT_DARK_PREVIEW);
  });

  it("the preview for the kind as opened reads Gym's numbers", () => {
    renderEditor({ kind: GYM });
    expect(preview("light")).toBe(
      "Text contrast 5.13:1 · Against background 5.13:1",
    );
    expect(preview("dark")).toBe(
      "Text contrast 10.21:1 · Against background 10.97:1",
    );
  });

  it("a dark colour picked by hand is kept when a light colour is picked afterwards", async () => {
    const { user, dialog, actions } = renderEditor({ kind: GYM });
    await user.click(radio("Dark", "Movies"));
    await user.click(radio("Light", "Entertainment"));
    expect(checked("Light")).toStrictEqual(["Entertainment"]);
    expect(checked("Dark")).toStrictEqual(["Movies"]);
    await user.click(saveButton(dialog));
    expect(actions.updateKind).toHaveBeenCalledWith(GYM, {
      colorLight: "#BD8200",
      colorDark: "#CFA8F0",
    });
  });

  it("a dark hex typed by hand is kept when a light colour is picked afterwards, and saved upper-case", async () => {
    const { user, dialog, actions } = renderEditor({ kind: CLIMBING });
    await replaceText(user, hexInput("Dark"), "#abcdef");
    await user.click(radio("Light", "Entertainment"));
    expect(hexInput("Dark")).toHaveValue("#abcdef");
    await user.click(saveButton(dialog));
    expect(actions.updateKind).toHaveBeenCalledWith(CLIMBING, {
      colorLight: "#BD8200",
      colorDark: "#ABCDEF",
    });
  });

  it("picking a dark colour never changes the light one", async () => {
    const { user, dialog, actions } = renderEditor({ kind: GYM });
    await user.click(radio("Dark", "Flights"));
    expect(checked("Light")).toStrictEqual(["Gym"]);
    expect(checked("Dark")).toStrictEqual(["Flights"]);
    await user.click(saveButton(dialog));
    expect(actions.updateKind).toHaveBeenCalledWith(GYM, {
      colorDark: "#7AD4E4",
    });
  });

  it("a custom light hex proposes darkCounterpart for the dark theme: #1565C0 -> #7EB4F1", async () => {
    const { user, dialog, actions } = renderEditor({ kind: GYM });
    await user.click(radio("Light", "Custom…"));
    await replaceText(user, hexInput("Light"), "#1565C0");
    expect(checked("Dark")).toStrictEqual(["Custom…"]);
    expect(hexInput("Dark")).toHaveValue("#7EB4F1");
    await user.click(saveButton(dialog));
    expect(actions.updateKind).toHaveBeenCalledWith(GYM, {
      colorLight: "#1565C0",
      colorDark: "#7EB4F1",
    });
  });

  it("a custom light hex leaves a hand-picked dark colour alone", async () => {
    const { user, dialog, actions } = renderEditor({ kind: GYM });
    await user.click(radio("Dark", "Movies"));
    await user.click(radio("Light", "Custom…"));
    await replaceText(user, hexInput("Light"), "#1565C0");
    expect(checked("Dark")).toStrictEqual(["Movies"]);
    await user.click(saveButton(dialog));
    expect(actions.updateKind).toHaveBeenCalledWith(GYM, {
      colorLight: "#1565C0",
      colorDark: "#CFA8F0",
    });
  });
});

// --- AC-4 -------------------------------------------------------------------

describe("refusing a colour whose text would be hard to read (AC-4, Block 5)", () => {
  it("Save disabled and the message shown for #808080 (best 4.35:1), the AC-4 control", async () => {
    const { user, dialog } = renderEditor({ kind: CLIMBING });
    expect(saveButton(dialog)).toBeEnabled();
    await replaceText(user, hexInput("Light"), "#808080");
    expect(saveButton(dialog)).toBeDisabled();
    expect(
      within(dialog).getByText(
        "Text would be hard to read. Try a lighter shade.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Fix the light colour" }),
    ).toHaveTextContent(/^Fix it$/);
    expect(preview("light")).toBe(
      "Text contrast 4.35:1 · Against background 3.95:1",
    );
  });

  it("Fix it moves #808080 to #858585, clears the message and re-enables Save", async () => {
    const { user, dialog, actions } = renderEditor({ kind: CLIMBING });
    await replaceText(user, hexInput("Light"), "#808080");
    await user.click(
      within(dialog).getByRole("button", { name: "Fix the light colour" }),
    );
    expect(hexInput("Light")).toHaveValue("#858585");
    expect(within(dialog).queryByText(/Text would be hard to read/)).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "Fix the light colour" }),
    ).toBeNull();
    expect(preview("light")).toBe(
      "Text contrast 4.65:1 · Against background 3.69:1",
    );
    expect(saveButton(dialog)).toBeEnabled();
    await user.click(saveButton(dialog));
    expect(actions.updateKind).toHaveBeenCalledTimes(1);
    expect(actions.updateKind.mock.calls[0]?.[1].colorLight).toBe("#858585");
  });

  it("asks for a darker shade when darker is nearer: #777777 -> Fix it -> #757575", async () => {
    const { user, dialog } = renderEditor({ kind: CLIMBING });
    await replaceText(user, hexInput("Light"), "#777777");
    expect(
      within(dialog).getByText(
        "Text would be hard to read. Try a darker shade.",
      ),
    ).toBeInTheDocument();
    expect(saveButton(dialog)).toBeDisabled();
    await user.click(
      within(dialog).getByRole("button", { name: "Fix the light colour" }),
    );
    expect(hexInput("Light")).toHaveValue("#757575");
    expect(saveButton(dialog)).toBeEnabled();
  });

  it("refuses the dark theme's colour the same way, with its own Fix it", async () => {
    const { user, dialog } = renderEditor({ kind: CLIMBING });
    await replaceText(user, hexInput("Dark"), "#808080");
    expect(saveButton(dialog)).toBeDisabled();
    expect(
      within(dialog).queryByRole("button", { name: "Fix the light colour" }),
    ).toBeNull();
    expect(preview("dark")).toBe(
      "Text contrast 4.35:1 · Against background 4.67:1",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Fix the dark colour" }),
    );
    expect(hexInput("Dark")).toHaveValue("#858585");
    expect(saveButton(dialog)).toBeEnabled();
  });

  it("only warns, and keeps Save enabled, for a light colour that passes for text but sits below 3:1 against the surface (#AAAAAA)", async () => {
    const { user, dialog } = renderEditor({ kind: CLIMBING });
    expect(
      within(dialog).queryByText("Low contrast against the background."),
    ).toBeNull();
    await replaceText(user, hexInput("Light"), "#AAAAAA");
    expect(preview("light")).toBe(
      "Text contrast 7.39:1 · Against background 2.32:1",
    );
    expect(
      within(dialog).getByText("Low contrast against the background."),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/Text would be hard to read/)).toBeNull();
    expect(saveButton(dialog)).toBeEnabled();
  });

  it("only warns for a dark colour below 3:1 against the dark surface (#5147C9)", async () => {
    const { user, dialog } = renderEditor({ kind: CLIMBING });
    await replaceText(user, hexInput("Dark"), "#5147C9");
    expect(preview("dark")).toBe(
      "Text contrast 6.79:1 · Against background 2.72:1",
    );
    expect(
      within(dialog).getByText("Low contrast against the background."),
    ).toBeInTheDocument();
    expect(saveButton(dialog)).toBeEnabled();
  });

  it("marks an invalid hex (#BD82) invalid, says what a colour looks like, and disables Save", async () => {
    const { user, dialog } = renderEditor({ kind: CLIMBING });
    await replaceText(user, hexInput("Light"), "#BD82");
    expect(hexInput("Light")).toHaveAttribute("aria-invalid", "true");
    expect(hexInput("Light")).toHaveAccessibleDescription(
      "Enter a colour like #BD8200.",
    );
    expect(saveButton(dialog)).toBeDisabled();
  });

  it("a valid hex is not marked invalid", () => {
    renderEditor({ kind: CLIMBING });
    expect(hexInput("Light")).not.toHaveAttribute("aria-invalid", "true");
  });
});

// --- AC-5 -------------------------------------------------------------------

const CONFIRM_BODY =
  "Its events keep their details and show as Kind removed. You can't undo this.";
const DELETED_TOAST =
  "Deleted the kind Gym. Its events now show as Kind removed.";

describe("deleting a kind (AC-5, Block 5)", () => {
  it('offers a danger button "Delete {name}" when editing, and none when adding', () => {
    const { dialog } = renderEditor({ kind: GYM });
    const button = within(dialog).getByRole("button", { name: "Delete Gym" });
    expect(button).toHaveAttribute("data-variant", "danger");
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveTextContent(/^Delete Gym$/);
    expect(button).not.toHaveFocus();
  });

  it("offers no Delete button when adding a kind", () => {
    const { dialog } = renderEditor({ kind: null });
    expect(
      within(dialog).queryByRole("button", { name: /^Delete/ }),
    ).toBeNull();
  });

  it("asks first: a dialog 'Delete the kind Gym?' with the body and Cancel / Delete", async () => {
    const { user, dialog, actions } = renderEditor({ kind: GYM });
    await user.click(
      within(dialog).getByRole("button", { name: "Delete Gym" }),
    );
    const confirm = screen.getByRole("dialog", {
      name: "Delete the kind Gym?",
    });
    expect(confirm).toHaveTextContent(CONFIRM_BODY);
    const buttons = within(confirm).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toStrictEqual([
      "Cancel",
      "Delete",
    ]);
    expect(
      within(confirm).getByRole("button", { name: "Delete" }),
    ).toHaveAttribute("data-variant", "danger");
    expect(actions.deleteKind).not.toHaveBeenCalled();
  });

  it("Cancel in the confirmation changes nothing: no delete, the editor stays open", async () => {
    const { user, dialog, actions, onClose } = renderEditor({ kind: GYM });
    await user.click(
      within(dialog).getByRole("button", { name: "Delete Gym" }),
    );
    const confirm = screen.getByRole("dialog", {
      name: "Delete the kind Gym?",
    });
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("dialog", { name: "Delete the kind Gym?" }),
    ).toBeNull();
    expect(actions.deleteKind).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Edit Gym" })).toBe(dialog);
  });

  it("Delete soft-deletes the kind once, closes the editor and shows the toast", async () => {
    const { user, dialog, actions, onClose } = renderEditor({ kind: GYM });
    await user.click(
      within(dialog).getByRole("button", { name: "Delete Gym" }),
    );
    const confirm = screen.getByRole("dialog", {
      name: "Delete the kind Gym?",
    });
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));
    expect(actions.deleteKind).toHaveBeenCalledTimes(1);
    expect(actions.deleteKind).toHaveBeenCalledWith(GYM);
    expect(actions.updateKind).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("dialog", { name: "Delete the kind Gym?" }),
    ).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(DELETED_TOAST);
  });

  it("a delete that fails closes the confirmation, shows the alert strip and keeps the editor open", async () => {
    const actions = fakeActions();
    actions.deleteKind.mockResolvedValue({ status: "offline" });
    const { user, dialog, onClose } = renderEditor({ kind: GYM, actions });
    await user.click(
      within(dialog).getByRole("button", { name: "Delete Gym" }),
    );
    const confirm = screen.getByRole("dialog", {
      name: "Delete the kind Gym?",
    });
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /^Couldn't save\. Try again\.$/,
    );
    expect(
      screen.queryByRole("dialog", { name: "Delete the kind Gym?" }),
    ).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).not.toHaveTextContent(/Deleted/);
  });
});

// --- AC-6 -------------------------------------------------------------------

describe("adding a kind (AC-6, Block 5)", () => {
  it("preselects the first palette pair no live kind uses: Flights after Movies and Entertainment", () => {
    renderEditor({ kind: null, kinds: [MOVIES, ENTERTAINMENT] });
    expect(nameInput()).toHaveValue("");
    expect(checked("Light")).toStrictEqual(["Flights"]);
    expect(checked("Dark")).toStrictEqual(["Flights"]);
  });

  it("compares colours ignoring case when looking for an unused pair", () => {
    renderEditor({
      kind: null,
      kinds: [kind(1, "Films", "#7e3fb8", "#cfa8f0")],
    });
    expect(checked("Light")).toStrictEqual(["Entertainment"]);
  });

  it("preselects the first palette pair when every one is in use", () => {
    const all = PALETTE_NAMES.slice(0, 11).map((name, i) =>
      kind(i + 1, name, PALETTE_LIGHTS[i] as string, "#FFFFFF"),
    );
    renderEditor({ kind: null, kinds: all });
    expect(checked("Light")).toStrictEqual(["Movies"]);
    expect(checked("Dark")).toStrictEqual(["Movies"]);
  });

  it("saving appends the kind: trimmed name, the preselected pair, the next sortOrder, not a default", async () => {
    const kinds = [MOVIES, kind(5, "Entertainment", "#BD8200", "#F5CC6A")];
    const { user, dialog, actions, onClose } = renderEditor({
      kind: null,
      kinds,
    });
    expect(saveButton(dialog)).toBeDisabled();
    await user.type(nameInput(), "  Climbing ");
    await user.click(saveButton(dialog));
    expect(actions.addKind).toHaveBeenCalledTimes(1);
    expect(actions.addKind).toHaveBeenCalledWith({
      name: "Climbing",
      colorLight: "#0B6E80",
      colorDark: "#7AD4E4",
      sortOrder: 6,
      isDefault: false,
    });
    expect(actions.updateKind).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the next sortOrder is the highest live one plus one, whatever order the kinds come in", async () => {
    const kinds = [kind(9, "Late", "#5147C9", "#B3AEF7"), MOVIES];
    const { user, dialog, actions } = renderEditor({ kind: null, kinds });
    await user.type(nameInput(), "Climbing");
    await user.click(saveButton(dialog));
    expect(actions.addKind.mock.calls[0]?.[0].sortOrder).toBe(10);
  });

  it("with no kinds at all the new kind takes sortOrder 1 and the first palette pair", async () => {
    const { user, dialog, actions } = renderEditor({ kind: null, kinds: [] });
    await user.type(nameInput(), "Climbing");
    await user.click(saveButton(dialog));
    expect(actions.addKind).toHaveBeenCalledWith({
      name: "Climbing",
      colorLight: "#7E3FB8",
      colorDark: "#CFA8F0",
      sortOrder: 1,
      isDefault: false,
    });
  });

  it("refuses a new name that matches a live kind ignoring case, and adds nothing", async () => {
    const { user, dialog, actions, onClose } = renderEditor({ kind: null });
    await user.type(nameInput(), "movies");
    await user.click(saveButton(dialog));
    expect(nameInput()).toHaveAccessibleDescription(
      "You already have a kind called Movies.",
    );
    expect(actions.addKind).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
