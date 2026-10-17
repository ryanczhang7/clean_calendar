import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { installMatchMedia } from "../test/media";
import { useBreakpoint, useColorScheme, useMediaQuery } from "./media";

// CAL-009 Contract, Block 3 (PO decision 6): the theme and the breakpoint
// are read through `window.matchMedia` in JavaScript, because jsdom applies
// no media query. The breakpoints are layout.md's and breakpoints.css's:
// tablet from 600px, desktop from 1024px. Rendered with renderHook under
// the installMatchMedia stub (src/test/media.ts).

let media: ReturnType<typeof installMatchMedia> | null = null;

function install(width: number, colorScheme: "light" | "dark" = "light") {
  media = installMatchMedia({ width, colorScheme });
  return media;
}

afterEach(() => {
  media?.restore();
  media = null;
});

describe("useBreakpoint() (Block 3)", () => {
  it.each([
    [375, "phone"],
    [599, "phone"],
    [600, "tablet"],
    [768, "tablet"],
    [1023, "tablet"],
    [1024, "desktop"],
    [1280, "desktop"],
  ] as const)("at a width of %ipx is %s", (width, expected) => {
    install(width);
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe(expected);
  });

  it("re-renders with the new breakpoint when the width changes", () => {
    const stub = install(1280);
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe("desktop");
    act(() => stub.set({ width: 768 }));
    expect(result.current).toBe("tablet");
    act(() => stub.set({ width: 375 }));
    expect(result.current).toBe("phone");
    act(() => stub.set({ width: 1024 }));
    expect(result.current).toBe("desktop");
  });
});

describe("useColorScheme() (Block 3)", () => {
  it('is "light" when (prefers-color-scheme: dark) does not match', () => {
    install(1280, "light");
    const { result } = renderHook(() => useColorScheme());
    expect(result.current).toBe("light");
  });

  it('is "dark" when (prefers-color-scheme: dark) matches', () => {
    install(1280, "dark");
    const { result } = renderHook(() => useColorScheme());
    expect(result.current).toBe("dark");
  });

  it("re-renders with the new scheme when the preference changes, both ways", () => {
    const stub = install(1280, "light");
    const { result } = renderHook(() => useColorScheme());
    act(() => stub.set({ colorScheme: "dark" }));
    expect(result.current).toBe("dark");
    act(() => stub.set({ colorScheme: "light" }));
    expect(result.current).toBe("light");
  });
});

describe("useMediaQuery(query) (Block 3)", () => {
  it("is the live answer of window.matchMedia(query).matches", () => {
    const stub = install(768);
    const { result } = renderHook(() => useMediaQuery("(min-width: 600px)"));
    expect(result.current).toBe(true);
    act(() => stub.set({ width: 375 }));
    expect(result.current).toBe(false);
  });

  it("answers the query it is given, not another one", () => {
    install(768);
    const { result } = renderHook(() => useMediaQuery("(min-width: 1024px)"));
    expect(result.current).toBe(false);
  });
});

describe("where window.matchMedia does not exist (Block 3)", () => {
  it("every hook answers its default - light, phone, false - and none throws", () => {
    expect(typeof (window as { matchMedia?: unknown }).matchMedia).toBe(
      "undefined",
    );
    const { result } = renderHook(() => ({
      scheme: useColorScheme(),
      breakpoint: useBreakpoint(),
      query: useMediaQuery("(min-width: 0px)"),
    }));
    expect(result.current).toStrictEqual({
      scheme: "light",
      breakpoint: "phone",
      query: false,
    });
  });

  it("still holds after a stub was installed and restored", () => {
    install(1280, "dark").restore();
    media = null;
    const { result } = renderHook(() => [useColorScheme(), useBreakpoint()]);
    expect(result.current).toStrictEqual(["light", "phone"]);
  });
});
