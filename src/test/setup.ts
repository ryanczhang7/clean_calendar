import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Testing Library installs its own afterEach(cleanup) only when the runner
// exposes a global `afterEach`, which vitest does not without `globals: true`.
// Without this every render stays mounted into the next test (CAL-002
// Regressions, defect 1).
afterEach(() => {
  cleanup();
});

// @testing-library/react 16.3's asyncWrapper (used by every user-event call)
// awaits a setTimeout(0) and flushes it only when `jestFakeTimersAreEnabled()`:
// a global `jest` exists AND `setTimeout` carries the fake clock's own `clock`
// property. Under vitest there is no `jest`, so with faked timers that
// setTimeout(0) never fires and every `await user.click` hangs (CAL-002
// Regressions, defect 2). The shim exposes the one method RTL calls, and only
// while setTimeout is faked: the getter returns undefined otherwise, so
// `typeof jest` reads "undefined" in every test using real timers. It advances
// by 0 ms in asyncWrapper, so it moves no fake clock across a boundary.
// Limit worth knowing: @testing-library/dom's waitFor/findBy also consult
// `jest` and, under faked setTimeout, advance the fake clock by their polling
// interval - a test faking setTimeout that uses them gets that behaviour.
const jestShim = {
  advanceTimersByTime: (ms: number) => {
    vi.advanceTimersByTime(ms);
  },
};
Object.defineProperty(globalThis, "jest", {
  configurable: true,
  get: () =>
    Object.hasOwn(globalThis.setTimeout, "clock") ? jestShim : undefined,
});

// jsdom 30.1.2 does not implement HTMLDialogElement#showModal or #close
// (measured 2026-10-13, CAL-002 Contract, Dialog). This is the minimum a
// browser does that the Dialog tests depend on, and nothing more:
//   * showModal() sets the `open` attribute and marks the dialog modal;
//   * close() clears it and dispatches `close` - only if it was open;
//   * Escape pressed while a modal dialog is open dispatches a cancelable
//     `cancel` on it, and closes it unless the event was prevented - the
//     browser's "close request" behaviour.
// Production code must not rely on anything this stub does not do: no
// focus trapping, no inertness of the rest of the page, no ::backdrop.
const modal = new WeakSet<HTMLDialogElement>();

if (typeof HTMLDialogElement !== "undefined") {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal !== "function") {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      if (this.hasAttribute("open")) return;
      this.setAttribute("open", "");
      modal.add(this);
    };
  }
  if (typeof proto.close !== "function") {
    proto.close = function close(this: HTMLDialogElement) {
      if (!this.hasAttribute("open")) return;
      this.removeAttribute("open");
      modal.delete(this);
      this.dispatchEvent(new Event("close"));
    };
  }
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const open = [...document.querySelectorAll("dialog[open]")].filter(
      (d): d is HTMLDialogElement =>
        d instanceof HTMLDialogElement && modal.has(d),
    );
    const top = open.at(-1);
    if (top === undefined) return;
    const cancel = new Event("cancel", { cancelable: true });
    if (top.dispatchEvent(cancel)) top.close();
  });
}
