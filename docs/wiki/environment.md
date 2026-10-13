# Environment — Clean Calendar

_Written 2026-10-12 by `/setup-environment` from `stack.md` and the
`node-typescript` and `supabase-deno` stack profiles. `project.conf` has no
gate commands yet; the commands below are the ones `stack.md` intends, and
the bootstrap story (CAL-001) confirms or corrects them._

## Required

| Tool | Expected | Needed by |
|---|---|---|
| git, bash | any recent (Git for Windows) | the harness: hooks, `gates.sh`, `doctor.sh` |
| Node.js | 22.x LTS or later (`stack.md` pins 22.20.0; see Notes) | Vite build, Vitest `unit` + coverage gate, Biome `lint`/`format`, `tsc` `types` gate |
| pnpm | 10.x, via corepack and the `packageManager` field | installs and runs every Node gate |
| Deno | 2.x (`stack.md` pins 2.5.x) | `deno check` / `deno test` over `supabase/functions/**` — part of the `types` and `unit` gates |
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
| `node --version` | `v22.x` or later |
| `pnpm --version` (inside the repo, after CAL-001) | `10.x` |
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
