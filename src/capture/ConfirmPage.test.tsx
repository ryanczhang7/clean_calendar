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
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
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
    expect(screen.queryAllByRole("option", { selected: true })).toHaveLength(0);
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
