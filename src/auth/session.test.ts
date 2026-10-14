import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fake, OWNER_EMAIL, sessionFor } from "../test/supabase-mock";
import {
  isOwnerEmail,
  RETURN_TO_KEY,
  rememberPath,
  signInWithGoogle,
  signOut,
  takeReturnTo,
  useSession,
} from "./session";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-003 Contract, Session. AC-3 and AC-4 rest on isOwnerEmail; AC-2 and
// AC-6 on signInWithGoogle and signOut; AC-1's "the original path is
// remembered" on rememberPath / takeReturnTo.

beforeEach(() => {
  fake.reset();
  sessionStorage.clear();
  localStorage.clear();
});

const OWNER = "owner@example.com";

// The pinned control table (Contract, Session). AC-4's control is the third
// row: a prefix match would admit it.
const ADMITS: Array<[label: string, email: string | null | undefined]> = [
  ["the owner's address, exactly", "owner@example.com"],
  [
    "the owner's address in other case with surrounding whitespace",
    "  Owner@Example.COM \n",
  ],
];

const REFUSES: Array<[label: string, email: string | null | undefined]> = [
  [
    "an address that merely starts with the owner's (AC-4 control)",
    "owner@example.com.evil.test",
  ],
  ["an address that merely ends with the owner's", "xowner@example.com"],
  ["an address the owner's merely starts with", "owner@example.co"],
  ["an empty address", ""],
  ["a null address", null],
  ["an undefined address", undefined],
];

describe("isOwnerEmail (AC-3, AC-4)", () => {
  it.each(ADMITS)("admits %s", (_label, email) => {
    expect(isOwnerEmail(email, OWNER)).toBe(true);
  });

  it.each(REFUSES)("refuses %s", (_label, email) => {
    expect(isOwnerEmail(email, OWNER)).toBe(false);
  });

  it("trims and lower-cases the owner side too", () => {
    expect(isOwnerEmail("owner@example.com", "  OWNER@Example.com \t")).toBe(
      true,
    );
  });

  it.each([
    ["the owner's address", "owner@example.com"],
    ["an empty address", ""],
    ["a whitespace-only address", "   "],
    ["a null address", null],
    ["an undefined address", undefined],
  ] as Array<[string, string | null | undefined]>)(
    "admits nobody when the owner is unconfigured (empty): refuses %s",
    (_label, email) => {
      expect(isOwnerEmail(email, "")).toBe(false);
    },
  );

  it("admits nobody when the configured owner is only whitespace", () => {
    expect(isOwnerEmail("", "   ")).toBe(false);
    expect(isOwnerEmail("   ", "   ")).toBe(false);
  });

  it("defaults the owner to OWNER_EMAIL from src/lib/supabase", () => {
    expect(OWNER_EMAIL).toBe(OWNER);
    expect(isOwnerEmail("Owner@Example.com")).toBe(true);
    expect(isOwnerEmail("owner@example.com.evil.test")).toBe(false);
    expect(isOwnerEmail("someone@else.test")).toBe(false);
  });
});

