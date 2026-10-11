# manga-translator's harness changes, triaged before its refresh

## Scope

Issue #97 (field report from manga-translator, measured at its `main` `0b12a57`,
harness snapshot `2026-09-11`) against agentic-dev-harness release 66
(`ea0fba0`). `refresh-harness.sh --dry-run` from manga-translator lists 21
`LOCAL` files; this audit decides which of the downstream changes behind them
are generic harness fixes to port before that refresh, and which of the five
problems the report raises (A-E) to fix. Read-only triage, four reviewers, each
reading the downstream commit and testing behaviour against upstream in a
scratch tree. Downstream commits are in `ryanczhang7/manga-translator`.

## Progress

Updated 2026-10-06: every port decided below has merged (releases 67-81). Each port
was one story, driven by `/complete-story`, planned only when the one before it
closed, because every port changed the code the next one built on.

| Group (order in "Decided") | Downstream change | Story | State |
|---|---|---|---|
| 1 Speed | MT-040 manifest parsing with builtins | HARNESS-024 | **done**, #100, release 67 |
| 2 Speed | MT-041 + R-1 phase-guard spawns | HARNESS-025 | **done**, #101, release 68 |
| 3 Gate correctness | MT-043 `--audit` counts; MT-032 F-2 branch refusal | HARNESS-026 | **done**, #102, release 69 |
| 3 Gate correctness | MT-046 kept `.failed.log` | HARNESS-027 | **done**, #103, release 70 |
| 3 Gate correctness | MT-037 `skipped-when` | HARNESS-028 | **done**, #105, release 71 |
| 4 Mutation safety | c7bd4ce cleanup; finding E count (+ the PIPE void-probe and `\| head` hang found in triage) | HARNESS-029 | **done**, #106, release 72 |
| 4 Mutation safety | a0b43a2 + MT-047 `.active`, `--check`, gates refuse | HARNESS-030 | **done**, #107, release 73 |
| 5 Phase lock | MT-034 `classify()` bare-path retry | HARNESS-031 | **done**, #108, release 74 |
| 6 Process | A: GATES -> REVIEW runs `ci-local.sh`/full selftest | HARNESS-032 | **done**, #109, release 75 |
| 6 Process | B: check-boundaries 3d baseline at the last committed PLANNED | HARNESS-033 | **done**, #110, release 76 |
| 6 Process | C: run lock | HARNESS-034 | **done**, #111, release 77 |
| 6 Process | MT-042: opt-in `SELFTEST_JOBS` | HARNESS-036 | **done**, #116, release 80 |
| 6 Process | D: 3h/3g messages name the fenced-block rule | HARNESS-037 | **done**, #117, release 81 |
| - | Refresh manga-translator from the release that carries them (82) | manga-translator#71 | **done**, merged 2026-10-06; HARNESS-038 (release 82) fixed two upstream premises its Windows CI caught |

**Closed 2026-10-06:** manga-translator was refreshed to release 82 in its #71 (merged),
with its FULL selftest and its Windows CI green, and issue #97 was closed. Lessons the
stories relied on are in each story's `## Notes`. The main ones:
- a Linux-only awk difference passed every local run (HARNESS-025);
- `mutate.sh` takes one expression;
- run deferred verifications detached (`nohup`), so a tool limit cannot kill a
  mutation mid-run (HARNESS-024).
- story ids can collide when two sessions cut stories at once: HARNESS-036 was
  first numbered HARNESS-035 (see its `## Notes`).

## Decided

**Do not port** (already upstream, or project content):

- **MT-031** (2db2866, operand parsing) and **MT-033** (5950998, `mv` judges its
  source): landed by HARNESS-010. Do not copy downstream's `lib.sh` over
  upstream's - it would reopen HARNESS-010's here-string and unknown-phase fixes.
  Downstream's needles expect `tests` where upstream prints `tests/`; text only.
- **MT-039** (d9c9844, suite floors): upstream has it, plus `project-floors.conf`
  (HARNESS-020/021), which downstream lacks.
- **MT-032 F-1 and F-3**: ported in 334a52b (release 48) and complete.
- **9b45911** and MT-037's `REAL_CONF` / `real_conf_value floor integration`
  block: pin manga-translator's own `project.conf` values in an upstream-owned
  suite. Never port an assertion about a project's real manifest values.
