import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import type { Event } from "../data/rows";
import { at, ev, freshDb, T1 } from "../test/cache-fixtures";
import {
  asRepos,
  type FakeRepos,
  fakeRepos,
  NOW,
  NOW_TS,
  okRow,
  ops,
  opsWithoutSeq,
  S9,
} from "../test/outbox-fixtures";
import { ToastHost, ToastProvider } from "../ui/Toast";
import type { CalendarDb, OutboxOp } from "./db";
import type { Drain, DrainNotice } from "./drain";
import { SyncStatus } from "./SyncStatus";
import type { SyncState, SyncStateStore } from "./syncState";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-015 AC-7 (the indicator), AC-2 / AC-3 / AC-5 (the toasts it shows) and
// Contract Block 7. MECHANICAL: role, exact accessible name (voice.md's
// labels), data-state, the glyph per state, the problems dialog and the
// three toasts with their actions. The state comes from a hand-written store;
// the notices from a fake drain whose listener the test calls; the outbox
// and cache are a real CalendarDb. Date only is faked (fake-indexeddb
// schedules on real timers).

let db: CalendarDb;
let repos: FakeRepos;
let listeners: ((n: DrainNotice) => void)[];
let drain: {
  run: Mock<Drain["run"]>;
  subscribe: Drain["subscribe"];
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  db = freshDb();
  repos = fakeRepos();
  listeners = [];
  drain = {
    run: vi.fn<Drain["run"]>(async () => ({ sent: 0, stoppedAt: "end" })),
    subscribe: (l) => {
      listeners.push(l);
      return () => {
        listeners = listeners.filter((x) => x !== l);
      };
    },
  };
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
});

const fixed = (state: SyncState): SyncStateStore => ({
  subscribe: () => () => {},
  getSnapshot: () => state,
});

function renderStatus(state: SyncState) {
  return render(
    <ToastProvider>
      <SyncStatus
        store={fixed(state)}
        drain={drain}
        db={db}
        repos={asRepos(repos)}
      />
      <ToastHost />
    </ToastProvider>,
  );
}

const emit = (n: DrainNotice) =>
  act(() => {
    for (const l of listeners) l(n);
  });

/** The sync status region: the one role=status carrying an aria-label. */
const indicator = () =>
  screen
    .getAllByRole("status")
    .filter((r) => r.hasAttribute("aria-label")) as HTMLElement[];

const STATES: [string, SyncState, string, string][] = [
  ["synced", { online: true, queued: 0, failed: 0 }, "Synced", "✓"],
  ["syncing", { online: true, queued: 3, failed: 0 }, "Syncing 3 changes", "↑"],
  [
    "offline",
    { online: false, queued: 2, failed: 1 },
    "Offline — changes will sync later",
    "⊘",
  ],
  [
    "error",
    { online: true, queued: 2, failed: 2 },
    "2 changes couldn't sync",
    "!",
  ],
];

