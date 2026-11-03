import { type JSX, useId, useState } from "react";
import { Dialog } from "../ui/Dialog";
import styles from "./EditScopeDialog.module.css";

// CAL-025 Contract, Block 2 (components.md "Edit-scope dialog"; voice.md
// "Dialogs"). Which events a change or a delete of an occurrence applies to:
// an alertdialog with two radios, "This event only" checked on every open.
// The host owns `open`; closed renders nothing, so each open mounts a fresh
// selection, and Dialog focuses the first radio (its first non-danger
// focusable).

export type EditScope = "occurrence" | "series";

const TITLE = {
  change: "Change which events?",
  delete: "Delete which events?",
} as const;

const HELPER =
  "Moving the whole series moves every occurrence by the same amount.";

type Props = {
  /** false → renders nothing. */
  open: boolean;
  /** The title and the confirm button. */
  kind: "change" | "delete";
  /** The write moves startsAt/endsAt: shows the helper under the second option. */
  moving?: boolean;
  /** Cancel, and Escape. */
  onCancel: () => void;
  onConfirm: (scope: EditScope) => void;
};

export function EditScopeDialog(props: Props): JSX.Element | null {
  if (!props.open) return null;
  return <OpenScopeDialog {...props} />;
}

function OpenScopeDialog(props: Props): JSX.Element {
  const { kind, moving = false, onCancel, onConfirm } = props;
  const [scope, setScope] = useState<EditScope>("occurrence");
  const name = useId();
  const helperId = `${name}-helper`;
  const confirm = kind === "change" ? "Save" : "Delete";

  return (
    <Dialog
      open
      role="alertdialog"
      title={TITLE[kind]}
      onClose={onCancel}
      actions={
        <>
          <button type="button" className={styles.button} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            data-variant={kind === "delete" ? "danger" : undefined}
            className={kind === "delete" ? styles.danger : styles.primary}
            onClick={() => onConfirm(scope)}
          >
            {confirm}
          </button>
        </>
      }
    >
      <fieldset className={styles.options}>
        <label className={styles.option}>
          <input
            type="radio"
            name={name}
            value="occurrence"
            checked={scope === "occurrence"}
            onChange={() => setScope("occurrence")}
          />
          This event only
        </label>
        <label className={styles.option}>
          <input
            type="radio"
            name={name}
            value="series"
            checked={scope === "series"}
            aria-describedby={moving ? helperId : undefined}
            onChange={() => setScope("series")}
          />
          All events in the series
        </label>
        {moving ? (
          <p id={helperId} className={styles.helper}>
            {HELPER}
          </p>
        ) : null}
      </fieldset>
    </Dialog>
  );
}
