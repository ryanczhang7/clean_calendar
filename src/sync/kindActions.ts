import { type KindsRepo, kindsRepo } from "../data/kinds";
import type { Result } from "../data/result";
import type { Kind, KindPatch, NewKind } from "../data/rows";
import { supabase } from "../lib/supabase";
import { type KindsStore, kindsStore } from "./kindsStore";

// Kind writes (CAL-007, Contract Block 3). Online through the repository
// until CAL-015 routes them through the outbox behind the same signature.
// Nothing throws and nothing retries; an ok result is not handed back until
// the store has refreshed, so a caller that awaits it sees the new snapshot.

export type KindActions = {
  addKind(input: NewKind): Promise<Result<Kind>>;
  updateKind(kind: Kind, patch: KindPatch): Promise<Result<Kind>>;
  deleteKind(kind: Kind): Promise<Result<Kind>>;
};

export function createKindActions(
  repo: Pick<KindsRepo, "insert" | "update" | "remove">,
  store: Pick<KindsStore, "refresh">,
): KindActions {
  const settle = async (pending: Promise<Result<Kind>>) => {
    const result = await pending;
    if (result.status === "ok") await store.refresh();
    return result;
  };
  return {
    addKind: (input) => settle(repo.insert(input)),
    // The conditional-update token is the kind's own updatedAt, as stored.
    updateKind: (kind, patch) =>
      settle(repo.update(kind.id, patch, kind.updatedAt)),
    deleteKind: (kind) => settle(repo.remove(kind.id, kind.updatedAt)),
  };
}

/** The app's actions, over `kindsRepo(supabase)` and `kindsStore`. */
export const kindActions: KindActions = createKindActions(
  kindsRepo(supabase),
  kindsStore,
);
