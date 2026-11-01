import { format } from "date-fns";
import { type JSX, useMemo } from "react";
import type { Event } from "../data/rows";
import { daysFrom, weekStart } from "../domain/timeGrid";
import type { EventsStore } from "../sync/eventsStore";
import { type KindsStore, useKinds } from "../sync/kindsStore";
import type { OverridesStore } from "../sync/overridesStore";
import { useOccurrences } from "../sync/useOccurrences";
import { useBreakpoint } from "./media";
import type { ChipCommand } from "./EventChip";
import { TimeGrid } from "./TimeGrid";
import type { DropTarget } from "./useChipDrag";

// CAL-010 AC-3 and AC-6, Contract Block 4 (PO decisions 1 and 4). The view
// owns its data; no heading of its own (the <h1> is CalendarPage's). On
// phone the week is a three-day window: the day before, the day, the day
// after; otherwise Monday to Sunday.

const nextMidnight = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

export function WeekView(props: {
  /** Any instant on the selected day. */
  selected: Date;
  now: Date;
  kinds?: KindsStore;
  events?: EventsStore;
  overrides?: OverridesStore;
  /** CAL-012 Block 6: passed through to the grid. */
  onSlotActivate?: (start: Date, cell: HTMLElement) => void;
  /** CAL-012 Block 6: passed through to the grid. */
  onOpenEvent?: (event: Event, chip: HTMLElement) => void;
  /** CAL-013 Block 5: passed through to the grid. */
  onChipCommand?: (
    event: Event,
    command: ChipCommand,
    chip: HTMLElement,
  ) => void;
  /** CAL-013 Block 5: passed through to the grid. */
  onDropEvent?: (event: Event, target: DropTarget) => void;
}): JSX.Element {
  const { selected, now } = props;
  const phone = useBreakpoint() === "phone";
  const y = selected.getFullYear();
  const m = selected.getMonth();
  const d = selected.getDate();
  const days = useMemo(
    () =>
      phone
        ? daysFrom(new Date(y, m, d - 1), 3)
        : daysFrom(weekStart(new Date(y, m, d)), 7),
    [phone, y, m, d],
  );
  const first = days[0] as Date;
  const last = days[days.length - 1] as Date;
  const label = phone
    ? `${format(first, "EEEE d MMMM")} to ${format(last, "EEEE d MMMM yyyy")}`
    : `Week of ${format(first, "d MMMM yyyy")}`;
  const events = useOccurrences(first, nextMidnight(last), {
    events: props.events,
    overrides: props.overrides,
  });
  const kinds = useKinds(props.kinds);
  return (
    <TimeGrid
      days={days}
      label={label}
      events={events.events}
      kinds={kinds}
      now={now}
      loading={events.status !== "ready"}
      onSlotActivate={props.onSlotActivate}
      onOpenEvent={props.onOpenEvent}
      onChipCommand={props.onChipCommand}
      onDropEvent={props.onDropEvent}
      tabStop={{ day: new Date(y, m, d), hour: 9 }}
    />
  );
}
