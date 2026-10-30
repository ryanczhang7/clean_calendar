import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { parse } from "yaml";

// CAL-030 AC-1 and AC-2, Contract Block 1. The deploy workflow is asserted as
// PARSED structure (the `yaml` package, YAML 1.2 - under which `on:` is the
// string key "on", not the boolean true; measured at RED), never as text.
//
// Each step is recognised by WHAT IT DOES - a `uses:` prefix or its `run:`
// command - never by its `name:`, which stays GREEN's choice.
//
// The step-order case is deliberately its own test and the trigger and
// environment cases never look at the steps: Deferred verification 1 deletes
// the Gates step and requires exactly the order case (and the cases about the
// Gates step itself) to go red while the trigger and environment cases stay
// green.

const REPO = join(import.meta.dirname, "..", "..");
const WORKFLOW = ".github/workflows/deploy.yml";
const GATES_WORKFLOW = ".github/workflows/gates.yml";

type Json = Record<string, unknown>;

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
  if?: unknown;
  "continue-on-error"?: unknown;
  [key: string]: unknown;
}

function load(path: string): Json {
  const abs = join(REPO, path);
  if (!existsSync(abs)) throw new Error(`${path} does not exist`);
  return parse(readFileSync(abs, "utf8")) as Json;
}

const workflow = (): Json => load(WORKFLOW);

function jobs(): Record<string, Json> {
  return (workflow().jobs ?? {}) as Record<string, Json>;
}

function deployJob(): Json {
  const job = jobs().deploy;
  if (job === undefined) throw new Error(`${WORKFLOW} has no job "deploy"`);
  return job;
}

function steps(): Step[] {
  return (deployJob().steps ?? []) as Step[];
}

