import { format } from "date-fns";
import { type JSX, useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { dayKey, monthGrid } from "../domain/monthGrid";
import { type EventsStore, useEventsInRange } from "../sync/eventsStore";
import { type KindsStore, useKinds } from "../sync/kindsStore";
import { DayList } from "./DayList";
import { DayView } from "./DayView";
import { useBreakpoint } from "./media";
import { MonthView } from "./MonthView";
import { type Period, parsePath, periodOf, readView } from "./period";
import { setSelected, useSelected } from "./selection";
import { WeekView } from "./WeekView";

// CAL-011 Contract, Block 10. The URL names the view and the period (read
// from the pathname, as the toolbar does); an unparseable calendar URL shows
// today's month. No <h1>: the period title is the toolbar's (PO decision 1).

type Stores = { kinds?: KindsStore; events?: EventsStore };

const nextMidnight = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

const sameMonth = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

/**
 * The selection of a period: in a month, the current selection when it lies
 * there (so a key that moved it across a month keeps it), else today when
 * today is there, else the 1st; in a week or a day, its date.
 */
function selectionFor(period: Period, current: Date | null, today: Date): Date {
  if (period.view !== "month") return period.date;
  if (current !== null && sameMonth(current, period.date)) return current;
  if (sameMonth(today, period.date)) {
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }
  return period.date;
}

function MonthPage(
  props: Stores & { first: Date; today: Date; selected: Date },
): JSX.Element {
  const { first, today, selected } = props;
  const navigate = useNavigate();
  const phone = useBreakpoint() === "phone";
  const year = first.getFullYear();
  const month = first.getMonth() + 1;
  const grid = monthGrid(year, month);
  const from = grid[0]?.date ?? first;
  const to = grid[grid.length - 1]?.date ?? first;
  const events = useEventsInRange(from, nextMidnight(to), props.events);
  const kinds = useKinds(props.kinds);

  // A key or a click that leaves the month moves the page after it, keeping
  // focus in the grid (RouteFocus's "grid" guard, Block 9).
  const onSelect = (date: Date) => {
    setSelected(date);
    if (!sameMonth(date, first)) {
      navigate(`/month/${format(date, "yyyy-MM")}`, {
        state: { focus: "grid" },
      });
    }
  };

  return (
    <>
      <MonthView
        year={year}
        month={month}
        events={events.events}
        kinds={kinds}
        today={today}
        loading={events.status !== "ready"}
        selected={selected}
        onSelect={onSelect}
      />
      {phone && (
        <DayList date={selected} events={events.events} kinds={kinds} />
      )}
    </>
  );
}

export function CalendarPage(
  props: Stores & {
    /** Injected clock; default `() => new Date()`. */
    now?: () => Date;
  } = {},
): JSX.Element {
  const { pathname } = useLocation();
  const phone = useBreakpoint() === "phone";
  const today = (props.now ?? (() => new Date()))();
  const period =
    parsePath(pathname, readView(), today) ?? periodOf("month", today, phone);
  const selected = selectionFor(period, useSelected(), today);
  const periodKey = `${period.view}:${dayKey(period.date)}`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new period is the trigger; `selected` is that render's answer
  useEffect(() => {
    setSelected(selected);
  }, [periodKey]);

  const stores = { kinds: props.kinds, events: props.events };
  if (period.view === "week") {
    return <WeekView selected={period.date} now={today} {...stores} />;
  }
  if (period.view === "day") {
    return <DayView selected={period.date} now={today} {...stores} />;
  }
  return (
    <MonthPage
      {...stores}
      first={period.date}
      today={today}
      selected={selected}
    />
  );
}
