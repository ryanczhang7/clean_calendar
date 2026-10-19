import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type JSX, useState } from "react";
import { MemoryRouter } from "react-router";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import type { Result } from "../data/result";
import type { Event, Kind } from "../data/rows";
import type { EventActions } from "../sync/eventActions";
import type { KindsSnapshot } from "../sync/kindsStore";
import { EventSheet, type SheetRequest } from "./EventSheet";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-012 Contract, Block 5 (AC-1 to AC-7 at the sheet). The sheet alone
// over a hand-built KindsSnapshot and vi.fn actions resolving
// { status: "ok", row }. A host keeps the request in state: an "Open" button
// sets it with itself as the opener (so the click focuses the opener, as a
// cell or a chip would be), and onClose clears it - the parent's half of the
// contract. MECHANICAL: names, roles and copy are pinned exactly (voice.md,
// accessibility.md "Roles and names"). Every instant uses the local-time
// constructor; "today" is Wed 14 Oct 2026 and nothing here reads the clock.
// Native date and time inputs are set with fireEvent.change (one change event
// with the final value - measured in RED; see EventForm.test.tsx).

const STAMP = "2026-10-16T08:00:00.000001+00:00";
const UPDATED_AT = "2026-10-16T09:15:02.123456+00:00";

function kind(n: number, name: string, extra: Partial<Kind> = {}): Kind {
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
    ...extra,
  };
}

const GYM = kind(1, "Gym");
const MOVIES = kind(2, "Movies");
const TRAVEL = kind(3, "Travel");
const GARDENING = kind(4, "Gardening", { deletedAt: STAMP });
const UNKNOWN_KIND = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function snapshot(live: Kind[], others: Kind[] = []): KindsSnapshot {
  const index = new Map([...live, ...others].map((k) => [k.id, k]));
  return { status: "ready", kinds: live, byId: (id) => index.get(id) };
}

const KINDS = snapshot([GYM, MOVIES, TRAVEL], [GARDENING]);

/** Local time on a day of October 2026. */
const oct = (date: number, hour = 0, minute = 0) =>
  new Date(2026, 9, date, hour, minute);

function event(extra: Partial<Event> = {}): Event {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    title: "Dentist",
    kindId: GYM.id,
    startsAt: oct(14, 9, 0),
    endsAt: oct(14, 10, 30),
    allDay: false,
    location: "Clinic",
    notes: "Bring the card",
    recurrence: null,
    origin: "manual",
    captureJobId: null,
    deletedAt: null,
    createdAt: STAMP,
    updatedAt: UPDATED_AT,
    ...extra,
  };
}

const DENTIST = event();
const TRIP = event({
  id: "10000000-0000-4000-8000-000000000002",
  title: "Trip",
  allDay: true,
  startsAt: oct(12),
  endsAt: oct(15),
  location: null,
  notes: null,
});

type FakeActions = {
  createEvent: Mock<EventActions["createEvent"]>;
  updateEvent: Mock<EventActions["updateEvent"]>;
};

function fakeActions(): FakeActions {
  return {
    createEvent: vi.fn<EventActions["createEvent"]>(async (input) => ({
      status: "ok",
      row: {
        ...input,
        id: "10000000-0000-4000-8000-000000000099",
        deletedAt: null,
        createdAt: STAMP,
        updatedAt: STAMP,
      },
    })),
    updateEvent: vi.fn<EventActions["updateEvent"]>(async (id, patch) => ({
      status: "ok",
      row: { ...DENTIST, id, ...patch },
    })),
  };
}

type Make = (opener: HTMLElement) => SheetRequest;

const createAllDay =
  (day: Date): Make =>
  (opener) => ({
    mode: "create",
    start: day,
    end: new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1),
    allDay: true,
    opener,
  });

const createTimed =
  (start: Date, end: Date): Make =>
  (opener) => ({ mode: "create", start, end, allDay: false, opener });

const edit =
  (e: Event): Make =>
  (opener) => ({ mode: "edit", event: e, opener });

