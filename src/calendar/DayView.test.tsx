import { act, render, screen, within } from "@testing-library/react";
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
