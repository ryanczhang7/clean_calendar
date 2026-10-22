import { type JSX, useCallback, useEffect, useState } from "react";
import type { EventPatch, KindPatch } from "../data/rows";
import { Dialog } from "../ui/Dialog";
import { useMaybeToast } from "../ui/Toast";
import { type CalendarDb, db as appDb } from "./db";
import { conflictCopy, type Drain, type DrainNotice } from "./drain";
import {
  cacheTable,
  discardOp,
  enqueueUpdate,
  type Repos,
  retryOp,
} from "./outbox";
import { appDrain, appRepos, installOnlineSync } from "./startSync";
import styles from "./SyncStatus.module.css";
import {
  type SyncState,
  type SyncStateStore,
  statusLabel,
  syncState,
  useSyncState,
} from "./syncState";

// The sync status indicator (CAL-015 AC-7, Contract Block 7; components.md,
// "Sync status indicator"; voice.md). One role="status" named by its label,
// a glyph per state, the label text from 1024px. When an op failed, a sibling
// button opens the problems dialog with Retry / Discard per failed op (PO
// decision 9). It also turns the drain's notices into the toasts of AC-2,
// AC-3 and AC-5 (PO decision 7). Every collaborator is a prop for tests and
// defaults to the app's.

type DataState = "synced" | "syncing" | "offline" | "error";

const GLYPH: Record<DataState, string> = {
  synced: "✓",
  syncing: "↑",
  offline: "⊘",
  error: "!",
};

/** The same precedence as statusLabel: offline, failed, queued, synced. */
function dataState(s: SyncState): DataState {
  if (!s.online) return "offline";
  if (s.failed > 0) return "error";
  if (s.queued > 0) return "syncing";
  return "synced";
}

const drainedCopy = (count: number): string =>
  count === 1
    ? "Back online. 1 change synced."
    : `Back online. ${count} changes synced.`;

type Problem = { seq: number; title: string; message: string };

/** The failed ops, in seq order, each named by its cache row's title. */
async function readProblems(db: CalendarDb): Promise<Problem[]> {
  const failed = (await db.outbox.orderBy("seq").toArray()).filter(
    (op) => op.status === "failed",
  );
  const problems: Problem[] = [];
  for (const op of failed) {
    if (op.seq === undefined) continue;
    let title = "";
    if (op.table === "events" || op.table === "kinds") {
      const row = await cacheTable(db, op.table).get(op.id);
      if (row !== undefined) title = "title" in row ? row.title : row.name;
    }
    problems.push({ seq: op.seq, title, message: op.error?.message ?? "" });
  }
  return problems;
}

export function SyncStatus(props: {
  store?: SyncStateStore;
  drain?: Pick<Drain, "run" | "subscribe">;
  db?: CalendarDb;
  repos?: Repos;
}): JSX.Element {
  const store = props.store ?? syncState;
  const drain = props.drain ?? appDrain;
  const db = props.db ?? appDb;
  const repos = props.repos ?? appRepos;
  const usesApp = props.drain === undefined;
  const state = useSyncState(store);
  const toast = useMaybeToast();
  const [open, setOpen] = useState(false);
  const [problems, setProblems] = useState<Problem[]>([]);

  // The app's indicator is mounted for as long as the user is signed in, so
  // it is where the app's drain learns that the network came back (Block 5).
  useEffect(() => (usesApp ? installOnlineSync() : undefined), [usesApp]);

  useEffect(
    () =>
      drain.subscribe((notice: DrainNotice) => {
        if (toast === null) return;
        if (notice.kind === "drained") {
          toast.showToast({ text: drainedCopy(notice.count) });
        } else if (notice.kind === "conflict") {
          toast.showToast({
            text: conflictCopy(notice.fields),
            tone: "alert",
            action: {
              label: "Redo",
              onClick: () => {
                // The dropped patch again, over the fresh row, as a new op.
                const redo =
                  notice.table === "events"
                    ? enqueueUpdate(
                        db,
                        "events",
                        notice.id,
                        notice.patch as EventPatch,
                      )
                    : enqueueUpdate(
                        db,
                        "kinds",
                        notice.id,
                        notice.patch as KindPatch,
                      );
                void redo.then(() => drain.run());
              },
            },
          });
        } else if (notice.kind === "failed") {
          toast.showToast({
            text: `${notice.title} couldn't sync.`,
            tone: "alert",
            action: {
              label: "Retry",
              onClick: () => {
                void retryOp(db, notice.seq).then(() => drain.run());
              },
            },
          });
        }
      }),
    [drain, toast, db],
  );

  const reload = useCallback(async () => {
    try {
      setProblems(await readProblems(db));
    } catch {
      setProblems([]);
    }
  }, [db]);

  const label = statusLabel(state);
  const data = dataState(state);
  return (
    <div className={styles.root}>
      <div
        role="status"
        aria-live="polite"
        aria-label={label}
        data-state={data}
        className={styles.status}
      >
        <span aria-hidden="true" data-glyph className={styles.glyph}>
          {GLYPH[data]}
        </span>
        <span className={styles.label}>{label}</span>
      </div>
      {state.failed > 0 ? (
        <button
          type="button"
          aria-haspopup="dialog"
          className={styles.problems}
          onClick={() => {
            // Read first, so the dialog opens with its list already filled.
            void reload().then(() => setOpen(true));
          }}
        >
          Show sync problems
        </button>
      ) : null}
      <Dialog
        open={open}
        title="Changes that couldn't sync"
        onClose={() => setOpen(false)}
        actions={
          <button
            type="button"
            className={styles.action}
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        }
      >
        <ul className={styles.list}>
          {problems.map((p) => (
            <li key={p.seq} className={styles.item}>
              <span
                className={styles.problem}
              >{`${p.title}: ${p.message}`}</span>
              <button
                type="button"
                className={styles.action}
                onClick={() => {
                  void retryOp(db, p.seq)
                    .then(() => drain.run())
                    .then(reload);
                }}
              >
                Retry
              </button>
              <button
                type="button"
                className={styles.action}
                data-variant="danger"
                onClick={() => {
                  void discardOp(db, p.seq, repos).then(reload);
                }}
              >
                Discard
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}
