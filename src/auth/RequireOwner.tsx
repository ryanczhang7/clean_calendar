import { type JSX, useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { kindsStore } from "../sync/kindsStore";
import { Refusal, useFocusHeadingWhenSettled } from "./SignInPage";
import { rememberPath, useSession } from "./session";

/**
 * The layout route around AppShell (CAL-003 Contract, Gate). The owner sees
 * the app once the default kinds are seeded (CAL-006 Block 6); a signed-out
 * visitor is sent to /signin with the path remembered; anyone else sees the
 * refusal instead of any app route.
 */
export function RequireOwner(): JSX.Element | null {
  const session = useSession();
  const location = useLocation();
  const isOwner = session.status === "owner";
  const [seedSettled, setSeedSettled] = useState(false);

  // Once per mount; StrictMode's second run shares the store's in-flight
  // promise. Whatever the outcome the page is shown: an unavailable seed
  // never locks the owner out, and the next sign-in tries again.
  useEffect(() => {
    if (!isOwner) return;
    let live = true;
    void kindsStore.ensureSeeded().then(() => {
      if (live) setSeedSettled(true);
    });
    return () => {
      live = false;
    };
  }, [isOwner]);

  // The owner's page heading appears with the Outlet, so focus waits for the
  // seed to settle rather than firing against a tree with no <h1>.
  useFocusHeadingWhenSettled(
    isOwner && !seedSettled ? "loading" : session.status,
  );

  switch (session.status) {
    case "loading":
      return null;
    case "signed-out":
      rememberPath(location.pathname + location.search);
      return <Navigate to="/signin" replace />;
    case "other":
      return <Refusal />;
    case "owner":
      return seedSettled ? <Outlet /> : null;
  }
}
