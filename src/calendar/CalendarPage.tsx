import type { JSX } from "react";
import { useParams } from "react-router";
import { monthGrid } from "../domain/monthGrid";
import { type EventsStore, useEventsInRange } from "../sync/eventsStore";
import { type KindsStore, useKinds } from "../sync/kindsStore";
import { MonthView } from "./MonthView";

// CAL-009 Contract, Block 8. The page <h1> stays "Calendar" (PO decision 1);
// the grid carries the month's name. /week/:date and /day/:date show the
// month containing that date until CAL-010 and CAL-011 (PO decision 2).

const YEAR_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE = /^(\d{4})-(0[1-9]|1[0-2])-(\d{2})$/;

type YearMonth = { year: number; month: number };

/** The month a route names, or null when it names none that parses. */
function monthOf(params: { ym?: string; date?: string }): YearMonth | null {
  const ym = params.ym === undefined ? null : YEAR_MONTH.exec(params.ym);
  if (ym !== null) return { year: Number(ym[1]), month: Number(ym[2]) };
  const date = params.date === undefined ? null : DATE.exec(params.date);
  if (date === null) return null;
  const [year, month, day] = [
    Number(date[1]),
    Number(date[2]),
    Number(date[3]),
  ];
  // A real calendar date: 2026-02-30 does not parse.
  if (new Date(year, month - 1, day).getDate() !== day) return null;
  return { year, month };
}

const nextMidnight = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

export function CalendarPage(
  props: {
    kinds?: KindsStore;
    events?: EventsStore;
    /** Injected clock; default `() => new Date()`. */
    now?: () => Date;
  } = {},
): JSX.Element {
  const params = useParams();
  const today = (props.now ?? (() => new Date()))();
  const { year, month } = monthOf(params) ?? {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  };
  const grid = monthGrid(year, month);
  const first = grid[0]?.date ?? today;
  const last = grid[grid.length - 1]?.date ?? today;
  const events = useEventsInRange(first, nextMidnight(last), props.events);
  const kinds = useKinds(props.kinds);
  return (
    <>
      <h1 tabIndex={-1}>Calendar</h1>
      <MonthView
        year={year}
        month={month}
        events={events.events}
        kinds={kinds}
        today={today}
        loading={events.status !== "ready"}
      />
    </>
  );
}
