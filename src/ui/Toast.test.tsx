import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type Toast,
  ToastHost,
  ToastProvider,
  useMaybeToast,
  useToast,
} from "./Toast";

// AC-5. Timing semantics (CAL-002 Contract, Toast): the timer starts at
// showToast; without an action the toast is gone at 6 000 ms, with an action
// at 10 000 ms; a second showToast replaces the first and restarts the timer.

function Trigger(props: { toast: Toast; label?: string }) {
  const { showToast, dismiss } = useToast();
  return (
    <>
      <button type="button" onClick={() => showToast(props.toast)}>
        {props.label ?? "Show"}
      </button>
      <button type="button" onClick={() => dismiss()}>
        Dismiss
      </button>
    </>
  );
}

function setup(...toasts: Toast[]) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(
    <ToastProvider>
      <ToastHost />
      {toasts.map((t, i) => (
        <Trigger key={t.text} toast={t} label={`Show ${i + 1}`} />
      ))}
    </ToastProvider>,
  );
  return user;
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Toast (AC-5)", () => {
  it("always renders exactly one polite status region, empty until a toast is shown", () => {
    setup({ text: "Saved" });
    const regions = screen.getAllByRole("status");
    expect(regions).toHaveLength(1);
    expect(regions[0]).toHaveAttribute("aria-live", "polite");
    expect(regions[0]).toHaveTextContent(/^$/);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the toast text inside the status region", async () => {
    const user = setup({ text: "Event saved" });
    await user.click(screen.getByRole("button", { name: "Show 1" }));
    expect(screen.getByRole("status")).toHaveTextContent("Event saved");
  });

  it("keeps a toast without an action for 5 999 ms and removes it at 6 000 ms", async () => {
    const user = setup({ text: "Event saved" });
    await user.click(screen.getByRole("button", { name: "Show 1" }));
    advance(5_999);
    expect(screen.getByRole("status")).toHaveTextContent("Event saved");
    advance(1);
    expect(screen.getByRole("status")).not.toHaveTextContent("Event saved");
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("keeps a toast with an action for 9 999 ms and removes it at 10 000 ms", async () => {
    const user = setup({
      text: "Moved to Tue 14 Oct, 10:00",
      action: { label: "Undo", onClick: vi.fn() },
    });
    await user.click(screen.getByRole("button", { name: "Show 1" }));
    advance(9_999);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Moved to Tue 14 Oct, 10:00");
    expect(within(status).getByRole("button", { name: "Undo" })).toBeVisible();
    advance(1);
    expect(screen.getByRole("status")).not.toHaveTextContent("Moved to");
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("does not render an action button for a toast without an action", async () => {
    const user = setup({ text: "Event saved" });
    await user.click(screen.getByRole("button", { name: "Show 1" }));
    expect(within(screen.getByRole("status")).queryByRole("button")).toBeNull();
  });

  it("replaces the first toast with a second one immediately and restarts the timer", async () => {
    const user = setup({ text: "First toast" }, { text: "Second toast" });
    await user.click(screen.getByRole("button", { name: "Show 1" }));
    advance(3_000);
    await user.click(screen.getByRole("button", { name: "Show 2" }));
    const status = screen.getByRole("status");
    expect(status).not.toHaveTextContent("First toast");
    expect(status).toHaveTextContent("Second toast");
    // 6 000 ms after the FIRST toast: the second must still be showing
    advance(3_000);
    expect(screen.getByRole("status")).toHaveTextContent("Second toast");
    advance(2_999);
    expect(screen.getByRole("status")).toHaveTextContent("Second toast");
    advance(1);
    expect(screen.getByRole("status")).not.toHaveTextContent("Second toast");
  });

  it("renders a tone 'alert' toast in a role=alert element, not in the status region", async () => {
    const user = setup({ text: "Couldn't save", tone: "alert" });
    await user.click(screen.getByRole("button", { name: "Show 1" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save");
    expect(screen.getByRole("status")).not.toHaveTextContent("Couldn't save");
  });

  it("removes an alert toast without an action at 6 000 ms, and its alert element with it", async () => {
    const user = setup({ text: "Couldn't save", tone: "alert" });
    await user.click(screen.getByRole("button", { name: "Show 1" }));
    advance(5_999);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save");
    advance(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("calls the action's handler exactly once when it is clicked, and dismisses the toast", async () => {
    const onClick = vi.fn();
    const user = setup({
      text: "Moved to Tue 14 Oct, 10:00",
      action: { label: "Undo", onClick },
    });
    await user.click(screen.getByRole("button", { name: "Show 1" }));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).not.toHaveTextContent("Moved to");
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("removes the toast when dismiss() is called", async () => {
    const user = setup({ text: "Event saved" });
    await user.click(screen.getByRole("button", { name: "Show 1" }));
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.getByRole("status")).not.toHaveTextContent("Event saved");
  });

  it("throws when useToast is called outside a ToastProvider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Trigger toast={{ text: "Orphan" }} />)).toThrow();
  });
});

// CAL-013 Contract, Block 6 (AC-5; accessibility.md "Ctrl+Z: Undo, while an
// undo toast is showing"). While a toast whose action has undo: true is
// shown, Ctrl+Z or Cmd+Z on a non-editable target runs the action once,
// dismisses the toast and preventDefaults. Each "does nothing" case is
// paired, in the same case, with the key that then does - so none of them
// can pass against a Toast that ignores the keyboard altogether.
describe("Ctrl+Z runs an undo action while it shows (CAL-013 AC-5, Block 6)", () => {
  const MOVED = "Moved to Wed 14 Oct, 10:00";

  function setupUndo(undo: boolean | undefined = true) {
    const onClick = vi.fn();
    const user = setup({
      text: MOVED,
      action:
        undo === undefined
          ? { label: "Undo", onClick }
          : { label: "Undo", onClick, undo },
    });
    return { user, onClick };
  }

  type Keys = { key: string } & Partial<
    Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "shiftKey" | "altKey">
  >;

  /** keydown on `target`; true when the event was preventDefault-ed. */
  function press(target: Element, init: Keys): boolean {
    return !fireEvent.keyDown(target, init);
  }

  const CTRL_Z: Keys = { key: "z", ctrlKey: true };

  it.each<[string, Keys]>([
    ["Ctrl+Z", { key: "z", ctrlKey: true }],
    ["Cmd+Z", { key: "z", metaKey: true }],
    ["Ctrl+Z with Caps Lock (key Z)", { key: "Z", ctrlKey: true }],
  ])(
    "%s runs the action once, dismisses the toast and is preventDefault-ed",
    async (_label, init) => {
      const { user, onClick } = setupUndo();
      await user.click(screen.getByRole("button", { name: "Show 1" }));
      expect(press(document.body, init)).toBe(true);
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("status")).not.toHaveTextContent(MOVED);
      expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    },
  );

  it("a second Ctrl+Z after the first does nothing more", async () => {
    const { user, onClick } = setupUndo();
    await user.click(screen.getByRole("button", { name: "Show 1" }));
    press(document.body, CTRL_Z);
    expect(press(document.body, CTRL_Z)).toBe(false);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("Ctrl+Z works from a focused non-editable element - the user-event path", async () => {
    const { user, onClick } = setupUndo();
    await user.click(screen.getByRole("button", { name: "Show 1" }));
    await user.keyboard("{Control>}z{/Control}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it.each<[string, Keys]>([
    ["Ctrl+Shift+Z (redo)", { key: "Z", ctrlKey: true, shiftKey: true }],
    ["Ctrl+Alt+Z", { key: "z", ctrlKey: true, altKey: true }],
    ["z alone", { key: "z" }],
    ["Ctrl+Y", { key: "y", ctrlKey: true }],
  ])(
    "%s does nothing and is not preventDefault-ed; Ctrl+Z then does",
    async (_label, init) => {
      const { user, onClick } = setupUndo();
      await user.click(screen.getByRole("button", { name: "Show 1" }));
      expect(press(document.body, init)).toBe(false);
      expect(onClick).not.toHaveBeenCalled();
      expect(screen.getByRole("status")).toHaveTextContent(MOVED);
      press(document.body, CTRL_Z);
      expect(onClick).toHaveBeenCalledTimes(1);
    },
  );

  it.each<[string, () => HTMLElement]>([
    ["an input", () => document.createElement("input")],
    ["a textarea", () => document.createElement("textarea")],
    ["a select", () => document.createElement("select")],
    [
      "a contenteditable element",
      () => {
        const el = document.createElement("div");
        el.setAttribute("contenteditable", "true");
        return el;
      },
    ],
  ])(
    "Ctrl+Z inside %s is that field's own undo: the action does not run; outside it, it does",
    async (_label, make) => {
      const { user, onClick } = setupUndo();
      const field = document.body.appendChild(make());
      try {
        await user.click(screen.getByRole("button", { name: "Show 1" }));
        expect(press(field, CTRL_Z)).toBe(false);
        expect(onClick).not.toHaveBeenCalled();
        expect(screen.getByRole("status")).toHaveTextContent(MOVED);
        press(document.body, CTRL_Z);
        expect(onClick).toHaveBeenCalledTimes(1);
      } finally {
        field.remove();
      }
    },
  );

  it.each<[string, boolean | undefined]>([
    ["without undo", undefined],
    ["with undo: false", false],
  ])(
    "an action %s is not run by Ctrl+Z; an undo toast replacing it then is",
    async (_label, undo) => {
      const plain = vi.fn();
      const undoable = vi.fn();
      const user = setup(
        {
          text: "Kind saved",
          action:
            undo === undefined
              ? { label: "View", onClick: plain }
              : { label: "View", onClick: plain, undo },
        },
        {
          text: MOVED,
          action: { label: "Undo", onClick: undoable, undo: true },
        },
      );
      await user.click(screen.getByRole("button", { name: "Show 1" }));
      expect(press(document.body, CTRL_Z)).toBe(false);
      expect(plain).not.toHaveBeenCalled();
      expect(screen.getByRole("status")).toHaveTextContent("Kind saved");
      await user.click(screen.getByRole("button", { name: "Show 2" }));
      press(document.body, CTRL_Z);
      expect(undoable).toHaveBeenCalledTimes(1);
      expect(plain).not.toHaveBeenCalled();
    },
  );

  it("before the toast is shown and after it expired, Ctrl+Z does nothing; while it shows, it does", async () => {
    const { user, onClick } = setupUndo();
    expect(press(document.body, CTRL_Z)).toBe(false);
    await user.click(screen.getByRole("button", { name: "Show 1" }));
    advance(10_000);
    expect(press(document.body, CTRL_Z)).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Show 1" }));
    press(document.body, CTRL_Z);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("a plain toast replacing an undo toast takes Ctrl+Z away with it", async () => {
    const onClick = vi.fn();
    const user = setup(
      { text: MOVED, action: { label: "Undo", onClick, undo: true } },
      { text: "Event saved" },
    );
    await user.click(screen.getByRole("button", { name: "Show 1" }));
    await user.click(screen.getByRole("button", { name: "Show 2" }));
    expect(press(document.body, CTRL_Z)).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Event saved");
    // Not vacuous: shown again, the undo toast answers Ctrl+Z.
    await user.click(screen.getByRole("button", { name: "Show 1" }));
    press(document.body, CTRL_Z);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("useMaybeToast (CAL-013 Block 6)", () => {
  function Probe(props: { onApi: (api: unknown) => void }) {
    const api = useMaybeToast();
    props.onApi(api);
    return (
      <button
        type="button"
        onClick={() => api?.showToast({ text: "From maybe" })}
      >
        Maybe
      </button>
    );
  }

  it("is null outside a ToastProvider, and does not throw", () => {
    const seen: unknown[] = [];
    render(<Probe onApi={(api) => seen.push(api)} />);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((api) => api === null)).toBe(true);
  });

  it("inside a provider it is the toast API: showToast shows a toast", async () => {
    const seen: unknown[] = [];
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <ToastHost />
        <Probe onApi={(api) => seen.push(api)} />
      </ToastProvider>,
    );
    expect(seen.at(-1)).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Maybe" }));
    expect(screen.getByRole("status")).toHaveTextContent("From maybe");
  });
});
