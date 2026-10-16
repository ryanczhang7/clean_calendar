import { describe, expect, it } from "vitest";
import { DEFAULT_KINDS } from "./defaultKinds";

// CAL-006 AC-1, Contract Block 2. Settled: the eleven rows are written out
// by hand from kinds-palette.md's table (via Block 2), never imported or
// derived from it.

const EXPECTED = [
  {
    name: "Movies",
    colorLight: "#7E3FB8",
    colorDark: "#CFA8F0",
    sortOrder: 1,
    isDefault: true,
  },
  {
    name: "Entertainment",
    colorLight: "#BD8200",
    colorDark: "#F5CC6A",
    sortOrder: 2,
    isDefault: true,
  },
  {
    name: "Flights",
    colorLight: "#0B6E80",
    colorDark: "#7AD4E4",
    sortOrder: 3,
    isDefault: true,
  },
  {
    name: "Hotel stays",
    colorLight: "#5147C9",
    colorDark: "#B3AEF7",
    sortOrder: 4,
    isDefault: true,
  },
  {
    name: "Other travel",
    colorLight: "#0D7265",
    colorDark: "#74D3C2",
    sortOrder: 5,
    isDefault: true,
  },
  {
    name: "Restaurant reservations",
    colorLight: "#BF4A17",
    colorDark: "#F5A47C",
    sortOrder: 6,
    isDefault: true,
  },
  {
    name: "Birthdays",
    colorLight: "#C2185B",
    colorDark: "#F39BBE",
    sortOrder: 7,
    isDefault: true,
  },
  {
    name: "Gym",
    colorLight: "#2E7D32",
    colorDark: "#9BD69B",
    sortOrder: 8,
    isDefault: true,
  },
  {
    name: "Work / meetings",
    colorLight: "#2A5BD7",
    colorDark: "#A3C0FA",
    sortOrder: 9,
    isDefault: true,
  },
  {
    name: "Appointments",
    colorLight: "#7D5234",
    colorDark: "#D8B297",
    sortOrder: 10,
    isDefault: true,
  },
  {
    name: "Social / personal",
    colorLight: "#5E7114",
    colorDark: "#C9D66B",
    sortOrder: 11,
    isDefault: true,
  },
];

describe("DEFAULT_KINDS (AC-1)", () => {
  it("lists the palette's eleven kinds, in its order, with exactly its names, hexes and sort orders", () => {
    expect(DEFAULT_KINDS).toStrictEqual(EXPECTED);
  });

  it("has exactly eleven entries", () => {
    expect(DEFAULT_KINDS).toHaveLength(11);
  });

  it("carries only the five NewKind fields - no id, no stamps", () => {
    for (const kind of DEFAULT_KINDS) {
      expect(Object.keys(kind).sort()).toStrictEqual([
        "colorDark",
        "colorLight",
        "isDefault",
        "name",
        "sortOrder",
      ]);
    }
  });
});
