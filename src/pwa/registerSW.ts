import { createContext, useEffect } from "react";
import { useMaybeToast } from "../ui/Toast";

// CAL-017 Contract Block 4: the page half of the update flow (AC-4). No JSX
// and no import of `virtual:pwa-register`, so the unit project loads this
// without the plugin; src/main.tsx passes the plugin's registerSW in.

/** vite-plugin-pwa's registerSW shape. */
export type RegisterFn = (options: {
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
}) => (reloadPage?: boolean) => Promise<void>;

export type UpdateSignal = {
  /** Calls listener at once if an update is already waiting. Returns unsubscribe. */
  subscribe(listener: (apply: () => Promise<void>) => void): () => void;
};

/**
 * Registers the service worker once and turns the plugin's "a new worker is
 * waiting" callback into a signal any number of listeners can subscribe to.
 *
 * `onNeedReload` is deliberately NOT passed: vite-plugin-pwa 1.3.0 reloads
 * the page on the new worker's `controlling` event only when it is absent.
 */
export function registerServiceWorker(register: RegisterFn): UpdateSignal {
  const listeners = new Set<(apply: () => Promise<void>) => void>();
  let apply: (() => Promise<void>) | null = null;

  const updateSW = register({
    onNeedRefresh() {
      const ready = () => updateSW(true);
      apply = ready;
      for (const listener of [...listeners]) listener(ready);
    },
  });

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (apply !== null) listener(apply);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Shows the "new version" toast when an update is waiting; renders nothing. */
export function UpdatePrompt(props: { signal: UpdateSignal }): null {
  const { signal } = props;
  const toast = useMaybeToast();
  useEffect(() => {
    if (toast === null) return;
    return signal.subscribe((apply) => {
      toast.showToast({
        text: "A new version is ready.",
        action: {
          label: "Reload",
          onClick: () => {
            void apply();
          },
        },
      });
    });
  }, [signal, toast]);
  return null;
}

/**
 * How the signal registered in src/main.tsx reaches AppShell without a new
 * prop. Null (the default) where nothing registered a worker - every test
 * that renders AppShell - so no prompt is rendered there.
 */
export const UpdateSignalContext = createContext<UpdateSignal | null>(null);
