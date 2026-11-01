import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type JSX, useState } from "react";
import { describe, expect, it, type Mock, vi } from "vitest";
import type { EventFormValue } from "../domain/eventForm";
import { RepeatField } from "./RepeatField";

// CAL-024 Contract, Block 2 (AC-1, AC-2; components.md "Event sheet", field
// 7; PO decision 4). The unit alone, controlled by a host that keeps the
// value in state, so a change is observed both as the onChange argument and
// as what the field then shows. MECHANICAL: roles, names, option order and
// copy are pinned exactly. The helper copy is written out by hand here, not
// computed with repeatHelper, so the oracle does not share the
// implementation. The date input is set with fireEvent.change, as in
// EventForm.test.tsx (one change event with the final value).
//
// Not pinned: class names (CSS modules hash them), the radios' shared `name`
// value (only that it is shared), and the ids behind aria-describedby (only
// that they resolve to the right text).

/** Wednesday 14 October 2026, Does not repeat. */
const BASE: EventFormValue = {
  title: "Spin",
  kindId: "00000000-0000-4000-8000-000000000001",
  allDay: false,
  startDate: "2026-10-14",
  startTime: "09:00",
  endDate: "2026-10-14",
  endTime: "10:00",
  location: "",
  notes: "",
  repeat: "none",
  repeatEnds: "never",
  repeatUntil: "",
};

function Host(props: {
  initial: EventFormValue;
  error: string | undefined;
  onChange: (value: EventFormValue) => void;
}): JSX.Element {
  const [value, setValue] = useState(props.initial);
  return (
    <RepeatField
      value={value}
      onChange={(next) => {
        props.onChange(next);
        setValue(next);
      }}
      error={props.error}
    />
  );
}

function renderField(
  options: { value?: Partial<EventFormValue>; error?: string } = {},
) {
  const user = userEvent.setup();
  const onChange: Mock<(value: EventFormValue) => void> = vi.fn();
  render(
    <Host
      initial={{ ...BASE, ...options.value }}
      error={options.error}
      onChange={onChange}
    />,
  );
  return { user, onChange };
}

const select = () =>
  screen.getByRole("combobox", { name: "Repeat" }) as HTMLSelectElement;
const endsGroup = () => screen.getByRole("group", { name: "Repeat ends" });
const queryEndsGroup = () =>
  screen.queryByRole("group", { name: "Repeat ends" });
const until = () => screen.getByLabelText("Repeat until") as HTMLInputElement;
const lastValue = (onChange: Mock<(value: EventFormValue) => void>) =>
  onChange.mock.lastCall?.[0];

describe("the Repeat group and its select (Block 2, item 1)", () => {
  it('is one <fieldset> whose <legend> reads "Repeat", holding the select', () => {
    renderField();
    const group = screen.getByRole("group", { name: "Repeat" });
    expect(group.tagName).toBe("FIELDSET");
    const legend = group.querySelector(":scope > legend");
    expect(legend?.textContent).toBe("Repeat");
    expect(group.contains(select())).toBe(true);
  });

  it('the select is a native <select aria-label="Repeat">', () => {
    renderField();
    expect(select().tagName).toBe("SELECT");
    expect(select()).toHaveAttribute("aria-label", "Repeat");
  });

  it("offers exactly four options, in order: none Does not repeat, daily Daily, weekly Weekly, yearly Yearly", () => {
    renderField();
    const options = within(select())
      .getAllByRole("option")
      .map((o) => [(o as HTMLOptionElement).value, o.textContent]);
    expect(options).toStrictEqual([
      ["none", "Does not repeat"],
      ["daily", "Daily"],
      ["weekly", "Weekly"],
      ["yearly", "Yearly"],
    ]);
  });

  it("shows the value's repeat", () => {
    renderField({ value: { repeat: "yearly" } });
    expect(select()).toHaveValue("yearly");
  });

  it('"Does not repeat": no helper, no "Repeat ends" group, no Repeat until input, and the select describes nothing', () => {
    renderField({ value: { repeatEnds: "on", repeatUntil: "2026-11-30" } });
    expect(select()).toHaveValue("none");
    expect(select()).not.toHaveAttribute("aria-describedby");
    expect(queryEndsGroup()).toBeNull();
    expect(screen.queryByLabelText("Repeat until")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByText(/^Every /)).toBeNull();
  });
});

