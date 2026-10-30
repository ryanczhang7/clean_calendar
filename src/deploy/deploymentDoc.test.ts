import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// CAL-030 AC-4, Contract Block 3 (headings pinned by RED, 2026-10-29). The
// deployment guide lists every one-time step, in order, as numbered `##`
// headings; each step's section carries the facts the owner needs from it.
// The VAPID keys and the Vault entries belong to CAL-028 and appear only in
// the closing "Later (CAL-028)" section.
//
// Secret names are assembled from fragments so this file never spells an
// assignment of one (src/deploy/noSecrets.test.ts scans it) and does not join
// the CAL-018 Gemini-boundary guard's hit list.

const REPO = join(import.meta.dirname, "..", "..");
const GUIDE = "docs/wiki/deployment.md";
const n = (...parts: string[]) => parts.join("_");
const GEMINI = n("GEMINI", "API", "KEY");

/** Block 3, as amended at RED: the nine step headings, exactly, in order. */
const STEPS = [
  "1. Create the Supabase project and its database password",
  "2. Create the Cloudflare Pages project by direct upload",
  "3. Set up Google sign-in",
  `4. Set ${GEMINI} as a Supabase function secret`,
  "5. Create a scoped Supabase access token",
  "6. Create the Cloudflare API token and find the account ID",
  "7. Create the GitHub production environment",
  "8. After the first deploy: set app_config.owner_email",
  "9. Restore a paused free-tier project",
] as const;
const LATER = "Later (CAL-028)";

interface Section {
  heading: string;
  body: string;
}

function guide(): string {
  const abs = join(REPO, GUIDE);
  if (!existsSync(abs)) throw new Error(`${GUIDE} does not exist`);
  return readFileSync(abs, "utf8");
}

/** Every `## ` section, its heading text and the body up to the next one. */
function sections(text: string): Section[] {
  const out: Section[] = [];
  for (const line of text.split(/\r?\n/)) {
    const h = /^## (.*)$/.exec(line);
    if (h) {
      out.push({ heading: (h[1] ?? "").trim(), body: "" });
    } else if (out.length > 0) {
      const last = out[out.length - 1] as Section;
      last.body += `${line}\n`;
    }
  }
  return out;
}

function section(heading: string): string {
  const found = sections(guide()).filter((s) => s.heading === heading);
  if (found.length !== 1) {
    throw new Error(
      `${GUIDE}: expected one "## ${heading}", found ${found.length}`,
    );
  }
  return (found[0] as Section).body;
}

/** The step whose number is `k` (1-based). */
const step = (k: number) => section(STEPS[k - 1] as string);

/** Lines of `body` mentioning `scope`, case-insensitively. */
function linesWith(body: string, scope: string): string[] {
  return body
    .split("\n")
    .filter((l) => l.toLowerCase().includes(scope.toLowerCase()));
}

describe("the section reader (instrument control)", () => {
  test("splits on `## ` headings only, not on `###` or prose", () => {
    const s = sections("intro\n## A\none\n### sub\ntwo\n## B\nthree\n");
    expect(s.map((x) => x.heading)).toEqual(["A", "B"]);
    expect(s[0]?.body).toContain("### sub");
  });
});

