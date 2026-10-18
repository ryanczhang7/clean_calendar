import { useEffect, useLayoutEffect, useRef } from "react";
import type { View } from "./period";

// CAL-011 AC-4, Contract Block 5 (PO decision 5): T goes to today and M / W
// / D switch view, from anywhere on a calendar route. The exclusions are the
// legend's L (KindLegend.tsx): a modifier, an event already handled, an
// editable target, or a key pressed inside an open dialog.

const NOT_A_SHORTCUT =
  'input, textarea, select, [contenteditable="true"], dialog[open]';

const VIEW_KEYS: Record<string, View> = { m: "month", w: "week", d: "day" };

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
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(NOT_A_SHORTCUT)) return;
      if (target instanceof HTMLElement && target.isContentEditable) return;
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
