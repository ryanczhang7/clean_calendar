import { describe, expect, it } from "vitest";
import {
  CHIP_TEXT_DARK,
  CHIP_TEXT_LIGHT,
  chipText,
  contrast,
  darkCounterpart,
  nearestPassing,
  relativeLuminance,
  SURFACE_DARK,
  SURFACE_FLOOR,
  SURFACE_LIGHT,
  TEXT_FLOOR,
} from "./colour";

// CAL-006 AC-2, Contract Block 1. Every expected value below is READ OUT of
// Block 1's table (the PO's awk run over the WCAG 2.x formula, which agrees
// with kinds-palette.md to the digit). Nothing here recomputes them: a test
// that derived its oracle from the formula would agree with any
// implementation of the same mistake.

const DARK = "#1B1B1F";
const WHITE = "#FFFFFF";

// [input, label, expected text, expected rounded ratio]
const PALETTE: Array<[string, string, string, number]> = [
  ["#7E3FB8", "Movies light", WHITE, 6.38],
  ["#CFA8F0", "Movies dark", DARK, 8.59],
  ["#BD8200", "Entertainment light", DARK, 5.2],
  ["#F5CC6A", "Entertainment dark", DARK, 11.22],
  ["#0B6E80", "Flights light", WHITE, 5.91],
  ["#7AD4E4", "Flights dark", DARK, 10.11],
  ["#5147C9", "Hotel stays light", WHITE, 6.79],
  ["#B3AEF7", "Hotel stays dark", DARK, 8.43],
  ["#0D7265", "Other travel light", WHITE, 5.81],
  ["#74D3C2", "Other travel dark", DARK, 9.68],
  ["#BF4A17", "Restaurant light", WHITE, 4.99],
  ["#F5A47C", "Restaurant dark", DARK, 8.57],
  ["#C2185B", "Birthdays light", WHITE, 5.87],
  ["#F39BBE", "Birthdays dark", DARK, 8.37],
  ["#2E7D32", "Gym light", WHITE, 5.13],
  ["#9BD69B", "Gym dark", DARK, 10.21],
  ["#2A5BD7", "Work light", WHITE, 5.87],
  ["#A3C0FA", "Work dark", DARK, 9.38],
  ["#7D5234", "Appointments light", WHITE, 6.71],
  ["#D8B297", "Appointments dark", DARK, 8.78],
  ["#5E7114", "Social light", WHITE, 5.46],
  ["#C9D66B", "Social dark", DARK, 10.89],
];

// [input, expected text, expected rounded ratio, vs white, vs dark]
const CONTROLS: Array<[string, string, number, number, number]> = [
  ["#808080", DARK, 4.35, 3.9494, 4.3471],
  ["#7F7F7F", DARK, 4.29, 4.0041, 4.2878],
  ["#FFFF00", DARK, 15.99, 1.0738, 15.9881],
  ["#000080", WHITE, 16.01, 16.0097, 1.0724],
];

describe("the two chip text colours (Block 1)", () => {
  it("are #1B1B1F and #FFFFFF", () => {
    expect(CHIP_TEXT_DARK).toBe("#1B1B1F");
    expect(CHIP_TEXT_LIGHT).toBe("#FFFFFF");
  });
});

describe("chipText picks the text colour the palette table records (AC-2)", () => {
  it.each(PALETTE)(
    "%s (%s) takes %s text at %s:1",
    (hex, _label, text, ratio) => {
      expect(chipText(hex)).toStrictEqual({ text, ratio });
    },
  );

  it("every default in both themes reaches 4.5:1", () => {
    const below = PALETTE.map(([hex]) => [hex, chipText(hex).ratio] as const)
      .filter(([, ratio]) => ratio < 4.5)
      .map(([hex, ratio]) => `${hex}=${ratio}`);
    expect(below).toStrictEqual([]);
  });
});

describe("chipText returns the higher of the two candidates for the controls (AC-2)", () => {
  it.each(CONTROLS)("%s takes %s text at %s:1", (hex, text, ratio) => {
    expect(chipText(hex)).toStrictEqual({ text, ratio });
  });

  it("the negative control #808080 reports 4.35 with dark text - below 4.5, the ratio CAL-007's editor refuses", () => {
    const result = chipText("#808080");
    expect(result.text).toBe("#1B1B1F");
    expect(result.ratio).toBe(4.35);
    expect(result.ratio).toBeLessThan(4.5);
  });

  it("rounds to two decimals at full precision, not from a rounded anchor luminance (4.35, not 4.34)", () => {
    expect(chipText("#808080").ratio).not.toBe(4.34);
  });
});

