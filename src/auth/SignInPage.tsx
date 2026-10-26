import { type JSX, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  type SessionState,
  signInWithGoogle,
  signOut,
  takeReturnTo,
  useSession,
} from "./session";
import styles from "./SignInPage.module.css";

// CAL-003 Contract, Sign-in screen. components.md "Sign-in screen"; copy from
// voice.md "Sign-in screen".

/**
 * Focus the page's <h1> once the session has settled. RouteFocus keys on the
 * pathname, and on first load the session is still loading when it runs, so
 * the heading that appears afterwards would never be focused
 * (accessibility.md, Focus).
 */
export function useFocusHeadingWhenSettled(status: SessionState["status"]) {
  const settled = status !== "loading";
  useEffect(() => {
    if (settled) document.querySelector<HTMLElement>("h1")?.focus();
  }, [settled]);
}

/** What a signed-in non-owner sees, on /signin and in place of any app route. */
export function Refusal(): JSX.Element {
  const navigate = useNavigate();
  const onSignOut = async () => {
    await signOut();
    navigate("/signin", { replace: true });
  };
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 tabIndex={-1} className={styles.title}>
          Clean Calendar
        </h1>
        {/* The button is a sibling of the alert, so the alert reads only the sentence. */}
        <div role="alert" className={styles.alert}>
          This calendar belongs to another account. Sign out and try the right
          one.
        </div>
        <button type="button" className={styles.button} onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </main>
  );
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    // The first render read navigator.onLine before this effect ran; a change
    // in between fired no listener of ours, so read it again (CAL-038).
    update();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

function SignInCard(): JSX.Element {
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const onClick = () => {
    if (!online || busy) return;
    // Busy for good: the page is about to leave for Google.
    setBusy(true);
    void signInWithGoogle();
  };
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 tabIndex={-1} className={styles.title}>
          Clean Calendar
        </h1>
        <p className={styles.line}>
          Your calendar, with every event coloured by what it is.
        </p>
        <button
          type="button"
          className={styles.button}
          aria-busy={busy ? "true" : undefined}
          aria-disabled={online ? undefined : "true"}
          onClick={onClick}
        >
          Sign in with Google
        </button>
        {online ? null : (
          <p className={styles.offline}>Sign-in needs a connection</p>
        )}
        <p className={styles.footnote}>One account, yours only.</p>
      </div>
    </main>
  );
}

export function SignInPage(): JSX.Element | null {
  const session = useSession();
  const navigate = useNavigate();
  const sent = useRef(false);
  useFocusHeadingWhenSettled(session.status);

  // The owner is sent on in an effect, never in render: takeReturnTo() clears
  // the key, and StrictMode renders (and runs effects) twice in development.
  // The ref survives StrictMode's effect re-run, so the path is taken once.
  useEffect(() => {
    if (session.status !== "owner" || sent.current) return;
    sent.current = true;
    navigate(takeReturnTo(), { replace: true });
  }, [session.status, navigate]);

  if (session.status === "other") return <Refusal />;
  if (session.status === "signed-out") return <SignInCard />;
  return null;
}
