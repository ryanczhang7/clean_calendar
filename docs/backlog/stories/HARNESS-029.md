---
id: HARNESS-029
title: mutate.sh counts what changed, cleans up on every path, and survives an early reader
slug: mutate-sh-counts-what-changed-cleans-up
epic: 
type: fix
status: done
phase: DONE
branch: story/HARNESS-029-mutate-sh-counts-what-changed-cleans-up
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [scripts/mutate.sh, .claude/tests/mutate.test.sh, .claude/tests/settings.test.sh, .claude/state/README.md, .claude/tests/floors.conf, .claude/tests/selftest.test.sh]         # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

This is group 4, "mutation safety", in
`docs/wiki/audits/manga-translator-port-2026-10-02.md` (issue #97), items (a)
and (c). Item (b) comes next as HARNESS-030: the `.active` sentinel,
`mutate.sh --check`, and `gates.sh` refusing to run behind a stranded mutation.

**Why (a) and (c) are one story and (b) is not.** (a) and (c) are both internals
of `scripts/mutate.sh`, held by one suite, `mutate.test.sh`, and they share the
same output path:

- the header count;
- the preview;
- the restore listing;
- the traps that decide what runs once a reader has gone.

(b) adds a new state file, a new mode (`--check`) and a refusal in `gates.sh`,
so it is a second behaviour in a second script. It also builds on the trap
structure this story settles, so it is cut once this one closes.

**(a), the cleanup, port of `c7bd4ce`.** `rules.md` says `.claude/state/mutations/`
carries one signal: "a `.bak` left behind means a restore failed. Everything else
it cleans up." That is not true today:

- The `cannot write` path, `mutate.sh:139`, restores the file and then `die`s,
  leaving both the `.bak` and the `.new`.
- Nothing is trapped before `:168`, so a signal in the window between the backup
  (`:104`) and the mutation strands both files.

**A defect the audit did not list, found while planning this story.** It is in
the PIPE handling `b38f5b3` added:

- `trap on_exit EXIT INT TERM PIPE` (`:168`) makes a SIGPIPE run `on_exit`, which
  **restores the file**. Execution then resumes.
- If the reader leaves before the command starts, the first `printf` after the
  mutation (`:170`) takes SIGPIPE. The file is put back, and the command then
  runs against the **original**.
- The log still records `exited 0  restored (verified)`, so the probe is void
  and says it ran.

Reproduced 3 of 3 on 2026-10-04 at `3fcd706`, in a throwaway tree with a copy of
`mutate.sh`:

```
timeout 60 bash -c "bash scripts/mutate.sh f.txt 's/alpha/MUTATED/' -- sh -c 'sleep 1; cat f.txt > seen.txt' | head -1"
→ seen.txt = "alpha" (the command saw the ORIGINAL), log: "... exited 0  restored (verified)"
```

**The `| head -1` hang the audit left undiagnosed.** It reproduces every time on
this host, so it is in scope:

- The run above hung all 3 times, and `timeout` killed it. The job reported as
  killed was the restore-listing `printf | while read` pipeline (`:180-183`).
- Separately, `bash scripts/mutate.sh f.txt '<expr>' -- true 2>&1 | head -1`
  hung 4 of 4 times with no timeout. It hung *before* the file was touched,
  with the `.bak` and `.new` on disk and a `bash` child of `mutate.sh` alive.
  Its stdin was a pipe and its stdout was the closed pipe to `head`, so it sat
  in the preview pipeline (`:136-137`). Killing that child let the run go on.

**The cause is not known.** What is known is that both hangs sit in a pipeline,
inside `mutate.sh`, that writes to the script's own stdout after the reader has
gone. The existing test (`mutate.test.sh:217`) uses `| head -2` under
`timeout 60` and passes, so it does not reach this.

**(c), the count, finding E.** The `N line(s) changed` count (`:132`), the
preview (`:136`) and the restore listing (`:133`, `:180-183`) all compare the old
and new files by line number. One insertion therefore "changes" every line after
it. Reproduced on 2026-10-04 on a 40-line file:

| Expression | Reported | True |
|---|---:|---:|
| `2s/$/\ninserted/` | 39 | 1 |
| `5d` | 35 | 1 |
| `$d` | 0 | 1 |
| `s/^1$/one/` | 1 | 1 |

It has also happened live: HARNESS-025's DV-2 header said `613 line(s) changed
by 661d`. On this host the restore listing spawns one `awk` per "changed" line,
so that header also cost about 613 process spawns.

**Required gate that would fail if this broke:** `unit`, through `bash
scripts/selftest.sh` and the `mutate` suite. Every gate in this repository is
UNCONFIGURED, so in practice CI's `selftest.sh` step judges it.

## Acceptance criteria

All criteria run against the fixture copy of `mutate.sh`, inside the suite's
`make_project_fixture` tree.

- **AC-1.** Given a target `mutate.sh` cannot write, when it runs:
  - it exits 2 with `mutate: cannot write <rel>; it is unchanged, verified
    against the backup`;
  - the file is byte-identical to before;
  - `.claude/state/mutations/` holds no `.bak` and no `.new` from the run;
  - the command is not run.

  *Today:* the `.bak` and `.new` are both left behind.
- **AC-2.** Given a reader that leaves after the first line
  (`... 2>&1 | head -1`, the whole pipeline bounded by `timeout 60`), when the
  command records what it sees:
  - **the command saw the mutated file**;
  - the pipeline finishes before the timeout;
  - the file is restored;
  - no `.bak` or `.new` is left;
  - exactly one log line is added, and it is truthful.

  *Today:* the command sees the original, and the pipeline hangs.
- **AC-3.** Given `TERM` sent to `mutate.sh` while its command is running:
  - the file is restored;
  - no `.new` is left;
  - the run writes its log line;
  - no `.bak` is left, because the restore was verified.

  *Control:* the existing `COULD NOT RESTORE` case (`mutate.test.sh:116`) still
  exits 90 and keeps its `.bak`. The cleanup must not silence the one real alarm.
- **AC-4.** Given a 40-line file, the header reports 1 line changed for each of
  `2s/$/\ninserted/`, `5d` and `$d`. The existing case `s/90/-90/` still reports
  `3 line(s)` (`mutate.test.sh:83-89`).
  - *Count rule:* the sum over the change's hunks of the larger of the lines
    removed and the lines added. Every line removed, added or replaced counts
    once. Unchanged lines between hunks never count.
  - *Preview:* the preview lists only removed and added lines. Each removed line
    carries its old line number (`  N - text`) and each added line its new line
    number (`  N + text`), capped at 20 lines.
  - *Log:* the log line records the same count.
- **AC-5.** Given a mutation that changes 30 separate lines, the restore listing
  after `restored (verified ...)` prints at most 10 restored lines followed by
  exactly one `  ... and 20 more` line. A pure insertion lists no restored lines
  for that hunk. The listing reads the restored file once, not once per line.
- **AC-6.** `.claude/state/README.md` has a row for `mutations/*.new`: written by
  `scripts/mutate.sh`, nothing reads it, hand-editable `yes`. The paragraph on
  `mutations/` says what a surviving `.new` means: the run was killed outright,
  and it arrives with its `.bak`. `settings.test.sh` still reports no
  disagreements.

## Contract

**RED may amend any block below in place, with a reason stated in the block.
GREEN builds what the amended block says.**

**Writes:** `scripts/mutate.sh`, `.claude/tests/mutate.test.sh`, `.claude/tests/settings.test.sh`, `.claude/state/README.md`, `.claude/tests/floors.conf`, `.claude/tests/selftest.test.sh`

*Amended in RED, 2026-10-04 (Test Developer):* `.claude/tests/settings.test.sh`
added here and to `touches:`. AC-6 says that suite still reports no
disagreements, and the AC-6 row and paragraph assertions live there; its floor
moved 22 -> 27 in `floors.conf` and `selftest.test.sh`.

### C-1 Traps (port of `c7bd4ce`, with PIPE handled differently from both versions)

Port downstream's structure with three changes, and keep its comments.

1. **`MUTATED=0; RESTORED=0`.** `put_back()` decides by **content**, not by
   flag: `cmp -s "$BAK" "$FILE" && return 0; cp "$BAK" "$FILE"`.
2. **`on_exit`** is `put_back; rm -f "$NEW" "$NEW.err"`.
3. **`on_signal`** handles `INT` and `TERM`. It calls `put_back`. When
   `MUTATED=1` it returns, so the restore-and-verify block still runs and logs.
   Otherwise it removes the `.bak` once `cmp` shows the file is the original,
   removes the `.new`, and exits 130.
4. **Arming.** The traps are armed **immediately after** `cp "$FILE" "$BAK"`
   succeeds (`:104`), not at `:168`.
5. **The `cannot write` path** follows downstream:
   - `cp "$BAK" "$FILE"`;
   - if `cmp` matches, `rm -f "$BAK"` and `die "cannot write $REL; it is
     unchanged, verified against the backup"` (exit 2);
   - otherwise the same `COULD NOT RESTORE` message, a `command: not run` log
     line, and exit 90.

**PO decision 1: PIPE gets its own handler, and it restores nothing.**

```bash
trap ':' PIPE
```

- **Why trapped:** a trapped signal makes bash resume after the failed write.
  That was the whole point of `b38f5b3`, and the trap is reset to the default in
  children at exec, so the command under test still sees an ordinary SIGPIPE.
- **Why it restores nothing:** restoring is the EXIT trap's job, and doing it on
  PIPE is the defect in the Context.
- **Why not downstream's form:** downstream dropped PIPE altogether. Folding
  PIPE into `on_signal` would turn an early reader into an `exit 130` before the
  command runs, so a piped probe would never run.

**Rewrite `b38f5b3`'s comment block (`:146-166`).** Keep its history (why PIPE
is trapped, and the three stale `.bak`s). Replace "NOTHING ELSE WAS NEEDED" with
what was found here: the handler restored the file, so a reader that left before
the command started voided the probe while the log said it ran.

**`mutate.sh` must not mutate itself** (`:86-95`) and that stays. C-6 says how
this story's own deferred verifications get around it without touching the
check.

### C-2 The count, the preview and the listing (finding E)

**PO decision 2: the diff comes from `git diff --no-index`, not from `diff`.**

- `diff` is diffutils. The harness promises "bash + git only" for its own tests
  (`selftest.sh`), and git is already a hard dependency (`doctor.sh`).
- A home-grown longest-common-subsequence in awk would be a second
  implementation of a solved problem.

The exact invocation, with every config that could change its output pinned
off:

```bash
git -c core.autocrlf=false -c core.quotepath=off -c diff.noprefix=false \
  diff --no-index --no-color --no-ext-diff --no-textconv -U0 -- "$BAK" "$NEW" 2>/dev/null
```

- It exits 1 when the files differ. That is expected, and its status is not
  used.
- `core.autocrlf=false` is load-bearing on this host. Without it, git prints
  "LF will be replaced by CRLF" warnings, which were seen while planning.
- The output is written to a file under `$MUTDIR` (`$DIFF="$MUTDIR/$SAFE.$STAMP.$$.diff"`,
  removed by `on_exit` like `.new`). It is not piped into the script's stdout.

**One awk pass over `$DIFF`** produces:

- **The count.** For each hunk header `@@ -a[,b] +c[,d] @@`, take `max(b, d)`,
  where a missing count means 1, and sum over the hunks.
- **The preview.** Removed lines as `  N - text`, numbered from `a`; added lines
  as `  N + text`, numbered from `c`. Lines from `\ No newline at end of file`
  are skipped. At most 20 lines.
- **The old-side line numbers** of removed lines, as `LINES`, for the restore
  listing.

The awk programs use only `match`, `substr`, `split` and plain comparisons.
They use no interval expressions and no gawk extensions (the HARNESS-025
lesson: CI's awk is mawk).

**The restore listing** prints the first 10 entries of `LINES` from the restored
file in **one** awk pass, then `  ... and K more` when K > 0. This replaces the
`printf | while read` pipeline at `:180-183`, which spawned one awk per line and
is one of the two places the hang was seen.

**PO decision 3: nothing in `mutate.sh` writes to its own stdout through a
pipeline.** Each pipeline's output is captured into a variable or a file first,
then printed with one `printf`. Both hangs were in such pipelines. The cause is
unknown, so this is a containment rule, not a diagnosis.

If AC-2 still hangs with this rule in place, GREEN does not widen the timeout or
skip the case. It records what it found in `## Notes` and stops for the PO.

A binary target (git prints `Binary files ... differ`, with no hunks) reports
`0 line(s) changed (binary)`. No AC covers it, and nobody mutates binaries with
sed.

### C-3 Tests: `.claude/tests/mutate.test.sh`

Add one new block per AC, after `"a reader that leaves early does not strand the
backup"`.

**Fixture.** The suite's own `make_project_fixture`, the `mutate()` wrapper and
`reset_src`. For AC-4 and AC-5, use a 40-line file written with `seq 1 40`. Do
not add a 30-hunk generator beyond `seq` and a single `sed` expression such as
`'1~3s/$/x/'` (GNU sed's step address). Check that address on this host. If it
is not portable, use `s/^\(1\|2\|...\)$/` or a short explicit list.

*Amended in RED, 2026-10-04 (Test Developer).* AC-5's fixture is `seq 1 60`
with `'1~2s/$/x/'`, not a 40-line file. Reason: `1~3` on 40 lines changes 14
lines, not 30 (measured), and 30 *separate* lines need at least 59. `1~2` on 60
gives exactly 30 one-line hunks (`git diff --no-index -U0` prints 30 `@@`
headers, measured), so the case also exercises the sum over hunks. The step
address works on this host's GNU sed 4.9; CI is `ubuntu-latest`, also GNU.
AC-4's cases keep the 40-line file.

**AC-1, the unwritable target.** RED picks a method and **proves it makes `cp`
fail on this host before relying on it**. `chmod 444` may not stop a Windows
user-owned file, so a candidate is replacing the target's directory entry with a
directory of the same name after the backup. The method goes in the handoff.

**AC-2's probe.** The command is `sh -c 'cat <file> > <outside-file>'`. It writes
outside `src/`, under the fixture's ignored `.claude/state` or a `mktemp` path,
so it can record what it saw without tripping the phase lock. The whole pipeline
is `timeout 60 bash -c "... | head -1"`, as `:217` does.

- The **"saw the mutation"** assertion compares that recorded content with the
  mutated text, as an exact string.
- The **"did not hang"** assertion is `timeout`'s status: anything except 124.

**AC-3.** The command is `sh -c 'sleep 3'`, with `mutate.sh` backgrounded inside the test. Send
`kill -TERM` to the `mutate.sh` pid after a short wait, bounded, then assert.
Note the warning at `:205-207`, "A test for a SIGPIPE defect is the last place
to put an unbounded writer": every new block is bounded.

**Needles.** Header counts are matched as exact substrings of a whole header
line, for example `(1 line(s) changed by 5d)`. The `... and 20 more` line is
compared whole.

**Floors.** Raise `mutate` from 44 to the executed count measured in RED, in
both `.claude/tests/floors.conf` and the `COUNTS` block of
`.claude/tests/selftest.test.sh`.

### C-4 What passes on arrival

| Case | Today | Earned how |
|---|---|---|
| AC-3, TERM during the command | passes | One RED probe, with C-6's out-of-tree runner against the repo's `scripts/mutate.sh`, expression `186s/rm -f "\$NEW" "\$BAK"/:/`. That is today's only cleanup on the path a TERM resumes into, so AC-3's "no `.new`" and "no `.bak`" assertions must go red. Note that bash defers a trapped TERM until the foreground child exits, so the test's command is a short `sleep 3`, not `sleep 30`. |
| AC-4's `s/^1$/one/` and `s/90/-90/` | pass | regression guards. Earned by DV-3. |
| AC-6's `no disagreements` | passes | an existing assertion |
| AC-1, AC-2, AC-4's insert and delete cases, AC-5, AC-6's row | red in RED by construction | — |

### C-5 Commands

Measured on this host on 2026-10-04: `bash .claude/tests/mutate.test.sh` takes
**1m12s** (`mutate: 44 passed, 0 failed`).

| When | Commands |
|---|---|
| RED and GREEN | `bash .claude/tests/mutate.test.sh` and `bash .claude/tests/settings.test.sh` |
| After GREEN | `bash scripts/check-sigpipe.sh`, `bash scripts/check-grep-count.sh`, `bash .claude/tests/sigpipe.test.sh`, `bash .claude/tests/selftest.test.sh` |
| GATES | `bash .claude/tests/phase-guard.test.sh`, in the background (30-37 min), because the guard exempts `scripts/mutate.sh` invocations and its suite exercises that. Then `bash scripts/gates.sh`. |
| Once, before REVIEW | the full `bash scripts/selftest.sh`, in the background |

- No `sigpipe.test.sh` pin names `mutate.sh`, so no pin moves.
- `check-sigpipe.sh` must still report 0 findings. The new `git diff ... >
  "$DIFF"` is a redirect, not a pipeline.

### C-6 Mutating `mutate.sh` with `mutate.sh`

`mutate.sh` refuses its own path (`:93`), and it should: bash reads a running
script lazily. The suite under test, `mutate.test.sh`, copies `$REPO_ROOT/scripts`
into its fixture **when it starts**. So a deferred verification mutates the
repo's `scripts/mutate.sh` with a **separate copy** of `mutate.sh`, kept outside
the repository:

```bash
R="$(mktemp -d)"; mkdir -p "$R/scripts"; cp scripts/mutate.sh "$R/scripts/mutate.sh"
bash "$R/scripts/mutate.sh" "$PWD/scripts/mutate.sh" '<one expression>' \
  -- bash "$PWD/.claude/tests/mutate.test.sh"
rm -rf "$R"
```

- **The paths line up.** The runner's `ROOT` is `$R`, so its backup and log land
  in `$R/.claude/state/mutations/`. The target path is absolute, which `:80-83`
  allows. The test command path is absolute, because the runner `cd`s to its own
  `ROOT`.
- **Nothing executes the file being mutated.** The running copy is never the
  file being mutated, and the suite's fixture copy is made after the mutation
  lands.
- **No new state file.** `mktemp -d` keeps the runner out of `.claude/state`, so
  it needs no README row.
- **The restore message is the runner's.** It says `restored (verified ...)`
  against `$R`'s backup. Paste that line, then `git diff --quiet --
  scripts/mutate.sh && echo clean` from the repo.

### C-7 Oracle partition

| Kind | Criteria | Instruction to RED |
|---|---|---|
| **Settled** | The Context's reproductions (counts, the void probe, the hang); the count rule in AC-4; PO decisions 1-3 | Read them out. Re-measuring is welcome. A contradiction is an escalation. |
| **Mechanical** | AC-1 to AC-6 | Pin exactly. Every pipeline is bounded with `timeout`. |
| **Oracle-free** | none | — |

## Deferred verifications

All three run through C-6's out-of-tree runner against the committed GREEN
`scripts/mutate.sh`, each with one expression, adapted to the committed line,
and `-- bash "$PWD/.claude/tests/mutate.test.sh"`. RED cannot run any of them:
the handlers and the diff-based count do not exist yet. **Owner: GATES** for all
three.

- **DV-1, the void probe put back.** Make the PIPE handler restore again:
  `s/trap ':' PIPE/trap 'cp "$BAK" "$FILE"' PIPE/`. AC-2's "the command saw the
  mutated file" **must** go red. Everything else in AC-2 may stay green.
- **DV-2, the stranded backup put back.** In the `cannot write` branch, delete
  the `rm -f "$BAK"` that precedes `die "cannot write`. Do it with a single
  address-plus-substitution on that line, written against the committed text.
  AC-1's "no `.bak`" **must** go red, and AC-1's "file unchanged" must stay green.
- **DV-3, finding E put back, as a wrong value.** Make the per-hunk count use the
  added lines only, replacing `max(b, d)` with `d` in the awk. AC-4's `5d` case
  **must** go red (it reports 0), and its `s/90/-90/` case stays green. Insertion
  and substitution counts cannot see this, which is why the delete case exists.


**DV-1 result (GATES, 2026-10-04).** Run through a runner copy of `mutate.sh` in `mktemp -d` (C-6); restored and verified, then `git diff --quiet -- scripts/mutate.sh` printed `clean`:

```
=== mutate: /c/Users/ryanc/Projects/agentic-dev-harness/scripts/mutate.sh (1 line(s) changed by 210s/trap ':' PIPE/trap 'cp "$BAK" "$FILE"' PIPE/) ===
  210 - trap ':' PIPE
  210 + trap 'cp "$BAK" "$FILE"' PIPE
    FAIL AC-2: the command saw the MUTATED file, not the original
         actual:   export const clamp = (v) => Math.min(90, v)
mutate: 92 passed, 1 failed
=== mutate: command exited 1; restored (verified byte-for-byte against the runner's .bak) ===
clean
```

**DV-2 result (GATES, 2026-10-04).** Run through a runner copy of `mutate.sh` in `mktemp -d` (C-6); restored and verified, then `git diff --quiet -- scripts/mutate.sh` printed `clean`:

```
=== mutate: /c/Users/ryanc/Projects/agentic-dev-harness/scripts/mutate.sh (1 line(s) changed by 312s/rm -f "\$BAK"/:/) ===
  312 -     rm -f "$BAK"
  312 +     :
    FAIL AC-1: no .bak is left behind by a run that wrote nothing
         actual:   1
mutate: 92 passed, 1 failed
=== mutate: command exited 1; restored (verified byte-for-byte against the runner's .bak) ===
clean
```

**DV-3 result (GATES, 2026-10-04).** Run through a runner copy of `mutate.sh` in `mktemp -d` (C-6); restored and verified, then `git diff --quiet -- scripts/mutate.sh` printed `clean`:

```
=== mutate: /c/Users/ryanc/Projects/agentic-dev-harness/scripts/mutate.sh (1 line(s) changed by 266s/total += (b > d) ? b : d/total += d/) ===
  266 -     total += (b > d) ? b : d
  266 +     total += d
    FAIL AC-4: 5d reports 1 line(s) changed, as a whole header line
         actual:   0
    FAIL AC-4: 5d logs the same count
         actual:               20261004T223744Z	src/forty.txt	5d	0 line(s)	command: true	exited 0	restored (verified)
    FAIL AC-4: $d reports 1 line(s) changed, as a whole header line
         actual:   0
    FAIL AC-4: $d logs the same count
         actual:               20261004T223746Z	src/forty.txt	$d	0 line(s)	command: true	exited 0	restored (verified)
    FAIL AC-4: 5{N;s/\n/+/} reports 2 line(s) changed, as a whole header line
         actual:   0
    FAIL AC-4: 5{N;s/\n/+/} logs the same count
         actual:               20261004T223749Z	src/forty.txt	5{N;s/\n/+/}	1 line(s)	command: true	exited 0	restored (verified)
mutate: 87 passed, 6 failed
=== mutate: command exited 1; restored (verified byte-for-byte against the runner's .bak) ===
clean
```

## Amendments

<!-- Acceptance criteria are frozen once the story leaves PLANNED. If one turns
     out to be wrong or unsatisfiable, stop, put it to the product owner, and
     record the change here: which AC, what it said, what it says now, who
     approved it and why. check-boundaries.sh fails a PR whose criteria differ
     from the base branch without an entry here. Omit the section if unused.
     Where the change came from a subagent's claim that the criterion was
     wrong, record the ORCHESTRATOR'S OWN reproduction of it - different
     inputs, not the subagent's code. That claim is also what an agent says
     when it wants to stop failing. -->

## Model guidance

Planned by `bash scripts/plan.sh write HARNESS-029` from `.claude/harness/models.conf`.
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

- PLANNED: `lead-po` resolved to `opus` (`claude-opus-5-5`); no override given in the dispatch.
- RED: `test-developer`, dispatched by the main session, ran on `claude-opus-5-5` (Opus 5.5), as planned. No override.
- GREEN: `feature-developer`, dispatched by the main session, ran on `claude-opus-5-5` (Opus 5.5), as planned. No override.
<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Out of scope

- The `.active` sentinel, `mutate.sh --check` and `gates.sh`'s refusal (item b),
  which is HARNESS-030. The trap structure here is what it builds on.
- Surviving `SIGKILL`. Nothing in a process survives that, which is why item (b)
  exists.
- Diagnosing the root cause of the `| head -1` hang beyond what PO decision 3
  contains. If it persists, that is a finding for the PO, not a widened timeout.
- Letting `mutate.sh` mutate itself. The refusal stays, and C-6 is the
  documented route around it for this story's own verifications.
- Rewording `rules.md`. Its sentence ("everything else it cleans up") becomes
  true, so it does not change.
- Binary targets (C-2), beyond not crashing on them.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

All at one level: the suite drives the fixture copy of `scripts/mutate.sh` as a
process (`make_project_fixture`, the `mutate()` wrapper), because every
criterion is about what that process prints, writes, leaves on disk and does
under a signal or a closed pipe. Six new blocks in `.claude/tests/mutate.test.sh`
after `"a reader that leaves early does not strand the backup"`, one block in
`.claude/tests/settings.test.sh` before its `summary`. Every new pipeline is
under `timeout 60`; every background run is under a polling bound that KILLs it.

| Block | AC | Level / oracle |
|---|---|---|
| AC-1: unwritable target | AC-1 | chmod 444 (precondition asserted), exit, whole-line message, sha, strays, marker |
| AC-2: `\| head -1` | AC-2 | what the command recorded under `$W` (exact string), `timeout` status != 124, restore, strays, log delta + fields |
| AC-3: TERM | AC-3 | TERM to mutate.sh's own pid (from the `.bak` name), bounded waits, restore, strays, log |
| AC-3 control: exit 90 keeps `.bak` | AC-3 control | restore made impossible by the command (`chmod 444`), backup intact |
| AC-4: counts | AC-4 | six cases on `seq 1 40`, each: whole header line, whole preview, log count; plus `s/90/-90/g` header pinned whole |
| AC-5: listing | AC-5 (+ AC-4 preview cap) | `seq 1 60`, `1~2s/$/x/` (30 hunks; see C-3 amendment): whole listing block, `... and 20 more` whole, pure insertion lists nothing, `bash -x` process TOTAL equal for 1 and 30 changes |
| settings AC-6 | AC-6 | README row matched whole (+ reader control on a fixture row), paragraph found / names `.new` / says `killed outright` |

## Handoff: RED -> GREEN

**Model.** RED ran as `test-developer` on `opus` (`claude-opus-5-5`); no
override was given in the dispatch.

### Commands

```bash
bash .claude/tests/mutate.test.sh      # ~2m37s in RED (60s of it is AC-2's timeout firing); 1m12s before this story
bash .claude/tests/settings.test.sh
bash .claude/tests/selftest.test.sh    # floors: mutate 93, settings 27 (100 passed, 0 failed now)
```

All timings above are from local runs on this host (Git Bash, 2026-10-04); none
from CI.

### Failure output (verbatim, abridged to the FAIL lines and the summaries)

```
  HARNESS-029 AC-1: a target it cannot write is left as it was, with nothing stranded
    FAIL AC-1: and says, as a whole line, that the file is unchanged and verified against the backup
         expected: 1
         actual:   0
    FAIL AC-1: no .bak is left behind by a run that wrote nothing
         expected: 0
         actual:   1
    FAIL AC-1: no .new is left behind by a run that wrote nothing
         expected: 0
         actual:   1

  HARNESS-029 AC-2: a reader that leaves after one line neither voids the probe nor hangs
    FAIL AC-2: the command saw the MUTATED file, not the original
         expected: export const clamp = (v) => Math.min(-90, v)
         actual:   export const clamp = (v) => Math.min(90, v)
    FAIL AC-2: the pipeline finishes before the 60s timeout
         timeout killed it (status 124): mutate.sh hung after its reader left

  HARNESS-029 AC-3: TERM while the command runs restores, logs, and leaves nothing

  HARNESS-029 AC-3 control: a restore that really fails still exits 90 and keeps its backup

  HARNESS-029 AC-4: the count is the lines that changed, not the lines that moved
    FAIL AC-4: 2s/$/\ninserted/ reports 1 line(s) changed, as a whole header line
    FAIL AC-4: 2s/$/\ninserted/ previews only removed (old number) and added (new number) lines
    FAIL AC-4: 2s/$/\ninserted/ logs the same count
         expected to contain: 	src/forty.txt	2s/$/\ninserted/	1 line(s)	
         actual:               20261004T220127Z	src/forty.txt	2s/$/\ninserted/	39 line(s)	command: true	exited 0	restored (verified)
    FAIL AC-4: 5d reports 1 line(s) changed, as a whole header line
    FAIL AC-4: 5d previews only removed (old number) and added (new number) lines
         expected:   5 - 5
         actual:     5 - 5
           5 + 6
           6 - 6
           ...
    FAIL AC-4: 5d logs the same count            (actual: 35 line(s))
    FAIL AC-4: $d reports 1 line(s) changed, as a whole header line
    FAIL AC-4: $d previews only removed (old number) and added (new number) lines
         expected:   40 - 40
         actual:
    FAIL AC-4: $d logs the same count            (actual: 0 line(s))
    FAIL AC-4: 5{N;s/\n/+/} reports 2 line(s) changed, as a whole header line
    FAIL AC-4: 5{N;s/\n/+/} previews only removed (old number) and added (new number) lines
    FAIL AC-4: 5{N;s/\n/+/} logs the same count  (actual: 35 line(s))

  HARNESS-029 AC-5: the restore listing is capped, and costs the same however much changed
    FAIL AC-5: the listing is ten restored lines, then exactly '  ... and 20 more'
         (actual: all 30 lines, 1: 1 ... 59: 59, and no "more" line)
    FAIL AC-5: the '  ... and 20 more' line appears once, compared whole
    FAIL AC-5: a pure insertion lists no restored lines
         (actual: "  3: 3" ... "  40: 40", "  41: ")
    FAIL AC-5: 30 changed lines start no more processes than 1
         1 line: 21 processes; 30 lines: 50
         (by command: awk 4 against awk 33; every other command equal)

mutate: 72 passed, 21 failed

    FAIL AC-6: README has one mutations/*.new row, written by scripts/mutate.sh, read by nothing, hand-editable yes
    FAIL AC-6: the mutations/ paragraph names a surviving .new
    FAIL AC-6: and says it means the run was killed outright
settings: 24 passed, 3 failed
```

**Why these are the right failures.** Nothing fails at import: this is a shell
suite against an existing script, so every assertion ran, controls included.
Each red one is the defect the story names - the stranded `.bak`/`.new` and the
missing message (AC-1); the line-number count, preview and listing (AC-4/5);
the missing README row and paragraph (AC-6).

**AC-2 fails BOTH ways, and both are the reproduced defects.** On this host the
run is a **void probe** (the command recorded `Math.min(90, v)`, the original)
**and** a **hang** (`timeout` killed the pipeline at 60s, status 124). The
log line it wrote says `exited 0  restored (verified)`, which is why the log
assertions in AC-2 pass on arrival: they cannot see the void probe, and the
"saw the mutation" assertion is the one that does. No process outlived the run
(`ps` before and after: no leftover `bash`/`head`/`awk` of mine), so the
`timeout` kill reaches the whole pipeline here.

### One line per test

mutate.test.sh, AC-1 block (unwritable target):
- precondition: after `chmod 444`, `cp` onto the target fails on this host - method proof (C-3)
- exits 2 - AC-1
- whole line `mutate: cannot write src/main.ts; it is unchanged, verified against the backup` appears once - AC-1
- file sha identical - AC-1
- no `.bak` - AC-1
- no `.new` - AC-1
- `touch ran-marker` command not run - AC-1

AC-2 block (`timeout 60 bash -c "... -- sh -c 'cat src/main.ts > \"$SEEN\"' 2>&1 | head -1"`):
- `$SEEN` is exactly `export const clamp = (v) => Math.min(-90, v)` - AC-2 "saw the mutation"
- `timeout` status is not 124 - AC-2 "no hang"
- file restored - AC-2
- no `.bak` or `.new` - AC-2
- log line delta is exactly 1 - AC-2
- that line contains `\tsrc/main.ts\ts/90/-90/\t1 line(s)\tcommand: sh -c cat src/main.ts > "<SEEN>"\texited 0\trestored (verified)` - AC-2 "truthful"

AC-3 block (TERM to mutate.sh's pid while `sh -c 'sleep 3'` runs):
- precondition: file mutated within 20s and pid read from the `.bak` name - method
- run ends within 30s of TERM - AC-3 (bounded; KILLed and reported otherwise)
- file restored - AC-3
- no `.new` - AC-3
- no `.bak` - AC-3
- log delta exactly 1 - AC-3
- last log line contains `\trestored (verified)` - AC-3

AC-3 control (command `chmod 444 src/main.ts`, so the restore cannot happen):
- exits 90; says `COULD NOT RESTORE src/main.ts`; keeps exactly one `.bak`; that `.bak` holds the original - AC-3 control

AC-4 block, `count_case <expr> <n> <preview>` on `seq 1 40`, three assertions each
(whole header `=== mutate: src/forty.txt (<n> line(s) changed by <expr>) ===`;
preview equals the given lines exactly; last log line contains
`\tsrc/forty.txt\t<expr>\t<n> line(s)\t`):
- `2s/$/\ninserted/` -> 1, preview `  3 + inserted` - AC-4
- `5d` -> 1, `  5 - 5` - AC-4
- `$d` -> 1, `  40 - 40` - AC-4
- `s/^1$/one/` -> 1, `  1 - 1` / `  1 + one` - AC-4 (green on arrival)
- `s/^\(10\|20\|30\)$/&x/` -> 3, three `-`/`+` pairs - AC-4 control: sum over hunks, unchanged lines between never count (green on arrival)
- `5{N;s/\n/+/}` -> 2, `  5 - 5` / `  6 - 6` / `  5 + 5+6` - AC-4 control: max(2,1), not the sum (3) nor the added side (1)
- `s/90/-90/g` on the 3-line main.ts: whole header `=== mutate: src/main.ts (3 line(s) changed by s/90/-90/g) ===` - AC-4 (green on arrival)

AC-5 block (`seq 1 60`, `1~2s/$/x/`):
- whole header with `30 line(s)` - AC-5 (green on arrival)
- preview has exactly 20 lines - AC-4 cap (green on arrival)
- listing block equals `  1: 1`, `  3: 3`, ... `  19: 19`, `  ... and 20 more` exactly - AC-5
- `  ... and 20 more` appears once as a whole line - AC-5
- pure insertion (`2s/$/\ninserted/` on 40 lines) lists no indented line after the verdict - AC-5
- `bash -x` external-process TOTAL (`trace_script`/`trace_externals`) is equal, and non-zero, for `s/^1$/one/` and `1~2s/$/x/` - AC-5 "reads the restored file once, not once per line"

settings.test.sh, AC-6 block:
- one README row matching `^\| \`mutations/\*\.new\` +\| \`scripts/mutate\.sh\` +\| nothing[^|]*\| yes +\|$` - AC-6
- control: the same reader finds that row in a fixture table - reader proof
- the paragraph opening `` `mutations/` is `` is found - reader proof (green on arrival, fails if the paragraph is renamed)
- it contains `.new` - AC-6
- it contains `killed outright` - AC-6

### Files touched

- `.claude/tests/mutate.test.sh` - `W` scratch dir and the EXIT trap (now also `chmod 644`s main.ts), helpers and six blocks
- `.claude/tests/settings.test.sh` - AC-6 block
- `.claude/tests/floors.conf` - mutate 44 -> 93, settings 22 -> 27, and a HARNESS-029 note
- `.claude/tests/selftest.test.sh` - `COUNTS`: mutate 93, settings 27
- this story: C-3 amended (AC-5 fixture), `## Test plan`, this handoff

### The shape the tests pin (fact, not suggestion)

- **Header line**, whole: `=== mutate: <REL> (<N> line(s) changed by <EXPR>) ===` - today's format, unchanged.
- **Preview lines**: `  <old#> - <text>` for removed, `  <new#> + <text>` for added, in `git diff` order (all of a hunk's `-` before its `+`), no other line of the form `  <digits> [-+] ` before `=== mutate: running`. At most 20.
- **Restore listing**: after the line containing `restored (verified`, lines `  <old#>: <text>` - today's `printf '  %s: %s\n'` - at most 10, then exactly `  ... and <K> more` when K > 0. Nothing else indented after the verdict when the command prints nothing. A pure insertion prints no listing line.
- **Log line**: `STAMP\tREL\tEXPR\t<N> line(s)\tcommand: <CMD[*]>\texited <rc>\trestored (verified)` - today's format; N is the new count.
- **`cannot write` message**, whole line on stderr (the suite merges it): `mutate: cannot write <REL>; it is unchanged, verified against the backup`, exit 2. `die`'s usage text after it is not constrained.
- **The backup's name ends `.<pid>.bak`, where `<pid>` is mutate.sh's own `$$`.** AC-3 reads the pid to TERM from it. Today's `BAK="$MUTDIR/$SAFE.$STAMP.$$.bak"` satisfies this; do not change it.
- **Process count**: no external command may run once per changed line. The `bash -x` trace TOTAL must be equal for 1 and 30 changed lines; per-hunk spawns would fail it too.
- **Strays**: the tests count `*.bak` and `*.new` in `.claude/state/mutations/`; `clear_strays` also removes `*.diff`, so a `$DIFF` left there is not asserted (C-2 says `on_exit` removes it; nothing tests that - your choice to honour it, and you should).
- **README** (AC-6): the row's cells are `` `mutations/*.new` ``, `` `scripts/mutate.sh` ``, a read-by cell **starting with `nothing`**, and `yes`; the `mutations/` paragraph still **opens with** `` `mutations/` is `` and contains `.new` and the phrase `killed outright`.

**Not constrained:** the exact `git diff` invocation (C-2 pins it; the tests
don't see it), the awk program, the trap function names, the `.diff` file's
name or location, the wording of the `COULD NOT RESTORE` text beyond that
substring, any message on the PIPE path, and the binary-file case.

### Green on arrival, and what earns each

Probed with C-6's out-of-tree runner against today's `scripts/mutate.sh`
(`R=$(mktemp -d)`, copy of mutate.sh in `$R/scripts`, target and suite by
absolute path). Each run ended `restored (verified byte-for-byte against $R/...)`
and `git diff --quiet -- scripts/mutate.sh && echo clean` printed `clean`.
Baseline with no mutation: `mutate: 72 passed, 21 failed`.

| Mutation (today's line) | Newly red | Run |
|---|---|---|
| `186s/rm -f "\$NEW" "\$BAK"/:/` (C-4's probe) | **AC-3: no .new is left**, **AC-3: no .bak is left**, plus the existing early-reader and ordinary-run strays, AC-2 strays | `mutate: 67 passed, 26 failed`, `clean` |
| `201s/rm -f "\$NEW"/rm -f "\$NEW" "\$BAK"/` | **control: and keeps exactly one .bak**, **control: and that .bak holds the original** | `mutate: 70 passed, 23 failed`, `clean` |
| `137s/head -20/head -21/` | **AC-4: the preview is capped at 20 lines** (only it) | `mutate: 71 passed, 22 failed`, `clean` |
| `139s/\|\| { cp.*$/\|\| true/` | **AC-1: a target it cannot write exits 2**, **AC-1: the command is not run** (and the whole-line message, already red) | `mutate: 72 passed, 21 failed` (two AC-1 strays turn green, three turn red), `clean` |

Output of the first, as printed (FAIL lines for AC-4/5, red in baseline, filtered out):

```
runner rc=1
=== mutate: /c/Users/ryanc/Projects/agentic-dev-harness/scripts/mutate.sh (1 line(s) changed by 186s/rm -f "\$NEW" "\$BAK"/:/) ===
  186 -   rm -f "$NEW" "$BAK"
  186 +   :
    FAIL no backup is stranded when the reader leaves early
    FAIL an ordinary run leaves no backup either
    FAIL AC-1: and says, as a whole line, that the file is unchanged and verified against the backup
    FAIL AC-1: no .bak is left behind by a run that wrote nothing
    FAIL AC-1: no .new is left behind by a run that wrote nothing
    FAIL AC-2: the command saw the MUTATED file, not the original
    FAIL AC-2: the pipeline finishes before the 60s timeout
    FAIL AC-2: no .bak or .new is left
    FAIL AC-3: no .new is left
    FAIL AC-3: no .bak is left, because the restore was verified
mutate: 67 passed, 26 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /tmp/tmp.YW5PAqudap/.claude/state/mutations/_c_Users_ryanc_Projects_agentic-dev-harness_scripts_mutate.sh.20261004T220221Z.14513.bak) ===
clean
```

Not earned in RED, and why:
- AC-4's `s/^1$/one/`, the three-hunk control, the `s/90/-90/g` whole header and AC-5's `30 line(s)` header: today's line-by-line count gives the same numbers, so no mutation of today's code separates them from the new count. DV-3 (GATES) earns the delete case against the new awk; the three-hunk and join controls are meant to catch a wrong GREEN count, and GREEN will see them red if its count is wrong.
- AC-1 "file byte-identical": the target is read-only, so no mutation of the script can change it. DV-2 asserts it stays green.
- AC-2's restore, strays and log assertions: the same properties the existing early-reader block pins (earned when `b38f5b3` landed); here they ride along to show a fix for the void probe did not cost the cleanup.
- AC-6 "paragraph is found": a reader proof, red if the paragraph's opening is renamed.

### Negative controls - expected values

No suite failed at import, so these were all measured by the suite itself
against today's mutate.sh. GREEN confirms the "after GREEN" column.

| Control | Threshold | Today (measured) | After GREEN (expected) |
|---|---|---|---|
| AC-4 three hunks `s/^\(10\|20\|30\)$/&x/` | count == 3 | 3 (green) | 3 |
| AC-4 join `5{N;s/\n/+/}` | count == 2 | 35 | 2 (sum would give 3, added-only 1) |
| AC-4 `5d` (DV-3's target) | count == 1 | 35 | 1 (added-only would give 0) |
| AC-4 `s/90/-90/g` | count == 3 | 3 (green) | 3 |
| AC-2 what the command saw | `Math.min(-90, v)` | `Math.min(90, v)` | `Math.min(-90, v)` |
| AC-2 timeout status | != 124 | 124 (hung 60s) | 0 or 141 (head's pipeline) - anything but 124 |
| AC-5 process TOTAL, 1 vs 30 changes | equal | 21 vs 50 (awk 4 vs 33) | equal |
| AC-3 control `.bak` count after exit 90 | == 1 | 1 (green) | 1 |
| AC-1 precondition | `cp` refused | refused | refused (fails loudly on a root runner) |

### Deferred verifications

RED cannot run DV-1, DV-2 or DV-3: they mutate the GREEN handlers and the
diff-based count, which do not exist yet. They stay with GATES, as the story
says. Note for whoever runs them: DV-1's expression must be written against the
committed `trap ':' PIPE` line; DV-3's `5d` case must go red with header
`(0 line(s) changed by 5d)`.

### Discovered, for the implementation

- **On Git Bash, `$!` of a backgrounded command can be a wrapper**, not the bash
  running it (measured: `bash -c '...' > f &` gave `$!` = a bash whose child was
  the trapped bash; a TERM to `$!` reached no trap and `wait` reported 143 while
  the real one kept running). With `( cd ... && exec bash scripts/mutate.sh ... ) &`
  the two coincided, but the test does not rely on that.
- **AC-2 includes `2>&1` into `head`.** With PIPE trapped as a no-op, every
  later write fails with EPIPE and bash's `printf` complains on stderr - which
  is the same dead pipe. That is harmless, but it means no message on that path
  can be read by anyone; do not put anything there that matters.
- **The suite now takes ~2.5 min in RED** because AC-2's 60s timeout fires; GREEN
  should bring it back near 1m15s plus the new blocks (AC-3 adds ~4s of sleep).
  If AC-2 still reports 124 with PO decision 3 in place, C-2 says stop and
  record it, not widen the bound.
- `count_case` writes `src/forty.txt` and AC-5 writes `src/sixty.txt` in the
  fixture; both are removed after their blocks.

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

    run:    2026-10-04T22:38:30Z
    commit: 47c66e3 (working tree had uncommitted changes)
    tree:   373d54c3dbda29cd974d1d511534a8859e24cfab
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


**PLANNED, 2026-10-04 (Lead PO).**

- **Split.** Items (a) and (c) are one story, because both are `mutate.sh`
  internals in one suite with one output path. Item (b) is HARNESS-030, cut once
  this one closes.
- **PO decision 1: PIPE.** PIPE gets a no-op trap, so it never restores. That
  fixes a void-probe defect, reproduced 3 of 3: the command ran against the
  original while the log said `restored (verified)`.
- **PO decision 2: the diff.** It comes from `git diff --no-index -U0`, with its
  config pinned, rather than `diff` (not in the harness's stated deps) or an awk
  longest-common-subsequence.
- **PO decision 3: no pipeline into the script's own stdout.** This contains the
  `| head -1` hang, which reproduced 4 of 4 and 3 of 3 on this host. The cause is
  not known.
- **Self-mutation.** C-6 shows how to mutate `mutate.sh` without it mutating
  itself: an out-of-tree runner copy.
- **Timing.** `mutate.test.sh` takes 1m12s here.
- **Dependencies.** `depends_on` is empty, as instructed.
- GATES (2026-10-04): full `bash scripts/selftest.sh`: `assertion floors: all
  22 suite(s) met their declared floor (2148 assertions executed, 1918
  declared)`, `22 harness suite(s) passed` (phase-guard included, which exempts
  `mutate.sh`), 2269 s. GREEN's two own choices, kept: `2>/dev/null` on the
  three stdout `printf`s (hides only `write error: Broken pipe` after a reader
  leaves), and downstream's `RESTORED` guard ahead of `put_back`'s content
  check.

**DONE, 2026-10-05.** Merged in #106 (merge commit be57c08), release 72. The
VERSION bump lands in this DONE commit. `phase.sh set DONE --force` was run on
`main`, overriding the branch check. PR CI: `gates` passed in 1m47s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37243241446),
`boundaries` in 8s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37243241365).
No epic. Next in the port audit: group 4's second half, the `.active` sentinel,
`mutate.sh --check` and gates refusing behind a stranded mutation.
