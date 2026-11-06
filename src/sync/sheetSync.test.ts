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
  NOW_TS,
  okRow,
  ops,
  S9,
} from "../test/outbox-fixtures";
import type { CalendarDb, OutboxOp } from "./db";
import type { DrainResult } from "./drain";
import { createSheetSync, type SheetSync, sheetSync } from "./sheetSync";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-045 Contract, Block 1 (AC-1 to AC-4 at the source): the sheet's door to
// the outbox. A real CalendarDb over a fresh fake-indexeddb factory, the
// CAL-015 repository fakes, and a drain of one vi.fn. MECHANICAL: the values
// are the fixtures' and the Contract's (error 22P02 "invalid input", 400).
// Ops are written into db.outbox directly, in the OutboxOp shape of db.ts.

let db: CalendarDb;
let repos: FakeRepos;
let drain: { run: Mock<() => Promise<DrainResult>> };
let sync: SheetSync;

const PASS: DrainResult = { sent: 0, stoppedAt: "end" };

beforeEach(() => {
  db = freshDb();
  repos = fakeRepos();
  drain = { run: vi.fn<() => Promise<DrainResult>>(async () => PASS) };
  sync = createSheetSync(db, drain, asRepos(repos));
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

/** The event cached with the optimistic edit: title "Mine". */
const MINE: Event = ev(1, at(10, 22, 9), at(10, 22, 10), {
  title: "Mine",
  location: "Main St",
  updatedAt: T1,
});
/** Another event, with a failed op of its own. */
const OTHER: Event = ev(2, at(10, 23, 9), at(10, 23, 10), { updatedAt: T1 });
/** The server's copy of MINE: title "Theirs", another location, a newer stamp. */
const THEIRS: Event = {
  ...MINE,
  title: "Theirs",
  location: "Harbour Rd",
  updatedAt: S9,
};

const ERROR = { code: "22P02", message: "invalid input", http: 400 };

function updateOp(id: string, extra: Partial<OutboxOp> = {}): OutboxOp {
  return {
    op: "update",
    table: "events",
    id,
    patch: { title: "Mine" },
    baseUpdatedAt: T1,
    clientTs: NOW_TS,
    status: "failed",
    error: ERROR,
    ...extra,
  };
}

/** Writes the op into the outbox and returns its seq. */
const put = (op: OutboxOp): Promise<number> => db.outbox.add(op);

describe("failedOp: the event's failed events op (AC-1, AC-4, Block 1)", () => {
  it("an event with one failed update op: { seq, message: the stored error's message }", async () => {
    await db.events.put(MINE);
    const seq = await put(updateOp(MINE.id));
    await expect(sync.failedOp(MINE.id)).resolves.toStrictEqual({
      seq,
      message: "invalid input",
    });
  });

  // Deferred verification 2's target: with the status === "failed" filter
  // removed, this must fail.
  it("a queued op is not a failed op", async () => {
    await db.events.put(MINE);
    const { error: _error, ...queued } = updateOp(MINE.id);
    await put({ ...queued, status: "queued" });
    await expect(sync.failedOp(MINE.id)).resolves.toBeNull();
  });

  it("another event's failed op is never returned", async () => {
    await db.events.put(MINE);
    await db.events.put(OTHER);
    await put(updateOp(OTHER.id));
    await expect(sync.failedOp(MINE.id)).resolves.toBeNull();
  });

  it("an event with no op at all: null", async () => {
    await db.events.put(MINE);
    await expect(sync.failedOp(MINE.id)).resolves.toBeNull();
  });

  it("a failed op on another table with the event's id is not the event's", async () => {
    await db.events.put(MINE);
    await put(updateOp(MINE.id, { table: "reminders" }));
    await expect(sync.failedOp(MINE.id)).resolves.toBeNull();
  });

  it("of two failed ops on one event, the lower seq (and its message)", async () => {
    await db.events.put(MINE);
    const first = await put(updateOp(MINE.id));
    await put(
      updateOp(MINE.id, {
        error: { code: "23514", message: "check violated", http: 400 },
      }),
    );
    await expect(sync.failedOp(MINE.id)).resolves.toStrictEqual({
      seq: first,
      message: "invalid input",
    });
  });

  it("a queued op before a failed one does not hide it: the failed op's seq", async () => {
    await db.events.put(MINE);
    const { error: _error, ...queued } = updateOp(MINE.id);
    await put({ ...queued, status: "queued" });
    const failed = await put(updateOp(MINE.id));
    await expect(sync.failedOp(MINE.id)).resolves.toStrictEqual({
      seq: failed,
      message: "invalid input",
    });
  });
});

describe("retry: re-queue, then one drain pass (AC-2, Block 1)", () => {
  it("leaves the op queued with no error key, everything else unchanged", async () => {
    await db.events.put(MINE);
    const seq = await put(updateOp(MINE.id));
    await sync.retry(seq);
    const back = await db.outbox.get(seq);
    const { error: _error, ...rest } = updateOp(MINE.id);
    expect(back).toStrictEqual({ ...rest, status: "queued", seq });
    expect(back !== undefined && "error" in back).toBe(false);
  });

  it("calls drain.run exactly once, after the op was re-queued", async () => {
    await db.events.put(MINE);
    const seq = await put(updateOp(MINE.id));
    const seen: (string | undefined)[] = [];
    drain.run.mockImplementation(async () => {
      seen.push((await db.outbox.get(seq))?.status);
      return PASS;
    });
    await sync.retry(seq);
    expect(drain.run).toHaveBeenCalledTimes(1);
    expect(seen).toStrictEqual(["queued"]);
  });

  it("after a retry the event has no failed op", async () => {
    await db.events.put(MINE);
    const seq = await put(updateOp(MINE.id));
    await sync.retry(seq);
    await expect(sync.failedOp(MINE.id)).resolves.toBeNull();
  });
});

describe("discard: drop the op, take the server copy (AC-3, Block 1)", () => {
  it("an update: resolves with the server row; the cache row is the server row; the outbox is empty", async () => {
    await db.events.put(MINE);
    const seq = await put(updateOp(MINE.id));
    repos.events.get.mockResolvedValue(okRow(THEIRS));
    await expect(sync.discard(seq, MINE.id)).resolves.toStrictEqual(THEIRS);
    expect(await db.events.get(MINE.id)).toStrictEqual(THEIRS);
    expect(await ops(db)).toStrictEqual([]);
    expect(repos.events.get).toHaveBeenCalledWith(MINE.id);
  });

  it("does not run the drain", async () => {
    await db.events.put(MINE);
    const seq = await put(updateOp(MINE.id));
    repos.events.get.mockResolvedValue(okRow(THEIRS));
    await sync.discard(seq, MINE.id);
    expect(drain.run).not.toHaveBeenCalled();
  });

  it("an insert: the event is gone, so it resolves null", async () => {
    await db.events.put(MINE);
    const seq = await put(
      updateOp(MINE.id, { op: "insert", baseUpdatedAt: null }),
    );
    await expect(sync.discard(seq, MINE.id)).resolves.toBeNull();
    expect(await db.events.get(MINE.id)).toBeUndefined();
    expect(await ops(db)).toStrictEqual([]);
  });
});

describe("the app's instance (Block 1)", () => {
  it("sheetSync has failedOp, retry and discard", () => {
    expect(typeof sheetSync.failedOp).toBe("function");
    expect(typeof sheetSync.retry).toBe("function");
    expect(typeof sheetSync.discard).toBe("function");
  });
});