describe("the sync status indicator (AC-7, Block 7)", () => {
  it.each(STATES)(
    'state %s: one role="status", aria-live polite, named exactly by its label, with its glyph hidden from the accessibility tree',
    (dataState, state, label, glyph) => {
      renderStatus(state);
      const status = screen.getByRole("status", { name: label });
      expect(indicator()).toStrictEqual([status]);
      expect(status).toHaveAttribute("aria-live", "polite");
      expect(status).toHaveAttribute("data-state", dataState);
      const glyphs = status.querySelectorAll("[data-glyph]");
      expect(glyphs).toHaveLength(1);
      expect(glyphs[0]).toHaveAttribute("aria-hidden", "true");
      expect(glyphs[0]?.textContent).toBe(glyph);
    },
  );

  it("the singular labels: Syncing 1 change, 1 change couldn't sync", () => {
    const { unmount } = renderStatus({ online: true, queued: 1, failed: 0 });
    expect(
      screen.getByRole("status", { name: "Syncing 1 change" }),
    ).toBeInTheDocument();
    unmount();
    renderStatus({ online: true, queued: 0, failed: 1 });
    expect(
      screen.getByRole("status", { name: "1 change couldn't sync" }),
    ).toBeInTheDocument();
  });

  it("four states, four distinct data-state values and four distinct glyphs", () => {
    const seen = STATES.map(([, state]) => {
      const { unmount } = render(
        <ToastProvider>
          <SyncStatus store={fixed(state)} drain={drain} db={db} />
        </ToastProvider>,
      );
      const status = indicator()[0] as HTMLElement;
      const pair = [
        status.getAttribute("data-state"),
        status.querySelector("[data-glyph]")?.textContent,
      ];
      unmount();
      return pair;
    });
    expect(new Set(seen.map((p) => p[0])).size).toBe(4);
    expect(new Set(seen.map((p) => p[1])).size).toBe(4);
  });

  it("follows its store: a change re-renders the label", async () => {
    let state: SyncState = { online: true, queued: 0, failed: 0 };
    const subs = new Set<() => void>();
    const store: SyncStateStore = {
      subscribe: (l) => {
        subs.add(l);
        return () => subs.delete(l);
      },
      getSnapshot: () => state,
    };
    render(
      <ToastProvider>
        <SyncStatus store={store} drain={drain} db={db} />
      </ToastProvider>,
    );
    expect(screen.getByRole("status", { name: "Synced" })).toBeInTheDocument();
    act(() => {
      state = { online: false, queued: 0, failed: 0 };
      for (const l of subs) l();
    });
    expect(
      screen.getByRole("status", { name: "Offline — changes will sync later" }),
    ).toBeInTheDocument();
  });
});

const ROW: Event = ev(1, at(10, 22, 9), at(10, 22, 10), {
  title: "Dentist",
  updatedAt: T1,
});
const OTHER: Event = ev(2, at(10, 23, 9), at(10, 23, 10), {
  title: "Gym",
  updatedAt: T1,
});
const ERROR = { code: "22P02", message: "invalid input", http: 400 };
const failedOp = (id: string): OutboxOp => ({
  op: "update",
  table: "events",
  id,
  patch: { title: "x" },
  baseUpdatedAt: T1,
  clientTs: NOW_TS,
  status: "failed",
  error: ERROR,
});

describe("the sync problems dialog (AC-5, Block 7, PO decision 9)", () => {
  async function openProblems() {
    await db.events.bulkPut([ROW, OTHER]);
    const first = await db.outbox.add(failedOp(ROW.id));
    const second = await db.outbox.add(failedOp(OTHER.id));
    renderStatus({ online: true, queued: 0, failed: 2 });
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Show sync problems" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Changes that couldn't sync",
    });
    return { user, dialog, first, second };
  }

  it("no failed op: no Show sync problems button", () => {
    renderStatus({ online: true, queued: 2, failed: 0 });
    expect(
      screen.queryByRole("button", { name: "Show sync problems" }),
    ).toBeNull();
  });

  it("a failed op: a type=button with aria-haspopup=dialog beside the status, not inside it", () => {
    renderStatus({ online: true, queued: 0, failed: 1 });
    const button = screen.getByRole("button", { name: "Show sync problems" });
    const status = indicator()[0] as HTMLElement;
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(status.contains(button)).toBe(false);
    expect(button.parentElement).toBe(status.parentElement);
  });

  it('lists each failed op as "{title}: {error message}" with its own Retry and Discard', async () => {
    const { dialog } = await openProblems();
    const items = within(dialog).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/^Dentist: invalid input/);
    expect(items[1]).toHaveTextContent(/^Gym: invalid input/);
    for (const item of items) {
      expect(
        within(item)
          .getAllByRole("button")
          .map((b) => b.textContent),
      ).toStrictEqual(["Retry", "Discard"]);
    }
  });

  it("Retry re-queues that op, error removed, and runs the drain", async () => {
    const { user, dialog, first } = await openProblems();
    const [item] = within(dialog).getAllByRole("listitem");
    await user.click(
      within(item as HTMLElement).getByRole("button", { name: "Retry" }),
    );
    await vi.waitFor(() => expect(drain.run).toHaveBeenCalled());
    const { error: _error, ...rest } = failedOp(ROW.id);
    expect(await db.outbox.get(first)).toStrictEqual({
      ...rest,
      seq: first,
      status: "queued",
    });
  });

  it("Discard removes that op and restores the server copy", async () => {
    const fresh: Event = { ...ROW, title: "Dentist (server)", updatedAt: S9 };
    repos.events.get.mockResolvedValue(okRow(fresh));
    const { user, dialog, second } = await openProblems();
    const [item] = within(dialog).getAllByRole("listitem");
    await user.click(
      within(item as HTMLElement).getByRole("button", { name: "Discard" }),
    );
    await vi.waitFor(async () =>
      expect((await ops(db)).map((o) => o.seq)).toStrictEqual([second]),
    );
    expect(repos.events.get).toHaveBeenCalledWith(ROW.id);
    expect(await db.events.get(ROW.id)).toStrictEqual(fresh);
  });
});

