import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, test } from "vitest";

// CAL-030 AC-5, Contract Block 4. No secret VALUE appears in the repository:
// in every tracked text file, none of the six secret names is assigned a
// literal. A reference (`${{ secrets.X }}`, `"$X"`, `env(X)`, an identifier)
// and a `<placeholder>` are allowed; so is an empty value.
//
// ORACLE-FREE, so the rule carries controls on both sides:
//   * fixtures fed to the pure matcher, positive and negative, per pattern;
//   * the REAL reference lines of the tree (every line of handler_test.ts
//     and handler.ts that names the key, found by content since CAL-047, and
//     the names in docs/wiki) must NOT be reported;
//   * the probe on a real line (story, Deferred verification 2): through
//     scripts/mutate.sh, handler_test.ts line 96 turned into a quoted literal
//     must turn the whole-tree case red, naming that file and line.
//
// The six names are assembled from fragments, and every fixture is built by
// concatenation, so this file never contains an assignment of its own (it is
// a tracked text file and is scanned like any other) and does not add itself
// to the CAL-018 Gemini-boundary guard's hit list.

const REPO = join(import.meta.dirname, "..", "..");
const n = (...parts: string[]) => parts.join("_");

const CF_TOKEN = n("CLOUDFLARE", "API", "TOKEN");
const CF_ACCOUNT = n("CLOUDFLARE", "ACCOUNT", "ID");
const SB_TOKEN = n("SUPABASE", "ACCESS", "TOKEN");
const SB_PASSWORD = n("SUPABASE", "DB", "PASSWORD");
const GEMINI = n("GEMINI", "API", "KEY");
const VAPID = n("VAPID", "PRIVATE", "KEY");

/** The six secret names of AC-5 (settled: the owner's setup, verified). */
const SECRET_NAMES = [
  CF_TOKEN,
  CF_ACCOUNT,
  SB_TOKEN,
  SB_PASSWORD,
  GEMINI,
  VAPID,
] as const;

interface Finding {
  /** 1-based line number. */
  line: number;
  name: string;
}

const NAME_RE = new RegExp(
  `(?<![A-Za-z0-9_])(${SECRET_NAMES.join("|")})(?![A-Za-z0-9_])`,
  "g",
);

/**
 * What follows a name when it is being assigned: an optional closing quote
 * (a JSON or dict key, `"NAME": …`), then `:`, `=` or `:=`. Never `==`,
 * `===` or `=>`, which compare or map rather than assign.
 */
