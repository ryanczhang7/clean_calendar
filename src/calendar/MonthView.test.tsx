import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSX } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Event, Kind } from "../data/rows";
import type { KindsSnapshot } from "../sync/kindsStore";
import { installMatchMedia } from "../test/media";
import { EmptyMonth } from "./EmptyMonth";
import { CHIPS_PER_CELL, DOTS_PER_CELL, MonthView } from "./MonthView";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-009 AC-2, AC-4, AC-5, AC-6, AC-7 and AC-8 (on chips), Contract Blocks
// 6 and 7. MECHANICAL: roles and names are accessibility.md's ("Roles and
// names"), the copy is voice.md's ("Empty month"), the numbers 4 / 3 / 4
// dots are Block 6's. Queried by role and name; jsdom applies no media
// query, so the breakpoint and the scheme come from the installMatchMedia
// stub (PO decision 6) and colours are asserted as inline styles. A
// KindsSnapshot is built by hand (Block 9) - no store. Every instant is
// built with the local-time constructor; a day is [D 00:00, D+1 00:00).

const STAMP = "2026-10-16T08:00:00.000001+00:00";

function kind(
  n: number,
  name: string,
  colorLight: string,
  colorDark: string,
  extra: Partial<Kind> = {},
): Kind {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name,
    colorLight,
    colorDark,
    sortOrder: n,
    isDefault: true,
    deletedAt: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...extra,
  };
}

const GYM = kind(1, "Gym", "#2E7D32", "#9BD69B");
const GOLF = kind(2, "Golf", "#0B6E80", "#7AD4E4");
const MOVIES = kind(3, "Movies", "#7E3FB8", "#CFA8F0");
const TRAVEL = kind(4, "Travel", "#BD8200", "#F5CC6A");
const GARDENING = kind(5, "Gardening", "#5147C9", "#B3AEF7", {
  deletedAt: STAMP,
});
const UNKNOWN_KIND = "ffffffff-ffff-4fff-8fff-ffffffffffff";

/** A hand-built ready snapshot: `live` listed, `others` found by id only. */
function snapshot(live: Kind[], others: Kind[] = []): KindsSnapshot {
  const index = new Map([...live, ...others].map((k) => [k.id, k]));
  return { status: "ready", kinds: live, byId: (id) => index.get(id) };
}

const KINDS = snapshot([GYM, MOVIES, TRAVEL], [GARDENING]);

let serial = 0;

/** A timed event; `start`/`end` are local [month 1..12, date, hour, minute]. */
function timed(
  title: string,
  k: Kind | string,
  start: [number, number, number, number],
  end: [number, number, number, number],
): Event {
  return event(
    title,
    k,
    new Date(2026, start[0] - 1, start[1], start[2], start[3]),
    new Date(2026, end[0] - 1, end[1], end[2], end[3]),
    false,
  );
}

/** An all-day event from local midnight of `first` to local midnight of `endExclusive`. */
function allDay(
  title: string,
  k: Kind | string,
  first: [number, number],
  endExclusive: [number, number],
): Event {
  return event(
    title,
    k,
    new Date(2026, first[0] - 1, first[1]),
    new Date(2026, endExclusive[0] - 1, endExclusive[1]),
    true,
  );
}

