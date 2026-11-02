import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { type EditScope, EditScopeDialog } from "./EditScopeDialog";

// CAL-025 Contract, Block 2 (AC-1, AC-6's helper and Escape). The dialog
// alone, behind a host that owns `open` the way the sheet and the page will:
// an "Open" button opens it (so the click focuses an opener, as a chip or the
// sheet's Save would be), and both callbacks close it. MECHANICAL: role,
// title, radio names, button order and copy are voice.md's "Dialogs" and
// accessibility.md's "Roles and names" verbatim. jsdom has no showModal:
// src/test/setup.ts stubs it and turns Escape into the dialog's `cancel`.

const HELPER =
  "Moving the whole series moves every occurrence by the same amount.";

function Host(props: {
  kind: "change" | "delete";
  moving?: boolean;
  onCancel: () => void;
  onConfirm: (scope: EditScope) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <EditScopeDialog
        open={open}
        kind={props.kind}
        {...(props.moving === undefined ? {} : { moving: props.moving })}
        onCancel={() => {
          props.onCancel();
          setOpen(false);
        }}
        onConfirm={(scope) => {
          props.onConfirm(scope);
          setOpen(false);
        }}
      />
    </>
  );
}

async function openDialog(kind: "change" | "delete", moving?: boolean) {
  const user = userEvent.setup();
  const onCancel = vi.fn<() => void>();
  const onConfirm = vi.fn<(scope: EditScope) => void>();
  render(
    <Host
      kind={kind}
      {...(moving === undefined ? {} : { moving })}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />,
  );
  const opener = screen.getByRole("button", { name: "Open" });
  await user.click(opener);
  return { user, onCancel, onConfirm, opener };
}

const TITLE = {
  change: "Change which events?",
  delete: "Delete which events?",
} as const;
const CONFIRM = { change: "Save", delete: "Delete" } as const;

const dialogOf = (kind: "change" | "delete") =>
  screen.getByRole("alertdialog", { name: TITLE[kind] });
const thisOnly = () => screen.getByRole("radio", { name: "This event only" });
const allEvents = () =>
  screen.getByRole("radio", { name: "All events in the series" });

describe("closed (Block 2)", () => {
  it("open=false renders nothing at all", () => {
    const { container } = render(
      <EditScopeDialog
        open={false}
        kind="change"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });
});

describe.each(["change", "delete"] as const)(
  'kind "%s" (AC-1, Block 2)',
  (kind) => {
    it(`is an alertdialog named "${TITLE[kind]}", a native <dialog>, and no role=dialog`, async () => {
      await openDialog(kind);
      const dialog = dialogOf(kind);
      expect(dialog.tagName).toBe("DIALOG");
      expect(dialog).toHaveAttribute("open");
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it('offers exactly two radios in one group, "This event only" (value occurrence, checked) then "All events in the series" (value series)', async () => {
      await openDialog(kind);
      const radios = within(dialogOf(kind)).getAllByRole("radio");
      expect(radios).toHaveLength(2);
      expect(radios[0]).toBe(thisOnly());
      expect(radios[1]).toBe(allEvents());
      expect(thisOnly()).toHaveAttribute("value", "occurrence");
      expect(allEvents()).toHaveAttribute("value", "series");
      expect(thisOnly()).toBeChecked();
      expect(allEvents()).not.toBeChecked();
      const name = thisOnly().getAttribute("name");
      expect(name).not.toBeNull();
      expect(name).not.toBe("");
      expect(allEvents()).toHaveAttribute("name", name as string);
    });

    it('focus is on "This event only" when it opens', async () => {
      await openDialog(kind);
      expect(thisOnly()).toHaveFocus();
    });

    it(`its buttons are Cancel then ${CONFIRM[kind]}, and nothing else`, async () => {
      await openDialog(kind);
      expect(
        within(dialogOf(kind))
          .getAllByRole("button")
          .map((b) => b.textContent),
      ).toStrictEqual(["Cancel", CONFIRM[kind]]);
    });

    it(`${CONFIRM[kind]} with the default selection calls onConfirm("occurrence") once, and not onCancel`, async () => {
      const { user, onConfirm, onCancel } = await openDialog(kind);
      await user.click(screen.getByRole("button", { name: CONFIRM[kind] }));
      expect(onConfirm.mock.calls).toStrictEqual([["occurrence"]]);
      expect(onCancel).not.toHaveBeenCalled();
    });

    it(`"All events in the series" then ${CONFIRM[kind]} calls onConfirm("series") once`, async () => {
      const { user, onConfirm, onCancel } = await openDialog(kind);
      await user.click(allEvents());
      expect(allEvents()).toBeChecked();
      expect(thisOnly()).not.toBeChecked();
      await user.click(screen.getByRole("button", { name: CONFIRM[kind] }));
      expect(onConfirm.mock.calls).toStrictEqual([["series"]]);
      expect(onCancel).not.toHaveBeenCalled();
    });

    it("Cancel calls onCancel once and never onConfirm; focus returns to the opener", async () => {
      const { user, onConfirm, onCancel, opener } = await openDialog(kind);
      await user.click(allEvents());
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(opener).toHaveFocus();
    });

    it("Escape calls onCancel once and never onConfirm (AC-6)", async () => {
      const { user, onConfirm, onCancel } = await openDialog(kind);
      await user.keyboard("{Escape}");
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });

    it('every open starts on "This event only": choose All events, cancel, reopen - it is checked and focused again', async () => {
      const { user, opener } = await openDialog(kind);
      await user.click(allEvents());
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      await user.click(opener);
      expect(thisOnly()).toBeChecked();
      expect(allEvents()).not.toBeChecked();
      expect(thisOnly()).toHaveFocus();
    });
  },
);

describe("the confirm button's variant (Block 2)", () => {
  it('Delete is data-variant="danger"; Save and Cancel are not', async () => {
    await openDialog("delete");
    expect(screen.getByRole("button", { name: "Delete" })).toHaveAttribute(
      "data-variant",
      "danger",
    );
    expect(screen.getByRole("button", { name: "Cancel" })).not.toHaveAttribute(
      "data-variant",
      "danger",
    );
  });

  it("Save is not danger", async () => {
    await openDialog("change");
    expect(screen.getByRole("button", { name: "Save" })).not.toHaveAttribute(
      "data-variant",
      "danger",
    );
  });
});

describe("the moving helper (AC-6, Block 2)", () => {
  it(`moving: "${HELPER}" is a <p> after the second radio, and is that radio's description only`, async () => {
    await openDialog("change", true);
    const helper = screen.getByText(HELPER);
    expect(helper.tagName).toBe("P");
    expect(helper.textContent).toBe(HELPER);
    expect(dialogOf("change")).toContainElement(helper);
    expect(
      allEvents().compareDocumentPosition(helper) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(allEvents()).toHaveAccessibleDescription(HELPER);
    expect(thisOnly()).not.toHaveAccessibleDescription(HELPER);
    // The helper describes the option; it is not part of its name.
    expect(allEvents()).toHaveAccessibleName("All events in the series");
  });

  it("moving is false: no helper in the DOM, and the second radio has no description", async () => {
    await openDialog("change", false);
    expect(screen.queryByText(HELPER)).toBeNull();
    expect(allEvents()).not.toHaveAttribute("aria-describedby");
  });

  it("moving omitted: no helper either", async () => {
    await openDialog("delete");
    expect(screen.queryByText(HELPER)).toBeNull();
  });
});
