import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSX } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import type { EventsRepo } from "../data/events";
import type { ListResult, Result } from "../data/result";
import type { Event, Kind, NewEvent } from "../data/rows";
import type { EventActions } from "../sync/eventActions";
import type { SeedRepo } from "../kinds/seedKinds";
import {
  createEventsStore,
  type EventsReader,
  type EventsStore,
} from "../sync/eventsStore";
import { createKindsStore, type KindsStore } from "../sync/kindsStore";
import { RouteFocus } from "../app/routes";
import { installMatchMedia } from "../test/media";
import { CalendarPage } from "./CalendarPage";
import { CalendarToolbar } from "./CalendarToolbar";
import { setSelected } from "./selection";

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
//
// CAL-011 (Blocks 9 and 10): the page renders no <h1> any more; the period
// title is the toolbar's. So renderPage mounts a stand-in shell - the
// CalendarToolbar in a <header> (as AppShell's toolbar slot does), the page
// routes in <main>, and the real RouteFocus from routes.tsx - so the title,
// the URL after each key or click, and the "state: { focus: 'grid' }" guard
// are all observed together. Not the real `routes` with MSW: the stores
// stay the hand-written fakes above. localStorage (cc.view) and the app's
// selection store are reset around every test.

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
  localStorage.clear();
  act(() => setSelected(null));
});

