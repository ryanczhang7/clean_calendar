import { useEffect } from "react";
import { Outlet, type RouteObject, useLocation } from "react-router";
import { SignInPage } from "../auth/SignInPage";
import { CalendarPage } from "../calendar/CalendarPage";
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
 */
export function RouteFocus(): null {
  const { pathname } = useLocation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: the pathname is the trigger, not an input
  useEffect(() => {
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
        element: <AppShell />,
        children: [
          { path: "/", element: <CalendarPage /> },
          { path: "/month/:ym", element: <CalendarPage /> },
          { path: "/week/:date", element: <CalendarPage /> },
          { path: "/day/:date", element: <CalendarPage /> },
          { path: "/welcome", element: <WalkthroughPage /> },
          { path: "/kinds", element: <KindsPage /> },
          { path: "/capture", element: <CapturePage /> },
          { path: "/capture/confirm", element: <ConfirmPage /> },
          { path: "/settings/notifications", element: <NotificationsPage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
      // Outside the shell: components.md, Sign-in screen (a centred card, no
      // top bar).
      { path: "/signin", element: <SignInPage /> },
    ],
  },
];