describe("contrast implements the WCAG 2.x ratio, unrounded (AC-2)", () => {
  it.each(CONTROLS)(
    "%s against white and against #1B1B1F",
    (hex, _text, _ratio, vsWhite, vsDark) => {
      expect(contrast(hex, WHITE)).toBeCloseTo(vsWhite, 3);
      expect(contrast(hex, DARK)).toBeCloseTo(vsDark, 3);
    },
  );

  it("#FFFFFF against #1B1B1F is 17.17", () => {
    expect(contrast("#FFFFFF", "#1B1B1F")).toBeCloseTo(17.17, 2);
  });

  it("is symmetric", () => {
    const pairs: Array<[string, string]> = [
      ["#FFFFFF", "#1B1B1F"],
      ["#808080", "#FFFFFF"],
      ["#BD8200", "#1B1B1F"],
      ["#000080", "#FFFF00"],
    ];
    for (const [a, b] of pairs) {
      expect(contrast(a, b)).toBe(contrast(b, a));
    }
  });

  it("a colour against itself is exactly 1", () => {
    expect(contrast("#808080", "#808080")).toBe(1);
  });

  it("is not rounded: #808080 against #1B1B1F is 4.3471, not 4.35", () => {
    expect(contrast("#808080", DARK)).not.toBe(4.35);
    expect(contrast("#808080", DARK)).toBeCloseTo(4.3471, 4);
  });
});

describe("relativeLuminance (Block 1)", () => {
  it("is 1 for white and 0 for black", () => {
    expect(relativeLuminance("#FFFFFF")).toBe(1);
    expect(relativeLuminance("#000000")).toBe(0);
  });

  it("is 0.011158 for #1B1B1F and 0.21586 for #808080, at full precision", () => {
    expect(relativeLuminance("#1B1B1F")).toBeCloseTo(0.011158, 6);
    expect(relativeLuminance("#808080")).toBeCloseTo(0.21586, 5);
  });

  it("uses the linear segment below 0.04045: #0A0A0A is (10/255)/12.92", () => {
    // 10/255 = 0.0392 <= 0.04045, so each channel is c/12.92 and the
    // weights sum to 1.
    expect(relativeLuminance("#0A0A0A")).toBeCloseTo(10 / 255 / 12.92, 10);
  });

  it("weights the channels 0.2126 R, 0.7152 G, 0.0722 B", () => {
    expect(relativeLuminance("#FF0000")).toBeCloseTo(0.2126, 10);
    expect(relativeLuminance("#00FF00")).toBeCloseTo(0.7152, 10);
    expect(relativeLuminance("#0000FF")).toBeCloseTo(0.0722, 10);
  });
});

describe("hex input (Block 1)", () => {
  it("lower-case hex is the same colour as upper-case", () => {
    expect(chipText("#bd8200")).toStrictEqual(chipText("#BD8200"));
    expect(relativeLuminance("#cfa8f0")).toBe(relativeLuminance("#CFA8F0"));
  });

  it.each(["bd8200", "#bd8", "#BD8200FF", "", "#GGGGGG", " #BD8200"])(
    "%j throws a RangeError naming the input",
    (bad) => {
      expect(() => chipText(bad)).toThrow(RangeError);
      expect(() => relativeLuminance(bad)).toThrow(RangeError);
      expect(() => contrast(bad, "#FFFFFF")).toThrow(RangeError);
      expect(() => contrast("#FFFFFF", bad)).toThrow(RangeError);
      let message = "";
      try {
        chipText(bad);
      } catch (e) {
        message = (e as Error).message;
      }
      // For "" this needle is vacuous; the RangeError type above still holds.
      expect(message).toContain(bad);
    },
  );
});

// CAL-007 AC-3 and AC-4, Contract Block 1. The expected hexes are READ OUT of
// Block 1 (#808080 -> #858585 lighter; #BD8200 and #FFFFFF -> null) or were
// derived by RED from Block 1's HSL algorithm in a standalone script that
// imports nothing from src/ (CAL-007 Handoff, "Expected values"). None is
// recomputed here from the module under test.

describe("the CAL-007 constants (Block 1)", () => {
  it("the surfaces are tokens.css --color-surface: #FFFFFF light, #121417 dark", () => {
    expect(SURFACE_LIGHT).toBe("#FFFFFF");
    expect(SURFACE_DARK).toBe("#121417");
  });

  it("the text floor is 4.5 and the surface floor is 3", () => {
    expect(TEXT_FLOOR).toBe(4.5);
    expect(SURFACE_FLOOR).toBe(3);
  });
});

