import { useEffect, useMemo, useSyncExternalStore } from "react";
import { expand, type Override } from "../../shared/recurrence";
import type { Event, EventOverride } from "../data/rows";
import { type EventsStore, eventsInRange, eventsStore } from "./eventsStore";
import { type OverridesStore, overridesStore } from "./overridesStore";

// CAL-024 Contract, Blocks 3 and 4. What the views render: the non-recurring
// events in range, and every recurring series expanded by CAL-023's expander
// with its own overrides. An occurrence is an Event with the SERIES id (so
// opening it edits the series until CAL-025) and its `occurrenceDate`; a
// series' stored row is never shown as itself - occurrence 0 stands in.

export type OccurrencesSnapshot = {
  status: "loading" | "ready" | "unavailable";
  /** Non-recurring events in range and occurrences, by startsAt, ties by id. */
  events: Event[];
};

/** A React key for a chip: the id, plus the occurrence date for an occurrence. */
export function chipKey(event: Event): string {
  return event.occurrenceDate === undefined
    ? event.id
    : `${event.id}@${event.occurrenceDate}`;
}

function toOverride(o: EventOverride): Override {
  return {
    occurrenceDate: o.occurrenceDate,
    cancelled: o.cancelled,
    title: o.title,
    kindId: o.kindId,
    startsAt: o.startsAt,
    endsAt: o.endsAt,
    allDay: o.allDay,
    location: o.location,
    notes: o.notes,
  };
}

/** Pure: `[start, end)`, half-open, as eventsInRange. Inputs are not touched. */
export function occurrencesIn(
  events: readonly Event[],
  overrides: readonly EventOverride[],
  start: Date,
  end: Date,
): Event[] {
  const out: Event[] = [];
  const plain: Event[] = [];
  for (const event of events) {
    if (event.deletedAt !== null) continue;
    const recurrence = event.recurrence;
    if (recurrence === null) {
      plain.push(event);
      continue;
    }
    const own = overrides.filter((o) => o.eventId === event.id).map(toOverride);
    const series = { ...event, recurrence };
    for (const o of expand(series, own, { start, end })) {
      out.push({
        ...event,
        title: o.title,
        kindId: o.kindId,
        startsAt: o.startsAt,
        endsAt: o.endsAt,
        allDay: o.allDay,
        location: o.location,
        notes: o.notes,
        occurrenceDate: o.occurrenceDate,
      });
    }
  }
  out.push(...eventsInRange(plain, start, end));
  return out.sort(
    (a, b) =>
      a.startsAt.getTime() - b.startsAt.getTime() ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export function useOccurrences(
  start: Date,
  end: Date,
  stores: { events?: EventsStore; overrides?: OverridesStore } = {},
): OccurrencesSnapshot {
  const events = stores.events ?? eventsStore;
  const overrides = stores.overrides ?? overridesStore;
  const eventsSnapshot = useSyncExternalStore(
    events.subscribe,
    events.getSnapshot,
  );
  const overridesSnapshot = useSyncExternalStore(
    overrides.subscribe,
    overrides.getSnapshot,
  );
  // A store that has never loaded is asked once, from an effect - never
  // during render, as useEventsInRange and useOverrides do.
  useEffect(() => {
    if (events.getSnapshot().status === "loading") void events.refresh();
  }, [events]);
  useEffect(() => {
    if (overrides.getSnapshot().status === "loading") void overrides.refresh();
  }, [overrides]);
  const from = start.getTime();
  const to = end.getTime();
  return useMemo(() => {
    const a = eventsSnapshot.status;
    const b = overridesSnapshot.status;
    const status =
      a === "unavailable" || b === "unavailable"
        ? "unavailable"
        : a === "loading" || b === "loading"
          ? "loading"
          : "ready";
    return {
      status,
      events: occurrencesIn(
        eventsSnapshot.events,
        overridesSnapshot.overrides,
        new Date(from),
        new Date(to),
      ),
    };
  }, [eventsSnapshot, overridesSnapshot, from, to]);
}
