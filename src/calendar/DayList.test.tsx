import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Event, Kind } from "../data/rows";
import type { KindsSnapshot } from "../sync/kindsStore";
import { installMatchMedia } from "../test/media";
import { DayList } from "./DayList";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-011 AC-7, Contract Block 8 (layout.md "Phone specifics", voice.md
// "Empty day list"). The unit alone over a hand-built KindsSnapshot.
// MECHANICAL: the section's name "Events on {EEE d MMM}", one <li> per event
// of eventsOnDay (occupancy + cell order, as the month cell), each holding the
// chip button; or "No events on {EEE d MMM}" and an "Add" button. The 56px
// row height is CSS, which jsdom does not compute: the <li> count and the chip
// names are what is pinned here.

const STAMP = "2026-10-16T08:00:00.000001+00:00";

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
const GARDENING = kind(3, "Gardening", { deletedAt: STAMP });

function snapshot(live: Kind[], others: Kind[] = []): KindsSnapshot {
  const index = new Map([...live, ...others].map((k) => [k.id, k]));
  return { status: "ready", kinds: live, byId: (id) => index.get(id) };
}

const KINDS = snapshot([GYM, MOVIES], [GARDENING]);

let serial = 0;

function event(
  title: string,
  k: Kind,
  startsAt: Date,
  endsAt: Date,
  allDay = false,
): Event {
  serial += 1;
  return {
    id: `10000000-0000-4000-8000-${String(serial).padStart(12, "0")}`,
    title,
    kindId: k.id,
    startsAt,
    endsAt,
    allDay,
    location: null,
    notes: null,
    recurrence: null,
    origin: "manual",
    captureJobId: null,
    deletedAt: null,
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

/** Local time on a day of October 2026. */
const oct = (date: number, hour = 0, minute = 0) =>
  new Date(2026, 9, date, hour, minute);

const THU_15 = oct(15);

let media: ReturnType<typeof installMatchMedia> | null = null;

afterEach(() => {
  media?.restore();
  media = null;
});

function renderList(date: Date, events: Event[], onAdd?: () => void) {
  media = installMatchMedia({ width: 375, colorScheme: "light" });
  const user = userEvent.setup();
  render(
    <DayList
      date={date}
      events={events}
      kinds={KINDS}
      {...(onAdd === undefined ? {} : { onAdd })}
    />,
  );
  return { user };
}

describe("a day with events (AC-7, Block 8)", () => {
  const EVENTS = [
    event("Film", MOVIES, oct(15, 20, 0), oct(15, 22, 0)),
    event("Swim", GYM, oct(15, 7, 0), oct(15, 8, 0)),
    event("Trip", GYM, oct(14), oct(17), true),
    event("Yesterday", GYM, oct(14, 9, 0), oct(14, 10, 0)),
    event("Tomorrow", GYM, oct(16, 0, 0), oct(16, 1, 0)),
    event("Weeding", GARDENING, oct(15, 12, 0), oct(15, 13, 0)),
  ];

  it('is a section named "Events on Thu 15 Oct"', () => {
    renderList(THU_15, EVENTS);
    expect(
      screen.getByRole("region", { name: "Events on Thu 15 Oct" }),
    ).toBeInTheDocument();
  });

  it("lists that day's events only, one <li> each, in cell order: all-day first, then by start", () => {
    renderList(THU_15, EVENTS);
    const region = screen.getByRole("region", { name: "Events on Thu 15 Oct" });
    const list = within(region).getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(
      items.map((li) =>
        within(li)
          .getAllByRole("button")
          .map((b) => b.getAttribute("aria-label")),
      ),
    ).toStrictEqual([
      ["Trip, Gym, all day"],
      ["Swim, Gym, 07:00 to 08:00"],
      ["Weeding, 12:00 to 13:00, kind removed"],
      ["Film, Movies, 20:00 to 22:00"],
    ]);
  });

  it("the chips are reachable: no chip carries a tabindex", () => {
    renderList(THU_15, EVENTS);
    const buttons = within(screen.getByRole("list")).getAllByRole("button");
    expect(buttons).toHaveLength(4);
    for (const b of buttons) expect(b).not.toHaveAttribute("tabindex");
  });

  it("shows no empty line and no Add button", () => {
    renderList(THU_15, EVENTS, vi.fn());
    expect(screen.queryByText(/^No events on /)).toBeNull();
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
  });

  it("an event ending exactly at midnight is not listed on the next day", () => {
    renderList(oct(16), [event("Late", GYM, oct(15, 22, 0), oct(16, 0, 0))]);
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByText("No events on Fri 16 Oct")).toBeInTheDocument();
  });
});

describe("a day without events (AC-7, Block 8, voice.md)", () => {
  it('reads "No events on Thu 15 Oct" in a paragraph, with an "Add" button and no list', () => {
    renderList(THU_15, [], vi.fn());
    const region = screen.getByRole("region", { name: "Events on Thu 15 Oct" });
    const line = within(region).getByText("No events on Thu 15 Oct");
    expect(line.tagName).toBe("P");
    const add = within(region).getByRole("button", { name: "Add" });
    expect(add).toHaveAttribute("type", "button");
    expect(within(region).queryByRole("list")).toBeNull();
  });

  it("events on other days only still read as an empty day", () => {
    renderList(THU_15, [event("Swim", GYM, oct(14, 7, 0), oct(14, 8, 0))]);
    expect(screen.getByText("No events on Thu 15 Oct")).toBeInTheDocument();
  });

  it("Add calls onAdd once", async () => {
    const onAdd = vi.fn();
    const { user } = renderList(THU_15, [], onAdd);
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("Add with no onAdd is still shown, and pressing it does nothing and does not throw", async () => {
    const { user } = renderList(THU_15, []);
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText("No events on Thu 15 Oct")).toBeInTheDocument();
  });

  it.each([
    ["Mon 2 Nov", new Date(2026, 10, 2)],
    ["Wed 14 Oct", new Date(2026, 9, 14)],
    ["Fri 1 Jan", new Date(2027, 0, 1)],
  ])("names the day by its EEE d MMM: %j", (label, date) => {
    renderList(date, []);
    expect(
      screen.getByRole("region", { name: `Events on ${label}` }),
    ).toBeInTheDocument();
    expect(screen.getByText(`No events on ${label}`)).toBeInTheDocument();
  });
});