describe("nearestPassing (AC-4, Block 1)", () => {
  it("moves #808080 (4.35:1) two points lighter to #858585, not four darker", () => {
    expect(nearestPassing("#808080")).toStrictEqual({
      hex: "#858585",
      direction: "lighter",
    });
  });

  it("moves #777777 (4.48:1) one point darker to #757575, not five lighter", () => {
    expect(nearestPassing("#777777")).toStrictEqual({
      hex: "#757575",
      direction: "darker",
    });
  });

  it("moves #7F7F7F (4.29:1), which shares #808080's lightness, to #858585 too", () => {
    expect(nearestPassing("#7F7F7F")).toStrictEqual({
      hex: "#858585",
      direction: "lighter",
    });
  });

  it("breaks a tie toward darker: #7E7E7E (4.23:1) is three points from passing either way and goes to #757575", () => {
    expect(nearestPassing("#7E7E7E")).toStrictEqual({
      hex: "#757575",
      direction: "darker",
    });
  });

  it("keeps hue and saturation: #3C8D40 (4.15:1) goes two points darker to #38843C", () => {
    expect(nearestPassing("#3C8D40")).toStrictEqual({
      hex: "#38843C",
      direction: "darker",
    });
  });

  it("returns null for a colour that already passes: #BD8200 (5.20:1)", () => {
    expect(nearestPassing("#BD8200")).toBeNull();
  });

  it("returns null for #FFFFFF", () => {
    expect(nearestPassing("#FFFFFF")).toBeNull();
  });

  it("returns null for a grey just above the floor: #888888 (4.84:1)", () => {
    expect(nearestPassing("#888888")).toBeNull();
  });

  it("always returns an upper-case #RRGGBB whose chip text reaches 4.5:1", () => {
    const failing = [
      "#808080",
      "#7F7F7F",
      "#777777",
      "#7A7A7A",
      "#7E7E7E",
      "#3C8D40",
      "#c8602e",
      "#5c7fd6",
      "#c0567a",
      "#b0608a",
      "#e91e63",
    ];
    const violations: string[] = [];
    for (const hex of failing) {
      if (chipText(hex).ratio >= 4.5) {
        violations.push(`${hex} already passes, so it is not a failing input`);
        continue;
      }
      const result = nearestPassing(hex);
      if (result === null) {
        violations.push(`${hex} -> null`);
      } else if (!/^#[0-9A-F]{6}$/.test(result.hex)) {
        violations.push(`${hex} -> ${result.hex} is not upper-case #RRGGBB`);
      } else if (chipText(result.hex).ratio < 4.5) {
        violations.push(
          `${hex} -> ${result.hex} at ${chipText(result.hex).ratio}:1`,
        );
      }
    }
    expect(violations).toStrictEqual([]);
  });
});

describe("darkCounterpart (AC-3, Block 1)", () => {
  it("lightens #1565C0 to #7EB4F1, the first lightness point at relative luminance >= 0.42", () => {
    expect(darkCounterpart("#1565C0")).toBe("#7EB4F1");
  });

  it("lightens #2E7D32 to #5BC360, keeping hue and saturation at full precision", () => {
    // Whole-degree hue and whole-percent saturation would give #5BC260.
    expect(darkCounterpart("#2E7D32")).toBe("#5BC360");
  });

  it("returns a colour already at or above 0.42 unchanged: #F5CC6A", () => {
    expect(darkCounterpart("#F5CC6A")).toBe("#F5CC6A");
  });

  it("returns #FFFFFF unchanged", () => {
    expect(darkCounterpart("#FFFFFF")).toBe("#FFFFFF");
  });

  it("always returns an upper-case #RRGGBB at relative luminance >= 0.42", () => {
    const inputs = [
      "#1565C0",
      "#2E7D32",
      "#808080",
      "#000000",
      "#6A1B9A",
      "#00695C",
      "#bf4a17",
      "#121417",
    ];
    const violations: string[] = [];
    for (const hex of inputs) {
      const out = darkCounterpart(hex);
      if (!/^#[0-9A-F]{6}$/.test(out)) {
        violations.push(`${hex} -> ${out} is not upper-case #RRGGBB`);
      } else if (relativeLuminance(out) < 0.42) {
        violations.push(`${hex} -> ${out} at ${relativeLuminance(out)}`);
      }
    }
    expect(violations).toStrictEqual([]);
  });
});
