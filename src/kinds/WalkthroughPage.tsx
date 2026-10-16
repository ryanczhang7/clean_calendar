import { type JSX, useState } from "react";
import { useNavigate } from "react-router";
import type { Kind } from "../data/rows";
import { type KindActions, kindActions } from "../sync/kindActions";
import { type KindsStore, kindsStore, useKinds } from "../sync/kindsStore";
import { KindEditor } from "./KindEditor";
import { KindList } from "./KindList";
import { markOnboarded } from "./onboarding";
import styles from "./WalkthroughPage.module.css";

// CAL-007, Contract Block 6: the kinds walkthrough at /welcome, shown before
// the calendar until "Done" marks this device onboarded (RequireOwner
// redirects calendar routes here until then). No reorder controls and no
// Back button; CAL-008 adds the "Event kinds" page over the same list.

export function WalkthroughPage(
  props: { store?: KindsStore; actions?: KindActions } = {},
): JSX.Element {
  const { store = kindsStore, actions = kindActions } = props;
  const { status, kinds } = useKinds(store);
  const navigate = useNavigate();
  // undefined: no editor; null: "Add kind"; a kind: editing it.
  const [editing, setEditing] = useState<Kind | null | undefined>(undefined);

  const doneDisabled = status === "loading" || kinds.length === 0;
  const done = () => {
    if (doneDisabled) return;
    markOnboarded();
    navigate("/", { replace: true });
  };

  return (
    <div className={styles.page}>
      <h1 tabIndex={-1} className={styles.title}>
        Your event kinds
      </h1>
      <p className={styles.line}>
        Every event gets a kind, and the kind decides its colour. Rename,
        recolour or remove these, or add your own. You can change them later.
      </p>
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
          className={styles.primary}
          aria-disabled={doneDisabled ? true : undefined}
          onClick={done}
        >
          Done, show my calendar
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
