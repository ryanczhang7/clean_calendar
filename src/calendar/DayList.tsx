import { format } from "date-fns";
import { type JSX, useMemo } from "react";
import type { Event } from "../data/rows";
import type { KindsSnapshot } from "../sync/kindsStore";
import styles from "./DayList.module.css";
import { EventChip } from "./EventChip";
import { eventsOnDay, useChipKind } from "./MonthView";

// CAL-011 AC-7, Contract Block 8 (layout.md "Phone specifics", voice.md
// "Empty day list"): on the phone the selected day's events sit below the
// month grid, one 56px row per chip. The chips keep their default tab order
// here - this list is how a keyboard reaches them.

export function DayList(props: {
  date: Date;
  events: Event[];
  kinds: KindsSnapshot;
  onAdd?: () => void;
}): JSX.Element {
  const { date, events, kinds } = props;
  const label = format(date, "EEE d MMM");
  const day = useMemo(() => eventsOnDay(events, date), [events, date]);
  const chipKind = useChipKind(kinds);
  return (
    <section aria-label={`Events on ${label}`} className={styles.list}>
      {day.length > 0 ? (
        <ul className={styles.rows}>
          {day.map((e) => (
            <li key={e.id} className={styles.row}>
              <EventChip event={e} kind={chipKind(e)} />
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.empty}>
          <p>{`No events on ${label}`}</p>
          <button type="button" className={styles.add} onClick={props.onAdd}>
            Add
          </button>
        </div>
      )}
    </section>
  );
}