describe("the helper (AC-1, Block 2, item 2)", () => {
  it.each([
    ["weekly", "Every Wednesday"],
    ["yearly", "Every year on 14 October"],
    ["daily", "Every day"],
  ] as const)(
    "%s on Wednesday 14 October 2026: a <p> reading %j that the select is described by",
    (repeat, text) => {
      renderField({ value: { repeat } });
      const helper = screen.getByText(text);
      expect(helper.tagName).toBe("P");
      const id = helper.getAttribute("id") ?? "";
      expect(id).not.toBe("");
      expect(select().getAttribute("aria-describedby")).toBe(id);
      expect(select()).toHaveAccessibleDescription(text);
    },
  );

  it("follows the start date's weekday: Tuesday 13 October reads Every Tuesday", () => {
    renderField({ value: { repeat: "weekly", startDate: "2026-10-13" } });
    expect(select()).toHaveAccessibleDescription("Every Tuesday");
  });
});

describe("changing the select (AC-1, Block 2, item 1)", () => {
  it('Weekly: onChange({ ...value, repeat: "weekly" }), and the helper and the Ends choice appear', async () => {
    const { user, onChange } = renderField();
    await user.selectOptions(select(), "weekly");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(lastValue(onChange)).toStrictEqual({ ...BASE, repeat: "weekly" });
    expect(screen.getByText("Every Wednesday")).toBeInTheDocument();
    expect(endsGroup()).toBeInTheDocument();
  });

  it("Weekly then Yearly then Daily: the helper follows each", async () => {
    const { user } = renderField();
    await user.selectOptions(select(), "weekly");
    expect(select()).toHaveAccessibleDescription("Every Wednesday");
    await user.selectOptions(select(), "yearly");
    expect(select()).toHaveAccessibleDescription("Every year on 14 October");
    await user.selectOptions(select(), "daily");
    expect(select()).toHaveAccessibleDescription("Every day");
  });

  it('back to "Does not repeat": the Ends choice and the helper leave the DOM, and repeatEnds / repeatUntil are left as they were', async () => {
    const { user, onChange } = renderField({
      value: { repeat: "weekly", repeatEnds: "on", repeatUntil: "2026-11-30" },
    });
    await user.selectOptions(select(), "none");
    expect(lastValue(onChange)).toStrictEqual({
      ...BASE,
      repeat: "none",
      repeatEnds: "on",
      repeatUntil: "2026-11-30",
    });
    expect(queryEndsGroup()).toBeNull();
    expect(screen.queryByLabelText("Repeat until")).toBeNull();
    expect(screen.queryByText("Every Wednesday")).toBeNull();
  });
});

