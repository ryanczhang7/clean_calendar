import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isOnboarded, markOnboarded, ONBOARDED_KEY } from "./onboarding";

// CAL-007 AC-7, Contract Block 2. The flag is the one thing stored, under
// one key, as the string "1". A storage that throws (private mode, a
// disabled policy) reads as not onboarded and is never a crash.

const realStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

/** Put the real storage back, whether jsdom held it as an own property or not. */
function restoreStorage(): void {
  vi.unstubAllGlobals();
  if (realStorage !== undefined) {
    Object.defineProperty(globalThis, "localStorage", realStorage);
  } else {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
}

function denied(): never {
  throw new DOMException("The operation is insecure.", "SecurityError");
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  restoreStorage();
  localStorage.clear();
});

describe("the onboarded flag (AC-7, Block 2)", () => {
  it('lives under the key "cc.onboarded"', () => {
    expect(ONBOARDED_KEY).toBe("cc.onboarded");
  });

  it("reads as not onboarded on a device that never set it", () => {
    expect(isOnboarded()).toBe(false);
  });

  it('reads as onboarded when the key holds "1"', () => {
    localStorage.setItem("cc.onboarded", "1");
    expect(isOnboarded()).toBe(true);
  });

  it.each(["", "0", "true", "yes", " 1"])(
    'reads %j as not onboarded - only "1" counts',
    (value) => {
      localStorage.setItem("cc.onboarded", value);
      expect(isOnboarded()).toBe(false);
    },
  );

  it('markOnboarded writes "1" under the key, and the device then reads as onboarded', () => {
    markOnboarded();
    expect(localStorage.getItem("cc.onboarded")).toBe("1");
    expect(isOnboarded()).toBe(true);
  });

  it("markOnboarded stores nothing but the flag", () => {
    markOnboarded();
    expect(localStorage).toHaveLength(1);
    expect(localStorage.key(0)).toBe("cc.onboarded");
  });
});

describe("a storage that throws (AC-7, Block 2)", () => {
  it("reading localStorage itself throws: not onboarded, and nothing throws", () => {
    localStorage.setItem("cc.onboarded", "1");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: denied,
    });
    expect(() => isOnboarded()).not.toThrow();
    expect(isOnboarded()).toBe(false);
    expect(() => markOnboarded()).not.toThrow();
  });

  it("every storage method throws: not onboarded, and markOnboarded is a no-op that does not throw", () => {
    const throwing = {
      getItem: vi.fn(denied),
      setItem: vi.fn(denied),
      removeItem: vi.fn(denied),
      clear: vi.fn(denied),
      key: vi.fn(denied),
      length: 0,
    };
    vi.stubGlobal("localStorage", throwing);
    expect(() => isOnboarded()).not.toThrow();
    expect(isOnboarded()).toBe(false);
    expect(() => markOnboarded()).not.toThrow();
    restoreStorage();
    expect(localStorage.getItem("cc.onboarded")).toBeNull();
  });
});