- **MT-001**'s stack-profiles `SKILL.md` row (`python-uv-pyside6`): project
  content. (The `task.sh` diff the report attributed to MT-001 is MT-040's.)

**Port, as stories, in this order** - speed first, because every later story's
verification runs through the scripts it speeds up:

1. **MT-040** (d668336): manifest parsing with bash builtins (`trim`, `field`,
   `rest`) instead of a `sed`/`cut` process per field, in `gates.sh`,
   `doctor.sh`, `task.sh`. Upstream needs its own synthetic manifest fixture and
   goldens captured from the *current* scripts before the change; downstream's
   fixture is manga-translator's manifest.
2. **MT-041 + R-1** (73ae959, 5f5ff6d): halve the processes one phase-guard
   invocation spawns, and the spawn instrument `.claude/tests/_spawns.sh`.
   Re-baseline the limit against upstream (46 measured), do not copy 27.
3. **Gate correctness**:
   - **MT-043** (b13e206): `--audit` counts only *required* gates without
     evidence.
   - **MT-032 F-2** (5760086): `gates.sh` refuses to record into a story from a
     checkout on a different branch. Upstream's `gate-reminder.sh:72` already
     claims it does, so today that message is false.
   - **MT-046** (e5241a0): a failing gate's log survives the passing re-run as
     `<id>.failed.log` (new `.claude/state` row).
   - **MT-037** (5a51681): `skipped-when` - a gate that skipped its work is not
     PASS. The detection must use the awk matcher (95a31c5), not
     `clean_log | grep -Eq`, which `check-sigpipe.sh` refuses.
4. **Mutation safety**:
   - **c7bd4ce**: `mutate.sh` cleans up `.new` and `.bak` on every exit path,
     keeping b38f5b3's `PIPE` handling.
   - **a0b43a2 + MT-047** (43bad7c): `.active` sentinel, `mutate.sh --check`, and
     `gates.sh` refusing to run behind a stranded mutation - placed before any
     gate runs (MT-047's placement, not a0b43a2's).
   - **Finding E**: the "N line(s) changed" count compares by line number, so an
     insertion counts every later line. Count with `diff`.
5. **MT-034** (f10d7e0): `classify()` retries a bare path with a trailing `/`,
   so any project rule `X/**` covers bare `X`. HARNESS-011's per-rule twins only
   cover the built-in directories.
6. **Process**:
   - **A**: GATES -> REVIEW runs `bash scripts/ci-local.sh` (or at least the
     full selftest), and the commands' `allowed-tools` permit it.
   - **B**: check-boundaries 3d freezes criteria against the base branch in
     every phase, contradicting law 6 and `advance-story.md`. Fix the *check*:
     baseline the criteria at the story's last committed PLANNED state in the
     branch, else the base.
   - **C + MT-042** (053c58e): a run lock so `selftest.sh` and `gates.sh` cannot
     run on top of each other (stale-lock reclaim by pid), then opt-in
     concurrent suites (`SELFTEST_JOBS`, default 1 locally) with per-run buffers.
   - **D**: the 3h/3g messages say a result counts only as a fenced or
     four-space-indented block.

Then refresh manga-translator from the release that carries them.

## Evidence

- **MT-040 speed.** `bash scripts/gates.sh --list` on upstream's 283-line
  `project.conf`: 5m24s and 6m22s as shipped; 5.7s with the downstream helpers
  spliced into a scratch copy; outputs byte-identical (`cmp`). One machine
  (this Windows/MSYS host), two runs. `--audit` not timed. Downstream measured
  1,672 -> 6 processes for `--list` on its 629-line manifest.
- **MT-041.** manga-translator's `_spawns.sh` counts 46 spawns upstream for one
  guard call on `echo hi > src/main.ts`. Sites: `lib.sh` `tr` calls for quotes,
  backslashes, whitespace and case, and two `git check-ignore` calls in
  `is_ignored`.
- **MT-034 gap.** With `test | fixtures/**` added to a fixture `paths.conf`:
  upstream lets GREEN `rm -rf fixtures` through, and blocks it in RED as
  `source`. manga-translator's hook blocks it in GREEN and allows it in RED.
  manga-translator's own `paths.conf:107` is that rule.
- **MT-043.** A fixture with a required `unit` gate (with evidence) and an
  optional `mutation` gate (without): upstream `--audit` printed `1 required
  gate(s) have no evidence line`.
- **MT-032 F-2.** On `main`, with the story declaring `branch: story/T-1-x`,
  upstream `gates.sh` printed `recorded in docs/backlog/stories/T-1.md`.
- **Finding E.** A 40-line file, `mutate.sh f.txt '2s/$/\ninserted/' -- true`,
  reported `39 line(s) changed`; `5d` reported 35; `$d` reported 0. Cause:
  `scripts/mutate.sh` compares old and new files by line number.
- **Finding B.** `check-boundaries.sh` 3d (comment near line 301) compares with
  the base "whatever phase the edit was made in"; its own failure message says
  criteria freeze "once a story leaves PLANNED".
- **Finding C.** Today (2026-10-02) a full upstream selftest stalled past 60 min
  with an orphaned selftest alongside, and passed alone in 6,135 s. CI runs it in
  about 2 minutes.

## What would have to be true for this to be wrong

- The MT-040 speedup could be specific to MSYS fork cost. On Linux CI it should
  be smaller but cannot be negative, since the output is byte-identical.
- Downstream's suites may be write-isolated (MT-042's survey). That is the
  premise of concurrent selftest, and it holds only until a suite writes shared
  state. The lock in item 6 is what makes two *runs* safe.
- Finding B's fix assumes the committed frontmatter's phase can be trusted
  per commit. A branch that flips back to PLANNED after RED must not move the
  baseline.

## What was not checked

- The downstream `phase-guard` baseline run was stopped partway (too slow), so
  the "0 failures downstream" claim rests on `lib` and on the per-section results.
- `gates.sh --audit` timing and equivalence under MT-040.
- An `mutate.sh ... | head -1` hang seen once while reproducing finding E
  (Git Bash, stuck in the preview pipeline before the file was touched). Not
  diagnosed; run it again inside the mutation-safety story.
- Whether a branch-mismatch refusal (F-2) should exit 1, as HARNESS-014's
  `REFUSED` does, or keep the exit status, as downstream does. The story decides.
