import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { EventsRepo } from "../data/events";
import type { Result } from "../data/result";
import type { Event, EventPatch, NewEvent } from "../data/rows";
import {
  createEventActions,
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

type Repo = Pick<EventsRepo, "insert" | "update">;
type FakeRepo = {
  insert: Mock<Repo["insert"]>;
  update: Mock<Repo["update"]>;
};

let repo: FakeRepo;
let refresh: Mock<() => Promise<void>>;
let actions: EventActions;

beforeEach(() => {
  repo = {
    insert: vi.fn<Repo["insert"]>(),
    update: vi.fn<Repo["update"]>(),
  };
  refresh = vi.fn<() => Promise<void>>(async () => {});
  actions = createEventActions(repo, { refresh });
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