const SEPARATOR_RE = /^(["']?)(\s*)(:=|=(?![=>])|:(?![:=]))\s*/;

function isReference(value: string): boolean {
  return value.startsWith("$") || /^env\(.*\)$/.test(value);
}

function isPlaceholder(value: string): boolean {
  return /^<[^<>]+>$/.test(value);
}

/**
 * PO decision 10, 2026-10-29 (Contract Block 4): the Deferred-verification
 * probe's fake value is exempt in story files ONLY, because a story must
 * quote the line its probe makes (mutate.sh prints the mutated line). The
 * exemption is this one value, never the folder: any other literal in a
 * story is a finding, and this value anywhere else is a finding - which is
 * what keeps the probe on handler_test.ts able to fire.
 */
const PROBE_FAKE = "AIzaSyFAKE0000";

function isStoryFile(path: string): boolean {
  return /^docs\/backlog\/stories\/[^/]+\.md$/.test(path);
}

function isYaml(path: string): boolean {
  const ext = extname(path).toLowerCase();
  return ext === ".yml" || ext === ".yaml";
}

/**
 * Every assignment of a literal to one of the six names in `text`.
 *
 * - quoted (`"…"`, `'…'`, `` `…` ``) after `:` or `=`: a literal unless empty,
 *   a reference or a placeholder - in any file;
 * - unquoted after `=` with no space before it (`NAME=value`: dotenv, shell,
 *   a CLI argument): a literal unless a reference or a placeholder;
 * - unquoted after `:` in a YAML file: a YAML scalar is a literal, so the
 *   same. Outside YAML, an unquoted right-hand side is an identifier
 *   (`NAME: GEMINI_KEY` in TypeScript) and so a reference;
 * - unquoted after ` = ` with spaces is an identifier in every language this
 *   repository uses (`const NAME = value`), so a reference.
 */
function findLiteralAssignments(path: string, text: string): Finding[] {
  const findings: Finding[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const m of line.matchAll(NAME_RE)) {
      const name = m[1] ?? "";
      const after = line.slice((m.index ?? 0) + name.length);
      const sep = SEPARATOR_RE.exec(after);
      if (sep === null) continue;
      const spaceBefore = (sep[2] ?? "") !== "";
      const op = sep[3] ?? "";
      const rest = after.slice(sep[0].length);
      const q = rest[0];
      let literal: string;
      if (q === '"' || q === "'" || q === "`") {
        const close = rest.indexOf(q, 1);
        literal = close < 0 ? rest.slice(1) : rest.slice(1, close);
      } else {
        // Unquoted, the value ends at whitespace, punctuation or a quote
        // (a placeholder inside Markdown inline code ends at the backtick).
        literal = /^(env\([^)]*\)|[^\s,;)}\]"'`]*)/.exec(rest)?.[0] ?? "";
        const assignsUnquoted =
          op === ":" ? isYaml(path) : op !== ":" && !spaceBefore;
        if (!assignsUnquoted) continue;
      }
      if (literal === "" || isReference(literal) || isPlaceholder(literal)) {
        continue;
      }
      if (literal === PROBE_FAKE && isStoryFile(path)) continue;
      findings.push({ line: i + 1, name });
    }
  }
  return findings;
}

/** Every file git tracks or would track - never a directory walk. */
function trackedFiles(): string[] {
  const out = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return [
    ...new Set(
      out
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l !== ""),
    ),
  ];
}

/** Git's own heuristic: a NUL in the first 8000 bytes means binary. */
function readText(path: string): string | null {
  const abs = join(REPO, path);
  if (!existsSync(abs)) return null; // tracked but deleted in the worktree
  const buf = readFileSync(abs);
  if (buf.subarray(0, 8000).includes(0)) return null;
  return buf.toString("utf8");
}

/** `path:line NAME` for every finding in the tree. Never echoes a value. */
function scanTree(paths: string[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    const text = readText(p);
    if (text === null) continue;
    for (const f of findLiteralAssignments(p, text)) {
      out.push(`${p}:${f.line} ${f.name}`);
    }
  }
  return out;
}

const FILES = trackedFiles();
const HANDLER_TEST = "supabase/functions/capture/handler_test.ts";
const HANDLER = "supabase/functions/capture/handler.ts";

/**
 * Every line of `path` that names `name`, with its 1-based number. Found by
 * content, not by a pinned line number: CAL-047 moved handler_test.ts and
 * handler.ts lines, and a number-pinned control then points at the wrong
 * line and fails its non-vacuity check for a reason that is not a secret.
 */
function linesNaming(path: string, name: string): [number, string][] {
  return (readText(path) ?? "")
    .split(/\r?\n/)
    .map((text, i): [number, string] => [i + 1, text])
    .filter(([, text]) => text.includes(name));
}

