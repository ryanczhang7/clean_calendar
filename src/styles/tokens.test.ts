import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  blocksAt,
  type CssBlock,
  contrastRatio,
  declaredAt,
  parseCss,
  propertyValue,
} from "../test/css";

// The complete token list from docs/wiki/design/tokens.md, carried as a
// literal (CAL-002 Contract, Tokens). It is NOT parsed from tokens.md: a token
// added to one and not the other is the failure this file exists to produce.
const COLOURS = [
  "--color-surface",
  "--color-surface-raised",
  "--color-surface-sunken",
  "--color-text",
  "--color-text-muted",
  "--color-border",
  "--color-border-strong",
  "--color-primary",
  "--color-primary-contrast",
  "--color-primary-subtle",
  "--color-danger",
  "--color-danger-contrast",
  "--color-danger-subtle",
  "--color-warning",
  "--color-warning-subtle",
  "--color-success",
  "--color-focus",
  "--color-chip-neutral",
  "--color-chip-text-dark",
  "--color-chip-text-light",
  "--color-today",
  "--color-selection",
  "--color-now",
  "--color-scrim",
];

const SHADOWS = ["--shadow-1", "--shadow-2", "--shadow-3"];

const TOKENS = [
  ...COLOURS,
  "--font-family",
  "--font-size-xs",
  "--font-size-sm",
  "--font-size-md",
  "--font-size-lg",
  "--font-size-xl",
  "--line-height-xs",
  "--line-height-sm",
  "--line-height-md",
  "--line-height-lg",
  "--line-height-xl",
  "--font-weight-regular",
  "--font-weight-medium",
  "--font-weight-semibold",
  "--space-1",
  "--space-2",
  "--space-3",
  "--space-4",
  "--space-5",
  "--space-6",
  "--space-7",
  "--space-8",
  "--size-touch",
  "--size-control",
  "--size-topbar",
  "--size-bottomnav",
  "--size-hour",
  "--radius-sm",
  "--radius-md",
  "--radius-lg",
  "--radius-full",
  ...SHADOWS,
  "--z-grid",
  "--z-nowline",
  "--z-chip-drag",
  "--z-topbar",
  "--z-panel",
  "--z-scrim",
  "--z-sheet",
  "--z-toast",
  "--z-dialog",
  "--duration-fast",
  "--duration-base",
  "--duration-slow",
  "--ease-standard",
  "--ease-exit",
];

const DARK_MEDIA = "@media (prefers-color-scheme: dark)";
const DARK_UNLESS_LIGHT = ':root:not([data-theme="light"])';
const DARK_FORCED = ':root[data-theme="dark"]';

type Diff = {
  rootMissing: string[];
  rootUnlisted: string[];
  colorScheme: string | null;
  darkBlocks: Record<
    string,
    { missingColours: string[]; notOnRoot: string[]; names: string[] } | null
  >;
  darkDeclarations: Record<string, Record<string, string> | null>;
};

/** Everything AC-1 asserts, computed from one stylesheet's text. */
function tokenDiff(css: string): Diff {
  const blocks: CssBlock[] = parseCss(css);
  const root = declaredAt(blocks, ":root") ?? new Map<string, string>();
  const rootBodies = blocksAt(blocks, ":root").map((b) => b.body);
  const dark = {
    [`${DARK_MEDIA} ${DARK_UNLESS_LIGHT}`]: declaredAt(
      blocks,
      DARK_MEDIA,
      DARK_UNLESS_LIGHT,
    ),
    [DARK_FORCED]: declaredAt(blocks, DARK_FORCED),
  };
  const darkBlocks: Diff["darkBlocks"] = {};
  const darkDeclarations: Diff["darkDeclarations"] = {};
  for (const [where, decls] of Object.entries(dark)) {
    darkBlocks[where] =
      decls === null
        ? null
        : {
            missingColours: COLOURS.filter((c) => !decls.has(c)),
            notOnRoot: [...decls.keys()].filter((k) => !root.has(k)),
            names: [...decls.keys()].sort(),
          };
    darkDeclarations[where] =
      decls === null ? null : Object.fromEntries([...decls].sort());
  }
  return {
    rootMissing: TOKENS.filter((t) => !root.has(t)),
    rootUnlisted: [...root.keys()].filter((k) => !TOKENS.includes(k)),
    colorScheme:
      rootBodies
        .map((b) => propertyValue(b, "color-scheme"))
        .find((v) => v !== null) ?? null,
    darkBlocks,
    darkDeclarations,
  };
}

