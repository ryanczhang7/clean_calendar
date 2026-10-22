import { type Mock, vi } from "vitest";
import type { EventsRepo } from "../data/events";
import type { KindsRepo } from "../data/kinds";
import type { Result } from "../data/result";
import type { NewEvent, NewKind } from "../data/rows";
import type { CalendarDb, OutboxOp } from "../sync/db";
import type { Repos } from "../sync/outbox";
import { kind } from "./cache-fixtures";

// CAL-015 Contract, Block 9: shared builders for the outbox suites
// (outbox, drain, the outbox actions, SyncStatus). The repositories are
// vi.fn fakes with exactly the members the drain and discard need - the
// Picks Block 2 names - so `Repos` must accept them as they are.
//
// Every member answers `offline` until a test says otherwise: a fake left
// unset stops a pass (AC-6) rather than throwing on `undefined`.

type EventsPick = Pick<
  EventsRepo,
  "insert" | "update" | "remove" | "restore" | "get"
>;
type KindsPick = Pick<KindsRepo, "insert" | "update" | "remove" | "get">;

export type FakeRepos = {
  events: {
    insert: Mock<EventsPick["insert"]>;
    update: Mock<EventsPick["update"]>;
    remove: Mock<EventsPick["remove"]>;
    restore: Mock<EventsPick["restore"]>;
    get: Mock<EventsPick["get"]>;
  };
  kinds: {
    insert: Mock<KindsPick["insert"]>;
    update: Mock<KindsPick["update"]>;
    remove: Mock<KindsPick["remove"]>;
    get: Mock<KindsPick["get"]>;
  };
};

const offline = async () => ({ status: "offline" }) as const;

export function fakeRepos(): FakeRepos {
  return {
    events: {
      insert: vi.fn<EventsPick["insert"]>(offline),
      update: vi.fn<EventsPick["update"]>(offline),
      remove: vi.fn<EventsPick["remove"]>(offline),
      restore: vi.fn<EventsPick["restore"]>(offline),
      get: vi.fn<EventsPick["get"]>(offline),
    },
    kinds: {
      insert: vi.fn<KindsPick["insert"]>(offline),
      update: vi.fn<KindsPick["update"]>(offline),
      remove: vi.fn<KindsPick["remove"]>(offline),
      get: vi.fn<KindsPick["get"]>(offline),
    },
  };
}

/** The fakes as the drain's `Repos`: a compile error here is a Block 2 mismatch. */
export const asRepos = (r: FakeRepos): Repos => r;

export const okRow = <T>(row: T): Result<T> => ({ status: "ok", row });

/** A promise the test settles by hand. */
export function held<T>(): {
  promise: Promise<T>;
  release: (value: T) => void;
} {
  let release: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    release = done;
  });
  return { promise, release };
}

/** The client clock every outbox suite pins (`vi.setSystemTime`, Date only). */
export const NOW = new Date("2026-10-21T09:00:00.000Z");
export const NOW_TS = "2026-10-21T09:00:00.000Z";

/** Server stamps the drain receives, newer than every cache-fixtures stamp. */
export const S1 = "2026-10-21T10:00:00.000001+00:00";
export const S2 = "2026-10-21T10:00:00.000002+00:00";
export const S3 = "2026-10-21T10:00:00.000003+00:00";
export const S9 = "2026-10-21T10:00:00.000009+00:00";
export const SERVER_CREATED = "2026-10-21T10:00:00.000000+00:00";
export const SERVER_DELETED = "2026-10-21T10:00:00.000007+00:00";

/** The ids `crypto.randomUUID` is made to return, in order. */
export const U1 = "a0000000-0000-4000-8000-000000000001";
export const U2 = "a0000000-0000-4000-8000-000000000002";

export const NEW_EVENT: NewEvent = {
  title: "Swim",
  kindId: kind(1).id,
  startsAt: new Date(2026, 9, 22, 7, 0),
  endsAt: new Date(2026, 9, 22, 8, 0),
  allDay: false,
  location: null,
  notes: null,
  recurrence: null,
  origin: "manual",
  captureJobId: null,
};

export const NEW_KIND: NewKind = {
  name: "Climbing",
  colorLight: "#0B6E80",
  colorDark: "#7AD4E4",
  sortOrder: 12,
  isDefault: false,
};

/** The outbox, in seq order. */
export const ops = (db: CalendarDb): Promise<OutboxOp[]> =>
  db.outbox.orderBy("seq").toArray();

/** The outbox in seq order with `seq` dropped, for `toStrictEqual` on the rest. */
export async function opsWithoutSeq(
  db: CalendarDb,
): Promise<Omit<OutboxOp, "seq">[]> {
  return (await ops(db)).map(({ seq: _seq, ...rest }) => rest);
}