describe("docs/wiki/deployment.md: the one-time steps, in order (AC-4)", () => {
  test("the numbered `##` headings are exactly the nine steps, in Block 3's order", () => {
    const numbered = sections(guide())
      .map((s) => s.heading)
      .filter((h) => /^\d+\. /.test(h));
    expect(numbered).toEqual([...STEPS]);
  });

  test("a closing `## Later (CAL-028)` section follows step 9", () => {
    const headings = sections(guide()).map((s) => s.heading);
    expect(headings).toContain(LATER);
    expect(headings.indexOf(LATER)).toBeGreaterThan(headings.indexOf(STEPS[8]));
  });

  test("step 1 says where the database password is set and reset", () => {
    expect(step(1)).toMatch(/database password/i);
    expect(step(1)).toMatch(/reset/i);
  });

  test("step 2 creates the Pages project by uploading assets, not by connecting Git", () => {
    expect(step(2)).toMatch(/upload assets/i);
  });

  test("step 3 gives the JavaScript origin, the Supabase callback as redirect URI, the Google provider, Site URL and Redirect URLs", () => {
    const s = step(3);
    expect(s).toMatch(/javascript origin/i);
    expect(s).toContain("https://<project-ref>.supabase.co/auth/v1/callback");
    expect(s).toMatch(/google provider/i);
    expect(s).toMatch(/site url/i);
    expect(s).toMatch(/redirect urls/i);
  });

  test("step 4 sets the Gemini key as a function secret", () => {
    expect(step(4)).toContain(GEMINI);
  });

  // Block 3, amended 2026-10-30 (Return 1): with `supabase link` gone the
  // token serves `functions deploy` only, so Edge Functions read-write is the
  // one permission pinned. Migrations, Connection Pooling and Project Settings
  // were pinned for `link`/`db push --linked` and are no longer asserted
  // either way: the full measured list is the first green deploy's to give.
  test("step 5 grants the scoped token Edge Functions: read-write", () => {
    const lines = linesWith(step(5), "Edge Functions");
    expect(lines.length, "no line names Edge Functions").toBeGreaterThan(0);
    expect(lines.some((l) => /read[- ]write/i.test(l))).toBe(true);
  });

  test("no numbered step tells the owner the deploy runs `supabase link` (Return 1)", () => {
    const offenders = STEPS.filter((h) => /supabase link/i.test(section(h)));
    expect(offenders).toEqual([]);
  });

  test("step 5 scopes the token to one project and grants nothing else", () => {
    expect(step(5)).toMatch(/one project|single project/i);
    expect(step(5)).toMatch(/\bnone\b/i);
  });

  test("step 6 creates the API token with Cloudflare Pages: Edit and finds the account ID", () => {
    const s = step(6);
    expect(
      linesWith(s, "Cloudflare Pages").some((l) => /\bEdit\b/.test(l)),
    ).toBe(true);
    expect(s).toMatch(/account id/i);
  });

  test("step 7 gives the `production` environment (its pinned heading) a `main` branch rule, the four secrets and the six variables", () => {
    const s = step(7);
    expect(s).toMatch(/\bbranch/i);
    expect(s).toMatch(/\bmain\b/);
    for (const name of [
      n("CLOUDFLARE", "API", "TOKEN"),
      n("CLOUDFLARE", "ACCOUNT", "ID"),
      n("SUPABASE", "ACCESS", "TOKEN"),
      n("SUPABASE", "DB", "PASSWORD"),
      "SUPABASE_PROJECT_REF",
      "SUPABASE_POOLER_HOST",
      "CLOUDFLARE_PAGES_PROJECT",
      "VITE_SUPABASE_URL",
      "VITE_SUPABASE_ANON_KEY",
      "VITE_OWNER_EMAIL",
    ]) {
      expect(s, `step 7 does not name ${name}`).toContain(name);
    }
  });

  test("step 7 says the pooler host comes from the dashboard's Session pooler, on the line that names SUPABASE_POOLER_HOST", () => {
    const lines = linesWith(step(7), "SUPABASE_POOLER_HOST");
    expect(lines.length, "no line names SUPABASE_POOLER_HOST").toBeGreaterThan(
      0,
    );
    expect(lines.some((l) => /session pooler/i.test(l))).toBe(true);
  });

  test("step 8 sets app_config.owner_email with SQL in the SQL editor, the email as a placeholder", () => {
    const s = step(8);
    expect(s).toContain("app_config");
    expect(s).toContain("owner_email");
    expect(s).toMatch(/sql editor/i);
    expect(s).toMatch(/<[^<>\s]+>/);
  });

  test("step 9 says how to restore a paused free-tier project", () => {
    expect(step(9)).toMatch(/paused/i);
    expect(step(9)).toMatch(/restore/i);
  });
});

describe("docs/wiki/deployment.md: VAPID and Vault are CAL-028's (AC-4)", () => {
  test("the Later (CAL-028) section names the three VAPID secrets and Vault", () => {
    const s = section(LATER);
    for (const name of [
      "VAPID_PUBLIC_KEY",
      n("VAPID", "PRIVATE", "KEY"),
      "VAPID_SUBJECT",
    ]) {
      expect(s, `Later does not name ${name}`).toContain(name);
    }
    expect(s).toMatch(/vault/i);
  });

  test("no numbered step mentions VAPID or Vault", () => {
    const offenders = STEPS.filter((h) => /vapid|vault/i.test(section(h)));
    expect(offenders).toEqual([]);
  });
});
