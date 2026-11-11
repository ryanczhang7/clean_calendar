import { type JSX, useEffect, useId, useRef, useState } from "react";
import styles from "./PermissionCard.module.css";
import { permissionState, registerThisDevice } from "./pushSubscription";

// CAL-027 Contract, Block 3 (components.md "Notification permission prompt";
// copy is voice.md "Notification permission"). Inline under the Reminder
// field and on /settings/notifications. Permission is read once at mount;
// after that the card's own state decides what it shows.

export const NOT_NOW_KEY = "cc.notifications.notNow";

type View = "hidden" | "ask" | "denied" | "allowed";

function initialView(placement: "form" | "settings"): View {
  const state = permissionState();
  if (state === "unsupported") return "hidden";
  if (state === "default") {
    // The settings card ignores an earlier "Not now" (PO decision 2).
    const dismissed = sessionStorage.getItem(NOT_NOW_KEY) === "1";
    return placement === "form" && dismissed ? "hidden" : "ask";
  }
  // Under the field a settled answer shows nothing: no nagging on every sheet.
  if (placement === "form") return "hidden";
  return state === "denied" ? "denied" : "allowed";
}

const NOTICE = {
  denied:
    "Notifications are blocked for this site. Turn them on in your browser's site settings to get reminders here.",
  allowed: "Notifications are on for this device.",
} as const;

export function PermissionCard(props: {
  placement: "form" | "settings";
  /** Called after the card removes itself (granted in the form, Not now). */
  onGone?: () => void;
}): JSX.Element | null {
  const { placement, onGone } = props;
  const titleId = useId();
  const [view, setView] = useState<View>(() => initialView(placement));
  const [busy, setBusy] = useState(false);
  // Set when a notice replaces the ask after an answer: the focused Allow
  // button is gone, so focus moves to the notice. Not at mount.
  const [focusNotice, setFocusNotice] = useState(false);
  const pending = useRef(false);
  const notice = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (focusNotice) notice.current?.focus();
  }, [focusNotice]);

  function onAllow(): void {
    if (pending.current) return;
    pending.current = true;
    // Called before any await: Chrome only shows the prompt from a gesture.
    const answer = Notification.requestPermission();
    setBusy(true);
    void answer.then((permission) => {
      pending.current = false;
      setBusy(false);
      if (permission === "granted") {
        // Not awaited: `serviceWorker.ready` never resolves where no worker
        // is registered, and the card must not hang on it.
        void registerThisDevice();
        if (placement === "form") {
          setView("hidden");
          onGone?.();
          return;
        }
        setView("allowed");
        setFocusNotice(true);
      } else if (permission === "denied") {
        setView("denied");
        setFocusNotice(true);
      }
    });
  }

  function onNotNow(): void {
    sessionStorage.setItem(NOT_NOW_KEY, "1");
    setView("hidden");
    onGone?.();
  }

  if (view === "hidden") return null;

  return (
    <section aria-labelledby={titleId} className={styles.card}>
      <p id={titleId} className={styles.title}>
        Get reminders on this device
      </p>
      {view === "ask" ? (
        <>
          <p className={styles.line}>
            Allow notifications so reminders can reach you when the app is
            closed.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              aria-busy={busy ? "true" : undefined}
              onClick={onAllow}
            >
              Allow notifications
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={onNotNow}
            >
              Not now
            </button>
          </div>
        </>
      ) : (
        <p ref={notice} role="status" tabIndex={-1} className={styles.notice}>
          {NOTICE[view]}
        </p>
      )}
    </section>
  );
}