describe("the matcher: literals it must report (AC-5)", () => {
  const cases: [string, string, string][] = [
    [
      "a double-quoted literal after a colon",
      "x.ts",
      `  ${GEMINI}: "AIzaSyFAKE0000",`,
    ],
    [
      "a single-quoted literal after a spaced equals",
      "x.py",
      `${SB_PASSWORD} = 'hunter2'`,
    ],
    ["a backtick literal after a colon", "x.ts", `${CF_TOKEN}: \`abc123\``],
    ["dotenv NAME=value", ".env.example", `${SB_TOKEN}=sbp_0123456789abcdef`],
    ["a shell export", "x.sh", `export ${CF_ACCOUNT}=0123456789abcdef`],
    ["a CLI argument", "x.md", `supabase secrets set ${GEMINI}=AIzaSyFAKE`],
    [
      "a quoted JSON key with a literal value",
      "x.json",
      `{ "${VAPID}": "abc" }`,
    ],
    ["an unquoted YAML scalar", "x.yml", `      ${SB_PASSWORD}: hunter2`],
    ["an unquoted YAML scalar in .yaml", "x.yaml", `${SB_TOKEN}: sbp_abc`],
    ["a quoted YAML scalar", "x.yml", `${CF_TOKEN}: "abc"`],
    ["a Go-style := literal", "x.go", `${GEMINI} := "abc"`],
    ["a quoted literal with no closing quote", "x.ts", `${GEMINI}: "abc`],
  ];
  test.each(cases)("reports %s", (_title, path, line) => {
    expect(findLiteralAssignments(path, line)).toEqual([
      { line: 1, name: expect.any(String) },
    ]);
  });

  test("reports the second of two names on one line when only it is a literal", () => {
    const line = `{ ${SB_TOKEN}: tokenVar, ${SB_PASSWORD}: "hunter2" }`;
    expect(findLiteralAssignments("x.ts", line)).toEqual([
      { line: 1, name: SB_PASSWORD },
    ]);
  });

  test("reports the 1-based line number of the literal, not the file's first line", () => {
    const text = ["// header", "", `${GEMINI}: "AIzaSy"`, ""].join("\r\n");
    expect(findLiteralAssignments("x.ts", text)).toEqual([
      { line: 3, name: GEMINI },
    ]);
  });
});

describe("the matcher: the probe's fake value is exempt in story files only (PO decision 10)", () => {
  const probeLine = `  ${GEMINI}: "${PROBE_FAKE}",`;

  test("the probe line is not reported in a story file", () => {
    expect(
      findLiteralAssignments("docs/backlog/stories/X.md", probeLine),
    ).toEqual([]);
  });

  test.each(["docs/wiki/x.md", "src/x.ts"])(
    "the same probe line is reported under %s",
    (path) => {
      expect(findLiteralAssignments(path, probeLine)).toEqual([
        { line: 1, name: GEMINI },
      ]);
    },
  );

  test("a different literal in a story file is reported: the exemption is the value, not the folder", () => {
    const line = `  ${GEMINI}: "AIzaSyREAL1234",`;
    expect(findLiteralAssignments("docs/backlog/stories/X.md", line)).toEqual([
      { line: 1, name: GEMINI },
    ]);
  });
});

