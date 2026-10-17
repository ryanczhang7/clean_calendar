import { type JSX, useEffect, useId, useLayoutEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { type KindsStore, kindsStore, useKinds } from "../sync/kindsStore";
import styles from "./KindLegend.module.css";
import { KindSwatch } from "./KindList";

// CAL-008, Contract Block 2. The legend the shell's two Legend buttons open.
// The shell owns `open`; the legend asks to change it through `onToggle`.
// It remembers nothing and filters nothing (components.md, "Kind legend").

/** Where `L` is typing, not a shortcut, or belongs to an open modal. */
const NOT_A_SHORTCUT =
  'input, textarea, select, [contenteditable="true"], dialog[open]';

/**
 * Focus the control that opened the legend; when that is gone or was the
 * page body (opened with `L` from nowhere), the first Legend toggle.
 */
function returnFocus(opener: Element | null): void {
  const target =
    opener instanceof HTMLElement &&
    opener !== document.body &&
    opener.isConnected
      ? opener
      : document.querySelector<HTMLElement>("[data-legend-toggle]");
  target?.focus();
}

export function KindLegend(props: {
  open: boolean;
  /** The one way the legend asks to open or close; the shell owns `open`. */
  onToggle: (open: boolean) => void;
  store?: KindsStore;
}): JSX.Element | null {
  const { open, onToggle, store = kindsStore } = props;
  const { status, kinds } = useKinds(store);
  const location = useLocation();
  const navigate = useNavigate();
  const titleId = useId();
  const root = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  // The document listeners outlive a render; they read the latest props.
  const latest = useRef({ open, onToggle });
  useLayoutEffect(() => {
    latest.current = { open, onToggle };
  });

  // On the transition to open: remember the opener, focus the first control.
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    root.current?.querySelector<HTMLElement>("a[href], button")?.focus();
  }, [open]);

  // `L` toggles and Escape closes: one registration for the whole life.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { open: isOpen, onToggle: toggle } = latest.current;
      if (event.key === "Escape") {
        if (!isOpen) return;
        toggle(false);
        returnFocus(opener.current);
        return;
      }
      if (event.key !== "l" && event.key !== "L") return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(NOT_A_SHORTCUT)) return;
      if (target instanceof HTMLElement && target.isContentEditable) return;
      toggle(!isOpen);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      clearTimeout(focusTimer.current);
    };
  }, []);

  // A pointer going down outside the legend and its toggles closes it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target === null || root.current?.contains(target)) return;
      const element = target instanceof Element ? target : target.parentElement;
      if (element?.closest("[data-legend-toggle]")) return;
      latest.current.onToggle(false);
      // Deferred (Block 2, amended in RED): the mousedown that follows this
      // pointerdown moves focus itself, so a focus call made now is undone.
      // When that pointer put focus on another control, it keeps it.
      const from = opener.current;
      focusTimer.current = setTimeout(() => {
        const active = document.activeElement;
        if (active === null || active === document.body) returnFocus(from);
      }, 0);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (!open) return null;

  // The shell route the legend is open on, so the kinds page can go back.
  const from = location.pathname + location.search;
  const close = () => onToggle(false);

  return (
    // A div, not <dialog open>: that is the modal the L shortcut ignores,
    // and this is a non-modal popover (Contract Block 2).
    <div
      ref={root}
      role="dialog"
      aria-labelledby={titleId}
      data-legend
      className={styles.legend}
    >
      <h2 id={titleId} className={styles.title}>
        Kind legend
      </h2>
      {status === "ready" && kinds.length > 0 ? (
        <>
          <ul className={styles.list}>
            {kinds.map((kind) => (
              <li key={kind.id}>
                <Link
                  to={`/kinds?kind=${kind.id}`}
                  state={{ from }}
                  className={styles.row}
                  onClick={close}
                >
                  <KindSwatch kind={kind} />
                  <span className={styles.name}>{kind.name}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            to="/kinds"
            state={{ from }}
            className={styles.manage}
            onClick={close}
          >
            Manage kinds
          </Link>
        </>
      ) : null}
      {status === "ready" && kinds.length === 0 ? (
        <>
          <p className={styles.empty}>No kinds. Add one.</p>
          <button
            type="button"
            className={styles.add}
            onClick={() => {
              close();
              navigate("/kinds?kind=new", { state: { from } });
            }}
          >
            Add
          </button>
        </>
      ) : null}
    </div>
  );
}
