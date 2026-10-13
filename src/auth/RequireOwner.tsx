import type { JSX } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { rememberPath, useSession } from "./session";
import { Refusal, useFocusHeadingWhenSettled } from "./SignInPage";

/**
 * The layout route around AppShell (CAL-003 Contract, Gate). The owner sees
 * the app; a signed-out visitor is sent to /signin with the path remembered;
 * anyone else sees the refusal instead of any app route.
 */
export function RequireOwner(): JSX.Element | null {
  const session = useSession();
  const location = useLocation();
  useFocusHeadingWhenSettled(session.status);

  switch (session.status) {
    case "loading":
      return null;
    case "signed-out":
      rememberPath(location.pathname + location.search);
      return <Navigate to="/signin" replace />;
    case "other":
      return <Refusal />;
    case "owner":
      return <Outlet />;
  }
}
