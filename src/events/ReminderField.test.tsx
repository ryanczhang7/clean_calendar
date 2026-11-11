import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type JSX, useState } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import type { ReminderChoice } from "../domain/reminder";
import {
  installPushBrowser,
  type Permission,
  type PushBrowser,
  VAPID_KEY,
} from "../test/push";
import { ReminderField } from "./ReminderField";

// CAL-027: the field now renders the permission card, whose module reaches
// the app's Supabase client (src/data/pushSubscriptions.ts); the real
// src/lib/supabase.ts cannot be built without env, so it is mocked here as in
// every other suite that reaches it.
vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

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

// CAL-027 Contract, Block 4 (AC-1, AC-3, AC-6; PO decision 3). The
// permission card under the field: rendered iff the choice is not None,
// whether chosen now or arriving with the event; `onGone` focuses the select;
// no card state ever disables the select. The browser is src/test/push.ts and
// the worker never becomes ready, so nothing here reaches the network. Every
// "no card" assertion is paired with its positive in the same test.

describe("CAL-027 the permission card under the Reminder field (AC-1, Block 4)", () => {
  let browser: PushBrowser | null = null;

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    browser?.restore();
    browser = null;
    vi.unstubAllEnvs();
    sessionStorage.clear();
  });

  function supported(permission: Permission = "default"): PushBrowser {
    browser = installPushBrowser({ permission, ready: "pending" });
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", VAPID_KEY);
    return browser;
  }

  /** The field inside an event-like <form>, so a submit can be observed. */
  function renderInForm(choice: ReminderChoice) {
    const user = userEvent.setup();
    const onChange: Mock<(choice: ReminderChoice) => void> = vi.fn();
    const onSubmit = vi.fn((e: { preventDefault(): void }) =>
      e.preventDefault(),
    );
    const view = render(
      <form onSubmit={onSubmit}>
        <Host initial={choice} allDay={false} onChange={onChange} />
      </form>,
    );
    return { user, onChange, onSubmit, view };
  }

  const card = () =>
    screen.queryByRole("region", { name: "Get reminders on this device" });
  const allow = () =>
    screen.getByRole("button", { name: "Allow notifications" });
  const notNow = () => screen.getByRole("button", { name: "Not now" });

  it("None shows no card; choosing a reminder shows it inline under the field, with Allow and Not now, and requests nothing", async () => {
    const b = supported();
    const { user } = renderInForm("none");
    expect(card()).toBeNull();
    await user.selectOptions(select(), "30 minutes before");
    const region = card();
    expect(region).not.toBeNull();
    expect(select().parentElement).toContainElement(region);
    expect(
      select().compareDocumentPosition(region as HTMLElement) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      within(region as HTMLElement)
        .getAllByRole("button")
        .map((x) => x.textContent),
    ).toStrictEqual(["Allow notifications", "Not now"]);
    expect(b.requestPermission).not.toHaveBeenCalled();
  });

  it("an event that arrives with a reminder already set shows the card when the form opens (PO decision 3)", () => {
    supported();
    renderInForm("120");
    expect(card()).not.toBeNull();
  });

  it("going back to None removes the card", async () => {
    supported();
    const { user } = renderInForm("1440");
    expect(card()).not.toBeNull();
    await user.selectOptions(select(), "None");
    expect(card()).toBeNull();
  });

  it("an unsupported browser shows no card for any choice - the same choice that shows it once push is supported", async () => {
    const { user, view } = renderInForm("none");
    await user.selectOptions(select(), "30 minutes before");
    expect(card()).toBeNull();
    view.unmount();
    supported();
    renderInForm("30");
    expect(card()).not.toBeNull();
  });

  it("pressing Allow and then Not now never submits the event form", async () => {
    const b = supported();
    const { user, onSubmit } = renderInForm("30");
    await user.click(allow());
    expect(b.requestPermission).toHaveBeenCalledTimes(1);
    await act(async () => {
      b.answer("default");
    });
    await user.click(notNow());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("granted: the card removes itself and focus returns to the Reminder select", async () => {
    const b = supported();
    const { user } = renderInForm("30");
    await user.click(allow());
    await act(async () => {
      b.answer("granted");
    });
    expect(card()).toBeNull();
    expect(select()).toHaveFocus();
  });
});

describe("CAL-027 a denied answer under the field (AC-3, Block 4)", () => {
  let browser: PushBrowser | null = null;

  afterEach(() => {
    browser?.restore();
    browser = null;
    vi.unstubAllEnvs();
    sessionStorage.clear();
  });

  it("shows the blocked notice under the field, and the select stays enabled and editable", async () => {
    browser = installPushBrowser({ permission: "default", ready: "pending" });
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", VAPID_KEY);
    const b = browser;
    const { user, onChange } = renderField({ choice: "30" });
    await user.click(
      screen.getByRole("button", { name: "Allow notifications" }),
    );
    await act(async () => {
      b.answer("denied");
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Notifications are blocked for this site. Turn them on in your browser's site settings to get reminders here.",
    );
    expect(select()).toBeEnabled();
    await user.selectOptions(select(), "1 hour before");
    expect(onChange).toHaveBeenLastCalledWith("60");
    expect(select()).toHaveValue("60");
  });
});

describe('CAL-027 "Not now" under the field (AC-6, Block 4)', () => {
  let browser: PushBrowser | null = null;

  afterEach(() => {
    browser?.restore();
    browser = null;
    vi.unstubAllEnvs();
    sessionStorage.clear();
  });

  it("requests nothing, hides the card, returns focus to the select, and keeps it hidden for the rest of the session - a new choice, and a newly opened form, included", async () => {
    sessionStorage.clear();
    browser = installPushBrowser({ permission: "default", ready: "pending" });
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", VAPID_KEY);
    const region = () =>
      screen.queryByRole("region", { name: "Get reminders on this device" });
    const first = renderField({ choice: "30" });
    expect(region()).not.toBeNull();
    await first.user.click(screen.getByRole("button", { name: "Not now" }));
    expect(browser.requestPermission).not.toHaveBeenCalled();
    expect(region()).toBeNull();
    expect(select()).toHaveFocus();
    await first.user.selectOptions(select(), "None");
    await first.user.selectOptions(select(), "1 day before");
    expect(region()).toBeNull();
    cleanup();
    renderField({ choice: "120" });
    expect(region()).toBeNull();
  });
});