function Host(props: {
  make: Make;
  kinds: KindsSnapshot;
  actions: FakeActions;
  onClose: () => void;
}): JSX.Element {
  const [request, setRequest] = useState<SheetRequest | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={(e) => setRequest(props.make(e.currentTarget))}
      >
        Open
      </button>
      <EventSheet
        request={request}
        kinds={props.kinds}
        actions={props.actions}
        onClose={() => {
          props.onClose();
          setRequest(null);
        }}
      />
    </>
  );
}

async function openSheet(
  make: Make,
  options: { kinds?: KindsSnapshot; actions?: FakeActions } = {},
) {
  const user = userEvent.setup();
  const actions = options.actions ?? fakeActions();
  const onClose = vi.fn<() => void>();
  render(
    <MemoryRouter>
      <Host
        make={make}
        kinds={options.kinds ?? KINDS}
        actions={actions}
        onClose={onClose}
      />
    </MemoryRouter>,
  );
  const opener = screen.getByRole("button", { name: "Open" });
  await user.click(opener);
  return { user, actions, onClose, opener };
}

const sheet = (name: string | RegExp = /event/) =>
  screen.getByRole("dialog", { name });
const title = () => screen.getByRole("textbox", { name: "Title" });
const field = (label: string) => screen.getByLabelText(label) as HTMLElement;
const save = () => screen.getByRole("button", { name: "Save" });
const closeButton = () => screen.getByRole("button", { name: "Close" });
const cancel = () => screen.getByRole("button", { name: "Cancel" });
const allDaySwitch = () => screen.getByRole("switch", { name: "All day" });
const setField = (label: string, value: string) =>
  fireEvent.change(field(label), { target: { value } });

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("no request, no sheet (Block 5)", () => {
  it("renders nothing while the request is null", () => {
    render(
      <MemoryRouter>
        <EventSheet
          request={null}
          kinds={KINDS}
          actions={fakeActions()}
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector("[data-sheet]")).toBeNull();
  });
});

describe("a new event (AC-1, Block 5)", () => {
  it('opens as role="dialog" named "New event": a div, aria-modal="false", data-sheet, labelled by its <h2>', async () => {
    await openSheet(createAllDay(oct(15)));
    const dialog = sheet("New event");
    expect(dialog.tagName).toBe("DIV");
    expect(dialog).toHaveAttribute("aria-modal", "false");
    expect(dialog).toHaveAttribute("data-sheet");
    const heading = within(dialog).getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("New event");
    expect(dialog).toHaveAttribute("aria-labelledby", heading.id);
  });

  it("focuses the Title input", async () => {
    await openSheet(createAllDay(oct(15)));
    await waitFor(() => expect(title()).toHaveFocus());
    expect(title()).toHaveValue("");
  });

  it("from a month cell: all day on that day - Start date = End date = 2026-10-15, no time inputs", async () => {
    await openSheet(createAllDay(oct(15)));
    expect(allDaySwitch()).toHaveAttribute("aria-checked", "true");
    expect(field("Start date")).toHaveValue("2026-10-15");
    expect(field("End date")).toHaveValue("2026-10-15");
    expect(screen.queryByLabelText("Start time")).toBeNull();
    expect(screen.queryByLabelText("End time")).toBeNull();
  });

  it("from a slot: a 1-hour timed event, 15 Oct 14:00 - 15:00", async () => {
    await openSheet(createTimed(oct(15, 14), oct(15, 15)));
    expect(allDaySwitch()).toHaveAttribute("aria-checked", "false");
    expect(field("Start date")).toHaveValue("2026-10-15");
    expect(field("Start time")).toHaveValue("14:00");
    expect(field("End date")).toHaveValue("2026-10-15");
    expect(field("End time")).toHaveValue("15:00");
  });

  it("the header: Close before the heading, no capture line, no Delete (PO decision 1)", async () => {
    await openSheet(createAllDay(oct(15)));
    const dialog = sheet("New event");
    const close = within(dialog).getByRole("button", { name: "Close" });
    expect(close).toHaveAttribute("type", "button");
    const heading = within(dialog).getByRole("heading", { level: 2 });
    expect(
      close.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(dialog).queryByText(/^Captured from text/)).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /Delete/ })).toBeNull();
  });

  it("Save is a submit button of a <form> in the sheet, enabled with an empty title (PO decision 5); Cancel a plain button", async () => {
    await openSheet(createAllDay(oct(15)));
    expect(title()).toHaveValue("");
    expect(save()).toHaveAttribute("type", "submit");
    expect(save()).toBeEnabled();
    expect(save().closest("form")).not.toBeNull();
    expect(save().closest("form")?.contains(title())).toBe(true);
    expect(cancel()).toHaveAttribute("type", "button");
  });
});

