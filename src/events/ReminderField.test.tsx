import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type JSX, useState } from "react";
import { describe, expect, it, type Mock, vi } from "vitest";
import type { ReminderChoice } from "../domain/reminder";
import { ReminderField } from "./ReminderField";

// CAL-057 Contract, Block 2 (AC-1, AC-4; components.md "Event sheet", field
// 8). The unit alone, controlled by a host that keeps the choice in state,
// so a change is observed both as the onChange argument and as what the
// field then shows. MECHANICAL: the name, option order, values and copy are
// written out by hand from the Contract; nothing is computed with
// src/domain/reminder.ts. Not pinned: class names, and the helper's id
// (only that aria-describedby resolves to the helper's text).

function Host(props: {
  initial: ReminderChoice;
  allDay: boolean;
  onChange: (choice: ReminderChoice) => void;
}): JSX.Element {
  const [choice, setChoice] = useState(props.initial);
  return (
    <ReminderField
      choice={choice}
      allDay={props.allDay}
      onChange={(next) => {
        props.onChange(next);
        setChoice(next);
      }}
    />
  );
}

function renderField(
  options: { choice?: ReminderChoice; allDay?: boolean } = {},
) {
  const user = userEvent.setup();
  const onChange: Mock<(choice: ReminderChoice) => void> = vi.fn();
  render(
    <Host
      initial={options.choice ?? "none"}
      allDay={options.allDay ?? false}
      onChange={onChange}
    />,
  );
  return { user, onChange };
}

const select = () =>
  screen.getByRole("combobox", { name: "Reminder" }) as HTMLSelectElement;

describe("CAL-057 the Reminder select (AC-1, Block 2)", () => {
  it('is a native <select> whose accessible name is "Reminder", labelled by a visible <label>', () => {
    renderField();
    expect(select().tagName).toBe("SELECT");
    const label = screen.getByText("Reminder", { selector: "label" });
    expect(label.tagName).toBe("LABEL");
  });

  it("offers exactly nine options, in order, value = the choice and text = the label: None, At time, 5, 10, 15, 30 minutes, 1 hour, 2 hours, 1 day before", () => {
    renderField();
    const options = within(select())
      .getAllByRole("option")
      .map((o) => [(o as HTMLOptionElement).value, o.textContent]);
    expect(options).toStrictEqual([
      ["none", "None"],
      ["at", "At time"],
      ["5", "5 minutes before"],
      ["10", "10 minutes before"],
      ["15", "15 minutes before"],
      ["30", "30 minutes before"],
      ["60", "1 hour before"],
      ["120", "2 hours before"],
      ["1440", "1 day before"],
    ]);
  });

  it("shows the given choice", () => {
    renderField({ choice: "120" });
    expect(select()).toHaveValue("120");
  });

  it('choosing "30 minutes before" calls onChange("30") once, and the select then shows it', async () => {
    const { user, onChange } = renderField();
    await user.selectOptions(select(), "30 minutes before");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith("30");
    expect(select()).toHaveValue("30");
  });

  it('choosing "None" from "1 day before" calls onChange("none")', async () => {
    const { user, onChange } = renderField({ choice: "1440" });
    await user.selectOptions(select(), "None");
    expect(onChange).toHaveBeenLastCalledWith("none");
    expect(select()).toHaveValue("none");
  });
});

describe("CAL-057 the all-day helper (AC-4, Block 2)", () => {
  it('an all-day event, "At time": a <p> reading "At 09:00 on the day" that the select is aria-describedby', () => {
    renderField({ choice: "at", allDay: true });
    const helper = screen.getByText("At 09:00 on the day");
    expect(helper.tagName).toBe("P");
    const id = helper.getAttribute("id") ?? "";
    expect(id).not.toBe("");
    expect(select().getAttribute("aria-describedby")).toBe(id);
    expect(select()).toHaveAccessibleDescription("At 09:00 on the day");
  });

  it('choosing "At time" on an all-day event makes the helper appear', async () => {
    const { user } = renderField({ choice: "none", allDay: true });
    expect(screen.queryByText("At 09:00 on the day")).toBeNull();
    await user.selectOptions(select(), "At time");
    expect(select()).toHaveAccessibleDescription("At 09:00 on the day");
  });

  it('a timed event, "At time": no helper, and the select describes nothing', () => {
    renderField({ choice: "at", allDay: false });
    expect(screen.queryByText("At 09:00 on the day")).toBeNull();
    expect(select()).not.toHaveAttribute("aria-describedby");
  });

  it('an all-day event, "30 minutes before": no helper, and the select describes nothing', () => {
    renderField({ choice: "30", allDay: true });
    expect(screen.queryByText("At 09:00 on the day")).toBeNull();
    expect(select()).not.toHaveAttribute("aria-describedby");
  });
});
