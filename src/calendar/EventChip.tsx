import { format } from "date-fns";
import type { CSSProperties, JSX } from "react";
import type { Event, Kind } from "../data/rows";
import { chipText } from "../domain/colour";
import styles from "./EventChip.module.css";
import { useColorScheme } from "./media";

// CAL-009 AC-3, AC-4, Contract Block 5. A timed chip carries its colour on a
// dot and keeps grid text; an all-day chip is filled in the kind's colour.
// A removed kind sets no inline colour: EventChip.module.css's neutral rule
// does. No onClick yet - opening the sheet is CAL-012.

export type ChipKind =
  | { status: "live"; kind: Kind; initial: string }
  /** Soft-deleted, or an id the store does not know. */
  | { status: "removed" };

const hhmm = (d: Date) => format(d, "HH:mm");

/** The accessible name, exactly as Block 5's table. */
export function chipName(event: Event, kind: ChipKind): string {
  const when = event.allDay
    ? "all day"
    : `${hhmm(event.startsAt)} to ${hhmm(event.endsAt)}`;
  return kind.status === "live"
    ? `${event.title}, ${kind.kind.name}, ${when}`
    : `${event.title}, ${when}, kind removed`;
}

export function EventChip(props: {
  event: Event;
  kind: ChipKind;
}): JSX.Element {
  const { event, kind } = props;
  const dark = useColorScheme() === "dark";
  const live = kind.status === "live" ? kind.kind : null;
  const colour = live === null ? null : dark ? live.colorDark : live.colorLight;
  const fill: CSSProperties | undefined =
    event.allDay && colour !== null
      ? { background: colour, color: chipText(colour).text }
      : undefined;
  return (
    <button
      type="button"
      aria-label={chipName(event, kind)}
      className={styles.chip}
      data-allday={event.allDay ? "true" : "false"}
      data-neutral={kind.status === "removed" ? "true" : undefined}
      style={fill}
    >
      <span aria-hidden="true" className={styles.initial}>
        {kind.status === "live" ? kind.initial : "?"}
      </span>
      {event.allDay ? (
        <span aria-hidden="true" className={styles.text}>
          {event.title}
        </span>
      ) : (
        <>
          <span
            aria-hidden="true"
            className={styles.dot}
            style={colour !== null ? { background: colour } : undefined}
          />
          <span aria-hidden="true" className={styles.text}>
            {`${hhmm(event.startsAt)} ${event.title}`}
          </span>
        </>
      )}
    </button>
  );
}
