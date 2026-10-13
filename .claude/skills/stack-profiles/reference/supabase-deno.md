# Profile: supabase-deno

TypeScript edge functions on Supabase, run and tested under Deno 2, with a
Postgres schema managed by the Supabase CLI. Written for Clean Calendar
(2026-10-12); every line is **UNVERIFIED** until that project's bootstrap
story runs it. Nothing here has been executed in the harness repository,
because Deno and the Supabase CLI are not installed there.

Used alone, this profile describes a backend-only project. Used beside
`node-typescript` - the common case, a PWA plus its functions - the gate ids
below are renamed `deno-check`, `deno-test` and so on so that the two sets do
not collide; see *Combining* at the end.

## Gate commands for project.conf

    gate | format    | optional | supabase/functions | deno fmt --check
    gate | lint      | required | supabase/functions | deno lint
    gate | typecheck | required | supabase/functions | deno check --quiet **/*.ts
    gate | unit      | required | supabase/functions | deno test --allow-env --allow-read --allow-net=127.0.0.1
    gate | coverage  | required | supabase/functions | deno test --allow-env --allow-read --allow-net=127.0.0.1 --coverage=../../.deno-cov && deno coverage ../../.deno-cov
    gate | integration | optional | . | supabase start && supabase db reset && pnpm exec vitest run --project db
    gate | build     | required | supabase/functions | deno check --quiet **/index.ts && supabase functions list --local
    gate | mutation  | optional | supabase/functions | echo "no Deno mutation tool is configured; see Weakness"
    ondemand | mutation | no Deno mutation runner exists; the gate is a placeholder so --audit sees the id, and /audit-mutations reasons about mutants by hand

    task | functions-serve | - | . | supabase functions serve --env-file supabase/.env.local
    task | supabase-start  | - | . | supabase start
    task | db-reset        | - | . | supabase db reset

`**/*.ts` on the `typecheck` line relies on the shell expanding a globstar.
`gates.sh` runs the command through `bash -c`, where `**` is a plain `*` unless
`shopt -s globstar` is set; the bootstrap story must either set it in the
command (`shopt -s globstar; deno check …`) or list the entry points. Write
down which.

## Evidence of work

    evidence | format      | Checked [1-9][0-9]* files
    evidence | lint        | Checked [1-9][0-9]* files
    evidence | typecheck   | -
    evidence | unit        | ok \| [1-9][0-9]* passed
    evidence | coverage    | ok \| [1-9][0-9]* passed
    evidence | integration | Tests +[1-9][0-9]* passed
    evidence | build       | -
    evidence | mutation    | killed: [1-9][0-9]*

Deno's test summary reads `ok | 3 passed | 0 failed (12ms)`; the regex escapes
the pipe. `deno lint` prints `Checked 7 files` on success; `deno fmt --check`
prints `Checked 7 files` too. `deno check` prints `Check file:///…` per module
on a cold run and nothing on a warm one, so it is `-` - a run over no files
fails with "No files found", which is the loud vacuous case we want.

