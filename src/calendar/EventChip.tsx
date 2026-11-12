import { format } from "date-fns";
import {
  type CSSProperties,
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
  type MouseEventHandler,
  type PointerEventHandler,
  type SyntheticEvent,
  useContext,
  useRef,
} from "react";
import type { Event, Kind } from "../data/rows";
import { chipText } from "../domain/colour";
import { reminderPhrase } from "../domain/reminder";
import { MIN_BLOCK_HEIGHT } from "../domain/timeGrid";
import { chipKey } from "../sync/useOccurrences";
import { ChipRemindersContext } from "./chipReminders";
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

/** CAL-013 Block 5: what a chip's key asks the page to do. */
export type ChipCommand =
  | "left"
  | "right"
  | "up"
  | "down"
  | "lengthen"
  | "shorten"
  | "delete";

/** The command a keydown maps to, or null when the key is left alone. */
function commandFor(e: KeyboardEvent<HTMLElement>): ChipCommand | null {
  if (e.ctrlKey || e.metaKey) return null;
  if (e.key === "Delete" || e.key === "Backspace") {
    return e.altKey ? null : "delete";
  }
  if (!e.altKey) return null;
  if (e.shiftKey) {
    if (e.key === "ArrowDown") return "lengthen";
    if (e.key === "ArrowUp") return "shorten";
    return null;
  }
  switch (e.key) {
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    default:
      return null;
  }
}

/** CAL-024 Block 6: a 12px loop of two arrows; aria-hidden, because the name says "repeats". */
function RepeatGlyph(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      data-glyph="repeat"
      className={styles.repeat}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      focusable="false"
    >
      <path
        d="M2 5.5V5a2 2 0 0 1 2-2h5.5M8 1l1.5 2L8 5M10 6.5V7a2 2 0 0 1-2 2H2.5M4 11 2.5 9 4 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** CAL-057 Block 5: a 12px bell; aria-hidden, because the name says "reminder". */
function BellGlyph(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      data-glyph="bell"
      className={styles.bell}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      focusable="false"
    >
      <path
        d="M3 8.5V5.5a3 3 0 0 1 6 0v3l1 1H2Zm2 1.5a1 1 0 0 0 2 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The accessible name, exactly as Block 5's table. */
export function chipName(
  event: Event,
  kind: ChipKind,
  /** CAL-057 Block 5: the live template's minutesBefore; absent, no reminder part. */
  reminderMinutes?: number,
): string {
  const when = event.allDay
    ? "all day"
    : `${hhmm(event.startsAt)} to ${hhmm(event.endsAt)}`;
  const base =
    kind.status === "live"
      ? `${event.title}, ${kind.kind.name}, ${when}`
      : `${event.title}, ${when}, kind removed`;
  // CAL-024 Block 6: the repeat after the time or kind-removed part, before
  // the sync marker.
  const repeated =
    event.recurrence === null
      ? base
      : `${base}, repeats ${event.recurrence.freq}`;
  // CAL-057 Block 5: the reminder after the repeat, before the sync marker.
  const name =
    reminderMinutes === undefined
      ? repeated
      : `${repeated}, reminder ${reminderPhrase(reminderMinutes)}`;
  // CAL-015 Block 6: the sync marker comes last (accessibility.md order).
  if (event.sync === "saving") return `${name}, saving`;
  if (event.sync === "failed") return `${name}, not synced`;
  return name;
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
  /** CAL-013 Block 5: a mapped key (Delete, Alt+arrows, Alt+Shift+Down/Up) - prevented and stopped here. Absent → no handler. */
  onCommand?: (event: Event, command: ChipCommand, chip: HTMLElement) => void;
  /** CAL-013 Block 4: useChipDrag's chipProps(event), spread onto the button. */
  dragProps?: {
    onPointerDown?: PointerEventHandler<HTMLElement>;
    onClickCapture?: MouseEventHandler<HTMLElement>;
  };
}): JSX.Element {
  const { event, kind, tabIndex, onActivate, onCommand, dragProps } = props;
  // CAL-025 Block 3: an occurrence chip moves and deletes like any other; the
  // page asks which events (CAL-024 Block 11's guard is gone).
  const onKeyDown =
    onCommand === undefined
      ? undefined
      : (e: KeyboardEvent<HTMLButtonElement>) => {
          const command = commandFor(e);
          if (command === null) return;
          e.preventDefault();
          e.stopPropagation();
          onCommand(event, command, e.currentTarget);
        };
  const onClick =
    onActivate === undefined
      ? undefined
      : (e: MouseEvent<HTMLButtonElement>) => {
          e.stopPropagation();
          onActivate(event);
        };
  // CAL-015 Block 6: a refused op's "!" after the title; nothing otherwise.
  const badge =
    event.sync === "failed" ? (
      <span aria-hidden="true" data-badge="true" className={styles.badge}>
        !
      </span>
    ) : null;
  const repeatGlyph = event.recurrence === null ? null : <RepeatGlyph />;
  const reminderMinutes = useContext(ChipRemindersContext).get(event.id);
  const bellGlyph = reminderMinutes === undefined ? null : <BellGlyph />;
  const name = chipName(event, kind, reminderMinutes);
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
        aria-label={name}
        className={`${styles.chip} ${styles.block}`}
        data-allday={event.allDay ? "true" : "false"}
        data-neutral={kind.status === "removed" ? "true" : undefined}
        data-variant="block"
        data-event-id={event.id}
        data-chip-key={chipKey(event)}
        data-sync={event.sync}
        style={filled}
        tabIndex={tabIndex}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onPointerDown={dragProps?.onPointerDown}
        onClickCapture={dragProps?.onClickCapture}
      >
        <span aria-hidden="true" className={styles.initial}>
          {kind.status === "live" ? kind.initial : "?"}
        </span>
        <span aria-hidden="true" className={styles.title}>
          {event.title}
        </span>
        {repeatGlyph}
        {bellGlyph}
        {badge}
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
      aria-label={name}
      className={styles.chip}
      data-allday={event.allDay ? "true" : "false"}
      data-neutral={kind.status === "removed" ? "true" : undefined}
      data-event-id={event.id}
      data-chip-key={chipKey(event)}
      data-sync={event.sync}
      style={fill}
      tabIndex={tabIndex}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onPointerDown={dragProps?.onPointerDown}
      onClickCapture={dragProps?.onClickCapture}
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
      {repeatGlyph}
      {bellGlyph}
      {badge}
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
