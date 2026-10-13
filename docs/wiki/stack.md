# Stack — Clean Calendar

> **Unverified.** Nothing in this file has been executed. Every version and every command below is researched, not verified. The bootstrap story must run each gate command, observe it fail on purpose, correct anything that has moved, and update both this file and `.claude/harness/project.conf`.

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
| Node.js | 22.x LTS (pin `22.20.0` in `.nvmrc` / `engines`) | Vite, Vitest, Playwright and the Supabase CLI all run on Node; LTS keeps `/setup-environment` boring. |
| pnpm | 10.x via corepack (`packageManager` field) | The `node-typescript` profile's manager; `--frozen-lockfile` makes CI deterministic. |
| Deno | 2.x (pin `2.5.x`) | Supabase edge functions run on Deno; local tests and type-checks of `supabase/functions/**` need the same runtime (constraint: Gemini key server-side, reminders server-side). |
| Supabase CLI | 2.x | `supabase start` (local Postgres + Auth + Realtime + functions, needs Docker Desktop), `supabase db push`, `supabase functions deploy`. Required for the optional `db` and `integration` gates only. |
| Docker Desktop | current | Only for `supabase start`; the required gates never need it. |

## Client

| Library | Version | Why |
|---|---|---|
| TypeScript | 5.9.x | `strict` + `noUncheckedIndexedAccess`; a calendar is date arithmetic and the compiler is the first test. Pinned to 5.x rather than the 7 native port because Stryker's config preprocessor breaks on 7 (profile note) and Biome/Vite plugins lag it. |
| React | 19.x | Familiar component model, Testing Library support; brief §8 wants a Google-Calendar-like grid with chips and sheets, which is ordinary component work. |
| react-router | 7.x (declarative mode) | Month/week/day and the capture/confirm screens are URLs so the share target can deep-link to `/capture`. |
| Vite | 7.x | The build; `vite build` prints `built in …` which is the `build` evidence line. |
| vite-plugin-pwa | 1.x (Workbox 7) | Generates the manifest and the service worker: precache for offline open, `share_target` registration, push handler injection (`injectManifest` strategy so `src/sw.ts` is ours). Brief §4.7 and §6 offline. |
| @supabase/supabase-js | 2.x | Auth (Google OAuth), PostgREST client, Realtime channel subscriptions. |
| Dexie | 4.x | IndexedDB wrapper for the offline cache and the edit outbox (brief §6: "edits queue and sync"). |
| date-fns | 4.x | Calendar grid maths, formatting; tree-shakeable, pure functions, easy to test with fixed dates. Device-zone only (brief, open questions). |
| zod | 4.x | Validates the edge function's JSON reply before it reaches the confirm screen, and the event form input. Also used in Deno via `npm:zod` so one schema file is shared. |
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
| Lint + format | Biome | 2.x — one tool, fast, prints `Checked N files` (evidence). `biome.json` must exclude `.claude/**`, `docs/**`, `scripts/**` (HARNESS-049). |
| Type check (client) | `tsc --noEmit` | TypeScript 5.9 |
| Type check (functions) | `deno check` | Deno 2 |
| Unit tests (client) | Vitest 3.x with jsdom, Testing Library (`@testing-library/react` 16, `@testing-library/user-event` 14, `@testing-library/jest-dom` 6), MSW 2 for the network boundary | Vitest 3 is the current major the planner is confident of; if 5 is current at bootstrap, take it and update this row. |
| Coverage | `@vitest/coverage-v8`, thresholds in `vitest.config.ts` | lines/branches/functions/statements 80 to start; raised by the story that justifies it. |
| Unit tests (functions) | `deno test` under `supabase/functions` | Deno prints `ok | N passed | 0 failed`. No coverage threshold for Deno in v1 — recorded weakness, see the profile. |
| DB tests | Vitest project `db` (`*.db.test.ts`) against `supabase start` | Optional gate; stories whose claims are RLS or SQL set `required_gates: [db]`. |
| Integration | Playwright 1.5x, Chromium, against `vite preview` + local Supabase | Optional gate; required by the stories that name it. |
| Build | `vite build` | Evidence `built in [0-9]`. |
| Mutation | Stryker 9/10 with the command runner (profile note) | Optional, on demand. |