`deno test` with no test files found exits non-zero in Deno 2 ("No test
modules found"), so the `unit` gate's vacuous case is already loud; the
evidence line guards the case where modules are found and contain no
`Deno.test` calls, which prints `ok | 0 passed | 0 failed`.

The `mutation` evidence line is a placeholder for the id's sake: no Deno
mutation tool exists today, and the placeholder command never prints
`killed:`, so running the gate on demand fails loudly rather than vacuously.

## The coverage story

`deno test --coverage=<dir>` writes raw V8 coverage and `deno coverage <dir>`
prints a per-file table and a total. **There is no threshold flag.** A
threshold needs a one-line wrapper that parses the total out of `deno coverage
--lcov` (or the table's `All files` row) and exits non-zero under N%. Until a
story writes that wrapper, the `coverage` gate above runs the suite under
instrumentation and prints the table, and the number is read by a person. Say
so in `project.conf` beside the gate. This is a declared weakness, not an
omission: an edge function suite is small, and a hand-read table is better
than a threshold nobody wrote.

## Discovery

    discovery | functions | supabase/functions | deno test --allow-env --allow-read --allow-net=127.0.0.1 --dry-run 2>&1 | grep "_test\.ts" > /dev/null

**Measured in Clean Calendar CAL-001 (Deno 2.9.7): `--dry-run` does not
exist** ("unexpected argument '--dry-run'"), and `--no-run` prints nothing
once the modules are cached. What works there:

    discovery | functions | supabase/functions | deno test --allow-read --filter __discovery_lists_modules_only__ --reporter=tap 2>&1 | grep "_test\.ts" > /dev/null

The TAP reporter names every module it loaded (`# ./_shared/health_test.ts`)
even when the filter runs no test. The same story measured that `deno check`
over **no** files exits 0 silently, so `evidence | typecheck | -` is unsafe;
its project.conf prints a module count after the check and asserts on that.

Deno discovers `*_test.ts`, `*.test.ts`, `test.ts` and `*_test.{js,mjs,jsx,tsx}`
under the given path. A function directory renamed, or a test file named
`capture.spec.ts`, silently leaves the suite; the dry run names each module it
would run. If `--dry-run` is not in the installed Deno (it was added in 1.x but
check), `deno test --filter __nothing__` prints the module list the same way.
The summary's `N passed` is one whole number inside the evidence regex, so a
`floor | unit | N` line can read it.

## What `--fast` should leave out

    slow | integration | needs Docker and a fresh database reset; minutes
    slow | build       | deploys nothing but talks to the local Supabase CLI; not a RED/GREEN cost
    slow | mutation    | placeholder; a real runner would re-run the suite once per mutant

`coverage` stays in `--fast`: it is the same `deno test` under instrumentation
and it is the command that judges the tests. Deno's default per-test timeout
is none (a test runs until it finishes), so the CI/local factor concern in
`quality-gates` applies to wall-clock only; still budget any test that hits
`127.0.0.1` with an explicit `AbortSignal.timeout`.

## Layout

    supabase/config.toml            local stack configuration (ports, auth providers, functions)
    supabase/migrations/NNNN_x.sql  schema, one file per story that changes it; never edited after merge
    supabase/seed.sql               local-only seed
    supabase/functions/<name>/index.ts      one function per directory, `Deno.serve` entry
    supabase/functions/<name>/<x>_test.ts   tests beside the code
    supabase/functions/_shared/     code shared by functions (Deno ignores `_`-prefixed directories for deploy)
    supabase/functions/deno.json    import map and compiler options for the functions
    supabase/.env.local             secrets for `functions serve`; gitignored

Shared code between a browser bundle and the functions lives outside both
(`shared/` at the repository root) and is imported by relative path from the
function. The Supabase CLI bundles with Deno's bundler and follows relative
imports; verify once with `supabase functions serve` before relying on it, and
fall back to an import map entry if it does not.

## paths.conf additions

    test   | supabase/functions/**/*_test.ts
    test   | supabase/functions/**/*.test.ts
    test   | **/*.db.test.ts
    config | supabase/config.toml
    config | supabase/functions/deno.json
    config | deno.json
    config | deno.lock
    config | supabase/migrations/**

Migrations classify as `config`: they are production surface, written in GREEN
(or SCAFFOLD), never in RED. A story whose claim is in SQL - an RLS policy, a
cron job - is tested through the `db` project against a local Supabase, and
names that gate in `required_gates`.

## .gitignore additions

    supabase/.branches/
    supabase/.temp/
    supabase/.env.local
    .deno-cov/

## Notes for the bootstrap story

- `supabase init` writes `config.toml`; enable the Google provider under
  `[auth.external.google]` with env-substituted client id and secret, and set
  `[functions.<name>] verify_jwt = true` for every function - the browser calls
  them with the user's JWT, never anonymously.
- `deno.json` under `supabase/functions` carries `"imports"` for `npm:` and
  `jsr:` specifiers so each function does not repeat versions. Pin exact
  versions; Deno resolves `npm:zod@4` to a moving target.
- The step most likely to break: `deno check` and `deno lint` resolving the
  `Deno.serve` types and `npm:` imports without a `deno.lock`. Run `deno
  cache` once in the bootstrap story and commit the lock.
- `pg_cron` and `pg_net` are enabled by a migration (`create extension`), and
  the cron job that calls a function needs the project URL and service-role
  key stored in Vault (`vault.create_secret`) - which the local stack supports
  but the seed must provide. Keep the job definition in a migration and the
  secrets in `seed.sql` locally.

## Testing notes

- Factor each function as a pure `handle(request, deps)` exported from a
  module beside `index.ts`, with `index.ts` only calling `Deno.serve(handle)`
  with real deps. Tests call `handle` with a fake `fetch` for Gemini/web-push
  and a fake Supabase client. Testing through `Deno.serve` on a port is the
  integration gate's job.
- Use `@std/assert` (`jsr:@std/assert`) and `@std/testing/mock` for spies;
  `FakeTime` from `@std/testing/time` for the scheduler window.
- Theatre in this ecosystem: asserting that a function returns 200 without
  asserting the body it built from the model's reply; and mocking the Gemini
  call with the exact JSON the parser expects, so the parser is never tested
  against the slightly-wrong shapes a model actually returns. Keep a corpus of
  real (redacted) model replies as fixtures.
- Web push cannot be received in a test. Assert the request the function sends
  (endpoint, TTL, payload) through the fake `fetch`, and assert the row it marks
  `sent_at`; delivery is checked by a person on a phone, once, and recorded in
  the story.

## Combining this with `node-typescript`

Rename this profile's ids with a `deno-` prefix (`deno-lint`, `deno-check`,
`deno-test`, `deno-coverage`), keep `node-typescript`'s standard ids for the
client, and keep exactly one `mutation` gate - the Node one, since Stryker
exists and this profile's is a placeholder. Copy each renamed gate's
`evidence`, `slow` and `discovery` lines under the new id. Combining this with
another profile's `mutation` gate: see the stack-profiles skill, *Choosing*.

## Weakness

No mutation tool, no coverage threshold without a wrapper, and the
integration gate needs Docker. Compensate with: pure `handle` functions tested
with fixtures of real model output; the `db` Vitest project for every SQL
claim; and one manual push-delivery check per reminder story, recorded.

## Prerequisites

    # Windows
    winget install --id DenoLand.Deno
    # The Supabase CLI is NOT in winget (measured 2026-10-12, winget 1.29:
    # "No package found"). Add it to the project instead and run it as
    # `pnpm exec supabase` (Clean Calendar CAL-001, 2.120.0):
    pnpm add -D supabase
    # or globally through scoop: scoop bucket add supabase https://github.com/supabase/scoop-bucket.git && scoop install supabase
    # macOS
    brew install deno supabase/tap/supabase
    # Docker Desktop for `supabase start` (db / integration gates only)

Verify: `deno --version` prints `deno 2.x`; `supabase --version` (or
`pnpm exec supabase --version`) prints `2.x`;
`docker info` succeeds if the optional gates are wanted.