describe("the kind a new event starts with (AC-4, Block 5)", () => {
  it("the last kind used on this device, when live", async () => {
    localStorage.setItem("cc.lastKind", MOVIES.id);
    await openSheet(createAllDay(oct(15)));
    expect(
      screen.getByRole("button", { name: "Kind, Movies" }),
    ).toBeInTheDocument();
  });

  it("with no last kind, the first live kind", async () => {
    await openSheet(createAllDay(oct(15)));
    expect(
      screen.getByRole("button", { name: "Kind, Gym" }),
    ).toBeInTheDocument();
  });

  it("with a last kind since deleted, the first live kind", async () => {
    localStorage.setItem("cc.lastKind", GARDENING.id);
    await openSheet(createAllDay(oct(15)));
    expect(
      screen.getByRole("button", { name: "Kind, Gym" }),
    ).toBeInTheDocument();
  });
});

describe("saving refuses an incomplete form (AC-2, Block 5)", () => {
  it('Save with an empty title: "Give the event a title." on Title, aria-invalid, focus on Title, nothing saved', async () => {
    const { user, actions, onClose } = await openSheet(createAllDay(oct(15)));
    await user.click(save());
    const message = screen.getByText("Give the event a title.");
    expect(title()).toHaveAttribute("aria-invalid", "true");
    expect(title()).toHaveAttribute("aria-describedby", message.id);
    await waitFor(() => expect(title()).toHaveFocus());
    expect(actions.createEvent).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet("New event")).toBeInTheDocument();
  });

  it("a title of spaces only is refused the same way", async () => {
    const { user, actions } = await openSheet(createAllDay(oct(15)));
    await user.type(title(), "   ");
    await user.click(save());
    expect(screen.getByText("Give the event a title.")).toBeInTheDocument();
    expect(actions.createEvent).not.toHaveBeenCalled();
  });

  it('timed, End equal to Start: "End must be after start." on End, aria-invalid, focus on End date, nothing saved', async () => {
    const { user, actions } = await openSheet(
      createTimed(oct(15, 14), oct(15, 15)),
    );
    await user.type(title(), "Swim");
    setField("End time", "14:00");
    await user.click(save());
    expect(screen.getByText("End must be after start.")).toBeInTheDocument();
    expect(field("End date")).toHaveAttribute("aria-invalid", "true");
    expect(field("End date")).toHaveAccessibleDescription(
      "End must be after start.",
    );
    await waitFor(() => expect(field("End date")).toHaveFocus());
    expect(title()).not.toHaveAttribute("aria-invalid");
    expect(actions.createEvent).not.toHaveBeenCalled();
  });

  it("all-day, End date before Start date: the end error, nothing saved", async () => {
    const { user, actions } = await openSheet(createAllDay(oct(15)));
    await user.type(title(), "Trip");
    setField("End date", "2026-10-14");
    await user.click(save());
    expect(screen.getByText("End must be after start.")).toBeInTheDocument();
    await waitFor(() => expect(field("End date")).toHaveFocus());
    expect(actions.createEvent).not.toHaveBeenCalled();
  });

  it("both at once: both messages, and focus goes to Title", async () => {
    const { user, actions } = await openSheet(
      createTimed(oct(15, 14), oct(15, 15)),
    );
    setField("End time", "13:00");
    await user.click(save());
    expect(screen.getByText("Give the event a title.")).toBeInTheDocument();
    expect(screen.getByText("End must be after start.")).toBeInTheDocument();
    await waitFor(() => expect(title()).toHaveFocus());
    expect(actions.createEvent).not.toHaveBeenCalled();
  });

  it("an edit with its title cleared is refused too: updateEvent not called", async () => {
    const { user, actions } = await openSheet(edit(DENTIST));
    await user.clear(title());
    await user.click(save());
    expect(screen.getByText("Give the event a title.")).toBeInTheDocument();
    expect(actions.updateEvent).not.toHaveBeenCalled();
  });
});

