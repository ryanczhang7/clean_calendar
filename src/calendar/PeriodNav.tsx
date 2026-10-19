import type { JSX } from "react";
import {
  navNames,
  type Period,
  periodOf,
  periodPath,
  periodTitle,
  shiftPeriod,
} from "./period";
import styles from "./PeriodNav.module.css";

// CAL-011 AC-1, AC-2, Contract Block 3 (components.md, "App shell and top
// bar"): Today, previous, next, then the period title as the page's one
// <h1>. Never disabled; every button reports a path, the caller navigates.

export function PeriodNav(props: {
  period: Period;
  phone: boolean;
  today: Date;
  onNavigate: (path: string) => void;
}): JSX.Element {
  const { period, phone, today, onNavigate } = props;
  const names = navNames(period.view, phone);
  const go = (dir: 1 | -1) => () =>
    onNavigate(periodPath(shiftPeriod(period, dir, phone)));
  return (
    <div className={styles.nav}>
      <button
        type="button"
        className={styles.today}
        onClick={() =>
          onNavigate(periodPath(periodOf(period.view, today, phone)))
        }
      >
        Today
      </button>
      <button
        type="button"
        className={styles.icon}
        aria-label={names.previous}
        onClick={go(-1)}
      >
        <span aria-hidden="true">‹</span>
      </button>
      <button
        type="button"
        className={styles.icon}
        aria-label={names.next}
        onClick={go(1)}
      >
        <span aria-hidden="true">›</span>
      </button>
      <h1 tabIndex={-1} className={styles.title}>
        {periodTitle(period, phone)}
      </h1>
    </div>
  );
}