describe("the matcher: references and placeholders it must not report (AC-5)", () => {
  const cases: [string, string, string][] = [
    [
      "a GitHub secrets expression",
      "x.yml",
      `${SB_TOKEN}: ` + "${{ secrets." + SB_TOKEN + " }}",
    ],
    [
      "a quoted GitHub expression",
      "x.yml",
      `${SB_PASSWORD}: "` + "${{ secrets." + SB_PASSWORD + ' }}"',
    ],
    [
      "a quoted shell expansion",
      "x.sh",
      `${SB_PASSWORD}="$` + SB_PASSWORD + '"',
    ],
    ["an unquoted shell expansion", "x.sh", `${CF_TOKEN}=$` + "{CF}"],
    [
      "an env() read in a TOML string",
      "config.toml",
      `${GEMINI} = "env(${GEMINI})"`,
    ],
    ["an unquoted env() read in YAML", "x.yml", `${GEMINI}: env(${GEMINI})`],
    [
      "an angle-bracket placeholder",
      "x.md",
      `supabase secrets set ${GEMINI}=<your-gemini-key>`,
    ],
    [
      "a placeholder inside Markdown inline code",
      "x.md",
      `\`supabase secrets set ${GEMINI}=<your-gemini-key>\``,
    ],
    ["a quoted placeholder", "x.ts", `${VAPID}: "<vapid-private-key>"`],
    ["an empty quoted value", ".env.example", `${SB_TOKEN}=""`],
    ["an empty unquoted value", ".env.example", `${SB_TOKEN}=`],
    ["a YAML key with its value on the next line", "x.yml", `${CF_TOKEN}:`],
    ["an identifier in TypeScript", "x.ts", `    ${GEMINI}: GEMINI_KEY,`],
    ["an identifier after a spaced equals", "x.ts", `const ${GEMINI} = key;`],
    ["an environment read", "x.ts", `apiKey: deps.env("${GEMINI}") ?? "",`],
    ["a comparison", "x.ts", `if (${GEMINI} === "x") {}`],
    ["an arrow", "x.ts", `${GEMINI} => "x"`],
    ["a backticked name in prose", "x.md", `the \`${GEMINI}\` function secret`],
    ["a longer name containing a secret name", "x.ts", `MY_${GEMINI}: "abc"`],
    ["a secret name with a suffix", "x.ts", `${GEMINI}_HINT: "abc"`],
    [
      "an unquoted colon in Markdown prose",
      "x.md",
      `\`${GEMINI}: GEMINI_KEY\``,
    ],
  ];
  test.each(cases)("does not report %s", (_title, path, line) => {
    expect(findLiteralAssignments(path, line)).toEqual([]);
  });

  test("the YAML rule is file-type scoped: the same identifier line is a literal in .yml", () => {
    const line = `    ${GEMINI}: GEMINI_KEY`;
    expect(findLiteralAssignments("x.ts", line)).toEqual([]);
    expect(findLiteralAssignments("x.yml", line)).toEqual([
      { line: 1, name: GEMINI },
    ]);
  });
});

describe("the real tree's reference lines are not reported (AC-5)", () => {
  // Each file and the fewest lines in it that must name the key. The CAL-030
  // lines were handler_test.ts 96 and 361 and handler.ts 246: two env
  // tables in the test and one deps.env read in the handler.
  const real: [string, number][] = [
    [HANDLER_TEST, 2],
    [HANDLER, 1],
  ];
  test.each(real)(
    "%s names the key on at least %i lines, and none of them is reported",
    (path, atLeast) => {
      const lines = linesNaming(path, GEMINI);
      // Non-vacuity: the control is pointed at lines that name the key.
      expect(lines.length).toBeGreaterThanOrEqual(atLeast);
      const reported = lines.flatMap(([n, text]) =>
        findLiteralAssignments(path, text).map((f) => `${path}:${n} ${f.name}`),
      );
      expect(reported).toEqual([]);
    },
  );

  test("the wiki pages that name the secrets are scanned and not reported", () => {
    const wiki = FILES.filter((p) => /^docs\/wiki\/[^/]+\.md$/.test(p));
    const naming = wiki.filter((p) =>
      SECRET_NAMES.some((name) => (readText(p) ?? "").includes(name)),
    );
    expect(naming).toEqual(
      expect.arrayContaining([
        "docs/wiki/stack.md",
        "docs/wiki/architecture.md",
      ]),
    );
    expect(scanTree(wiki)).toEqual([]);
  });
});

describe("no secret value appears in the repository (AC-5)", () => {
  test("the scan enumerates the tracked tree through git, not nothing (515 files at CAL-030 RED)", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(400);
    expect(FILES).toContain(HANDLER_TEST);
    expect(FILES).toContain("src/deploy/noSecrets.test.ts");
    expect(FILES).not.toContain("node_modules/yaml/package.json");
  });

  test("no tracked text file assigns a literal to any of the six secret names", () => {
    expect(scanTree(FILES)).toEqual([]);
  });
});