describe("the drain's toasts (AC-2, AC-3, AC-5, Block 7, PO decision 7)", () => {
  it('drained: a plain status toast "Back online. 3 changes synced."', () => {
    renderStatus({ online: true, queued: 0, failed: 0 });
    emit({ kind: "drained", count: 3 });
    const text = screen.getByText("Back online. 3 changes synced.");
    const region = text.closest('[role="status"]');
    expect(region).not.toBeNull();
    expect(region?.hasAttribute("aria-label")).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it('drained, one change: "Back online. 1 change synced."', () => {
    renderStatus({ online: true, queued: 0, failed: 0 });
    emit({ kind: "drained", count: 1 });
    expect(
      screen.getByText("Back online. 1 change synced."),
    ).toBeInTheDocument();
  });

  it("changed notices show no toast", () => {
    renderStatus({ online: true, queued: 0, failed: 0 });
    emit({ kind: "changed" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("conflict: an alert toast with conflictCopy(fields) and Redo", () => {
    renderStatus({ online: true, queued: 0, failed: 0 });
    emit({
      kind: "conflict",
      table: "events",
      id: ROW.id,
      title: "Dentist",
      fields: ["title", "location"],
      patch: { title: "Mine", location: "Pool" },
      freshUpdatedAt: S9,
    });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "Edited elsewhere; your changes to title and location were not applied.",
    );
    expect(
      within(alert).getByRole("button", { name: "Redo" }),
    ).toBeInTheDocument();
  });

  it("Redo reapplies the dropped patch over the fresh row as a new op, based on the fresh stamp, and runs the drain", async () => {
    const fresh: Event = { ...ROW, title: "Theirs", updatedAt: S9 };
    await db.events.put(fresh);
    renderStatus({ online: true, queued: 0, failed: 0 });
    emit({
      kind: "conflict",
      table: "events",
      id: ROW.id,
      title: "Theirs",
      fields: ["title"],
      patch: { title: "Mine" },
      freshUpdatedAt: S9,
    });
    const user = userEvent.setup();
    await user.click(
      within(screen.getByRole("alert")).getByRole("button", { name: "Redo" }),
    );
    await vi.waitFor(() => expect(drain.run).toHaveBeenCalled());
    expect(await opsWithoutSeq(db)).toStrictEqual([
      {
        op: "update",
        table: "events",
        id: ROW.id,
        patch: { title: "Mine" },
        baseUpdatedAt: S9,
        clientTs: NOW_TS,
        status: "queued",
      },
    ]);
    expect(await db.events.get(ROW.id)).toStrictEqual({
      ...fresh,
      title: "Mine",
    });
  });

  it('failed: an alert toast "{title} couldn\'t sync." with Retry, which re-queues the op and runs the drain', async () => {
    const seq = await db.outbox.add(failedOp(ROW.id));
    renderStatus({ online: true, queued: 0, failed: 1 });
    emit({
      kind: "failed",
      seq,
      table: "events",
      id: ROW.id,
      title: "Dentist",
      error: ERROR,
    });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Dentist couldn't sync.");
    const user = userEvent.setup();
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    await vi.waitFor(() => expect(drain.run).toHaveBeenCalled());
    const [back] = await ops(db);
    expect(back?.status).toBe("queued");
    expect(back !== undefined && "error" in back).toBe(false);
  });
});