/** A run script as one line: continuations joined, whitespace collapsed. */
function oneLine(run: string): string {
  return run
    .replace(/\\\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** `${{ vars.X }}` with any inner spacing, as `${{vars.X}}`. */
function compactExpr(s: string): string {
  return s.replace(
    /\$\{\{\s*([^}]*?)\s*\}\}/g,
    (_m, inner) => `\${{${inner}}}`,
  );
}

/** Shell-ish words: whitespace split, surrounding quotes removed, braces off. */
function words(run: string): string[] {
  return compactExpr(oneLine(run))
    .split(" ")
    .map((w) => w.replace(/^(["'])(.*)\1$/, "$2"))
    .map((w) => w.replace(/^\$\{([A-Z_][A-Z0-9_]*)\}$/, "$$$1"));
}

/**
 * The arguments after `pnpm exec supabase <sub...>`, as a sorted multiset of
 * `--flag` or `--flag=value` entries (both spellings of a valued flag become
 * `--flag=value`; a bare word that is not a flag's value stays itself).
 */
function supabaseArgs(run: string, sub: string[]): string[] | null {
  const w = words(run);
  const head = ["pnpm", "exec", "supabase", ...sub];
  if (w.length < head.length || head.some((h, i) => w[i] !== h)) return null;
  const rest = w.slice(head.length);
  const out: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] ?? "";
    const next = rest[i + 1];
    if (
      a.startsWith("--") &&
      !a.includes("=") &&
      next !== undefined &&
      !next.startsWith("--") &&
      VALUED_FLAGS.has(a)
    ) {
      out.push(`${a}=${next}`);
      i++;
    } else {
      out.push(a);
    }
  }
  return out.sort();
}

/** Supabase CLI 2.120.0 flags that take a value (`--help`, Block 1). */
const VALUED_FLAGS = new Set(["--project-ref", "--password", "--db-url"]);

/**
 * Block 1, amended 2026-10-30 (Return 1): the session pooler, port 5432, user
 * `postgres.<ref>`, and NO password in the URL - it arrives as PGPASSWORD.
 */
const DB_URL =
  "postgresql://postgres.$SUPABASE_PROJECT_REF@$SUPABASE_POOLER_HOST:5432/postgres";

type Role =
  | "checkout"
  | "setup-pnpm"
  | "setup-node"
  | "setup-deno"
  | "install"
  | "gates"
  | "build"
  | "supabase-link"
  | "supabase-db-push"
  | "supabase-functions-deploy"
  | "pages-deploy";

/** What a step does, from `uses` or `run` only. Unknown steps say so. */
function roleOf(step: Step): Role | string {
  const uses = step.uses ?? "";
  if (uses.startsWith("actions/checkout@")) return "checkout";
  if (uses.startsWith("pnpm/action-setup@")) return "setup-pnpm";
  if (uses.startsWith("actions/setup-node@")) return "setup-node";
  if (uses.startsWith("denoland/setup-deno@")) return "setup-deno";
  if (uses.startsWith("cloudflare/wrangler-action@")) return "pages-deploy";
  const run = oneLine(step.run ?? "");
  if (run.includes("pnpm install")) return "install";
  if (run.includes("scripts/gates.sh")) return "gates";
  if (run.includes("pnpm build")) return "build";
  if (run.includes("supabase link")) return "supabase-link";
  if (run.includes("supabase db push")) return "supabase-db-push";
  if (run.includes("supabase functions deploy"))
    return "supabase-functions-deploy";
  return `unrecognised step: ${JSON.stringify(step.name ?? uses ?? run)}`;
}

function stepFor(role: Role): Step {
  const found = steps().filter((s) => roleOf(s) === role);
  if (found.length !== 1) {
    throw new Error(`expected exactly one ${role} step, found ${found.length}`);
  }
  return found[0] as Step;
}

const CONTRACT_ORDER: Role[] = [
  "checkout",
  "setup-pnpm",
  "setup-node",
  "setup-deno",
  "install",
  "gates",
  "build",
  "supabase-db-push",
  "supabase-functions-deploy",
  "pages-deploy",
];

// The settled names (the owner's setup, verified 2026-10-29 by `gh`).
const SECRETS = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
];
const VARS = [
  "SUPABASE_PROJECT_REF",
  "SUPABASE_POOLER_HOST",
  "CLOUDFLARE_PAGES_PROJECT",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_OWNER_EMAIL",
];

/** Every `secrets.X` / `vars.X` inside a `${{ }}` anywhere in `value`. */
function contextRefs(value: unknown): string[] {
  const text = JSON.stringify(value ?? null);
  const refs: string[] = [];
  for (const expr of text.matchAll(/\$\{\{([^}]*)\}\}/g)) {
    for (const r of (expr[1] ?? "").matchAll(
      /\b(secrets|vars)\.([A-Za-z_][A-Za-z0-9_]*)/g,
    )) {
      refs.push(`${r[1]}.${r[2]}`);
    }
  }
  return refs;
}

/** Which `secrets.*` / `vars.*` each kind of step may see, and no other. */
const ALLOWED_REFS: Record<Role, string[]> = {
  checkout: [],
  "setup-pnpm": [],
  "setup-node": [],
  "setup-deno": [],
  install: [],
  gates: [],
  build: [
    "vars.VITE_SUPABASE_URL",
    "vars.VITE_SUPABASE_ANON_KEY",
    "vars.VITE_OWNER_EMAIL",
  ],
  // Recognised only so a `supabase link` step is named, never allowed: it is
  // not in the contract (Return 1), so any reference it makes is a leak.
  "supabase-link": [],
  "supabase-db-push": [
    "secrets.SUPABASE_DB_PASSWORD",
    "vars.SUPABASE_PROJECT_REF",
    "vars.SUPABASE_POOLER_HOST",
  ],
  "supabase-functions-deploy": [
    "secrets.SUPABASE_ACCESS_TOKEN",
    "secrets.SUPABASE_DB_PASSWORD",
    "vars.SUPABASE_PROJECT_REF",
  ],
  "pages-deploy": [
    "secrets.CLOUDFLARE_API_TOKEN",
    "secrets.CLOUDFLARE_ACCOUNT_ID",
    "vars.CLOUDFLARE_PAGES_PROJECT",
  ],
};

/** `${{ <ctx>.<name> }}` with any inner spacing, exactly and nothing else. */
function isExpr(value: unknown, ctx: "secrets" | "vars", name: string) {
  return (
    typeof value === "string" &&
    new RegExp(`^\\$\\{\\{\\s*${ctx}\\.${name}\\s*\\}\\}$`).test(value.trim())
  );
}

/** The source a Supabase step's env name must come from. */
const SUPABASE_ENV: [string, "secrets" | "vars"][] = [
  ["SUPABASE_ACCESS_TOKEN", "secrets"],
  ["SUPABASE_DB_PASSWORD", "secrets"],
  ["SUPABASE_PROJECT_REF", "vars"],
];

/** `$NAME` words a run script expands. */
function expandedNames(run: string): string[] {
  return [...oneLine(run).matchAll(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g)].map(
    (m) => m[1] ?? "",
  );
}

describe("deploy.yml: when it runs (AC-1, AC-2)", () => {
  test("the YAML parser reads `on:` as the key 'on', not the boolean true", () => {
    // A guard on the instrument: under YAML 1.1 `on` is a boolean and every
    // trigger assertion below would read an absent key and mean nothing.
    expect(Object.keys(parse("on:\n  push:\n"))).toEqual(["on"]);
  });

  test("it is triggered only by a push to main and by a manual run", () => {
    const on = workflow().on as Json;
    expect(on).toBeTypeOf("object");
    expect(Object.keys(on).sort()).toEqual(["push", "workflow_dispatch"]);
    expect(on.push).toEqual({ branches: ["main"] });
  });

  test("a pull request, a pull_request_target or a schedule starts nothing", () => {
    const on = workflow().on as Json;
    expect(on).not.toHaveProperty("pull_request");
    expect(on).not.toHaveProperty("pull_request_target");
    expect(on).not.toHaveProperty("schedule");
  });

  test("the token GitHub hands the workflow can only read the repository", () => {
    expect(workflow().permissions).toEqual({ contents: "read" });
  });

  test("a second deploy queues behind the first instead of cancelling it mid-migration", () => {
    const c = workflow().concurrency as Json;
    expect(c).toBeTypeOf("object");
    expect(c.group).toBeTypeOf("string");
    expect((c.group as string).trim()).not.toBe("");
    expect(c["cancel-in-progress"]).toBe(false);
  });
});

describe("deploy.yml: the job and its environment (AC-1)", () => {
  test("there is one job, `deploy`, and it uses the GitHub environment `production`", () => {
    expect(Object.keys(jobs())).toEqual(["deploy"]);
    const env = deployJob().environment;
    const name =
      typeof env === "object" && env !== null ? (env as Json).name : env;
    expect(name).toBe("production");
  });

  test("no secret or variable is mapped at workflow or job level, where every step would see it", () => {
    const wf = workflow();
    const { jobs: _jobs, ...workflowLevel } = wf;
    const { steps: _steps, ...jobLevel } = deployJob();
    expect(contextRefs(workflowLevel)).toEqual([]);
    expect(contextRefs(jobLevel)).toEqual([]);
  });
});

describe("deploy.yml: the steps (AC-1, AC-2)", () => {
  test("the steps run in exactly the contracted order: toolchain, install, gates, build, db push, functions deploy, Pages deploy", () => {
    expect(steps().map(roleOf)).toEqual(CONTRACT_ORDER);
  });

  test("no step runs `supabase link`, which a scoped access token cannot pass (Return 1)", () => {
    const linking = steps()
      .map((s) => oneLine(s.run ?? ""))
      .filter((run) => /\bsupabase\s+link\b/.test(run));
    expect(linking).toEqual([]);
  });

  test("the toolchain matches gates.yml: Node from .nvmrc with the pnpm cache, and the same Deno", () => {
    const gates = load(GATES_WORKFLOW).jobs as Record<string, Json>;
    const gatesSteps = (gates.gates?.steps ?? []) as Step[];
    const gatesDeno = gatesSteps.find((s) =>
      (s.uses ?? "").startsWith("denoland/setup-deno@"),
    );
    expect(stepFor("setup-node").with).toMatchObject({
      "node-version-file": ".nvmrc",
      cache: "pnpm",
    });
    expect(gatesDeno?.with?.["deno-version"]).toBeTypeOf("string");
    expect(stepFor("setup-deno").with?.["deno-version"]).toBe(
      gatesDeno?.with?.["deno-version"],
    );
  });

  test("dependencies are installed from the lockfile, frozen", () => {
    expect(oneLine(stepFor("install").run ?? "")).toBe(
      "pnpm install --frozen-lockfile",
    );
  });

  test("the gates run as `bash scripts/gates.sh --fast`, and nothing lets the job continue past a failure", () => {
    const gates = stepFor("gates");
    expect(oneLine(gates.run ?? "")).toBe("bash scripts/gates.sh --fast");
    expect(deployJob()["continue-on-error"] ?? false).toBe(false);
    for (const s of steps()) {
      expect(s["continue-on-error"] ?? false, roleOf(s)).toBe(false);
      expect(s.if, `${roleOf(s)} has an if:`).toBeUndefined();
    }
  });

  test("the build is `pnpm build` with exactly the three VITE_ variables from the environment", () => {
    const build = stepFor("build");
    expect(oneLine(build.run ?? "")).toBe("pnpm build");
    const env = build.env ?? {};
    expect(Object.keys(env).sort()).toEqual([
      "VITE_OWNER_EMAIL",
      "VITE_SUPABASE_ANON_KEY",
      "VITE_SUPABASE_URL",
    ]);
    for (const [k, v] of Object.entries(env)) {
      expect(isExpr(v, "vars", k), `${k} = ${String(v)}`).toBe(true);
    }
  });

  test("migrations are pushed with `db push --db-url` to the session pooler as postgres.<ref>, and with nothing else: not --linked, not --password, not a dry run", () => {
    const args = supabaseArgs(stepFor("supabase-db-push").run ?? "", [
      "db",
      "push",
    ]);
    const flags = (args ?? []).map((a) => a.split("=")[0]);
    expect(flags, "db push --linked").not.toContain("--linked");
    expect(flags, "db push --password").not.toContain("--password");
    expect(flags, "db push --dry-run").not.toContain("--dry-run");
    expect(args).toEqual([`--db-url=${DB_URL}`]);
  });

  test("the db push URL carries no password: only the user postgres.$SUPABASE_PROJECT_REF stands before the @", () => {
    const args =
      supabaseArgs(stepFor("supabase-db-push").run ?? "", ["db", "push"]) ?? [];
    const url = args
      .find((a) => a.startsWith("--db-url="))
      ?.slice("--db-url=".length);
    expect(url, "no --db-url").toBeDefined();
    const userinfo = /^postgresql:\/\/([^@]*)@/.exec(url ?? "")?.[1];
    expect(userinfo).toBe("postgres.$SUPABASE_PROJECT_REF");
  });

  test("db push gets the password as PGPASSWORD, the ref and the pooler host from the environment's variables, and no access token", () => {
    const env = stepFor("supabase-db-push").env ?? {};
    expect(Object.keys(env), "db push env").not.toContain(
      "SUPABASE_ACCESS_TOKEN",
    );
    expect(Object.keys(env).sort()).toEqual([
      "PGPASSWORD",
      "SUPABASE_POOLER_HOST",
      "SUPABASE_PROJECT_REF",
    ]);
    expect(
      isExpr(env.PGPASSWORD, "secrets", "SUPABASE_DB_PASSWORD"),
      `PGPASSWORD = ${String(env.PGPASSWORD)}`,
    ).toBe(true);
    expect(
      isExpr(env.SUPABASE_PROJECT_REF, "vars", "SUPABASE_PROJECT_REF"),
      `SUPABASE_PROJECT_REF = ${String(env.SUPABASE_PROJECT_REF)}`,
    ).toBe(true);
    expect(
      isExpr(env.SUPABASE_POOLER_HOST, "vars", "SUPABASE_POOLER_HOST"),
      `SUPABASE_POOLER_HOST = ${String(env.SUPABASE_POOLER_HOST)}`,
    ).toBe(true);
  });

  test("every function is deployed: `functions deploy` names no function, uses the API bundler and the project ref", () => {
    expect(
      supabaseArgs(stepFor("supabase-functions-deploy").run ?? "", [
        "functions",
        "deploy",
      ]),
    ).toEqual(["--project-ref=$SUPABASE_PROJECT_REF", "--use-api"].sort());
  });

  test("functions deploy maps the access token, and every name it expands, from the right secret or variable on the step itself", () => {
    for (const role of ["supabase-functions-deploy"] as const) {
      const step = stepFor(role);
      const env = step.env ?? {};
      const needed = new Set([
        "SUPABASE_ACCESS_TOKEN",
        ...expandedNames(step.run ?? ""),
      ]);
      for (const name of needed) {
        expect(Object.keys(env), `${role} env`).toContain(name);
      }
      for (const [k, v] of Object.entries(env)) {
        const source = SUPABASE_ENV.find(([n]) => n === k);
        expect(source, `${role} env has unexpected ${k}`).toBeDefined();
        const [name, ctx] = source as [string, "secrets" | "vars"];
        expect(isExpr(v, ctx, name), `${role} ${k} = ${String(v)}`).toBe(true);
      }
    }
  });

  test("dist/ is deployed with wrangler-action to the Pages project in vars.CLOUDFLARE_PAGES_PROJECT, as the production branch main", () => {
    const pages = stepFor("pages-deploy");
    const w = pages.with ?? {};
    expect(isExpr(w.apiToken, "secrets", "CLOUDFLARE_API_TOKEN")).toBe(true);
    expect(isExpr(w.accountId, "secrets", "CLOUDFLARE_ACCOUNT_ID")).toBe(true);
    const cmd = compactExpr(oneLine(String(w.command ?? ""))).split(" ");
    expect(cmd.slice(0, 3)).toEqual(["pages", "deploy", "dist"]);
    expect(cmd).toContain(`--project-name=\${{vars.CLOUDFLARE_PAGES_PROJECT}}`);
    expect(cmd).toContain("--branch=main");
  });

  test("every secret and variable is referenced only by the step that uses it - the gates and the install see none", () => {
    const leaks: string[] = [];
    for (const s of steps()) {
      const role = roleOf(s);
      const allowed = ALLOWED_REFS[role as Role] ?? [];
      for (const ref of contextRefs(s)) {
        if (!allowed.includes(ref)) leaks.push(`${role}: ${ref}`);
      }
      // A run script reads env, never an inline expression.
      expect(contextRefs(s.run ?? ""), `${role} run`).toEqual([]);
    }
    expect(leaks).toEqual([]);
  });

  test("exactly the four settled secrets and six settled variables are referenced", () => {
    const refs = new Set(contextRefs(workflow()));
    expect([...refs].filter((r) => r.startsWith("secrets.")).sort()).toEqual(
      SECRETS.map((s) => `secrets.${s}`).sort(),
    );
    expect([...refs].filter((r) => r.startsWith("vars.")).sort()).toEqual(
      VARS.map((v) => `vars.${v}`).sort(),
    );
  });
});
