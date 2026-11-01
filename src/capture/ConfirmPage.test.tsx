import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse } from "msw";
import type { JSX } from "react";
import {
  createMemoryRouter,
  Outlet,
  RouterProvider,
  useLocation,
} from "react-router";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import type { CaptureResponse, Proposal } from "../../shared/captureSchema";
import { RouteFocus } from "../app/routes";
import type { CaptureJobsRepo } from "../data/captureJobs";
import type { Kind } from "../data/rows";
import { END_ERROR } from "../domain/eventForm";
import type { SeedRepo } from "../kinds/seedKinds";
import type { EventActions } from "../sync/eventActions";
import { createKindsStore, type KindsStore } from "../sync/kindsStore";
import { installMatchMedia } from "../test/media";
import { installServer, onTable } from "../test/msw";
import { ToastHost, ToastProvider } from "../ui/Toast";
import type { CaptureHandoff } from "./captureClient";
import { CapturePage } from "./CapturePage";
import { ConfirmPage, proposalToFormValue } from "./ConfirmPage";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-020 Contract, Block 4 (AC-5 to AC-7). The page at /capture/confirm in
// a memory router, its router state built per CaptureHandoff (Block 1), with:
//   * `actions`: vi.fn stubs; createEvent records its input and resolves
//     { status: "ok", row } (EventSheet.test.tsx's shape);
//   * `jobs`: a vi.fn setStatus stub - except in the non-persistence test,
//     which uses the default `captureJobs` over the mocked supabase client
//     and MSW, so the PATCH body itself is observed;
//   * `kinds`: the real createKindsStore over a vi.fn repo (as
//     CalendarPage.test.tsx does). It starts "loading" and becomes ready a
//     tick later, as the app's cached store does - so the kind lookup has to
//     survive kinds that arrive after the first render.
// The navigation targets are routes rendering useLocation(), so the path and
// `state.focusEventId` are read off the screen; /capture is the REAL
// CapturePage, so "renders empty" after Discard is the real page. The toast
// is the real ToastProvider + ToastHost. Every instant is built with the
// local-time constructor unless a test names a zone. SETTLED: the copy
// (voice.md, Confirm screen) and origin "capture" + captureJobId.

installServer();

const STAMP = "2026-10-16T08:00:00.000001+00:00";
const JOB_ID = "0b6c2a7e-3f4d-4c1a-9e2b-7d8f9a0b1c2d";
const NEW_ID = "10000000-0000-4000-8000-000000000099";

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
const DINING = kind(2, "Dining");
const TRAVEL = kind(3, "Travel");
const GARDENING = kind(4, "Gardening", { deletedAt: STAMP });

/** Local time on a day of November 2026. */
const nov = (date: number, hour = 0, minute = 0) =>
  new Date(2026, 10, date, hour, minute);

const PROPOSAL: Proposal = {
  title: "Dinner at Lupa",
  startsAt: nov(3, 19, 30).toISOString(),
  endsAt: null,
  allDay: false,
  location: "Lupa, Via Roma 1",
  kindName: "Dining",
};

function handoff(
  proposal: Partial<Proposal> = {},
  source: CaptureHandoff["source"] = {
    kind: "text",
    text: "Table for two at Lupa, Tue 3 Nov 19:30",
  },
): CaptureHandoff {
  const response: CaptureResponse = {
    proposal: { ...PROPOSAL, ...proposal },
    confidence: {},
    missing: [],
    jobId: JOB_ID,
  };
  return { response, source };
}

type FakeActions = {
  createEvent: Mock<EventActions["createEvent"]>;
  updateEvent: Mock<EventActions["updateEvent"]>;
  removeEvent: Mock<EventActions["removeEvent"]>;
  restoreEvent: Mock<EventActions["restoreEvent"]>;
};

function fakeActions(): FakeActions {
  return {
    createEvent: vi.fn<EventActions["createEvent"]>(async (input) => ({
      status: "ok",
      row: {
        ...input,
        id: NEW_ID,
        deletedAt: null,
        createdAt: STAMP,
        updatedAt: STAMP,
      },
    })),
    updateEvent: vi.fn<EventActions["updateEvent"]>(),
    removeEvent: vi.fn<EventActions["removeEvent"]>(),
    restoreEvent: vi.fn<EventActions["restoreEvent"]>(),
  };
}

type FakeJobs = { setStatus: Mock<CaptureJobsRepo["setStatus"]> };

function fakeJobs(): FakeJobs {
  return {
    setStatus: vi.fn<CaptureJobsRepo["setStatus"]>(async (id, status) => ({
      status: "ok",
      row: { id, status },
    })),
  };
}

function kindsStoreOf(rows: Kind[]): KindsStore {
  const repo: SeedRepo = {
    listAll: vi.fn<SeedRepo["listAll"]>(async () => ({ status: "ok", rows })),
    insertMany: vi.fn<SeedRepo["insertMany"]>(),
  };
  return createKindsStore(repo);
}

/** A navigation target: where we are, and the router state we came with. */
function Where(): JSX.Element {
  const { pathname, state } = useLocation();
  return (
    <>
      <p data-testid="where">{pathname}</p>
      <p data-testid="state">{JSON.stringify(state ?? null)}</p>
    </>
  );
}

function renderConfirm(
  opts: {
    state?: CaptureHandoff | null;
    actions?: FakeActions;
    jobs?: FakeJobs | null;
    kinds?: Kind[];
    toast?: boolean;
  } = {},
) {
  const user = userEvent.setup();
  const actions = opts.actions ?? fakeActions();
  const jobs = opts.jobs === null ? undefined : (opts.jobs ?? fakeJobs());
  const kinds = kindsStoreOf(opts.kinds ?? [GYM, DINING, TRAVEL]);
  const state = opts.state === undefined ? handoff() : opts.state;
  const router = createMemoryRouter(
    [
      {
        path: "/capture/confirm",
        element: <ConfirmPage actions={actions} jobs={jobs} kinds={kinds} />,
      },
      {
        path: "/capture",
        element: <CapturePage propose={vi.fn()} downscale={vi.fn()} />,
      },
      { path: "/month/:ym", element: <Where /> },
      { path: "/week/:date", element: <Where /> },
      { path: "/day/:date", element: <Where /> },
    ],
    {
      initialEntries: [
        state === null
          ? "/capture/confirm"
          : { pathname: "/capture/confirm", state },
      ],
    },
  );
  const app = <RouterProvider router={router} />;
  render(
    opts.toast === false ? (
      app
    ) : (
      <ToastProvider>
        {app}
        <ToastHost />
      </ToastProvider>
    ),
  );
  return { user, actions, jobs, router };
}