describe("the dates through the sheet (AC-3, Block 5)", () => {
  it("Start time 14:00 -> 16:30 on a 14:00 - 15:00 slot event: End time 17:30", async () => {
    await openSheet(createTimed(oct(15, 14), oct(15, 15)));
    setField("Start time", "16:30");
    expect(field("End time")).toHaveValue("17:30");
    expect(field("End date")).toHaveValue("2026-10-15");
  });

  it("All day on hides the time inputs and keeps the dates", async () => {
    const { user } = await openSheet(createTimed(oct(15, 14), oct(15, 15)));
    await user.click(allDaySwitch());
    expect(screen.queryByLabelText("Start time")).toBeNull();
    expect(screen.queryByLabelText("End time")).toBeNull();
    expect(field("Start date")).toHaveValue("2026-10-15");
    expect(field("End date")).toHaveValue("2026-10-15");
  });

  it("an all-day 12 - 15 Oct (exclusive) event shows End date 2026-10-14", async () => {
    await openSheet(edit(TRIP));
    expect(field("Start date")).toHaveValue("2026-10-12");
    expect(field("End date")).toHaveValue("2026-10-14");
  });

  it("an all-day event made 12 - 14 Oct in the form is saved [12 Oct 00:00, 15 Oct 00:00)", async () => {
    const { user, actions } = await openSheet(createAllDay(oct(12)));
    await user.type(title(), "Trip");
    setField("End date", "2026-10-14");
    await user.click(save());
    expect(actions.createEvent).toHaveBeenCalledTimes(1);
    const input = actions.createEvent.mock.calls[0]?.[0];
    expect(input?.allDay).toBe(true);
    expect(input?.startsAt).toStrictEqual(oct(12));
    expect(input?.endsAt).toStrictEqual(oct(15));
  });
});

describe("saving a new event (AC-4, Block 5)", () => {
  it("calls createEvent once with every field, origin manual, blank notes null", async () => {
    const { user, actions } = await openSheet(
      createTimed(oct(15, 14), oct(15, 15)),
    );
    await user.type(title(), "Swim");
    await user.type(screen.getByRole("textbox", { name: "Location" }), "Pool");
    await user.click(save());
    expect(actions.createEvent).toHaveBeenCalledTimes(1);
    expect(actions.createEvent.mock.calls[0]?.[0]).toStrictEqual({
      title: "Swim",
      kindId: GYM.id,
      startsAt: oct(15, 14),
      endsAt: oct(15, 15),
      allDay: false,
      location: "Pool",
      notes: null,
      origin: "manual",
      recurrence: null,
      captureJobId: null,
    });
    expect(actions.updateEvent).not.toHaveBeenCalled();
  });

  it("an all-day new event: location and notes both blank -> null", async () => {
    const { user, actions } = await openSheet(createAllDay(oct(15)));
    await user.type(title(), "Hotel");
    await user.click(save());
    expect(actions.createEvent.mock.calls[0]?.[0]).toStrictEqual({
      title: "Hotel",
      kindId: GYM.id,
      startsAt: oct(15),
      endsAt: oct(16),
      allDay: true,
      location: null,
      notes: null,
      origin: "manual",
      recurrence: null,
      captureJobId: null,
    });
  });

  it('closes the sheet, and remembers the kind under "cc.lastKind"', async () => {
    const { user, onClose } = await openSheet(createAllDay(oct(15)));
    await user.type(title(), "Swim");
    await user.click(screen.getByRole("button", { name: "Kind, Gym" }));
    await user.click(screen.getByRole("option", { name: "Travel" }));
    await user.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem("cc.lastKind")).toBe(TRAVEL.id);
  });

  it("the picked kind is the one sent", async () => {
    const { user, actions } = await openSheet(createAllDay(oct(15)));
    await user.type(title(), "Film");
    await user.click(screen.getByRole("button", { name: "Kind, Gym" }));
    await user.click(screen.getByRole("option", { name: "Movies" }));
    await user.click(save());
    expect(actions.createEvent.mock.calls[0]?.[0]?.kindId).toBe(MOVIES.id);
  });

  it("Enter in Title submits the form", async () => {
    const { user, actions } = await openSheet(createAllDay(oct(15)));
    await user.type(title(), "Swim{Enter}");
    expect(actions.createEvent).toHaveBeenCalledTimes(1);
  });

  it("focus returns to the opener once saved", async () => {
    const { user, opener } = await openSheet(createAllDay(oct(15)));
    await user.type(title(), "Swim");
    await user.click(save());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
  });
});

