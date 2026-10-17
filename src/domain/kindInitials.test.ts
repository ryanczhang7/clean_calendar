import { describe, expect, it } from "vitest";
import type { Kind } from "../data/rows";
import { kindInitials } from "./kindInitials";

// CAL-009 AC-8, Contract Block 2. MECHANICAL: one letter (first code point,
// trimmed, upper-cased - KindList's initialOf) unless another kind IN THE
// LIST shares it case-insensitively; then the first two code points of the
// trimmed name, the first upper-cased and the second as written. The input
// is the live kinds only, so a soft-deleted kind never reaches it.

const STAMP = "2026-10-16T08:00:00.000001+00:00";

function kind(n: number, name: string): Kind {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name,
    colorLight: "#2E7D32",
    colorDark: "#9BD69B",
    sortOrder: n,
    isDefault: false,
    deletedAt: null,
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

/** id -> initial, as a plain object keyed by kind name for readable diffs. */
function initialsByName(kinds: Kind[]): Record<string, string | undefined> {
  const map = kindInitials(kinds);
  return Object.fromEntries(kinds.map((k) => [k.name, map.get(k.id)]));
}

describe("kindInitials(kinds) (AC-8, Block 2)", () => {
  it('gives two kinds starting with the same letter their first two letters: "Gy" and "Go"', () => {
    expect(initialsByName([kind(1, "Gym"), kind(2, "Golf")])).toStrictEqual({
      Gym: "Gy",
      Golf: "Go",
    });
  });

  it('gives a kind whose initial nobody shares one letter: a lone "Movies" is "M"', () => {
    expect(initialsByName([kind(1, "Movies")])).toStrictEqual({ Movies: "M" });
  });

  it("decides per kind: in Movies, Gym, Golf only the clashing two get two letters", () => {
    expect(
      initialsByName([kind(1, "Movies"), kind(2, "Gym"), kind(3, "Golf")]),
    ).toStrictEqual({ Movies: "M", Gym: "Gy", Golf: "Go" });
  });

  it('compares initials case-insensitively and upper-cases only the first letter: "gym" -> "Gy"', () => {
    expect(initialsByName([kind(1, "gym"), kind(2, "Golf")])).toStrictEqual({
      gym: "Gy",
      Golf: "Go",
    });
  });

  it('upper-cases a lone lowercase name: "movies" -> "M"', () => {
    expect(initialsByName([kind(1, "movies")])).toStrictEqual({ movies: "M" });
  });

  it('keeps the second letter as written: "GYM" beside "Golf" -> "GY"', () => {
    expect(initialsByName([kind(1, "GYM"), kind(2, "Golf")])).toStrictEqual({
      GYM: "GY",
      Golf: "Go",
    });
  });

  it("trims before taking letters", () => {
    expect(initialsByName([kind(1, "  Golf"), kind(2, "Gym ")])).toStrictEqual({
      "  Golf": "Go",
      "Gym ": "Gy",
    });
    expect(initialsByName([kind(1, "  movies")])).toStrictEqual({
      "  movies": "M",
    });
  });

  it("still gives two letters when the first two also clash (not unique, accepted)", () => {
    expect(
      initialsByName([kind(1, "Gym"), kind(2, "Gymnastics"), kind(3, "Golf")]),
    ).toStrictEqual({ Gym: "Gy", Gymnastics: "Gy", Golf: "Go" });
  });

  it("a one-letter name in a clash has only its one letter to give", () => {
    expect(initialsByName([kind(1, "G"), kind(2, "Gym")])).toStrictEqual({
      G: "G",
      Gym: "Gy",
    });
  });

  it("takes code points, not UTF-16 units: a lone emoji-led name shows the whole emoji", () => {
    expect(initialsByName([kind(1, "🎬 Films")])).toStrictEqual({
      "🎬 Films": "🎬",
    });
  });

  it('maps a blank name to ""', () => {
    expect(initialsByName([kind(1, ""), kind(2, "   ")])).toStrictEqual({
      "": "",
      "   ": "",
    });
  });

  it("kinds with different initials each keep one letter: Gym and Movies -> G and M", () => {
    // The soft-deleted case (a removed Gardening must not force a live Gym
    // to "Gy") is MonthView's to pin: it is the caller that passes
    // useKinds().kinds, live only (MonthView.test.tsx, AC-8).
    expect(initialsByName([kind(1, "Gym"), kind(2, "Movies")])).toStrictEqual({
      Gym: "G",
      Movies: "M",
    });
  });

  it("keys the map by kind id, one entry per kind, and returns an empty map for no kinds", () => {
    const gym = kind(1, "Gym");
    const golf = kind(2, "Golf");
    const map = kindInitials([gym, golf]);
    expect(map).toBeInstanceOf(Map);
    expect([...map.keys()].sort()).toStrictEqual([gym.id, golf.id].sort());
    expect(kindInitials([]).size).toBe(0);
  });
});
