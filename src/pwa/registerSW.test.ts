import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, type ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import { ToastHost, ToastProvider } from "../ui/Toast";
import {
  type RegisterFn,
  registerServiceWorker,
  type UpdateSignal,
  UpdatePrompt,
} from "./registerSW";

// CAL-017 AC-4, the page half (Contract Block 4). The worker half - the
// SKIP_WAITING message - is src/sw.test.ts; the real browser update is not
// automated (no second build to deploy under an open page).
//
// Copy is fixed in docs/wiki/design/voice.md, Toasts:
//   New version (service worker updated) | "A new version is ready." | Reload
const COPY = "A new version is ready.";

type Options = Parameters<RegisterFn>[0];

/** A stand-in for vite-plugin-pwa's registerSW, capturing its options. */
function fakeRegister() {
  const updateSW = vi.fn(async (_reloadPage?: boolean) => {});
  const calls: Options[] = [];
  const register: RegisterFn = (options) => {
    calls.push(options);
    return updateSW;
  };
  return {
    register: vi.fn(register),
    updateSW,
    calls,
    /** What the plugin does when a new worker is installed and waiting. */
    needRefresh() {
      const options = calls[0];
      if (options?.onNeedRefresh === undefined) {
        throw new Error("register was never given onNeedRefresh");
      }
      options.onNeedRefresh();
    },
  };
}

function withToasts(children: ReactNode) {
  return createElement(
    ToastProvider,
    null,
    children,
    createElement(ToastHost, null),
  );
}

describe("registerServiceWorker (AC-4)", () => {
  test("registers the worker once, asking to hear about a waiting update", () => {
    const fake = fakeRegister();
    registerServiceWorker(fake.register);
    expect(fake.register).toHaveBeenCalledTimes(1);
    expect(typeof fake.calls[0]?.onNeedRefresh).toBe("function");
  });

  test("leaves the reload to the plugin: no onNeedReload overrides it", () => {
    // vite-plugin-pwa 1.3.0 reloads on the new worker's `controlling` event
    // only when onNeedReload is absent; passing one would swallow the reload
    // AC-4 promises after Reload is pressed.
    const fake = fakeRegister();
    registerServiceWorker(fake.register);
    expect(fake.calls[0]).toBeDefined();
    expect(Object.hasOwn(fake.calls[0] as object, "onNeedReload")).toBe(false);
  });

  test("a subscriber hears nothing before an update is waiting", () => {
    const fake = fakeRegister();
    const signal = registerServiceWorker(fake.register);
    const listener = vi.fn();
    signal.subscribe(listener);
    expect(listener).not.toHaveBeenCalled();
    expect(fake.updateSW).not.toHaveBeenCalled();
  });

  test("when an update is waiting, every subscriber receives apply", () => {
    const fake = fakeRegister();
    const signal = registerServiceWorker(fake.register);
    const first = vi.fn();
    const second = vi.fn();
    signal.subscribe(first);
    signal.subscribe(second);
    fake.needRefresh();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(typeof first.mock.calls[0]?.[0]).toBe("function");
  });

  test("a subscriber arriving after the update was announced still receives apply", () => {
    const fake = fakeRegister();
    const signal = registerServiceWorker(fake.register);
    fake.needRefresh();
    const late = vi.fn();
    signal.subscribe(late);
    expect(late).toHaveBeenCalledTimes(1);
    expect(typeof late.mock.calls[0]?.[0]).toBe("function");
  });

  test("apply activates the waiting worker through updateSW(true), once", async () => {
    const fake = fakeRegister();
    const signal = registerServiceWorker(fake.register);
    let apply: (() => Promise<void>) | undefined;
    signal.subscribe((a) => {
      apply = a;
    });
    fake.needRefresh();
    expect(fake.updateSW).not.toHaveBeenCalled();
    await apply?.();
    expect(fake.updateSW).toHaveBeenCalledTimes(1);
    expect(fake.updateSW).toHaveBeenCalledWith(true);
  });

  test("an unsubscribed listener hears nothing of a later update", () => {
    const fake = fakeRegister();
    const signal = registerServiceWorker(fake.register);
    const kept = vi.fn();
    const dropped = vi.fn();
    signal.subscribe(kept);
    const unsubscribe = signal.subscribe(dropped);
    unsubscribe();
    fake.needRefresh();
    expect(kept).toHaveBeenCalledTimes(1);
    expect(dropped).not.toHaveBeenCalled();
  });
});

describe("UpdatePrompt (AC-4)", () => {
  test("shows nothing until an update is waiting", () => {
    const fake = fakeRegister();
    const signal = registerServiceWorker(fake.register);
    render(withToasts(createElement(UpdatePrompt, { signal })));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.queryByRole("button", { name: "Reload" })).toBeNull();
  });

  test('announces "A new version is ready." with a Reload button in the polite status region', () => {
    const fake = fakeRegister();
    const signal = registerServiceWorker(fake.register);
    render(withToasts(createElement(UpdatePrompt, { signal })));
    act(() => fake.needRefresh());
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(COPY);
    expect(
      within(status).getByRole("button", { name: "Reload" }),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("pressing Reload activates the new worker exactly once", async () => {
    const user = userEvent.setup();
    const fake = fakeRegister();
    const signal = registerServiceWorker(fake.register);
    render(withToasts(createElement(UpdatePrompt, { signal })));
    act(() => fake.needRefresh());
    await user.click(screen.getByRole("button", { name: "Reload" }));
    expect(fake.updateSW).toHaveBeenCalledTimes(1);
    expect(fake.updateSW).toHaveBeenCalledWith(true);
  });

  test("pressing Reload calls the signal's apply exactly once", async () => {
    const user = userEvent.setup();
    const apply = vi.fn(async () => {});
    const signal: UpdateSignal = {
      subscribe(listener) {
        listener(apply);
        return () => {};
      },
    };
    render(withToasts(createElement(UpdatePrompt, { signal })));
    expect(screen.getByRole("status")).toHaveTextContent(COPY);
    expect(apply).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Reload" }));
    expect(apply).toHaveBeenCalledTimes(1);
  });

  test("an update already waiting when the prompt mounts is shown at once", () => {
    const fake = fakeRegister();
    const signal = registerServiceWorker(fake.register);
    fake.needRefresh();
    render(withToasts(createElement(UpdatePrompt, { signal })));
    expect(screen.getByRole("status")).toHaveTextContent(COPY);
  });

  test("unmounting the prompt unsubscribes it from the signal", () => {
    const unsubscribe = vi.fn();
    const signal: UpdateSignal = { subscribe: () => unsubscribe };
    const { unmount } = render(
      withToasts(createElement(UpdatePrompt, { signal })),
    );
    expect(unsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  test("outside a ToastProvider it renders nothing and does not throw", () => {
    const fake = fakeRegister();
    const signal = registerServiceWorker(fake.register);
    fake.needRefresh();
    const { container } = render(createElement(UpdatePrompt, { signal }));
    expect(container).toBeEmptyDOMElement();
    expect(() => act(() => fake.needRefresh())).not.toThrow();
    expect(container).toBeEmptyDOMElement();
  });
});
