import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { ListResult } from "../data/result";
import type { Kind } from "../data/rows";
import type { SeedRepo } from "../kinds/seedKinds";
import { createKindsStore, useKinds } from "./kindsStore";

// CAL-006 AC-6, Contract Block 5. A hand-written SeedRepo fake (Block 7):
// the repository's HTTP shape is kinds.test.ts's business.

const STAMP = "2026-10-16T08:00:00.000001+00:00";

function kind(n: number, extra: Partial<Kind> = {}): Kind {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name: `Kind ${n}`,
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

const A = kind(1);
const B = kind(2);
const C = kind(3);
const GONE = kind(4, { sortOrder: 0, deletedAt: STAMP });
const UNKNOWN = "ffffffff-ffff-4fff-8fff-ffffffffffff";

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

/** A listAll answer the test releases by hand. */
function held(): {
  promise: Promise<ListResult<Kind>>;
  release: (r: ListResult<Kind>) => void;
} {
  let release: (r: ListResult<Kind>) => void = () => {};
  const promise = new Promise<ListResult<Kind>>((done) => {
    release = done;
  });
  return { promise, release };
}

describe("the snapshot before any load (AC-6)", () => {
  it("is loading with no kinds, and knows no id", () => {
    const store = createKindsStore(repo);
    const snap = store.getSnapshot();
    expect(snap.status).toBe("loading");
    expect(snap.kinds).toStrictEqual([]);
    expect(snap.byId(A.id)).toBeUndefined();
    expect(repo.listAll).not.toHaveBeenCalled();
  });
});

describe("refresh() (AC-6)", () => {
  it("is ready with the live kinds in ascending sortOrder, whatever order the repository answered in", async () => {
    repo.listAll.mockResolvedValueOnce({ status: "ok", rows: [C, GONE, A, B] });
    const store = createKindsStore(repo);
    await store.refresh();
    const snap = store.getSnapshot();
    expect(snap.status).toBe("ready");
    expect(snap.kinds).toStrictEqual([A, B, C]);
  });

  it("orders kinds sharing a sortOrder by createdAt", async () => {
    const early = kind(5, {
      sortOrder: 2,
      createdAt: "2026-10-01T00:00:00+00:00",
    });
    const late = kind(6, {
      sortOrder: 2,
      createdAt: "2026-10-02T00:00:00+00:00",
    });
    repo.listAll.mockResolvedValueOnce({
      status: "ok",
      rows: [late, C, early],
    });
    const store = createKindsStore(repo);
    await store.refresh();
    expect(store.getSnapshot().kinds).toStrictEqual([early, late, C]);
  });

  it("leaves a soft-deleted kind out of kinds but finds it by id", async () => {
    repo.listAll.mockResolvedValueOnce({ status: "ok", rows: [C, GONE, A, B] });
    const store = createKindsStore(repo);
    await store.refresh();
    const snap = store.getSnapshot();
    expect(snap.kinds.map((k) => k.id)).not.toContain(GONE.id);
    expect(snap.byId(GONE.id)).toStrictEqual(GONE);
    expect(snap.byId(B.id)).toStrictEqual(B);
    expect(snap.byId(UNKNOWN)).toBeUndefined();
  });

  it("an unavailable repository keeps the last rows and reports unavailable", async () => {
    repo.listAll
      .mockResolvedValueOnce({ status: "ok", rows: [B, A] })
      .mockResolvedValueOnce({ status: "offline" });
    const store = createKindsStore(repo);
    await store.refresh();
    await store.refresh();
    const snap = store.getSnapshot();
    expect(snap.status).toBe("unavailable");
    expect(snap.kinds).toStrictEqual([A, B]);
    expect(snap.byId(A.id)).toStrictEqual(A);
  });
});

describe("the snapshot's identity (useSyncExternalStore's requirement)", () => {
  it("is the same object between changes, and a new one after a load", async () => {
    repo.listAll.mockResolvedValueOnce({ status: "ok", rows: [A] });
    const store = createKindsStore(repo);
    const before = store.getSnapshot();
    expect(store.getSnapshot()).toBe(before);
    await store.refresh();
    const after = store.getSnapshot();
    expect(after).not.toBe(before);
    expect(store.getSnapshot()).toBe(after);
  });

  it("notifies a subscriber on a change, and not after it unsubscribes", async () => {
    repo.listAll.mockResolvedValue({ status: "ok", rows: [A] });
    const store = createKindsStore(repo);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    await store.refresh();
    expect(listener).toHaveBeenCalled();
    const calls = listener.mock.calls.length;
    unsubscribe();
    repo.listAll.mockResolvedValue({ status: "ok", rows: [A, B] });
    await store.refresh();
    expect(listener).toHaveBeenCalledTimes(calls);
    expect(store.getSnapshot().kinds).toStrictEqual([A, B]);
  });
});

describe("ensureSeeded() (AC-6, Block 5)", () => {
  it("makes the seeded rows the snapshot, ready and sorted", async () => {
    repo.listAll.mockResolvedValueOnce({ status: "ok", rows: [] });
    repo.insertMany.mockResolvedValueOnce({ status: "ok", rows: [B, A] });
    const store = createKindsStore(repo);
    await expect(store.ensureSeeded()).resolves.toBe("seeded");
    expect(store.getSnapshot().status).toBe("ready");
    expect(store.getSnapshot().kinds).toStrictEqual([A, B]);
  });

  it("an existing table becomes the snapshot, soft-deleted rows found by id only", async () => {
    repo.listAll.mockResolvedValueOnce({ status: "ok", rows: [GONE, B, A] });
    const store = createKindsStore(repo);
    await expect(store.ensureSeeded()).resolves.toBe("existing");
    const snap = store.getSnapshot();
    expect(snap.status).toBe("ready");
    expect(snap.kinds).toStrictEqual([A, B]);
    expect(snap.byId(GONE.id)).toStrictEqual(GONE);
  });

  it("two concurrent calls share one request", async () => {
    const answer = held();
    repo.listAll.mockReturnValueOnce(answer.promise);
    const store = createKindsStore(repo);
    const first = store.ensureSeeded();
    const second = store.ensureSeeded();
    answer.release({ status: "ok", rows: [A] });
    await expect(Promise.all([first, second])).resolves.toStrictEqual([
      "existing",
      "existing",
    ]);
    expect(repo.listAll).toHaveBeenCalledTimes(1);
  });

  it("a settled existing is remembered: a later call makes no request", async () => {
    repo.listAll.mockResolvedValue({ status: "ok", rows: [A] });
    const store = createKindsStore(repo);
    await store.ensureSeeded();
    await store.ensureSeeded();
    await expect(store.ensureSeeded()).resolves.toBe("existing");
    expect(repo.listAll).toHaveBeenCalledTimes(1);
  });

  it("a settled seeded is remembered: a later call makes no request", async () => {
    repo.listAll.mockResolvedValueOnce({ status: "ok", rows: [] });
    repo.insertMany.mockResolvedValueOnce({ status: "ok", rows: [A] });
    const store = createKindsStore(repo);
    await store.ensureSeeded();
    await expect(store.ensureSeeded()).resolves.toBe("seeded");
    expect(repo.listAll).toHaveBeenCalledTimes(1);
    expect(repo.insertMany).toHaveBeenCalledTimes(1);
  });

  it("unavailable is not remembered: the next call tries again", async () => {
    repo.listAll
      .mockResolvedValueOnce({ status: "offline" })
      .mockResolvedValueOnce({ status: "ok", rows: [A] });
    const store = createKindsStore(repo);
    await expect(store.ensureSeeded()).resolves.toBe("unavailable");
    expect(store.getSnapshot().status).toBe("unavailable");
    expect(store.getSnapshot().kinds).toStrictEqual([]);
    await expect(store.ensureSeeded()).resolves.toBe("existing");
    expect(repo.listAll).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().status).toBe("ready");
  });

  it("an unavailable seed keeps the rows already loaded", async () => {
    repo.listAll
      .mockResolvedValueOnce({ status: "ok", rows: [A, B] })
      .mockResolvedValueOnce({ status: "offline" });
    const store = createKindsStore(repo);
    await store.refresh();
    await expect(store.ensureSeeded()).resolves.toBe("unavailable");
    expect(store.getSnapshot().status).toBe("unavailable");
    expect(store.getSnapshot().kinds).toStrictEqual([A, B]);
  });
});

