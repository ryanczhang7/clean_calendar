# Environment — Clean Calendar

_Written 2026-10-12 by `/setup-environment` from `stack.md` and the
`node-typescript` and `supabase-deno` stack profiles. `project.conf` has no
gate commands yet; the commands below are the ones `stack.md` intends, and
the bootstrap story (CAL-001) confirms or corrects them._

## Required

| Tool | Expected | Needed by |
|---|---|---|
| git, bash | any recent (Git for Windows) | the harness: hooks, `gates.sh`, `doctor.sh` |
| Node.js | 24.x LTS (`.nvmrc` 24, `engines.node >=24`; pinned by CAL-001) | Vite build, Vitest `unit` + coverage gate, Biome `lint`/`format`, `tsc` `types` gate |
| pnpm | 10.34.7, via corepack and the `packageManager` field | installs and runs every Node gate |
| Deno | 2.9.x (pinned by CAL-001; 2.9.7 measured) | `deno check` / `deno test` over `supabase/functions/**` — part of the `types` and `unit` gates |
| Supabase CLI | 2.x, project-local dev dependency (`pnpm exec supabase`) | local stack, migrations, function deploy; `supabase start` for the optional gates |

## Optional (skippable)

| Tool | Needed by |
|---|---|
| Docker Desktop | `supabase start`, which only the optional `db` and `integration` gates use. Required gates never need it. |
| Playwright Chromium | the optional `integration` gate (end-to-end). A few hundred MB; install when CAL-017/CAL-031 need it. |

## Install (Windows, winget first)

```
winget install --id DenoLand.Deno
# optional, for db/integration gates:
winget install --id Docker.DockerDesktop
```

**Supabase CLI is not in winget.** Measured 2026-10-12 on this machine
(winget v1.29.380): `winget install --id Supabase.cli` and
`winget search supabase` both return "No package found matching input
criteria". The profile's install line was wrong. Use the project-local npm
package instead. CAL-001 adds it as a dev dependency (`pnpm add -D supabase`),
and the CLI then runs as `pnpm exec supabase …` at the version the lockfile
pins, with nothing installed globally. The global alternative on Windows is
scoop (`scoop bucket add supabase https://github.com/supabase/scoop-bucket.git`
then `scoop install supabase`), but scoop is not installed on this machine,
and that route is untested here.

Node and pnpm need nothing on this machine (see Notes). On a fresh Windows
machine: `winget install --id OpenJS.NodeJS.LTS`, then `corepack enable`.
macOS: `brew install node deno supabase/tap/supabase`, then `corepack enable`.

Inside the project, once CAL-001 has created `package.json`:

```
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium   # optional, integration gate only
```

Open a **new** terminal after a winget install; the running shell does not
pick up the new PATH.

## Verify

| Command | Expected shape |
|---|---|
| `node --version` | `v24.x` |
| `pnpm --version` (inside the repo) | `10.34.7` |
| `deno --version` | `deno 2.x (...)` on the first line |
| `pnpm exec supabase --version` (after CAL-001) | `2.x.y` |
| `docker info` (optional) | prints Server details, no "cannot connect" error |
| `bash scripts/doctor.sh` | every gate executable `ok` |
| `bash scripts/gates.sh --list` | the gate commands match `stack.md` |

## Notes

- **Node version — measured 2026-10-12 on this machine (Windows 11 Home
  26200):** Node `v24.19.0` is installed, not the 22.x `stack.md` pins.
  Nothing has run against it yet. Node 24 is an LTS line, so CAL-001 should
  decide whether to pin 24 (what is installed) or keep 22, and update
  `stack.md`, `.nvmrc` and `engines` together. Until then, treat 24 as
  untested rather than as compatible.
- **pnpm — measured 2026-10-12 on this machine:** outside any project,
  `pnpm --version` prints `12.3.4`. The `pnpm` in `C:\Program Files\nodejs`
  is a corepack shim (corepack `0.35.0`), so once `package.json` carries
  `"packageManager": "pnpm@10.x"` corepack should run 10.x inside the repo.
  That last part is expected behaviour, not yet observed: CAL-001 checks it
  with `pnpm --version` inside the repo.
- **Deno — measured 2026-10-12 on this machine:** `winget install --id
  DenoLand.Deno` installed `deno 2.9.7`, not the 2.5.x `stack.md` pins. The
  binary is at `%LOCALAPPDATA%\Microsoft\WinGet\Packages\DenoLand.Deno_…\deno.exe`
  and runs. winget reported that it changed PATH, so a shell opened before the
  install will not find `deno` until it is restarted. CAL-001 decides the pin
  and updates `stack.md`.
- **Python:** `python.exe` / `python3.exe` exist in
  `%LOCALAPPDATA%\Microsoft\WindowsApps` on this machine, the Store alias
  shims. Nothing in this project uses python; do not add a dependency on it
  (`rules.md`, Portability).
- **Shells:** harness scripts run under Git Bash. Run `pnpm`/`deno` from Git
  Bash or PowerShell; both resolve the same executables.
- **CAL-001, 2026-10-13 — pins decided and measured on this machine.**
  Node 24 (`.nvmrc` `24`, `engines.node >=24`) and Deno 2.9 are now the pins;
  `stack.md` is corrected to match. Every Node gate (biome 2.5.15, tsc 5.9.3,
  vitest 5.0.4, vite 7.3.7) ran green on Node v24.19.0.
- **pnpm inside the repo — observed, CAL-001:** with
  `"packageManager": "pnpm@10.34.7"` in `package.json`, corepack printed
  `Corepack is about to download …pnpm-10.34.7.tgz` once, and `pnpm --version`
  inside the repo then prints `10.34.7`. Outside it the shim still says 12.3.4.
  pnpm 10 skips dependency build scripts by default: `esbuild` and `msw` were
  reported as "Ignored build scripts" and nothing needed them (build, tests and
  `supabase --version` all worked); `supabase` was not in the ignored list and
  its binary runs. Approve one with `pnpm approve-builds` only if a
  later story shows it is needed.
- **Supabase CLI — CAL-001:** `pnpm exec supabase --version` prints `2.120.0`;
  `pnpm exec supabase init` ran without Docker.
- **Stale PATH after the Deno install — measured CAL-001:** shells started
  before winget installed Deno (including the agent session that ran CAL-001)
  do not find `deno`. Every Deno command there was run with
  `export PATH="/c/Users/ryanc/AppData/Local/Microsoft/WinGet/Packages/DenoLand.Deno_Microsoft.Winget.Source_8wekyb3d8bbwe:$PATH"`
  prefixed. `project.conf` says plain `deno …`, which a fresh terminal finds.
  If `doctor.sh` reports `deno` MISSING, open a new terminal before anything else.
- **Docker and Playwright Chromium — CAL-001:** neither is installed, so the
  optional `db` and `integration` gates carry waivers in `project.conf` and
  report KNOWN, not WARN.
