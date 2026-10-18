import { useEffect } from "react";
import { Outlet, type RouteObject, useLocation } from "react-router";
import { RequireOwner } from "../auth/RequireOwner";
import { SignInPage } from "../auth/SignInPage";
import { CalendarPage } from "../calendar/CalendarPage";
import { CalendarToolbar } from "../calendar/CalendarToolbar";
import { CapturePage } from "../capture/CapturePage";
import { ConfirmPage } from "../capture/ConfirmPage";
import { KindsPage } from "../kinds/KindsPage";
import { WalkthroughPage } from "../kinds/WalkthroughPage";
import { NotificationsPage } from "../reminders/NotificationsPage";
import { AppShell } from "./AppShell";
import { NotFoundPage } from "./NotFoundPage";

/**
 * Moves focus to the page's <h1> on first render and on every pathname
 * change (accessibility.md, Focus). Every page heading carries
 * tabIndex={-1}, and nothing in the shell above the page is an <h1>.
 * On first load the session is still loading when this runs, so the gate
 * and the sign-in page also focus the <h1> once the session settles
 * (useFocusHeadingWhenSettled, CAL-003).
 * CAL-011 Block 9: a navigation with `state: { focus: "grid" }` - the month
 * grid following a key across a month - leaves focus where the grid put it.
 */
export function RouteFocus(): null {
  const { pathname, state } = useLocation();
  const keepFocus =
    (state as { focus?: unknown } | null | undefined)?.focus === "grid";
  // biome-ignore lint/correctness/useExhaustiveDependencies: the pathname is the trigger, not an input
  useEffect(() => {
    if (keepFocus) return;
    document.querySelector<HTMLElement>("h1")?.focus();
  }, [pathname]);
  return null;
}

/** A pathless root over both layouts, so RouteFocus runs under each. */
function FocusLayout() {
  return (
    <>
      <Outlet />
      <RouteFocus />
    </>
  );
}

export const routes: RouteObject[] = [
  {
    element: <FocusLayout />,
    children: [
      {
        // CAL-003: every shell route is the owner's only.
        element: <RequireOwner />,
        children: [
          {
            element: <AppShell toolbar={<CalendarToolbar />} />,
            children: [
              { path: "/", element: <CalendarPage /> },
              { path: "/month/:ym", element: <CalendarPage /> },
              { path: "/week/:date", element: <CalendarPage /> },
              { path: "/day/:date", element: <CalendarPage /> },
              { path: "/welcome", element: <WalkthroughPage /> },
              { path: "/kinds", element: <KindsPage /> },
              { path: "/capture", element: <CapturePage /> },
              { path: "/capture/confirm", element: <ConfirmPage /> },
              {
                path: "/settings/notifications",
                element: <NotificationsPage />,
              },
              { path: "*", element: <NotFoundPage /> },
            ],
          },
        ],
      },
      // Outside the shell: components.md, Sign-in screen (a centred card, no
      // top bar).
      { path: "/signin", element: <SignInPage /> },
    ],
  },
];
