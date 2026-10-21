import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CacheUnavailable } from "./CacheUnavailable";

// CAL-014 AC-6, Contract Block 6. MECHANICAL: the copy is voice.md's ("Can't
// open the calendar. Reload to try again."), the shape is components.md's
// "Full-page error" - a title, one line, a Reload button. The default
// onReload (location.reload()) is not exercised: jsdom does not implement
// navigation, and window.location cannot be stubbed there.

describe("CacheUnavailable (AC-6)", () => {
  it('is a main landmark holding the heading "Can\'t open the calendar", the line "Reload to try again." and a Reload button', () => {
    render(<CacheUnavailable onReload={() => {}} />);
    const main = screen.getByRole("main");
    const h1 = within(main).getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent(/^Can't open the calendar$/);
    expect(within(main).getByText("Reload to try again.").tagName).toBe("P");
    const button = within(main).getByRole("button", { name: "Reload" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveTextContent(/^Reload$/);
  });

  it("has exactly one heading and one button, and nothing else to read", () => {
    render(<CacheUnavailable onReload={() => {}} />);
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("main")).toHaveTextContent(
      /^Can't open the calendar\s*Reload to try again\.\s*Reload$/,
    );
  });

  it("Reload calls onReload once", async () => {
    const user = userEvent.setup();
    const onReload = vi.fn();
    render(<CacheUnavailable onReload={onReload} />);
    await user.click(screen.getByRole("button", { name: "Reload" }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
