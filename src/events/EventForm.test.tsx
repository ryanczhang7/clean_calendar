import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type JSX, useState } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, type Mock, vi } from "vitest";
import type { Kind } from "../data/rows";
import {
  END_ERROR,
  type EventFormValue,
  type FormErrors,
  TITLE_ERROR,
} from "../domain/eventForm";
import { EventForm } from "./EventForm";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-012 Contract, Block 4 (AC-2, AC-3; components.md "Event sheet",
// fields in order). The unit alone: controlled by a host that keeps the
// value in state, so a change is observed both as the onChange argument and
// as what the inputs then show. MECHANICAL: labels, roles and the copy are
// pinned exactly. Native date and time inputs are set with fireEvent.change
// - measured in RED on jsdom 30.1.2: user.clear + user.type on a
// type="time" input fires "" then "14:03" then "14:30", three onChanges and
// two bogus intermediate values, while fireEvent.change fires once with the
// final value. Text inputs use user-event.

const STAMP = "2026-10-16T08:00:00.000001+00:00";

function kind(n: number, name: string): Kind {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name,
    colorLight: "#2E7D32",
    colorDark: "#9BD69B",
    sortOrder: n,
    isDefault: true,
    deletedAt: null,
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

const GYM = kind(1, "Gym");
const MOVIES = kind(2, "Movies");

const TIMED: EventFormValue = {
  title: "Dentist",
  kindId: GYM.id,
  allDay: false,
  startDate: "2026-10-14",
  startTime: "09:00",
  endDate: "2026-10-14",
  endTime: "10:30",
  location: "",
  notes: "",
};

function Host(props: {
  initial: EventFormValue;
  errors: FormErrors;
  kindRemoved: boolean;
  onChange: (value: EventFormValue) => void;
}): JSX.Element {
  const [value, setValue] = useState(props.initial);
  return (
    <EventForm
      value={value}
      onChange={(next) => {
        props.onChange(next);
        setValue(next);
      }}
      errors={props.errors}
      kinds={[GYM, MOVIES]}
      kindRemoved={props.kindRemoved}
      titleId="the-title"
    />
  );
}

function renderForm(
  options: {
    value?: EventFormValue;
    errors?: FormErrors;
    kindRemoved?: boolean;
  } = {},
) {
  const user = userEvent.setup();
  const onChange: Mock<(value: EventFormValue) => void> = vi.fn();
  const view = render(
    <MemoryRouter>
      <Host
        initial={options.value ?? TIMED}
        errors={options.errors ?? {}}
        kindRemoved={options.kindRemoved ?? false}
        onChange={onChange}
      />
    </MemoryRouter>,
  );
  return { user, onChange, container: view.container };
}

const title = () => screen.getByRole("textbox", { name: "Title" });
const field = (label: string) => screen.getByLabelText(label) as HTMLElement;
const allDaySwitch = () => screen.getByRole("switch", { name: "All day" });
const lastValue = (onChange: Mock<(value: EventFormValue) => void>) =>
  onChange.mock.lastCall?.[0];

describe("the fields, in components.md's order (Block 4)", () => {
  it("Title, Kind, All day, Start date, Start time, End date, End time, Location, Notes - in that document order", () => {
    renderForm();
    const order = [
      title(),
      screen.getByRole("button", { name: "Kind, Gym" }),
      allDaySwitch(),
      field("Start date"),
      field("Start time"),
      field("End date"),
      field("End time"),
      screen.getByRole("textbox", { name: "Location" }),
      screen.getByRole("textbox", { name: "Notes" }),
    ];
    for (let i = 1; i < order.length; i += 1) {
      const before = order[i - 1] as HTMLElement;
      expect(
        before.compareDocumentPosition(order[i] as HTMLElement) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        `field ${i} follows field ${i - 1}`,
      ).toBeTruthy();
    }
  });

  it("Title is a one-line text input carrying the given id and maxLength 120, showing the value", () => {
    renderForm();
    const input = title();
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("id", "the-title");
    expect(input).toHaveAttribute("maxlength", "120");
    expect(input).toHaveValue("Dentist");
  });

  it("Title, Location and Notes are labelled by visible <label>s", () => {
    renderForm();
    for (const name of ["Title", "Location", "Notes"]) {
      const input = screen.getByRole("textbox", { name });
      const labels = (input as HTMLInputElement).labels;
      expect(labels?.length, `${name} has a <label>`).toBeGreaterThan(0);
      expect(labels?.[0]).toHaveTextContent(name);
    }
  });

  it("Notes is a textarea; Location a text input", () => {
    renderForm();
    expect(screen.getByRole("textbox", { name: "Notes" }).tagName).toBe(
      "TEXTAREA",
    );
    expect(screen.getByRole("textbox", { name: "Location" })).toHaveAttribute(
      "type",
      "text",
    );
  });

  it("the dates are native date inputs and the times native time inputs with a 15-minute step", () => {
    renderForm();
    expect(field("Start date")).toHaveAttribute("type", "date");
    expect(field("End date")).toHaveAttribute("type", "date");
    expect(field("Start time")).toHaveAttribute("type", "time");
    expect(field("End time")).toHaveAttribute("type", "time");
    expect(field("Start time")).toHaveAttribute("step", "900");
    expect(field("End time")).toHaveAttribute("step", "900");
  });

  it("shows the value's dates and times", () => {
    renderForm();
    expect(field("Start date")).toHaveValue("2026-10-14");
    expect(field("Start time")).toHaveValue("09:00");
    expect(field("End date")).toHaveValue("2026-10-14");
    expect(field("End time")).toHaveValue("10:30");
  });

  it('All day is a switch, aria-checked="false" on a timed value', () => {
    renderForm();
    expect(allDaySwitch()).toHaveAttribute("aria-checked", "false");
    expect(allDaySwitch()).toHaveAttribute("type", "button");
  });

  it("has no Repeat and no Reminder field, and no <form> of its own", () => {
    const { container } = renderForm();
    expect(screen.queryByLabelText(/Repeat/)).toBeNull();
    expect(screen.queryByLabelText(/Reminder/)).toBeNull();
    expect(container.querySelector("form")).toBeNull();
  });

  it("no field is disabled or read-only", () => {
    renderForm();
    for (const el of [
      title(),
      field("Start date"),
      field("Start time"),
      field("End date"),
      field("End time"),
      screen.getByRole("textbox", { name: "Location" }),
      screen.getByRole("textbox", { name: "Notes" }),
    ]) {
      expect(el).toBeEnabled();
      expect(el).not.toHaveAttribute("readonly");
    }
  });

  it('a removed kind reads "Kind, Kind removed" (AC-7)', () => {
    renderForm({ value: { ...TIMED, kindId: null }, kindRemoved: true });
    expect(
      screen.getByRole("button", { name: "Kind, Kind removed" }),
    ).toBeInTheDocument();
  });
});

describe("changes go out through onChange (Block 4)", () => {
  it("typing in Title calls onChange with the new title", async () => {
    const { user, onChange } = renderForm();
    await user.type(title(), "!");
    expect(lastValue(onChange)).toStrictEqual({ ...TIMED, title: "Dentist!" });
  });

  it("typing in Location and Notes", async () => {
    const { user, onChange } = renderForm();
    await user.type(screen.getByRole("textbox", { name: "Location" }), "Pool");
    expect(lastValue(onChange)?.location).toBe("Pool");
    await user.type(screen.getByRole("textbox", { name: "Notes" }), "Lane 3");
    expect(lastValue(onChange)?.notes).toBe("Lane 3");
  });

  it("picking a kind calls onChange with its id", async () => {
    const { user, onChange } = renderForm();
    await user.click(screen.getByRole("button", { name: "Kind, Gym" }));
    await user.click(screen.getByRole("option", { name: "Movies" }));
    expect(lastValue(onChange)).toStrictEqual({ ...TIMED, kindId: MOVIES.id });
  });

  it("changing End time alone moves nothing else", () => {
    const { onChange } = renderForm();
    fireEvent.change(field("End time"), { target: { value: "11:00" } });
    expect(lastValue(onChange)).toStrictEqual({ ...TIMED, endTime: "11:00" });
  });

  it("changing End date alone moves nothing else", () => {
    const { onChange } = renderForm();
    fireEvent.change(field("End date"), { target: { value: "2026-10-15" } });
    expect(lastValue(onChange)).toStrictEqual({
      ...TIMED,
      endDate: "2026-10-15",
    });
  });
});

describe("the start drags the end along (AC-3, Block 4 through moveStart)", () => {
  it("Start time 09:00 -> 14:00 on a 09:00 - 10:30 event: End time shows 15:30", () => {
    const { onChange } = renderForm();
    fireEvent.change(field("Start time"), { target: { value: "14:00" } });
    expect(field("Start time")).toHaveValue("14:00");
    expect(field("End time")).toHaveValue("15:30");
    expect(lastValue(onChange)).toStrictEqual({
      ...TIMED,
      startTime: "14:00",
      endTime: "15:30",
    });
  });

  it("Start date 14 -> 15 Oct: End date shows 15 Oct, times unchanged", () => {
    renderForm();
    fireEvent.change(field("Start date"), { target: { value: "2026-10-15" } });
    expect(field("End date")).toHaveValue("2026-10-15");
    expect(field("End time")).toHaveValue("10:30");
  });

  it("with End not after Start, a new start moves only the start", () => {
    renderForm({ value: { ...TIMED, startTime: "10:00", endTime: "09:00" } });
    fireEvent.change(field("Start time"), { target: { value: "14:00" } });
    expect(field("End time")).toHaveValue("09:00");
    expect(field("End date")).toHaveValue("2026-10-14");
  });
});

describe("All day (AC-3, Block 4)", () => {
  it("switching on calls onChange with allDay true, hides both time inputs, keeps both dates", async () => {
    const { user, onChange } = renderForm();
    await user.click(allDaySwitch());
    expect(lastValue(onChange)).toStrictEqual({ ...TIMED, allDay: true });
    expect(allDaySwitch()).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByLabelText("Start time")).toBeNull();
    expect(screen.queryByLabelText("End time")).toBeNull();
    expect(field("Start date")).toHaveValue("2026-10-14");
    expect(field("End date")).toHaveValue("2026-10-14");
  });

  it("switching off again brings the time inputs back with the kept times", async () => {
    const { user } = renderForm();
    await user.click(allDaySwitch());
    await user.click(allDaySwitch());
    expect(allDaySwitch()).toHaveAttribute("aria-checked", "false");
    expect(field("Start time")).toHaveValue("09:00");
    expect(field("End time")).toHaveValue("10:30");
  });

  it("an all-day value renders no time inputs at all", () => {
    renderForm({ value: { ...TIMED, allDay: true } });
    expect(allDaySwitch()).toHaveAttribute("aria-checked", "true");
    expect(document.querySelectorAll('input[type="time"]')).toHaveLength(0);
    expect(document.querySelectorAll('input[type="date"]')).toHaveLength(2);
  });
});

describe("errors on the fields (AC-2, Block 4)", () => {
  it("no errors: no message, and no aria-invalid or aria-describedby on Title or End", () => {
    renderForm();
    expect(screen.queryByText(TITLE_ERROR)).toBeNull();
    expect(screen.queryByText(END_ERROR)).toBeNull();
    for (const el of [title(), field("End date"), field("End time")]) {
      expect(el).not.toHaveAttribute("aria-invalid");
      expect(el).not.toHaveAttribute("aria-describedby");
    }
  });

  it('the title error: "Give the event a title." in a <p> that Title is aria-describedby, aria-invalid="true"', () => {
    renderForm({
      value: { ...TIMED, title: "" },
      errors: { title: TITLE_ERROR },
    });
    const message = screen.getByText("Give the event a title.");
    expect(message.tagName).toBe("P");
    const id = message.getAttribute("id");
    expect(id).toBeTruthy();
    expect(title()).toHaveAttribute("aria-invalid", "true");
    expect(title()).toHaveAttribute("aria-describedby", id);
    expect(title()).toHaveAccessibleDescription("Give the event a title.");
    expect(field("End date")).not.toHaveAttribute("aria-invalid");
  });

  it('the end error: "End must be after start." describing End date and End time, both aria-invalid', () => {
    renderForm({ errors: { end: END_ERROR } });
    const message = screen.getByText("End must be after start.");
    expect(message.tagName).toBe("P");
    for (const el of [field("End date"), field("End time")]) {
      expect(el).toHaveAttribute("aria-invalid", "true");
      expect(el).toHaveAccessibleDescription("End must be after start.");
    }
    expect(title()).not.toHaveAttribute("aria-invalid");
    expect(field("Start date")).not.toHaveAttribute("aria-invalid");
  });

  it("the end error on an all-day value describes End date", () => {
    renderForm({
      value: { ...TIMED, allDay: true },
      errors: { end: END_ERROR },
    });
    expect(field("End date")).toHaveAttribute("aria-invalid", "true");
    expect(field("End date")).toHaveAccessibleDescription(
      "End must be after start.",
    );
  });

  it("both errors at once, each on its own field", () => {
    renderForm({ errors: { title: TITLE_ERROR, end: END_ERROR } });
    expect(title()).toHaveAccessibleDescription("Give the event a title.");
    expect(field("End date")).toHaveAccessibleDescription(
      "End must be after start.",
    );
  });
});

// CAL-021 Contract, Block 2 (AC-1, AC-2; components.md "Confirm screen").
// MECHANICAL: a field whose state is "low" or "missing" carries data-state
// on its wrapper (the .field div, or the Starts / Ends <fieldset>), a
// <svg aria-hidden="true" data-glyph="warning"> in its label or legend, and
// a helper <p id> that every input of the field names in aria-describedby -
// helper first, then the error when both render. A state never sets
// aria-invalid. "confident", and no prop at all, render nothing extra. The
// copy is voice.md's, written out by hand.

type FieldStatesProp = Partial<
  Record<
    "title" | "kind" | "start" | "end" | "location",
    "confident" | "low" | "missing"
  >
>;

const LOW = "Not sure about this — check it";
const MISSING = "Not found in the text — add it";

function StateHost(props: {
  initial: EventFormValue;
  errors: FormErrors;
  fieldStates: FieldStatesProp;
}): JSX.Element {
  const [value, setValue] = useState(props.initial);
  return (
    <EventForm
      value={value}
      onChange={setValue}
      errors={props.errors}
      kinds={[GYM, MOVIES]}
      kindRemoved={false}
      titleId="the-title"
      fieldStates={props.fieldStates}
    />
  );
}

function renderStates(
  fieldStates: FieldStatesProp,
  options: { value?: EventFormValue; errors?: FormErrors } = {},
) {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter>
      <StateHost
        initial={options.value ?? TIMED}
        errors={options.errors ?? {}}
        fieldStates={fieldStates}
      />
    </MemoryRouter>,
  );
  return { user, container: view.container, unmount: view.unmount };
}