afterEach(() => {
  media.restore();
  act(() => setSelected(null));
  localStorage.clear();
  vi.restoreAllMocks();
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

function Where(): JSX.Element {
  const { pathname } = useLocation();
  return <p>at {pathname}</p>;
}

function renderPage(
  path: string,
  now: Date = NOW,
  options: { toolbar?: boolean } = {},
) {
  const user = userEvent.setup();
  const kinds: KindsStore = createKindsStore(kindsRepo);
  const events: EventsStore = createEventsStore(eventsRepo);
  const page = <CalendarPage kinds={kinds} events={events} now={() => now} />;
  render(
    <MemoryRouter initialEntries={[path]}>
      {options.toolbar !== false && (
        <header>
          <CalendarToolbar now={() => now} />
        </header>
      )}
      <main>
        <Routes>
          <Route path="/" element={page} />
          <Route path="/month/:ym" element={page} />
          <Route path="/week/:date" element={page} />
          <Route path="/day/:date" element={page} />
        </Routes>
      </main>
      <RouteFocus />
      <Where />
    </MemoryRouter>,
  );
  return { kinds, events, user };
}

const at = () => screen.getByText(/^at \//).textContent;

/** The month grid's cell whose name starts with `day`. */
function monthCell(grid: HTMLElement, day: string): HTMLElement {
  return within(grid).getByRole("gridcell", { name: new RegExp(`^${day}, `) });
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

  // CAL-011 AC-1, Block 10 (rewritten from CAL-009's "shows the month
  // containing that date": a week or day URL now shows that view).
  it.each([
    ["/week/2026-10-12", "Week of 12 October 2026"],
    ["/week/2026-10-14", "Week of 12 October 2026"],
    ["/day/2026-10-14", "Wednesday 14 October 2026"],
    ["/day/2026-12-01", "Tuesday 1 December 2026"],
    ["/week/2027-01-04", "Week of 4 January 2027"],
  ])(
    "%s shows that view: the grid %j, and no month grid",
    async (path, name) => {
      renderPage(path);
      expect(await screen.findByRole("grid", { name })).toBeInTheDocument();
      expect(screen.getAllByRole("grid")).toHaveLength(1);
    },
  );

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

// CAL-011 AC-1, Blocks 9 and 10, PO decision 1 (rewritten from CAL-009's
// 'the page heading stays "Calendar"'): the <h1> is the toolbar's period
// title, and the page itself renders none.
describe("the page heading is the period title, in the toolbar (AC-1, Blocks 9 and 10)", () => {
  it.each([
    ["/", "October 2026"],
    ["/month/2026-10", "October 2026"],
    ["/week/2026-10-12", "12 – 18 Oct 2026"],
    ["/week/2026-10-14", "12 – 18 Oct 2026"],
    ["/day/2026-10-14", "Wednesday 14 October 2026"],
  ])(
    "%s has exactly one <h1>, reading %j, focusable by script, before the grid",
    async (path, title) => {
      renderPage(path);
      const grid = await screen.findByRole("grid");
      const h1s = screen.getAllByRole("heading", { level: 1 });
      expect(h1s).toHaveLength(1);
      expect(h1s[0]).toHaveAccessibleName(title);
      expect(h1s[0]).toHaveAttribute("tabindex", "-1");
      expect(document.querySelectorAll("h1")).toHaveLength(1);
      expect(
        (h1s[0] as HTMLElement).compareDocumentPosition(grid) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    },
  );

  it.each(["/", "/month/2026-10", "/week/2026-10-12", "/day/2026-10-14"])(
    "%s: the page alone, without the toolbar, renders no heading",
    async (path) => {
      renderPage(path, NOW, { toolbar: false });
      await screen.findByRole("grid");
      expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
      expect(document.querySelectorAll("h1")).toHaveLength(0);
    },
  );

  it("a week URL on a Wednesday keeps its address (PO decision 2)", async () => {
    renderPage("/week/2026-10-14");
    await screen.findByRole("grid", { name: "Week of 12 October 2026" });
    expect(at()).toBe("at /week/2026-10-14");
  });

  it('on the phone, /week/2026-10-14 is the three-day window "Tuesday 13 October to Thursday 15 October 2026"', async () => {
    media.set({ width: 375 });
    renderPage("/week/2026-10-14");
    expect(
      await screen.findByRole("grid", {
        name: "Tuesday 13 October to Thursday 15 October 2026",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName(
      "Tue 13 – Thu 15 Oct",
    );
  });
});

describe("/ shows the stored view of today, in place (AC-6, Block 10, PO decision 4)", () => {
  it('with no cc.view, / shows the month of today: the grid and title "October 2026"', async () => {
    renderPage("/");
    expect(
      await screen.findByRole("grid", { name: "October 2026" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName(
      "October 2026",
    );
    expect(at()).toBe("at /");
  });

  it('with cc.view = "week", / shows the week of today and stays at /', async () => {
    localStorage.setItem("cc.view", "week");
    renderPage("/");
    expect(
      await screen.findByRole("grid", { name: "Week of 12 October 2026" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("grid", { name: "October 2026" })).toBeNull();
    expect(at()).toBe("at /");
  });

  it('with cc.view = "day", / shows today', async () => {
    localStorage.setItem("cc.view", "day");
    renderPage("/");
    expect(
      await screen.findByRole("grid", { name: "Wednesday 14 October 2026" }),
    ).toBeInTheDocument();
    expect(at()).toBe("at /");
  });

  it("with a junk cc.view, / shows the month", async () => {
    localStorage.setItem("cc.view", "agenda");
    renderPage("/");
    expect(
      await screen.findByRole("grid", { name: "October 2026" }),
    ).toBeInTheDocument();
  });

  it("with a localStorage that throws on read, / shows the month", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    renderPage("/");
    expect(
      await screen.findByRole("grid", { name: "October 2026" }),
    ).toBeInTheDocument();
  });

  it("after the owner switches to Week, the next visit to / shows the week of today", async () => {
    const { user } = renderPage("/");
    await screen.findByRole("grid", { name: "October 2026" });
    await user.click(screen.getByRole("radio", { name: "Week" }));
    expect(at()).toBe("at /week/2026-10-12");
    expect(localStorage.getItem("cc.view")).toBe("week");
    cleanup();
    act(() => setSelected(null));
    renderPage("/");
    expect(
      await screen.findByRole("grid", { name: "Week of 12 October 2026" }),
    ).toBeInTheDocument();
    expect(at()).toBe("at /");
  });
});

describe("the month grid's selection through the page (AC-3, AC-5, Block 10)", () => {
  it("on today's month, today is selected and is the tab stop", async () => {
    renderPage("/month/2026-10");
    const grid = await screen.findByRole("grid", { name: "October 2026" });
    const fourteenth = monthCell(grid, "Wednesday 14 October");
    expect(fourteenth).toHaveAttribute("aria-selected", "true");
    expect(fourteenth).toHaveAttribute("tabindex", "0");
  });

  it("on another month, its 1st is selected", async () => {
    renderPage("/month/2026-11");
    const grid = await screen.findByRole("grid", { name: "November 2026" });
    expect(monthCell(grid, "Sunday 1 November")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("Next month moves the selection to the 1st of November", async () => {
    const { user } = renderPage("/month/2026-10");
    await screen.findByRole("grid", { name: "October 2026" });
    await user.click(screen.getByRole("button", { name: "Next month" }));
    const grid = await screen.findByRole("grid", { name: "November 2026" });
    expect(monthCell(grid, "Sunday 1 November")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("ArrowRight within the month selects and focuses 15 October, and the URL stays", async () => {
    const { user } = renderPage("/month/2026-10");
    const grid = await settledGrid("October 2026");
    monthCell(grid, "Wednesday 14 October").focus();
    await user.keyboard("{ArrowRight}");
    const fifteenth = monthCell(grid, "Thursday 15 October");
    expect(fifteenth).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(fifteenth).toHaveFocus());
    expect(at()).toBe("at /month/2026-10");
  });

  it('PageDown from 31 October goes to /month/2026-11 with "Monday 30 November" selected and focused - not the title', async () => {
    const { user } = renderPage("/month/2026-10");
    const october = await settledGrid("October 2026");
    await user.click(monthCell(october, "Saturday 31 October"));
    monthCell(october, "Saturday 31 October").focus();
    await user.keyboard("{PageDown}");
    const november = await screen.findByRole("grid", { name: "November 2026" });
    expect(at()).toBe("at /month/2026-11");
    const thirtieth = monthCell(november, "Monday 30 November");
    expect(thirtieth).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(thirtieth).toHaveFocus());
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName(
      "November 2026",
    );
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveFocus();
  });

  it('ArrowDown from 31 October goes to /month/2026-11 with "Saturday 7 November" selected and focused', async () => {
    const { user } = renderPage("/month/2026-10");
    const october = await settledGrid("October 2026");
    await user.click(monthCell(october, "Saturday 31 October"));
    monthCell(october, "Saturday 31 October").focus();
    await user.keyboard("{ArrowDown}");
    const november = await screen.findByRole("grid", { name: "November 2026" });
    expect(at()).toBe("at /month/2026-11");
    const seventh = monthCell(november, "Saturday 7 November");
    expect(seventh).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(seventh).toHaveFocus());
  });

  it("Next month (a toolbar navigation) still focuses the new title", async () => {
    const { user } = renderPage("/month/2026-10");
    await screen.findByRole("grid", { name: "October 2026" });
    await user.click(screen.getByRole("button", { name: "Next month" }));
    await screen.findByRole("grid", { name: "November 2026" });
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveAccessibleName("November 2026");
    await waitFor(() => expect(h1).toHaveFocus());
  });

  it.each([
    ["Friday 16 October", "/week/2026-10-12"],
    ["Tuesday 20 October", "/week/2026-10-19"],
  ])(
    "clicking %s, then Week, goes to the week holding it: %s (AC-3)",
    async (day, to) => {
      const { user } = renderPage("/month/2026-10");
      const grid = await screen.findByRole("grid", { name: "October 2026" });
      await user.click(monthCell(grid, day));
      await user.click(screen.getByRole("radio", { name: "Week" }));
      expect(at()).toBe(`at ${to}`);
    },
  );

  it("with today selected by default, Week goes to /week/2026-10-12 (AC-3)", async () => {
    const { user } = renderPage("/month/2026-10");
    await screen.findByRole("grid", { name: "October 2026" });
    await user.click(screen.getByRole("radio", { name: "Week" }));
    expect(at()).toBe("at /week/2026-10-12");
  });
});

describe("the phone's day list below the month (AC-7, Block 10)", () => {
  it('tapping "Thursday 15 October" shows "Events on Thu 15 Oct" listing its events as chip buttons', async () => {
    media.set({ width: 375 });
    eventsRepo.listLive.mockResolvedValue({
      status: "ok",
      rows: [
        timed("Swim", new Date(2026, 9, 15, 7, 0), new Date(2026, 9, 15, 8, 0)),
        timed(
          "Lift",
          new Date(2026, 9, 15, 18, 0),
          new Date(2026, 9, 15, 19, 0),
        ),
        timed("Run", new Date(2026, 9, 16, 7, 0), new Date(2026, 9, 16, 8, 0)),
      ],
    });
    const { user } = renderPage("/month/2026-10");
    const grid = await settledGrid("October 2026");
    await user.click(monthCell(grid, "Thursday 15 October"));
    const list = await screen.findByRole("region", {
      name: "Events on Thu 15 Oct",
    });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(
      items.map((li) =>
        within(li).getByRole("button").getAttribute("aria-label"),
      ),
    ).toStrictEqual(["Swim, Gym, 07:00 to 08:00", "Lift, Gym, 18:00 to 19:00"]);
    expect(
      grid.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('tapping an empty "Thursday 15 October" reads "No events on Thu 15 Oct" with an Add button', async () => {
    media.set({ width: 375 });
    const { user } = renderPage("/month/2026-10");
    const grid = await settledGrid("October 2026");
    await user.click(monthCell(grid, "Thursday 15 October"));
    const list = await screen.findByRole("region", {
      name: "Events on Thu 15 Oct",
    });
    expect(
      within(list).getByText("No events on Thu 15 Oct"),
    ).toBeInTheDocument();
    expect(
      within(list).getByRole("button", { name: "Add" }),
    ).toBeInTheDocument();
  });

  it("on the phone the list starts on the selected day: today", async () => {
    media.set({ width: 375 });
    renderPage("/month/2026-10");
    await settledGrid("October 2026");
    expect(
      screen.getByRole("region", { name: "Events on Wed 14 Oct" }),
    ).toBeInTheDocument();
    expect(
      screen.queryAllByRole("region", { name: /^Events on / }),
    ).toHaveLength(1);
  });

  it.each([1280, 768])("at %ipx there is no day list", async (width) => {
    media.set({ width });
    const { user } = renderPage("/month/2026-10");
    const grid = await settledGrid("October 2026");
    await user.click(monthCell(grid, "Thursday 15 October"));
    expect(screen.queryByRole("region", { name: /^Events on / })).toBeNull();
  });

  it.each(["/week/2026-10-14", "/day/2026-10-14"])(
    "on the phone %s shows no day list",
    async (path) => {
      media.set({ width: 375 });
      renderPage(path);
      await screen.findByRole("grid");
      expect(screen.queryByRole("region", { name: /^Events on / })).toBeNull();
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

// CAL-012 Contract, Block 7 (AC-1, AC-4, AC-5, AC-6; PO decisions 3 and 4).
// The same stand-in shell over the same fake stores, plus write members on
// the events fake and an `actions` prop. The actions are written out here
// with createEventActions's discipline (Block 2: an ok result is handed back
// only after the store refreshed; nothing else refreshes) rather than
// imported, because importing src/sync/eventActions.ts would fail this whole
// file at load while that module is missing, and take every CAL-009/CAL-011
// case above dark with it; eventActions.test.ts pins the real module.
// The fake's listLive answers with the rows inserted so far, so a saved
// event's chip appearing proves the refresh happened.

type Writes = {
  insert: Mock<EventsRepo["insert"]>;
  update: Mock<EventsRepo["update"]>;
};

let rows: Event[];
let writes: Writes;

function actionsOver(store: EventsStore): EventActions {
  const settle = async (pending: Promise<Result<Event>>) => {
    const result = await pending;
    if (result.status === "ok") await store.refresh();
    return result;
  };
  return {
    createEvent: (input) => settle(writes.insert(input)),
    updateEvent: (id, patch, at) => settle(writes.update(id, patch, at)),
  };
}

function useWrites(initial: Event[] = []): void {
  rows = [...initial];
  eventsRepo.listLive.mockImplementation(async () => ({
    status: "ok",
    rows: [...rows],
  }));
  writes = {
    insert: vi.fn<EventsRepo["insert"]>(async (input: NewEvent) => {
      serial += 1;
      const row: Event = {
        ...input,
        id: `20000000-0000-4000-8000-${String(serial).padStart(12, "0")}`,
        deletedAt: null,
        createdAt: STAMP,
        updatedAt: STAMP,
      };
      rows.push(row);
      return { status: "ok", row };
    }),
    update: vi.fn<EventsRepo["update"]>(async (id, patch) => {
      const index = rows.findIndex((r) => r.id === id);
      const row = { ...(rows[index] as Event), ...patch };
      rows[index] = row;
      return { status: "ok", row };
    }),
  };
}

function renderSheetPage(path: string, now: Date = NOW) {
  const user = userEvent.setup();
  const kinds: KindsStore = createKindsStore(kindsRepo);
  const events: EventsStore = createEventsStore(eventsRepo);
  const page = (
    <CalendarPage
      kinds={kinds}
      events={events}
      now={() => now}
      actions={actionsOver(events)}
    />
  );
  render(
    <MemoryRouter initialEntries={[path]}>
      <header>
        <CalendarToolbar now={() => now} />
      </header>
      <main>
        <Routes>
          <Route path="/" element={page} />
          <Route path="/month/:ym" element={page} />
          <Route path="/week/:date" element={page} />
          <Route path="/day/:date" element={page} />
        </Routes>
      </main>
      <RouteFocus />
      <Where />
    </MemoryRouter>,
  );
  return { user, events };
}

const titleInput = () => screen.getByRole("textbox", { name: "Title" });
const dateField = (label: string) => screen.getByLabelText(label);

async function expectNewAllDay(date: string): Promise<void> {
  const dialog = await screen.findByRole("dialog", { name: "New event" });
  await waitFor(() => expect(titleInput()).toHaveFocus());
  expect(
    within(dialog).getByRole("switch", { name: "All day" }),
  ).toHaveAttribute("aria-checked", "true");
  expect(dateField("Start date")).toHaveValue(date);
  expect(dateField("End date")).toHaveValue(date);
  expect(screen.queryByLabelText("Start time")).toBeNull();
}

async function expectNewTimed(
  date: string,
  start: string,
  end: string,
): Promise<void> {
  const dialog = await screen.findByRole("dialog", { name: "New event" });
  await waitFor(() => expect(titleInput()).toHaveFocus());
  expect(
    within(dialog).getByRole("switch", { name: "All day" }),
  ).toHaveAttribute("aria-checked", "false");
  expect(dateField("Start date")).toHaveValue(date);
  expect(dateField("Start time")).toHaveValue(start);
  expect(dateField("End date")).toHaveValue(date);
  expect(dateField("End time")).toHaveValue(end);
}

const swim15 = () =>
  timed("Swim", new Date(2026, 9, 15, 7, 0), new Date(2026, 9, 15, 8, 0));

describe("opening a new event from the month (CAL-012 AC-1, Block 7, PO decision 4)", () => {
  it.each([1280, 768])(
    'at %ipx a click on an empty 15 October opens "New event", all day on the 15th, Title focused, and stays on the month',
    async (width) => {
      media.set({ width });
      useWrites();
      const { user } = renderSheetPage("/month/2026-10");
      const grid = await settledGrid("October 2026");
      await user.click(monthCell(grid, "Thursday 15 October"));
      await expectNewAllDay("2026-10-15");
      expect(at()).toBe("at /month/2026-10");
    },
  );

  it.each(["{Enter}", " "])(
    '%j on the focused, empty 14 October opens "New event" all day on the 14th',
    async (key) => {
      useWrites();
      const { user } = renderSheetPage("/month/2026-10");
      const grid = await settledGrid("October 2026");
      monthCell(grid, "Wednesday 14 October").focus();
      await user.keyboard(key);
      await expectNewAllDay("2026-10-14");
    },
  );

  it("a click on 15 October WITH events opens /day/2026-10-15 instead, and no sheet", async () => {
    useWrites([swim15()]);
    const { user } = renderSheetPage("/month/2026-10");
    const grid = await settledGrid("October 2026");
    await screen.findByRole("button", { name: "Swim, Gym, 07:00 to 08:00" });
    await user.click(monthCell(grid, "Thursday 15 October"));
    await waitFor(() => expect(at()).toBe("at /day/2026-10-15"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ArrowRight to 15 October (with events), then Enter, opens its day view", async () => {
    useWrites([swim15()]);
    const { user } = renderSheetPage("/month/2026-10");
    const grid = await settledGrid("October 2026");
    await screen.findByRole("button", { name: "Swim, Gym, 07:00 to 08:00" });
    monthCell(grid, "Wednesday 14 October").focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() =>
      expect(monthCell(grid, "Thursday 15 October")).toHaveFocus(),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(at()).toBe("at /day/2026-10-15"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it('the empty month\'s "or add an event" opens "New event" all day on the selected day', async () => {
    useWrites();
    const { user } = renderSheetPage("/month/2026-10");
    await settledGrid("October 2026");
    await user.click(
      await screen.findByRole("button", { name: "or add an event" }),
    );
    await expectNewAllDay("2026-10-14");
  });

  it("on the phone a tap on an empty day only selects it; the day list's Add opens the sheet for it", async () => {
    media.set({ width: 375 });
    useWrites();
    const { user } = renderSheetPage("/month/2026-10");
    const grid = await settledGrid("October 2026");
    await user.click(monthCell(grid, "Thursday 15 October"));
    expect(monthCell(grid, "Thursday 15 October")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    const list = await screen.findByRole("region", {
      name: "Events on Thu 15 Oct",
    });
    await user.click(within(list).getByRole("button", { name: "Add" }));
    await expectNewAllDay("2026-10-15");
  });

  it("on the phone a tap on a day with events selects it and stays on the month", async () => {
    media.set({ width: 375 });
    useWrites([swim15()]);
    const { user } = renderSheetPage("/month/2026-10");
    const grid = await settledGrid("October 2026");
    await user.click(monthCell(grid, "Thursday 15 October"));
    await screen.findByRole("region", { name: "Events on Thu 15 Oct" });
    expect(at()).toBe("at /month/2026-10");
    expect(screen.queryByRole("dialog")).toBeNull();
    // Not vacuous: the day list's chip does open the sheet on the phone.
    await user.click(screen.getByRole("button", { name: /^Swim, / }));
    await screen.findByRole("dialog", { name: "Edit event: Swim" });
  });
});

describe("opening a new event from a time grid (CAL-012 AC-1, Block 7)", () => {
  it('a click on Thursday 15 October, 14:00 in the week opens a 1-hour "New event" 14:00 - 15:00', async () => {
    useWrites();
    const { user } = renderSheetPage("/week/2026-10-14");
    const grid = await settledGrid("Week of 12 October 2026");
    await user.click(
      within(grid).getByRole("gridcell", {
        name: "Thursday 15 October, 14:00",
      }),
    );
    await expectNewTimed("2026-10-15", "14:00", "15:00");
    expect(at()).toBe("at /week/2026-10-14");
  });

  it("Enter on the week's tab stop - the selected day's 09:00 - opens 09:00 - 10:00 on that day", async () => {
    useWrites();
    const { user } = renderSheetPage("/week/2026-10-14");
    const grid = await settledGrid("Week of 12 October 2026");
    const stop = within(grid).getByRole("gridcell", {
      name: "Wednesday 14 October, 09:00",
    });
    expect(stop).toHaveAttribute("tabindex", "0");
    stop.focus();
    await user.keyboard("{Enter}");
    await expectNewTimed("2026-10-14", "09:00", "10:00");
  });

  it("a click on 23:00 in the day view ends at midnight the next day", async () => {
    useWrites();
    const { user } = renderSheetPage("/day/2026-10-14");
    const grid = await settledGrid("Wednesday 14 October 2026");
    await user.click(
      within(grid).getByRole("gridcell", {
        name: "Wednesday 14 October, 23:00",
      }),
    );
    await screen.findByRole("dialog", { name: "New event" });
    expect(dateField("Start date")).toHaveValue("2026-10-14");
    expect(dateField("Start time")).toHaveValue("23:00");
    expect(dateField("End date")).toHaveValue("2026-10-15");
    expect(dateField("End time")).toHaveValue("00:00");
  });
});

describe("N opens a new all-day event on the selected day (CAL-012 AC-1, PO decision 3)", () => {
  it.each(["n", "N"])(
    '%s on the month opens "New event" all day on today, the selection',
    async (key) => {
      useWrites();
      const { user } = renderSheetPage("/month/2026-10");
      await settledGrid("October 2026");
      await user.keyboard(key);
      await expectNewAllDay("2026-10-14");
    },
  );

  it("after ArrowRight to 15 October, n opens it on the 15th", async () => {
    useWrites();
    const { user } = renderSheetPage("/month/2026-10");
    const grid = await settledGrid("October 2026");
    monthCell(grid, "Wednesday 14 October").focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() =>
      expect(monthCell(grid, "Thursday 15 October")).toHaveFocus(),
    );
    await user.keyboard("n");
    await expectNewAllDay("2026-10-15");
  });

  it("n in the week of a selected 16 October opens it all day on the 16th", async () => {
    useWrites();
    const { user } = renderSheetPage("/week/2026-10-16");
    await settledGrid("Week of 12 October 2026");
    await user.keyboard("n");
    await expectNewAllDay("2026-10-16");
  });

  it("n typed into the sheet's Title is a letter: one sheet, the title reads it", async () => {
    useWrites();
    const { user } = renderSheetPage("/month/2026-10");
    await settledGrid("October 2026");
    await user.keyboard("n");
    await expectNewAllDay("2026-10-14");
    await user.keyboard("Run n");
    expect(titleInput()).toHaveValue("Run n");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("Ctrl+N is not N: no sheet; the bare key then opens one", async () => {
    useWrites();
    const { user } = renderSheetPage("/month/2026-10");
    await settledGrid("October 2026");
    await user.keyboard("{Control>}n{/Control}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.keyboard("n");
    await screen.findByRole("dialog", { name: "New event" });
  });
});

describe("opening an existing event (CAL-012 AC-5, Block 7)", () => {
  it('a click on a month chip opens "Edit event: Swim" with Close focused - and does not open the day view', async () => {
    useWrites([swim15()]);
    const { user } = renderSheetPage("/month/2026-10");
    const chip = await screen.findByRole("button", {
      name: "Swim, Gym, 07:00 to 08:00",
    });
    await user.click(chip);
    await screen.findByRole("dialog", { name: "Edit event: Swim" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Close" })).toHaveFocus(),
    );
    expect(titleInput()).toHaveValue("Swim");
    expect(at()).toBe("at /month/2026-10");
  });

  it('a click on a week block opens "Edit event: Swim"', async () => {
    useWrites([swim15()]);
    const { user } = renderSheetPage("/week/2026-10-14");
    await user.click(
      await screen.findByRole("button", { name: "Swim, Gym, 07:00 to 08:00" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Edit event: Swim" }),
    ).toBeInTheDocument();
  });

  it("a view key pressed on the sheet's focused Close does not switch view", async () => {
    useWrites([swim15()]);
    const { user } = renderSheetPage("/week/2026-10-14");
    await user.click(
      await screen.findByRole("button", { name: "Swim, Gym, 07:00 to 08:00" }),
    );
    const close = await screen.findByRole("button", { name: "Close" });
    await waitFor(() => expect(close).toHaveFocus());
    await user.keyboard("m");
    expect(at()).toBe("at /week/2026-10-14");
    expect(
      screen.getByRole("dialog", { name: "Edit event: Swim" }),
    ).toBeInTheDocument();
  });

  it("saving a title change sends updateEvent with just the title, and the chip follows", async () => {
    const swim = swim15();
    useWrites([swim]);
    const { user } = renderSheetPage("/month/2026-10");
    await user.click(
      await screen.findByRole("button", { name: "Swim, Gym, 07:00 to 08:00" }),
    );
    await screen.findByRole("dialog", { name: "Edit event: Swim" });
    await user.type(titleInput(), " laps");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(writes.update).toHaveBeenCalledTimes(1);
    expect(writes.update.mock.calls[0]).toStrictEqual([
      swim.id,
      { title: "Swim laps" },
      STAMP,
    ]);
    expect(
      await screen.findByRole("button", {
        name: "Swim laps, Gym, 07:00 to 08:00",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("saving and closing through the page (CAL-012 AC-4, AC-6, Block 7)", () => {
  it("a new event saved from an empty 15 October appears as its chip, and the sheet closes", async () => {
    useWrites();
    const { user } = renderSheetPage("/month/2026-10");
    const grid = await settledGrid("October 2026");
    await user.click(monthCell(grid, "Thursday 15 October"));
    await screen.findByRole("dialog", { name: "New event" });
    await user.type(titleInput(), "Hotel");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(writes.insert).toHaveBeenCalledTimes(1);
    expect(writes.insert.mock.calls[0]?.[0]).toStrictEqual({
      title: "Hotel",
      kindId: GYM.id,
      startsAt: new Date(2026, 9, 15),
      endsAt: new Date(2026, 9, 16),
      allDay: true,
      location: null,
      notes: null,
      origin: "manual",
      recurrence: null,
      captureJobId: null,
    });
    expect(
      await within(monthCell(grid, "Thursday 15 October")).findByRole(
        "button",
        { name: "Hotel, Gym, all day" },
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem("cc.lastKind")).toBe(GYM.id);
  });

  it("a slot event saved in the week appears as its block", async () => {
    useWrites();
    const { user } = renderSheetPage("/week/2026-10-14");
    const grid = await settledGrid("Week of 12 October 2026");
    await user.click(
      within(grid).getByRole("gridcell", { name: "Friday 16 October, 18:00" }),
    );
    await screen.findByRole("dialog", { name: "New event" });
    await user.type(titleInput(), "Lift");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByRole("button", { name: "Lift, Gym, 18:00 to 19:00" }),
    ).toBeInTheDocument();
  });

  it("Close on a clean sheet returns focus to the month cell that opened it", async () => {
    useWrites();
    const { user } = renderSheetPage("/month/2026-10");
    const grid = await settledGrid("October 2026");
    await user.click(monthCell(grid, "Thursday 15 October"));
    await screen.findByRole("dialog", { name: "New event" });
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() =>
      expect(monthCell(grid, "Thursday 15 October")).toHaveFocus(),
    );
  });

  it("Close on a clean edit returns focus to the chip that opened it", async () => {
    useWrites([swim15()]);
    const { user } = renderSheetPage("/week/2026-10-14");
    const chip = await screen.findByRole("button", {
      name: "Swim, Gym, 07:00 to 08:00",
    });
    await user.click(chip);
    await screen.findByRole("dialog", { name: "Edit event: Swim" });
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(chip).toHaveFocus());
  });

  it('a dirty sheet asks "Discard changes?" before closing; Discard closes it and saves nothing', async () => {
    useWrites();
    const { user } = renderSheetPage("/month/2026-10");
    const grid = await settledGrid("October 2026");
    await user.click(monthCell(grid, "Thursday 15 October"));
    await screen.findByRole("dialog", { name: "New event" });
    await user.type(titleInput(), "Hotel");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    const confirm = await screen.findByRole("dialog", {
      name: "Discard changes?",
    });
    await user.click(within(confirm).getByRole("button", { name: "Discard" }));
    expect(screen.queryByRole("dialog", { name: "New event" })).toBeNull();
    expect(writes.insert).not.toHaveBeenCalled();
  });
});
