import { act, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
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
import { CalendarPage } from "./CalendarPage";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-009 Contract, Block 8 (and AC-7 through the real stores). The page in
// a MemoryRouter with the four calendar routes of routes.tsx pointing at
// <CalendarPage kinds events now />, over createKindsStore and
// createEventsStore on hand-written vi.fn fakes (Block 9). `now` is pinned
// to Wed 14 Oct 2026 unless a test says otherwise; it is injected, so the
// system clock is never read.

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

const NOW = new Date(2026, 9, 14, 12, 0);

type FakeKinds = {
  listAll: Mock<SeedRepo["listAll"]>;
  insertMany: Mock<SeedRepo["insertMany"]>;
};
type FakeEvents = { listLive: Mock<EventsReader["listLive"]> };

let kindsRepo: FakeKinds;
let eventsRepo: FakeEvents;
let media: ReturnType<typeof installMatchMedia>;

beforeEach(() => {
  kindsRepo = {
    listAll: vi.fn<SeedRepo["listAll"]>(),
    insertMany: vi.fn<SeedRepo["insertMany"]>(),
  };
  kindsRepo.listAll.mockResolvedValue({ status: "ok", rows: [GYM] });
  eventsRepo = { listLive: vi.fn<EventsReader["listLive"]>() };
  eventsRepo.listLive.mockResolvedValue({ status: "ok", rows: [] });
  media = installMatchMedia({ width: 1280, colorScheme: "light" });
});

afterEach(() => {
  media.restore();
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

function renderPage(path: string, now: Date = NOW) {
  const kinds: KindsStore = createKindsStore(kindsRepo);
  const events: EventsStore = createEventsStore(eventsRepo);
  const page = <CalendarPage kinds={kinds} events={events} now={() => now} />;
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={page} />
        <Route path="/month/:ym" element={page} />
        <Route path="/week/:date" element={page} />
        <Route path="/day/:date" element={page} />
      </Routes>
    </MemoryRouter>,
  );
  return { kinds, events };
}

/** The page once the events have loaded (the grid stops being busy). */
async function settledGrid(name: string): Promise<HTMLElement> {
  const grid = await screen.findByRole("grid", { name });
  await vi.waitFor(() => expect(grid).not.toHaveAttribute("aria-busy", "true"));
  return grid;
}

describe("which month the page shows (Block 8)", () => {
  it('/month/2026-10 shows the grid "October 2026"', async () => {
    renderPage("/month/2026-10");
    expect(
      await screen.findByRole("grid", { name: "October 2026" }),
    ).toBeInTheDocument();
  });

  it('/month/2027-02 shows "February 2027", from Monday 1 February, whatever now() says', async () => {
    renderPage("/month/2027-02");
    const grid = await screen.findByRole("grid", { name: "February 2027" });
    const [first] = within(grid).getAllByRole("gridcell");
    expect(first).toHaveAccessibleName(/^Monday 1 February, /);
  });

  it.each([
    ["/week/2026-10-12", "October 2026"],
    ["/day/2026-10-14", "October 2026"],
    ["/day/2026-12-01", "December 2026"],
    ["/week/2027-01-04", "January 2027"],
  ])("%s shows the month containing that date: %s", async (path, month) => {
    renderPage(path);
    expect(
      await screen.findByRole("grid", { name: month }),
    ).toBeInTheDocument();
  });

  it("/ shows the month containing now(), not the system clock's", async () => {
    renderPage("/", new Date(2027, 2, 3, 9, 0));
    expect(
      await screen.findByRole("grid", { name: "March 2027" }),
    ).toBeInTheDocument();
  });

  it.each([
    "/month/2026-13",
    "/month/2026-00",
    "/month/2026-1",
    "/month/abcd-ef",
    "/week/not-a-date",
    "/day/someday",
  ])("%s (unparseable) shows the month containing now()", async (path) => {
    renderPage(path, new Date(2027, 2, 3, 9, 0));
    expect(
      await screen.findByRole("grid", { name: "March 2027" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("grid")).toHaveLength(1);
  });

  it("marks now()'s date as today", async () => {
    renderPage("/month/2026-10");
    const grid = await screen.findByRole("grid", { name: "October 2026" });
    const current = within(grid)
      .getAllByRole("gridcell")
      .filter((c) => c.getAttribute("aria-current") === "date");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName(/^Wednesday 14 October, /);
  });
});

describe('the page heading stays "Calendar" (Block 8, PO decision 1)', () => {
  it.each(["/", "/month/2026-10", "/week/2026-10-12", "/day/2026-10-14"])(
    '%s has exactly one <h1>, reading "Calendar", focusable by script, before the grid',
    async (path) => {
      renderPage(path);
      const grid = await screen.findByRole("grid");
      const h1s = screen.getAllByRole("heading", { level: 1 });
      expect(h1s).toHaveLength(1);
      expect(h1s[0]).toHaveAccessibleName("Calendar");
      expect(h1s[0]).toHaveAttribute("tabindex", "-1");
      expect(document.querySelectorAll("h1")).toHaveLength(1);
      expect(
        (h1s[0] as HTMLElement).compareDocumentPosition(grid) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    },
  );
});

describe("events through the stores (Block 8, AC-3)", () => {
  it("renders the store's events as chips in their kind, asking each repository once", async () => {
    eventsRepo.listLive.mockResolvedValue({
      status: "ok",
      rows: [
        timed("Swim", new Date(2026, 9, 14, 7, 0), new Date(2026, 9, 14, 8, 0)),
      ],
    });
    renderPage("/month/2026-10");
    expect(
      await screen.findByRole("button", { name: "Swim, Gym, 07:00 to 08:00" }),
    ).toBeInTheDocument();
    expect(eventsRepo.listLive).toHaveBeenCalledTimes(1);
    expect(kindsRepo.listAll).toHaveBeenCalledTimes(1);
  });

  it("asks for the grid's whole range: an event on the first cell (28 Sep) counts, one the day before does not", async () => {
    eventsRepo.listLive.mockResolvedValue({
      status: "ok",
      rows: [
        timed(
          "Before",
          new Date(2026, 8, 27, 23, 0),
          new Date(2026, 8, 27, 23, 30),
        ),
        timed(
          "First",
          new Date(2026, 8, 28, 0, 0),
          new Date(2026, 8, 28, 0, 30),
        ),
        timed(
          "Last",
          new Date(2026, 10, 8, 23, 0),
          new Date(2026, 10, 8, 23, 30),
        ),
        timed(
          "After",
          new Date(2026, 10, 9, 0, 0),
          new Date(2026, 10, 9, 0, 30),
        ),
      ],
    });
    renderPage("/month/2026-10");
    const grid = await settledGrid("October 2026");
    await screen.findByRole("button", { name: /^First, / });
    const cells = within(grid).getAllByRole("gridcell");
    expect(cells[0]).toHaveAccessibleName("Monday 28 September, 1 event");
    expect(cells[41]).toHaveAccessibleName("Sunday 8 November, 1 event");
    expect(screen.queryByRole("button", { name: /^Before, / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^After, / })).toBeNull();
  });
});

describe("the empty month through the stores (AC-7)", () => {
  it("while listLive is held the card is absent and the grid busy; released with [] the card appears", async () => {
    const answer = held();
    eventsRepo.listLive.mockReturnValueOnce(answer.promise);
    renderPage("/month/2026-10");
    const grid = await screen.findByRole("grid", { name: "October 2026" });
    expect(grid).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Nothing this month")).toBeNull();
    answer.release({ status: "ok", rows: [] });
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Nothing this month",
      }),
    ).toBeInTheDocument();
    expect(grid).not.toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("link", { name: "Capture a booking" }),
    ).toHaveAttribute("href", "/capture");
  });

  it("an unavailable events store (listLive offline) shows no card and keeps the grid busy (PO decision 12)", async () => {
    eventsRepo.listLive.mockResolvedValue({ status: "offline" });
    const { events } = renderPage("/month/2026-10");
    const grid = await screen.findByRole("grid", { name: "October 2026" });
    // Not vacuous: the store has really settled on "unavailable", not "loading".
    await vi.waitFor(() =>
      expect(events.getSnapshot().status).toBe("unavailable"),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText("Nothing this month")).toBeNull();
    expect(
      screen.queryByRole("region", { name: "Nothing this month" }),
    ).toBeNull();
    expect(grid).toHaveAttribute("aria-busy", "true");
  });

  it("one event on a leading day keeps the card away once loaded", async () => {
    eventsRepo.listLive.mockResolvedValue({
      status: "ok",
      rows: [
        timed("Swim", new Date(2026, 8, 29, 7, 0), new Date(2026, 8, 29, 8, 0)),
      ],
    });
    renderPage("/month/2026-10");
    await screen.findByRole("button", { name: "Swim, Gym, 07:00 to 08:00" });
    await settledGrid("October 2026");
    expect(screen.queryByText("Nothing this month")).toBeNull();
  });

  it("an event outside the visible grid leaves the month empty: the card shows", async () => {
    eventsRepo.listLive.mockResolvedValue({
      status: "ok",
      rows: [
        timed(
          "Far",
          new Date(2026, 10, 20, 7, 0),
          new Date(2026, 10, 20, 8, 0),
        ),
      ],
    });
    renderPage("/month/2026-10");
    expect(
      await screen.findByRole("heading", { name: "Nothing this month" }),
    ).toBeInTheDocument();
  });
});
