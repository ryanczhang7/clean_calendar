import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { KindsRepo } from "../data/kinds";
import type { Result } from "../data/result";
import type { Kind, KindPatch, NewKind } from "../data/rows";
import {
  createKindActions,
  type KindActions,
  kindActions,
} from "./kindActions";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-007 Contract, Block 3. The repository and the store are hand-written
// fakes: the HTTP shape of insert/update/remove is kinds.test.ts's business
// (CAL-005), and the store's refresh is kindsStore.test.ts's (CAL-006). Here
// only the routing is under test: which member, which arguments, which
// result, and when the store is refreshed.

// Six fractional digits and a +00:00 offset: the conditional-update token
// must reach the repository byte for byte.
const UPDATED_AT = "2026-10-16T09:15:02.123456+00:00";

const GYM: Kind = {
  id: "0b6f7c1e-3d0a-4c55-9a51-6a2f6f0e9a08",
  name: "Gym",
  colorLight: "#2E7D32",
  colorDark: "#9BD69B",
  sortOrder: 8,
  isDefault: true,
  deletedAt: null,
  createdAt: "2026-10-01T08:00:00.654321+00:00",
  updatedAt: UPDATED_AT,
};

const NEW_KIND: NewKind = {
  name: "Climbing",
  colorLight: "#0B6E80",
  colorDark: "#7AD4E4",
  sortOrder: 12,
  isDefault: false,
};

type Repo = Pick<KindsRepo, "insert" | "update" | "remove">;
type FakeRepo = {
  insert: Mock<Repo["insert"]>;
  update: Mock<Repo["update"]>;
  remove: Mock<Repo["remove"]>;
};

let repo: FakeRepo;
let refresh: Mock<() => Promise<void>>;
let actions: KindActions;

beforeEach(() => {
  repo = {
    insert: vi.fn<Repo["insert"]>(),
    update: vi.fn<Repo["update"]>(),
    remove: vi.fn<Repo["remove"]>(),
  };
  refresh = vi.fn<() => Promise<void>>(async () => {});
  actions = createKindActions(repo, { refresh });
});

const ok = (row: Kind): Result<Kind> => ({ status: "ok", row });

describe("addKind (Block 3)", () => {
  it("inserts the input through repo.insert, once, and nothing else", async () => {
    repo.insert.mockResolvedValue(ok({ ...GYM, ...NEW_KIND }));
    await actions.addKind(NEW_KIND);
    expect(repo.insert).toHaveBeenCalledTimes(1);
    expect(repo.insert).toHaveBeenCalledWith(NEW_KIND);
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it("returns the repository's result unchanged and refreshes the store once on ok", async () => {
    const result = ok({ ...GYM, ...NEW_KIND });
    repo.insert.mockResolvedValue(result);
    await expect(actions.addKind(NEW_KIND)).resolves.toBe(result);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("updateKind (Block 3)", () => {
  it("sends the kind's id, the patch and the kind's own updatedAt, byte for byte", async () => {
    const patch: KindPatch = { name: "Workouts" };
    repo.update.mockResolvedValue(ok({ ...GYM, name: "Workouts" }));
    await actions.updateKind(GYM, patch);
    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(repo.update).toHaveBeenCalledWith(GYM.id, patch, UPDATED_AT);
    expect(repo.insert).not.toHaveBeenCalled();
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it("passes an empty patch through as it is", async () => {
    repo.update.mockResolvedValue(ok(GYM));
    await actions.updateKind(GYM, {});
    expect(repo.update).toHaveBeenCalledWith(GYM.id, {}, UPDATED_AT);
  });

  it("returns the repository's result unchanged and refreshes the store once on ok", async () => {
    const result = ok({ ...GYM, name: "Workouts" });
    repo.update.mockResolvedValue(result);
    await expect(actions.updateKind(GYM, { name: "Workouts" })).resolves.toBe(
      result,
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("deleteKind (Block 3)", () => {
  it("soft-deletes through repo.remove with the kind's id and its own updatedAt", async () => {
    repo.remove.mockResolvedValue(ok({ ...GYM, deletedAt: UPDATED_AT }));
    await actions.deleteKind(GYM);
    expect(repo.remove).toHaveBeenCalledTimes(1);
    expect(repo.remove).toHaveBeenCalledWith(GYM.id, UPDATED_AT);
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it("returns the repository's result unchanged and refreshes the store once on ok", async () => {
    const result = ok({ ...GYM, deletedAt: UPDATED_AT });
    repo.remove.mockResolvedValue(result);
    await expect(actions.deleteKind(GYM)).resolves.toBe(result);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("the refresh is awaited before an ok action resolves (Block 3)", () => {
  const CASES: Array<[string, (a: KindActions) => Promise<Result<Kind>>]> = [
    ["addKind", (a) => a.addKind(NEW_KIND)],
    ["updateKind", (a) => a.updateKind(GYM, { name: "Workouts" })],
    ["deleteKind", (a) => a.deleteKind(GYM)],
  ];

  it.each(CASES)(
    "%s does not resolve until the store's refresh has",
    async (_name, call) => {
      repo.insert.mockResolvedValue(ok(GYM));
      repo.update.mockResolvedValue(ok(GYM));
      repo.remove.mockResolvedValue(ok(GYM));
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

describe("a result other than ok is returned as is, and nothing is refreshed (Block 3)", () => {
  const FAILURES: Array<[string, Result<Kind>]> = [
    ["conflict", { status: "conflict" }],
    ["offline", { status: "offline" }],
    ["error", { status: "error", code: "23505", message: "duplicate key" }],
  ];

  it.each(FAILURES)("addKind on %s", async (_label, result) => {
    repo.insert.mockResolvedValue(result);
    await expect(actions.addKind(NEW_KIND)).resolves.toBe(result);
    expect(refresh).not.toHaveBeenCalled();
    expect(repo.insert).toHaveBeenCalledTimes(1);
  });

  it.each(FAILURES)("updateKind on %s", async (_label, result) => {
    repo.update.mockResolvedValue(result);
    await expect(actions.updateKind(GYM, { name: "Workouts" })).resolves.toBe(
      result,
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledTimes(1);
  });

  it.each(FAILURES)("deleteKind on %s", async (_label, result) => {
    repo.remove.mockResolvedValue(result);
    await expect(actions.deleteKind(GYM)).resolves.toBe(result);
    expect(refresh).not.toHaveBeenCalled();
    expect(repo.remove).toHaveBeenCalledTimes(1);
  });
});

describe("the app's actions (Block 3)", () => {
  it("export addKind, updateKind and deleteKind", () => {
    expect(typeof kindActions.addKind).toBe("function");
    expect(typeof kindActions.updateKind).toBe("function");
    expect(typeof kindActions.deleteKind).toBe("function");
  });
});
