import "@testing-library/jest-dom/vitest";

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