function readTokens(): string {
  return readFileSync(join(import.meta.dirname, "tokens.css"), "utf8");
}

describe("tokens.css (AC-1)", () => {
  it("declares every token named in tokens.md on :root", () => {
    const { rootMissing } = tokenDiff(readTokens());
    expect(rootMissing, "tokens missing from :root").toEqual([]);
  });

  it("declares nothing on :root that tokens.md does not name", () => {
    const { rootUnlisted } = tokenDiff(readTokens());
    expect(rootUnlisted, "tokens on :root but not in tokens.md").toEqual([]);
  });

  it("sets color-scheme: light dark on :root", () => {
    expect(tokenDiff(readTokens()).colorScheme).toBe("light dark");
  });

  for (const where of [`${DARK_MEDIA} ${DARK_UNLESS_LIGHT}`, DARK_FORCED]) {
    it(`declares every --color-* token in the dark block under ${where}`, () => {
      const block = tokenDiff(readTokens()).darkBlocks[where];
      expect(block, `no dark block under ${where}`).not.toBeNull();
      expect(
        block?.missingColours,
        `colours missing from the dark block under ${where}`,
      ).toEqual([]);
    });

    it(`declares nothing under ${where} that :root lacks`, () => {
      const block = tokenDiff(readTokens()).darkBlocks[where];
      expect(block, `no dark block under ${where}`).not.toBeNull();
      expect(
        block?.notOnRoot,
        `dark tokens under ${where} that :root does not declare`,
      ).toEqual([]);
    });

    it(`overrides exactly the colours and the shadows under ${where}`, () => {
      const block = tokenDiff(readTokens()).darkBlocks[where];
      expect(block, `no dark block under ${where}`).not.toBeNull();
      expect(block?.names).toEqual([...COLOURS, ...SHADOWS].sort());
    });
  }

  it("gives the media-query dark block and the forced dark block identical declarations", () => {
    const { darkDeclarations } = tokenDiff(readTokens());
    const unlessLight = darkDeclarations[`${DARK_MEDIA} ${DARK_UNLESS_LIGHT}`];
    const forced = darkDeclarations[DARK_FORCED];
    expect(unlessLight).not.toBeNull();
    expect(forced).toEqual(unlessLight);
  });

  it("zeroes the base and slow durations under prefers-reduced-motion", () => {
    const reduced = declaredAt(
      parseCss(readTokens()),
      "@media (prefers-reduced-motion: reduce)",
      ":root",
    );
    expect(reduced?.get("--duration-base")).toBe("0ms");
    expect(reduced?.get("--duration-slow")).toBe("0ms");
  });
});