describe("the Ends choice (AC-1, Block 2, item 3, PO decision 4)", () => {
  it('is a nested <fieldset> named "Repeat ends", inside the Repeat group, whose visible <legend> reads "Ends"', () => {
    renderField({ value: { repeat: "weekly" } });
    const group = endsGroup();
    expect(group.tagName).toBe("FIELDSET");
    expect(group).toHaveAttribute("aria-label", "Repeat ends");
    expect(group.querySelector(":scope > legend")?.textContent).toBe("Ends");
    expect(screen.getByRole("group", { name: "Repeat" }).contains(group)).toBe(
      true,
    );
  });

  it('holds two radios, "Never" (value never) then "On date" (value on), sharing one name', () => {
    renderField({ value: { repeat: "weekly" } });
    const radios = within(endsGroup()).getAllByRole("radio");
    expect(radios).toHaveLength(2);
    const [never, on] = radios as [HTMLInputElement, HTMLInputElement];
    expect(never).toHaveAccessibleName("Never");
    expect(never).toHaveAttribute("type", "radio");
    expect(never.value).toBe("never");
    expect(on).toHaveAccessibleName("On date");
    expect(on.value).toBe("on");
    expect(never.name).not.toBe("");
    expect(on.name).toBe(never.name);
  });

  it('repeatEnds "never": Never is checked, On date is not, and there is no Repeat until input', () => {
    renderField({ value: { repeat: "weekly" } });
    expect(screen.getByRole("radio", { name: "Never" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "On date" })).not.toBeChecked();
    expect(screen.queryByLabelText("Repeat until")).toBeNull();
  });

  it('choosing On date: onChange({ ...value, repeatEnds: "on" }) and a native date input "Repeat until" appears, showing repeatUntil', async () => {
    const { user, onChange } = renderField({
      value: { repeat: "weekly", repeatUntil: "2026-11-30" },
    });
    await user.click(screen.getByRole("radio", { name: "On date" }));
    expect(lastValue(onChange)).toStrictEqual({
      ...BASE,
      repeat: "weekly",
      repeatEnds: "on",
      repeatUntil: "2026-11-30",
    });
    expect(screen.getByRole("radio", { name: "On date" })).toBeChecked();
    expect(until().tagName).toBe("INPUT");
    expect(until()).toHaveAttribute("type", "date");
    expect(until()).toHaveAttribute("aria-label", "Repeat until");
    expect(until()).toHaveValue("2026-11-30");
    expect(endsGroup().contains(until())).toBe(true);
  });

  it('choosing Never again: onChange({ ...value, repeatEnds: "never" }) and Repeat until leaves', async () => {
    const { user, onChange } = renderField({
      value: { repeat: "daily", repeatEnds: "on", repeatUntil: "2026-11-30" },
    });
    await user.click(screen.getByRole("radio", { name: "Never" }));
    expect(lastValue(onChange)).toStrictEqual({
      ...BASE,
      repeat: "daily",
      repeatEnds: "never",
      repeatUntil: "2026-11-30",
    });
    expect(screen.queryByLabelText("Repeat until")).toBeNull();
  });

  it("setting Repeat until: onChange({ ...value, repeatUntil }) with the date typed", () => {
    const { onChange } = renderField({
      value: { repeat: "weekly", repeatEnds: "on" },
    });
    fireEvent.change(until(), { target: { value: "2026-11-30" } });
    expect(lastValue(onChange)).toStrictEqual({
      ...BASE,
      repeat: "weekly",
      repeatEnds: "on",
      repeatUntil: "2026-11-30",
    });
    expect(until()).toHaveValue("2026-11-30");
  });
});

describe("the error on Repeat until (AC-2, Block 2, item 3)", () => {
  const ON = {
    repeat: "weekly",
    repeatEnds: "on",
    repeatUntil: "2026-10-01",
  } as const;

  it('with an error: a <p> carrying it, which Repeat until is aria-describedby, and aria-invalid="true"', () => {
    renderField({ value: ON, error: "The series must end after it starts." });
    const message = screen.getByText("The series must end after it starts.");
    expect(message.tagName).toBe("P");
    const id = message.getAttribute("id") ?? "";
    expect(id).not.toBe("");
    expect(until()).toHaveAttribute("aria-invalid", "true");
    expect(until()).toHaveAttribute("aria-describedby", id);
    expect(until()).toHaveAccessibleDescription(
      "The series must end after it starts.",
    );
    expect(select()).not.toHaveAttribute("aria-invalid");
  });

  it("without one: no message, no aria-invalid, no aria-describedby on Repeat until", () => {
    renderField({ value: ON });
    expect(
      screen.queryByText("The series must end after it starts."),
    ).toBeNull();
    expect(until()).not.toHaveAttribute("aria-invalid");
    expect(until()).not.toHaveAttribute("aria-describedby");
  });
});