const glyphIn = (el: Element | null) =>
  el?.querySelector('svg[data-glyph="warning"]') ?? null;
const group = (name: string) => screen.getByRole("group", { name });
const labelOf = (el: HTMLElement) =>
  (el as HTMLInputElement).labels?.[0] ?? null;
const locationBox = () => screen.getByRole("textbox", { name: "Location" });
const kindLabel = () => screen.getByText("Kind", { selector: "span" });
const describedBy = (el: HTMLElement) =>
  (el.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);

/** The helper <p> with this text: its id, which must be non-empty. */
function helper(text: string): { el: HTMLElement; id: string } {
  const el = screen.getByText(text);
  expect(el.tagName).toBe("P");
  const id = el.getAttribute("id") ?? "";
  expect(id).not.toBe("");
  return { el, id };
}

describe("per-field confirm state (CAL-021 Block 2, AC-1, AC-2)", () => {
  it("without fieldStates nothing is marked; with a low Title, Title alone is", () => {
    const first = renderStates({});
    expect(first.container.querySelector("[data-state]")).toBeNull();
    expect(first.container.querySelector("svg[data-glyph]")).toBeNull();
    expect(screen.queryByText(LOW)).toBeNull();
    expect(screen.queryByText(MISSING)).toBeNull();
    expect(title()).not.toHaveAttribute("aria-describedby");
    first.unmount();

    const second = renderStates({ title: "low" });
    expect(second.container.querySelectorAll("[data-state]")).toHaveLength(1);
    expect(title().closest("[data-state]")).toHaveAttribute(
      "data-state",
      "low",
    );
  });

  it('"confident" passed explicitly sets no data-state, no glyph and no helper, beside a missing Location that does', () => {
    const { container } = renderStates({
      title: "confident",
      kind: "confident",
      start: "confident",
      end: "confident",
      location: "missing",
    });
    expect(container.querySelectorAll("[data-state]")).toHaveLength(1);
    expect(title().closest("[data-state]")).toBeNull();
    expect(glyphIn(labelOf(title()))).toBeNull();
    expect(title()).not.toHaveAttribute("aria-describedby");
    expect(locationBox().closest("[data-state]")).toHaveAttribute(
      "data-state",
      "missing",
    );
  });

  it('a low Title: data-state="low" on its wrapper, the glyph in its <label>, the helper describing the input, no aria-invalid', () => {
    renderStates({ title: "low" });
    const wrapper = title().closest("[data-state]") as HTMLElement;
    expect(wrapper).toHaveAttribute("data-state", "low");
    expect(wrapper).toContainElement(labelOf(title()));
    const glyph = glyphIn(labelOf(title()));
    expect(glyph).not.toBeNull();
    expect(glyph).toHaveAttribute("aria-hidden", "true");
    const { el, id } = helper(LOW);
    expect(wrapper).toContainElement(el);
    expect(
      title().compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(title()).toHaveAttribute("aria-describedby", id);
    expect(title()).toHaveAccessibleDescription(LOW);
    expect(title()).toHaveAccessibleName("Title");
    expect(title()).not.toHaveAttribute("aria-invalid");
  });

  it('a missing Title: data-state="missing" and "Not found in the text — add it"', () => {
    renderStates({ title: "missing" }, { value: { ...TIMED, title: "" } });
    expect(title().closest("[data-state]")).toHaveAttribute(
      "data-state",
      "missing",
    );
    expect(glyphIn(labelOf(title()))).toHaveAttribute("aria-hidden", "true");
    expect(title()).toHaveAttribute("aria-describedby", helper(MISSING).id);
    expect(title()).toHaveAccessibleDescription(MISSING);
    expect(title()).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText(LOW)).toBeNull();
  });

  it("a low Title with the title error: helper and error both describe it, helper first", () => {
    renderStates(
      { title: "low" },
      { value: { ...TIMED, title: "" }, errors: { title: TITLE_ERROR } },
    );
    const { id } = helper(LOW);
    const errorId = screen.getByText(TITLE_ERROR).getAttribute("id");
    expect(describedBy(title())).toStrictEqual([id, errorId]);
    expect(title()).toHaveAttribute("aria-invalid", "true");
  });

  it("a low Kind: the Kind wrapper is marked, the glyph sits in the Kind label, and the picker trigger is described by the helper", () => {
    renderStates({ kind: "low" });
    const trigger = screen.getByRole("button", { name: "Kind, Gym" });
    const wrapper = trigger.closest("[data-state]") as HTMLElement;
    expect(wrapper).toHaveAttribute("data-state", "low");
    expect(wrapper).toContainElement(kindLabel());
    expect(glyphIn(kindLabel())).toHaveAttribute("aria-hidden", "true");
    expect(trigger).toHaveAttribute("aria-describedby", helper(LOW).id);
    expect(trigger).toHaveAccessibleDescription(LOW);
    expect(trigger).toHaveAccessibleName("Kind, Gym");
    expect(title().closest("[data-state]")).toBeNull();
  });

  it("a missing Start: the Starts fieldset is marked, the glyph is in its legend, and BOTH start inputs are described; Ends is not", () => {
    renderStates(
      { start: "missing" },
      { value: { ...TIMED, startDate: "", startTime: "" } },
    );
    const starts = group("Starts");
    expect(starts.tagName).toBe("FIELDSET");
    expect(starts).toHaveAttribute("data-state", "missing");
    expect(glyphIn(starts.querySelector("legend"))).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    const { el, id } = helper(MISSING);
    expect(starts).toContainElement(el);
    for (const label of ["Start date", "Start time"]) {
      expect(field(label).closest("[data-state]")).toBe(starts);
      expect(field(label)).toHaveAttribute("aria-describedby", id);
      expect(field(label)).toHaveAccessibleDescription(MISSING);
      expect(field(label)).not.toHaveAttribute("aria-invalid");
    }
    expect(group("Ends")).not.toHaveAttribute("data-state");
    expect(field("End date")).not.toHaveAttribute("aria-describedby");
  });

  it("a low End, timed: both end inputs are described by the helper", () => {
    renderStates({ end: "low" });
    const ends = group("Ends");
    expect(ends).toHaveAttribute("data-state", "low");
    expect(glyphIn(ends.querySelector("legend"))).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    const { id } = helper(LOW);
    for (const label of ["End date", "End time"]) {
      expect(field(label)).toHaveAttribute("aria-describedby", id);
      expect(field(label)).toHaveAccessibleDescription(LOW);
    }
    expect(group("Starts")).not.toHaveAttribute("data-state");
  });

  it("a low End on an all-day value: End date, the one end input, is described", () => {
    renderStates({ end: "low" }, { value: { ...TIMED, allDay: true } });
    expect(screen.queryByLabelText("End time")).toBeNull();
    expect(field("End date")).toHaveAttribute(
      "aria-describedby",
      helper(LOW).id,
    );
  });

  it('a missing End with the end error: aria-describedby is "{helperId} {errorId}" on both inputs, the helper rendered before the error', () => {
    renderStates(
      { end: "missing" },
      {
        value: { ...TIMED, endDate: "", endTime: "" },
        errors: { end: END_ERROR },
      },
    );
    const { el, id } = helper(MISSING);
    const error = screen.getByText(END_ERROR);
    const errorId = error.getAttribute("id") ?? "";
    expect(errorId).not.toBe("");
    expect(
      el.compareDocumentPosition(error) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    for (const label of ["End date", "End time"]) {
      expect(field(label)).toHaveAttribute(
        "aria-describedby",
        `${id} ${errorId}`,
      );
      expect(field(label)).toHaveAccessibleDescription(
        `${MISSING} ${END_ERROR}`,
      );
      // The error, not the state, sets aria-invalid.
      expect(field(label)).toHaveAttribute("aria-invalid", "true");
    }
  });

  it("a low Location: its wrapper, its label's glyph and its helper; Notes is never marked", () => {
    renderStates({ location: "low" });
    const wrapper = locationBox().closest("[data-state]") as HTMLElement;
    expect(wrapper).toHaveAttribute("data-state", "low");
    expect(wrapper).toContainElement(labelOf(locationBox()));
    expect(glyphIn(labelOf(locationBox()))).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(locationBox()).toHaveAttribute("aria-describedby", helper(LOW).id);
    expect(locationBox()).toHaveAccessibleDescription(LOW);
    expect(locationBox()).not.toHaveAttribute("aria-invalid");
    expect(
      screen.getByRole("textbox", { name: "Notes" }).closest("[data-state]"),
    ).toBeNull();
  });

  it("all five missing: five marked wrappers with five distinct helper ids; All day and Notes stay plain", () => {
    const { container } = renderStates({
      title: "missing",
      kind: "missing",
      start: "missing",
      end: "missing",
      location: "missing",
    });
    expect(container.querySelectorAll('[data-state="missing"]')).toHaveLength(
      5,
    );
    const ids = screen.getAllByText(MISSING).map((p) => p.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(
      container.querySelectorAll('svg[data-glyph="warning"]'),
    ).toHaveLength(5);
    expect(allDaySwitch().closest("[data-state]")).toBeNull();
    expect(
      screen.getByRole("textbox", { name: "Notes" }).closest("[data-state]"),
    ).toBeNull();
  });

  it("the marking stays while the owner types: a missing Title filled in is still marked (PO decision 4)", async () => {
    const { user } = renderStates(
      { title: "missing" },
      { value: { ...TIMED, title: "" } },
    );
    await user.type(title(), "Dinner");
    expect(title()).toHaveValue("Dinner");
    expect(title().closest("[data-state]")).toHaveAttribute(
      "data-state",
      "missing",
    );
    expect(title()).toHaveAccessibleDescription(MISSING);
  });
});
