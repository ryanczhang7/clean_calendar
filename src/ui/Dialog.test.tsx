import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

// AC-6. jsdom has no showModal/close: src/test/setup.ts stubs them, and turns
// Escape on an open modal dialog into the browser's `cancel` event.

function Harness(props: { onClose: () => void; actions?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Delete kind
      </button>
      <Dialog
        open={open}
        title="Delete Flight?"
        onClose={() => {
          props.onClose();
          setOpen(false);
        }}
        actions={
          props.actions ?? (
            <>
              <button type="button" data-variant="danger">
                Delete
              </button>
              <button type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </>
          )
        }
      >
        <p>Events of this kind keep their details.</p>
      </Dialog>
    </>
  );
}

async function openFromButton(onClose = vi.fn()) {
  const user = userEvent.setup();
  render(<Harness onClose={onClose} />);
  const opener = screen.getByRole("button", { name: "Delete kind" });
  await user.click(opener);
  return { user, opener, onClose };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Dialog (AC-6)", () => {
  it("is not shown, and showModal is not called, while closed", () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    render(<Harness onClose={vi.fn()} />);
    expect(showModal).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens as a modal <dialog> named by its title", async () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    await openFromButton();
    const dialog = screen.getByRole("dialog", { name: "Delete Flight?" });
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog).toHaveAttribute("open");
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(showModal.mock.contexts[0]).toBe(dialog);
  });

  it("renders its children and its actions inside the dialog", async () => {
    await openFromButton();
    const dialog = screen.getByRole("dialog", { name: "Delete Flight?" });
    expect(dialog).toHaveTextContent("Events of this kind keep their details.");
    expect(dialog).toContainElement(
      screen.getByRole("button", { name: "Cancel" }),
    );
  });

  it("moves focus to the first non-destructive control, skipping a danger button placed first", async () => {
    await openFromButton();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("focuses the first control when none is destructive", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        onClose={vi.fn()}
        actions={
          <>
            <button type="button">Keep</button>
            <button type="button">Also keep</button>
          </>
        }
      />,
    );
    await user.click(screen.getByRole("button", { name: "Delete kind" }));
    expect(screen.getByRole("button", { name: "Keep" })).toHaveFocus();
  });

  it("calls onClose once when Escape is pressed", async () => {
    const { user, onClose } = await openFromButton();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("returns focus to the button that opened it after Escape", async () => {
    const { user, opener } = await openFromButton();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("closes and returns focus to the opener when the parent sets open to false", async () => {
    const { user, opener } = await openFromButton();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });
});
