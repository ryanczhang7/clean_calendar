---
id: HARNESS-036
title: Opt-in concurrent self-test suites
slug: opt-in-concurrent-self-test-suites
epic: 
type: feature
status: done
phase: DONE
branch: story/HARNESS-036-opt-in-concurrent-self-test-suites
depends_on: [HARNESS-034]      # story ids; phase.sh refuses to start this story until they are DONE
touches: [scripts/selftest.sh, .claude/tests/selftest.test.sh, .claude/tests/floors.conf, .claude/state/README.md]         # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

<!-- Why this story exists. Link the epic and any wiki pages that constrain it.
     Name the REQUIRED gate that would fail if this story's artifact broke. If
     only an optional gate can, put it in required_gates above before RED:
     every required gate once passed over a story none of them exercised. -->

This story is the second half of finding C + MT-042, group 6 ("Process"), in
`docs/wiki/audits/manga-translator-port-2026-10-02.md` (GitHub issue #97).
HARNESS-034 (release 77, #111) built the first half, the run lock. The audit's
`## Decided` item 6 C is settled and is not reopened here: **"then opt-in
concurrent suites (`SELFTEST_JOBS`, default 1 locally) with per-run
buffers."** HARNESS-034's `## Out of scope` recorded what this follow-up must
honour: default **1** locally (downstream `053c58e` defaults to 4, not to be
copied), output buffers keyed **per run** (downstream used one shared
`.claude/state/selftest/` per tree), and a raised `selftest` floor.

**Why opt-in, and why it is worth having at all.** A full self-test takes
25-70 minutes on this Windows host (6,135 s on 2026-10-02, alone) and about 31 s
to 2 minutes on `ubuntu-latest`. It is spawn-bound, and finding C is what
happens when two spawn-heavy runs share a Windows machine: a hang past 30
minutes, `E_OUTOFMEMORY` in another case. So concurrency is for the person who
chooses it on a machine they know; the default stays one suite at a time, which
is what every run does today, and CI is not changed (decision in `## Notes`).

**Downstream is a reference, not a source.** `053c58e` in manga-translator
(read at PLANNED: `git -C /d/manga-translator show 053c58e`, and its MT-042
story) is a 241-line rewrite of the runner: one concurrent path for every run,
default 4, a shared buffer directory, largest-file-first start order and a
`SERIAL_SUITES` hatch. This story takes its verified mechanism - `kill -0`
polling plus `wait <pid>` per job, because bash 3.2 has no `wait -n` - and its
two classic failure modes as tests (a lost exit status, completion-order
output). It does not take the default, the buffer path, the single path for
all runs, or the hatch (`## Out of scope`).

**Verified at PLANNED against this tree (release 77, `c9260a7`):**

- **How `scripts/selftest.sh` runs today.** `:63` `ONLY="${1:-}"`. `:181-184`
  load the floors files; `:214-221` build the suite list in glob order;
  `:226-259` audit floors and exit 1 with `Nothing was run.` before anything
  runs. `:261-275` is HARNESS-034's lock block: source `run-lock.sh` (`:271`),
  `trap run_lock_release EXIT` (`:272`), INT -> 130 (`:273`), TERM -> 143
  (`:274`), `run_lock_acquire ... || exit 2` (`:275`). `:277` `# --- run ---`.
  `:279-322` is one sequential loop: header `printf '\n=== %s ===\n'` (`:283`),
  `out="$(bash "$suite" 2>&1)"; rc=$?` (`:288`), `printf '%s\n' "$out"`
  (`:289`), then the per-suite verdict (`:291-321`): rc, the floor read from
  `$out` by `executed_count` (`:304`), the `FAIL ... printed no summary line`
  and `FAIL ... below the floor` lines to stdout, the single-suite `WARNING`
  lines to stderr. `:324-327` `No suites matched` exit 1; `:329-345` the floors
  line and `N harness suite(s) passed.` / `F of N harness suite(s) FAILED.`
  (exit 1). Everything a suite prints, stderr included, reaches selftest's
  stdout through `$out`; `$(...)` strips its trailing newlines.
- **Nothing pins `selftest.sh` line numbers** (`grep 'selftest\.sh:[0-9]'
  .claude/tests/*.sh` is empty), and this story does not touch `gates.sh`, so
  `sigpipe.test.sh`'s pin on `scripts/gates.sh:74` cannot move.
- **The primitives, measured on both platforms at PLANNED** (scratch scripts,
  not committed):
  - MSYS Git Bash 5.3.15 and WSL Ubuntu bash 5.2.21: a background job polled
    with `kill -0` until gone, then `wait <pid>`, returns that job's own status
    (`exit 7` -> `rc=7` on both). `wait -n` exists in both, but bash 3.2 (macOS
    `/bin/bash`) lacks it, so it is not used.
  - Both: a script with two background jobs, a `sleep` poll loop,
    `trap 'exit 143' TERM` and an `EXIT` trap that `wait`s each job, sent TERM:
    exits 143, and both jobs ran to completion before the EXIT trap finished.
    That is the drain C-4 relies on.
- **Write isolation of the real suites, surveyed.** Every suite builds its own
  `mktemp -d` fixture (`make_fixture`, `_lib.sh:81-116`, or its own `mktemp`).
  Every `$REPO_ROOT` reference is a read: sourcing `lib.sh`, reading scripts,
  the README and `settings.json`, `git check-ignore`, `ci-local.sh --dry-run`
  (`ci-local.test.sh:25`), `classify.sh --list` (`sigpipe.test.sh:113`).
  Real scripts that write are run only from fixture copies: `new-story.sh`
  (`new-story.test.sh:20-24`), `refresh-harness.sh` run with `cd "$PROJ"`
  (`refresh.test.sh:90`), and the hooks with `CLAUDE_PROJECT_DIR` pointed at
  the fixture (`_lib.sh:181`, `gate-reminder.test.sh:51`) - `phase-guard.sh`
  writes its declined log to `$HARNESS_ROOT` (`phase-guard.sh:62,81`), which is
  `CLAUDE_PROJECT_DIR` (`lib.sh:10`). `mutate.test.sh:126,680`'s relative
  `.claude/state/mutations/*.bak` runs inside `mutate.sh`'s `( cd "$ROOT" ...)`
  where `ROOT` is the fixture's. `run-lock.test.sh:80-101`'s `$REPO_ROOT`
  writes are inside heredoc suite bodies written into the fixture, where
  `REPO_ROOT` resolves to the fixture. `worktree.test.sh` and `plan.test.sh`
  add worktrees to fixture repositories only.
  **Measured as well as read** - see `## Notes`, "Isolation probe", for the
  result of running every suite concurrently in this worktree and diffing the
  tree before and after.
- **Nested runs under HARNESS-034's lock.** `run_lock_acquire` exports
  `HARNESS_RUN_LOCK` and `HARNESS_RUN_LOCK_PID` (selftest.sh's `$$`). A suite
  started in the background inherits them exactly as a foreground one does,
  and `$$` does not change in a background job. Fixture runs compare the
  marker path with their own lock path and take their own lock (HARNESS-034
  AC-5), so nothing about the lock changes. `run_lock_release` returns at once
  in a subshell (`run-lock.sh:146`, `${BASHPID:-$$}` guard), so a job's subshell
  cannot release the parent's lock. What concurrency DOES change is the exit
  path: today `trap run_lock_release EXIT` releases at exit, which is correct
  only because no suite can still be running then. With background suites the
  release has to come after they are drained (C-4).
- **CI and `ci-local.sh`.** `.github/workflows/gates.yml:72` runs
  `bash scripts/selftest.sh`; `:104` the colour-forced re-run.
  `scripts/ci-local.sh` derives its steps from the workflows' `run:` lines and
  `eval`s them, and `ci-local.test.sh` derives the expected step list from the
  same files. Neither is changed by this story, so neither derivation moves. A
  person who exports `SELFTEST_JOBS` gets it in `ci-local.sh`'s self-test steps
  too, through `eval`'s inherited environment, which is what opt-in means.
- **Shipped-script rules already enforced** that bear on GREEN:
  `lib.test.sh:318-319` - no shipped script uses `$TMPDIR` or `mktemp`, so the
  buffers go under `.claude/state`; `lib.test.sh:266-270` - no `${var,,}`, no
  GNU `sed -i` in `scripts/*.sh`; `check-sigpipe.sh` and `check-grep-count.sh`
  scan `selftest.sh`.

**The required gate that fails if this breaks:** `selftest` (the CI step
`bash scripts/selftest.sh`), through `selftest.test.sh`. `project.conf` is
unbootstrapped upstream; no optional gate is involved and `required_gates`
stays empty.

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC.
     An AC that names a statistic, a metric or a threshold names a NEGATIVE
     CONTROL too: the deliberately broken input the metric must reject, and
     roughly what it should score. A criterion can be perfectly testable and
     still be blind to the defect it exists to catch, and that is more
     dangerous than a vague one - it survives review and goes green. -->

Every criterion except AC-6's real-tree facts is observed in a throwaway
fixture built by `make_project_fixture`, with the real `_lib.sh` copied in and
synthetic suites written by the test, exactly as `selftest.test.sh` does today.
"Holds" means a suite blocks on a file the test creates (bounded, so a defect
cannot hang the suite), so ordering is a state the test controls rather than a
race it hopes to win. Every case states `SELFTEST_JOBS` explicitly - set, empty,
or removed with `env -u` - and none depends on the caller's environment.

- **AC-1 (the default is unchanged)** — Given a fixture of at least four
  suites, when `bash scripts/selftest.sh` runs with `SELFTEST_JOBS` unset, set
  empty, and set to `1`, then the three runs' stdout, stderr and exit status are
  identical to each other and byte-identical to the output the release-77
  `selftest.sh` produced on the same fixture (captured in RED and held in the
  suite as a literal); no two suites are ever alive at once (each suite records
  which others are alive when it starts); and no `.claude/state/selftest.*`
  entry exists during the run (a suite lists `.claude/state` while it runs) or
  after it. *Control:* the same fixture with `SELFTEST_JOBS=3` has suites alive
  together (AC-3) and a buffer directory during the run (AC-5).
- **AC-2 (concurrent output is the serial output)** — Given a fixture whose
  first suite in glob order finishes **last**, in which one suite exits
  non-zero while meeting its floor (neither first nor last in glob order, nor
  first or last to finish), one exits 0 below its floor, one prints no summary
  line, and one writes to stderr and ends its output with blank lines, when it
  runs with `SELFTEST_JOBS=1` and with `SELFTEST_JOBS=3`, then the two runs'
  stdout is byte-identical, their stderr is identical, and both exit **1** with
  `3 of <N> harness suite(s) FAILED.` as the last line. The same holds for an
  all-passing fixture (both exit 0, identical `assertion floors: all ...` and
  `<N> harness suite(s) passed.` lines), for `SELFTEST_JOBS=3 bash
  scripts/selftest.sh <one suite>` against `SELFTEST_JOBS=1` (exactly one suite
  runs), and for `SELFTEST_JOBS=3 bash scripts/selftest.sh nosuchsuite` (the
  shipped `No suites matched 'nosuchsuite'. ...` line, exit 1). And during a
  `SELFTEST_JOBS=3` run, the first suite's `=== <name> ===` block is already on
  stdout while a later suite is still held. *Control:* the run's markers show
  the suites finished in an order other than glob order, so the identity is not
  bought by running them one at a time.
- **AC-3 (bounded, and a free slot is refilled at once)** — With
  `SELFTEST_JOBS=2` over four held suites, the largest number of suites alive at
  once is exactly **2**; with `SELFTEST_JOBS=3` over five, exactly **3**; with
  `SELFTEST_JOBS=10` over four, exactly **4**. And given `SELFTEST_JOBS=2` and
  four suites where the first in glob order holds until the **last** suite in
  glob order has started, the run completes and exits 0 - which a runner that
  waits on its oldest job instead of any job cannot do (it would wait until the
  hold's bound expires, and the suite fails). *Control:* the same fixture at
  `SELFTEST_JOBS=1` exits 1, the first suite reporting that its hold timed out -
  showing the hold really does need a second slot to clear.
- **AC-4 (a bad value is refused before anything runs)** — For each of
  `SELFTEST_JOBS` = `0`, `00`, `-1`, `abc`, `1.5`, ` 2` and `2x`, both
  `bash scripts/selftest.sh` and `bash scripts/selftest.sh <suite>` exit **2**,
  print on stderr exactly the one C-3 line naming that value, print nothing on
  stdout, run no suite (its marker is absent), and leave no
  `.claude/state/run.lock` and no `.claude/state/selftest.*` behind. The refusal
  happens even when `floors.conf` is also malformed (the value is checked
  first). *Control:* `SELFTEST_JOBS=10` (more than the suites) is accepted and
  passes.
- **AC-5 (per-run buffers, the lock held to the end, every exit cleans)** —
  During a `SELFTEST_JOBS=3` run, a suite observes the buffer directory
  `.claude/state/selftest.<pid>/`, where `<pid>` is the pid of the
  `selftest.sh` process (the test backgrounds the script itself, so `$!` is
  it), and the suite that finishes last still observes `.claude/state/run.lock`
  recording that pid. After the run exits 0, after it exits 1 (a failing
  suite), and after it is sent TERM while two suites are held and a third is
  queued, no `.claude/state/selftest.*` entry and no `run.lock` or `run.lock.*`
  remains. On TERM the run exits **143**, is still alive one second after the
  signal while its suites are held, both held suites write their `finished`
  marker before the run exits (they are let finish, not orphaned), and the
  queued suite never starts.
- **AC-6 (state, suite and portability hygiene)** — `.claude/state/README.md`
  has a row for `selftest.<pid>/*.out`, `yes` in the `Hand-editable` column,
  and `bash scripts/selftest.sh settings` passes. `git check-ignore -q
  --no-index .claude/state/selftest.12345/gates.out` exits 0 in this
  repository. `scripts/selftest.sh` defines C-2's `suite_status` on exactly one
  line, as written there; its code lines (not comments) contain none of
  `wait -n`, `wait -p`, `mapfile`, `readarray`, `coproc`, `declare -A`,
  `local -A` or `typeset -A`. The `selftest` floor in `floors.conf` and its
  row in `selftest.test.sh`'s `COUNTS` both equal the suite's total assertion
  count at the end of RED. `bash scripts/check-sigpipe.sh` and
  `bash scripts/check-grep-count.sh` stay clean over the tree, and a full
  `bash scripts/selftest.sh` passes.

## Contract

<!-- Written by the Lead PO BEFORE RED, and AMENDABLE BY RED IN PLACE with a
     reason - GREEN then builds what the amended block says. This is where "RED
     tested one shape and GREEN built another" is prevented, and it is not the
     acceptance criteria: the criteria are frozen and change only through
     ## Amendments; this is a working agreement RED is expected to sharpen.
     One block per thing the story touches:
       * the files it WRITES, on one line at column 0 that starts
         `**Writes:**`, each path backticked and repository-relative:
           **Writes:** `src/core/world.ts`, `tests/world.test.ts`
         `bash scripts/plan.sh conflicts` compares it with `touches:` and prints
         DRIFT for a written file `touches:` does not cover. Without the line
         there is no DRIFT at all, and files the prose merely cites never count
       * module paths and exported names, exactly
       * exact signatures, and the types the assertions will destructure
       * THE SEMANTICS BEHIND EACH NUMBER - not clamp(latitude) but "latitude
         clamps at +/-85, and dragging DOWN brings the north into view". One
         sentence per number settles a sign error in one line
       * the accessible markup for anything user-facing: roles, labels, what is
         a sibling of what
       * the oracle partition of the criteria (settled / oracle-free /
         mechanical - see story-authoring)
       * baseline measurements the story may read out rather than re-derive,
         each with what it was measured on
       * TEST-ONLY DEPENDENCIES this story is likely to need, by name. RED
         may add them itself, but only inside the dev block - so a library
         production will ALSO use is a GREEN change and is better decided
         here than discovered mid-phase. Where the ecosystem has no dev
         block at all (go.mod, requirements.txt, *.csproj), RED cannot
         declare one and the phase round trip is yours to plan for
       * FOR EVERY EXISTING EXPORT WHOSE SIGNATURE THIS STORY CHANGES: every
         caller, source and test, grep-listed here before dispatch. RED cannot
         find these itself - the old signature still exists during RED, so a
         caller of it still compiles and is absent from RED's typecheck. One
         such file went missing and took 25 tests with it, silently, at GREEN. -->

**Writes:** `scripts/selftest.sh`, `.claude/tests/selftest.test.sh`, `.claude/tests/floors.conf`, `.claude/state/README.md`

**RED may amend any block below in place, with a reason. GREEN builds what the
amended block says.**

**The phase lock enforces nothing here.** `scripts/*`, `.claude/tests/*` and
`.claude/state/README.md` all classify as `harness`, which every phase permits
(as in HARNESS-030 to -034). The split is held by discipline:

- **RED** writes only `.claude/tests/selftest.test.sh` (new cases, and the
  `selftest` row of `COUNTS`) and the `selftest` line of
  `.claude/tests/floors.conf`.
- **GREEN** writes `scripts/selftest.sh` and `.claude/state/README.md`.

Not written by anyone in this story: `scripts/gates.sh`, `scripts/run-lock.sh`,
`scripts/ci-local.sh`, `.github/workflows/*`, `.gitignore` (its
`.claude/state/*` already covers the buffers; AC-6 asserts it), `CLAUDE.md`,
the command files.

### C-1 Two paths, and the default takes the one that exists today

- **`SELFTEST_JOBS` unset, empty or `1`, or a run of at most one suite** (a
  named suite, or a tree with one): the existing sequential loop, unchanged in
  behaviour - capture with `out="$(bash "$suite" 2>&1)"; rc=$?`, print, judge.
  It creates nothing new, starts nothing in the background, and prints what
  release 77 prints byte for byte (AC-1).
- **`SELFTEST_JOBS` of 2 or more over two or more suites:** the concurrent path
  (C-2).
- **One verdict, shared.** The per-suite block of today's loop - header, the
  printed `$out`, rc, the floor read and its `FAIL` lines, the counters -
  becomes one function both paths call in glob order, so the two cannot drift.
  Name it `report_suite <name> <rc>` with the suite's output in the global
  `$out` (GREEN may choose the parameter passing; the name is not pinned by a
  test). The `WARNING: no floor line` path is reachable only on a single-suite
  run, which is always the sequential path.

### C-2 The concurrent path

- **Bounded.** At most `SELFTEST_JOBS` suites alive at once (AC-3). No upper
  cap: a value above the number of suites runs them all at once.
- **Work-conserving.** A slot is refilled when **any** running suite exits, not
  the oldest. No `wait -n` (bash 3.2): poll the running pids with `kill -0`,
  and collect a finished one's status with `wait <pid>`, which both platforms
  return correctly after the job has exited (measured, `## Context`). Each
  `sleep` in the poll is a fork, so back off while nothing changes (downstream
  went 0.1 s -> 2 s and reset on any exit); the interval is GREEN's choice.
- **Each suite's status is collected by its own pid, on exactly this line,
  once in the file:**

  ```
  suite_status() { wait "$1"; }
  ```

  called as `suite_status "$pid"; rc=$?`. One line, exactly, because DV-1's
  single `sed` expression targets it and AC-6 pins it. A `wait` that reports a
  pid it no longer knows returns 127, which counts as a failure - fail closed.
- **Start order is free; print order is not.** Suites may start in glob order
  or largest file first (downstream measured glob order leaving its longest
  suite ~108 s late); no test pins it, and DV-2 records what GREEN chose.
  Printing is in **glob order**, each suite's block contiguous, and a suite's
  block is printed as soon as it and every suite before it in glob order have
  finished (AC-2), so a 25-70 minute run is not silent until its end.
- **The buffer, per suite:** `bash "$suite" > "$BUF/<name>.out" 2>&1 &`, the
  redirect made before the suite's first line runs. Read back into `$out` with
  trailing newlines stripped exactly as `$(...)` strips them (a suite whose
  output ends in blank lines is in AC-2 for this reason; `$(cat "$buf")` is the
  simple way and costs one fork per suite on a full run only).
- **`VERBOSE`** reaches each suite through the environment, as today.
- No pipeline whose left side can be cut off by the right under `pipefail`
  (`check-sigpipe.sh`), no `grep -c ... || echo 0` (`check-grep-count.sh`).

### C-3 `SELFTEST_JOBS` and its refusal

Read once, **before anything else the script does** - immediately after
`ONLY="${1:-}"` (`:63`), before the floors files are loaded - so a bad value is
refused before the floors audit, before the lock, before any suite (AC-4).
Valid: unset, empty (both mean 1), or digits matching `[1-9][0-9]*`. Anything
else - `0`, `00`, leading zeros such as `04`, a sign, a decimal point,
whitespace, letters - is refused, on stderr, with exit **2** (the script's
"nothing ran" status since HARNESS-034, and `gates.sh:89`'s for a bad option),
with exactly this one line, `<value>` being the variable's value verbatim:

```
selftest: SELFTEST_JOBS must be a whole number of suites to run at once, 1 or more; got '<value>'. Nothing was run.
```

### C-4 Buffers, keyed per run, and one exit path

- **Where:** `$ROOT/.claude/state/selftest.$$/`, `$$` being this
  `selftest.sh` process - the pid the lock records. Created only on the
  concurrent path, **after** the lock is taken (a refused run creates nothing),
  with `mkdir -p`. Never `$TMPDIR` or `mktemp` (`lib.test.sh:318-319`).
  Keyed per run rather than downstream's shared `.claude/state/selftest/`,
  because two `selftest.sh` processes can legitimately be alive in one tree:
  HARNESS-034's C-4 lets a run nested under the lock holder through.
  If the directory cannot be created: one line on stderr,
  `selftest: cannot create .claude/state/selftest.<pid> for the suites' output; nothing was run.`,
  exit 2. Not an AC (it needs an unwritable directory, which `chmod` cannot
  make on Windows), but it is the fail-closed direction.
- **One `EXIT` handler, replacing `trap run_lock_release EXIT` at `:272`:**
  define a function before `:271` - name it `selftest_exit` - that, in order,
  (1) `wait`s every suite still running (on a normal exit there are none),
  (2) removes `$ROOT/.claude/state/selftest.$$` if this process created it,
  (3) calls `run_lock_release`. Then `trap selftest_exit EXIT` in place of
  `:272`. The INT and TERM traps at `:273-274` stay as they are. The lock is
  therefore released only after the last suite has exited, and a second run is
  refused for as long as any suite of this one is alive (AC-5).
- **TERM and INT drain; they do not kill.** On the signal no further suite is
  started; the suites already running are waited for; the buffers are removed;
  the lock is released; exit 143 or 130. This is HARNESS-034's serial
  behaviour (a trapped TERM waits for the foreground suite) carried over to N
  suites, measured on both platforms (`## Context`). A suite that never ends
  makes TERM wait, as it does in the serial runner today; SIGKILL leaves
  orphans either way (`## Out of scope`).
- **A buffer directory left behind** means a run was killed outright. It is not
  reclaimed by the next run; the README says it is safe to delete.

### C-5 `.claude/state/README.md`

One row, after `run.lock.<pid>`, `Hand-editable` **yes** (written and removed
by a tool, safe to delete; a deny rule would block that `rm`):

```
| `selftest.<pid>/*.out` | `scripts/selftest.sh`, with `SELFTEST_JOBS` above 1 | `scripts/selftest.sh`, to print each suite in order | yes |
```

and a short paragraph under "The exhaust": a full self-test run with
`SELFTEST_JOBS` of 2 or more writes each suite's output there and prints it in
order; the directory is removed on every exit the script can still run code
on; one left behind means a run was killed outright and is safe to delete. No
`settings.json` change: `yes` rows carry no deny rules, and `settings.test.sh`
checks that both ways.

### C-6 The suite: `selftest.test.sh`

New cases appended to the existing suite (not a new suite), reusing its
fixture (`make_project_fixture` + real `_lib.sh`) and its `reset_suites` /
`floors` helpers. Synthetic suites hold on files the test creates, bounded
(60 s for "started", 120 s for a hold), and record what they see into a marker
directory: alive peers on start (`alive/<name>` created on start, removed on
finish), `finished/<name>`, a listing of `.claude/state`, the content of
`run.lock`. AC-3's "hold until the last suite has started" uses a SHORT bound
(20 s - *amended in RED from "about 10 s"*, see below), because its control at
`SELFTEST_JOBS=1` is meant to hit it; a 120 s bound there would cost the suite
two minutes on every run.
*RED amendment (2026-10-05, test-developer): 10 s -> 20 s.* With two slots, w1
holds while w2, w3 and w4 each spawn, run and are reaped one after another
through the other slot, and each reap can wait out one poll interval (C-2 lets
GREEN back off to about 2 s). On this Windows host, under DV-2's own
`SELFTEST_JOBS=4` run, three spawns plus three backed-off polls can come close
to 10 s, and a correct runner would then fail AC-3. 20 s keeps the control
cheap (it costs 20 s once per run) and leaves headroom. GREEN: keep the poll
backoff ceiling at or below about 2 s.
Two more holds the suite uses, not in the original block: a hold that waits on
OTHER suites (not on a file the test creates) also gives up after 30 s with no
other suite alive, and every hold gives up once any hold in the same run has
timed out. A serial runner can never clear such a hold, and without these each
one would cost its full 120 s in RED and in any regression. The holder for AC-5 is the script itself backgrounded after `cd`
(`bash scripts/selftest.sh &`), as `run-lock.test.sh` does, so that `$!` is the
pid in the directory name and the lock. An `EXIT` trap releases every hold and
waits every background pid.

**Every new case sets `SELFTEST_JOBS` explicitly**, including the default case
(`env -u SELFTEST_JOBS`). The existing cases are left alone and inherit the
caller's value; under DV-2's `SELFTEST_JOBS=4` run they therefore exercise the
concurrent path over every floors case, which is free coverage, not a
dependency.

AC-1's golden is captured in RED by running the release-77 `selftest.sh` (the
one in the tree at RED) on the AC-1 fixture, and pasted into the suite as a
literal; it contains only text the synthetic suites print and selftest.sh's
own lines, no paths or pids.

Comparisons are whole-output (`assert_eq` on the full stdout) or whole lines
(`grep -cxF`), never a floating substring: `harness suite(s) passed.` is a
suffix of nothing wrong, but `FAILED.` lines differ only by their counts.

**The floor.** `floors.conf`'s `selftest` line and `COUNTS`' `selftest` row
record the suite's TOTAL assertion count at the end of RED - passed plus
failed, which is what it will pass when green (HARNESS-033 and -034 did the
same), with a HARNESS-036 note at the foot of `floors.conf`.

### C-7 Oracle partition

- **Settled - read out, do not re-decide:** opt-in concurrency, the variable's
  name, default 1 locally, buffers per run (audit `## Decided` 6 C and
  HARNESS-034 `## Out of scope`); the refusal line, exit 2, the buffer path,
  `suite_status`, drain-on-TERM (this contract). The output strings
  `=== <name> ===`, `No suites matched ...`, `... harness suite(s) passed.`,
  `... FAILED.` are read out of `scripts/selftest.sh` as shipped, not reworded.
- **Mechanical - pin exactly:** every AC. Exit statuses exactly (2, not
  "non-zero"; 143). Peaks exactly (2, 3, 4), not "at most".
- **Oracle-free:** none among the ACs. DV-2's timing is a measurement with a
  recorded verdict, not a threshold.

### C-8 Callers

No existing function signature changes. The CLI gains one outcome, exit 2 with
the C-3 line, for an environment value no caller sets today. Callers of
`selftest.sh` - `ci-local.sh:181` (`if ! eval "$cmd"`), the CI steps
(`gates.yml:72,104`), `mutate.sh`'s command, and the fixture runs in
`selftest.test.sh` and `run-lock.test.sh` - treat any non-zero as failure and
need no change.

## Deferred verifications

<!-- REQUIRED when a verification this story depends on provably cannot run in
     the phase that wants it; omit the section otherwise. Written by the Lead PO
     at PLANNED, and the phase that owns it pastes the result in.
     The case this exists for: a negative control for a round trip, a threshold
     or a codec has to break the real implementation to mean anything, and in
     RED there is no implementation to break. RED naming the control and saying
     it could not run it is the honest answer; RED claiming a verification it
     did not do is the failure. One block per entry:
       * what it verifies, as a falsifiable condition - "with one field dropped
         from the encoder, AC-1's property test MUST fail"
       * why the phase that wants it cannot run it
       * THE PHASE THAT OWNS IT, declared as `Owner: GATES` (or RED, GREEN,
         REVIEW). check-boundaries.sh refuses a PR
         whose block names no phase
       * the RESULT, pasted, once that phase runs it: what was mutated, what
         failed, and that the file was restored - or the word WAIVED with the
         reason. check-boundaries.sh refuses a PR that has neither
     Schedule it into GATES rather than RED where you can: source is writable
     there, and a story that bounced back to RED mid-cycle gets its corrected
     assertions earned by the same mutation, for free. How many entries is the
     budget in rules.md, `Mutation work per story`: by default ONE
     "defect put back" entry for the story's central claim, run against the one
     suite that holds its assertion. A format or codec story may add one wrong VALUE
     mutation - a codec that is uniformly wrong round-trips through itself
     perfectly. Exhaustive earning of assertions that passed on arrival is not
     an entry here; it goes to `/audit-mutations`. -->

This story adds no rule over the tree and adds or changes no gate, so it owes
no real-tree probe and no `## Gate probes`. AC-1's cases pass on arrival in RED
by design (the default path is today's code); they are earned by the RED-time
golden capture and by DV-1's "must stay green" half, not by a separate
mutation. The budget is `rules.md`'s default: one "defect put back" entry,
DV-1. DV-2 is the measurement the story was asked for.

**DV-1 (defect put back: a concurrent run loses a suite's exit status).**
Owner: GATES. This is the classic concurrent-runner defect and the one that
makes a concurrent runner strictly worse than a slow one: it reports success
over a failing harness. C-2 pins `suite_status` to one line so that this one
expression matches it (checked at PLANNED against that exact line with Git
Bash's sed and GNU sed on Linux: both print
`suite_status() { wait "$1"; return 0; }`, and a function so mutated returns 0
for a job that exited 5). Run detached (`nohup`), so a tool limit cannot kill it
mid-mutation:

```
bash scripts/mutate.sh scripts/selftest.sh 's|suite_status() { wait "\$1"; }|suite_status() { wait "$1"; return 0; }|' -- bash scripts/selftest.sh selftest
```

The outer run is single-suite and so takes the sequential path, which never
calls `suite_status`; the fixtures copy the mutated script. **Must** fail:
AC-2's failing-fixture comparison (the `SELFTEST_JOBS=3` run exits 0 and its
last line is `<N> harness suite(s) passed.` where the serial run's is
`3 of <N> harness suite(s) FAILED.` - only the rc-only failure is lost, so the
expected wrong count is visible), and AC-5's exit-1 case if it asserts the
status. **Must stay green:** every AC-1 case and the `SELFTEST_JOBS=1` halves of
AC-2 - which is what shows the mutation hit the concurrent path's status
collection and not the runner as a whole. Record the counts. RED cannot run
this: there is no `suite_status` to mutate. Paste the `mutate.sh` output,
including its verified restore, and a green re-run of
`bash scripts/selftest.sh selftest`.

**DV-2 (the real full self-test, `SELFTEST_JOBS=1` then `SELFTEST_JOBS=4`, on
this host).** Owner: GATES, as part of GATES -> REVIEW step 1. The two runs go
**one after the other, never together** - the run lock would refuse the second
anyway, and running them together would measure contention, not the runner.
Both detached (`nohup`), in this worktree, nothing else running in it:

```
# run 1 - this IS step 1's full self-test; the variable is removed, not trusted
git status --porcelain --ignored > /tmp/h035-before-1; ls -A .claude/state > /tmp/h035-state-1
s=$(date +%s); env -u SELFTEST_JOBS bash scripts/selftest.sh > /tmp/h035-jobs1.out 2>&1; echo "rc=$? wall=$(( $(date +%s) - s ))s"
# run 2 - only after run 1 has exited
s=$(date +%s); SELFTEST_JOBS=4 bash scripts/selftest.sh > /tmp/h035-jobs4.out 2>&1; echo "rc=$? wall=$(( $(date +%s) - s ))s"
git status --porcelain --ignored > /tmp/h035-after; ls -A .claude/state > /tmp/h035-state-2
```

(Use a scratch directory with an explicit path if `/tmp` is not writable.)
Falsifiable conditions, each of which can come out either way:

1. Both runs exit 0.
2. The two runs' suite summary lines (`^[a-z-]+: [0-9]+ passed, [0-9]+ failed$`)
   are identical **in order**, as are their `assertion floors:` and
   `harness suite(s) passed.` lines. A difference is a suite that behaves
   differently beside others - a write-isolation or timing defect in the real
   suites - and is a GATES failure, not a flake to re-run away.
3. `git status --porcelain --ignored` and `ls -A .claude/state` are the same
   before run 1 and after run 2: no buffer directory, no lock, nothing written
   into the real tree.
4. **Speed, recorded with a verdict.** Paste both wall times and the ratio.
   The `selftest.sh` header's sentence about when `SELFTEST_JOBS` helps is
   written from this result: if run 2 is not faster than run 1 on this host, the
   header says so, plainly, rather than recommending it. Also record what start
   order GREEN chose (C-2).

Why beyond the default budget: every suite assertion runs over synthetic
fixture suites, so this is the only check that the 24 real suites are
write-isolated when they actually run side by side - the premise the audit's
"What would have to be true" names - and it is the measurement that decides
whether the feature is worth recommending here. Its cost is one extra full run
(the `SELFTEST_JOBS=1` run is step 1's, which GATES -> REVIEW makes anyway).
RED cannot run it: there is nothing concurrent to run.

### Results, run at GATES (2026-10-05) by the orchestrator

**DV-1, the defect put back (a concurrent run loses a suite's exit status): red as required.** `selftest: 264 passed, 4 failed`. AC-2's failing-fixture comparison went red (wrong failure count, stdout no longer byte-identical) and so did AC-5's exit-1 case; the fourth is the one-line pin, which the mutation itself changes. Every AC-1 case and every `SELFTEST_JOBS=1` half stayed green. As RED and GREEN both noted, the entry's wording "exits 0 ... `<N> harness suite(s) passed.`" does not fit this fixture: two of its six suites fail without involving an exit status, so the mutant still exits 1, with a visibly wrong count. The substance of the entry holds. Passing lines elided; restore verified; green re-run below.

```
=== mutate: scripts/selftest.sh (1 line(s) changed by s|suite_status() { wait "\$1"; }|suite_status() { wait "$1"; return 0; }|) ===
  367 - suite_status() { wait "$1"; }
  367 + suite_status() { wait "$1"; return 0; }
=== mutate: running bash scripts/selftest.sh selftest ===
    FAIL SELFTEST_JOBS=3's last line counts the same three failures
    FAIL SELFTEST_JOBS=3's stdout is byte-identical to SELFTEST_JOBS=1's
    FAIL SELFTEST_JOBS=3 with one suite exiting 1 (floor met) exits 1
    FAIL scripts/selftest.sh defines suite_status on exactly the one line DV-1 mutates
selftest: 264 passed, 4 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /d/agentic-dev-harness/.claude/worktrees/nostalgic-williams-fcf700/.claude/state/mutations/scripts_selftest.sh.20261005T233657Z.43.bak) ===
--- re-run, unmutated:
assertion floors: all 1 suite(s) met their declared floor (268 assertions executed, 268 declared).
1 harness suite(s) passed.
```

**DV-2, the real full self-test, unset then `SELFTEST_JOBS=4`, one after the other: all four conditions hold.**

1. Both exit 0: run 1 (`env -u SELFTEST_JOBS`) `rc=0 wall=1135s`; run 2 (`SELFTEST_JOBS=4`) `rc=0 wall=336s`.
2. The 26 summary lines (24 suite lines, `assertion floors:`, `harness suite(s) passed.`) are identical in order (`diff` empty).
3. `git status --porcelain --ignored` and `ls -A .claude/state` are identical before run 1 and after run 2: no buffer directory, no lock.
4. Speed: run 2 took 336 s against 1,135 s, a ratio of 0.30 (3.4 times faster), on this Windows/Git Bash host, with no other run in this worktree. Start order is suite (glob) order, as GREEN built it. The `selftest.sh` header now records this measurement (a comment-only edit at GATES); `gates.sh` and a full `SELFTEST_JOBS=4` self-test were re-run after it: `rc=0 wall=336s`, `24 harness suite(s) passed.`

```
### DV-1 23:36:57
dv1 rc=1
dv1 rerun rc=0
mutate: no stranded mutation; nothing of a previous run is in the tree.
### GATES 23:39:12
gates rc=0
### DV-2 run1 23:39:14
run1 rc=0 wall=1135s
### DV-2 run2 23:58:09
run2 rc=0 wall=336s
### ALL-DONE 00:03:45
--- run 1 last lines:
assertion floors: all 24 suite(s) met their declared floor (2715 assertions executed, 2488 declared).
24 harness suite(s) passed.
--- run 2 last lines:
assertion floors: all 24 suite(s) met their declared floor (2715 assertions executed, 2488 declared).
24 harness suite(s) passed.
```

## Amendments

<!-- Acceptance criteria are frozen once the story leaves PLANNED. If one turns
     out to be wrong or unsatisfiable, stop, put it to the product owner, and
     record the change here: which AC, what it said, what it says now, who
     approved it and why. check-boundaries.sh fails a PR whose criteria differ
     from their last committed PLANNED state (else the base branch) without an
     entry here. Omit the section if unused.
     Where the change came from a subagent's claim that the criterion was
     wrong, record the ORCHESTRATOR'S OWN reproduction of it - different
     inputs, not the subagent's code. That claim is also what an agent says
     when it wants to stop failing. -->

## Model guidance

Planned by `bash scripts/plan.sh write HARNESS-036` from `.claude/harness/models.conf`.
A PLAN, not a record: a session setting or an explicit override can beat both
this and the agent's own `model:` field, and nothing here can see which won.
The orchestrator still writes down the model each dispatch **resolved** to, by
name, below the table.

| Phase | Agent | Planned | Why |
|---|---|---|---|
| PLANNED | `lead-po` | `opus` | planning is the judgement phase: decomposition, the oracle partition, and what goes in the contract |
| RED | `test-developer` | `opus` | the lock freezes none of the paths this story names, so the contract is not an aid to the model here - it is the only enforcement there is. A weaker model against a safety net and a weaker model against nothing are different propositions |
| GREEN | `feature-developer` | `opus` | the failure mode of a weaker model here is reaching green by weakening a test, which is the one thing this harness exists to prevent |
| GATES | `feature-developer` | `opus` | same risk as GREEN, and a gate failure is where "make it stop complaining" is most tempting |
| REVIEW | `lead-po` | `opus` | reading review feedback against the contract is judgement, and a wrong call here ships |
| SCAFFOLD | `lead-po` | `opus` | source, tests and config in one indivisible derivation, with no failing test in front of any of it |

**Resolved:**

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->

- PLANNED, `lead-po`, resolved to Opus 5.5 (`claude-opus-5-5`), dispatched without a model override.
- RED, `test-developer`, resolved to Opus 5.5 (`claude-opus-5-5`), as planned; no override. Interrupted by a Claude session restart and resumed via SendMessage (same agent). Orchestrator re-ran selftest.test.sh: 179 passed, 89 failed, matching the handoff; ## Acceptance criteria byte-identical to the PLANNED commit.
- GREEN, `feature-developer`, resolved to Opus 5.5 (`claude-opus-5-5`), as planned; no override. Orchestrator read the selftest.sh diff and re-ran `selftest.sh selftest` (268/268, floor met).
- GATES: no dispatch. The orchestrator (`claude-opus-5-5`) ran DV-1, DV-2, `gates.sh`, the full selftest (DV-2 run 1 is step 1's run), and made the one comment-only header edit DV-2 condition 4 asks for.

**Oracle partition for the RED brief:** `## Contract` C-7. In short: opt-in,
the name, default 1 and per-run buffers are settled (audit `## Decided` 6 C,
HARNESS-034 `## Out of scope`); the refusal line, exit 2, the buffer path,
`suite_status` and drain-on-TERM are settled by this contract; the shipped
output strings are read out of `selftest.sh`; every AC is mechanical, pinned as
whole outputs or whole lines and exact statuses and peaks; nothing is
oracle-free.

## Out of scope

<!-- Explicit non-goals. Prevents the Feature Developer from over-building. -->

- **Changing the default, or setting `SELFTEST_JOBS` in CI.** CI runs the
  self-test in about 31 s to 2 minutes on `ubuntu-latest`, so concurrency pays
  least there, and `gates.yml` is a template every consuming project copies.
  Setting it in a workflow `run:` line would also put it into `ci-local.sh`'s
  local run (it `eval`s those lines), which is exactly the local default the
  audit decided against. No assertion pins "no `SELFTEST_JOBS` in the
  workflows" either: a consuming project may legitimately set it in its own
  CI, and an upstream suite that pins a project-owned value is issue #97's
  finding A.
- **`SERIAL_SUITES` or any per-suite opt-out.** Downstream shipped an empty
  hatch. If DV-2 shows a real suite misbehaving beside others, that is a GATES
  failure to stop on and re-plan, not a hatch to improvise.
- **A `selftest.sh` option instead of an environment variable**, and any upper
  cap on the value.
- **Reclaiming a buffer directory left by a killed run.** Documented as safe to
  delete (C-5); no sweep.
- **Orphans after SIGKILL, and killing a suite's own children on TERM.** The
  drain waits for each suite's `bash` process; a suite's fixture processes are
  its own business, as in the serial runner (HARNESS-034 `## Out of scope`).
- **Command prose.** `advance-story.md` and `complete-story.md` keep
  `bash scripts/selftest.sh` as GATES -> REVIEW step 1 (`procedure.test.sh`
  pins that text, and the `allowed-tools` prefix `Bash(bash
  scripts/selftest.sh:*)` would not match a `SELFTEST_JOBS=4 bash ...`
  invocation). `CLAUDE.md`'s command list is not edited; the variable is
  documented in `selftest.sh`'s own header, which is where `VERBOSE=1` is.
- **`gates.sh`.** Not touched; its `sigpipe.test.sh` pins (`gates.sh:74`,
  `:580`) stay where they are.
- **Group 6 D** of the audit (the 3g/3h messages). A separate story.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

<!-- Filled by the Test Developer during RED: which tests, at which level,
     and which AC each one covers. -->

**Level.** Everything is in `.claude/tests/selftest.test.sh`, appended before
its `summary` line, as C-6 asks. All of it except AC-6 is integration level: the
fixture's own copy of `scripts/selftest.sh` runs over synthetic suites in the
suite's existing `make_project_fixture` tree, which has its own lock. AC-6
reads files in the real tree. Each new case states `SELFTEST_JOBS` explicitly
(a value, `""`, or `env -u`) and sets `VERBOSE=` empty.

**The instrument.** `held <name> VAR=value...` writes a suite that sources
`.claude/tests/_held.sh` (written into the fixture; it is not a `*.test.sh`, so
`selftest.sh` does not run it). Each suite records under `mk/`: `peers/` (the
suites alive when it started, itself included; it creates `alive/<name>` first
and lists afterwards, so the largest listing is the true peak), `started/`,
`finished/`, `state/` (`ls -A .claude/state`), `buf/` (the listing of
`.claude/state/selftest.*/`), `finbefore/` (the suites already finished when it
finished), `lockend/` (`run.lock` as it finished) and `timeout/`. A suite can
hold on `mk/release/<name>`, `mk/release/all`, other suites having finished
(`WAIT_FIN`) or started (`WAIT_START`), or a count of started suites
(`WAIT_COUNT`). Every hold is bounded (120 s by default, 20 s for AC-3's
work-conserving case). A hold that waits on other suites also gives up after
30 s with no other suite alive (`LONELY`), and every hold gives up once any hold
in the run has timed out. A timed-out hold fails its suite with
`    FAIL <name>: its hold cleared before its bound`. A held() suite executes N+1
assertions, so a floor of N+1 is met. `PAD=<n>` adds comment lines so that
size-first and glob-first start orders start the same suites (C-2 leaves the
order free).

| Block (describe) | Asserts | AC |
|---|---|---|
| AC-1, unset / `""` / `1` (loop of 3, 7 each) | exit 1; stdout `cmp`-identical to the release-77 golden; stderr empty (the golden's); all 5 ran; peak exactly 1; no suite saw `selftest.*` in `.claude/state`; nothing (`selftest.*`, `run.lock*`) left | AC-1 |
| AC-1 control, `SELFTEST_JOBS=3` | peak >= 2; a suite saw `selftest.<digits>`; still exits 1 | AC-1 control (with AC-3 and AC-5) |
| AC-2 failing fixture, 1 vs 3 | both exit 1; both last lines `3 of 6 harness suite(s) FAILED.`; stdout `cmp`-identical; stderr identical; all 6 ran; **control** b1 (first in glob order) finished last; b2-exits3 finished after b3, so neither first nor last | AC-2 |
| AC-2 passing fixture, 1 vs 3 | both exit 0; stdout and stderr identical; `assertion floors: all 4 ... (12 assertions executed, 12 declared).` once in each; both end `4 harness suite(s) passed.`; **control** c1 finished last | AC-2 |
| AC-2 single suite, `c5-nofloor`, 1 vs 3 | both exit 0; stdout and stderr identical; stderr carries the WARNING (precondition); exactly one header `=== c5-nofloor ===`; one suite started | AC-2, C-1 |
| AC-2 `nosuchsuite` at 3 | exit 1; stderr is exactly the shipped `No suites matched` line; stdout empty; nothing started | AC-2 |
| AC-2 print-while-held at 3 | precondition: d2 and d3 both started and held; with both still unfinished, `=== d1-quick ===` and `d1-quick: 2 passed, 0 failed` are already in the stdout file; exits 0 once released | AC-2 (incremental printing, C-2) |
| AC-3 peaks: 2 over 4, 3 over 5, 10 over 4 | exit 0; all ran; peak exactly 2 / 3 / 4 | AC-3 |
| AC-3 work-conserving at 2 | exits 0; w1-first's hold did not time out | AC-3 |
| AC-3 control at 1 | exits 1; the line `    FAIL w1-first: its hold cleared before its bound` appears exactly once | AC-3 control |
| AC-4: `0 00 -1 abc 1.5 ' 2' 2x` by full / `h1` (14 runs, 5 each) | exit 2; stderr is exactly the C-3 line with the value verbatim; stdout empty; no suite started; no `run.lock` and no `selftest.*` left | AC-4 |
| AC-4 malformed floors.conf + `abc` | exit 2 (not 1); stderr is the C-3 line alone; stdout empty, so no floors fault printed | AC-4 |
| AC-4 control `10` over 2 | exit 0; `2 harness suite(s) passed.` | AC-4 control |
| AC-5 buffers at 3 (script backgrounded; `$!` is HP) | exit 0; all 3 suites saw `selftest.$HP`; each saw its own `<name>.out` in it (C-2); precondition: f1 finished last; f1's `lockend` pid is HP; nothing left | AC-5, C-2, C-4 |
| AC-5 exit 1 at 3 (f2 exits 1, floor met) | exit 1 exactly; nothing left | AC-5 (the DV-1 target) |
| AC-5 TERM at 2 (t1, t2 held, `FINISH_DELAY=1`; t3 queued) | precondition: t1 and t2 started; still alive 1 s after TERM; `run.lock` present while draining; exits 143; t1 and t2 `finished` present; t3 never started; nothing left | AC-5, C-4 |
| AC-6 | README `selftest.<pid>/*.out` row with `yes` (control: `run.lock.<pid>` row found by the same reader); `.claude/state/selftest.12345/gates.out` ignored (control: README.md is not); `suite_status() { wait "$1"; }` on exactly one line, and no other `suite_status()` definition; no `wait -n`/`wait -p`/`mapfile`/`readarray`/`coproc`/`declare -A`/`local -A`/`typeset -A` on code lines (control: a probe file is flagged on its code lines only) | AC-6 |
| existing COUNTS row and floors.conf | `selftest 268` in both | AC-6 (the floor) |

**AC-6 parts that are run, not asserted:** "`bash scripts/selftest.sh
settings` passes", "`check-sigpipe.sh` and `check-grep-count.sh` stay clean"
and "a full `bash scripts/selftest.sh` passes". These are commands run over
the real tree. Running them from inside this suite would nest a self-test run
under it, so they are left as commands. RED ran settings, check-sigpipe and
check-grep-count (see the handoff). The full run belongs to GATES (DV-2 run 1).

## Handoff: RED -> GREEN

<!-- Filled by the Test Developer at the end of RED. This is the ONLY channel
     to the Feature Developer, whose context is fresh. Must contain:
       * the exact command that runs the new tests
       * the failure output, and why it is the RIGHT failure
       * every file touched, and which AC each test covers
       * the EXPORT SHAPE the tests already pin: every module they import, the
         exact exported names and signatures, and the types the assertions
         destructure. Not a suggestion - a test already imports them, so a
         wrong guess is a compile error. Say what the tests do NOT constrain
         too, so it stays the implementer's choice.
       * any test that passed on arrival, and the probe or negative control
         that earns it
       * the EXPECTED VALUE of every negative control, as a table: threshold,
         candidate range, and the number the control measured. In RED the
         suite fails at import, so no assertion in it has run - the controls
         are claims until GREEN confirms them against the shipped module
       * anything discovered that changes the approach -->

**RED, 2026-10-05, test-developer (Opus 5.5, `claude-opus-5-5`, no model
override in the dispatch).** The session restarted mid-phase. The first RED run
had been killed and was re-run, not trusted.

**Command.** `bash .claude/tests/selftest.test.sh` (direct), or
`bash scripts/selftest.sh selftest` (through the runner). Both give the same
result. Each case runs its own fixture tree, which has its own run lock, so
neither takes this worktree's lock except the runner's own.

**Counts.** Before: `selftest: 100 passed, 0 failed`. RED, both commands:
`selftest: 179 passed, 89 failed` (268 executed). Through the runner it adds
`FAIL selftest  did 179 units of work, below the floor of 268 in
.claude/tests/floors.conf`. **Expected after GREEN: `selftest: 268 passed, 0
failed`.** The floor (`floors.conf`) and the `COUNTS` row are both 268.

**Failure output (RED run, verbatim headlines).** Detail lines are omitted.
AC-4's loop is shown for `'0'` only; the other six values (`00 -1 abc 1.5 ' 2'
2x`) fail the same four assertions each, 7 x 8 = 56 in all.

```
  HARNESS-036 AC-1  SELFTEST_JOBS unset, empty or 1 runs today's sequential loop, byte for byte
  HARNESS-036 AC-1  control: the same fixture at SELFTEST_JOBS=3 is concurrent
    FAIL SELFTEST_JOBS=3: suites were alive together (peak above 1)
    FAIL SELFTEST_JOBS=3: a suite saw a .claude/state/selftest.<pid> buffer directory while it ran
  HARNESS-036 AC-2  concurrent output is the serial output, failures included
    FAIL SELFTEST_JOBS=3's last line counts the same three failures
    FAIL SELFTEST_JOBS=3's stdout is byte-identical to SELFTEST_JOBS=1's
    FAIL control: at SELFTEST_JOBS=3 the first suite in glob order finished last
    FAIL control: and b2-exits3 was neither the first nor the last to finish
  HARNESS-036 AC-2  an all-passing fixture: the same totals, the same verdict
    FAIL SELFTEST_JOBS=3 over the passing fixture exits 0
    FAIL SELFTEST_JOBS=3's stdout is byte-identical to SELFTEST_JOBS=1's
    FAIL SELFTEST_JOBS=3 prints the all-met floors line once
    FAIL SELFTEST_JOBS=3 ends with 4 harness suite(s) passed.
    FAIL control: at SELFTEST_JOBS=3 the first suite in glob order finished last
  HARNESS-036 AC-2  one named suite at SELFTEST_JOBS=3 is the same single-suite run
  HARNESS-036 AC-2  a name that matches nothing at SELFTEST_JOBS=3
  HARNESS-036 AC-2  a finished suite is printed while a later one is still held
    FAIL precondition: at SELFTEST_JOBS=3, d2-held and d3-held are both running and held
    FAIL while both later suites are concurrently held, d1-quick's whole block is already on stdout
  HARNESS-036 AC-3  at most SELFTEST_JOBS suites alive at once, and exactly that many
    FAIL SELFTEST_JOBS=2 over 4 held suites exits 0
    FAIL SELFTEST_JOBS=2 over 4: the most suites alive at once is exactly 2
    FAIL SELFTEST_JOBS=3 over 5 held suites exits 0
    FAIL SELFTEST_JOBS=3 over 5: the most suites alive at once is exactly 3
    FAIL SELFTEST_JOBS=10 over 4 held suites exits 0
    FAIL SELFTEST_JOBS=10 over 4: the most suites alive at once is exactly 4
  HARNESS-036 AC-3  a free slot is refilled when ANY suite exits, not the oldest
    FAIL SELFTEST_JOBS=2: the run completes and exits 0
    FAIL SELFTEST_JOBS=2: w1-first's hold cleared, it did not time out
  HARNESS-036 AC-4  a bad SELFTEST_JOBS is refused before anything runs
    FAIL SELFTEST_JOBS='0', full run: exits 2
    FAIL SELFTEST_JOBS='0', full run: stderr is exactly the one refusal line
    FAIL SELFTEST_JOBS='0', full run: nothing on stdout
    FAIL SELFTEST_JOBS='0', full run: no suite started
    FAIL SELFTEST_JOBS='0', h1 run: exits 2
    FAIL SELFTEST_JOBS='0', h1 run: stderr is exactly the one refusal line
    FAIL SELFTEST_JOBS='0', h1 run: nothing on stdout
    FAIL SELFTEST_JOBS='0', h1 run: no suite started
  HARNESS-036 AC-4  the value is checked before the floors file
    FAIL SELFTEST_JOBS=abc over a malformed floors.conf: exits 2, not the floors audit's 1
    FAIL and stderr is the refusal line, alone
    FAIL and no floors fault is printed: stdout is empty
  HARNESS-036 AC-4  control: a value above the number of suites is accepted
  HARNESS-036 AC-5  buffers under .claude/state/selftest.<pid>/, the lock held to the end
    FAIL SELFTEST_JOBS=3 over three passing suites exits 0
    FAIL every suite saw .claude/state/selftest.<pid>, <pid> being selftest.sh's own ($!)
    FAIL C-2: and its own buffer, <name>.out, already in it
    FAIL precondition: f1 finished last, after f2 and f3
  HARNESS-036 AC-5  TERM drains the running suites, starts no more, and cleans up
    FAIL precondition: at SELFTEST_JOBS=2, t1-held and t2-held are both running and held
    FAIL t2-held wrote its finished marker before the run exited
  HARNESS-036 AC-6  state, suite and portability hygiene, in this repository
    FAIL README has one selftest.<pid>/*.out row, hand-editable yes
    FAIL scripts/selftest.sh defines suite_status on exactly the one line DV-1 mutates
    FAIL and defines it nowhere else
selftest: 179 passed, 89 failed
```

**Why these are the right failures.** Today's `selftest.sh` ignores
`SELFTEST_JOBS`, so a `SELFTEST_JOBS=3` run is serial. Every hold that needs a
second suite alive therefore times out, after 30 s alone or 60 s waiting for a
start. For example, AC-2's diff shows `FAIL b1-last: its hold cleared before
its bound` and `4 of 6 harness suite(s) FAILED.` where `3 of 6` is expected.
Peaks are measured as 1. No buffer directory exists. A bad value is not
refused: rc 0 and the suites run. `suite_status` and the README row do not
exist. No failure is a syntax error, a timeout of the suite itself, or a
missing helper.

**Files touched.** `.claude/tests/selftest.test.sh`: the new cases before
`summary`, the `COUNTS` row `selftest 268`, and an EXIT trap
(`selftest_cleanup`: releases every hold, waits every background pid, then
removes the fixture) replacing `trap 'rm -rf "$FIX"' EXIT`.
`.claude/tests/floors.conf`: `selftest` 100 -> 268, with a HARNESS-036 note at
the foot. This story file: `## Contract` C-6 (amendment below), `## Test plan`,
and this section. Not touched: `scripts/selftest.sh`,
`.claude/state/README.md`, `## Acceptance criteria`.

**What the tests pin. Treat this as fact; a test reads each item.**
- `SELFTEST_JOBS` is read before the floors file. A value outside `''` (unset
  or empty) and `[1-9][0-9]*` prints exactly
  `selftest: SELFTEST_JOBS must be a whole number of suites to run at once, 1 or more; got '<value>'. Nothing was run.`
  on stderr, prints nothing on stdout, and exits 2. It takes no lock, creates
  no buffer and starts no suite. This holds for both the full run and
  `selftest.sh <suite>`.
- Unset, empty, `1`, or a single-suite run: the output is byte-identical to
  release 77. The AC-1 golden is in the suite as a literal, sha256
  `7818e840e8102cd55115e7891c9266884fbabf0edf8ae861975eb46ccececa78`, captured
  from `b6c8307`'s `scripts/selftest.sh` (release 77; unchanged in the working
  tree). Stderr is empty. No `.claude/state/selftest.*` entry is created.
- `SELFTEST_JOBS >= 2` over two or more suites: stdout is `cmp`-identical to
  the `SELFTEST_JOBS=1` run, and stderr is identical. The buffer directory is
  `.claude/state/selftest.<selftest.sh's $$>/`, and it exists, holding
  `<name>.out`, before each suite's first line runs. `run.lock` still records
  that pid when the last suite finishes. After exit 0, 1 or 143, no
  `.claude/state/selftest.*`, `run.lock` or `run.lock.*` remains. The peak
  number of suites alive is exactly `min(SELFTEST_JOBS, suites)`. A slot is
  refilled when any suite exits. On TERM: alive 1 s later while suites are
  held, `run.lock` still present, held suites let finish, the queued suite
  never started, exit 143.
- A finished suite's block reaches stdout while later suites are still running
  (polled for up to 30 s, so a poll backoff of a few seconds is fine).
- `scripts/selftest.sh` holds the line `suite_status() { wait "$1"; }` exactly
  once, with no other `suite_status()` definition. Its code lines contain none
  of `wait -n`, `wait -p`, `mapfile`, `readarray`, `coproc`, `declare -A`,
  `local -A`, `typeset -A`. The reader skips full-line comments and strips a
  trailing ` # ...`.
- `.claude/state/README.md` has a row matching
  ``^| `selftest.<pid>/*.out` +|.*| yes +|$`` (C-5's row satisfies it).

**Not constrained** (GREEN's choice): the name `report_suite` and how it gets
its arguments; start order (the AC-3 and TERM fixtures are padded, so glob order
and largest-first both start the intended suites); the poll interval and
backoff (keep the ceiling at about 2 s or below: AC-3's hold is 20 s); how a
finished suite's status is stored before printing; the wording of the
cannot-create-buffer line (C-4: no test, `chmod` cannot make it on Windows);
the `selftest.sh` header text.

**Green on arrival, and what earns each.**

| Assertions | Why green now | Earned by |
|---|---|---|
| AC-1's 21 (3 modes x 7) | they pin today's default path | the golden captured from release 77 in RED; DV-1's "must stay green" half; and the AC-1 control, which is red now |
| AC-2 single-suite (7) and `nosuchsuite` (4) | single-suite and no-match are serial today | they pin that C-1 sends these down the sequential path; checked against a scratch prototype (below) |
| AC-2 failing fixture "exits 1" (2) and passing "J=1 exits 0", J=1 floors/last lines | J=1 halves are today's code; J=3 still exits 1 (b3, b4 fail regardless) | DV-1 (the lost-status mutant leaves them green, as it must) |
| AC-3 control at J=1 (2) | serial is what the control describes | it is the control; measured below |
| AC-4 leftovers (14), control J=10 (2) | today leaves nothing and runs J=10 serially | leftovers turn meaningful once GREEN creates buffers; the control is the control |
| AC-5 exit-1 case (2) | serial exits 1 and leaves nothing | DV-1: on the prototype with `return 0` it goes red (`SELFTEST_JOBS=3 with one suite exiting 1 (floor met) exits 1`) |
| AC-5 TERM: alive after 1 s, lock present, 143, t1 finished, t3 never started (5) | serial TERM already drains the foreground suite | the two red assertions in the block (t2 precondition, t2 finished); 143 and alive are HARNESS-034's serial behaviour carried over |
| AC-5 "nothing left" after exit 0 (1) | nothing is created today | becomes meaningful once buffers exist |
| AC-6 check-ignore (2), bash-3.2 reader (1) + control (1), README control (1) | `.gitignore` already covers it; the script is clean today | each has a control that is the opposite case, measured below |

**Negative controls: expected values.** Unlike a missing module, this suite
does not fail at import: every assertion ran in RED, so these numbers come from
real executions. Confirming them against the shipped `selftest.sh` is GREEN's
job.

| Control | Threshold | Measured in RED (release 77) | Measured on scratch prototype | GREEN must see |
|---|---|---|---|---|
| AC-1 control: peak at J=3 | >= 2 | 1 | passes (>= 2) | >= 2 |
| AC-1 control: suites seeing `selftest.<digits>` | >= 1 | 0 | passes | >= 1 (expect 5) |
| AC-2 failing: b1's `finbefore` lines | = 5 | 0 (b1 timed out, finished first) | 5 | 5 |
| AC-2 failing: b2 finished after b3 | yes | no | yes | yes |
| AC-2 passing: c1's `finbefore` lines | = 3 | 0 | 3 | 3 |
| AC-3 peaks (2/4, 3/5, 10/4) | = 2, 3, 4 | 1, 1, 1 | 2, 3, 4 | 2, 3, 4 |
| AC-3 control (J=1): rc / timeout line count | 1 / 1 | 1 / 1 | 1 / 1 | 1 / 1 |
| AC-3 work-conserving (J=2): rc / w1 timeout marker | 0 / absent | 1 / present | 0 / absent | 0 / absent |
| AC-4 control J=10: rc / passed line | 0 / 1 | 0 / 1 | 0 / 1 | 0 / 1 |
| AC-6 bash-3.2 reader on the probe | exactly `1: wait -n` and `4: local -A` | exactly that | exactly that | exactly that |
| AC-6 check-ignore on `.claude/state/README.md` | rc 1 | 1 | - | 1 |
| AC-6 README reader on `run.lock.<pid>` | 1 | 1 | 1 | 1 |

**Satisfiability check (scratch only, nothing committed).** To show the suite
can be passed, a throwaway concurrent prototype of `selftest.sh` was built in
the session scratchpad, outside this tree. It reads and refuses the variable
after `ONLY`, keeps `report_suite` shared, uses `kill -0` polling plus
`suite_status`, a buffer dir `selftest.$$`, `selftest_exit` and
`stop=143` drain traps. It ran the suite from a scratch copy of the tree:
`selftest: 267 passed, 1 failed` in 67 s. The one failure was the README row,
which the prototype does not write. With DV-1's expression applied to that
prototype: `263 passed, 5 failed`. The new failures were AC-2's failing-fixture
last line (`expected: 3 of 6 harness suite(s) FAILED.` /
`actual: 2 of 6 harness suite(s) FAILED.`) and its stdout identity; AC-5's
exit-1 case (`expected: 1` / `actual: 0`); and the `suite_status` line check,
which the mutation itself changes. **Note for GATES on DV-1's wording:** in
this fixture the `SELFTEST_JOBS=3` run under the mutant still exits **1**, with
`2 of 6 harness suite(s) FAILED.`, because b3 (below floor) and b4 (no summary)
fail without reference to an exit status. DV-1's "exits 0 and its last line is
`<N> harness suite(s) passed.`" is wrong for this fixture. What DV-1 requires
holds: only the rc-only failure is lost, the count is visibly wrong, and both
named assertions go red. AC-5's exit-1 case is the one where the mutant
produces exit 0. Every AC-1 assertion and every J=1
half stayed green, which is DV-1's prediction. This does not discharge DV-1:
it was run against a prototype, not the shipped script. GATES still owns it.

**Discovered in RED; this changes the approach.**
- *Fixed in the test before handoff:* AC-5's "last finisher" was found by the
  suite whose `finbefore` listed the other two. On the prototype that was a
  race: three quick suites finished together and none qualified. f1 now holds
  until f2 and f3 have finished, a precondition asserts it, and the lock is
  read from f1's `lockend`. That adds one assertion, hence 268.
- *Contract amended (C-6):* AC-3's short bound is 10 s -> 20 s. Reason in C-6.
  Keep poll backoff at or below about 2 s.
- *For GREEN:* in the concurrent loop a trapped TERM is handled only after the
  current `sleep` returns, so keep the poll sleep short while suites run. The
  TERM test allows 1 s before it checks liveness, and the drain must not exit
  early. Create the buffer directory before starting any suite: every suite
  must see it and its own `<name>.out` at start. Read buffers back with
  `$(cat ...)`: b5/c3/a2 end in blank lines, and identity requires the same
  stripping as `$(...)`.

**Timings, all local (this Windows host; none from CI).** Baseline suite 127 s.
RED direct run 467 s and the runner run 466 s: RED pays the hold bounds that
a serial runner cannot clear: seven 30 s lonely holds (AC-1 control, AC-2 x 2,
three AC-3 peaks, AC-5's f1), two 60 s start waits (print-while-held, TERM)
and two 20 s holds (AC-3 work-conserving case and its control). Only the
control's 20 s is paid once GREEN lands. The
prototype passed the whole suite in 59-67 s, against a 127 s baseline taken
while another worktree's self-test was running on the same machine. That
number is comparable only roughly. Expect GREEN on this host somewhere between
those, and CI (`ubuntu-latest`) far faster. Every wait is bounded:
the worst-case hang is one 120 s hold.

**Other commands run in RED, sequentially.** `bash .claude/tests/settings.test.sh`
-> `settings: 27 passed, 0 failed`. `bash scripts/check-sigpipe.sh` ->
`scanned 47 shell file(s), 43 with pipefail, 0 finding(s)`.
`bash scripts/check-grep-count.sh` -> `scanned 47 shell file(s), 0 finding(s)`.
`bash scripts/gates.sh --fast` -> rc 0, `All required gates passed (0 ran, 5
unconfigured, 0 known)`. `project.conf` is not bootstrapped upstream, so no
gate judges this suite locally. The CI step `bash scripts/selftest.sh` is the
required gate that does. `bash scripts/mutate.sh --check` -> clean.
`.claude/state` holds no lock, buffer or mutation.

**Deferred verifications.** DV-1 and DV-2 are GATES-owned. RED cannot run
either against the real implementation, which does not exist yet. The
prototype check above is evidence that the suite discriminates. It is not a
substitute for either entry.

## Regressions

<!-- REQUIRED if this story ever returned to RED after GREEN or GATES; omit
     otherwise. A test that is wrong is never edited into passing, and the
     return is not a footnote - it is the story failing to be one clean cycle,
     and the next person needs to know why. One block per return:
       * which test, what it asserted, and what was wrong with it
       * how the defect was found
       * what it asserts now
       * what earns it, since "watched it fail" cannot apply once the
         implementation exists - the corrected assertion passes on its first
         run and every run after, whether or not it asserts anything: either a
         PROBE (mutate the specific behaviour the test pins, paste the red,
         confirm the revert) or, where the defect was cost rather than
         correctness, a BEFORE/AFTER measurement taken under the gate command -
         not the plain test command, which is the faster one.
         PASTE THE OUTPUT. check-boundaries.sh refuses a PR whose Regressions
         or Gate probes section describes a failure without showing one
       * whether GREEN was a no-op, and the command output proving the source
         was untouched and still passes -->

## Gate results

<!-- gates.sh: written by bash scripts/gates.sh; do not edit or paste by hand -->

    run:    2026-10-06T14:58:46Z
    commit: 54f469e
    tree:   7f45a272d7d659beeec3dab775757abd8bf57efe
    result: pass (0 ran, 7 unconfigured, 0 known)

    UNCONFIGURED format
    UNCONFIGURED lint
    UNCONFIGURED typecheck
    UNCONFIGURED unit
    UNCONFIGURED coverage
    UNCONFIGURED integration
    UNCONFIGURED build
    ON REQUEST   mutation (not run: per-story cost the user declined (HARNESS-015); run it with /audit-mutations; bash scripts/gates.sh --gate mutation)

## Gate probes

<!-- REQUIRED if this story adds or changes a gate, its command, or its
     evidence line. Omit the section entirely otherwise.
     A gate that has never been observed to fail is not a gate: break the thing
     it guards, run the gate, paste the failure, revert. One block per gate:
       * what was broken, and where
       * the gate output proving it failed
       * confirmation the probe was reverted -->

## Scaffold inventory

<!-- REQUIRED for a bootstrap or chore story that writes production code under
     SCAFFOLD, where nothing forces a test to exist first, and for a spike that
     commits its throwaway code. Omit otherwise.
     One line per production file written, and for anything with behaviour
     rather than configuration, the test that covers it:
       src/core/palette.ts        - src/core/palette.test.ts
       vite.config.ts             - configuration, no behaviour
     check-boundaries.sh refuses the PR if any changed source file is not
     named here. -->

## Notes

**PLANNED, 2026-10-05 (lead-po).** One story: the behaviour is "one run's
suites run concurrently, opt-in", one RED->GREEN cycle over `selftest.sh` and
its own suite. Left uncommitted at PLANNED: the orchestrator creates
`story/HARNESS-036-opt-in-concurrent-self-test-suites` and commits the story
there at PLANNED, which is the criteria baseline (HARNESS-033).

Decisions this plan took that the audit did not, each open to RED amending the
contract and to the user overruling:

- **Two paths, not one** (C-1). With the default at 1, keeping today's loop for
  it means the default changes nothing - no buffers, no background jobs, no new
  state - by construction rather than by test. Downstream's single path made
  every run concurrent-shaped. The cost is a shared verdict function, so the
  paths cannot drift, and AC-2 compares them byte for byte.
- **Invalid values refuse with exit 2** (C-3), before anything else; downstream
  exits 1. 2 is this script's "nothing ran" since HARNESS-034. Leading zeros
  (`04`) are refused rather than normalised - simpler, and no one types them.
- **TERM drains rather than kills** (C-4), matching HARNESS-034's serial
  behaviour; downstream kills the running suites.
- **Incremental printing** (C-2, AC-2): a suite is printed as soon as it and
  its glob predecessors are done, so a long run is not silent until the end.
- **CI unchanged** (`## Out of scope`).

**Isolation probe (PLANNED, 2026-10-05).** Every real suite was run directly
(`bash .claude/tests/<name>.test.sh`, not through `selftest.sh`, so no lock
was involved), at most four at a time, started in glob order, in this worktree
at `c9260a7` with no story active. Before and after: `git status --porcelain
--ignored`, a `find` of every file outside `.git`, and a `find -newer` against
a marker touched at the start. Scratch script, not committed.

- **All 24 suites exited 0, every summary line `..., 0 failed`.**
- **The tree was unchanged except for this story file**, which was being
  written during the run: the status diff, the file-list diff and the
  `-newer` list each name only `docs/backlog/stories/HARNESS-036.md`. Nothing
  appeared in `.claude/state`. So the static survey in `## Context` holds when
  measured: no suite writes the real tree, and no suite failed beside others.
  One run, which cannot rule out a rare race; DV-2 repeats the check through
  the real runner.
- **Timing, as a preliminary only** (not DV-2; glob-order start, no runner,
  the machine also running this session): wall **3,793 s** for all 24 at four
  jobs. The longest, `phase-guard`, took 3,325 s under that contention and was
  started 11th; `plan` 2,932 s, `gates` 1,484 s, `boundaries` 1,483 s,
  `sigpipe` 1,356 s. The sum of the per-suite times was 14,736 s, which is
  contention-inflated and is not a serial time. The last measured serial run
  on this host was 6,135 s (2026-10-02, audit `## Evidence`), so four jobs may
  save something like a third here; DV-2 measures it properly, back to back.
  With `phase-guard` as the critical path, a start order that puts it first
  is likely to matter more than the job count (C-2 leaves that to GREEN).

**Decision from the probe:** suites are write-isolated as far as can be
measured, so `SELFTEST_JOBS` above 1 is not refused and no suite is
serialised.

**GREEN (2026-10-05), feature-developer, Opus 5.5 (`claude-opus-5-5`), no
model override in the dispatch.** Wrote `scripts/selftest.sh` and
`.claude/state/README.md` only; nothing under `.claude/tests/` was touched.
Built against `## Contract`, not the RED scratch prototype (which was not read).

- **C-3.** `JOBS="${SELFTEST_JOBS-}"` immediately after `ONLY`; `''` -> 1,
  `*[!0-9]*|0*` -> the C-3 line on stderr, exit 2. Before the floors load, the
  lock and any suite.
- **C-1.** `suite_header <name>` and `report_suite <name> <rc>` (output in the
  global `$out`) hold the per-suite block; both paths call them in glob order.
  The sequential path is today's loop, still printing the header **before**
  the suite runs, so a one-at-a-time run looks the same while it runs as well
  as after. It is taken when `JOBS < 2` or the run has fewer than two suites
  (counted from `$SUITES`, which also covers `nosuchsuite`).
- **C-2.** `mkdir -p .claude/state/selftest.$$` after the lock, before any
  suite (failure: C-4's line, exit 2). Suites start in **glob order** (DV-2
  asked for this to be recorded; largest-first was not built - the PLANNED
  isolation probe suggests `phase-guard` started late is the critical path, so
  DV-2's timing is the evidence for or against changing it). Each is
  `bash "$suite" > "$BUF/<name>.out" 2>&1 &`; running pids are polled with
  `kill -0`, a gone one collected with `suite_status "$pid"; rc=$?` (the
  one-line definition at column 0, as pinned). A block is printed as soon as
  it and every earlier suite are collected, read back with `$(cat ...)`.
  Poll backoff `0.05 0.1 0.2 0.5 1` s, reset on any reap: **ceiling 1 s**,
  below C-6's "about 2 s", because a trapped TERM is acted on only when the
  current `sleep` returns.
- **C-4.** `selftest_exit` replaces `trap run_lock_release EXIT`: waits every
  pid not yet collected, `rm -rf` the buffer directory if this run made it,
  then `run_lock_release`. INT/TERM traps unchanged (`exit 130` / `exit 143`),
  so a signal starts nothing more and the EXIT handler drains.
- **C-5.** The row exactly as written, plus a paragraph under "The exhaust".
- **Known, not tested, not fixed:** a TERM landing in the instant between
  `bash ... &` and `PIDS[$started]=$!` would leave that one suite unwaited (it
  still runs to completion, but the lock could be released before it ends).
  The window is two builtins wide; closing it needs signal masking bash does
  not offer portably.

**Runs, sequentially, in this worktree (Windows host; another worktree's
self-test may have been running).**

| Command | Result |
|---|---|
| `bash scripts/selftest.sh selftest` (before README row) | `267 passed, 1 failed` (README row only), 73 s |
| `bash scripts/selftest.sh selftest` | `selftest: 268 passed, 0 failed`, floor met, rc 0, 69 s |
| `bash .claude/tests/settings.test.sh` / `selftest.sh settings` | `settings: 27 passed, 0 failed`; floor met |
| `bash scripts/selftest.sh run-lock` | 140 executed, 140 declared, passed, 23 s |
| `bash scripts/selftest.sh lib` (no `$TMPDIR`/`mktemp`, bash-3.2 rules) | 217 executed, 217 declared, passed |
| `bash scripts/check-sigpipe.sh` | `scanned 47 shell file(s), 43 with pipefail, 0 finding(s)` |
| `bash scripts/check-grep-count.sh` | `scanned 47 shell file(s), 0 finding(s)` |
| `bash scripts/gates.sh --fast` | rc 0, `All required gates passed (0 ran, 5 unconfigured, 0 known)` |
| `bash scripts/mutate.sh --check` | clean |

The full `bash scripts/selftest.sh` and `bash scripts/gates.sh` were not run in
GREEN: the full self-test is DV-2 run 1 (GATES), and `gates.sh` judges nothing
here (`project.conf` unbootstrapped). DV-1 was not run (GATES owns it).

**Negative controls, confirmed against the shipped script.** Every control in
the handoff's table except the first two is an exact `assert_eq`, so its
passing in the 268/0 run *is* the measured value equalling RED's expected one.
The first two are `>=` thresholds, so their actual values were measured with a
scratch copy of the suite (in a scratch mirror of the tree outside the
worktree, deleted afterwards) printing `h_peak` and `h_saw_re` after the AC-1
control's `jrun 3`.

| Control | GREEN must see | Measured in GREEN |
|---|---|---|
| AC-1 control: peak at J=3 | >= 2 | **3** |
| AC-1 control: suites seeing `selftest.<digits>` | >= 1 (expect 5) | **5** |
| AC-2 failing: b1's `finbefore` lines | 5 | 5 (exact assert, passed) |
| AC-2 failing: b2 finished after b3 | yes | yes (passed) |
| AC-2 passing: c1's `finbefore` lines | 3 | 3 (passed) |
| AC-3 peaks (2/4, 3/5, 10/4) | 2, 3, 4 | 2, 3, 4 (passed) |
| AC-3 control (J=1): rc / timeout line count | 1 / 1 | 1 / 1 (passed) |
| AC-3 work-conserving (J=2): rc / w1 timeout marker | 0 / absent | 0 / absent (passed) |
| AC-4 control J=10: rc / passed line | 0 / 1 | 0 / 1 (passed) |
| AC-6 bash-3.2 reader on the probe | `1: wait -n` and `4: local -A` | same (passed) |
| AC-6 check-ignore on `.claude/state/README.md` | rc 1 | 1 (passed) |
| AC-6 README reader on `run.lock.<pid>` | 1 | 1 (passed) |

No divergence from RED's numbers. The AC-1 peak is 3, not merely 2: the
fixture's five suites at J=3 fill all three slots.

**GATES (2026-10-05), orchestrator.** DV-1 and DV-2 came out as required
(results under `## Deferred verifications`). GATES -> REVIEW step 1's full
self-test is DV-2 run 1: exit 0 in 1,135 s, `24 harness suite(s) passed.`
(2,715 assertions executed, 2,488 declared). After the header comment edit,
`gates.sh` was re-run (recorded) and so was a full self-test with
`SELFTEST_JOBS=4`: exit 0 in 336 s, same last line.

**Renumbered, 2026-10-06, orchestrator.** This story was planned, built and
opened as PR #115 under the id HARNESS-035. While it was in review, another
session merged a different story under the same id (#114, "the lock follows
the session into a worktree", release 79), so the two `HARNESS-035.md` files
conflicted. This one became HARNESS-036: the story file was moved, every
`HARNESS-035` reference in this story's own files (`scripts/selftest.sh`
comments, `selftest.test.sh` comments and `describe` labels, the `floors.conf`
note, the state README paragraph) was changed to `HARNESS-036`, and the PR
branch was renamed on GitHub so #115 follows it. No assertion, criterion or
behaviour changed. Commit hashes quoted above (the PLANNED baseline `f42b1bb`
and the rest) are this story's own history, unchanged by the move. Main was
then merged in (releases 78 and 79), and the gates and a full self-test were
re-run on the merged tree.

**After the merge of `main` (2026-10-06), orchestrator.** Merge 54f469e brought
in #113 (release 78) and #114 (release 79) with no conflict once the story file
had moved. `bash scripts/gates.sh` re-run and recorded against the merged tree;
full self-test with `SELFTEST_JOBS=4`: exit 0 in 418 s, `24 harness suite(s)
passed.` (2,793 assertions executed, 2,488 declared). Renaming the PR branch on
GitHub closed #115 (`head_ref_deleted`) instead of retargeting it, so the
review continues in a new PR from this branch.

**Criteria freeze across the move.** `check-boundaries.sh` 3d now baselines
this story at the move commit (609dd00, "the first commit that left PLANNED"),
because it walks the history of the story's *current* path and the file had a
different name at PLANNED. So the move reset the freeze. Checked by hand
instead: `## Acceptance criteria` here is byte-identical to the PLANNED commit's
`HARNESS-035.md` (f42b1bb). A rename resetting the 3d baseline is a gap in
HARNESS-033's rule. It is not fixed here.

**DONE, 2026-10-06.** Merged in #116 (merge commit 065c44c), release 80; #115
was its first PR, closed by the branch rename. The VERSION bump lands in this
DONE commit. `phase.sh set DONE --force` was run on `main` (a detached checkout
of `origin/main` in the worktree), overriding the branch check. PR CI: `gates`
passed in 2m46s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37484852957),
`boundaries` in 11s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37484852945).
No epic. Group 6 finding C (with MT-042) is complete; next is finding D.