### Gate lines for `project.conf` (to be verified by CAL-001)

    gate | format      | optional | . | pnpm exec biome format .
    gate | lint        | required | . | pnpm exec biome lint .
    gate | typecheck   | required | . | pnpm exec tsc --noEmit -p tsconfig.json
    gate | unit        | required | . | pnpm exec vitest run --project unit
    gate | coverage    | required | . | pnpm exec vitest run --project unit --coverage
    gate | deno-check  | required | supabase/functions | deno check --quiet $(find . -name '*.ts' -not -path '*/node_modules/*')
    gate | deno-test   | required | supabase/functions | deno test --allow-env --allow-read --allow-net=127.0.0.1
    gate | db          | optional | . | pnpm exec vitest run --project db
    gate | integration | optional | . | pnpm exec playwright test
    gate | build       | required | . | pnpm build
    gate | mutation    | optional | . | pnpm exec stryker run

    evidence | format      | Checked [1-9][0-9]* files
    evidence | lint        | Checked [1-9][0-9]* files
    evidence | typecheck   | -
    evidence | unit        | Tests +[1-9][0-9]* passed
    evidence | coverage    | Tests +[1-9][0-9]* passed
    evidence | deno-check  | -
    evidence | deno-test   | ok \| [1-9][0-9]* passed
    evidence | db          | Tests +[1-9][0-9]* passed
    evidence | integration | [1-9][0-9]* passed
    evidence | build       | built in [0-9]
    evidence | mutation    | All files *[|][^|]*[|][^|]*[|] *[1-9][0-9]* [|]

    slow | integration | playwright needs a browser and a local Supabase; minutes, not seconds
    slow | db          | needs `supabase start` (Docker); not a RED/GREEN loop cost
    slow | build       | a production bundle, which RED and GREEN have no use for
    slow | mutation    | stryker re-runs the suite once per mutant
    ondemand | mutation | stryker re-runs the suite once per mutant; run it with /audit-mutations, not per story

    covers | unit       | src/**
    covers | deno-test  | supabase/functions/**
    covers | db         | supabase/migrations/**
    discovery | unit  | . | pnpm exec vitest list --project unit | grep "src/" > /dev/null
    discovery | db    | . | pnpm exec vitest list --project db | grep "\.db\.test\." > /dev/null
    discovery | deno  | supabase/functions | deno test --allow-env --allow-read --allow-net=127.0.0.1 --dry-run 2>&1 | grep "_test\.ts\|\.test\.ts" > /dev/null
    discovery | e2e   | . | pnpm exec playwright test --list | grep "e2e/" > /dev/null

    task | install          | - | . | pnpm install --frozen-lockfile
    task | dev              | - | . | pnpm dev
    task | test             | - | . | pnpm exec vitest
    task | supabase-start   | - | . | supabase start
    task | functions-serve  | - | . | supabase functions serve --env-file supabase/.env.local

Known doubts the bootstrap story must settle, in the order they will bite:

1. `deno check` with a shell `$(find …)` — if `gates.sh` runs commands without
   a shell glob, replace with an explicit list or a `deno.json` task.
2. `deno test --dry-run` may not exist in Deno 2; the discovery line then
   becomes `deno test --list` or a `grep -rl Deno.test`.
3. `typecheck` is `-` because `tsc` is silent on success and loud on an empty
   `include` (`TS18003`), which the profile already documents. `deno-check`
   prints `Check file://…` per module on a cold run and nothing when cached, so
   it is also `-`.
4. Vitest "projects" (`unit`, `db`) are the Vitest 3 workspace mechanism; if the
   installed major names it differently, both `--project` flags and the
   `discovery` lines change together.
5. The `build` gate includes the service worker bundle; `vite-plugin-pwa` in
   `injectManifest` mode prints its own line after Vite's — the `built in`
   evidence still matches Vite's.

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
    vite.config.ts, vitest.config.ts, playwright.config.ts, biome.json, tsconfig.json, deno.json

`shared/` is imported by Deno through a relative path (`../../../shared/x.ts`).
The Supabase CLI bundles edge functions with Deno's bundler, which follows
relative imports outside the function directory; CAL-001 verifies this with
`supabase functions serve` and, if it fails, the fallback is an import map in
`supabase/functions/deno.json` pointing at `../../shared/`.

## Prerequisites (for `/setup-environment`)

    winget install --id OpenJS.NodeJS.LTS
    corepack enable && corepack prepare pnpm@10 --activate
    winget install --id DenoLand.Deno
    winget install --id Supabase.cli            # or: pnpm dlx supabase@2 for one-offs
    pnpm install --frozen-lockfile
    pnpm exec playwright install --with-deps chromium   # only for the integration gate
    # Docker Desktop, only for `supabase start` (db and integration gates)

Verify: `node --version` (v22), `pnpm --version` (10.x), `deno --version`
(2.x), `supabase --version` (2.x).
