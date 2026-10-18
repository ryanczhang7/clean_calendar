import type { JSX } from "react";
import { useLocation, useNavigate } from "react-router";
import { useBreakpoint } from "./media";
import {
  isCalendarPath,
  parsePath,
  periodOf,
  periodPath,
  readView,
  storeView,
  type View,
} from "./period";
import { PeriodNav } from "./PeriodNav";
import { useSelected } from "./selection";
import { useCalendarKeys } from "./useCalendarKeys";
import { ViewSwitcher } from "./ViewSwitcher";

// CAL-011 AC-1 to AC-4 and AC-6, Contract Block 9. Mounted once in the
// shell's toolbar slot, so it reads the period from the pathname (a layout
// route's useParams does not see a child's :ym). Off the calendar routes it
// renders nothing; on a calendar path that does not parse it shows today's
// month, as the page does (PO decision 13).

export function CalendarToolbar(
  props: { now?: () => Date } = {},
): JSX.Element | null {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const phone = useBreakpoint() === "phone";
  const selected = useSelected();
  const today = (props.now ?? (() => new Date()))();
  const calendar = isCalendarPath(pathname);
  const period =
    parsePath(pathname, readView(), today) ?? periodOf("month", today, phone);

  const onToday = () =>
    navigate(periodPath(periodOf(period.view, today, phone)));
  const onView = (view: View) => {
    storeView(view);
    navigate(periodPath(periodOf(view, selected ?? period.date, phone)));
  };

  useCalendarKeys({ enabled: calendar, onToday, onView });

  if (!calendar) return null;
  return (
    <>
      <PeriodNav
        period={period}
        phone={phone}
        today={today}
        onNavigate={navigate}
      />
      <ViewSwitcher view={period.view} onChange={onView} />
    </>
  );
}
