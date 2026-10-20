import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
import type { ListResult } from "../data/result";
import type { Event, Kind } from "../data/rows";
import type { SeedRepo } from "../kinds/seedKinds";
import {
  createEventsStore,
  type EventsReader,
  type EventsStore,
} from "../sync/eventsStore";
import { createKindsStore, type KindsStore } from "../sync/kindsStore";
import { installMatchMedia } from "../test/media";
import { WeekView } from "./WeekView";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-010 AC-3 and AC-6, Contract Block 4 (PO decisions 1 and 4). The view
// owns its data: it is rendered over createKindsStore / createEventsStore on
// hand-written vi.fn fakes, as CalendarPage.test.tsx does. MECHANICAL: the
// grid's name and the column headers' names are pinned exactly; the phone
// breakpoint comes from the installMatchMedia stub. Every instant uses the
// local-time constructor.

const STAMP = "2026-10-16T08:00:00.000001+00:00";

const GYM: Kind = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Gym",
  colorLight: "#2E7D32",
  colorDark: "#9BD69B",
  sortOrder: 1,
  isDefault: true,
  deletedAt: null,
  createdAt: STAMP,
  updatedAt: STAMP,
};

let serial = 0;

function timed(title: string, startsAt: Date, endsAt: Date): Event {
  serial += 1;
  return {
    id: `10000000-0000-4000-8000-${String(serial).padStart(12, "0")}`,
    title,
    kindId: GYM.id,
    startsAt,
    endsAt,
    allDay: false,
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

const NOW = oct(14, 9, 30);

const WEEK_NAMES = [
  "Monday 12 October",
  "Tuesday 13 October",
  "Wednesday 14 October",
  "Thursday 15 October",
  "Friday 16 October",
  "Saturday 17 October",
  "Sunday 18 October",
];

type FakeKinds = {
  listAll: Mock<SeedRepo["listAll"]>;
  insertMany: Mock<SeedRepo["insertMany"]>;
};
type FakeEvents = { listLive: Mock<EventsReader["listLive"]> };

let kindsRepo: FakeKinds;
let eventsRepo: FakeEvents;
let media: ReturnType<typeof installMatchMedia> | null = null;

beforeEach(() => {
  kindsRepo = {
    listAll: vi.fn<SeedRepo["listAll"]>(),
    insertMany: vi.fn<SeedRepo["insertMany"]>(),
  };
  kindsRepo.listAll.mockResolvedValue({ status: "ok", rows: [GYM] });
  eventsRepo = { listLive: vi.fn<EventsReader["listLive"]>() };
  eventsRepo.listLive.mockResolvedValue({ status: "ok", rows: [] });
});

afterEach(() => {
  media?.restore();
  media = null;
});

/** A listLive answer the test releases by hand. */
function held(): {
  promise: Promise<ListResult<Event>>;
  release: (r: ListResult<Event>) => void;
} {
  let release: (r: ListResult<Event>) => void = () => {};
  const promise = new Promise<ListResult<Event>>((done) => {
    release = done;
  });
  return { promise, release };
}

function renderWeek(selected: Date, width = 1280) {
  media = installMatchMedia({ width, colorScheme: "light" });
  const kinds: KindsStore = createKindsStore(kindsRepo);
  const events: EventsStore = createEventsStore(eventsRepo);
  render(
    <MemoryRouter initialEntries={["/week/2026-10-14"]}>
      <WeekView selected={selected} now={NOW} kinds={kinds} events={events} />
    </MemoryRouter>,
  );
  return { kinds, events };
}

const headerNames = (grid: HTMLElement) =>
  within(grid)
    .getAllByRole("columnheader")
    .map((h) => h.getAttribute("aria-label"));

/** The grid once the events have loaded (it stops being busy). */
async function settledGrid(name: string): Promise<HTMLElement> {
  const grid = await screen.findByRole("grid", { name });
  await vi.waitFor(() => expect(grid).not.toHaveAttribute("aria-busy", "true"));
  return grid;
}

describe("the week at desktop width (AC-3, Block 4)", () => {
  it.each([12, 13, 14, 15, 16, 17, 18])(
    'selected %i October 2026: the grid is "Week of 12 October 2026", Monday 12 to Sunday 18, in order',
    async (date) => {
      renderWeek(oct(date, 15, 0));
      const grid = await screen.findByRole("grid", {
        name: "Week of 12 October 2026",
      });
      expect(headerNames(grid)).toStrictEqual(WEEK_NAMES);
    },
  );

  it("a week crossing a month end is named by its Monday: selected Sunday 1 November is the week of 26 October", async () => {
    renderWeek(new Date(2026, 10, 1, 12, 0));
    const grid = await screen.findByRole("grid", {
      name: "Week of 26 October 2026",
    });
    expect(headerNames(grid)).toStrictEqual([
      "Monday 26 October",
      "Tuesday 27 October",
      "Wednesday 28 October",
      "Thursday 29 October",
      "Friday 30 October",
      "Saturday 31 October",
      "Sunday 1 November",
    ]);
  });

  it("renders the grid and no heading of its own", async () => {
    renderWeek(oct(14));
    await screen.findByRole("grid", { name: "Week of 12 October 2026" });
    expect(screen.queryAllByRole("heading")).toStrictEqual([]);
  });
});

describe("the week at phone width is a three-day window (AC-6, Block 4)", () => {
  it('selected Wednesday 14 October at 375px: Tuesday 13, Wednesday 14, Thursday 15, named "Tuesday 13 October to Thursday 15 October 2026"', async () => {
    renderWeek(oct(14, 15, 0), 375);
    const grid = await screen.findByRole("grid", {
      name: "Tuesday 13 October to Thursday 15 October 2026",
    });
    expect(headerNames(grid)).toStrictEqual([
      "Tuesday 13 October",
      "Wednesday 14 October",
      "Thursday 15 October",
    ]);
  });

  it("the window is centred on the selected day, not on the week: selected Monday 12 October shows Sunday 11 to Tuesday 13", async () => {
    renderWeek(oct(12, 8, 0), 375);
    const grid = await screen.findByRole("grid", {
      name: "Sunday 11 October to Tuesday 13 October 2026",
    });
    expect(headerNames(grid)).toStrictEqual([
      "Sunday 11 October",
      "Monday 12 October",
      "Tuesday 13 October",
    ]);
  });

  it("at 768px (tablet) the week is seven days again", async () => {
    renderWeek(oct(14), 768);
    const grid = await screen.findByRole("grid", {
      name: "Week of 12 October 2026",
    });
    expect(headerNames(grid)).toHaveLength(7);
  });
});

describe("the week's events come from the store (Block 4, PO decision 1)", () => {
  it("asks listLive once and shows the week's events as blocks", async () => {
    eventsRepo.listLive.mockResolvedValue({
      status: "ok",
      rows: [timed("Swim", oct(14, 7, 0), oct(14, 8, 0))],
    });
    renderWeek(oct(14));
    const chip = await screen.findByRole("button", {
      name: "Swim, Gym, 07:00 to 08:00",
    });
    expect(chip).toHaveAttribute("data-variant", "block");
    expect(eventsRepo.listLive).toHaveBeenCalledTimes(1);
    expect(kindsRepo.listAll).toHaveBeenCalledTimes(1);
  });

  it("covers exactly the seven days: Sunday 18 Oct 23:00 shows, Sunday 11 Oct 23:00 and Monday 19 Oct 00:00 do not", async () => {
    eventsRepo.listLive.mockResolvedValue({
      status: "ok",
      rows: [
        timed("Before", oct(11, 23, 0), oct(11, 23, 30)),
        timed("First", oct(12, 0, 0), oct(12, 0, 30)),
        timed("Last", oct(18, 23, 0), oct(18, 23, 30)),
        timed("After", oct(19, 0, 0), oct(19, 1, 0)),
      ],
    });
    renderWeek(oct(14));
    await settledGrid("Week of 12 October 2026");
    expect(
      await screen.findByRole("button", { name: /^Last, / }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^First, / }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Before, / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^After, / })).toBeNull();
  });

  it("the phone window covers its three days only: Wednesday 14 Oct shows, Friday 16 Oct does not", async () => {
    eventsRepo.listLive.mockResolvedValue({
      status: "ok",
      rows: [
        timed("Mid", oct(14, 9, 0), oct(14, 10, 0)),
        timed("Out", oct(16, 9, 0), oct(16, 10, 0)),
      ],
    });
    renderWeek(oct(14), 375);
    await settledGrid("Tuesday 13 October to Thursday 15 October 2026");
    expect(
      await screen.findByRole("button", { name: /^Mid, / }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Out, / })).toBeNull();
  });

  it("is busy while listLive is held, and not once it answers with rows", async () => {
    const answer = held();
    eventsRepo.listLive.mockReturnValueOnce(answer.promise);
    renderWeek(oct(14));
    const grid = await screen.findByRole("grid", {
      name: "Week of 12 October 2026",
    });
    expect(grid).toHaveAttribute("aria-busy", "true");
    answer.release({ status: "ok", rows: [] });
    await vi.waitFor(() =>
      expect(grid).not.toHaveAttribute("aria-busy", "true"),
    );
  });

  it("stays busy when listLive answers offline (CAL-009 PO decision 12)", async () => {
    eventsRepo.listLive.mockResolvedValue({ status: "offline" });
    const { events } = renderWeek(oct(14));
    const grid = await screen.findByRole("grid", {
      name: "Week of 12 October 2026",
    });
    // Not vacuous: the store has really settled on "unavailable".
    await vi.waitFor(() =>
      expect(events.getSnapshot().status).toBe("unavailable"),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(grid).toHaveAttribute("aria-busy", "true");
  });
});

