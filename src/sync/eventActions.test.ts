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
import type { Result } from "../data/result";
import type { Event, EventPatch, NewEvent } from "../data/rows";
import { freshDb, T1 } from "../test/cache-fixtures";
import {
  asRepos,
  fakeRepos,
  held,
  NOW,
  NOW_TS,
  okRow,
  ops,
  opsWithoutSeq,
  S1,
  U1,
} from "../test/outbox-fixtures";
import type { CalendarDb } from "./db";
import type { Drain } from "./drain";
import {
  createEventActions,
  createOutboxEventActions,
  type EventActions,
  eventActions,
} from "./eventActions";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-012 Contract, Block 2 - the same discipline as kindActions.ts
// (kindActions.test.ts). The repository and the store are hand-written
// fakes: the HTTP shape of insert/update is events.test.ts's business
// (CAL-005), the store's refresh is eventsStore.test.ts's (CAL-009). Here
// only the routing: which member, which arguments, which result, and when
// the store is refreshed.

// Six fractional digits and a +00:00 offset: the conditional-update token
// must reach the repository byte for byte.
const UPDATED_AT = "2026-10-16T09:15:02.123456+00:00";

const NEW_EVENT: NewEvent = {
  title: "Swim",
  kindId: "00000000-0000-4000-8000-000000000001",
  startsAt: new Date(2026, 9, 14, 9, 0),
  endsAt: new Date(2026, 9, 14, 10, 0),
  allDay: false,
  location: null,
  notes: null,
  recurrence: null,
  origin: "manual",
  captureJobId: null,
};

const SWIM: Event = {
  ...NEW_EVENT,
  id: "10000000-0000-4000-8000-000000000001",
  deletedAt: null,
  createdAt: "2026-10-01T08:00:00.654321+00:00",
  updatedAt: UPDATED_AT,
};

type Repo = Pick<EventsRepo, "insert" | "update" | "remove" | "restore">;
type FakeRepo = {
  insert: Mock<Repo["insert"]>;
  update: Mock<Repo["update"]>;
  remove: Mock<Repo["remove"]>;
  restore: Mock<Repo["restore"]>;
};

let repo: FakeRepo;
let refresh: Mock<() => Promise<void>>;
let reveal: Mock<() => void>;
let hide: Mock<(id: string) => () => void>;
let actions: EventActions;

beforeEach(() => {
  repo = {
    insert: vi.fn<Repo["insert"]>(),
    update: vi.fn<Repo["update"]>(),
    remove: vi.fn<Repo["remove"]>(),
    restore: vi.fn<Repo["restore"]>(),
  };
  refresh = vi.fn<() => Promise<void>>(async () => {});
  reveal = vi.fn<() => void>();
  hide = vi.fn<(id: string) => () => void>(() => reveal);
  actions = createEventActions(repo, { refresh, hide });
});

const ok = (row: Event): Result<Event> => ({ status: "ok", row });

