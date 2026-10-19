import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createSelection, setSelected, useSelected } from "./selection";

// CAL-011 Contract, Block 2 (PO decision 7): the selected (focused) date is
// a tiny useSyncExternalStore module store, shared by the page's grid and the
// toolbar's view switcher. Dates compare by getTime(); setting an equal date
// does not notify. Hooks are read through renderHook with a render counter,
// so "does not notify" is observed as "does not re-render".

const d = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day);

afterEach(() => {
  act(() => setSelected(null));
});

describe("createSelection(): one store (Block 2)", () => {
  it("starts with nothing selected", () => {
    const s = createSelection();
    expect(s.get()).toBeNull();
  });

  it("get() returns the date last set", () => {
    const s = createSelection();
    s.setSelected(d(2026, 10, 14));
    expect(s.get()?.getTime()).toBe(d(2026, 10, 14).getTime());
    s.setSelected(d(2026, 11, 30));
    expect(s.get()?.getTime()).toBe(d(2026, 11, 30).getTime());
  });

  it("can be cleared back to null", () => {
    const s = createSelection();
    s.setSelected(d(2026, 10, 14));
    s.setSelected(null);
    expect(s.get()).toBeNull();
  });

  it("useSelected() reads null, then each date set, re-rendering the reader", () => {
    const s = createSelection();
    const { result } = renderHook(() => s.useSelected());
    expect(result.current).toBeNull();
    act(() => s.setSelected(d(2026, 10, 14)));
    expect(result.current?.getTime()).toBe(d(2026, 10, 14).getTime());
    act(() => s.setSelected(d(2026, 10, 15)));
    expect(result.current?.getTime()).toBe(d(2026, 10, 15).getTime());
    act(() => s.setSelected(null));
    expect(result.current).toBeNull();
  });

  it("setting an equal date (a new Date, same getTime) does not notify: the reader does not re-render", () => {
    const s = createSelection();
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return s.useSelected();
    });
    act(() => s.setSelected(d(2026, 10, 14)));
    const after = renders;
    act(() => s.setSelected(d(2026, 10, 14)));
    act(() => s.setSelected(new Date(d(2026, 10, 14).getTime())));
    expect(renders).toBe(after);
    expect(result.current?.getTime()).toBe(d(2026, 10, 14).getTime());
    // The control: a different date does re-render.
    act(() => s.setSelected(d(2026, 10, 15)));
    expect(renders).toBe(after + 1);
  });

  it("setting null twice notifies once", () => {
    const s = createSelection();
    act(() => s.setSelected(d(2026, 10, 14)));
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return s.useSelected();
    });
    act(() => s.setSelected(null));
    const after = renders;
    act(() => s.setSelected(null));
    expect(renders).toBe(after);
  });

  it("two readers of one store see the same date", () => {
    const s = createSelection();
    const a = renderHook(() => s.useSelected());
    const b = renderHook(() => s.useSelected());
    act(() => s.setSelected(d(2026, 10, 20)));
    expect(a.result.current?.getTime()).toBe(d(2026, 10, 20).getTime());
    expect(b.result.current?.getTime()).toBe(d(2026, 10, 20).getTime());
  });

  it("two stores are independent", () => {
    const one = createSelection();
    const two = createSelection();
    one.setSelected(d(2026, 10, 14));
    expect(two.get()).toBeNull();
  });
});

describe("the app's one selection (Block 2)", () => {
  it("useSelected() and setSelected() share one module store", () => {
    const a = renderHook(() => useSelected());
    const b = renderHook(() => useSelected());
    expect(a.result.current).toBeNull();
    act(() => setSelected(d(2026, 10, 14)));
    expect(a.result.current?.getTime()).toBe(d(2026, 10, 14).getTime());
    expect(b.result.current?.getTime()).toBe(d(2026, 10, 14).getTime());
  });

  it("is not the store createSelection() builds", () => {
    const s = createSelection();
    act(() => setSelected(d(2026, 10, 14)));
    expect(s.get()).toBeNull();
  });
});
