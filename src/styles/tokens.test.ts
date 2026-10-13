import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  blocksAt,
  type CssBlock,
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
