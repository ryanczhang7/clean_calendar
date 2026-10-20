import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSX } from "react";
import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import type { View } from "./period";
import { shortcutBlocked, useCalendarKeys } from "./useCalendarKeys";

// CAL-011 AC-4, Contract Block 5 (PO decision 5). One keydown listener on
// document while enabled: t/T -> onToday, m/w/d (either case) -> onView.
// The negative cases mirror the legend's L (KindLegend.test.tsx): a modifier,
// defaultPrevented, an editable target, inside an open dialog - and each
// negative is followed by the bare key from outside, so "nothing happened"
// cannot be satisfied by a listener that was never attached.

type Handlers = {
  onToday: Mock<() => void>;
  onView: Mock<(view: View) => void>;
};

function Page(props: {
  enabled: boolean;
  onToday: () => void;
  onView: (view: View) => void;
}): JSX.Element {
  useCalendarKeys(props);
  return (
    <>
      <button type="button">Somewhere</button>
      <label>
        Notes
        <input type="text" />
      </label>
      <label>
        Comment
        <textarea />
      </label>
      <label>
        Pick
        <select defaultValue="a">
          <option value="a">a</option>
          <option value="d">d</option>
        </select>
      </label>
      {/* biome-ignore lint/a11y/useSemanticElements: a contenteditable region is the case under test */}
      <div
        role="textbox"
        aria-label="Editor"
        contentEditable="true"
        suppressContentEditableWarning
        tabIndex={0}
      >
        text
      </div>
      <div data-sheet="" role="dialog" aria-modal="false" aria-label="A sheet">
        <button type="button">Inside the sheet</button>
      </div>
      <dialog open aria-label="A dialog">
        <button type="button">Inside the dialog</button>
      </dialog>
    </>
  );
}

function renderKeys(enabled = true) {
  const user = userEvent.setup();
  const h: Handlers = {
    onToday: vi.fn<() => void>(),
    onView: vi.fn<(view: View) => void>(),
  };
  const view = render(
    <Page enabled={enabled} onToday={h.onToday} onView={h.onView} />,
  );
  return { user, ...h, ...view };
}

