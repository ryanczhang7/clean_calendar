import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { Kind } from "../data/rows";
import { DEFAULT_KINDS } from "./defaultKinds";
import { ensureDefaultKinds, type SeedRepo } from "./seedKinds";

// CAL-006 AC-3, AC-4, AC-5; Contract Block 4. The repository is a
// hand-written SeedRepo fake (Block 7): its HTTP shape is kinds.test.ts's
// business, and here only the decisions are under test.

const STAMP = "2026-10-16T08:00:00.000001+00:00";

function kind(n: number, extra: Partial<Kind> = {}): Kind {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name: `Kind ${n}`,
    colorLight: "#2E7D32",
    colorDark: "#9BD69B",
    sortOrder: n,
    isDefault: false,
    deletedAt: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...extra,
  };
}

/** The eleven defaults as the server would return them. */
function seededRows(): Kind[] {
  return DEFAULT_KINDS.map((k, i) => ({
    ...kind(i + 1),
    ...k,
  }));
}

// The eleven defaults written out by hand - the AC-3 oracle does not come
// from the module whose content AC-1 pins separately.
const ELEVEN = [
  ["Movies", "#7E3FB8", "#CFA8F0"],
  ["Entertainment", "#BD8200", "#F5CC6A"],
  ["Flights", "#0B6E80", "#7AD4E4"],
  ["Hotel stays", "#5147C9", "#B3AEF7"],
  ["Other travel", "#0D7265", "#74D3C2"],
  ["Restaurant reservations", "#BF4A17", "#F5A47C"],
  ["Birthdays", "#C2185B", "#F39BBE"],
  ["Gym", "#2E7D32", "#9BD69B"],
  ["Work / meetings", "#2A5BD7", "#A3C0FA"],
  ["Appointments", "#7D5234", "#D8B297"],
  ["Social / personal", "#5E7114", "#C9D66B"],
].map(([name, colorLight, colorDark], i) => ({
  name,
  colorLight,
  colorDark,
  sortOrder: i + 1,
  isDefault: true,
}));

type Fake = {
  listAll: Mock<SeedRepo["listAll"]>;
  insertMany: Mock<SeedRepo["insertMany"]>;
};

let repo: Fake;

beforeEach(() => {
  repo = {
    listAll: vi.fn<SeedRepo["listAll"]>(),
    insertMany: vi.fn<SeedRepo["insertMany"]>(),
  };
});

describe("an empty kinds table is seeded with the eleven defaults (AC-3)", () => {
  it("inserts DEFAULT_KINDS in one insertMany call and reports seeded with the returned rows", async () => {
    const returned = seededRows();
    repo.listAll.mockResolvedValueOnce({ status: "ok", rows: [] });
    repo.insertMany.mockResolvedValueOnce({ status: "ok", rows: returned });

    const result = await ensureDefaultKinds(repo);

    expect(result).toStrictEqual({ outcome: "seeded", kinds: returned });
    expect(repo.listAll).toHaveBeenCalledTimes(1);
    expect(repo.insertMany).toHaveBeenCalledTimes(1);
    expect(repo.insertMany.mock.calls[0]?.[0]).toStrictEqual(ELEVEN);
  });

  it("every inserted kind is marked is_default", async () => {
    repo.listAll.mockResolvedValueOnce({ status: "ok", rows: [] });
    repo.insertMany.mockResolvedValueOnce({ status: "ok", rows: [] });
    await ensureDefaultKinds(repo);
    const inserted = repo.insertMany.mock.calls[0]?.[0] ?? [];
    expect(inserted).toHaveLength(11);
    expect(inserted.every((k) => k.isDefault === true)).toBe(true);
  });
});

describe("a kinds table that already holds rows is left alone (AC-4)", () => {
  it("one live kind reports existing with that row and inserts nothing", async () => {
    const live = kind(1);
    repo.listAll.mockResolvedValueOnce({ status: "ok", rows: [live] });

    const result = await ensureDefaultKinds(repo);

    expect(result).toStrictEqual({ outcome: "existing", kinds: [live] });
    expect(repo.listAll).toHaveBeenCalledTimes(1);
    expect(repo.insertMany).not.toHaveBeenCalled();
  });

  it("a table holding only soft-deleted kinds reports existing and inserts nothing", async () => {
    const gone = [
      kind(1, { deletedAt: STAMP }),
      kind(2, { deletedAt: "2026-10-15T10:00:00.5+00:00" }),
    ];
    repo.listAll.mockResolvedValueOnce({ status: "ok", rows: gone });

    const result = await ensureDefaultKinds(repo);

    expect(result).toStrictEqual({ outcome: "existing", kinds: gone });
    expect(repo.listAll).toHaveBeenCalledTimes(1);
    expect(repo.insertMany).not.toHaveBeenCalled();
  });
});

