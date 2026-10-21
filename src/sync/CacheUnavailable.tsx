import type { JSX } from "react";
import styles from "./CacheUnavailable.module.css";

// CAL-014 AC-6, Contract Block 6: the full-page error shown instead of the
// calendar when IndexedDB cannot be opened (components.md, "Full-page
// error"; the copy is voice.md's).

const reload = () => window.location.reload();

export function CacheUnavailable(props: {
  onReload?: () => void;
}): JSX.Element {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Can't open the calendar</h1>
        <p className={styles.line}>Reload to try again.</p>
        <button
          type="button"
          className={styles.button}
          onClick={props.onReload ?? reload}
        >
          Reload
        </button>
      </div>
    </main>
  );
}
