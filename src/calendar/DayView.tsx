import { format } from "date-fns";
import { type JSX, useMemo } from "react";
import type { Event } from "../data/rows";
import type { EventsStore } from "../sync/eventsStore";
import { type KindsStore, useKinds } from "../sync/kindsStore";
import type { OverridesStore } from "../sync/overridesStore";
import { useOccurrences } from "../sync/useOccurrences";
import type { ChipCommand } from "./EventChip";
import { TimeGrid } from "./TimeGrid";
import type { DropTarget } from "./useChipDrag";

// CAL-010 AC-3 (the day half), Contract Block 5. One column at every
// breakpoint; the range is [day 00:00, next midnight).

export function DayView(props: {
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
  const y = selected.getFullYear();
  const m = selected.getMonth();
  const d = selected.getDate();
  const days = useMemo(() => [new Date(y, m, d)], [y, m, d]);
  const day = days[0] as Date;
  const events = useOccurrences(day, new Date(y, m, d + 1), {
    events: props.events,
    overrides: props.overrides,
  });
  const kinds = useKinds(props.kinds);
  return (
    <TimeGrid
      days={days}
      label={format(day, "EEEE d MMMM yyyy")}
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