// The diff itself, on a fixture: the in-framework half of AC-1's negative
// control. The real-file half (one dark line deleted from the committed
// tokens.css with scripts/mutate.sh) is owned by GATES.
describe("the token diff (fixture, negative control)", () => {
  const decls = (names: string[], value: string) =>
    names.map((n) => `${n}: ${value};`).join("\n");
  const complete = (darkColours: string[]) => `
    /* breakpoints: 600px, 1024px */
    :root { color-scheme: light dark; ${decls(TOKENS, "1px")} }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) { ${decls([...darkColours, ...SHADOWS], "2px")} }
    }
    :root[data-theme="dark"] { ${decls([...COLOURS, ...SHADOWS], "2px")} }
    @media (prefers-reduced-motion: reduce) {
      :root { --duration-base: 0ms; --duration-slow: 0ms; }
    }`;

  it("finds nothing wrong with a complete stylesheet", () => {
    const diff = tokenDiff(complete(COLOURS));
    expect(diff.rootMissing).toEqual([]);
    expect(diff.rootUnlisted).toEqual([]);
    expect(diff.colorScheme).toBe("light dark");
    for (const block of Object.values(diff.darkBlocks)) {
      expect(block?.missingColours).toEqual([]);
      expect(block?.notOnRoot).toEqual([]);
    }
  });

  it("names the one colour deleted from the media-query dark block", () => {
    const diff = tokenDiff(
      complete(COLOURS.filter((c) => c !== "--color-today")),
    );
    expect(
      diff.darkBlocks[`${DARK_MEDIA} ${DARK_UNLESS_LIGHT}`]?.missingColours,
    ).toEqual(["--color-today"]);
    expect(diff.darkBlocks[DARK_FORCED]?.missingColours).toEqual([]);
  });

  it("names a dark token that :root does not declare", () => {
    const css = complete(COLOURS).replace(
      ':root[data-theme="dark"] {',
      ':root[data-theme="dark"] { --color-extra: red;',
    );
    expect(tokenDiff(css).darkBlocks[DARK_FORCED]?.notOnRoot).toEqual([
      "--color-extra",
    ]);
  });
});

// The oracle (CAL-037 Contract, Block 1), pinned on points that need no table.
describe("the WCAG 2.x contrast oracle (CAL-037)", () => {
  it("rates black on white 21:1 (CAL-037 AC-2)", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 10);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 10);
  });

  it("rates a colour against itself 1:1 (CAL-037 AC-2)", () => {
    expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
  });

  it("rates the audit's mutant, #1b1b1f on #121417, about 1.075:1 (CAL-037 AC-1)", () => {
    expect(contrastRatio("#1b1b1f", "#121417")).toBeCloseTo(1.075, 3);
  });

  it("refuses anything that is not #rrggbb (CAL-037 AC-1)", () => {
    for (const bad of ["#fff", "rgba(0, 0, 0, 0.6)", "white", "#12345g", ""]) {
      expect(() => contrastRatio(bad, "#ffffff"), bad).toThrow(/#rrggbb/);
    }
  });
});

// docs/wiki/design/tokens.md, "Contrast of the roles that carry text"
// (CAL-037 Contract, Block 2). Carried as a literal, figures as the strings
// printed so their precision is visible; null is the table's "—". Floors from
// docs/wiki/design/accessibility.md, Contrast: 4.5 for text, 3 for the
// control boundary (border-strong).
type Pair = {
  fg: string;
  bg: string;
  floor: number;
  light: string | null;
  dark: string | null;
};

const PAIRS: Pair[] = [
  {
    fg: "--color-text",
    bg: "--color-surface",
    floor: 4.5,
    light: "17.17",
    dark: "15.31",
  },
  {
    fg: "--color-text-muted",
    bg: "--color-surface",
    floor: 4.5,
    light: "6.05",
    dark: "8.18",
  },
  {
    fg: "--color-text-muted",
    bg: "--color-surface-raised",
    floor: 4.5,
    light: "5.6",
    dark: "7.33",
  },
  {
    fg: "--color-primary",
    bg: "--color-surface",
    floor: 4.5,
    light: "5.85",
    dark: "8.91",
  },
  {
    fg: "--color-primary-contrast",
    bg: "--color-primary",
    floor: 4.5,
    light: "5.85",
    dark: "8.91",
  },
  {
    fg: "--color-danger",
    bg: "--color-surface",
    floor: 4.5,
    light: "6.54",
    dark: "9.30",
  },
  {
    fg: "--color-warning",
    bg: "--color-surface",
    floor: 4.5,
    light: "5.93",
    dark: "11.18",
  },
  {
    fg: "--color-success",
    bg: "--color-surface",
    floor: 4.5,
    light: "6.57",
    dark: "10.54",
  },
  {
    fg: "--color-border-strong",
    bg: "--color-surface",
    floor: 3,
    light: "4.43",
    dark: "5.7",
  },
  {
    fg: "--color-focus",
    bg: "--color-surface",
    floor: 4.5,
    light: "5.85",
    dark: "8.91",
  },
  {
    fg: "--color-chip-text-light",
    bg: "--color-chip-neutral",
    floor: 4.5,
    light: "5.07",
    dark: null,
  },
  {
    fg: "--color-chip-text-dark",
    bg: "--color-chip-neutral",
    floor: 4.5,
    light: null,
    dark: "8.80",
  },
];

