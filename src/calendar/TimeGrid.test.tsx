import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSX } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Event, Kind } from "../data/rows";
import { HOUR_HEIGHT, initialScrollTop } from "../domain/timeGrid";
import type { KindsSnapshot } from "../sync/kindsStore";
import { installMatchMedia } from "../test/media";
import { TimeGrid } from "./TimeGrid";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-010 AC-1 to AC-5 in the DOM, Contract Block 3. MECHANICAL: the roles
// and names are accessibility.md's ("Roles and names") and Block 3's markup;
// the numbers are layout.md's, read out (48px/h desktop, 56px/h phone, 20px
// floor, 24px all-day chips + 8px). jsdom lays nothing out, so positions are
// asserted as the INLINE styles Block 3 pins (top / height / left / width on
// the block, top on the now line, height on the all-day row) - the way
// CAL-009 asserted chip colours - and the three data attributes Block 3 pins
// (data-scroll, data-day, data-now) are the only non-role hooks. jsdom
// normalises calc(): `calc(100% / 2 - 2px)` and `calc(50% - 2px)` both read
// back as "calc(50% - 2px)", and a third as "calc(33.3333% - 2px)"
// (measured on jsdom 30.1.2, 2026-10-17), so widths are compared as numbers.
// Every instant uses the local-time constructor; `now` is pinned to
// Wed 14 Oct 2026 09:30 and passed in - the clock is never read.

const STAMP = "2026-10-16T08:00:00.000001+00:00";