describe("useSession", () => {
  it("is loading until getSession answers, then the owner", async () => {
    const held = fake.holdSession();
    const { result } = renderHook(() => useSession());
    expect(result.current).toEqual({ status: "loading" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual({ status: "loading" });
    await act(async () => {
      held.resolve(sessionFor(OWNER));
    });
    await waitFor(() =>
      expect(result.current).toEqual({ status: "owner", email: OWNER }),
    );
    expect(fake.auth.getSession).toHaveBeenCalledTimes(1);
  });

  it("classifies a session for any other address as other, carrying the address", async () => {
    fake.setSession(sessionFor("someone@else.test"));
    const { result } = renderHook(() => useSession());
    await waitFor(() =>
      expect(result.current).toEqual({
        status: "other",
        email: "someone@else.test",
      }),
    );
  });

  it("classifies the AC-4 control address as other, not owner", async () => {
    fake.setSession(sessionFor("owner@example.com.evil.test"));
    const { result } = renderHook(() => useSession());
    await waitFor(() =>
      expect(result.current).toEqual({
        status: "other",
        email: "owner@example.com.evil.test",
      }),
    );
  });

  it("is signed-out when there is no session", async () => {
    const { result } = renderHook(() => useSession());
    await waitFor(() =>
      expect(result.current).toEqual({ status: "signed-out" }),
    );
  });

  it("subscribes to auth changes and follows a sign-in and a sign-out", async () => {
    const { result } = renderHook(() => useSession());
    await waitFor(() =>
      expect(result.current).toEqual({ status: "signed-out" }),
    );
    expect(fake.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(fake.listenerCount()).toBe(1);

    act(() => fake.emit("SIGNED_IN", sessionFor(OWNER)));
    expect(result.current).toEqual({ status: "owner", email: OWNER });

    act(() => fake.emit("SIGNED_OUT", null));
    expect(result.current).toEqual({ status: "signed-out" });

    act(() => fake.emit("SIGNED_IN", sessionFor("someone@else.test")));
    expect(result.current).toEqual({
      status: "other",
      email: "someone@else.test",
    });
  });

  it("unsubscribes from auth changes on unmount", async () => {
    const { result, unmount } = renderHook(() => useSession());
    await waitFor(() =>
      expect(result.current).toEqual({ status: "signed-out" }),
    );
    expect(fake.listenerCount()).toBe(1);
    expect(fake.unsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(fake.unsubscribe).toHaveBeenCalledTimes(1);
    expect(fake.listenerCount()).toBe(0);
  });
});

describe("signInWithGoogle (AC-2)", () => {
  it("calls signInWithOAuth exactly once, for Google, redirecting back to this origin", async () => {
    await signInWithGoogle();
    expect(fake.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
    const [args] = fake.auth.signInWithOAuth.mock.calls[0] ?? [];
    expect(args?.provider).toBe("google");
    const redirectTo = args?.options?.redirectTo;
    expect(typeof redirectTo).toBe("string");
    // An origin comparison, not a prefix: "http://localhost:3000.evil.test"
    // starts with "http://localhost:3000".
    expect(new URL(String(redirectTo)).origin).toBe(window.location.origin);
    expect(String(redirectTo).startsWith(window.location.origin)).toBe(true);
  });

  it("resolves to nothing", async () => {
    await expect(signInWithGoogle()).resolves.toBeUndefined();
  });
});

describe("signOut (AC-4, AC-6)", () => {
  it("calls supabase.auth.signOut exactly once and resolves to nothing", async () => {
    await expect(signOut()).resolves.toBeUndefined();
    expect(fake.auth.signOut).toHaveBeenCalledTimes(1);
  });
});

describe("the remembered path (AC-1, AC-3)", () => {
  it("is stored under cc.returnTo", () => {
    expect(RETURN_TO_KEY).toBe("cc.returnTo");
  });

  it("is kept in sessionStorage, not localStorage, so it does not outlive the tab", () => {
    rememberPath("/kinds?view=all");
    expect(sessionStorage.getItem("cc.returnTo")).toBe("/kinds?view=all");
    expect(localStorage.getItem("cc.returnTo")).toBeNull();
  });

  it("is returned once and then cleared", () => {
    rememberPath("/week/2026-10-12");
    expect(takeReturnTo()).toBe("/week/2026-10-12");
    expect(sessionStorage.getItem("cc.returnTo")).toBeNull();
    expect(takeReturnTo()).toBe("/");
  });

  it("defaults to / when nothing was remembered", () => {
    expect(takeReturnTo()).toBe("/");
  });

  it("keeps only the latest path remembered", () => {
    rememberPath("/kinds");
    rememberPath("/capture");
    expect(takeReturnTo()).toBe("/capture");
  });
});
