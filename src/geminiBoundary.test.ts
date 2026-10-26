import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import { PROBE_GEMINI_HOST } from "./__probe_gemini";

// CAL-018 AC-7 (as amended 2026-10-26), Contract Block 5. The Gemini key is a
// server-side secret: no source file the browser could ship may name Google's
// API host or the key's environment variable.
//
// Three steps, each asked of the tool that owns the answer:
//   1. enumerate every file under src/ and shared/ that git tracks or would
//      track (`git ls-files --cached --others --exclude-standard`);
//   2. scan them all with offendingFiles(), which is cheap;
//   3. ask `classify.sh --only source` about the hits only, in ONE call, and
//      fail if it returns any. "Source" is the harness's answer, not a private
//      regex (rules.md: a guard asks classify.sh, it does not reimplement it).
//
// ORACLE-FREE, so it carries controls on both sides of the classifier: the
// committed probe src/__probe_gemini.ts must be REPORTED by the scanner and
// DROPPED by the classifier, and a real source module must be KEPT by the
// classifier, so step 3 is shown not to be a filter that drops everything.
// It passes on arrival and is earned by mutating a real source line through
// scripts/mutate.sh (story, Deferred verification 3).
//
// The needles are assembled from fragments so that this file does not contain
// either string itself. Otherwise it would be a permanent hit, rescued only by
// the classifier, and the scanner's output would always carry noise.

const REPO = join(import.meta.dirname, "..");
const HOST = ["generativelanguage", "googleapis", "com"].join(".");
const KEY_VAR = ["GEMINI", "API", "KEY"].join("_");
const NEEDLES = [HOST, KEY_VAR];
const PROBE = "src/__probe_gemini.ts";
const REAL_SOURCE = "src/lib/supabase.ts";

const run = promisify(execFile);

/** Every path whose contents name the Gemini host or the key's variable. */
function offendingFiles(paths: string[]): string[] {
  return paths.filter((p) => {
    const text = readFileSync(join(REPO, p), "utf8");
    return NEEDLES.some((needle) => text.includes(needle));
  });
}

function lines(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
}

/** Every file under src/ and shared/ that git tracks or would track. */
async function enumerate(): Promise<string[]> {
  const { stdout } = await run(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "src",
      "shared",
    ],
    { cwd: REPO, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  return lines(stdout);
}

/**
 * The subset of `paths` that classify.sh calls source, in one subprocess.
 * With no paths classify.sh reads its list from stdin, which execFile leaves
 * open, so an empty list is answered here and never reaches it.
 */
async function sourceOnly(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const { stdout } = await run(
    "bash",
    ["scripts/classify.sh", "--only", "source", ...paths],
    { cwd: REPO, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  return lines(stdout);
}

// Enumerate and scan at collection time (top-level await): one `git ls-files`
// and a read of each file, well under a second here. Doing it now means the
// classify budget below can scale with the number of hits it has to classify.
const candidates = await enumerate();
const hits = offendingFiles(candidates);

// Budget. Measured LOCALLY on the Windows/Git Bash dev host at CAL-018 RED
// (2026-10-26): one classify.sh call over 1-2 paths took 0.7-2.6 s from a
// shell and 0.3-5.2 s inside Vitest across four runs (it costs a few
// subprocesses per path, and Windows fork time varies). Not yet measured on
// CI, where fork is cheaper. The base is about 6x the worst measurement, so a
// test stays under a quarter of its timeout; it scales with the paths a call
// classifies and is floored at the measured size (2 paths), so fewer hits
// never shrink it. No hooks in this file, so no hook budget is needed.
const CLASSIFY_BASE_MS = 30_000;
const classifyBudget = (paths: number) =>
  CLASSIFY_BASE_MS * Math.max(1, paths / 2);

describe("the Gemini boundary (AC-7)", () => {
  test("the enumerator returns the tree under src/ and shared/, not nothing (at least 150; 173 at CAL-018)", () => {
    expect(candidates.length).toBeGreaterThanOrEqual(150);
    expect(candidates).toContain(REAL_SOURCE);
    expect(candidates).toContain("shared/version.ts");
    expect(candidates).toContain(PROBE);
  });

  test(
    "no file under src/ or shared/ that classify.sh calls source names the Gemini host or the key's variable",
    async () => {
      expect(await sourceOnly(hits)).toEqual([]);
    },
    classifyBudget(hits.length),
  );

  test("this guard does not itself contain either needle, so it is not a hit of its own scan", () => {
    expect(hits).not.toContain("src/geminiBoundary.test.ts");
  });

  test("control: the committed probe naming the host is reported by the scanner", () => {
    expect(PROBE_GEMINI_HOST).toBe(HOST);
    expect(offendingFiles([PROBE])).toEqual([PROBE]);
    expect(hits).toContain(PROBE);
  });

  test(
    "control: the probe is a test artifact, so the classifier drops it",
    async () => {
      expect(await sourceOnly([PROBE])).toEqual([]);
    },
    classifyBudget(1),
  );

  test(
    "control: the classifier keeps a real source module, so it is not a filter that drops everything",
    async () => {
      expect(await sourceOnly([REAL_SOURCE])).toEqual([REAL_SOURCE]);
      expect(await sourceOnly([PROBE, REAL_SOURCE])).toEqual([REAL_SOURCE]);
    },
    classifyBudget(1) + classifyBudget(2),
  );

  test("control: a real source module that names neither is not reported by the scanner", () => {
    expect(offendingFiles([REAL_SOURCE])).toEqual([]);
  });

  test("control: an empty hit list is answered without calling the classifier", async () => {
    expect(await sourceOnly([])).toEqual([]);
  });
});
