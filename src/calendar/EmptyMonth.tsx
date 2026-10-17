import { type JSX, useId } from "react";
import { Link } from "react-router";
import styles from "./EmptyMonth.module.css";

// CAL-009 AC-7, Contract Block 7. Copy is voice.md, "Empty month", verbatim.
// "or add an event" has no handler yet: the sheet it opens is CAL-012's (PO
// decision 4).
export function EmptyMonth(props: { onAddEvent?: () => void }): JSX.Element {
  const id = useId();
  return (
    <section aria-labelledby={id} className={styles.card}>
      <h2 id={id} className={styles.title}>
        Nothing this month
      </h2>
      <p className={styles.line}>
        Share a booking email to the app, or paste it here, and it becomes an
        event.
      </p>
      <Link to="/capture" className={styles.primary}>
        Capture a booking
      </Link>
      <button
        type="button"
        className={styles.secondary}
        onClick={() => props.onAddEvent?.()}
      >
        or add an event
      </button>
    </section>
  );
}
