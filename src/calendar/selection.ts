import { useSyncExternalStore } from "react";

// CAL-011 Contract, Block 2 (PO decision 7). The selected (focused) calendar
// date lives here because the month grid that sets it (CalendarPage) and the
// view switcher that reads it (the shell's toolbar) are in different
// subtrees. Dates compare by getTime(); setting an equal date does not
// notify, so a reader does not re-render.

type Selection = {
  useSelected(): Date | null;
  setSelected(date: Date | null): void;
  get(): Date | null;
};

export function createSelection(): Selection {
  let current: Date | null = null;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const get = () => current;
  return {
    get,
    setSelected(date) {
      if ((current?.getTime() ?? null) === (date?.getTime() ?? null)) return;
      current = date;
      for (const listener of listeners) listener();
    },
    useSelected() {
      return useSyncExternalStore(subscribe, get);
    },
  };
}

const app = createSelection();

/** The selected (focused) calendar date, shared by the page and the toolbar. */
export function useSelected(): Date | null {
  return app.useSelected();
}

export function setSelected(date: Date | null): void {
  app.setSelected(date);
}
