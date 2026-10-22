import type { KindsRepo } from "../data/kinds";
import type { Result } from "../data/result";
import type { Kind, KindPatch, NewKind } from "../data/rows";
import { type CalendarDb, db } from "./db";
import type { Drain } from "./drain";
import type { KindsStore } from "./kindsStore";
import {
  enqueueDelete,
  enqueueInsert,
  enqueueUpdate,
  queuedResult,
} from "./outbox";
import { appDrain } from "./startSync";

// Kind writes (CAL-007, Contract Block 3). `createKindActions` is the
// in-memory factory, online through the repository: nothing throws and
// nothing retries; an ok result is not handed back until the store has
// refreshed, so a caller that awaits it sees the new snapshot. CAL-015 routes
// the app's actions through the outbox behind the same type
// (`createOutboxKindActions`, below).

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

/**
 * CAL-015 Contract, Block 4 (PO decisions 1 and 11): the same KindActions
 * over the outbox - cache and outbox written, the cache row returned, never
 * waiting for the server. The stamp on the kind passed in is ignored: the
 * cache row's stamp is the token the drain sends (PO decision 3).
 */
export function createOutboxKindActions(
  db: CalendarDb,
  drain: Pick<Drain, "run">,
  online: () => boolean = () => navigator.onLine,
): KindActions {
  return {
    addKind: async (input) =>
      queuedResult(await enqueueInsert(db, "kinds", input), drain, online),
    updateKind: async (kind, patch) =>
      queuedResult(
        await enqueueUpdate(db, "kinds", kind.id, patch),
        drain,
        online,
      ),
    deleteKind: async (kind) =>
      queuedResult(await enqueueDelete(db, "kinds", kind.id), drain, online),
  };
}

/** The app's actions: the outbox over the app's `db`, sent by `appDrain`. */
export const kindActions: KindActions = createOutboxKindActions(db, appDrain);
