import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parse } from "smol-toml";
import { describe, expect, test } from "vitest";

// CAL-030 AC-2, Contract Block 8 (Return 2). `supabase functions deploy`
// (CLI 2.120.0, `functions.deploy.resolveConfigs`) takes a function's import
// map from `[functions.<slug>].import_map` in supabase/config.toml - a
// relative path joined to the `supabase/` directory - else a deno.json,
// deno.jsonc or import_map.json beside the entrypoint, else
// supabase/functions/import_map.json. It never reads supabase/functions/
// deno.json, which is where this repository's map lives. So every deployed
// function must NAME its map in config.toml, and that map must cover every
// bare specifier the function's code reaches, or the hosted bundler fails on
// it (deploy run 41116036856: `Relative import path "zod" not prefixed ...`).
//
// Mechanical oracle: config.toml is PARSED (smol-toml), the import map is
// parsed as JSON, and the function's import graph is walked by following
// relative imports from index.ts. The walker has its own sanity case against
// the real `capture` function, so a walker that finds nothing fails.

const REPO = join(import.meta.dirname, "..", "..");
const SUPABASE = join(REPO, "supabase");
const FUNCTIONS = join(SUPABASE, "functions");
const CONFIG = join(SUPABASE, "config.toml");

/** Repo-relative, forward-slashed - so messages and assertions read the same on every OS. */
function rel(path: string): string {
  return relative(REPO, path).split("\\").join("/");
}

/** Directories under supabase/functions/ that hold an index.ts: the deployed functions. */
function functionSlugs(): string[] {
  return readdirSync(FUNCTIONS)
    .filter((name) => statSync(join(FUNCTIONS, name)).isDirectory())
    .filter((name) => existsSync(join(FUNCTIONS, name, "index.ts")))
    .sort();
}

type Stanza = Record<string, unknown>;

/** The `[functions.<slug>]` tables of supabase/config.toml, by slug. */
function functionStanzas(): Record<string, Stanza> {
  const config = parse(readFileSync(CONFIG, "utf8")) as Record<string, unknown>;
  const functions = config.functions;
  if (functions === undefined) return {};
  if (typeof functions !== "object" || functions === null) {
    throw new Error(`supabase/config.toml: [functions] is not a table`);
  }
  return functions as Record<string, Stanza>;
}

/**
 * Every module specifier a TypeScript source imports or re-exports:
 * `import x from "s"`, `import { a,\n b } from "s"` across lines,
 * `import type ... from "s"` (Deno resolves those too), `export ... from "s"`,
 * the side-effect `import "s"` and the dynamic `import("s")`. Only statements
 * that START a line count, so a commented-out `// import ...` does not.
 */