const titleBox = () => screen.getByRole("textbox", { name: "Title" });
const saveButton = () => screen.getByRole("button", { name: "Save event" });
const discardButton = () => screen.getByRole("button", { name: "Discard" });
const kindTrigger = () => screen.getByRole("button", { name: /^Kind,/ });
const field = (label: string) => screen.getByLabelText(label) as HTMLElement;
const where = () => screen.getByTestId("where").textContent;
const routerState = () =>
  JSON.parse(screen.getByTestId("state").textContent ?? "null");

/** The form once the kinds have loaded and the proposal's kind is shown. */
async function formReady(kindName = "Dining"): Promise<void> {
  await waitFor(() =>
    expect(kindTrigger()).toHaveAccessibleName(`Kind, ${kindName}`),
  );
}

/** Let pending promise callbacks and the renders they cause run. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

/**
 * Run `fn` with the process in time zone `tz` (vitest's default forks pool: a
 * child process, not a thread). Restored to the zone NAME in force before, never by
 * deleting TZ: measured in RED (Node, Windows), deleting it leaves the last
 * zone cached, so every later test in the file would run in `tz`.
 */
function inZone<T>(tz: string, fn: () => T): T {
  const before =
    process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    process.env.TZ = before;
  }
}

let media: ReturnType<typeof installMatchMedia>;

