import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// CAL-030 AC-3, Contract Block 2. Vite copies public/ into dist/ verbatim
// (settled Vite behaviour, the `build` gate's), so the hosting files are
// asserted where they are authored: public/_headers, and the ABSENCE of
// public/404.html and public/_redirects - with neither, Cloudflare Pages
// serves index.html for every client route (its single-page-app default).
//
// `_headers` is PARSED with Cloudflare Pages' syntax: a URL pattern at column
// 0, then indented `Name: value` lines. Pages applies EVERY rule whose
// pattern matches a request, and joins repeated headers, so a `/*` rule with
// its own Cache-Control would quietly add to `no-cache`. The assertion is
// therefore over all matching rules, not the one written for the path.

const REPO = join(import.meta.dirname, "..", "..");
const PUBLIC = join(REPO, "public");
const HEADERS = join(PUBLIC, "_headers");

interface Rule {
  pattern: string;
  headers: [name: string, value: string][];
}

/** Cloudflare Pages `_headers`: patterns at column 0, indented headers. */
function parseHeaders(text: string): Rule[] {
  const rules: Rule[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === "" || raw.trim().startsWith("#")) continue;
    if (!/^\s/.test(raw)) {
      rules.push({ pattern: raw.trim(), headers: [] });
      continue;
    }
    const current = rules.at(-1);
    if (current === undefined) {
      throw new Error(`header line before any path: ${JSON.stringify(raw)}`);
    }
    const colon = raw.indexOf(":");
    if (colon < 0) throw new Error(`not a header line: ${JSON.stringify(raw)}`);
    current.headers.push([
      raw.slice(0, colon).trim(),
      raw.slice(colon + 1).trim(),
    ]);
  }
  return rules;
}

/** Does a Pages pattern (`*` splat, `:name` placeholder) match a path? */
function matches(pattern: string, path: string): boolean {
  const re = pattern
    .split(/(\*|:[A-Za-z]\w*)/)
    .map((part) =>
      part === "*"
        ? ".*"
        : part.startsWith(":")
          ? "[^/]+"
          : part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("");
  return new RegExp(`^${re}$`).test(path);
}

/** Every Cache-Control value Pages would send for `path`, in file order. */
function cacheControlFor(rules: Rule[], path: string): string[] {
  return rules
    .filter((r) => matches(r.pattern, path))
    .flatMap((r) => r.headers)
    .filter(([name]) => name.toLowerCase() === "cache-control")
    .map(([, value]) => value);
}

function readHeaders(): string {
  if (!existsSync(HEADERS)) throw new Error("public/_headers does not exist");
  return readFileSync(HEADERS, "utf8");
}

describe("the _headers parser (instrument controls)", () => {
  test("parses a path line and its indented header, CRLF or LF", () => {
    expect(parseHeaders("/a\r\n  X-Y: z\r\n/b\n  P: q\n")).toEqual([
      { pattern: "/a", headers: [["X-Y", "z"]] },
      { pattern: "/b", headers: [["P", "q"]] },
    ]);
  });

  test("a splat rule's Cache-Control is counted for a path it covers", () => {
    const rules = parseHeaders(
      "/sw.js\n  Cache-Control: no-cache\n/*\n  Cache-Control: max-age=31536000\n",
    );
    expect(cacheControlFor(rules, "/sw.js")).toEqual([
      "no-cache",
      "max-age=31536000",
    ]);
    expect(cacheControlFor(rules, "/assets/x.js")).toEqual([
      "max-age=31536000",
    ]);
  });

  test("a rule for another path is not counted", () => {
    const rules = parseHeaders("/sw.jsx\n  Cache-Control: max-age=60\n");
    expect(cacheControlFor(rules, "/sw.js")).toEqual([]);
  });
});

describe("public/_headers (AC-3)", () => {
  test("every rule is a path at column 0 followed by indented Name: value lines", () => {
    const rules = parseHeaders(readHeaders());
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(r.pattern, "a pattern starts with /").toMatch(/^\//);
      expect(r.headers.length, `${r.pattern} has no headers`).toBeGreaterThan(
        0,
      );
    }
  });

  test.each(["/sw.js", "/manifest.webmanifest"])(
    "%s is served with Cache-Control: no-cache and no other Cache-Control",
    (path) => {
      expect(cacheControlFor(parseHeaders(readHeaders()), path)).toEqual([
        "no-cache",
      ]);
    },
  );
});

describe("public/ leaves client routes to Pages' single-page-app default (AC-3)", () => {
  // Control: the listing is the real public/ (it holds the icons), so the
  // absences below are not read off an empty or wrong directory.
  const entries = readdirSync(PUBLIC);

  test("the listing is the real public/ directory", () => {
    expect(entries).toContain("icons");
  });

  test("public/ has no top-level 404.html, which would switch off the SPA fallback", () => {
    expect(entries.map((e) => e.toLowerCase())).not.toContain("404.html");
  });

  test("public/ has no _redirects, whose /* -> /index.html rewrite Pages treats as a loop", () => {
    expect(entries).not.toContain("_redirects");
  });
});