const somewhere = () => screen.getByRole("button", { name: "Somewhere" });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the shortcuts (AC-4, Block 5)", () => {
  it.each(["t", "T"])("%s calls onToday once, and not onView", async (key) => {
    const { user, onToday, onView } = renderKeys();
    somewhere().focus();
    await user.keyboard(key);
    expect(onToday).toHaveBeenCalledTimes(1);
    expect(onView).not.toHaveBeenCalled();
  });

  it.each([
    ["m", "month"],
    ["M", "month"],
    ["w", "week"],
    ["W", "week"],
    ["d", "day"],
    ["D", "day"],
  ] as const)(
    "%s calls onView(%j) once, and not onToday",
    async (key, view) => {
      const { user, onToday, onView } = renderKeys();
      somewhere().focus();
      await user.keyboard(key);
      expect(onView).toHaveBeenCalledTimes(1);
      expect(onView).toHaveBeenCalledWith(view);
      expect(onToday).not.toHaveBeenCalled();
    },
  );

  it("works with nothing focused (the page body)", async () => {
    const { user, onToday } = renderKeys();
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    await user.keyboard("t");
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it.each(["l", "n", "c", "x", "{Enter}", "{Escape}", "{ArrowRight}"])(
    "%s is not one of its keys: nothing is called",
    async (key) => {
      const { user, onToday, onView } = renderKeys();
      somewhere().focus();
      await user.keyboard(key);
      expect(onToday).not.toHaveBeenCalled();
      expect(onView).not.toHaveBeenCalled();
    },
  );

  it("one press calls once, after several re-renders (one listener, not one per render)", async () => {
    const { user, onToday, onView, rerender } = renderKeys();
    for (let i = 0; i < 3; i += 1) {
      rerender(<Page enabled onToday={onToday} onView={onView} />);
    }
    somewhere().focus();
    await user.keyboard("t");
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it("calls the handlers of the latest render, not the first", async () => {
    const { user, onToday, onView, rerender } = renderKeys();
    const today2 = vi.fn<() => void>();
    const view2 = vi.fn<(view: View) => void>();
    rerender(<Page enabled onToday={today2} onView={view2} />);
    somewhere().focus();
    await user.keyboard("tw");
    expect(onToday).not.toHaveBeenCalled();
    expect(onView).not.toHaveBeenCalled();
    expect(today2).toHaveBeenCalledTimes(1);
    expect(view2).toHaveBeenCalledWith("week");
  });
});

describe("when the keys are not shortcuts (AC-4, Block 5)", () => {
  it.each([
    ["Control", "{Control>}t{/Control}"],
    ["Meta", "{Meta>}t{/Meta}"],
    ["Alt", "{Alt>}t{/Alt}"],
    ["Control", "{Control>}w{/Control}"],
  ])("with %s held, nothing is called", async (_name, keys) => {
    const { user, onToday, onView } = renderKeys();
    somewhere().focus();
    await user.keyboard(keys);
    expect(onToday).not.toHaveBeenCalled();
    expect(onView).not.toHaveBeenCalled();
    // The listener is live: the bare key works.
    await user.keyboard("t");
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it("a keydown already defaultPrevented is ignored", async () => {
    const { user, onToday, onView } = renderKeys();
    const target = somewhere();
    const swallow = (e: KeyboardEvent) => e.preventDefault();
    target.addEventListener("keydown", swallow);
    target.focus();
    await user.keyboard("tm");
    expect(onToday).not.toHaveBeenCalled();
    expect(onView).not.toHaveBeenCalled();
    target.removeEventListener("keydown", swallow);
    await user.keyboard("t");
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["Notes", "an input"],
    ["Comment", "a textarea"],
  ])(
    "typing into %s (%s) types the letters and calls nothing",
    async (label) => {
      const { user, onToday, onView } = renderKeys();
      const field = screen.getByLabelText(label);
      await user.click(field);
      await user.keyboard("tmwdTMWD");
      expect(field).toHaveValue("tmwdTMWD");
      expect(onToday).not.toHaveBeenCalled();
      expect(onView).not.toHaveBeenCalled();
      somewhere().focus();
      await user.keyboard("t");
      expect(onToday).toHaveBeenCalledTimes(1);
    },
  );

  it("a key pressed on a select calls nothing", async () => {
    const { user, onToday, onView } = renderKeys();
    screen.getByLabelText("Pick").focus();
    await user.keyboard("dt");
    expect(onToday).not.toHaveBeenCalled();
    expect(onView).not.toHaveBeenCalled();
    somewhere().focus();
    await user.keyboard("d");
    expect(onView).toHaveBeenCalledWith("day");
  });

  it('a key pressed in a [contenteditable="true"] region calls nothing', async () => {
    const { user, onToday, onView } = renderKeys();
    screen.getByRole("textbox", { name: "Editor" }).focus();
    await user.keyboard("tw");
    expect(onToday).not.toHaveBeenCalled();
    expect(onView).not.toHaveBeenCalled();
    somewhere().focus();
    await user.keyboard("t");
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it("a key pressed inside an open dialog calls nothing", async () => {
    const { user, onToday, onView } = renderKeys();
    screen.getByRole("button", { name: "Inside the dialog" }).focus();
    await user.keyboard("tm");
    expect(onToday).not.toHaveBeenCalled();
    expect(onView).not.toHaveBeenCalled();
    somewhere().focus();
    await user.keyboard("t");
    expect(onToday).toHaveBeenCalledTimes(1);
  });
});

describe("enabled, and the listener's lifetime (Block 5)", () => {
  it("while enabled is false, no key calls anything", async () => {
    const { user, onToday, onView } = renderKeys(false);
    somewhere().focus();
    await user.keyboard("tmwd");
    expect(onToday).not.toHaveBeenCalled();
    expect(onView).not.toHaveBeenCalled();
  });

  it("turning enabled on attaches it, and off again removes it", async () => {
    const { user, onToday, onView, rerender } = renderKeys(false);
    somewhere().focus();
    rerender(<Page enabled onToday={onToday} onView={onView} />);
    await user.keyboard("t");
    expect(onToday).toHaveBeenCalledTimes(1);
    rerender(<Page enabled={false} onToday={onToday} onView={onView} />);
    await user.keyboard("tw");
    expect(onToday).toHaveBeenCalledTimes(1);
    expect(onView).not.toHaveBeenCalled();
  });

  it("listens on document, and stops listening on unmount", async () => {
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    const { user, onToday, unmount } = renderKeys();
    const keydownAdds = add.mock.calls.filter(([type]) => type === "keydown");
    expect(keydownAdds).toHaveLength(1);
    unmount();
    const listener = keydownAdds[0]?.[1];
    expect(
      remove.mock.calls.some(
        ([type, l]) => type === "keydown" && l === listener,
      ),
    ).toBe(true);
    await user.keyboard("t");
    expect(onToday).not.toHaveBeenCalled();
  });
});

// CAL-012 Contract, Block 6: the exclusions as one exported predicate,
// `shortcutBlocked(event)`, which the hook uses - and `[data-sheet]` joins
// them, so a key pressed anywhere in the event sheet (a non-native,
// non-modal dialog) never switches view. Each case dispatches a real
// keydown on a real element and reads the predicate where the hook would:
// on document, as the event bubbles.
describe("shortcutBlocked (CAL-012 Block 6)", () => {
  function blockedOn(
    target: EventTarget,
    init: KeyboardEventInit = {},
    prevent = false,
  ): boolean {
    let seen: boolean | null = null;
    const read = (e: KeyboardEvent) => {
      seen = shortcutBlocked(e);
    };
    const swallow = (e: Event) => e.preventDefault();
    if (prevent) target.addEventListener("keydown", swallow);
    document.addEventListener("keydown", read);
    try {
      target.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "t",
          bubbles: true,
          cancelable: true,
          ...init,
        }),
      );
    } finally {
      document.removeEventListener("keydown", read);
      if (prevent) target.removeEventListener("keydown", swallow);
    }
    expect(seen, "the keydown reached document").not.toBeNull();
    return seen as unknown as boolean;
  }

  const render0 = () =>
    render(<Page enabled={false} onToday={() => {}} onView={() => {}} />);

  it("a bare key on a button is not blocked", () => {
    render0();
    expect(blockedOn(somewhere())).toBe(false);
  });

  it("a bare key on the page body is not blocked", () => {
    render0();
    expect(blockedOn(document.body)).toBe(false);
  });

  it("Shift alone does not block (N and T arrive with Shift held)", () => {
    render0();
    expect(blockedOn(somewhere(), { key: "N", shiftKey: true })).toBe(false);
  });

  it.each([
    ["Control", { ctrlKey: true }],
    ["Meta", { metaKey: true }],
    ["Alt", { altKey: true }],
  ] as const)("%s held blocks", (_name, init) => {
    render0();
    expect(blockedOn(somewhere(), init)).toBe(true);
  });

  it("an event already defaultPrevented is blocked", () => {
    render0();
    expect(blockedOn(somewhere(), {}, true)).toBe(true);
  });

  it.each([
    ["an input", () => screen.getByLabelText("Notes")],
    ["a textarea", () => screen.getByLabelText("Comment")],
    ["a select", () => screen.getByLabelText("Pick")],
    [
      "a contenteditable",
      () => screen.getByRole("textbox", { name: "Editor" }),
    ],
    [
      "a button inside an open dialog",
      () => screen.getByRole("button", { name: "Inside the dialog" }),
    ],
    [
      "a button inside [data-sheet]",
      () => screen.getByRole("button", { name: "Inside the sheet" }),
    ],
  ])("a key on %s is blocked", (_label, target) => {
    render0();
    expect(blockedOn(target())).toBe(true);
  });

  it("the [data-sheet] element itself is blocked", () => {
    render0();
    expect(blockedOn(screen.getByRole("dialog", { name: "A sheet" }))).toBe(
      true,
    );
  });
});

describe("the hook ignores keys inside the event sheet (CAL-012 Block 6)", () => {
  it("a key pressed on a button inside [data-sheet] calls nothing", async () => {
    const { user, onToday, onView } = renderKeys();
    screen.getByRole("button", { name: "Inside the sheet" }).focus();
    await user.keyboard("tmwd");
    expect(onToday).not.toHaveBeenCalled();
    expect(onView).not.toHaveBeenCalled();
    somewhere().focus();
    await user.keyboard("t");
    expect(onToday).toHaveBeenCalledTimes(1);
  });
});