describe("a write that is refused (Block 5, PO decision 6)", () => {
  const REFUSALS: Array<[string, Result<Event>]> = [
    ["offline", { status: "offline" }],
    ["an error", { status: "error", code: "23503", message: "foreign key" }],
    ["a conflict", { status: "conflict" }],
  ];

  it.each(REFUSALS)(
    'create on %s: the sheet stays open with the alert "Couldn\'t save. Try again."',
    async (_label, result) => {
      const actions = fakeActions();
      actions.createEvent.mockResolvedValue(result);
      const { user, onClose } = await openSheet(createAllDay(oct(15)), {
        actions,
      });
      expect(screen.queryByRole("alert")).toBeNull();
      await user.type(title(), "Swim");
      await user.click(save());
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(/^Couldn't save\. Try again\.$/);
      expect(sheet("New event")).toBeInTheDocument();
      expect(title()).toHaveValue("Swim");
      expect(onClose).not.toHaveBeenCalled();
      expect(localStorage.getItem("cc.lastKind")).toBeNull();
    },
  );

  it("an edit refused offline: the alert, the sheet open, onClose not called", async () => {
    const actions = fakeActions();
    actions.updateEvent.mockResolvedValue({ status: "offline" });
    const { user, onClose } = await openSheet(edit(DENTIST), { actions });
    await user.type(title(), "!");
    await user.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't save. Try again.",
    );
    expect(sheet("Edit event: Dentist")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("an existing event (AC-5, Block 5)", () => {
  it('opens named "Edit event: Dentist", with focus on Close', async () => {
    await openSheet(edit(DENTIST));
    const dialog = sheet("Edit event: Dentist");
    expect(within(dialog).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Edit event: Dentist",
    );
    await waitFor(() => expect(closeButton()).toHaveFocus());
  });

  it("every field is filled from the event", async () => {
    await openSheet(edit(DENTIST));
    expect(title()).toHaveValue("Dentist");
    expect(
      screen.getByRole("button", { name: "Kind, Gym" }),
    ).toBeInTheDocument();
    expect(allDaySwitch()).toHaveAttribute("aria-checked", "false");
    expect(field("Start date")).toHaveValue("2026-10-14");
    expect(field("Start time")).toHaveValue("09:00");
    expect(field("End date")).toHaveValue("2026-10-14");
    expect(field("End time")).toHaveValue("10:30");
    expect(screen.getByRole("textbox", { name: "Location" })).toHaveValue(
      "Clinic",
    );
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue(
      "Bring the card",
    );
  });

  // Deferred verification 1's target at the sheet: with patchOf returning
  // every field, this must fail.
  it("changing only the title calls updateEvent(id, { title }, updatedAt) - exactly that patch", async () => {
    const { user, actions } = await openSheet(edit(DENTIST));
    await user.clear(title());
    await user.type(title(), "Dentist at noon");
    await user.click(save());
    expect(actions.updateEvent).toHaveBeenCalledTimes(1);
    expect(actions.updateEvent.mock.calls[0]).toStrictEqual([
      DENTIST.id,
      { title: "Dentist at noon" },
      UPDATED_AT,
    ]);
    expect(actions.createEvent).not.toHaveBeenCalled();
  });

  it("changing the location and the start sends those, with the end the start dragged", async () => {
    const { user, actions } = await openSheet(edit(DENTIST));
    setField("Start time", "11:00");
    await user.clear(screen.getByRole("textbox", { name: "Location" }));
    await user.click(save());
    expect(actions.updateEvent.mock.calls[0]).toStrictEqual([
      DENTIST.id,
      { startsAt: oct(14, 11, 0), endsAt: oct(14, 12, 30), location: null },
      UPDATED_AT,
    ]);
  });

  it("saving closes the sheet and remembers the event's kind", async () => {
    const { user, onClose } = await openSheet(edit(DENTIST));
    await user.type(title(), "!");
    await user.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem("cc.lastKind")).toBe(GYM.id);
  });

  it("Save with no change closes the sheet without a request", async () => {
    const { user, actions, onClose } = await openSheet(edit(DENTIST));
    await user.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(actions.updateEvent).not.toHaveBeenCalled();
    expect(actions.createEvent).not.toHaveBeenCalled();
  });

  it('a captured event shows "Captured from text, 12 Oct" (its createdAt) in the header, and is as editable', async () => {
    const captured = event({
      title: "Flight to Tokyo",
      origin: "capture",
      captureJobId: "c0ffee00-1234-4567-89ab-cdef01234567",
      createdAt: "2026-10-12T12:00:00.000001+00:00",
    });
    const { user, actions } = await openSheet(edit(captured));
    const dialog = sheet("Edit event: Flight to Tokyo");
    expect(
      within(dialog).getByText("Captured from text, 12 Oct"),
    ).toBeInTheDocument();
    await user.clear(title());
    await user.type(title(), "Flight to Osaka");
    await user.click(save());
    expect(actions.updateEvent.mock.calls[0]?.[1]).toStrictEqual({
      title: "Flight to Osaka",
    });
  });

  it("a manual event shows no capture line", async () => {
    await openSheet(edit(DENTIST));
    expect(screen.queryByText(/^Captured from text/)).toBeNull();
  });
});

describe("closing (AC-6, Block 5, voice.md Discard changes)", () => {
  it.each([
    ["Close", () => closeButton()],
    ["Cancel", () => cancel()],
  ])(
    "clean, %s closes at once: no Discard dialog, onClose once",
    async (_name, button) => {
      const { user, onClose } = await openSheet(edit(DENTIST));
      await user.click(button());
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );

  it("clean, Escape inside the sheet closes at once", async () => {
    const { user, onClose } = await openSheet(edit(DENTIST));
    await waitFor(() => expect(closeButton()).toHaveFocus());
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a title changed and changed back is clean: Close closes at once", async () => {
    const { user, onClose } = await openSheet(edit(DENTIST));
    await user.type(title(), "x");
    await user.type(title(), "{Backspace}");
    await user.click(closeButton());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("dialog", { name: "Discard changes?" }),
    ).toBeNull();
  });

  it.each([
    [
      "Close",
      (u: ReturnType<typeof userEvent.setup>) => u.click(closeButton()),
    ],
    ["Cancel", (u: ReturnType<typeof userEvent.setup>) => u.click(cancel())],
    [
      "Escape",
      async (u: ReturnType<typeof userEvent.setup>) => {
        title().focus();
        await u.keyboard("{Escape}");
      },
    ],
  ])(
    'dirty, %s asks "Discard changes?" - "You\'ve edited this event." - Keep editing / Discard',
    async (_name, press) => {
      const { user, onClose } = await openSheet(edit(DENTIST));
      await user.type(title(), "!");
      await press(user);
      const confirm = await screen.findByRole("dialog", {
        name: "Discard changes?",
      });
      expect(
        within(confirm).getByText("You've edited this event."),
      ).toBeInTheDocument();
      expect(
        within(confirm).getByRole("button", { name: "Keep editing" }),
      ).toBeInTheDocument();
      expect(
        within(confirm).getByRole("button", { name: "Discard" }),
      ).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    },
  );

  it("Keep editing closes the question only: the sheet and the edit stay", async () => {
    const { user, onClose } = await openSheet(edit(DENTIST));
    await user.type(title(), "!");
    await user.click(closeButton());
    const confirm = await screen.findByRole("dialog", {
      name: "Discard changes?",
    });
    await user.click(
      within(confirm).getByRole("button", { name: "Keep editing" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Discard changes?" }),
    ).toBeNull();
    expect(sheet("Edit event: Dentist")).toBeInTheDocument();
    expect(title()).toHaveValue("Dentist!");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Discard closes the sheet: onClose once, nothing saved", async () => {
    const { user, onClose, actions } = await openSheet(createAllDay(oct(15)));
    await user.type(title(), "Swim");
    await user.click(cancel());
    const confirm = await screen.findByRole("dialog", {
      name: "Discard changes?",
    });
    await user.click(within(confirm).getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "New event" })).toBeNull();
    expect(actions.createEvent).not.toHaveBeenCalled();
  });

  it("focus returns to the opener after a clean close", async () => {
    const { user, opener } = await openSheet(edit(DENTIST));
    await waitFor(() => expect(closeButton()).toHaveFocus());
    await user.click(closeButton());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("focus returns to the opener after Discard", async () => {
    const { user, opener } = await openSheet(createAllDay(oct(15)));
    await user.type(title(), "Swim");
    await user.click(closeButton());
    const confirm = await screen.findByRole("dialog", {
      name: "Discard changes?",
    });
    await user.click(within(confirm).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("an opener no longer in the document is not focused, and closing does not throw", async () => {
    const detached = document.createElement("button");
    const { user, onClose } = await openSheet((_opener) => ({
      mode: "edit",
      event: DENTIST,
      opener: detached,
    }));
    await user.click(closeButton());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the heading keeps the saved title while the Title field is edited", async () => {
    const { user } = await openSheet(edit(DENTIST));
    await user.type(title(), " at noon");
    expect(sheet("Edit event: Dentist")).toBeInTheDocument();
  });
});

describe("an event whose kind is gone (AC-7, Block 5)", () => {
  const WEEDING = event({
    id: "10000000-0000-4000-8000-000000000003",
    title: "Weeding",
    kindId: GARDENING.id,
  });

  it('a soft-deleted kind: the kind field reads "Kind, Kind removed"', async () => {
    await openSheet(edit(WEEDING));
    expect(
      screen.getByRole("button", { name: "Kind, Kind removed" }),
    ).toBeInTheDocument();
  });

  it("a kind id the store does not know reads the same", async () => {
    await openSheet(edit(event({ kindId: UNKNOWN_KIND })));
    expect(
      screen.getByRole("button", { name: "Kind, Kind removed" }),
    ).toBeInTheDocument();
  });

  it("the removed kind is not offered in the list", async () => {
    const { user } = await openSheet(edit(WEEDING));
    await user.click(
      screen.getByRole("button", { name: "Kind, Kind removed" }),
    );
    expect(screen.queryByRole("option", { name: "Gardening" })).toBeNull();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("saving a title change sends a patch without kindId", async () => {
    const { user, actions } = await openSheet(edit(WEEDING));
    await user.type(title(), " beds");
    await user.click(save());
    expect(actions.updateEvent).toHaveBeenCalledTimes(1);
    expect(actions.updateEvent.mock.calls[0]).toStrictEqual([
      WEEDING.id,
      { title: "Weeding beds" },
      UPDATED_AT,
    ]);
    expect(localStorage.getItem("cc.lastKind")).not.toBe(GARDENING.id);
  });

  it("picking a live kind sends kindId", async () => {
    const { user, actions } = await openSheet(edit(WEEDING));
    await user.click(
      screen.getByRole("button", { name: "Kind, Kind removed" }),
    );
    await user.click(screen.getByRole("option", { name: "Gym" }));
    await user.click(save());
    expect(actions.updateEvent.mock.calls[0]).toStrictEqual([
      WEEDING.id,
      { kindId: GYM.id },
      UPDATED_AT,
    ]);
  });
});
