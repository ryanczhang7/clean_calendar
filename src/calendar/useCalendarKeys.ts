import { useEffect, useLayoutEffect, useRef } from "react";
import type { View } from "./period";

// CAL-011 AC-4, Contract Block 5 (PO decision 5): T goes to today and M / W
// / D switch view, from anywhere on a calendar route. The exclusions are the
// legend's L (KindLegend.tsx): a modifier, an event already handled, an
// editable target, or a key pressed inside an open dialog - and, from CAL-012
// (Block 6), anywhere inside the event sheet, which is not a native dialog.

const NOT_A_SHORTCUT =
  'input, textarea, select, [contenteditable="true"], dialog[open], [data-sheet]';

const VIEW_KEYS: Record<string, View> = { m: "month", w: "week", d: "day" };

/** True when a keydown must not be read as a shortcut: a modifier, defaultPrevented, an editable target, or inside dialog[open] / [data-sheet]. Shift alone does not block. */
export function shortcutBlocked(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return true;
  if (event.defaultPrevented) return true;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest(NOT_A_SHORTCUT)) return true;
  // `=== true`: jsdom leaves isContentEditable undefined.
  return target instanceof HTMLElement && target.isContentEditable === true;
}

export function useCalendarKeys(handlers: {
  enabled: boolean;
  onToday: () => void;
  onView: (view: View) => void;
}): void {
  const { enabled } = handlers;
  // The listener outlives a render; it calls the latest handlers.
  const latest = useRef(handlers);
  useLayoutEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (shortcutBlocked(event)) return;
      const key = event.key.toLowerCase();
      if (key === "t") {
        latest.current.onToday();
        return;
      }
      const view = VIEW_KEYS[key];
      if (view !== undefined) latest.current.onView(view);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