function kind(n: number, name: string, light: string, dark: string): Kind {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name,
    colorLight: light,
    colorDark: dark,
    sortOrder: n,
    isDefault: true,
    deletedAt: null,
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

const GYM = kind(1, "Gym", "#2E7D32", "#9BD69B");
const UNKNOWN_KIND = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function snapshot(live: Kind[]): KindsSnapshot {
  const index = new Map(live.map((k) => [k.id, k]));
  return { status: "ready", kinds: live, byId: (id) => index.get(id) };
}

const KINDS = snapshot([GYM]);

/** Local time on a day of October 2026. */
const oct = (date: number, hour = 0, minute = 0) =>
  new Date(2026, 9, date, hour, minute);

let serial = 0;

function event(
  title: string,
  startsAt: Date,
  endsAt: Date,
  allDay = false,
  kindId = GYM.id,
): Event {
  serial += 1;
  return {
    id: `10000000-0000-4000-8000-${String(serial).padStart(12, "0")}`,
    title,
    kindId,
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

/** A timed event on `date` October from `[h, m]` to `[h, m]`. */
const timed = (
  title: string,
  date: number,
  from: [number, number],
  to: [number, number],
) => event(title, oct(date, ...from), oct(date, ...to));

/** An all-day event on `date` October alone. */
const allDay = (title: string, date: number) =>
  event(title, oct(date), oct(date + 1), true);

/** Wed 14 Oct 2026 09:30: now's top at 48px/h is 9.5 x 48 = 456. */
const NOW = oct(14, 9, 30);
const NOW_TOP = 456;

/** The week of Monday 12 October 2026, read out - not computed. */
const WEEK = [12, 13, 14, 15, 16, 17, 18].map((d) => oct(d));
const WEEK_LABEL = "Week of 12 October 2026";
const DAY_NAMES = [
  "Monday 12 October",
  "Tuesday 13 October",
  "Wednesday 14 October",
  "Thursday 15 October",
  "Friday 16 October",
  "Saturday 17 October",
  "Sunday 18 October",
];
const HEADER_TEXT = [
  "MON 12",
  "TUE 13",
  "WED 14",
  "THU 15",
  "FRI 16",
  "SAT 17",
  "SUN 18",
];
const HOURS = Array.from(
  { length: 24 },
  (_, h) => `${String(h).padStart(2, "0")}:00`,
);

let media: ReturnType<typeof installMatchMedia> | null = null;

afterEach(() => {
  media?.restore();
  media = null;
});

function Where(): JSX.Element {
  const { pathname } = useLocation();
  return <p>at {pathname}</p>;
}

function renderGrid(
  options: {
    days?: Date[];
    label?: string;
    events?: Event[];
    kinds?: KindsSnapshot;
    now?: Date;
    loading?: boolean;
    width?: number;
  } = {},
) {
  media = installMatchMedia({
    width: options.width ?? 1280,
    colorScheme: "light",
  });
  const user = userEvent.setup();
  const label = options.label ?? WEEK_LABEL;
  render(
    <MemoryRouter initialEntries={["/week/2026-10-14"]}>
      <TimeGrid
        days={options.days ?? WEEK}
        label={label}
        events={options.events ?? []}
        kinds={options.kinds ?? KINDS}
        now={options.now ?? NOW}
        loading={options.loading ?? false}
      />
      <Where />
    </MemoryRouter>,
  );
  const grid = screen.getByRole("grid", { name: label });
  return { user, grid };
}

const location = () => screen.getByText(/^at \//).textContent;

/** The overlay column of a day, by Block 3's `data-day={dayKey(day)}`. */
function column(key: string): HTMLElement {
  const found = document.querySelectorAll<HTMLElement>(`[data-day="${key}"]`);
  expect(found, `columns marked data-day="${key}"`).toHaveLength(1);
  return found[0] as HTMLElement;
}

/** The nearest ancestor of a block chip that carries the inline `top`. */
function blockOf(chip: HTMLElement): HTMLElement {
  let el = chip.parentElement;
  while (el !== null && el.style.top === "") el = el.parentElement;
  expect(el, "no ancestor of the chip carries an inline top").not.toBeNull();
  return el as HTMLElement;
}

/** `left` and the percentage inside `width: calc(P% - 2px)`, as numbers. */
function horizontal(block: HTMLElement): { left: number; width: number } {
  expect(block.style.left).toMatch(/^[\d.]+%$/);
  const width = /^calc\(([\d.]+)% - 2px\)$/.exec(block.style.width);
  expect(width, `width "${block.style.width}"`).not.toBeNull();
  return {
    left: Number.parseFloat(block.style.left),
    width: Number(width?.[1]),
  };
}

function expectHorizontal(block: HTMLElement, left: number, width: number) {
  const got = horizontal(block);
  expect(got.left).toBeCloseTo(left, 3);
  expect(got.width).toBeCloseTo(width, 3);
}

/** The all-day gridcell of a day, and the row holding it. */
function allDayCell(day: string): HTMLElement {
  return screen.getByRole("gridcell", { name: `${day}, all day` });
}
const allDayRow = () =>
  allDayCell("Monday 12 October").closest('[role="row"]') as HTMLElement;

const MORE = /^\d+ more all-day events? on /;
const chipsIn = (cell: HTMLElement) =>
  within(cell)
    .queryAllByRole("button")
    .filter((b) => !MORE.test(b.getAttribute("aria-label") ?? ""));

describe("the grid's structure and names (AC-3, Block 3)", () => {
  it('is one grid named by its label, "Week of 12 October 2026"', () => {
    renderGrid();
    expect(screen.getAllByRole("grid")).toHaveLength(1);
  });

  it('has seven column headers named "Monday 12 October" to "Sunday 18 October", in order, reading "MON 12" to "SUN 18"', () => {
    const { grid } = renderGrid();
    const heads = within(grid).getAllByRole("columnheader");
    expect(heads.map((h) => h.getAttribute("aria-label"))).toStrictEqual(
      DAY_NAMES,
    );
    expect(heads.map((h) => h.textContent)).toStrictEqual(HEADER_TEXT);
  });

  it('has 7 x 24 = 168 hour slots named "{EEEE d MMMM}, {HH}:00", hour by hour, Monday to Sunday', () => {
    const { grid } = renderGrid();
    const names = within(grid)
      .getAllByRole("gridcell")
      .map((c) => c.getAttribute("aria-label") ?? "")
      .filter((n) => /, \d\d:00$/.test(n));
    expect(names).toHaveLength(168);
    expect(names).toStrictEqual(
      HOURS.flatMap((h) => DAY_NAMES.map((d) => `${d}, ${h}`)),
    );
    expect(names).toContain("Wednesday 14 October, 09:00");
    expect(names).toContain("Wednesday 14 October, 00:00");
    expect(names).toContain("Wednesday 14 October, 23:00");
  });

  it('has one all-day slot per day, "{EEEE d MMMM}, all day", and no other gridcells', () => {
    const { grid } = renderGrid();
    const names = within(grid)
      .getAllByRole("gridcell")
      .map((c) => c.getAttribute("aria-label"));
    expect(names).toHaveLength(168 + 7);
    expect(names.filter((n) => n?.endsWith(", all day"))).toStrictEqual(
      DAY_NAMES.map((d) => `${d}, all day`),
    );
  });

  it("a one-day grid has one column header and 24 hour slots", () => {
    const { grid } = renderGrid({
      days: [oct(14)],
      label: "Wednesday 14 October 2026",
    });
    const heads = within(grid).getAllByRole("columnheader");
    expect(heads).toHaveLength(1);
    expect(heads[0]).toHaveAccessibleName("Wednesday 14 October");
    const names = within(grid)
      .getAllByRole("gridcell")
      .map((c) => c.getAttribute("aria-label"));
    expect(names).toStrictEqual([
      "Wednesday 14 October, all day",
      ...HOURS.map((h) => `Wednesday 14 October, ${h}`),
    ]);
  });

  it('is aria-busy="true" while loading', () => {
    const { grid } = renderGrid({ loading: true });
    expect(grid).toHaveAttribute("aria-busy", "true");
  });

  it("is not busy once loaded", () => {
    const { grid } = renderGrid({ loading: false });
    expect(grid).not.toHaveAttribute("aria-busy", "true");
  });
});

describe("timed events are blocks in their day's column (AC-1, Block 3)", () => {
  it("a 09:00-10:30 event is a block in Wednesday's column at top 432px, height 72px, full width", () => {
    renderGrid({ events: [timed("Dentist", 14, [9, 0], [10, 30])] });
    const chip = screen.getByRole("button", {
      name: "Dentist, Gym, 09:00 to 10:30",
    });
    expect(chip).toHaveAttribute("data-variant", "block");
    expect(column("2026-10-14").contains(chip)).toBe(true);
    const block = blockOf(chip);
    expect(block.style.top).toBe("432px");
    expect(block.style.height).toBe("72px");
    expect(block.style.width).toBe("calc(100% - 2px)");
    expectHorizontal(block, 0, 100);
  });

  it("a 15-minute event is held at the 20px floor", () => {
    renderGrid({ events: [timed("Call", 14, [9, 15], [9, 30])] });
    const block = blockOf(
      screen.getByRole("button", { name: "Call, Gym, 09:15 to 09:30" }),
    );
    expect(block.style.top).toBe("444px");
    expect(block.style.height).toBe("20px");
  });

  it("passes the block's height to the chip: a 72px block shows its time line, a 24px block does not", () => {
    renderGrid({
      events: [
        timed("Dentist", 14, [9, 0], [10, 30]),
        timed("Call", 15, [9, 0], [9, 30]),
      ],
    });
    const long = screen.getByRole("button", {
      name: "Dentist, Gym, 09:00 to 10:30",
    });
    const short = screen.getByRole("button", {
      name: "Call, Gym, 09:00 to 09:30",
    });
    expect(within(long).getByText("09:00 – 10:30")).toBeInTheDocument();
    expect(within(short).queryByText("09:00 – 09:30")).toBeNull();
  });

  it("at 375px (phone) the hour is 56px: a 09:00-10:00 block is at top 504px, height 56px", () => {
    renderGrid({
      width: 375,
      days: [13, 14, 15].map((d) => oct(d)),
      label: "Tuesday 13 October to Thursday 15 October 2026",
      events: [timed("Swim", 14, [9, 0], [10, 0])],
    });
    const block = blockOf(
      screen.getByRole("button", { name: "Swim, Gym, 09:00 to 10:00" }),
    );
    expect(block.style.top).toBe(`${9 * HOUR_HEIGHT.phone}px`);
    expect(block.style.top).toBe("504px");
    expect(block.style.height).toBe("56px");
  });

  it("an event crossing midnight is two clipped blocks: Wed 23:00-24:00 and Thu 00:00-01:00, both named for the whole event", () => {
    renderGrid({ events: [event("Night train", oct(14, 23), oct(15, 1))] });
    const chips = screen.getAllByRole("button", {
      name: "Night train, Gym, 23:00 to 01:00",
    });
    expect(chips).toHaveLength(2);
    const wed = chips.filter((c) => column("2026-10-14").contains(c));
    const thu = chips.filter((c) => column("2026-10-15").contains(c));
    expect(wed).toHaveLength(1);
    expect(thu).toHaveLength(1);
    const first = blockOf(wed[0] as HTMLElement);
    const second = blockOf(thu[0] as HTMLElement);
    expect([first.style.top, first.style.height]).toStrictEqual([
      "1104px",
      "48px",
    ]);
    expect([second.style.top, second.style.height]).toStrictEqual([
      "0px",
      "48px",
    ]);
  });

  it("an event whose kind is unknown is still a block, named as removed", () => {
    renderGrid({
      events: [event("Weeding", oct(14, 9), oct(14, 10), false, UNKNOWN_KIND)],
    });
    const chip = screen.getByRole("button", {
      name: "Weeding, 09:00 to 10:00, kind removed",
    });
    expect(chip).toHaveAttribute("data-neutral", "true");
    expect(column("2026-10-14").contains(chip)).toBe(true);
  });

  it("timed and all-day events of one day are kept apart: all-day in the all-day slot, timed in the column, hour slots empty", () => {
    renderGrid({
      events: [allDay("Hotel", 14), timed("Dentist", 14, [9, 0], [10, 30])],
    });
    const hotel = screen.getByRole("button", { name: "Hotel, Gym, all day" });
    const dentist = screen.getByRole("button", {
      name: "Dentist, Gym, 09:00 to 10:30",
    });
    const cell = allDayCell("Wednesday 14 October");
    const col = column("2026-10-14");
    expect(cell.contains(hotel)).toBe(true);
    expect(col.contains(hotel)).toBe(false);
    expect(hotel).not.toHaveAttribute("data-variant");
    expect(col.contains(dentist)).toBe(true);
    expect(cell.contains(dentist)).toBe(false);
    const nine = screen.getByRole("gridcell", {
      name: "Wednesday 14 October, 09:00",
    });
    expect(within(nine).queryAllByRole("button")).toStrictEqual([]);
  });
});

describe("overlapping events share the column (AC-2, Block 3)", () => {
  it("A 09-10 and B 09:30-10:30 take the left and right halves: left 0% / 50%, width calc(50% - 2px)", () => {
    renderGrid({
      events: [
        timed("A", 14, [9, 0], [10, 0]),
        timed("B", 14, [9, 30], [10, 30]),
      ],
    });
    const a = blockOf(screen.getByRole("button", { name: /^A, / }));
    const b = blockOf(screen.getByRole("button", { name: /^B, / }));
    expect(a.style.width).toBe("calc(50% - 2px)");
    expectHorizontal(a, 0, 50);
    expectHorizontal(b, 50, 50);
  });

  it("three identical 09-10 events take thirds, in title order", () => {
    renderGrid({
      events: [
        timed("Charlie", 14, [9, 0], [10, 0]),
        timed("Alpha", 14, [9, 0], [10, 0]),
        timed("Bravo", 14, [9, 0], [10, 0]),
      ],
    });
    const at = (t: string) =>
      blockOf(screen.getByRole("button", { name: new RegExp(`^${t}, `) }));
    expectHorizontal(at("Alpha"), 0, 100 / 3);
    expectHorizontal(at("Bravo"), 100 / 3, 100 / 3);
    expectHorizontal(at("Charlie"), 200 / 3, 100 / 3);
  });

  it("touching 09-10 and 10-11 do not overlap: both full width", () => {
    renderGrid({
      events: [
        timed("A", 14, [9, 0], [10, 0]),
        timed("B", 14, [10, 0], [11, 0]),
      ],
    });
    expectHorizontal(
      blockOf(screen.getByRole("button", { name: /^A, / })),
      0,
      100,
    );
    expectHorizontal(
      blockOf(screen.getByRole("button", { name: /^B, / })),
      0,
      100,
    );
  });

  it("the same hours on different days do not overlap: each is full width in its own column", () => {
    renderGrid({
      events: [
        timed("Wed", 14, [9, 0], [10, 0]),
        timed("Thu", 15, [9, 0], [10, 0]),
      ],
    });
    const wed = screen.getByRole("button", { name: /^Wed, / });
    const thu = screen.getByRole("button", { name: /^Thu, / });
    expect(column("2026-10-14").contains(wed)).toBe(true);
    expect(column("2026-10-15").contains(thu)).toBe(true);
    expectHorizontal(blockOf(wed), 0, 100);
    expectHorizontal(blockOf(thu), 0, 100);
  });
});

describe("the all-day row (AC-4, Block 3)", () => {
  it("with no all-day events is 32px tall", () => {
    renderGrid();
    expect(allDayRow().style.height).toBe("32px");
  });

  it("is sized by the busiest day: two on Wednesday and one on Friday make it 56px", () => {
    renderGrid({
      events: [allDay("Hotel", 14), allDay("Flight", 14), allDay("Fair", 16)],
    });
    expect(allDayRow().style.height).toBe("56px");
    expect(chipsIn(allDayCell("Wednesday 14 October"))).toHaveLength(2);
    expect(chipsIn(allDayCell("Friday 16 October"))).toHaveLength(1);
  });

  it('four all-day events on Wednesday: 80px, three chips in start-then-title order, then a "+1" button', () => {
    renderGrid({
      events: [
        allDay("Delta", 14),
        allDay("Bravo", 14),
        allDay("Charlie", 14),
        allDay("Alpha", 14),
      ],
    });
    expect(allDayRow().style.height).toBe("80px");
    const cell = allDayCell("Wednesday 14 October");
    expect(chipsIn(cell).map((b) => b.getAttribute("aria-label"))).toEqual([
      "Alpha, Gym, all day",
      "Bravo, Gym, all day",
      "Charlie, Gym, all day",
    ]);
    const more = within(cell).getByRole("button", {
      name: "1 more all-day event on Wednesday 14 October",
    });
    expect(more).toHaveTextContent(/^\+1$/);
    expect(more).toHaveAttribute("type", "button");
    expect(screen.queryByRole("button", { name: /^Delta, / })).toBeNull();
  });

  it('five all-day events: "+2", named "2 more all-day events on Wednesday 14 October"', () => {
    renderGrid({
      events: ["A", "B", "C", "D", "E"].map((t) => allDay(t, 14)),
    });
    expect(allDayRow().style.height).toBe("80px");
    const more = screen.getByRole("button", {
      name: "2 more all-day events on Wednesday 14 October",
    });
    expect(more).toHaveTextContent(/^\+2$/);
  });

  it("three all-day events show three chips and no more-button", () => {
    renderGrid({ events: ["A", "B", "C"].map((t) => allDay(t, 14)) });
    expect(allDayRow().style.height).toBe("80px");
    expect(screen.queryByRole("button", { name: MORE })).toBeNull();
  });

  it('the "+1" button opens that day: /day/2026-10-14', async () => {
    const { user } = renderGrid({
      events: ["A", "B", "C", "D"].map((t) => allDay(t, 14)),
    });
    expect(location()).toBe("at /week/2026-10-14");
    await user.click(
      screen.getByRole("button", {
        name: "1 more all-day event on Wednesday 14 October",
      }),
    );
    expect(location()).toBe("at /day/2026-10-14");
  });
});

describe("today: the now line, the header and the initial scroll (AC-5, Block 3)", () => {
  it("the now line is in the 14th's column only", () => {
    renderGrid();
    const lines = document.querySelectorAll<HTMLElement>("[data-now]");
    expect(lines).toHaveLength(1);
    const line = lines[0] as HTMLElement;
    expect(line.closest("[data-day]")?.getAttribute("data-day")).toBe(
      "2026-10-14",
    );
    expect(line).toHaveAttribute("aria-hidden", "true");
  });

  it("the now line sits at the current minute: 09:30 is top 456px at 48px/h", () => {
    renderGrid();
    const line = document.querySelector<HTMLElement>("[data-now]");
    expect(line?.style.top).toBe(`${NOW_TOP}px`);
  });

  it("the now line follows the phone's 56px hour: 09:30 is top 532px", () => {
    renderGrid({
      width: 375,
      days: [13, 14, 15].map((d) => oct(d)),
      label: "Tuesday 13 October to Thursday 15 October 2026",
    });
    const line = document.querySelector<HTMLElement>("[data-now]");
    expect(line?.style.top).toBe("532px");
  });

  it('only the 14th\'s column header carries aria-current="date"', () => {
    const { grid } = renderGrid();
    const current = [...document.querySelectorAll("[aria-current]")];
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("aria-current", "date");
    expect(current[0]).toHaveAttribute("role", "columnheader");
    expect(current[0]).toHaveAccessibleName("Wednesday 14 October");
    expect(grid.contains(current[0] as Node)).toBe(true);
  });

  it("with now in another week there is no now line and no aria-current", () => {
    renderGrid({ now: oct(21, 9, 30) });
    expect(document.querySelectorAll("[data-now]")).toHaveLength(0);
    expect(document.querySelectorAll("[aria-current]")).toHaveLength(0);
  });

  it("with today in view the scroll container starts at initialScrollTop(nowTop, 48, its height)", () => {
    renderGrid();
    const scroll = document.querySelectorAll<HTMLElement>("[data-scroll]");
    expect(scroll).toHaveLength(1);
    const el = scroll[0] as HTMLElement;
    expect(el.scrollTop).toBe(
      initialScrollTop(NOW_TOP, HOUR_HEIGHT.desktop, el.clientHeight),
    );
    expect(el.scrollTop).toBeGreaterThan(0);
  });

  it("with today not in view the scroll container puts 08:00 at the top: 384", () => {
    renderGrid({ now: oct(21, 9, 30) });
    const el = document.querySelector<HTMLElement>("[data-scroll]");
    expect(el).not.toBeNull();
    expect(el?.scrollTop).toBe(
      initialScrollTop(null, HOUR_HEIGHT.desktop, el?.clientHeight ?? 0),
    );
    expect(el?.scrollTop).toBe(384);
  });
});

// CAL-012 Contract, Block 6 (AC-1, AC-5; PO decision 2). Three optional
// props: onSlotActivate(start, cell) for a click, Enter or Space on an hour
// cell - `start` that day at that hour, :00; onOpenEvent(event, chip) for
// block and all-day chips; tabStop, the ONE hour cell with tabIndex 0
// (default days[0] at 9), every other hour cell -1. No arrow navigation
// between slots is built.
describe("activating a slot and a chip (CAL-012 Block 6)", () => {
  const SLOT = /, \d\d:00$/;

  function renderActive(
    options: {
      events?: Event[];
      tabStop?: { day: Date; hour: number };
      days?: Date[];
    } = {},
  ) {
    media = installMatchMedia({ width: 1280, colorScheme: "light" });
    const user = userEvent.setup();
    const onSlotActivate = vi.fn<(start: Date, cell: HTMLElement) => void>();
    const onOpenEvent = vi.fn<(event: Event, chip: HTMLElement) => void>();
    render(
      <MemoryRouter initialEntries={["/week/2026-10-14"]}>
        <TimeGrid
          days={options.days ?? WEEK}
          label={WEEK_LABEL}
          events={options.events ?? []}
          kinds={KINDS}
          now={NOW}
          loading={false}
          onSlotActivate={onSlotActivate}
          onOpenEvent={onOpenEvent}
          {...(options.tabStop === undefined
            ? {}
            : { tabStop: options.tabStop })}
        />
      </MemoryRouter>,
    );
    return { user, onSlotActivate, onOpenEvent };
  }

  const slot = (name: string) => screen.getByRole("gridcell", { name });
  const slots = () =>
    screen
      .getAllByRole("gridcell")
      .filter((c) => SLOT.test(c.getAttribute("aria-label") ?? ""));

  it("with no tabStop, the one hour cell with tabindex 0 is Monday 12 October, 09:00; the other 167 are -1", () => {
    renderGrid();
    const all = slots();
    expect(all).toHaveLength(168);
    const stops = all.filter((c) => c.getAttribute("tabindex") === "0");
    expect(stops).toStrictEqual([slot("Monday 12 October, 09:00")]);
    expect(all.filter((c) => c.getAttribute("tabindex") === "-1")).toHaveLength(
      167,
    );
  });

  it("tabStop { 14 Oct, 9 } makes Wednesday 14 October, 09:00 the one tab stop", () => {
    renderActive({ tabStop: { day: oct(14), hour: 9 } });
    const stops = slots().filter((c) => c.getAttribute("tabindex") === "0");
    expect(stops).toStrictEqual([slot("Wednesday 14 October, 09:00")]);
    expect(slot("Monday 12 October, 09:00")).toHaveAttribute("tabindex", "-1");
  });

  it("tabStop { 16 Oct, 14 } makes Friday 16 October, 14:00 the one tab stop", () => {
    renderActive({ tabStop: { day: oct(16), hour: 14 } });
    const stops = slots().filter((c) => c.getAttribute("tabindex") === "0");
    expect(stops).toStrictEqual([slot("Friday 16 October, 14:00")]);
  });

  it("a click on Thursday 15 October, 14:00 calls onSlotActivate(15 Oct 14:00, that cell) once", async () => {
    const { user, onSlotActivate } = renderActive();
    await user.click(slot("Thursday 15 October, 14:00"));
    expect(onSlotActivate).toHaveBeenCalledTimes(1);
    expect(onSlotActivate).toHaveBeenCalledWith(
      oct(15, 14, 0),
      slot("Thursday 15 October, 14:00"),
    );
  });

  it("a click on the 00:00 and the 23:00 cells starts at those hours", async () => {
    const { user, onSlotActivate } = renderActive();
    await user.click(slot("Sunday 18 October, 00:00"));
    await user.click(slot("Monday 12 October, 23:00"));
    expect(onSlotActivate.mock.calls.map(([start]) => start)).toStrictEqual([
      oct(18, 0, 0),
      oct(12, 23, 0),
    ]);
  });

  it.each(["{Enter}", " "])(
    "%j on the tab-stop cell (14 Oct 09:00) calls onSlotActivate with its start and the cell",
    async (key) => {
      const { user, onSlotActivate } = renderActive({
        tabStop: { day: oct(14), hour: 9 },
      });
      slot("Wednesday 14 October, 09:00").focus();
      await user.keyboard(key);
      expect(onSlotActivate).toHaveBeenCalledTimes(1);
      expect(onSlotActivate).toHaveBeenCalledWith(
        oct(14, 9, 0),
        slot("Wednesday 14 October, 09:00"),
      );
    },
  );

  it("Space on a slot is preventDefault-ed", async () => {
    const seen: Array<[string, boolean]> = [];
    const spy = (e: KeyboardEvent) => seen.push([e.key, e.defaultPrevented]);
    document.addEventListener("keydown", spy);
    try {
      const { user } = renderActive();
      slot("Monday 12 October, 09:00").focus();
      await user.keyboard(" ");
      expect(seen).toStrictEqual([[" ", true]]);
    } finally {
      document.removeEventListener("keydown", spy);
    }
  });

  it("Enter on another focused hour cell starts at that cell's hour", async () => {
    const { user, onSlotActivate } = renderActive();
    slot("Thursday 15 October, 17:00").focus();
    await user.keyboard("{Enter}");
    expect(onSlotActivate).toHaveBeenCalledWith(
      oct(15, 17, 0),
      slot("Thursday 15 October, 17:00"),
    );
  });

  it("other keys on a slot activate nothing - no arrow navigation (PO decision 2) - and Enter then does", async () => {
    const { user, onSlotActivate } = renderActive();
    const stop = slot("Monday 12 October, 09:00");
    stop.focus();
    await user.keyboard("a{ArrowDown}{ArrowRight}");
    expect(onSlotActivate).not.toHaveBeenCalled();
    expect(stop).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onSlotActivate).toHaveBeenCalledTimes(1);
  });

  it("a click on a block calls onOpenEvent(event, that chip), and no slot is activated", async () => {
    const dentist = timed("Dentist", 14, [9, 0], [10, 30]);
    const { user, onOpenEvent, onSlotActivate } = renderActive({
      events: [dentist],
    });
    const chip = screen.getByRole("button", {
      name: "Dentist, Gym, 09:00 to 10:30",
    });
    await user.click(chip);
    expect(onOpenEvent).toHaveBeenCalledTimes(1);
    expect(onOpenEvent).toHaveBeenCalledWith(dentist, chip);
    expect(onSlotActivate).not.toHaveBeenCalled();
  });

  it("a block clipped to its second day opens the whole event, not the clipped piece", async () => {
    const late = event("Late show", oct(14, 22, 0), oct(15, 2, 0));
    const { user, onOpenEvent } = renderActive({ events: [late] });
    const chips = screen.getAllByRole("button", { name: /^Late show, / });
    expect(chips).toHaveLength(2);
    const second = within(column("2026-10-15")).getByRole("button", {
      name: /^Late show, /,
    });
    await user.click(second);
    expect(onOpenEvent).toHaveBeenCalledWith(late, second);
    expect(onOpenEvent.mock.calls[0]?.[0].startsAt).toStrictEqual(
      oct(14, 22, 0),
    );
  });

  it("a click on an all-day chip calls onOpenEvent(event, that chip)", async () => {
    const holiday = allDay("Holiday", 16);
    const { user, onOpenEvent, onSlotActivate } = renderActive({
      events: [holiday],
    });
    const chip = within(allDayCell("Friday 16 October")).getByRole("button", {
      name: "Holiday, Gym, all day",
    });
    await user.click(chip);
    expect(onOpenEvent).toHaveBeenCalledWith(holiday, chip);
    expect(onSlotActivate).not.toHaveBeenCalled();
  });
});