function specifiersOf(source: string): string[] {
  const found: string[] = [];
  const patterns = [
    /^\s*(?:import|export)\b[^;'"]*?\bfrom\s*(["'])([^"']+)\1/gm,
    /^\s*import\s*(["'])([^"']+)\1/gm,
    /\bimport\s*\(\s*(["'])([^"']+)\1\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[2];
      if (specifier !== undefined) found.push(specifier);
    }
  }
  return found;
}

function isRelative(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

const NOT_BARE = ["./", "../", "/", "npm:", "jsr:", "http:", "https:", "node:"];

function isBare(specifier: string): boolean {
  return !NOT_BARE.some((prefix) => specifier.startsWith(prefix));
}

interface Graph {
  /** Repo-relative paths of every .ts file reached, entry included. */
  reachable: string[];
  /** Bare specifiers imported anywhere in the graph, sorted, unique. */
  bare: string[];
  /** Relative imports that name no file on disk. */
  unresolved: string[];
}

/** Walk the relative-import graph from an entry point. */
function walk(entry: string): Graph {
  const seen = new Set<string>();
  const bare = new Set<string>();
  const unresolved: string[] = [];
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of specifiersOf(readFileSync(file, "utf8"))) {
      if (isRelative(specifier)) {
        const target = resolve(dirname(file), specifier);
        if (!existsSync(target)) {
          unresolved.push(`${rel(file)} -> ${specifier}`);
        } else if (/\.(?:ts|tsx|mts)$/.test(target)) {
          queue.push(target);
        }
      } else if (isBare(specifier)) {
        bare.add(specifier);
      }
    }
  }
  return {
    reachable: [...seen].map(rel).sort(),
    bare: [...bare].sort(),
    unresolved,
  };
}

/** Import-map semantics: an exact key, or a key ending in "/" that prefixes the specifier. */
function mapped(imports: Record<string, unknown>, specifier: string): boolean {
  return Object.keys(imports).some(
    (key) =>
      key === specifier || (key.endsWith("/") && specifier.startsWith(key)),
  );
}

const SLUGS = functionSlugs();
const STANZAS = functionStanzas();

describe("the import walker (sanity - a walker that finds nothing must fail)", () => {
  test("reads default, named multi-line, type, re-export, side-effect and dynamic imports, and skips comments", () => {
    const source = [
      'import a from "./a.ts";',
      "import {",
      "  b,",
      "  c,",
      '} from "../b.ts";',
      'import type { T } from "typed";',
      'export { d } from "reexported";',
      'export * from "./star.ts";',
      'import "side-effect";',
      'const e = await import("dynamic");',
      '// import ignored from "commented-out";',
      'const s = "text from \\"not-an-import\\"";',
    ].join("\n");
    expect(specifiersOf(source).sort()).toEqual(
      [
        "./a.ts",
        "../b.ts",
        "typed",
        "reexported",
        "./star.ts",
        "side-effect",
        "dynamic",
      ].sort(),
    );
  });

  test("classifies only specifiers with no ./ ../ / npm: jsr: http(s): node: prefix as bare", () => {
    const all = [
      "zod",
      "@std/assert",
      "./x.ts",
      "../y.ts",
      "/abs.ts",
      "npm:zod@4",
      "jsr:@std/assert",
      "http://example.com/m.ts",
      "https://example.com/m.ts",
      "node:fs",
    ];
    expect(all.filter(isBare)).toEqual(["zod", "@std/assert"]);
  });

  test("capture reaches shared/captureSchema.ts through relative imports, and its only bare import is zod", () => {
    const graph = walk(join(FUNCTIONS, "capture", "index.ts"));
    expect(
      graph.unresolved,
      "relative imports in capture that name no file",
    ).toEqual([]);
    expect(graph.reachable).toEqual(
      expect.arrayContaining([
        "supabase/functions/capture/index.ts",
        "supabase/functions/capture/handler.ts",
        "supabase/functions/_shared/owner.ts",
        "shared/captureSchema.ts",
      ]),
    );
    expect(graph.bare).toEqual(["zod"]);
  });
});

describe("supabase/config.toml names an import map for every deployed function (Contract Block 8)", () => {
  test("every directory under supabase/functions/ with an index.ts has a [functions.<slug>] stanza", () => {
    expect(
      SLUGS,
      "deployed functions found under supabase/functions/",
    ).toContain("capture");
    const missing = SLUGS.filter((slug) => !(slug in STANZAS));
    expect(
      missing,
      "functions with an index.ts but no [functions.<slug>] stanza in supabase/config.toml",
    ).toEqual([]);
  });

  test.each(Object.keys(STANZAS).sort())(
    "[functions.%s] sets import_map to a file that exists, resolved against supabase/",
    (slug) => {
      const importMap = STANZAS[slug]?.import_map;
      expect(
        importMap,
        `[functions.${slug}] in supabase/config.toml sets no import_map, so \`supabase functions deploy\` uploads ${slug} with no import map`,
      ).toBeTypeOf("string");
      const path = resolve(SUPABASE, importMap as string);
      expect(
        existsSync(path) && statSync(path).isFile(),
        `[functions.${slug}].import_map = ${JSON.stringify(importMap)} resolves to ${rel(path)}, which is not a file`,
      ).toBe(true);
    },
  );

  test.each(SLUGS)(
    "the import map named for %s maps every bare specifier its code reaches",
    (slug) => {
      const graph = walk(join(FUNCTIONS, slug, "index.ts"));
      expect(
        graph.unresolved,
        `relative imports in ${slug} that name no file`,
      ).toEqual([]);
      const importMap = STANZAS[slug]?.import_map;
      expect(
        importMap,
        `[functions.${slug}] in supabase/config.toml sets no import_map, so these bare imports of ${slug} cannot resolve when deployed: ${graph.bare.join(", ")}`,
      ).toBeTypeOf("string");
      const path = resolve(SUPABASE, importMap as string);
      const parsed = JSON.parse(readFileSync(path, "utf8")) as {
        imports?: unknown;
      };
      expect(parsed.imports, `${rel(path)} has no "imports" object`).toBeTypeOf(
        "object",
      );
      const imports = (parsed.imports ?? {}) as Record<string, unknown>;
      const unmapped = graph.bare.filter(
        (specifier) => !mapped(imports, specifier),
      );
      expect(
        unmapped,
        `bare specifiers reached from supabase/functions/${slug}/index.ts with no key in ${rel(path)}`,
      ).toEqual([]);
    },
  );
});
