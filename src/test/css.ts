// A small, brace-aware reader for the token stylesheet. It imports nothing
// from the source tree, so the token diff it drives can be exercised on a
// fixture before src/styles/tokens.css exists (CAL-002, negative control).

export type CssBlock = {
  /** The prelude with comments stripped and whitespace collapsed. */
  prelude: string;
  /** The raw text between the braces. */
  body: string;
  /** Nested blocks, filled only for an at-rule (`@media …`). */
  children: CssBlock[];
};

function normalise(prelude: string): string {
  return prelude
    .replace(/\s+/g, " ")
    .replace(/\s*([():[\]=,])\s*/g, "$1")
    .replace(/'/g, '"')
    .trim();
}

/** Parse a stylesheet into its top-level blocks, recursing into at-rules. */
export function parseCss(css: string): CssBlock[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks: CssBlock[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ";") {
      // a statement at this level (`@import …;`) - not a block
      start = i + 1;
    } else if (ch === "{") {
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth += 1;
        else if (text[j] === "}") depth -= 1;
        j += 1;
      }
      const prelude = normalise(text.slice(start, i));
      const body = text.slice(i + 1, j - 1);
      blocks.push({
        prelude,
        body,
        children: prelude.startsWith("@") ? parseCss(body) : [],
      });
      start = j;
      i = j;
      continue;
    }
    i += 1;
  }
  return blocks;
}

/** Every custom property declared directly in a block body, name -> value. */
export function customProperties(body: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const m of body.matchAll(/(?:^|;)\s*(--[a-z0-9-]+)\s*:([^;]*)/g)) {
    const [, name, value] = m;
    if (name !== undefined) found.set(name, (value ?? "").trim());
  }
  return found;
}

/** The value of an ordinary property declared directly in a block body. */
export function propertyValue(body: string, property: string): string | null {
  for (const m of body.matchAll(/(?:^|;)\s*([a-z-]+)\s*:([^;]*)/g)) {
    if (m[1] === property) return (m[2] ?? "").trim().replace(/\s+/g, " ");
  }
  return null;
}

/** Top-level blocks whose normalised prelude equals `prelude`. */
export function blocksAt(blocks: CssBlock[], prelude: string): CssBlock[] {
  const want = normalise(prelude);
  return blocks.filter((b) => b.prelude === want);
}

/**
 * The union of the custom properties declared by every block reached by
 * following `path` (an at-rule prelude, then a selector, …) from the top.
 */
export function declaredAt(
  blocks: CssBlock[],
  ...path: string[]
): Map<string, string> | null {
  let level = blocks;
  let hits: CssBlock[] = [];
  for (const [n, prelude] of path.entries()) {
    hits = blocksAt(level, prelude);
    if (hits.length === 0) return null;
    if (n < path.length - 1) level = hits.flatMap((b) => b.children);
  }
  const merged = new Map<string, string>();
  for (const b of hits) {
    for (const [k, v] of customProperties(b.body)) merged.set(k, v);
  }
  return merged;
}