describe("useKinds(store) (AC-6)", () => {
  it("returns the store's snapshot", async () => {
    repo.listAll.mockResolvedValue({ status: "ok", rows: [B, A] });
    const store = createKindsStore(repo);
    await store.refresh();
    const { result } = renderHook(() => useKinds(store));
    expect(result.current).toBe(store.getSnapshot());
    expect(result.current.kinds).toStrictEqual([A, B]);
  });

  it("on a store that has never loaded, triggers exactly one refresh and re-renders ready", async () => {
    repo.listAll.mockResolvedValue({ status: "ok", rows: [C, GONE, A] });
    const store = createKindsStore(repo);
    const { result } = renderHook(() => useKinds(store));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(repo.listAll).toHaveBeenCalledTimes(1);
    expect(result.current.kinds).toStrictEqual([A, C]);
    expect(result.current.byId(GONE.id)).toStrictEqual(GONE);
    expect(result.current.byId(UNKNOWN)).toBeUndefined();
  });

  it("does not refresh a store that has already loaded", async () => {
    repo.listAll.mockResolvedValue({ status: "ok", rows: [A] });
    const store = createKindsStore(repo);
    await store.refresh();
    renderHook(() => useKinds(store));
    await act(async () => {
      await Promise.resolve();
    });
    expect(repo.listAll).toHaveBeenCalledTimes(1);
  });

  it("re-renders when the store changes", async () => {
    repo.listAll
      .mockResolvedValueOnce({ status: "ok", rows: [A] })
      .mockResolvedValueOnce({ status: "ok", rows: [A, B] });
    const store = createKindsStore(repo);
    await store.refresh();
    const { result } = renderHook(() => useKinds(store));
    expect(result.current.kinds).toStrictEqual([A]);
    await act(async () => {
      await store.refresh();
    });
    expect(result.current.kinds).toStrictEqual([A, B]);
    expect(result.current).toBe(store.getSnapshot());
  });
});