function event(
  title: string,
  k: Kind | string,
  startsAt: Date,
  endsAt: Date,
  isAllDay: boolean,
): Event {
  serial += 1;
  return {
    id: `10000000-0000-4000-8000-${String(serial).padStart(12, "0")}`,
    title,
    kindId: typeof k === "string" ? k : k.id,
    startsAt,
    endsAt,
    allDay: isAllDay,
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

/** Wed 14 Oct 2026, mid-afternoon: today is a date, not an instant. */
const TODAY = new Date(2026, 9, 14, 15, 30);

let media: ReturnType<typeof installMatchMedia> | null = null;

afterEach(() => {
  media?.restore();
  media = null;
});

function Where(): JSX.Element {
  const { pathname } = useLocation();
  return <p>at {pathname}</p>;
}

function renderMonth(
  options: {
    events?: Event[];
    kinds?: KindsSnapshot;
    today?: Date;
    loading?: boolean;
    width?: number;
    colorScheme?: "light" | "dark";
    year?: number;
    month?: number;
  } = {},
) {
  media = installMatchMedia({
    width: options.width ?? 1280,
    colorScheme: options.colorScheme ?? "light",
  });
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/month/2026-10"]}>
      <MonthView
        year={options.year ?? 2026}
        month={options.month ?? 10}
        events={options.events ?? []}
        kinds={options.kinds ?? KINDS}
        today={options.today ?? TODAY}
        loading={options.loading ?? false}
      />
      <Where />
    </MemoryRouter>,
  );
  return { user, media };
}

const grid = () => screen.getByRole("grid", { name: "October 2026" });
const cells = () => within(grid()).getAllByRole("gridcell");

/** The one cell whose name starts with `day` (e.g. "Wednesday 14 October"). */
function cell(day: string): HTMLElement {
  return within(grid()).getByRole("gridcell", {
    name: new RegExp(`^${day}, `),
  });
}

const MORE = /^\d+ more events? on /;

/** The chip buttons of a cell, in DOM order (the "+N more" button excluded). */
function chips(c: HTMLElement): HTMLElement[] {
  return within(c)
    .queryAllByRole("button")
    .filter((b) => !MORE.test(b.getAttribute("aria-label") ?? ""));
}

const chipNames = (c: HTMLElement) =>
  chips(c).map((b) => b.getAttribute("aria-label"));

/** The phone dots of a cell: <i> elements under aria-hidden. */
function dots(c: HTMLElement): HTMLElement[] {
  const found = [...c.querySelectorAll<HTMLElement>("i")];
  for (const d of found) {
    expect(d.closest('[aria-hidden="true"]')).not.toBeNull();
  }
  return found;
}

const location = () => screen.getByText(/^at \//).textContent;

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// The 42 day names of October 2026's grid, read out of Block 1's settled
// range (Mon 28 Sep .. Sun 8 Nov) - not computed with a date library.
const OCTOBER_DAYS = [
  ...[28, 29, 30].map((d) => `${d} September`),
  ...Array.from({ length: 31 }, (_, i) => `${i + 1} October`),
  ...Array.from({ length: 8 }, (_, i) => `${i + 1} November`),
].map((d, i) => `${WEEKDAYS[i % 7]} ${d}`);

describe("the month grid's structure and names (AC-2, Block 6)", () => {
  it('is one grid named "October 2026", holding a header row and six week rows', () => {
    renderMonth();
    expect(screen.getAllByRole("grid")).toHaveLength(1);
    const rows = within(grid()).getAllByRole("row");
    expect(rows).toHaveLength(7);
    for (const row of rows.slice(1)) {
      expect(within(row).getAllByRole("gridcell")).toHaveLength(7);
    }
  });

  it('has seven column headers named Monday to Sunday, in order, reading "MON" to "SUN"', () => {
    renderMonth();
    const [header] = within(grid()).getAllByRole("row");
    const heads = within(header as HTMLElement).getAllByRole("columnheader");
    expect(heads).toHaveLength(7);
    for (const [i, name] of WEEKDAYS.entries()) {
      expect(heads[i]).toHaveAccessibleName(name);
      expect(heads[i]?.textContent).toBe(name.slice(0, 3).toUpperCase());
    }
    expect(within(grid()).getAllByRole("columnheader")).toHaveLength(7);
  });

  it('has 42 cells from "Monday 28 September" to "Sunday 8 November", each "..., no events" when empty', () => {
    renderMonth();
    const all = cells();
    expect(all).toHaveLength(42);
    expect(all.map((c) => c.getAttribute("aria-label"))).toStrictEqual(
      OCTOBER_DAYS.map((d) => `${d}, no events`),
    );
  });

  it('names a cell with one event "..., 1 event" and one with three "..., 3 events"', () => {
    renderMonth({
      events: [
        timed("Swim", GYM, [10, 14, 7, 0], [10, 14, 8, 0]),
        timed("Lift", GYM, [10, 14, 12, 0], [10, 14, 13, 0]),
        timed("Film", MOVIES, [10, 14, 20, 0], [10, 14, 22, 0]),
        timed("Run", GYM, [10, 15, 7, 0], [10, 15, 8, 0]),
      ],
    });
    expect(cell("Wednesday 14 October")).toHaveAccessibleName(
      "Wednesday 14 October, 3 events",
    );
    expect(cell("Thursday 15 October")).toHaveAccessibleName(
      "Thursday 15 October, 1 event",
    );
    expect(cell("Friday 16 October")).toHaveAccessibleName(
      "Friday 16 October, no events",
    );
  });

  it("shows each day's number, hidden from the accessibility tree", () => {
    renderMonth();
    for (const [day, number] of [
      ["Wednesday 14 October", "14"],
      ["Monday 28 September", "28"],
      ["Sunday 8 November", "8"],
    ]) {
      const n = within(cell(day as string)).getByText(number as string);
      expect(n.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it('marks today\'s cell - and no other - aria-current="date", whatever the time of day', () => {
    renderMonth({ today: TODAY });
    const current = cells().filter((c) => c.hasAttribute("aria-current"));
    expect(current).toHaveLength(1);
    expect(current[0]).toBe(cell("Wednesday 14 October"));
    expect(current[0]).toHaveAttribute("aria-current", "date");
  });

  it("marks a leading day current when today is one", () => {
    renderMonth({ today: new Date(2026, 8, 29, 23, 59) });
    const current = cells().filter((c) => c.hasAttribute("aria-current"));
    expect(current).toHaveLength(1);
    expect(current[0]).toBe(cell("Tuesday 29 September"));
    expect(current[0]).toHaveAttribute("aria-current", "date");
  });

  it("marks no cell current when today is outside the visible grid", () => {
    renderMonth({ today: new Date(2026, 11, 3, 9, 0) });
    expect(cells().filter((c) => c.hasAttribute("aria-current"))).toHaveLength(
      0,
    );
  });

  it('marks the 11 leading and trailing days data-outside="true", and no October day', () => {
    renderMonth();
    const outside = cells().flatMap((c, i) =>
      c.getAttribute("data-outside") === "true" ? [i] : [],
    );
    expect(outside).toStrictEqual([0, 1, 2, 34, 35, 36, 37, 38, 39, 40, 41]);
  });

  it('is aria-busy="true" while the events are loading', () => {
    renderMonth({ loading: true });
    expect(grid()).toHaveAttribute("aria-busy", "true");
  });

  it("is not aria-busy when not loading", () => {
    renderMonth({ loading: false });
    expect(grid()).not.toHaveAttribute("aria-busy", "true");
  });

  it("names the grid after the month it shows", () => {
    renderMonth({ year: 2027, month: 2 });
    expect(
      screen.getByRole("grid", { name: "February 2027" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("grid", { name: "October 2026" })).toBeNull();
  });
});

describe("chips in the grid (AC-3, AC-4, AC-8; Blocks 5 and 6)", () => {
  it("renders a timed event in a live kind as its chip, in its day's cell", () => {
    renderMonth({
      events: [timed("Dentist", GYM, [10, 14, 9, 0], [10, 14, 10, 30])],
    });
    expect(chipNames(cell("Wednesday 14 October"))).toStrictEqual([
      "Dentist, Gym, 09:00 to 10:30",
    ]);
    expect(chips(cell("Tuesday 13 October"))).toHaveLength(0);
  });

  it('renders an event in a soft-deleted kind as a neutral chip: "?", "..., kind removed"', () => {
    renderMonth({
      events: [timed("Weeding", GARDENING, [10, 14, 9, 0], [10, 14, 10, 0])],
    });
    const [chip] = chips(cell("Wednesday 14 October"));
    expect(chip).toHaveAccessibleName("Weeding, 09:00 to 10:00, kind removed");
    expect(chip).toHaveAttribute("data-neutral", "true");
    expect(within(chip as HTMLElement).getByText("?")).toBeInTheDocument();
  });

  it("treats a kind id the snapshot does not know the same as a removed kind", () => {
    renderMonth({
      events: [allDay("Mystery", UNKNOWN_KIND, [10, 14], [10, 15])],
    });
    const [chip] = chips(cell("Wednesday 14 October"));
    expect(chip).toHaveAccessibleName("Mystery, all day, kind removed");
    expect(chip).toHaveAttribute("data-neutral", "true");
    expect(within(chip as HTMLElement).getByText("?")).toBeInTheDocument();
  });

  it('shows "Gy" and "Go" on the chips of two live kinds starting with the same letter (AC-8)', () => {
    renderMonth({
      kinds: snapshot([GYM, GOLF]),
      events: [
        timed("Swim", GYM, [10, 14, 7, 0], [10, 14, 8, 0]),
        timed("Round", GOLF, [10, 14, 9, 0], [10, 14, 12, 0]),
      ],
    });
    const [swim, round] = chips(cell("Wednesday 14 October"));
    expect(swim).toHaveAccessibleName("Swim, Gym, 07:00 to 08:00");
    expect(within(swim as HTMLElement).getByText("Gy")).toBeInTheDocument();
    expect(round).toHaveAccessibleName("Round, Golf, 09:00 to 12:00");
    expect(within(round as HTMLElement).getByText("Go")).toBeInTheDocument();
  });

  it('a soft-deleted "Gardening" does not force a live "Gym" to two letters: G, M and ? (AC-8)', () => {
    renderMonth({
      kinds: snapshot([GYM, MOVIES], [GARDENING]),
      events: [
        timed("Swim", GYM, [10, 14, 7, 0], [10, 14, 8, 0]),
        timed("Film", MOVIES, [10, 14, 9, 0], [10, 14, 11, 0]),
        timed("Weeding", GARDENING, [10, 14, 12, 0], [10, 14, 13, 0]),
      ],
    });
    const [swim, film, weeding] = chips(cell("Wednesday 14 October"));
    expect(within(swim as HTMLElement).getByText("G")).toBeInTheDocument();
    expect(within(swim as HTMLElement).queryByText("Gy")).toBeNull();
    expect(within(film as HTMLElement).getByText("M")).toBeInTheDocument();
    expect(within(weeding as HTMLElement).getByText("?")).toBeInTheDocument();
  });

  it("orders a cell's chips all-day first, then by start time, then by title", () => {
    renderMonth({
      events: [
        timed("Beta", GYM, [10, 14, 9, 0], [10, 14, 10, 0]),
        allDay("Zoo trip", TRAVEL, [10, 14], [10, 15]),
        timed("Alpha", GYM, [10, 14, 9, 0], [10, 14, 9, 30]),
        timed("Yoga", GYM, [10, 14, 8, 0], [10, 14, 9, 0]),
      ],
    });
    expect(chipNames(cell("Wednesday 14 October"))).toStrictEqual([
      "Zoo trip, Travel, all day",
      "Yoga, Gym, 08:00 to 09:00",
      "Alpha, Gym, 09:00 to 09:30",
      "Beta, Gym, 09:00 to 10:00",
    ]);
  });
});

/** Six events on Wednesday 14 October: one all-day, five timed (shuffled). */
function sixOn14th(): Event[] {
  return [
    timed("Ten", GYM, [10, 14, 10, 0], [10, 14, 11, 0]),
    timed("Eight", MOVIES, [10, 14, 8, 0], [10, 14, 9, 0]),
    timed("Twelve", MOVIES, [10, 14, 12, 0], [10, 14, 13, 0]),
    allDay("Conference", TRAVEL, [10, 14], [10, 15]),
    timed("Nine", GYM, [10, 14, 9, 0], [10, 14, 10, 0]),
    timed("Eleven", GYM, [10, 14, 11, 0], [10, 14, 12, 0]),
  ];
}

const SORTED_SIX = [
  "Conference, Travel, all day",
  "Eight, Movies, 08:00 to 09:00",
  "Nine, Gym, 09:00 to 10:00",
  "Ten, Gym, 10:00 to 11:00",
  "Eleven, Gym, 11:00 to 12:00",
  "Twelve, Movies, 12:00 to 13:00",
];

describe("overflow by breakpoint (AC-5, Block 6)", () => {
  it("pins the per-breakpoint numbers: 4 chips on desktop, 3 on tablet, none on phone, 4 dots", () => {
    expect(CHIPS_PER_CELL).toStrictEqual({ desktop: 4, tablet: 3, phone: 0 });
    expect(DOTS_PER_CELL).toBe(4);
  });

  it('at 1280px (desktop), six events show four chips then a "2 more events on Wednesday 14 October" button', () => {
    renderMonth({ width: 1280, events: sixOn14th() });
    const c = cell("Wednesday 14 October");
    expect(c).toHaveAccessibleName("Wednesday 14 October, 6 events");
    expect(chipNames(c)).toStrictEqual(SORTED_SIX.slice(0, 4));
    const buttons = within(c).getAllByRole("button");
    expect(buttons).toHaveLength(5);
    const more = buttons[4] as HTMLElement;
    expect(more).toHaveAccessibleName("2 more events on Wednesday 14 October");
    expect(more).toHaveAttribute("type", "button");
  });

  it('at 768px (tablet), six events show three chips then "3 more events on Wednesday 14 October"', () => {
    renderMonth({ width: 768, events: sixOn14th() });
    const c = cell("Wednesday 14 October");
    expect(c).toHaveAccessibleName("Wednesday 14 October, 6 events");
    expect(chipNames(c)).toStrictEqual(SORTED_SIX.slice(0, 3));
    const buttons = within(c).getAllByRole("button");
    expect(buttons).toHaveLength(4);
    expect(buttons[3]).toHaveAccessibleName(
      "3 more events on Wednesday 14 October",
    );
  });

  it('five events on desktop show four chips and "1 more event on Wednesday 14 October", singular', () => {
    renderMonth({ width: 1280, events: sixOn14th().slice(0, 5) });
    const c = cell("Wednesday 14 October");
    expect(chips(c)).toHaveLength(4);
    expect(
      within(c).getByRole("button", {
        name: "1 more event on Wednesday 14 October",
      }),
    ).toBeInTheDocument();
  });

  it("four events on desktop show four chips and no more-button", () => {
    renderMonth({ width: 1280, events: sixOn14th().slice(0, 4) });
    const c = cell("Wednesday 14 October");
    expect(within(c).getAllByRole("button")).toHaveLength(4);
    expect(within(c).queryByRole("button", { name: MORE })).toBeNull();
  });

  it("three events on tablet show three chips and no more-button", () => {
    renderMonth({ width: 768, events: sixOn14th().slice(0, 3) });
    const c = cell("Wednesday 14 October");
    expect(within(c).getAllByRole("button")).toHaveLength(3);
  });

  it('at 375px (phone), six events show no chip and no button, four dots in kind colours and a "+"', () => {
    renderMonth({ width: 375, events: sixOn14th() });
    const c = cell("Wednesday 14 October");
    expect(c).toHaveAccessibleName("Wednesday 14 October, 6 events");
    expect(c.querySelectorAll("button")).toHaveLength(0);
    const found = dots(c);
    expect(found).toHaveLength(4);
    // The first four in cell order: Conference, Eight, Nine, Ten.
    const colours = [TRAVEL, MOVIES, GYM, GYM].map((k) => k.colorLight);
    for (const [i, d] of found.entries()) {
      expect(d).toHaveStyle({ background: colours[i] });
    }
    expect(within(c).getByText("+")).toBeInTheDocument();
  });

  it('at phone, exactly four events show four dots and no "+"; three show three', () => {
    renderMonth({
      width: 375,
      events: [
        ...sixOn14th().slice(0, 4),
        timed("A", GYM, [10, 15, 8, 0], [10, 15, 9, 0]),
        timed("B", GYM, [10, 15, 9, 0], [10, 15, 10, 0]),
        timed("C", GYM, [10, 15, 10, 0], [10, 15, 11, 0]),
      ],
    });
    const fourteenth = cell("Wednesday 14 October");
    expect(dots(fourteenth)).toHaveLength(4);
    expect(within(fourteenth).queryByText("+")).toBeNull();
    const fifteenth = cell("Thursday 15 October");
    expect(dots(fifteenth)).toHaveLength(3);
    expect(within(fifteenth).queryByText("+")).toBeNull();
    expect(within(grid()).queryAllByRole("button")).toHaveLength(0);
  });

  it("at phone, the dots take the dark colours under the dark scheme, and a removed kind's dot is neutral", () => {
    renderMonth({
      width: 375,
      colorScheme: "dark",
      events: [
        timed("Swim", GYM, [10, 14, 7, 0], [10, 14, 8, 0]),
        timed("Weeding", GARDENING, [10, 14, 9, 0], [10, 14, 10, 0]),
      ],
    });
    const [swim, weeding] = dots(cell("Wednesday 14 October"));
    expect(swim).toHaveStyle({ background: GYM.colorDark });
    expect(weeding).toHaveAttribute("data-neutral", "true");
    expect(weeding?.style.background).toBe("");
    expect(weeding?.style.backgroundColor).toBe("");
  });

  it("follows a breakpoint change: desktop chips become phone dots", () => {
    const { media: stub } = renderMonth({ width: 1280, events: sixOn14th() });
    expect(chips(cell("Wednesday 14 October"))).toHaveLength(4);
    act(() => stub.set({ width: 375 }));
    const c = cell("Wednesday 14 October");
    expect(c.querySelectorAll("button")).toHaveLength(0);
    expect(dots(c)).toHaveLength(4);
  });

  it("the more-button opens that day: /day/2026-10-14", async () => {
    const { user } = renderMonth({ width: 1280, events: sixOn14th() });
    expect(location()).toBe("at /month/2026-10");
    await user.click(
      screen.getByRole("button", {
        name: "2 more events on Wednesday 14 October",
      }),
    );
    expect(location()).toBe("at /day/2026-10-14");
  });

  it("the more-button of a trailing day zero-pads its URL: /day/2026-11-02", async () => {
    const onSecond = sixOn14th().map((e) => ({
      ...e,
      startsAt: new Date(2026, 10, 2, e.startsAt.getHours()),
      endsAt: new Date(2026, 10, e.allDay ? 3 : 2, e.endsAt.getHours()),
    }));
    const { user } = renderMonth({ width: 768, events: onSecond });
    await user.click(
      within(cell("Monday 2 November")).getByRole("button", {
        name: "3 more events on Monday 2 November",
      }),
    );
    expect(location()).toBe("at /day/2026-11-02");
  });
});

describe("which days an event occupies: [D 00:00, D+1 00:00) local (AC-6)", () => {
  it("an all-day stay from 12 October to the 15th (exclusive) shows in the 12th, 13th and 14th only", () => {
    const stay = allDay("Hotel Kyoto", TRAVEL, [10, 12], [10, 15]);
    renderMonth({ events: [stay] });
    const name = "Hotel Kyoto, Travel, all day";
    for (const day of [
      "Monday 12 October",
      "Tuesday 13 October",
      "Wednesday 14 October",
    ]) {
      expect(chipNames(cell(day)), day).toStrictEqual([name]);
      expect(cell(day)).toHaveAccessibleName(`${day}, 1 event`);
    }
    for (const day of ["Sunday 11 October", "Thursday 15 October"]) {
      expect(chips(cell(day)), day).toHaveLength(0);
      expect(cell(day)).toHaveAccessibleName(`${day}, no events`);
    }
    expect(screen.getAllByRole("button", { name })).toHaveLength(3);
  });

  it("a timed event ending exactly at midnight does not spill into the next day", () => {
    renderMonth({
      events: [timed("Late show", MOVIES, [10, 14, 22, 0], [10, 15, 0, 0])],
    });
    expect(chips(cell("Wednesday 14 October"))).toHaveLength(1);
    expect(chips(cell("Thursday 15 October"))).toHaveLength(0);
  });

  it("a timed event starting exactly at midnight belongs to that day, not the one before", () => {
    renderMonth({
      events: [timed("Early bus", TRAVEL, [10, 15, 0, 0], [10, 15, 1, 0])],
    });
    expect(chips(cell("Wednesday 14 October"))).toHaveLength(0);
    expect(chips(cell("Thursday 15 October"))).toHaveLength(1);
  });

  it("a timed event crossing midnight shows in both days", () => {
    renderMonth({
      events: [timed("Night train", TRAVEL, [10, 14, 23, 0], [10, 15, 1, 0])],
    });
    const name = "Night train, Travel, 23:00 to 01:00";
    expect(chipNames(cell("Wednesday 14 October"))).toStrictEqual([name]);
    expect(chipNames(cell("Thursday 15 October"))).toStrictEqual([name]);
  });

  it("an event on a leading or trailing day shows in that cell", () => {
    renderMonth({
      events: [
        timed("Early", GYM, [9, 28, 0, 0], [9, 28, 1, 0]),
        timed("Last", GYM, [11, 8, 23, 0], [11, 8, 23, 59]),
      ],
    });
    expect(chips(cell("Monday 28 September"))).toHaveLength(1);
    expect(chips(cell("Sunday 8 November"))).toHaveLength(1);
  });
});

const CARD_LINE =
  "Share a booking email to the app, or paste it here, and it becomes an event.";

describe("the empty month (AC-7, Blocks 6 and 7)", () => {
  it('with no events and not loading, shows the "Nothing this month" card with voice.md\'s copy and both actions', () => {
    renderMonth({ events: [], loading: false });
    const card = screen.getByRole("region", { name: "Nothing this month" });
    expect(
      within(card).getByRole("heading", {
        level: 2,
        name: "Nothing this month",
      }),
    ).toBeInTheDocument();
    expect(within(card).getByText(CARD_LINE)).toBeInTheDocument();
    expect(
      within(card).getByRole("link", { name: "Capture a booking" }),
    ).toHaveAttribute("href", "/capture");
    expect(
      within(card).getByRole("button", { name: "or add an event" }),
    ).toHaveAttribute("type", "button");
  });

  it("one event on a leading day (29 September) removes the card", () => {
    renderMonth({
      events: [timed("Swim", GYM, [9, 29, 7, 0], [9, 29, 8, 0])],
      loading: false,
    });
    expect(screen.queryByText("Nothing this month")).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Capture a booking" }),
    ).toBeNull();
  });

  it("one event in the month removes the card", () => {
    renderMonth({
      events: [timed("Swim", GYM, [10, 20, 7, 0], [10, 20, 8, 0])],
    });
    expect(screen.queryByText("Nothing this month")).toBeNull();
  });

  it("while loading, the card is absent and the grid is aria-busy", () => {
    renderMonth({ events: [], loading: true });
    expect(screen.queryByText("Nothing this month")).toBeNull();
    expect(
      screen.queryByRole("region", { name: "Nothing this month" }),
    ).toBeNull();
    expect(grid()).toHaveAttribute("aria-busy", "true");
  });
});

describe("EmptyMonth on its own (Block 7)", () => {
  it('"or add an event" calls onAddEvent', async () => {
    const user = userEvent.setup();
    const onAddEvent = vi.fn();
    render(
      <MemoryRouter>
        <EmptyMonth onAddEvent={onAddEvent} />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "or add an event" }));
    expect(onAddEvent).toHaveBeenCalledTimes(1);
  });

  it('"or add an event" with no handler does nothing and does not throw', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <EmptyMonth />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "or add an event" }));
    expect(
      screen.getByRole("heading", { name: "Nothing this month" }),
    ).toBeInTheDocument();
  });
});