beforeEach(() => {
  media = installMatchMedia({ width: 1280, colorScheme: "light" });
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  media.restore();
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("proposalToFormValue: the form's first value (AC-7, Block 4)", () => {
  const NOW = new Date(2026, 9, 26, 14, 20, 30);
  const KINDS = [GYM, DINING, TRAVEL];

  it("a full proposal: title, kind, dates, times and location; notes empty", () => {
    expect(
      proposalToFormValue(
        { ...PROPOSAL, endsAt: nov(3, 21, 0).toISOString() },
        KINDS,
        NOW,
      ),
    ).toStrictEqual({
      title: "Dinner at Lupa",
      kindId: DINING.id,
      allDay: false,
      startDate: "2026-11-03",
      startTime: "19:30",
      endDate: "2026-11-03",
      endTime: "21:00",
      location: "Lupa, Via Roma 1",
      notes: "",
      repeat: "none",
      repeatEnds: "never",
      repeatUntil: "",
    });
  });

  it("the kind is matched by name after trim and lower-case on both sides", () => {
    const value = proposalToFormValue(
      { ...PROPOSAL, kindName: "  dINING " },
      [GYM, kind(2, " Dining "), TRAVEL],
      NOW,
    );
    expect(value.kindId).toBe(DINING.id);
  });

  it("an unknown kind name is no kind: null", () => {
    expect(
      proposalToFormValue({ ...PROPOSAL, kindName: "Opera" }, KINDS, NOW)
        .kindId,
    ).toBeNull();
  });

  it("a null kind name is no kind: null", () => {
    expect(
      proposalToFormValue({ ...PROPOSAL, kindName: null }, KINDS, NOW).kindId,
    ).toBeNull();
  });

  it("a soft-deleted kind of that name is not the live kind: null", () => {
    expect(
      proposalToFormValue(
        { ...PROPOSAL, kindName: "Gardening" },
        [...KINDS, GARDENING],
        NOW,
      ).kindId,
    ).toBeNull();
  });

  it('a null title and a null location become ""', () => {
    const value = proposalToFormValue(
      { ...PROPOSAL, title: null, location: null },
      KINDS,
      NOW,
    );
    expect([value.title, value.location, value.notes]).toStrictEqual([
      "",
      "",
      "",
    ]);
  });

  it("a timed proposal with no end ends one hour after its start", () => {
    const value = proposalToFormValue(PROPOSAL, KINDS, NOW);
    expect([
      value.startDate,
      value.startTime,
      value.endDate,
      value.endTime,
    ]).toStrictEqual(["2026-11-03", "19:30", "2026-11-03", "20:30"]);
  });

  it("an end one hour past start crosses midnight onto the next day", () => {
    const value = proposalToFormValue(
      { ...PROPOSAL, startsAt: nov(3, 23, 30).toISOString() },
      KINDS,
      NOW,
    );
    expect([value.endDate, value.endTime]).toStrictEqual([
      "2026-11-04",
      "00:30",
    ]);
  });

  it.each([
    ["before the start", () => nov(3, 18, 0).toISOString()],
    ["equal to the start", () => nov(3, 19, 30).toISOString()],
    ["unparseable", () => "next Tuesday-ish"],
  ])("an end %s is replaced by start + 1 h", (_label, end) => {
    const value = proposalToFormValue(
      { ...PROPOSAL, endsAt: end() },
      KINDS,
      NOW,
    );
    expect([value.endDate, value.endTime]).toStrictEqual([
      "2026-11-03",
      "20:30",
    ]);
  });

  it.each([
    ["null", null],
    ["unparseable", "sometime soon"],
  ])(
    "a %s start is now rounded up to the next whole hour, ending an hour later",
    (_label, start) => {
      const value = proposalToFormValue(
        { ...PROPOSAL, startsAt: start, endsAt: null },
        KINDS,
        NOW,
      );
      expect([
        value.startDate,
        value.startTime,
        value.endDate,
        value.endTime,
      ]).toStrictEqual(["2026-10-26", "15:00", "2026-10-26", "16:00"]);
    },
  );

  it("the next whole hour after 23:20 is 00:00 the next day", () => {
    const value = proposalToFormValue(
      { ...PROPOSAL, startsAt: null },
      KINDS,
      new Date(2026, 9, 26, 23, 20),
    );
    expect([value.startDate, value.startTime]).toStrictEqual([
      "2026-10-27",
      "00:00",
    ]);
  });

  it("an all-day proposal with no end is that one day", () => {
    const value = proposalToFormValue(
      {
        ...PROPOSAL,
        allDay: true,
        startsAt: nov(3).toISOString(),
        endsAt: null,
      },
      KINDS,
      NOW,
    );
    expect([value.allDay, value.startDate, value.endDate]).toStrictEqual([
      true,
      "2026-11-03",
      "2026-11-03",
    ]);
  });

  it('an all-day date-only start ("2026-11-03") is 3 November even west of UTC (Los Angeles), not 2 November (RED amendment to Block 4)', () => {
    const value = inZone("America/Los_Angeles", () =>
      proposalToFormValue(
        { ...PROPOSAL, allDay: true, startsAt: "2026-11-03", endsAt: null },
        KINDS,
        NOW,
      ),
    );
    expect([value.allDay, value.startDate, value.endDate]).toStrictEqual([
      true,
      "2026-11-03",
      "2026-11-03",
    ]);
  });

  it("a date-time with an offset is shown in local time (Rome, +01:00 in November: 19:30)", () => {
    const value = inZone("Europe/Rome", () =>
      proposalToFormValue(
        { ...PROPOSAL, startsAt: "2026-11-03T19:30:00+01:00", endsAt: null },
        KINDS,
        new Date(2026, 9, 26, 14, 0),
      ),
    );
    expect([value.startDate, value.startTime, value.endTime]).toStrictEqual([
      "2026-11-03",
      "19:30",
      "20:30",
    ]);
  });
});

describe("no handoff in router state (Block 4 as amended by the Lead PO; Block 8)", () => {
  it('a visit with no state shows the heading "Check the details" and "Nothing to confirm. Start from Capture.", with Capture linking to /capture', () => {
    renderConfirm({ state: null, toast: false });
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent(/^Check the details$/);
    expect(h1).toHaveAttribute("tabindex", "-1");
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(
      /^Nothing to confirm\. Start from Capture\.$/,
    );
    expect(
      within(status).getByRole("link", { name: "Capture" }),
    ).toHaveAttribute("href", "/capture");
  });

  it("a visit with no state renders no form and no buttons, and writes nothing", async () => {
    const { actions, jobs } = renderConfirm({ state: null, toast: false });
    await settle();
    expect(screen.getByRole("status")).toHaveTextContent(/^Nothing to confirm/);
    expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save event" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
    expect(actions.createEvent).not.toHaveBeenCalled();
    expect(jobs?.setStatus).not.toHaveBeenCalled();
  });
});

describe("the confirm form (AC-7, Block 4)", () => {
  it('shows the heading "Check the details" and the proposal in the event form', async () => {
    renderConfirm();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Check the details$/,
    );
    await formReady();
    expect(titleBox()).toHaveValue("Dinner at Lupa");
    expect(field("Start date")).toHaveValue("2026-11-03");
    expect(field("Start time")).toHaveValue("19:30");
    expect(field("End date")).toHaveValue("2026-11-03");
    expect(field("End time")).toHaveValue("20:30");
    expect(field("Location")).toHaveValue("Lupa, Via Roma 1");
    expect(field("Notes")).toHaveValue("");
    expect(screen.getByRole("switch", { name: "All day" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("the kind picker shows the live kind of the proposal's kindName, matched case-insensitively", async () => {
    renderConfirm({ state: handoff({ kindName: " dining" }) });
    await formReady("Dining");
  });

  it("with no matching kind, the picker shows nothing chosen", async () => {
    const { user } = renderConfirm({ state: handoff({ kindName: "Opera" }) });
    // The kinds have loaded once an option list can be opened with them.
    await user.click(kindTrigger());
    expect(
      await screen.findByRole("option", { name: "Dining" }),
    ).toHaveAttribute("aria-selected", "false");
    expect(
      within(screen.getByRole("listbox")).queryAllByRole("option", {
        selected: true,
      }),
    ).toHaveLength(0);
    expect(kindTrigger()).toHaveAccessibleName("Kind,");
  });

  it("every field stays editable: title, kind, all day, dates, times, location, notes", async () => {
    const { user } = renderConfirm();
    await formReady();
    for (const label of [
      "Title",
      "Start date",
      "Start time",
      "End date",
      "End time",
      "Location",
      "Notes",
    ]) {
      expect(field(label)).not.toHaveAttribute("readonly");
      expect(field(label)).not.toBeDisabled();
    }
    await user.clear(titleBox());
    await user.type(titleBox(), "Dinner with Sam");
    expect(titleBox()).toHaveValue("Dinner with Sam");
    await user.click(kindTrigger());
    await user.click(screen.getByRole("option", { name: "Travel" }));
    expect(kindTrigger()).toHaveAccessibleName("Kind, Travel");
    await user.click(screen.getByRole("switch", { name: "All day" }));
    expect(screen.getByRole("switch", { name: "All day" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it('the buttons are "Discard" (type=button) then "Save event" (type=submit)', async () => {
    renderConfirm();
    await formReady();
    const discard = discardButton();
    const save = saveButton();
    expect(discard).toHaveAttribute("type", "button");
    expect(save).toHaveAttribute("type", "submit");
    expect(
      discard.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('"Save event" is aria-disabled="true" (not disabled) while the title is blank, and a click then saves nothing', async () => {
    const { user, actions } = renderConfirm({
      state: handoff({ title: null }),
    });
    await formReady();
    expect(saveButton()).toHaveAttribute("aria-disabled", "true");
    expect(saveButton()).not.toHaveAttribute("disabled");
    await user.click(saveButton());
    await settle();
    expect(actions.createEvent).not.toHaveBeenCalled();
    await user.type(titleBox(), "Dinner");
    expect(saveButton()).not.toHaveAttribute("aria-disabled", "true");
  });
});

describe('"Show what was captured" (AC-7, Block 4)', () => {
  const TEXT = "Table for two at Lupa, Tue 3 Nov 19:30";

  /** Collapsed: the region is `hidden` (Block 4), or - equally unseen - not rendered. */
  const expectNotShown = (text: string) => {
    const el = screen.queryByText(text);
    if (el !== null) expect(el).not.toBeVisible();
  };

  it("is collapsed at first: aria-expanded false and the region hidden", async () => {
    renderConfirm();
    await formReady();
    const toggle = screen.getByRole("button", {
      name: "Show what was captured",
    });
    expect(toggle).toHaveAttribute("type", "button");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expectNotShown(TEXT);
  });

  it('reveals the original text in a <pre>, and becomes "Hide what was captured"; pressed again it collapses', async () => {
    const { user } = renderConfirm();
    await formReady();
    await user.click(
      screen.getByRole("button", { name: "Show what was captured" }),
    );
    const hide = screen.getByRole("button", { name: "Hide what was captured" });
    expect(hide).toHaveAttribute("aria-expanded", "true");
    const pre = screen.getByText(TEXT);
    expect(pre.tagName).toBe("PRE");
    expect(pre).toBeVisible();
    await user.click(hide);
    expect(
      screen.getByRole("button", { name: "Show what was captured" }),
    ).toHaveAttribute("aria-expanded", "false");
    expectNotShown(TEXT);
  });

  it('reveals an image source as <img alt="The screenshot you captured"> from its data URL', async () => {
    const dataUrl = "data:image/jpeg;base64,/9j/4AAQ";
    const { user } = renderConfirm({
      state: handoff({}, { kind: "image", dataUrl, mime: "image/jpeg" }),
    });
    await formReady();
    await user.click(
      screen.getByRole("button", { name: "Show what was captured" }),
    );
    const img = screen.getByRole("img", {
      name: "The screenshot you captured",
    });
    expect(img).toHaveAttribute("src", dataUrl);
    expect(img).toBeVisible();
  });

  it("is not persisted: after viewing and saving, no web storage holds it and no PostgREST body carries it", async () => {
    const patches = onTable("capture_jobs", () =>
      HttpResponse.json([{ id: JOB_ID, status: "confirmed" }]),
    );
    const { user, actions } = renderConfirm({ jobs: null });
    await formReady();
    await user.click(
      screen.getByRole("button", { name: "Show what was captured" }),
    );
    await user.click(saveButton());
    await waitFor(() => expect(where()).toBe("/month/2026-11"));

    const stored = [localStorage, sessionStorage].flatMap((s) =>
      Object.keys(s).map((k) => `${k}=${s.getItem(k)}`),
    );
    expect(stored.filter((kv) => kv.includes("Table for two"))).toStrictEqual(
      [],
    );
    // The job is updated through the default captureJobs: one PATCH of
    // {status} and nothing else.
    expect(patches.map((r) => [r.method, r.body])).toStrictEqual([
      ["PATCH", { status: "confirmed" }],
    ]);
    expect(JSON.stringify(actions.createEvent.mock.calls)).not.toContain(
      "Table for two",
    );
  });
});

describe('"Save event" (AC-5, Block 4)', () => {
  it('creates the event with the proposal\'s values, origin "capture" and the job id', async () => {
    const { user, actions } = renderConfirm();
    await formReady();
    await user.click(saveButton());
    await waitFor(() => expect(actions.createEvent).toHaveBeenCalledTimes(1));
    expect(actions.createEvent.mock.calls[0]?.[0]).toStrictEqual({
      title: "Dinner at Lupa",
      kindId: DINING.id,
      startsAt: nov(3, 19, 30),
      endsAt: nov(3, 20, 30),
      allDay: false,
      location: "Lupa, Via Roma 1",
      notes: null,
      origin: "capture",
      recurrence: null,
      captureJobId: JOB_ID,
    });
  });

  it("saves the EDITED values, not the proposal's", async () => {
    const { user, actions } = renderConfirm();
    await formReady();
    await user.clear(titleBox());
    await user.type(titleBox(), "Dinner with Sam");
    await user.click(kindTrigger());
    await user.click(screen.getByRole("option", { name: "Gym" }));
    fireEvent.change(field("End time"), { target: { value: "22:00" } });
    await user.clear(field("Location"));
    await user.type(field("Notes"), "Window table");
    await user.click(saveButton());
    await waitFor(() => expect(actions.createEvent).toHaveBeenCalledTimes(1));
    expect(actions.createEvent.mock.calls[0]?.[0]).toStrictEqual({
      title: "Dinner with Sam",
      kindId: GYM.id,
      startsAt: nov(3, 19, 30),
      endsAt: nov(3, 22, 0),
      allDay: false,
      location: null,
      notes: "Window table",
      origin: "capture",
      recurrence: null,
      captureJobId: JOB_ID,
    });
  });

  it("then marks the job confirmed, after the event is created", async () => {
    const { user, actions, jobs } = renderConfirm();
    await formReady();
    await user.click(saveButton());
    await waitFor(() => expect(jobs?.setStatus).toHaveBeenCalledTimes(1));
    expect(jobs?.setStatus.mock.calls[0]).toStrictEqual([JOB_ID, "confirmed"]);
    const created = actions.createEvent.mock.invocationCallOrder[0] ?? 0;
    const marked = jobs?.setStatus.mock.invocationCallOrder[0] ?? 0;
    expect(created).toBeLessThan(marked);
  });

  it("navigates to the event's month in the default (month) view, with focusEventId in router state", async () => {
    const { user } = renderConfirm();
    await formReady();
    await user.click(saveButton());
    await waitFor(() => expect(where()).toBe("/month/2026-11"));
    expect(routerState()).toStrictEqual({ focusEventId: NEW_ID });
  });

  it("navigates to the event's week (from Monday) when the last-used view is week, on desktop", async () => {
    localStorage.setItem("cc.view", "week");
    const { user } = renderConfirm();
    await formReady();
    await user.click(saveButton());
    await waitFor(() => expect(where()).toBe("/week/2026-11-02"));
    expect(routerState()).toStrictEqual({ focusEventId: NEW_ID });
  });

  it("on a phone, the week view's period starts on the event's own day", async () => {
    localStorage.setItem("cc.view", "week");
    act(() => media.set({ width: 375 }));
    const { user } = renderConfirm();
    await formReady();
    await user.click(saveButton());
    await waitFor(() => expect(where()).toBe("/week/2026-11-03"));
  });

  it("navigates to the event's day when the last-used view is day", async () => {
    localStorage.setItem("cc.view", "day");
    const { user } = renderConfirm();
    await formReady();
    await user.click(saveButton());
    await waitFor(() => expect(where()).toBe("/day/2026-11-03"));
    expect(routerState()).toStrictEqual({ focusEventId: NEW_ID });
  });

  it('shows the toast "Added Dinner at Lupa" with "View", which opens that day with the chip to focus', async () => {
    const { user } = renderConfirm();
    await formReady();
    await user.click(saveButton());
    const toast = await screen.findByText("Added Dinner at Lupa");
    const host = toast.closest('[role="status"]') as HTMLElement;
    expect(host).not.toBeNull();
    await user.click(within(host).getByRole("button", { name: "View" }));
    await waitFor(() => expect(where()).toBe("/day/2026-11-03"));
    expect(routerState()).toStrictEqual({ focusEventId: NEW_ID });
  });

  it("the toast names the SAVED title", async () => {
    const { user } = renderConfirm();
    await formReady();
    await user.clear(titleBox());
    await user.type(titleBox(), "Dinner with Sam");
    await user.click(saveButton());
    expect(
      await screen.findByText("Added Dinner with Sam"),
    ).toBeInTheDocument();
  });

  it("outside a ToastProvider it still saves and navigates", async () => {
    const { user, actions } = renderConfirm({ toast: false });
    await formReady();
    await user.click(saveButton());
    await waitFor(() => expect(where()).toBe("/month/2026-11"));
    expect(actions.createEvent).toHaveBeenCalledTimes(1);
  });

  it("a job status update that fails is ignored: the save still navigates and toasts (PO decision 5)", async () => {
    const jobs = fakeJobs();
    jobs.setStatus.mockResolvedValue({ status: "offline" });
    const { user } = renderConfirm({ jobs });
    await formReady();
    await user.click(saveButton());
    await waitFor(() => expect(where()).toBe("/month/2026-11"));
    expect(await screen.findByText("Added Dinner at Lupa")).toBeInTheDocument();
  });

  it('a refused save shows the alert "Couldn\'t save. Try again." and does nothing else', async () => {
    const actions = fakeActions();
    actions.createEvent.mockResolvedValue({
      status: "error",
      code: "42501",
      message: "denied",
      http: 403,
    });
    const { user, jobs, router } = renderConfirm({ actions });
    await formReady();
    await user.click(saveButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't save. Try again.",
    );
    expect(jobs?.setStatus).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/capture/confirm");
    expect(titleBox()).toHaveValue("Dinner at Lupa");
  });

  it("with no kind chosen it saves nothing and focuses the kind picker", async () => {
    const { user, actions, jobs } = renderConfirm({
      state: handoff({ kindName: "Opera" }),
    });
    // Wait for the kinds, so "no kind" is the proposal's doing, not loading.
    await user.click(kindTrigger());
    await screen.findByRole("option", { name: "Dining" });
    await user.keyboard("{Escape}");
    await user.click(saveButton());
    await settle();
    expect(actions.createEvent).not.toHaveBeenCalled();
    expect(jobs?.setStatus).not.toHaveBeenCalled();
    expect(kindTrigger()).toHaveFocus();
  });

  it("an end before the start shows the end error and saves nothing", async () => {
    const { user, actions } = renderConfirm();
    await formReady();
    fireEvent.change(field("End time"), { target: { value: "18:00" } });
    await user.click(saveButton());
    expect(await screen.findByText(END_ERROR)).toBeInTheDocument();
    expect(actions.createEvent).not.toHaveBeenCalled();
  });

  it("while the save is in flight, Save is aria-disabled and a second press creates nothing more", async () => {
    const actions = fakeActions();
    let release: () => void = () => {};
    actions.createEvent.mockImplementation(
      (input) =>
        new Promise((done) => {
          release = () =>
            done({
              status: "ok",
              row: {
                ...input,
                id: NEW_ID,
                deletedAt: null,
                createdAt: STAMP,
                updatedAt: STAMP,
              },
            });
        }),
    );
    const { user } = renderConfirm({ actions });
    await formReady();
    await user.click(saveButton());
    await waitFor(() =>
      expect(saveButton()).toHaveAttribute("aria-disabled", "true"),
    );
    await user.click(saveButton());
    await settle();
    expect(actions.createEvent).toHaveBeenCalledTimes(1);
    await act(async () => release());
    await waitFor(() => expect(where()).toBe("/month/2026-11"));
  });
});

describe('"Discard" (AC-6, Block 4)', () => {
  it("creates no event, marks the job discarded, and replaces the entry with an empty /capture", async () => {
    const { user, actions, jobs, router } = renderConfirm();
    await formReady();
    await user.click(discardButton());
    expect(
      await screen.findByRole("textbox", { name: "Booking email or text" }),
    ).toHaveValue("");
    expect(router.state.location.pathname).toBe("/capture");
    expect(router.state.historyAction).toBe("REPLACE");
    expect(actions.createEvent).not.toHaveBeenCalled();
    expect(jobs?.setStatus.mock.calls).toStrictEqual([[JOB_ID, "discarded"]]);
  });

  it("a job status update that fails is ignored: Discard still leaves for /capture", async () => {
    const jobs = fakeJobs();
    jobs.setStatus.mockResolvedValue({
      status: "error",
      code: "PGRST",
      message: "x",
      http: 500,
    });
    const { user, router } = renderConfirm({ jobs });
    await formReady();
    await user.click(discardButton());
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/capture"),
    );
  });

  it("nothing is created while the confirm screen merely shows (no save before Save)", async () => {
    const { actions, jobs } = renderConfirm();
    await formReady();
    await settle();
    expect(actions.createEvent).not.toHaveBeenCalled();
    expect(jobs?.setStatus).not.toHaveBeenCalled();
  });
});

// CAL-021 Contract, Block 4 (AC-2 to AC-6). The same page, now with the
// function's `confidence` and `missing` supplied (`marked` builds on
// `handoff()`, which is unchanged). SETTLED: voice.md's copy, written out by
// hand; total 5; focus missing -> low -> Title. Focus is asserted twice per
// target: in `renderConfirm`'s router, which has NO RouteFocus, and in
// `renderFocused`, which wraps the page in the app's own pathless layout
// (<Outlet /> then the real RouteFocus, routes.tsx) - so RouteFocus's <h1>
// focus lands in the same commit, after the page's own effects, as in the
// app. A summary or Save-description case renders without the toast host, so
// the page's status line is the only role="status" on screen.

const LOW_TEXT = "Not sure about this — check it";
const MISSING_TEXT = "Not found in the text — add it";

/** A handoff whose response carries the given confidence and missing list. */
function marked(
  proposal: Partial<Proposal>,
  extra: {
    confidence?: CaptureResponse["confidence"];
    missing?: CaptureResponse["missing"];
  },
): CaptureHandoff {
  const base = handoff(proposal);
  return {
    ...base,
    response: {
      ...base.response,
      confidence: extra.confidence ?? {},
      missing: extra.missing ?? [],
    },
  };
}

/** The confirm page under the app's FocusLayout: the page, then RouteFocus. */
function renderFocused(state: CaptureHandoff) {
  const user = userEvent.setup();
  const actions = fakeActions();
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <Outlet />
            <RouteFocus />
          </>
        ),
        children: [
          {
            path: "/capture/confirm",
            element: (
              <ConfirmPage
                actions={actions}
                jobs={fakeJobs()}
                kinds={kindsStoreOf([GYM, DINING, TRAVEL])}
              />
            ),
          },
        ],
      },
    ],
    { initialEntries: [{ pathname: "/capture/confirm", state }] },
  );
  render(<RouterProvider router={router} />);
  return { user, actions };
}

const summary = () => screen.getByRole("status");
const group = (name: string) => screen.getByRole("group", { name });
const stateOf = (el: HTMLElement) =>
  el.closest("[data-state]")?.getAttribute("data-state") ?? null;

describe("the status summary (AC-4, AC-5, Block 4)", () => {
  it('nothing low or missing: one role="status" line reading "Found 5 of 5 details.", after the heading and before the form', async () => {
    renderConfirm({ toast: false });
    await formReady();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    const status = summary();
    expect(status).toHaveTextContent(/^Found 5 of 5 details\.$/);
    expect(status.closest("form")).toBeNull();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(
      h1.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      status.compareDocumentPosition(titleBox()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('voice.md\'s example: kind low and end missing reads "Found 4 of 5 details. Check the kind and add the end time.", and the form is marked to match', async () => {
    renderConfirm({
      toast: false,
      state: marked({}, { confidence: { kind: 0.5 }, missing: ["endsAt"] }),
    });
    await formReady();
    expect(summary()).toHaveTextContent(
      /^Found 4 of 5 details\. Check the kind and add the end time\.$/,
    );
    // fieldStates reaches the form: Kind low, Ends missing, Title plain.
    expect(stateOf(kindTrigger())).toBe("low");
    expect(kindTrigger()).toHaveAccessibleDescription(LOW_TEXT);
    expect(group("Ends")).toHaveAttribute("data-state", "missing");
    expect(field("End date")).toHaveAccessibleDescription(MISSING_TEXT);
    expect(stateOf(titleBox())).toBeNull();
    expect(group("Starts")).not.toHaveAttribute("data-state");
  });

  it('an all-day proposal names the dates: "Check the start date and add the end date."', async () => {
    renderConfirm({
      toast: false,
      state: marked(
        { allDay: true, startsAt: "2026-11-03", endsAt: null },
        { confidence: { startsAt: 0.6 }, missing: ["endsAt"] },
      ),
    });
    await formReady();
    expect(summary()).toHaveTextContent(
      /^Found 4 of 5 details\. Check the start date and add the end date\.$/,
    );
  });

  it("the summary is the proposal's: typing into a missing Title changes neither it nor the marking (PO decision 4)", async () => {
    const { user } = renderConfirm({
      toast: false,
      state: marked({ title: null }, { missing: ["title"] }),
    });
    await formReady();
    expect(summary()).toHaveTextContent(
      /^Found 4 of 5 details\. Add the title\.$/,
    );
    await user.type(titleBox(), "Dinner");
    expect(titleBox()).toHaveValue("Dinner");
    expect(summary()).toHaveTextContent(
      /^Found 4 of 5 details\. Add the title\.$/,
    );
    expect(stateOf(titleBox())).toBe("missing");
    expect(titleBox()).toHaveAccessibleDescription(MISSING_TEXT);
  });

  it("nothing found: the summary reads the nothing-found sentence and every field is empty (AC-5)", async () => {
    const { user } = renderConfirm({
      toast: false,
      state: marked(
        {
          title: null,
          startsAt: null,
          endsAt: null,
          allDay: false,
          location: null,
          kindName: null,
        },
        { missing: ["title", "startsAt", "endsAt", "location", "kind"] },
      ),
    });
    // The kinds have loaded once the list can be opened with them.
    await user.click(kindTrigger());
    await screen.findByRole("option", { name: "Dining" });
    await user.keyboard("{Escape}");
    expect(summary()).toHaveTextContent(
      /^Couldn't find event details\. Fill them in, or try a clearer screenshot\.$/,
    );
    expect(titleBox()).toHaveValue("");
    expect(kindTrigger()).toHaveAccessibleName("Kind,");
    for (const label of [
      "Start date",
      "Start time",
      "End date",
      "End time",
      "Location",
      "Notes",
    ]) {
      expect(field(label), label).toHaveValue("");
    }
    expect(document.querySelectorAll('[data-state="missing"]')).toHaveLength(5);
  });
});

describe("a missing field opens empty, never guessed (AC-2, Block 4)", () => {
  it("a missing start and end open empty instead of the next-whole-hour and +1 h guesses; the confident title and location keep the proposal's", async () => {
    renderConfirm({
      state: marked(
        { startsAt: null, endsAt: null },
        { missing: ["startsAt", "endsAt"] },
      ),
    });
    await formReady();
    for (const label of ["Start date", "Start time", "End date", "End time"]) {
      expect(field(label), label).toHaveValue("");
    }
    expect(titleBox()).toHaveValue("Dinner at Lupa");
    expect(field("Location")).toHaveValue("Lupa, Via Roma 1");
  });

  it("a missing title and location open empty even when the proposal carries text for them; the start keeps the proposal's", async () => {
    renderConfirm({
      state: marked({}, { missing: ["title", "location"] }),
    });
    await formReady();
    expect(titleBox()).toHaveValue("");
    expect(field("Location")).toHaveValue("");
    expect(field("Start date")).toHaveValue("2026-11-03");
    expect(field("Start time")).toHaveValue("19:30");
  });

  it("a missing kind stays empty after the kinds load - the late lookup is skipped", async () => {
    const first = renderConfirm({
      toast: false,
      state: marked({ kindName: "Dining" }, { missing: ["kind"] }),
    });
    await first.user.click(kindTrigger());
    expect(
      await screen.findByRole("option", { name: "Dining" }),
    ).toHaveAttribute("aria-selected", "false");
    await first.user.keyboard("{Escape}");
    await settle();
    expect(kindTrigger()).toHaveAccessibleName("Kind,");
    expect(stateOf(kindTrigger())).toBe("missing");
  });

  it("a low kind keeps the proposal's pick once the kinds load", async () => {
    renderConfirm({
      state: marked({ kindName: "Dining" }, { confidence: { kind: 0.4 } }),
    });
    await formReady("Dining");
    expect(stateOf(kindTrigger())).toBe("low");
  });
});

describe("focus on open (AC-3, Block 4)", () => {
  const RENDERERS = [
    [
      "without RouteFocus",
      (state: CaptureHandoff) => renderConfirm({ state, toast: false }),
    ],
    [
      "after RouteFocus has focused the <h1>",
      (state: CaptureHandoff) => renderFocused(state),
    ],
  ] as const;

  const CASES: [string, () => CaptureHandoff, () => HTMLElement][] = [
    ["nothing low or missing: Title", () => handoff(), titleBox],
    [
      "a missing title: the Title input",
      () => marked({ title: null }, { missing: ["title"] }),
      titleBox,
    ],
    [
      "a low kind: the kind picker's trigger",
      () => marked({}, { confidence: { kind: 0.5 } }),
      kindTrigger,
    ],
    [
      "a missing start: the Start date input",
      () => marked({ startsAt: null, endsAt: null }, { missing: ["startsAt"] }),
      () => field("Start date"),
    ],
    [
      "a missing end: the End date input",
      () => marked({}, { missing: ["endsAt"] }),
      () => field("End date"),
    ],
    [
      "a low location: the Location input",
      () => marked({}, { confidence: { location: 0.3 } }),
      () => field("Location"),
    ],
    [
      "a low title before a missing location: the missing Location wins",
      () =>
        marked(
          { location: null },
          { confidence: { title: 0.2 }, missing: ["location"] },
        ),
      () => field("Location"),
    ],
  ];

  for (const [how, renderWith] of RENDERERS) {
    it.each(CASES)(`${how}: %s`, async (_label, state, target) => {
      renderWith(state());
      await settle();
      await waitFor(() => expect(target()).toHaveFocus());
    });
  }

  it("focus is moved once: after the owner moves to Notes and types, nothing pulls it back", async () => {
    const { user } = renderFocused(
      marked({ title: null }, { missing: ["title"] }),
    );
    await settle();
    await waitFor(() => expect(titleBox()).toHaveFocus());
    await user.click(field("Notes"));
    await user.type(field("Notes"), "Window table");
    await formReady();
    await settle();
    expect(field("Notes")).toHaveFocus();
  });
});

describe('"Save event" waits for Title and Start (AC-6, Block 4)', () => {
  it('a missing title: aria-disabled="true" and described "Add the title to save."; once typed, neither', async () => {
    const { user } = renderConfirm({
      toast: false,
      state: marked({ title: null }, { missing: ["title"] }),
    });
    await formReady();
    expect(saveButton()).toHaveAttribute("aria-disabled", "true");
    const describedBy = saveButton().getAttribute("aria-describedby") ?? "";
    expect(describedBy).not.toBe("");
    expect(document.getElementById(describedBy)).toHaveTextContent(
      /^Add the title to save\.$/,
    );
    expect(saveButton()).toHaveAccessibleDescription("Add the title to save.");
    await user.type(titleBox(), "Dinner");
    expect(saveButton()).not.toHaveAttribute("aria-disabled", "true");
    expect(saveButton()).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText(/to save\.$/)).toBeNull();
  });

  it('a missing title and start: "Add the title and the start time to save."; with the start filled, "Add the title to save."', async () => {
    renderConfirm({
      toast: false,
      state: marked(
        { title: null, startsAt: null, endsAt: null },
        { missing: ["title", "startsAt", "endsAt"] },
      ),
    });
    await formReady();
    expect(saveButton()).toHaveAccessibleDescription(
      "Add the title and the start time to save.",
    );
    fireEvent.change(field("Start date"), { target: { value: "2026-11-05" } });
    expect(saveButton()).toHaveAccessibleDescription(
      "Add the title and the start time to save.",
    );
    fireEvent.change(field("Start time"), { target: { value: "18:00" } });
    expect(saveButton()).toHaveAccessibleDescription("Add the title to save.");
    expect(saveButton()).toHaveAttribute("aria-disabled", "true");
  });

  it('an all-day missing start: "Add the start date to save."', async () => {
    renderConfirm({
      toast: false,
      state: marked(
        { allDay: true, startsAt: null, endsAt: null },
        { missing: ["startsAt", "endsAt"] },
      ),
    });
    await formReady();
    expect(saveButton()).toHaveAttribute("aria-disabled", "true");
    expect(saveButton()).toHaveAccessibleDescription(
      "Add the start date to save.",
    );
  });

  it("a click while the start is empty saves nothing; once the start is filled, the same click saves", async () => {
    const { user, actions } = renderConfirm({
      state: marked(
        { startsAt: null, endsAt: null },
        { missing: ["startsAt", "endsAt"] },
      ),
    });
    await formReady();
    await user.click(saveButton());
    await settle();
    expect(actions.createEvent).not.toHaveBeenCalled();
    fireEvent.change(field("Start date"), { target: { value: "2026-11-05" } });
    fireEvent.change(field("Start time"), { target: { value: "18:00" } });
    await user.click(saveButton());
    await waitFor(() => expect(actions.createEvent).toHaveBeenCalledTimes(1));
  });
});

describe("an empty end is filled at Save (PO decision 3, Block 4)", () => {
  it("timed: the end opens empty and is saved as start + 1 h", async () => {
    const { user, actions } = renderConfirm({
      state: marked({ endsAt: null }, { missing: ["endsAt"] }),
    });
    await formReady();
    expect(field("End date")).toHaveValue("");
    expect(field("End time")).toHaveValue("");
    expect(saveButton()).not.toHaveAttribute("aria-disabled", "true");
    await user.click(saveButton());
    await waitFor(() => expect(actions.createEvent).toHaveBeenCalledTimes(1));
    expect(actions.createEvent.mock.calls[0]?.[0]).toStrictEqual({
      title: "Dinner at Lupa",
      kindId: DINING.id,
      startsAt: nov(3, 19, 30),
      endsAt: nov(3, 20, 30),
      allDay: false,
      location: "Lupa, Via Roma 1",
      notes: null,
      origin: "capture",
      recurrence: null,
      captureJobId: JOB_ID,
    });
  });

  it("all day: the end date opens empty and is saved as the same day", async () => {
    const { user, actions } = renderConfirm({
      state: marked(
        { allDay: true, startsAt: "2026-11-03", endsAt: null },
        { missing: ["endsAt"] },
      ),
    });
    await formReady();
    expect(field("End date")).toHaveValue("");
    await user.click(saveButton());
    await waitFor(() => expect(actions.createEvent).toHaveBeenCalledTimes(1));
    const saved = actions.createEvent.mock.calls[0]?.[0];
    expect([saved?.allDay, saved?.startsAt, saved?.endsAt]).toStrictEqual([
      true,
      nov(3),
      nov(4),
    ]);
  });

  it("a missing start and end: the owner fills the start, the end stays empty, and the save ends an hour after the start they chose", async () => {
    const { user, actions } = renderConfirm({
      state: marked(
        { startsAt: null, endsAt: null },
        { missing: ["startsAt", "endsAt"] },
      ),
    });
    await formReady();
    expect(field("Start date")).toHaveValue("");
    fireEvent.change(field("Start date"), { target: { value: "2026-11-05" } });
    fireEvent.change(field("Start time"), { target: { value: "18:00" } });
    expect(field("End date")).toHaveValue("");
    expect(field("End time")).toHaveValue("");
    await user.click(saveButton());
    await waitFor(() => expect(actions.createEvent).toHaveBeenCalledTimes(1));
    const saved = actions.createEvent.mock.calls[0]?.[0];
    expect([saved?.startsAt, saved?.endsAt]).toStrictEqual([
      nov(5, 18, 0),
      nov(5, 19, 0),
    ]);
  });
});

// CAL-024 (AC-2, Contract Block 7 as amended by RED): the confirm screen
// renders the same EventForm, so it carries the Repeat field too, and its
// "Save event" must refuse a series that ends before it starts exactly as
// the sheet does. The proposal starts Tuesday 3 November 2026 19:30.

describe("Repeat on the confirm screen (CAL-024 AC-2)", () => {
  const DEVICE_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const repeatSelect = () => screen.getByRole("combobox", { name: "Repeat" });

  it("Weekly, Ends Never: the event is created with recurrence { weekly, until null, the device zone }", async () => {
    const { user, actions } = renderConfirm();
    await formReady();
    await user.selectOptions(repeatSelect(), "weekly");
    expect(repeatSelect()).toHaveAccessibleDescription("Every Tuesday");
    await user.click(saveButton());
    await waitFor(() => expect(actions.createEvent).toHaveBeenCalledTimes(1));
    expect(actions.createEvent.mock.calls[0]?.[0]?.recurrence).toStrictEqual({
      freq: "weekly",
      until: null,
      tz: DEVICE_TZ,
    });
  });

  it('Ends on 2 November, before the start: "The series must end after it starts." and nothing is created', async () => {
    const { user, actions } = renderConfirm();
    await formReady();
    await user.selectOptions(repeatSelect(), "weekly");
    await user.click(screen.getByRole("radio", { name: "On date" }));
    fireEvent.change(field("Repeat until"), {
      target: { value: "2026-11-02" },
    });
    await user.click(saveButton());
    await settle();
    expect(
      screen.getByText("The series must end after it starts."),
    ).toBeInTheDocument();
    expect(field("Repeat until")).toHaveAttribute("aria-invalid", "true");
    expect(actions.createEvent).not.toHaveBeenCalled();
  });
});