// CAL-012 Contract, Block 6 (AC-1, AC-5): the view passes onSlotActivate
// and onOpenEvent through to its TimeGrid, and sets the grid's one tab stop
// to the selected day's 09:00 (PO decision 2).
describe("the week passes activation through (CAL-012 Block 6)", () => {
  function renderActiveWeek(selected: Date, rows: Event[] = []) {
    media = installMatchMedia({ width: 1280, colorScheme: "light" });
    eventsRepo.listLive.mockResolvedValue({ status: "ok", rows });
    const user = userEvent.setup();
    const onSlotActivate = vi.fn<(start: Date, cell: HTMLElement) => void>();
    const onOpenEvent = vi.fn<(event: Event, chip: HTMLElement) => void>();
    render(
      <MemoryRouter initialEntries={["/week/2026-10-14"]}>
        <WeekView
          selected={selected}
          now={NOW}
          kinds={createKindsStore(kindsRepo)}
          events={createEventsStore(eventsRepo)}
          onSlotActivate={onSlotActivate}
          onOpenEvent={onOpenEvent}
        />
      </MemoryRouter>,
    );
    return { user, onSlotActivate, onOpenEvent };
  }

  const tabStops = (grid: HTMLElement) =>
    within(grid)
      .getAllByRole("gridcell")
      .filter((c) => c.getAttribute("tabindex") === "0");

  it.each([
    ["14 Oct 16:45", oct(14, 16, 45), "Wednesday 14 October, 09:00"],
    ["17 Oct 00:00", oct(17), "Saturday 17 October, 09:00"],
  ])(
    "selected %s: the one tab stop is that day's 09:00",
    async (_label, selected, name) => {
      renderActiveWeek(selected);
      const grid = await settledGrid("Week of 12 October 2026");
      expect(tabStops(grid)).toStrictEqual([
        within(grid).getByRole("gridcell", { name }),
      ]);
    },
  );

  it("a slot click reaches onSlotActivate with that hour's start and the cell", async () => {
    const { user, onSlotActivate } = renderActiveWeek(oct(14));
    const grid = await settledGrid("Week of 12 October 2026");
    const cell = within(grid).getByRole("gridcell", {
      name: "Thursday 15 October, 14:00",
    });
    await user.click(cell);
    expect(onSlotActivate).toHaveBeenCalledTimes(1);
    expect(onSlotActivate).toHaveBeenCalledWith(oct(15, 14), cell);
  });

  it("a block click reaches onOpenEvent with the event and the chip", async () => {
    const swim = timed("Swim", oct(15, 7, 0), oct(15, 8, 0));
    const { user, onOpenEvent } = renderActiveWeek(oct(14), [swim]);
    const chip = await screen.findByRole("button", {
      name: "Swim, Gym, 07:00 to 08:00",
    });
    await user.click(chip);
    expect(onOpenEvent).toHaveBeenCalledTimes(1);
    expect(onOpenEvent).toHaveBeenCalledWith(swim, chip);
  });
});
