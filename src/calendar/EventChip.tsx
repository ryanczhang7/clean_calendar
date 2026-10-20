import { format } from "date-fns";
import {
  type CSSProperties,
  type JSX,
  type MouseEvent,
  type SyntheticEvent,
  useRef,
} from "react";
import type { Event, Kind } from "../data/rows";
import { chipText } from "../domain/colour";
import { MIN_BLOCK_HEIGHT } from "../domain/timeGrid";
import styles from "./EventChip.module.css";
import { useColorScheme } from "./media";

// CAL-009 AC-3, AC-4, Contract Block 5. A timed chip carries its colour on a
// dot and keeps grid text; an all-day chip is filled in the kind's colour.
// A removed kind sets no inline colour: EventChip.module.css's neutral rule
// does. CAL-012 adds the optional onActivate that opens the sheet.

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
  /** "chip" (default) is CAL-009's month chip; "block" is the week/day filled block. */
  variant?: "chip" | "block";
  /** Block only: px, decides whether the time gets a second line. */
  height?: number;
  /** CAL-011 Block 7: -1 inside the month grid (one tab stop); absent → no attribute. */
  tabIndex?: -1 | 0;
  /** CAL-012 Block 6: the chip was activated (click, Enter or Space). The click stops here, so a chip in a month cell does not also activate the cell. Absent → no handler. */
  onActivate?: (event: Event) => void;
}): JSX.Element {
  const { event, kind, tabIndex, onActivate } = props;
  const onClick =
    onActivate === undefined
      ? undefined
      : (e: MouseEvent<HTMLButtonElement>) => {
          e.stopPropagation();
          onActivate(event);
        };
  const dark = useColorScheme() === "dark";
  const live = kind.status === "live" ? kind.kind : null;
  const colour = live === null ? null : dark ? live.colorDark : live.colorLight;
  const filled: CSSProperties | undefined =
    colour !== null
      ? { background: colour, color: chipText(colour).text }
      : undefined;
  if (props.variant === "block") {
    // CAL-010 Block 2: filled like the all-day chip, no dot; the time gets a
    // second line only when the block is at least two text rows tall
    // (2 x MIN_BLOCK_HEIGHT = 40px, PO decision 3).
    return (
      <button
        type="button"
        aria-label={chipName(event, kind)}
        className={`${styles.chip} ${styles.block}`}
        data-allday={event.allDay ? "true" : "false"}
        data-neutral={kind.status === "removed" ? "true" : undefined}
        data-variant="block"
        style={filled}
        tabIndex={tabIndex}
        onClick={onClick}
      >
        <span aria-hidden="true" className={styles.initial}>
          {kind.status === "live" ? kind.initial : "?"}
        </span>
        <span aria-hidden="true" className={styles.title}>
          {event.title}
        </span>
        {(props.height ?? 0) >= 2 * MIN_BLOCK_HEIGHT && (
          <span aria-hidden="true" className={styles.time}>
            {`${hhmm(event.startsAt)} – ${hhmm(event.endsAt)}`}
          </span>
        )}
      </button>
    );
  }
  const fill = event.allDay ? filled : undefined;
  return (
    <button
      type="button"
      aria-label={chipName(event, kind)}
      className={styles.chip}
      data-allday={event.allDay ? "true" : "false"}
      data-neutral={kind.status === "removed" ? "true" : undefined}
      style={fill}
      tabIndex={tabIndex}
      onClick={onClick}
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

/**
 * CAL-012 Block 6: `onActivate` carries the event only, and a view that opens
 * the sheet needs the chip too (focus goes back to it on close). The chip's
 * click - from a pointer, Enter or Space alike - passes through the view's
 * container in the capture phase first, so the container records the button
 * there and `onActivate` hands it on. Absent `onOpenEvent`, no handler.
 */
export function useChipOpener(
  onOpenEvent: ((event: Event, chip: HTMLElement) => void) | undefined,
): {
  onClickCapture: (e: SyntheticEvent) => void;
  onActivate: ((event: Event) => void) | undefined;
} {
  const last = useRef<HTMLElement | null>(null);
  return {
    onClickCapture: (e) => {
      const target = e.target;
      last.current =
        target instanceof Element
          ? target.closest<HTMLElement>("button")
          : null;
    },
    onActivate:
      onOpenEvent === undefined
        ? undefined
        : (event) => {
            const chip = last.current;
            last.current = null;
            if (chip !== null) onOpenEvent(event, chip);
          },
  };
}
