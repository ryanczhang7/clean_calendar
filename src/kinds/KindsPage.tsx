import { type JSX, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { Kind } from "../data/rows";
import { type KindActions, kindActions } from "../sync/kindActions";
import { type KindsStore, kindsStore, useKinds } from "../sync/kindsStore";
import { KindEditor } from "./KindEditor";
import { KindList } from "./KindList";
// The walkthrough's screen with a different title and Back instead of Done
// (components.md), so it shares the walkthrough's styles (Contract Block 3).
import styles from "./WalkthroughPage.module.css";

// CAL-008, Contract Block 3: the "Event kinds" page at /kinds. `?kind=` opens
// an editor once the kinds are ready (PO decision 4); Back returns to the
// calendar route the page was reached from, carried as `state.from` (PO
// decision 3), else to "/".

/** `/` or a month, week or day view. Kept local: RequireOwner has its own. */
function isCalendarRoute(pathname: string): boolean {
  return pathname === "/" || /^\/(month|week|day)\//.test(pathname);
}

function backTarget(state: unknown): string {
  const from =
    typeof state === "object" && state !== null && "from" in state
      ? state.from
      : undefined;
  return typeof from === "string" && isCalendarRoute(from) ? from : "/";
}

export function KindsPage(
  props: { store?: KindsStore; actions?: KindActions } = {},
): JSX.Element {
  const { store = kindsStore, actions = kindActions } = props;
  const { status, kinds } = useKinds(store);
  const location = useLocation();
  const navigate = useNavigate();
  // undefined: no editor; null: "Add kind"; a kind: editing it.
  const [editing, setEditing] = useState<Kind | null | undefined>(undefined);

  const { search } = location;
  useEffect(() => {
    if (status !== "ready") return;
    const wanted = new URLSearchParams(search).get("kind");
    if (wanted === null) return;
    if (wanted === "new") {
      setEditing(null);
      return;
    }
    const live = store.getSnapshot().kinds.find((k) => k.id === wanted);
    if (live !== undefined) setEditing(live);
  }, [status, search, store]);

  return (
    <div className={styles.page}>
      <h1 tabIndex={-1} className={styles.title}>
        Event kinds
      </h1>
      <KindList kinds={kinds} onEdit={setEditing} />
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => setEditing(null)}
        >
          Add kind
        </button>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => navigate(backTarget(location.state))}
        >
          Back
        </button>
      </div>
      {editing !== undefined ? (
        <KindEditor
          open
          kind={editing}
          kinds={kinds}
          onClose={() => setEditing(undefined)}
          actions={actions}
        />
      ) : null}
    </div>
  );
}
