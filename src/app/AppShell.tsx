import { format } from "date-fns";
import {
  type JSX,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { signOut } from "../auth/session";
import { KindLegend } from "../kinds/KindLegend";
import { SyncStatus } from "../sync/SyncStatus";
import { ToastHost, ToastProvider } from "../ui/Toast";
import styles from "./AppShell.module.css";

function AccountMenu(): JSX.Element {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  // The route the menu was opened on, so the kinds page can go back (CAL-008).
  const from = location.pathname + location.search;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !menu.current?.contains(target) &&
        !button.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      setOpen(false);
      button.current?.focus();
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape is caught for the menu and its button together
    <div className={styles.account} onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        className={styles.ghost}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">●</span>
      </button>
      {open ? (
        <div
          ref={menu}
          role="menu"
          aria-label="Account"
          className={styles.menu}
        >
          <Link
            role="menuitem"
            to="/kinds"
            state={{ from }}
            onClick={() => setOpen(false)}
          >
            Kinds
          </Link>
          <Link
            role="menuitem"
            to="/settings/notifications"
            onClick={() => setOpen(false)}
          >
            Notifications
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await signOut();
              navigate("/signin");
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The layout every calendar-side screen renders in (components.md, "App
 * shell and top bar"). DOM order is focus order: top bar, main, bottom nav,
 * toast region.
 */
export function AppShell(props: { toolbar?: ReactNode }): JSX.Element {
  const today = new Date();
  const month = format(today, "yyyy-MM");
  const day = format(today, "yyyy-MM-dd");
  // CAL-008 Block 4: both Legend buttons toggle the one legend.
  const [legendOpen, setLegendOpen] = useState(false);
  const toggleLegend = () => setLegendOpen((o) => !o);
  return (
    <ToastProvider>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <Link to="/" className={styles.appName}>
            Clean Calendar
          </Link>
          {props.toolbar}
          <div className={styles.spacer} />
          <SyncStatus />
          <div className={styles.controls} data-topbar-controls>
            <button
              type="button"
              className={styles.ghost}
              data-legend-toggle
              aria-expanded={legendOpen}
              onClick={toggleLegend}
            >
              Legend
            </button>
            <KindLegend open={legendOpen} onToggle={setLegendOpen} />
            <Link to="/capture" className={styles.primary}>
              Capture
            </Link>
            <AccountMenu />
          </div>
        </header>
        <main className={styles.main}>
          <Outlet />
        </main>
        <nav
          aria-label="Bottom navigation"
          data-bottomnav
          className={styles.bottomnav}
        >
          <Link to={`/month/${month}`}>Month</Link>
          <Link to={`/week/${day}`}>Week</Link>
          <Link to={`/day/${day}`}>Day</Link>
          <button
            type="button"
            data-legend-toggle
            aria-expanded={legendOpen}
            onClick={toggleLegend}
          >
            Legend
          </button>
          <Link to="/capture">Capture</Link>
        </nav>
        <ToastHost />
      </div>
    </ToastProvider>
  );
}