describe("createEvent (Block 2)", () => {
  it("inserts the input through repo.insert, once, and nothing else", async () => {
    repo.insert.mockResolvedValue(ok(SWIM));
    await actions.createEvent(NEW_EVENT);
    expect(repo.insert).toHaveBeenCalledTimes(1);
    expect(repo.insert).toHaveBeenCalledWith(NEW_EVENT);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("returns the repository's result unchanged and refreshes the store once on ok", async () => {
    const result = ok(SWIM);
    repo.insert.mockResolvedValue(result);
    await expect(actions.createEvent(NEW_EVENT)).resolves.toBe(result);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("updateEvent (Block 2)", () => {
  it("sends the id, the patch and the expected updatedAt, byte for byte", async () => {
    const patch: EventPatch = { title: "Swim, lane 3" };
    repo.update.mockResolvedValue(ok({ ...SWIM, ...patch }));
    await actions.updateEvent(SWIM.id, patch, UPDATED_AT);
    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(repo.update).toHaveBeenCalledWith(SWIM.id, patch, UPDATED_AT);
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it("passes the patch through as it is - no field added", async () => {
    const patch: EventPatch = { notes: "Locker 12" };
    repo.update.mockResolvedValue(ok(SWIM));
    await actions.updateEvent(SWIM.id, patch, UPDATED_AT);
    expect(repo.update.mock.calls[0]?.[1]).toStrictEqual({
      notes: "Locker 12",
    });
  });

  it("returns the repository's result unchanged and refreshes the store once on ok", async () => {
    const result = ok({ ...SWIM, title: "Lift" });
    repo.update.mockResolvedValue(result);
    await expect(
      actions.updateEvent(SWIM.id, { title: "Lift" }, UPDATED_AT),
    ).resolves.toBe(result);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("the refresh is awaited before an ok action resolves (Block 2)", () => {
  const CASES: Array<[string, (a: EventActions) => Promise<Result<Event>>]> = [
    ["createEvent", (a) => a.createEvent(NEW_EVENT)],
    ["updateEvent", (a) => a.updateEvent(SWIM.id, { title: "x" }, UPDATED_AT)],
  ];

  it.each(CASES)(
    "%s does not resolve until the store's refresh has",
    async (_name, call) => {
      repo.insert.mockResolvedValue(ok(SWIM));
      repo.update.mockResolvedValue(ok(SWIM));
      let release: () => void = () => {};
      refresh.mockImplementation(
        () =>
          new Promise<void>((done) => {
            release = done;
          }),
      );
      let resolved = false;
      const pending = call(actions).then((r) => {
        resolved = true;
        return r;
      });
      await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
      expect(resolved).toBe(false);
      release();
      await pending;
      expect(resolved).toBe(true);
    },
  );
});

describe("a result other than ok is returned as is, and nothing is refreshed (Block 2)", () => {
  const FAILURES: Array<[string, Result<Event>]> = [
    ["conflict", { status: "conflict" }],
    ["offline", { status: "offline" }],
    ["error", { status: "error", code: "23503", message: "foreign key" }],
  ];

  it.each(FAILURES)("createEvent on %s", async (_label, result) => {
    repo.insert.mockResolvedValue(result);
    await expect(actions.createEvent(NEW_EVENT)).resolves.toBe(result);
    expect(refresh).not.toHaveBeenCalled();
    expect(repo.insert).toHaveBeenCalledTimes(1);
  });

  it.each(FAILURES)("updateEvent on %s", async (_label, result) => {
    repo.update.mockResolvedValue(result);
    await expect(
      actions.updateEvent(SWIM.id, { title: "Lift" }, UPDATED_AT),
    ).resolves.toBe(result);
    expect(refresh).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledTimes(1);
  });
});

describe("the app's actions (Block 2)", () => {
  it("export createEvent and updateEvent", () => {
    expect(typeof eventActions.createEvent).toBe("function");
    expect(typeof eventActions.updateEvent).toBe("function");
  });
});

// CAL-013 Contract, Block 3 (AC-4, AC-5). removeEvent hides the event BEFORE
// the write is sent; on ok it refreshes, then reveals (the refresh has
// already dropped the deleted row), then resolves; on anything else it
// reveals - the event comes back - and does not refresh. restoreEvent sends
// the token the delete returned, not the original one.

/** A repository answer the test releases by hand. */
function heldResult(): {
  promise: Promise<Result<Event>>;
  release: (r: Result<Event>) => void;
} {
  let release: (r: Result<Event>) => void = () => {};
  const promise = new Promise<Result<Event>>((done) => {
    release = done;
  });
  return { promise, release };
}

const DELETED_AT = "2026-10-20T10:00:00.000001+00:00";
const DELETED_TOKEN = "2026-10-20T10:00:00.000002+00:00";
const SWIM_DELETED: Event = {
  ...SWIM,
  deletedAt: DELETED_AT,
  updatedAt: DELETED_TOKEN,
};

describe("removeEvent hides at once, then deletes (CAL-013 AC-4, Block 3)", () => {
  it("hides the event's id before repo.remove has resolved, and sends the id with the event's token", async () => {
    const answer = heldResult();
    repo.remove.mockReturnValue(answer.promise);
    const pending = actions.removeEvent(SWIM);
    expect(hide).toHaveBeenCalledTimes(1);
    expect(hide).toHaveBeenCalledWith(SWIM.id);
    expect(repo.remove).toHaveBeenCalledTimes(1);
    expect(repo.remove).toHaveBeenCalledWith(SWIM.id, UPDATED_AT);
    expect(hide.mock.invocationCallOrder[0]).toBeLessThan(
      repo.remove.mock.invocationCallOrder[0] as number,
    );
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    expect(reveal).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    answer.release(ok(SWIM_DELETED));
    await pending;
  });

  it("on ok: refreshes, then reveals, then resolves with the repository's result", async () => {
    const result = ok(SWIM_DELETED);
    repo.remove.mockResolvedValue(result);
    await expect(actions.removeEvent(SWIM)).resolves.toBe(result);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(refresh.mock.invocationCallOrder[0]).toBeLessThan(
      reveal.mock.invocationCallOrder[0] as number,
    );
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it("on ok: does not reveal, nor resolve, until the refresh has settled", async () => {
    repo.remove.mockResolvedValue(ok(SWIM_DELETED));
    let release: () => void = () => {};
    refresh.mockImplementation(
      () =>
        new Promise<void>((done) => {
          release = done;
        }),
    );
    let resolved = false;
    const pending = actions.removeEvent(SWIM).then((r) => {
      resolved = true;
      return r;
    });
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    expect(reveal).not.toHaveBeenCalled();
    expect(resolved).toBe(false);
    release();
    await pending;
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(true);
  });

  it.each([
    ["conflict", { status: "conflict" }],
    ["offline", { status: "offline" }],
    ["error", { status: "error", code: "42501", message: "denied" }],
  ] as Array<[string, Result<Event>]>)(
    "on %s: reveals the event once, does not refresh, and returns the result as is",
    async (_label, result) => {
      repo.remove.mockResolvedValue(result);
      await expect(actions.removeEvent(SWIM)).resolves.toBe(result);
      expect(hide).toHaveBeenCalledWith(SWIM.id);
      expect(reveal).toHaveBeenCalledTimes(1);
      expect(refresh).not.toHaveBeenCalled();
    },
  );
});

describe("restoreEvent undoes a delete with the deleted row's token (CAL-013 AC-5, Block 3)", () => {
  it("calls repo.restore(deleted.id, deleted.updatedAt) - the token the delete returned, not the original", async () => {
    repo.restore.mockResolvedValue(ok(SWIM));
    await actions.restoreEvent(SWIM_DELETED);
    expect(repo.restore).toHaveBeenCalledTimes(1);
    expect(repo.restore.mock.calls[0]).toStrictEqual([SWIM.id, DELETED_TOKEN]);
    expect(repo.update).not.toHaveBeenCalled();
    expect(hide).not.toHaveBeenCalled();
  });

  it("on ok: refreshes the store once and resolves with the result", async () => {
    const result = ok({ ...SWIM, updatedAt: "2026-10-20T10:00:05+00:00" });
    repo.restore.mockResolvedValue(result);
    await expect(actions.restoreEvent(SWIM_DELETED)).resolves.toBe(result);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["conflict", { status: "conflict" }],
    ["offline", { status: "offline" }],
  ] as Array<[string, Result<Event>]>)(
    "on %s: returns the result as is and refreshes nothing",
    async (_label, result) => {
      repo.restore.mockResolvedValue(result);
      await expect(actions.restoreEvent(SWIM_DELETED)).resolves.toBe(result);
      expect(refresh).not.toHaveBeenCalled();
    },
  );
});

describe("the app's actions (CAL-013 Block 3)", () => {
  it("export removeEvent and restoreEvent", () => {
    expect(typeof eventActions.removeEvent).toBe("function");
    expect(typeof eventActions.restoreEvent).toBe("function");
  });
});

// CAL-015 AC-1, Contract Block 4 (PO decision 1): the outbox actions behind
// the same EventActions type. An action writes the cache and the outbox and
// resolves with the cache row - never waiting for the server - then, online,
// starts one unannounced drain run it does not await. The in-memory factory
// above is unchanged. `./drain` is loaded inside the cases through a
// specifier Vite does not analyse, so that while it does not exist (CAL-015
// RED) only these cases fail and every case above still runs.
describe("createOutboxEventActions (CAL-015 AC-1, Block 4)", () => {
  const DRAIN_MODULE = "./drain";
  const loadDrain = async () =>
    (await import(/* @vite-ignore */ DRAIN_MODULE)) as typeof import("./drain");

  let db: CalendarDb;
  let run: Mock<Pick<Drain, "run">["run"]>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(U1);
    db = freshDb();
    // A pass that never settles: an action must not wait for it.
    run = vi.fn<Pick<Drain, "run">["run"]>(() => new Promise(() => {}));
  });

  afterEach(() => {
    db.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete (navigator as { onLine?: boolean }).onLine;
  });

  const CACHED: Event = { ...SWIM, updatedAt: T1 };
  const created: Event = {
    ...NEW_EVENT,
    id: U1,
    createdAt: NOW_TS,
    updatedAt: NOW_TS,
    deletedAt: null,
  };

  it("offline: create, edit and delete each resolve ok with the cache row and queue one op, in order, sending nothing", async () => {
    const outbox = createOutboxEventActions(db, { run }, () => false);
    await expect(outbox.createEvent(NEW_EVENT)).resolves.toStrictEqual({
      status: "ok",
      row: created,
    });
    await expect(
      outbox.updateEvent(U1, { title: "Swim, lane 3" }, NOW_TS),
    ).resolves.toStrictEqual({
      status: "ok",
      row: { ...created, title: "Swim, lane 3" },
    });
    await expect(
      outbox.removeEvent({ ...created, title: "Swim, lane 3" }),
    ).resolves.toStrictEqual({
      status: "ok",
      row: { ...created, title: "Swim, lane 3", deletedAt: NOW_TS },
    });
    expect(
      (await opsWithoutSeq(db)).map((o) => [o.op, o.id, o.patch]),
    ).toStrictEqual([
      ["insert", U1, NEW_EVENT],
      ["update", U1, { title: "Swim, lane 3" }],
      ["delete", U1, null],
    ]);
    expect((await ops(db)).map((o) => o.seq)).toStrictEqual([1, 2, 3]);
    expect(run).not.toHaveBeenCalled();
  });

  it("online: each action starts one drain run, unannounced, and resolves without waiting for it", async () => {
    const outbox = createOutboxEventActions(db, { run }, () => true);
    await expect(outbox.createEvent(NEW_EVENT)).resolves.toStrictEqual({
      status: "ok",
      row: created,
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]?.announce).not.toBe(true);
    await outbox.updateEvent(U1, { notes: "Locker 12" }, NOW_TS);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("online, through a real drain: the cache row is there at once, while the server's insert is still pending; it leaves the outbox when the server answers", async () => {
    const { createDrain } = await loadDrain();
    const repos = fakeRepos();
    const answer = held<Result<Event>>();
    repos.events.insert.mockReturnValue(answer.promise);
    const drain = createDrain(db, asRepos(repos), () => true);
    const outbox = createOutboxEventActions(db, drain, () => true);
    await expect(outbox.createEvent(NEW_EVENT)).resolves.toStrictEqual({
      status: "ok",
      row: created,
    });
    expect(await db.events.get(U1)).toStrictEqual(created);
    await vi.waitFor(() =>
      expect(repos.events.insert.mock.calls).toStrictEqual([[NEW_EVENT, U1]]),
    );
    expect(await db.outbox.count()).toBe(1);
    answer.release(okRow({ ...created, createdAt: S1, updatedAt: S1 }));
    await vi.waitFor(async () => expect(await db.outbox.count()).toBe(0));
    expect((await db.events.get(U1))?.updatedAt).toBe(S1);
  });

  it("updateEvent ignores the caller's expectedUpdatedAt: the op's base is the cache row's stamp (PO decision 3)", async () => {
    await db.events.put(CACHED);
    const outbox = createOutboxEventActions(db, { run }, () => false);
    await expect(
      outbox.updateEvent(SWIM.id, { title: "Lift" }, UPDATED_AT),
    ).resolves.toStrictEqual({
      status: "ok",
      row: { ...CACHED, title: "Lift" },
    });
    expect((await ops(db))[0]?.baseUpdatedAt).toBe(T1);
  });

  it("updateEvent of a row the cache does not hold resolves conflict and queues nothing", async () => {
    const outbox = createOutboxEventActions(db, { run }, () => true);
    await expect(
      outbox.updateEvent(SWIM.id, { title: "Lift" }, UPDATED_AT),
    ).resolves.toStrictEqual({ status: "conflict" });
    expect(await db.outbox.count()).toBe(0);
  });

  it("restoreEvent brings the row back in the cache and queues a restore op", async () => {
    await db.events.put({ ...CACHED, deletedAt: T1 });
    const outbox = createOutboxEventActions(db, { run }, () => false);
    await expect(
      outbox.restoreEvent({ ...CACHED, deletedAt: T1 }),
    ).resolves.toStrictEqual({ status: "ok", row: CACHED });
    expect((await opsWithoutSeq(db)).map((o) => o.op)).toStrictEqual([
      "restore",
    ]);
  });

  it("online defaults to navigator.onLine", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    const outbox = createOutboxEventActions(db, { run });
    await outbox.createEvent(NEW_EVENT);
    expect(run).not.toHaveBeenCalled();
  });

  it("the app's eventActions are outbox actions: offline, createEvent writes the app's outbox and sends nothing", async () => {
    const { db: appDb } = await import("./db");
    await Promise.all(appDb.tables.map((t) => t.clear()));
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(eventActions.createEvent(NEW_EVENT)).resolves.toStrictEqual({
      status: "ok",
      row: created,
    });
    expect(network).not.toHaveBeenCalled();
    expect(
      (await appDb.outbox.toArray()).map((o) => [o.op, o.table, o.id]),
    ).toStrictEqual([["insert", "events", U1]]);
    await Promise.all(appDb.tables.map((t) => t.clear()));
  });
});
