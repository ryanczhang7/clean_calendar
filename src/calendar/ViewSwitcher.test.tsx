import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type JSX, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { View } from "./period";
import { ViewSwitcher } from "./ViewSwitcher";

// CAL-011 AC-3, Contract Block 4 (components.md, "View switcher"). The unit
// alone with a vi.fn onChange; the arrow-key cases run it under a harness
// that holds `view` in state, as the toolbar does through the URL.
// MECHANICAL: role radiogroup named "View", radios Month / Week / Day in that
// order, checked state on the current one, roving tabindex 0 / -1.
// toBeChecked() reads aria-checked on a role="radio" element and `checked`
// on a native radio, so GREEN's choice between the two stays open.

const VIEWS: View[] = ["month", "week", "day"];
const NAMES = ["Month", "Week", "Day"];

function renderSwitcher(view: View) {
  const user = userEvent.setup();
  const onChange = vi.fn<(view: View) => void>();
  render(<ViewSwitcher view={view} onChange={onChange} />);
  return { user, onChange };
}

function Stateful(props: {
  initial: View;
  spy: (view: View) => void;
}): JSX.Element {
  const [view, setView] = useState(props.initial);
  return (
    <ViewSwitcher
      view={view}
      onChange={(v) => {
        props.spy(v);
        setView(v);
      }}
    />
  );
}

function renderStateful(initial: View) {
  const user = userEvent.setup();
  const spy = vi.fn<(view: View) => void>();
  render(<Stateful initial={initial} spy={spy} />);
  return { user, spy };
}

const group = () => screen.getByRole("radiogroup", { name: "View" });
const radio = (name: string) => within(group()).getByRole("radio", { name });

describe("the radiogroup (AC-3, Block 4)", () => {
  it('is one radiogroup named "View" holding the radios Month, Week, Day, in that order', () => {
    renderSwitcher("month");
    expect(screen.getAllByRole("radiogroup")).toHaveLength(1);
    const radios = within(group()).getAllByRole("radio");
    expect(radios).toHaveLength(3);
    for (const [i, name] of NAMES.entries()) {
      expect(radios[i]).toHaveAccessibleName(name);
    }
  });

  it.each(VIEWS)(
    "with view %s, exactly that radio is checked and is the one tab stop (tabindex 0, the others -1)",
    (view) => {
      renderSwitcher(view);
      for (const [i, name] of NAMES.entries()) {
        const r = radio(name);
        if (VIEWS[i] === view) {
          expect(r).toBeChecked();
          expect(r.tabIndex).toBe(0);
        } else {
          expect(r).not.toBeChecked();
          expect(r.tabIndex).toBe(-1);
        }
      }
    },
  );

  it('a role="radio" control says aria-checked "true" / "false" (where the controls are not native inputs)', () => {
    renderSwitcher("week");
    for (const name of NAMES) {
      const r = radio(name);
      if (r instanceof HTMLInputElement) continue;
      expect(r).toHaveAttribute(
        "aria-checked",
        name === "Week" ? "true" : "false",
      );
    }
  });

  it.each([
    ["Week", "week"],
    ["Day", "day"],
    ["Month", "month"],
  ] as const)("clicking %s calls onChange(%j) once", async (name, view) => {
    const { user, onChange } = renderSwitcher(
      view === "month" ? "day" : "month",
    );
    await user.click(radio(name));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(view);
  });

  it("does not call onChange on render", () => {
    const { onChange } = renderSwitcher("month");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("arrow keys move the selection, wrapping, and focus follows (AC-3, Block 4)", () => {
  it.each([
    ["ArrowRight", "month", "week", "Week"],
    ["ArrowDown", "month", "week", "Week"],
    ["ArrowRight", "week", "day", "Day"],
    ["ArrowRight", "day", "month", "Month"],
    ["ArrowDown", "day", "month", "Month"],
    ["ArrowLeft", "week", "month", "Month"],
    ["ArrowUp", "week", "month", "Month"],
    ["ArrowLeft", "month", "day", "Day"],
    ["ArrowUp", "month", "day", "Day"],
    ["ArrowLeft", "day", "week", "Week"],
  ] as const)(
    "%s from %s chooses %s: onChange once, %s checked and focused",
    async (key, from, to, name) => {
      const { user, spy } = renderStateful(from);
      const start = NAMES[VIEWS.indexOf(from)] as string;
      radio(start).focus();
      await user.keyboard(`{${key}}`);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(to);
      expect(radio(name)).toBeChecked();
      expect(radio(name)).toHaveFocus();
      expect(radio(name).tabIndex).toBe(0);
      expect(radio(start).tabIndex).toBe(-1);
    },
  );

  it("ArrowRight three times from Month comes back round to Month", async () => {
    const { user, spy } = renderStateful("month");
    radio("Month").focus();
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(spy.mock.calls.map(([v]) => v)).toStrictEqual([
      "week",
      "day",
      "month",
    ]);
    expect(radio("Month")).toHaveFocus();
    expect(radio("Month")).toBeChecked();
  });

  it("a letter key on a radio does not change the view", async () => {
    const { user, spy } = renderStateful("month");
    radio("Month").focus();
    await user.keyboard("x");
    expect(spy).not.toHaveBeenCalled();
    expect(radio("Month")).toBeChecked();
  });
});
