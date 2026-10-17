// A `window.matchMedia` stub for jsdom, which has none (CAL-009 Contract,
// Block 3). jsdom applies no media query, so the theme and the breakpoint
// are read in JavaScript (`src/calendar/media.ts`) and this answers them.
//
//   const media = installMatchMedia({ width: 1280, colorScheme: "light" });
//   act(() => media.set({ width: 375 }));   // fires `change` on every list
//   media.restore();                        // in an afterEach
//
// It answers `(min-width: Npx)` and `(max-width: Npx)` by comparing N with
// `width`, and `(prefers-color-scheme: X)` against `colorScheme`; a query
// joined with `and` matches when every feature does; anything else is false.
// It imports nothing from the source tree, so it can be read before the
// module it serves exists.

type ColorScheme = "light" | "dark";
type MediaState = { width: number; colorScheme: ColorScheme };
type ChangeListener = (event: MediaQueryListEvent) => void;

function evaluate(query: string, state: MediaState): boolean {
  const features = query.match(/\([^)]*\)/g);
  if (features === null) return false;
  return features.every((feature) => {
    const min = /^\(\s*min-width\s*:\s*(\d+)px\s*\)$/.exec(feature);
    if (min !== null) return state.width >= Number(min[1]);
    const max = /^\(\s*max-width\s*:\s*(\d+)px\s*\)$/.exec(feature);
    if (max !== null) return state.width <= Number(max[1]);
    const scheme = /^\(\s*prefers-color-scheme\s*:\s*(light|dark)\s*\)$/.exec(
      feature,
    );
    if (scheme !== null) return state.colorScheme === scheme[1];
    return false;
  });
}

export function installMatchMedia(opts: {
  width: number;
  colorScheme: ColorScheme;
}): {
  /** Change the answers and fire `change` on every list handed out. */
  set(opts: Partial<{ width: number; colorScheme: ColorScheme }>): void;
  /** Delete the stub from `window`. */
  restore(): void;
} {
  const state: MediaState = { ...opts };
  const lists: Array<{
    list: MediaQueryList;
    listeners: Set<ChangeListener>;
  }> = [];

  const matchMedia = (query: string): MediaQueryList => {
    const listeners = new Set<ChangeListener>();
    const list = {
      media: query,
      get matches() {
        return evaluate(query, state);
      },
      onchange: null,
      addEventListener: (type: string, listener: ChangeListener) => {
        if (type === "change") listeners.add(listener);
      },
      removeEventListener: (type: string, listener: ChangeListener) => {
        if (type === "change") listeners.delete(listener);
      },
      addListener: (listener: ChangeListener) => {
        listeners.add(listener);
      },
      removeListener: (listener: ChangeListener) => {
        listeners.delete(listener);
      },
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
    lists.push({ list, listeners });
    return list;
  };

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: matchMedia,
  });

  return {
    set(next) {
      Object.assign(state, next);
      for (const { list, listeners } of lists) {
        const event = {
          matches: list.matches,
          media: list.media,
        } as MediaQueryListEvent;
        for (const listener of [...listeners]) listener(event);
      }
    },
    restore() {
      Reflect.deleteProperty(window, "matchMedia");
    },
  };
}
