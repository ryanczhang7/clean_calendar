import type { CSSProperties, JSX } from "react";
import type { Kind } from "../data/rows";
import { chipText } from "../domain/colour";
import styles from "./KindList.module.css";

// CAL-007, Contract Block 4. One row per kind in the order given (the
// caller's store has already sorted them). The swatch carries both themes'
// colours as custom properties and KindList.module.css picks one with
// prefers-color-scheme, so nothing here asks which theme is on (PO decision
// 3). No reorder controls in v1 (PO decision 7). CAL-008 Block 1 exports the
// initial and the swatch so the kind legend renders the same markup.

/** The first code point of the trimmed name, upper-cased; "" for a blank name. */
export function initialOf(name: string): string {
  return (Array.from(name.trim())[0] ?? "").toUpperCase();
}

function swatchStyle(kind: Kind): CSSProperties {
  return {
    "--swatch-light": kind.colorLight,
    "--swatch-dark": kind.colorDark,
    "--swatch-text-light": chipText(kind.colorLight).text,
    "--swatch-text-dark": chipText(kind.colorDark).text,
  } as CSSProperties;
}

/** The kind's swatch: its initial on its colour, hidden from assistive tech. */
export function KindSwatch(props: { kind: Kind }): JSX.Element {
  const { kind } = props;
  return (
    <span
      aria-hidden="true"
      className={styles.swatch}
      style={swatchStyle(kind)}
    >
      {initialOf(kind.name)}
    </span>
  );
}

export function KindList(props: {
  kinds: Kind[];
  onEdit: (kind: Kind) => void;
}): JSX.Element {
  const { kinds, onEdit } = props;
  return (
    <ul aria-label="Kinds" className={styles.list}>
      {kinds.map((kind) => (
        <li key={kind.id} className={styles.row}>
          <KindSwatch kind={kind} />
          <span className={styles.name}>{kind.name}</span>
          <button
            type="button"
            aria-label={`Edit ${kind.name}`}
            className={styles.edit}
            onClick={() => onEdit(kind)}
          >
            Edit
          </button>
        </li>
      ))}
    </ul>
  );
}
