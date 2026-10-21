import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
import type { ChipCommand } from "./EventChip";
import type { DropTarget } from "./useChipDrag";
import { DayView } from "./DayView";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-010 AC-3 (the day half), Contract Block 5. Same props and the same
// hand-written store fakes as WeekView.test.tsx; one column at every
// breakpoint; the range is [day 00:00, next midnight). Local time only.

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
const DAY_LABEL = "Wednesday 14 October 2026";

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

function renderDay(selected: Date, width = 1280) {
  media = installMatchMedia({ width, colorScheme: "light" });
  const kinds: KindsStore = createKindsStore(kindsRepo);
  const events: EventsStore = createEventsStore(eventsRepo);
  render(
    <MemoryRouter initialEntries={["/day/2026-10-14"]}>
      <DayView selected={selected} now={NOW} kinds={kinds} events={events} />
    </MemoryRouter>,
  );
  return { kinds, events };
}

const headerNames = (grid: HTMLElement) =>
  within(grid)
    .getAllByRole("columnheader")
    .map((h) => h.getAttribute("aria-label"));

describe("the day view (AC-3, Block 5)", () => {
  it('for 14 October is one grid named "Wednesday 14 October 2026" with one column, "Wednesday 14 October"', async () => {
    renderDay(oct(14, 15, 0));
    const grid = await screen.findByRole("grid", { name: DAY_LABEL });
    expect(screen.getAllByRole("grid")).toHaveLength(1);
    expect(headerNames(grid)).toStrictEqual(["Wednesday 14 October"]);
  });

  it("has 24 hour slots, 00:00 to 23:00", async () => {
    renderDay(oct(14));
    const grid = await screen.findByRole("grid", { name: DAY_LABEL });
    const hours = within(grid)
      .getAllByRole("gridcell")
      .map((c) => c.getAttribute("aria-label") ?? "")
      .filter((n) => /, \d\d:00$/.test(n));
    expect(hours).toHaveLength(24);
    expect(hours[0]).toBe("Wednesday 14 October, 00:00");
    expect(hours[23]).toBe("Wednesday 14 October, 23:00");
  });

  it.each([375, 768, 1280])("is one column at %ipx", async (width) => {
    renderDay(oct(14), width);
    const grid = await screen.findByRole("grid", { name: DAY_LABEL });
    expect(headerNames(grid)).toStrictEqual(["Wednesday 14 October"]);
  });

  it("renders the grid and no heading of its own", async () => {
    renderDay(oct(14));
    await screen.findByRole("grid", { name: DAY_LABEL });
    expect(screen.queryAllByRole("heading")).toStrictEqual([]);
  });
});

describe("the day's events come from the store (Block 5)", () => {
  it("asks listLive once and covers exactly [14 Oct 00:00, 15 Oct 00:00)", async () => {
    eventsRepo.listLive.mockResolvedValue({
      status: "ok",
      rows: [
        timed("Before", oct(13, 23, 0), oct(14, 0, 0)),
        timed("First", oct(14, 0, 0), oct(14, 0, 30)),
        timed("Last", oct(14, 23, 0), oct(14, 23, 30)),
        timed("After", oct(15, 0, 0), oct(15, 1, 0)),
      ],
    });
    renderDay(oct(14));
    expect(
      await screen.findByRole("button", { name: /^Last, / }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^First, / }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Before, / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^After, / })).toBeNull();
    expect(eventsRepo.listLive).toHaveBeenCalledTimes(1);
  });

  it("is busy while listLive is held, and not once it answers with rows", async () => {
    const answer = held();
    eventsRepo.listLive.mockReturnValueOnce(answer.promise);
    renderDay(oct(14));
    const grid = await screen.findByRole("grid", { name: DAY_LABEL });
    expect(grid).toHaveAttribute("aria-busy", "true");
    answer.release({ status: "ok", rows: [] });
    await vi.waitFor(() =>
      expect(grid).not.toHaveAttribute("aria-busy", "true"),
    );
  });

  it("stays busy when listLive answers offline", async () => {
    eventsRepo.listLive.mockResolvedValue({ status: "offline" });
    const { events } = renderDay(oct(14));
    const grid = await screen.findByRole("grid", { name: DAY_LABEL });
    await vi.waitFor(() =>
      expect(events.getSnapshot().status).toBe("unavailable"),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(grid).toHaveAttribute("aria-busy", "true");
  });
});

