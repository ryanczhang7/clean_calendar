import { format } from "date-fns";
import { type JSX, useMemo } from "react";
import type { Event } from "../data/rows";
import type { KindsSnapshot } from "../sync/kindsStore";
import { chipKey } from "../sync/useOccurrences";
import styles from "./DayList.module.css";
import { EventChip, useChipOpener } from "./EventChip";
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
  /** CAL-012 Block 6: a chip in the list; the phone's path to the edit sheet. */
  onOpenEvent?: (event: Event, chip: HTMLElement) => void;
}): JSX.Element {
  const { date, events, kinds } = props;
  const chips = useChipOpener(props.onOpenEvent);
  const label = format(date, "EEE d MMM");
  const day = useMemo(() => eventsOnDay(events, date), [events, date]);
  const chipKind = useChipKind(kinds);
  return (
    <section aria-label={`Events on ${label}`} className={styles.list}>
      {day.length > 0 ? (
        <ul className={styles.rows} onClickCapture={chips.onClickCapture}>
          {day.map((e) => (
            <li key={chipKey(e)} className={styles.row}>
              <EventChip
                event={e}
                kind={chipKind(e)}
                onActivate={chips.onActivate}
              />
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
