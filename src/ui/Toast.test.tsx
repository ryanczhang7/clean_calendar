import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Toast, ToastHost, ToastProvider, useToast } from "./Toast";

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