// CAL-012 Contract, Block 6 (AC-1, AC-5): as WeekView - pass-through, and
// the one tab stop is the day's 09:00.
describe("the day passes activation through (CAL-012 Block 6)", () => {
  function renderActiveDay(selected: Date, rows: Event[] = []) {
    media = installMatchMedia({ width: 1280, colorScheme: "light" });
    eventsRepo.listLive.mockResolvedValue({ status: "ok", rows });
    const user = userEvent.setup();
    const onSlotActivate = vi.fn<(start: Date, cell: HTMLElement) => void>();
    const onOpenEvent = vi.fn<(event: Event, chip: HTMLElement) => void>();
    render(
      <MemoryRouter initialEntries={["/day/2026-10-14"]}>
        <DayView
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

  it("the one tab stop is Wednesday 14 October, 09:00", async () => {
    renderActiveDay(oct(14, 18, 0));
    const grid = await screen.findByRole("grid", { name: DAY_LABEL });
    const stops = within(grid)
      .getAllByRole("gridcell")
      .filter((c) => c.getAttribute("tabindex") === "0");
    expect(stops).toStrictEqual([
      within(grid).getByRole("gridcell", {
        name: "Wednesday 14 October, 09:00",
      }),
    ]);
  });

  it("a slot click reaches onSlotActivate with 14 Oct 06:00 and the cell", async () => {
    const { user, onSlotActivate } = renderActiveDay(oct(14));
    const cell = await screen.findByRole("gridcell", {
      name: "Wednesday 14 October, 06:00",
    });
    await user.click(cell);
    expect(onSlotActivate).toHaveBeenCalledWith(oct(14, 6), cell);
  });

  it("a block click reaches onOpenEvent with the event and the chip", async () => {
    const swim = timed("Swim", oct(14, 7, 0), oct(14, 8, 0));
    const { user, onOpenEvent } = renderActiveDay(oct(14), [swim]);
    const chip = await screen.findByRole("button", {
      name: "Swim, Gym, 07:00 to 08:00",
    });
    await user.click(chip);
    expect(onOpenEvent).toHaveBeenCalledWith(swim, chip);
  });
});

// CAL-013 Contract, Block 5: the day passes onChipCommand and onDropEvent
// through to its TimeGrid.
describe("the day passes moving through (CAL-013 Block 5)", () => {
  function renderMovingDay(rows: Event[]) {
    media = installMatchMedia({ width: 1280, colorScheme: "light" });
    eventsRepo.listLive.mockResolvedValue({ status: "ok", rows });
    const onChipCommand =
      vi.fn<(event: Event, command: ChipCommand, chip: HTMLElement) => void>();
    const onDropEvent = vi.fn<(event: Event, target: DropTarget) => void>();
    render(
      <MemoryRouter initialEntries={["/day/2026-10-14"]}>
        <DayView
          selected={oct(14)}
          now={NOW}
          kinds={createKindsStore(kindsRepo)}
          events={createEventsStore(eventsRepo)}
          onChipCommand={onChipCommand}
          onDropEvent={onDropEvent}
        />
      </MemoryRouter>,
    );
    return { onChipCommand, onDropEvent };
  }

  it("Alt+Shift+ArrowDown on a block reaches onChipCommand(event, lengthen, chip)", async () => {
    const swim = timed("Swim", oct(14, 10, 0), oct(14, 11, 15));
    const { onChipCommand } = renderMovingDay([swim]);
    const chip = await screen.findByRole("button", {
      name: "Swim, Gym, 10:00 to 11:15",
    });
    fireEvent.keyDown(chip, { key: "ArrowDown", altKey: true, shiftKey: true });
    expect(onChipCommand).toHaveBeenCalledWith(swim, "lengthen", chip);
  });

  it("a block dragged onto Wednesday 14 October, 16:00 reaches onDropEvent with that slot", async () => {
    const swim = timed("Swim", oct(14, 10, 0), oct(14, 11, 15));
    const { onDropEvent } = renderMovingDay([swim]);
    const chip = await screen.findByRole("button", {
      name: "Swim, Gym, 10:00 to 11:15",
    });
    const target = screen.getByRole("gridcell", {
      name: "Wednesday 14 October, 16:00",
    });
    expect(target).toHaveAttribute("data-drop-slot", "2026-10-14T16:00");
    fireEvent.pointerDown(chip, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(document, { clientX: 100, clientY: 400 });
    fireEvent.pointerUp(target, { clientX: 100, clientY: 400 });
    expect(onDropEvent).toHaveBeenCalledWith(swim, {
      kind: "slot",
      start: oct(14, 16, 0),
    });
  });
});
