import {
  createContext,
  type JSX,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import styles from "./Toast.module.css";

// components.md, Toast: one toast at a time, a newer one replaces the older;
// 6 s without an action, 10 s with one, the timer starting at showToast.
export type Toast = {
  text: string;
  action?: {
    label: string;
    onClick: () => void;
    /** Ctrl+Z / Cmd+Z runs it while shown (CAL-013 AC-5). */
    undo?: boolean;
  };
  tone?: "status" | "alert";
};

const PLAIN_MS = 6_000;
const WITH_ACTION_MS = 10_000;

type Shown = { toast: Toast; id: number };

export type ToastApi = { showToast(t: Toast): void; dismiss(): void };

type ToastState = ToastApi & { current: Shown | null };

const ToastContext = createContext<ToastState | null>(null);

export function ToastProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [current, setCurrent] = useState<Shown | null>(null);

  const showToast = useCallback((toast: Toast) => {
    setCurrent((prev) => ({ toast, id: (prev?.id ?? 0) + 1 }));
  }, []);
  const dismiss = useCallback(() => setCurrent(null), []);

  // Keyed on the shown toast's id, so a replacement restarts the timer.
  useEffect(() => {
    if (current === null) return;
    const ms = current.toast.action ? WITH_ACTION_MS : PLAIN_MS;
    const timer = setTimeout(() => setCurrent(null), ms);
    return () => clearTimeout(timer);
  }, [current]);

  // CAL-013 Block 6: while an undo toast shows, Ctrl+Z / Cmd+Z outside an
  // editable field runs its action once and dismisses it.
  useEffect(() => {
    const action = current?.toast.action;
    if (!action?.undo) return;
    let done = false;
    const onKeyDown = (e: KeyboardEvent) => {
      if (done) return;
      if (e.key !== "z" && e.key !== "Z") return;
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      if (isEditable(e.target)) return;
      done = true;
      e.preventDefault();
      action.onClick();
      setCurrent(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [current]);

  const value = useMemo(
    () => ({ current, showToast, dismiss }),
    [current, showToast, dismiss],
  );
  return (
    <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
  );
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest("[contenteditable]:not([contenteditable='false'])")) {
    return true;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function useToastState(): ToastState {
  const state = useContext(ToastContext);
  if (state === null) {
    throw new Error("useToast must be used inside a ToastProvider");
  }
  return state;
}

export function useToast(): ToastApi {
  const { showToast, dismiss } = useToastState();
  return useMemo(() => ({ showToast, dismiss }), [showToast, dismiss]);
}

/** The toast API, or null outside a ToastProvider (never throws). */
export function useMaybeToast(): ToastApi | null {
  const state = useContext(ToastContext);
  const showToast = state?.showToast;
  const dismiss = state?.dismiss;
  return useMemo(
    () => (showToast && dismiss ? { showToast, dismiss } : null),
    [showToast, dismiss],
  );
}

function ToastBody(props: { toast: Toast; dismiss: () => void }): JSX.Element {
  const { toast, dismiss } = props;
  return (
    <div className={styles.toast}>
      <span className={styles.text}>{toast.text}</span>
      {toast.action ? (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            toast.action?.onClick();
            dismiss();
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
    </div>
  );
}

/** The one toast live region (accessibility.md, Live regions). */
export function ToastHost(): JSX.Element {
  const { current, dismiss } = useToastState();
  const tone = current?.toast.tone ?? "status";
  return (
    <div className={styles.host}>
      <div role="status" aria-live="polite" className={styles.region}>
        {current !== null && tone === "status" ? (
          <ToastBody toast={current.toast} dismiss={dismiss} />
        ) : null}
      </div>
      {current !== null && tone === "alert" ? (
        <div role="alert" className={styles.region}>
          <ToastBody toast={current.toast} dismiss={dismiss} />
        </div>
      ) : null}
    </div>
  );
}