describe("a failed first read attempts no insert", () => {
  it("listAll offline reports unavailable with no kinds", async () => {
    repo.listAll.mockResolvedValueOnce({ status: "offline" });
    await expect(ensureDefaultKinds(repo)).resolves.toStrictEqual({
      outcome: "unavailable",
      kinds: [],
    });
    expect(repo.listAll).toHaveBeenCalledTimes(1);
    expect(repo.insertMany).not.toHaveBeenCalled();
  });

  it("listAll answering an error reports unavailable with no kinds", async () => {
    repo.listAll.mockResolvedValueOnce({
      status: "error",
      code: "42501",
      message: "permission denied",
    });
    await expect(ensureDefaultKinds(repo)).resolves.toStrictEqual({
      outcome: "unavailable",
      kinds: [],
    });
    expect(repo.insertMany).not.toHaveBeenCalled();
  });
});

describe("two devices seeding together: the loser re-reads (AC-5)", () => {
  it("an insert refused by the unique live-name index (23505) re-reads once and reports existing with the eleven live kinds", async () => {
    const winner = seededRows();
    repo.listAll
      .mockResolvedValueOnce({ status: "ok", rows: [] })
      .mockResolvedValueOnce({ status: "ok", rows: winner });
    repo.insertMany.mockResolvedValueOnce({
      status: "error",
      code: "23505",
      message: "duplicate key value violates unique constraint",
    });

    const result = await ensureDefaultKinds(repo);

    expect(result).toStrictEqual({ outcome: "existing", kinds: winner });
    expect(repo.listAll).toHaveBeenCalledTimes(2);
    expect(repo.insertMany).toHaveBeenCalledTimes(1);
    const live = result.kinds.filter((k) => k.deletedAt === null);
    expect(live).toHaveLength(11);
    expect(live.map((k) => k.name)).toStrictEqual(ELEVEN.map((k) => k.name));
  });

  it("a 23505 followed by a failed re-read reports unavailable, and inserts nothing more", async () => {
    repo.listAll
      .mockResolvedValueOnce({ status: "ok", rows: [] })
      .mockResolvedValueOnce({ status: "offline" });
    repo.insertMany.mockResolvedValueOnce({
      status: "error",
      code: "23505",
      message: "duplicate key value violates unique constraint",
    });

    await expect(ensureDefaultKinds(repo)).resolves.toStrictEqual({
      outcome: "unavailable",
      kinds: [],
    });
    expect(repo.listAll).toHaveBeenCalledTimes(2);
    expect(repo.insertMany).toHaveBeenCalledTimes(1);
  });
});

describe("any other insert failure is unavailable, never retried", () => {
  it("insertMany offline reports unavailable and does not re-read", async () => {
    repo.listAll.mockResolvedValueOnce({ status: "ok", rows: [] });
    repo.insertMany.mockResolvedValueOnce({ status: "offline" });
    await expect(ensureDefaultKinds(repo)).resolves.toStrictEqual({
      outcome: "unavailable",
      kinds: [],
    });
    expect(repo.insertMany).toHaveBeenCalledTimes(1);
    expect(repo.listAll).toHaveBeenCalledTimes(1);
  });

  it("insertMany refused with another code (42501) reports unavailable and does not re-read", async () => {
    repo.listAll.mockResolvedValueOnce({ status: "ok", rows: [] });
    repo.insertMany.mockResolvedValueOnce({
      status: "error",
      code: "42501",
      message: "new row violates row-level security policy",
    });
    await expect(ensureDefaultKinds(repo)).resolves.toStrictEqual({
      outcome: "unavailable",
      kinds: [],
    });
    expect(repo.insertMany).toHaveBeenCalledTimes(1);
    expect(repo.listAll).toHaveBeenCalledTimes(1);
  });
});