const THEMES = [
  { theme: "light (:root)", path: [":root"], column: "light" },
  {
    theme: "media-query dark",
    path: [DARK_MEDIA, DARK_UNLESS_LIGHT],
    column: "dark",
  },
  { theme: "forced dark", path: [DARK_FORCED], column: "dark" },
] as const;

/** A theme's token resolver; a missing token fails with its name. */
function theme(path: readonly string[]): (token: string) => string {
  const decls = declaredAt(parseCss(readTokens()), ...path);
  return (token) => {
    const value = decls?.get(token);
    if (value === undefined) {
      throw new Error(`${token} is not declared under ${path.join(" ")}`);
    }
    return value;
  };
}

// AC-1 (Block 3): each pair meets its floor in each theme, resolved per block.
// A chip pair applies only to the theme its column prints a figure for.
const FLOOR_ROWS = THEMES.flatMap(({ theme: name, path, column }) =>
  PAIRS.filter((p) => p[column] !== null).map((p) => ({ name, path, ...p })),
);

describe("text colour tokens meet the contrast floor (CAL-037 AC-1)", () => {
  it.each(FLOOR_ROWS)(
    "$name: $fg on $bg is at least $floor:1 (CAL-037 AC-1)",
    ({ name, path, fg, bg, floor }) => {
      const resolve = theme(path);
      const ratio = contrastRatio(resolve(fg), resolve(bg));
      expect(
        ratio,
        `${fg} on ${bg} in ${name} is ${ratio.toFixed(3)}:1, floor ${floor}:1`,
      ).toBeGreaterThanOrEqual(floor);
    },
  );
});

/** Digits after the point in a printed figure: "5.6" -> 1, "9.30" -> 2. */
function decimals(printed: string): number {
  return printed.split(".")[1]?.length ?? 0;
}

// AC-2 (Block 4): the oracle reproduces every printed figure from the token
// hexes, to the precision printed. Dark figures are read from the media-query
// block, the one v1 applies; the identical-declarations test above keeps the
// forced block equal to it.
const CALIBRATION_ROWS = (["light", "dark"] as const).flatMap((column) =>
  PAIRS.flatMap((p) => {
    const printed = p[column];
    return printed === null ? [] : [{ column, printed, fg: p.fg, bg: p.bg }];
  }),
);

describe("the oracle reproduces tokens.md's contrast table (CAL-037 AC-2)", () => {
  it.each(CALIBRATION_ROWS)(
    "$column: $fg on $bg computes to the printed $printed (CAL-037 AC-2)",
    ({ column, printed, fg, bg }) => {
      const path =
        column === "light" ? [":root"] : [DARK_MEDIA, DARK_UNLESS_LIGHT];
      const resolve = theme(path);
      const computed = contrastRatio(resolve(fg), resolve(bg));
      const tolerance = 0.5 * 10 ** -decimals(printed) + 1e-9;
      expect(
        Math.abs(computed - Number(printed)),
        `${column} ${fg} on ${bg}: computed ${computed.toFixed(4)}, printed ${printed}`,
      ).toBeLessThanOrEqual(tolerance);
    },
  );
});
