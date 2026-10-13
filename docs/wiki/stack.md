# Stack — Clean Calendar

> **Verified by CAL-001, 2026-10-13.** Every version below is what `pnpm add` / winget actually installed, and every gate line is the one in `.claude/harness/project.conf`, executed and observed failing on purpose in `docs/backlog/stories/CAL-001.md` (## Gate probes). Exceptions, still unexecuted because Docker is not installed: the `db` and `integration` gates, `supabase start`, and `supabase functions serve` bundling `shared/` (CAL-001 ## Deferred verifications).

_Written 2026-10-12 by `/plan-product` from `product-brief.md`. Versions are
pinned to the latest release the planner knew of; the bootstrap story
(CAL-001) replaces any that has moved and records what it actually installed
in `docs/wiki/environment.md`._

## Shape in three lines

1. **Client:** a TypeScript + React single-page PWA built by Vite, installable
   on Android Chrome, registered as a Web Share Target, served as static files
   from Cloudflare Pages.
2. **Backend:** Supabase free tier — Postgres with row-level security, Google
   sign-in through Supabase Auth, Realtime for cross-device sync, `pg_cron` +
   `pg_net` calling Deno edge functions on a schedule.
3. **AI:** Gemini (`gemini-2.5-flash`) called only from the `capture` edge
   function, with the API key held as a Supabase function secret.

Two profiles apply: `node-typescript` (`.claude/skills/stack-profiles/reference/node-typescript.md`)
for everything under `src/` and `e2e/`, and a new profile written for this
project, `supabase-deno` (`.claude/skills/stack-profiles/reference/supabase-deno.md`),
for `supabase/functions/**`. The gates below are the union, with distinct ids.

## Runtime and package management

| Tool | Version | Why (brief constraint) |
|---|---|---|
| Node.js | 24.x LTS (`.nvmrc` `24`, `engines.node` `>=24`; measured v24.19.0) | Vite, Vitest, Playwright and the Supabase CLI all run on Node; LTS keeps `/setup-environment` boring. Was 22 in planning; CAL-001 pinned what is installed (PO decision 1). |
| pnpm | 10.x via corepack (`"packageManager": "pnpm@10.34.7"`) | The `node-typescript` profile's manager; `--frozen-lockfile` makes CI deterministic. Measured: corepack runs 10.34.7 inside the repo although the global shim reports 12.3.4. |
| Deno | 2.9.x (measured 2.9.7, TypeScript 6.0.3 inside) | Supabase edge functions run on Deno; local tests and type-checks of `supabase/functions/**` need the same runtime (constraint: Gemini key server-side, reminders server-side). |
| Supabase CLI | 2.x, project-local dev dependency `supabase` (2.120.0), run as `pnpm exec supabase` | Not in winget. `supabase start` (local Postgres + Auth + Realtime + functions, needs Docker Desktop), `supabase db push`, `supabase functions deploy`. Required for the optional `db` and `integration` gates only. `supabase init` works without Docker. |
| Docker Desktop | current | Only for `supabase start`; the required gates never need it. |

## Client

| Library | Version | Why |
|---|---|---|
| TypeScript | 5.9.x (5.9.3; 7.0.2 is latest and deliberately not taken) | `strict` + `noUncheckedIndexedAccess`; a calendar is date arithmetic and the compiler is the first test. Pinned to 5.x rather than the 7 native port because Stryker's config preprocessor breaks on 7 (profile note) and Biome/Vite plugins lag it. |
| React | 19.x (19.3.0) | Familiar component model, Testing Library support; brief §8 wants a Google-Calendar-like grid with chips and sheets, which is ordinary component work. |
| react-router | 7.x (7.18.4; 8 exists, not taken) (declarative mode) | Month/week/day and the capture/confirm screens are URLs so the share target can deep-link to `/capture`. |
| Vite | 7.x (7.3.7; 8 exists, not taken), `@vitejs/plugin-react` 5.2.0 | The build; `vite build` prints `built in …` which is the `build` evidence line. |
| vite-plugin-pwa | 1.x (1.3.0; installed, not yet wired into `vite.config.ts`) (Workbox 7) | Generates the manifest and the service worker: precache for offline open, `share_target` registration, push handler injection (`injectManifest` strategy so `src/sw.ts` is ours). Brief §4.7 and §6 offline. |
| @supabase/supabase-js | 2.x (2.117.3) | Auth (Google OAuth), PostgREST client, Realtime channel subscriptions. |
| Dexie | 4.x (4.4.6) | IndexedDB wrapper for the offline cache and the edit outbox (brief §6: "edits queue and sync"). |
| date-fns | 4.x (4.4.0) | Calendar grid maths, formatting; tree-shakeable, pure functions, easy to test with fixed dates. Device-zone only (brief, open questions). |
| zod | 4.x (4.6.7) | Validates the edge function's JSON reply before it reaches the confirm screen, and the event form input. Also used in Deno via `npm:zod` so one schema file is shared. |
| CSS Modules + CSS custom properties | (Vite built-in) | The kind colours are the identity (brief §8); tokens live in `src/styles/tokens.css` as real variables, no utility framework to fight. |

## Backend (Supabase)

| Piece | Version / setting | Why |
|---|---|---|
| Postgres | 17 (Supabase default) | RLS keyed on the single allowed account; `pg_cron` and `pg_net` extensions for the reminder scheduler (brief §4.6 "server-side scheduler"). |
| Supabase Auth | Google provider only | Brief §6 "Sign in with Google, one allowed account". The allowed e-mail lives in `app_config` and every RLS policy compares `auth.jwt() ->> 'email'` to it. |
| Realtime | `postgres_changes` on `events`, `kinds`, `event_overrides` | Brief §4.4 "within seconds". |
| Edge functions | Deno 2 runtime, TypeScript | `capture` (Gemini call), `send-reminders` (web push). Secrets: `GEMINI_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. |
| web-push | `npm:web-push@3.6.x` from Deno | Standard VAPID signing; Android Chrome delivers to the installed PWA with the app closed (brief §7.4). |
| Gemini | `gemini-2.5-flash`, REST `generateContent` with `responseMimeType: application/json` and a response schema | **Decision on an open question:** Flash is the cheapest model with image input and structured JSON output, and booking e-mails are an easy extraction task; cost is well inside "fractions of a cent per capture". Pinned by name, not `-latest`, so a model retirement is a deliberate change here. Called with raw `fetch`, no SDK, so the edge function has one fewer dependency to keep current. |

## Hosting

| Piece | Why |
|---|---|
| Cloudflare Pages (free) | Static hosting with HTTPS and a stable origin — a PWA share target and web push both require a secure, fixed origin. Deploys from `pnpm build` output via a GitHub Action in CAL-030. GitHub Pages lost because the `github.io` subpath complicates the service-worker scope and share-target action URL. |
| Supabase hosted project (free tier) | The brief's decision. Free tier pauses after a week of inactivity; the daily-use success criterion keeps it awake, and the deployment story documents the restore step. |

## Quality tooling and the gates

| Role | Tool | Version |
|---|---|---|
| Lint + format | Biome | 2.5.15 — one tool, prints `Checked N files` (evidence). `biome.json` lists what it reads in `files.includes` and excludes `.claude`, `docs`, `scripts`, `supabase`, `dist`, `coverage` (HARNESS-049). Biome 2.2+ wants `!dir`, not `!dir/**`, and 2.5 spells the rule set `"preset": "recommended"`. The lint gate runs with `--error-on-warnings`: biome exits 0 on a warning (probed in CAL-001). |
| Type check (client) | `tsc --noEmit -p tsconfig.json` | TypeScript 5.9.3; one `tsconfig.json` covers `src`, `shared`, `e2e` and the three `*.config.ts` (no `tsconfig.node.json`). |
| Type check (functions) | `deno check` | Deno 2.9.7 |
| Unit tests (client) | Vitest 5.0.4 with jsdom 30, Testing Library (`@testing-library/react` 16.3, `@testing-library/user-event` 14.6, `@testing-library/jest-dom` 6.9, `@testing-library/dom` 10.4), MSW 2.15 for the network boundary | Vitest 5 is the current major (planning said 3). Projects are `test.projects` with `test.name` in `vitest.config.ts`; `--project unit` works as planned. |
| Coverage | `@vitest/coverage-v8` 5.0.4, thresholds in `vitest.config.ts` | lines/branches/functions/statements 80, project-wide; raised by the story that justifies it. Vitest 5's text report hides fully covered files ("2 files fully covered"). |
| Unit tests (functions) | `deno test` under `supabase/functions`, `jsr:@std/assert@1.0.19` | Deno prints `ok | N passed | 0 failed`. No coverage threshold for Deno in v1 — recorded weakness, see the profile. |
| DB tests | Vitest project `db` (`supabase/tests/**/*.db.test.ts`) against `supabase start` | Optional gate; stories whose claims are RLS or SQL set `required_gates: [db]`. With no test file, `vitest run --project db` exits 1 ("No test files found"). |
| Integration | Playwright 1.64.0 (`@playwright/test`), Chromium, against `vite preview` | Optional gate; required by the stories that name it. The `webServer` builds first (`pnpm build && pnpm exec vite preview --port 4173`). Chromium is not installed yet: `pnpm exec playwright install --with-deps chromium`. |
| Build | `vite build` | Evidence `built in [0-9]`. |
| Mutation | Stryker 10.0.0 (`@stryker-mutator/core`), command runner, `stryker.config.mjs` | Optional, on demand, never run in CAL-001. Command runner because the vitest runner plugin tests nothing under Vitest 5 (node-typescript profile). |

### Gate lines for `project.conf` (verified by CAL-001, 2026-10-13)

The authoritative copy is `.claude/harness/project.conf`; this is what it says.

    gate | format      | optional | . | pnpm exec biome format .
    gate | lint        | required | . | pnpm exec biome lint --error-on-warnings .
    gate | typecheck   | required | . | pnpm exec tsc --noEmit -p tsconfig.json
    gate | unit        | required | . | pnpm exec vitest run --project unit
    gate | coverage    | required | . | pnpm exec vitest run --project unit --coverage
    gate | deno-check  | required | supabase/functions | deno check --quiet $(find . -name '*.ts' -not -path '*/node_modules/*') && find . -name '*.ts' -not -path '*/node_modules/*' | awk 'END { print "deno-check: " NR " modules" }'
    gate | deno-test   | required | supabase/functions | deno test --allow-env --allow-read --allow-net=127.0.0.1
    gate | db          | optional | . | pnpm exec vitest run --project db
    gate | build       | required | . | pnpm build
    gate | integration | optional | . | pnpm exec playwright test
    gate | mutation    | optional | . | pnpm exec stryker run

    waiver | db          | no *.db.test.ts until CAL-004; Docker absent
    waiver | integration | Chromium not installed; Docker absent

    evidence | format      | Checked [1-9][0-9]* files
    evidence | lint        | Checked [1-9][0-9]* files
    evidence | typecheck   | -
    evidence | unit        | Tests +[1-9][0-9]* passed
    evidence | coverage    | Tests +[1-9][0-9]* passed
    evidence | deno-check  | deno-check: [1-9][0-9]* modules
    evidence | deno-test   | ok [|] [1-9][0-9]* passed
    evidence | db          | Tests +[1-9][0-9]* passed
    evidence | build       | built in [0-9]
    evidence | integration | [1-9][0-9]* passed
    evidence | mutation    | All files *[|][^|]*[|][^|]*[|] *[1-9][0-9]* [|]

    floor | unit       | 2
    floor | coverage   | 2
    floor | deno-check | 2
    floor | deno-test  | 1

    slow | db, build, integration, mutation          (one line each in project.conf)
    ondemand | mutation

    covers | lint        | src/**, shared/**, e2e/**, index.html
    covers | typecheck   | src/**, shared/**, e2e/**
    covers | unit        | src/**, shared/**
    covers | coverage    | src/**, shared/**
    covers | deno-check  | supabase/functions/**
    covers | deno-test   | supabase/functions/**
    covers | build       | src/**, shared/**, index.html
    covers | db          | supabase/migrations/**, supabase/tests/**
    covers | integration | e2e/**

    discovery | unit   | . | pnpm exec vitest list --project unit | grep "\] src/" > /dev/null
    discovery | shared | . | pnpm exec vitest list --project unit | grep "\] shared/" > /dev/null
    discovery | deno   | supabase/functions | deno test --allow-read --filter __discovery_lists_modules_only__ --reporter=tap 2>&1 | grep "_test\.ts" > /dev/null
    discovery | e2e    | . | pnpm exec playwright test --list | grep "\.spec\.ts" > /dev/null
    (db discovery is added by CAL-004, once a *.db.test.ts exists)

    task | install          | - | . | pnpm install --frozen-lockfile
    task | dev              | - | . | pnpm dev
    task | test             | - | . | pnpm exec vitest
    task | supabase-start   | - | . | pnpm exec supabase start
    task | functions-serve  | - | . | pnpm exec supabase functions serve --env-file supabase/.env.local

The doubts planning listed, as CAL-001 settled them:

1. **`deno check` enumeration.** `gates.sh` runs commands through `eval`, so
   `$(find …)` works and `**` would not. Worse, `deno check` over no files
   exits 0 silently in Deno 2.9, so `-` evidence was unsafe: the command now
   prints the module count and the evidence refuses 0.
2. **`deno test --dry-run` does not exist in Deno 2.9** ("unexpected argument
   '--dry-run'"). `--no-run` prints nothing when cached. Discovery uses a
   filter matching no test plus `--reporter=tap`, which still names every
   module (`# ./_shared/health_test.ts`).
3. `typecheck` stays `-` (tsc silent on success; empty include is TS18003).
4. Vitest 5 keeps `--project <name>`; `vitest list` prefixes each test with
   `[unit]`. Playwright's `--list` prints paths relative to `testDir`
   (`boot.spec.ts`), so a discovery grep for `e2e/` would never match.
5. The PWA plugin is not wired yet, so `build` prints only Vite's line.
6. `shared/` relative imports bundling under `supabase functions serve`:
   **not settled** (needs Docker); CAL-018 owns it.

## Layout the bootstrap story produces

    src/                      PWA source (React, TS); co-located *.test.ts(x)
    src/sw.ts                 service worker (share target, push, precache)
    src/styles/tokens.css     design tokens as CSS variables
    shared/                   TS shared by the PWA and the edge functions (recurrence, capture schema)
    supabase/config.toml      local stack config
    supabase/migrations/      NNNN_name.sql, one per story that changes the schema
    supabase/functions/       capture/, send-reminders/, _shared/; *_test.ts beside the code
    supabase/seed.sql         local-dev seed (allowed e-mail, default kinds)
    e2e/                      Playwright specs
    public/                   icons, static manifest pieces
    vite.config.ts, vitest.config.ts, playwright.config.ts, biome.json, tsconfig.json, stryker.config.mjs
    supabase/functions/deno.json, deno.lock   Deno import map (pinned jsr:) and its lockfile

`shared/` is imported by Deno through a relative path (`../../../shared/x.ts`).
The Supabase CLI bundles edge functions with Deno's bundler, which follows
relative imports outside the function directory. `deno check`/`deno test` resolve it (CAL-001); whether
`supabase functions serve` bundles it needs Docker and is owned by CAL-018; if it fails, the fallback is an import map in
`supabase/functions/deno.json` pointing at `../../shared/`.

## Prerequisites (for `/setup-environment`)

    winget install --id OpenJS.NodeJS.LTS       # Node 24 LTS
    corepack enable                             # the packageManager field selects pnpm 10.34.7 in the repo
    winget install --id DenoLand.Deno           # Deno 2.9; open a NEW terminal afterwards
    pnpm install --frozen-lockfile              # includes the Supabase CLI (`supabase` dev dependency)
    pnpm exec playwright install --with-deps chromium   # only for the integration gate
    # Docker Desktop, only for `supabase start` (db and integration gates)

The Supabase CLI is **not** in winget; it is the project-local `supabase`
package, run as `pnpm exec supabase` (environment.md has the measurement).

Verify: `node --version` (v24), `pnpm --version` inside the repo (10.34.7),
`deno --version` (2.9.x), `pnpm exec supabase --version` (2.x).
