import { useCallback, useMemo, useSyncExternalStore } from "react";

// CAL-009 Contract, Block 3 (PO decision 6). The theme and the breakpoint are
// read through window.matchMedia so jsdom tests can drive them; the
// stylesheets keep the same queries for the visuals. Where matchMedia does
// not exist every query is false: light, phone.

export type ColorScheme = "light" | "dark";
export type Breakpoint = "phone" | "tablet" | "desktop";

/** `window.matchMedia(query).matches`, live; false where matchMedia is missing. */
export function useMediaQuery(query: string): boolean {
  const list = useMemo(
    () =>
      typeof window.matchMedia === "function" ? window.matchMedia(query) : null,
    [query],
  );
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (list === null) return () => {};
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [list],
  );
  return useSyncExternalStore(subscribe, () => list?.matches ?? false);
}

/** "dark" when `(prefers-color-scheme: dark)` matches, else "light". */
export function useColorScheme(): ColorScheme {
  return useMediaQuery("(prefers-color-scheme: dark)") ? "dark" : "light";
}

/** "desktop" at `(min-width: 1024px)`, else "tablet" at `(min-width: 600px)`, else "phone". */
export function useBreakpoint(): Breakpoint {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const tablet = useMediaQuery("(min-width: 600px)");
  if (desktop) return "desktop";
  return tablet ? "tablet" : "phone";
}
