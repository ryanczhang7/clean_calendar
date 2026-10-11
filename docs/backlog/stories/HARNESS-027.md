---
id: HARNESS-027
title: A failing gate's log survives the passing re-run
slug: a-failing-gate-s-log-survives-the-passin
epic: 
type: fix
status: done
phase: DONE
branch: story/HARNESS-027-a-failing-gate-s-log-survives-the-passin
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [scripts/gates.sh, .claude/state/README.md, .claude/tests/gates.test.sh, .claude/tests/settings.test.sh, .claude/tests/fixtures/manifest/project.run.golden, .claude/tests/fixtures/manifest/crlf.run.golden, .claude/tests/sigpipe.test.sh, .claude/tests/floors.conf, .claude/tests/selftest.test.sh]         # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

This story ports manga-translator's MT-046 (`e5241a0`), the third item of group
3 ("gate correctness") in `docs/wiki/audits/manga-translator-port-2026-10-02.md`.
The source is issue #97.

`scripts/gates.sh` writes each gate's output to
`.claude/state/gate-logs/<id>.log` with `tee`, and every run overwrites that file
(`gates.sh:504-506`). So the re-run someone starts to check whether a failure was
a flake destroys the only copy of the failure. The fix keeps the last run of each
gate that did not pass, in `<id>.failed.log`, stamped with the time, the commit
and the tree hash.

**What the audit decided, which this story implements without reopening:** port
MT-046. That includes the `commit_with_note` refactor, so the story record and
the kept log can never describe one run differently. It also includes a new
`.claude/state/README.md` row, which `settings.test.sh` cross-checks.

**Re-verified against `550c333`, 2026-10-04:**
- Nothing in upstream writes or reads `*.failed.log`.
- `<id>.log` is rewritten on every run and is never deleted.
- The outcomes upstream classifies are `pass`, `fail`, `noevidence` and
  `blocked`. There is no `environment` outcome yet; MT-037 adds it later, and
  this story's `!= pass` rule covers it without change.

**Required gate that would fail if this broke:** `unit`, through `bash
scripts/selftest.sh` and the `gates` and `settings` suites. Every gate is
UNCONFIGURED here, so in practice CI's `selftest.sh` step judges it.

## Acceptance criteria

"Did not pass" means any outcome other than `pass` in `gates.sh`'s outcome
classification (today `fail`, `noevidence` or `blocked`), for a required or an
optional gate alike. It is the outcome, not the printed result word. A KNOWN or
WARN gate did not pass. A gate that is never executed (unconfigured, missing
cwd, not selected by `--gate`, left out by `--fast`, or any gate under `--list`
or `--audit`) has no outcome.

- **AC-1.** Given a gate whose command runs and does not pass, when `gates.sh`
  finishes, then `.claude/state/gate-logs/<id>.failed.log` exists and is
  exactly six header lines followed by that run's log, byte-identical to
  `<id>.log`. The header lines are:
  1. `# gates.sh: last failing run of gate '<id>'`
  2. `# outcome: <outcome>`
  3. `# run:     <UTC time the gate started, YYYY-MM-DDTHH:MM:SSZ>`
  4. `# commit:  <short HEAD>`, with ` (working tree had uncommitted changes)`
     when that applies
  5. `# tree:    <gate tree hash>`
  6. `# ----`

  The commit line equals what the same run records as `commit:` in the story's
  `## Gate results`.
- **AC-2.** Given a `<id>.failed.log` kept from an earlier failing run, when the
  same gate runs again and passes, then `<id>.failed.log` is byte-identical to
  what it was before, and `<id>.log` holds the passing run.
- **AC-3.** Given a kept `<id>.failed.log`, when the same gate fails again with
  different output, then the file holds only the newer run. None of the older
  output remains, and `gate-logs/` holds exactly one `<id>.failed.log` and no
  other copy of that gate.
- **AC-4.** Given no `<id>.failed.log`, when the gate runs and passes, including
  a PASS annotated for a missing evidence line, then no `<id>.failed.log` is
  created.
- **AC-5.** AC-1 holds under `--fast` and under `--gate <id>`. A gate that a run
  does not execute leaves its kept `<id>.failed.log` byte-identical: here,
  `--gate <other id>` where the other gate fails.
- **AC-6.** For a gate that does not pass, stdout carries the line `failing log
  kept: .claude/state/gate-logs/<id>.failed.log`, printed right after that
  gate's output and before the next `=== gate:` header or the summary. For a
  gate that passes, no such line is printed. The `## Gate results` record is
  unchanged by this story.
- **AC-7.** `.claude/state/README.md`'s table has a row for
  `gate-logs/*.failed.log`, written by `scripts/gates.sh`, hand-editable `yes`.
  `settings.test.sh`'s existing check of the settings/README pair still reports
  no disagreements.

## Contract

**RED may amend any block below in place, with a reason stated in the block.
GREEN builds what the amended block says.**

**Writes:** `scripts/gates.sh`, `.claude/state/README.md`, `.claude/tests/gates.test.sh`, `.claude/tests/settings.test.sh`, `.claude/tests/fixtures/manifest/project.run.golden`, `.claude/tests/fixtures/manifest/crlf.run.golden`, `.claude/tests/sigpipe.test.sh`, `.claude/tests/floors.conf`, `.claude/tests/selftest.test.sh`

### C-1 `scripts/gates.sh` (lines at `550c333`)

**`commit_with_note()`** is new. Define it immediately above `record_in_story`
(`:245`). It prints `<short HEAD><note>` with no trailing newline, using exactly
today's two expressions from `:251-253`:
- `git rev-parse --short HEAD || printf 'no commit'`;
- the `status --porcelain -- . ':!docs'` dirty test.

`record_in_story` keeps its signature (`<story-file> <result-text>
<summary-lines>`) and calls `commit="$(commit_with_note)"`. Its `commit:` line
must stay byte-identical. That is the refactor's whole constraint, and the story
records of every existing assertion pin it.

**`started`.** Add `started=$(date -u +%Y-%m-%dT%H:%M:%SZ)` beside `start=` at
`:505`, before the command runs.

**The keep block.** It goes after the `esac` that closes the outcome `case`
(`:587`), inside the loop, before `done < "$CONF"`:

```bash
  if [ "$outcome" != pass ]; then
    { printf '%s\n' \
        "# gates.sh: last failing run of gate '$id'" \
        "# outcome: $outcome" \
        "# run:     $started" \
        "# commit:  $(commit_with_note)" \
        "# tree:    $(gate_tree_hash)" \
        "# ----"
      cat "$log"
    } > "$LOGDIR/$id.failed.log"
    printf 'failing log kept: .claude/state/gate-logs/%s.failed.log\n' "$id"
  fi
```

- The file is replaced whole with `>`. Nothing ever deletes it.
- It is not added to `$results`.
- `--list` and `--audit` never reach this point, because their branches
  `continue` before the command runs. RED confirms that.

### C-2 The callers this changes, all of them

The lesson from HARNESS-026 is to grep every setup rather than sample. Two kinds
of existing assertion see this change:

1. **Byte-identity goldens of a full run.**
   - `gates.test.sh:1059-1067` (HARNESS-024 AC-3) compares `gates_golden <fixture>
     run` against `.claude/tests/fixtures/manifest/{project,broken,crlf}.run.golden`.
   - `project.conf`'s `e2e` gate is optional and exits 1 with a launch-failure
     line. Its outcome is `blocked`, so it gets a kept log and a new
     `failing log kept: .claude/state/gate-logs/e2e.failed.log` line.
   - That affects **`project.run.golden` and `crlf.run.golden`**.
   - `broken.run.golden` runs only `ok` and `bare`, which both pass. It must not
     change.

   **PO decision 1. RED updates the two goldens by inserting exactly that one
   line** after `RuntimeError: no device here`. It records `diff <old> <new>` in
   the handoff, showing exactly one added line and nothing else; the comparison
   needs nothing platform-specific. `gates_golden`'s normalisation is **not**
   widened to filter the line out, because that would weaken a byte-identity
   oracle.
2. **The whole-output and line-count checks** in `gates.test.sh`. `grep -n
   'END { print NR }\|wc -l'` finds only manifest line counts (`:996`, `:1156`),
   not run output. Every other run assertion is an anchored `count_re` or
   `count_line`, or `assert_contains`, which one extra line does not move. RED
   re-runs this grep, confirms the result, and records it in the handoff.

Also checked:
- Other suites that run a full `gates.sh`: `boundaries.test.sh` (`>/dev/null`),
  `ci-local.test.sh` and `worktree.test.sh`. None compares whole stdout.
- `gate_tree_hash` excludes ignored files and `.claude/state` is ignored, so a
  kept log never changes the stamp.

### C-3 Tests: trimmed to the criteria

Downstream added 342 lines. This story needs about 25 assertions, in one new
block at the end of `gates.test.sh`:
`HARNESS-027 AC-1..AC-6  a failing gate's log survives the passing re-run`.

- **Fixture.** The suite's `FIX`. Use one gate `flaky` whose command reads a
  marker file, so the same manifest fails, then passes, then fails differently:
  `if [ -f fail-a ]; then printf 'boom A\n'; exit 1; elif [ -f fail-b ]; then printf 'boom B\n'; exit 1; else printf 'Tests  3 passed (3)\n'; fi`.
  Give it an `evidence` line. Add a second gate, `steady`, that always passes, and a third, `broke`, that always fails
  (`printf 'nope\n'; exit 1`). AC-5's not-executed case runs `--gate broke`
  after `flaky.failed.log` has been kept.

  **Amended in RED (2026-10-04, Test Developer).** Three specifics the block
  left open, fixed as follows, and GREEN builds nothing different because of
  them: (a) the markers are `.claude/state/h27/fail-a` and `fail-b`, not files
  at the fixture root - an untracked root file classifies as source, and a full
  run with an active story then refuses to record (HARNESS-014), while AC-1
  compares the header with that record; (b) `steady` has **no** evidence line,
  so its pass is the "PASS annotated for a missing evidence line" AC-4 names;
  (c) `broke` is **optional**, so it is printed WARN with outcome `fail` - the
  "did not pass is the outcome, not the printed word" case. The block runs
  the one manifest seven times (two more than a strict minimum, for AC-1's
  record comparison and AC-5's `--gate flaky`) and executes 53 assertions, not
  about 25: the extras are the per-mode header lines and one control per run
  saying the fixture reached the outcome it claims.
- **Comparing the body to the log.** Strip the first six lines and `cmp` against
  `<id>.log`. Use `tail -n +7` to strip them, which is POSIX and the same under
  every platform's tools. Do not use awk here (HARNESS-025's lesson).
- **The header.** Anchored whole-line matches:
  - the outcome is `^# outcome: fail$`;
  - the run is `^# run:     [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$`;
  - the commit equals the `commit:` value the same run wrote into T-1's
    `## Gate results`, with the leading four-space indent removed;
  - the tree equals `gate_tree_hash` computed independently, as
    `boundaries.test.sh:1197-1206` does.
- **AC-2 and AC-5's "unchanged".** `cmp` against a copy taken before the run.
- **AC-4.** A fresh `gate-logs/` holds no `steady.failed.log` after a passing
  run.
- **AC-6.** The line sits between the gate's output and the next header. Check
  it by line order in the output, using `grep -n` positions, not awk.
- **AC-7 goes in `settings.test.sh`.** Port downstream's `failed_row` reader and
  its control: 2 assertions. If its awk `-F'|'` with `gsub` on `$2`, `$3` and
  `$(NF-1)` might behave differently between gawk and mawk, RED replaces it with
  a `grep -F` of the exact row text
  ``| `gate-logs/*.failed.log` | `scripts/gates.sh` |``, and records which it chose.

**Floors.** Raise `gates` (281) and `settings` (20) to the executed counts
measured in RED. Each changes in both `.claude/tests/floors.conf` and the
`COUNTS` block of `.claude/tests/selftest.test.sh`, with a dated comment in
`floors.conf`.

### C-4 The state README row

Add this after the `gate-logs/*.log` row:

```
| `gate-logs/*.failed.log` | `scripts/gates.sh` | you, when a failure did not reproduce | yes |
```

Then add a short paragraph under "The exhaust": the file is the last run of that
gate that did not pass, replaced whole by the next one, never removed by a pass,
and deleted by hand once the cause is understood. The `yes` needs no
`settings.json` rule, and the existing `no disagreements` assertion
(`settings.test.sh:136`) must stay green.

### C-5 Line pins

`.claude/tests/sigpipe.test.sh:567-568` pins `scripts/gates.sh:74` and
`scripts/gates.sh:526`.
- C-1 adds lines above `:526`: the helper (net, after `record_in_story` loses its
  two dirty lines) and `started=`. So **`:526` moves**, and GREEN updates that
  one number in `sigpipe.test.sh` to the line where `why="could not launch: $(`
  then sits. That number and nothing else changes.
- `:74` must not move.
- The prose mentions at `sigpipe.test.sh:983/1003` are left alone.

After GREEN, run `bash scripts/check-sigpipe.sh` and `bash
scripts/check-grep-count.sh` and paste both summary lines. The new
`$(commit_with_note)` and `$(gate_tree_hash)` are substitutions with no pipeline.

### C-6 What passes on arrival

AC-4, AC-5's "a gate not executed leaves it alone", and AC-7's
`no disagreements` pass against today's `gates.sh`, because nothing writes a
kept log yet. They can only be earned once the feature exists, so they are
earned in GATES (DV-2, DV-3). RED says so in the handoff. AC-1, AC-2, AC-3,
AC-5's `--fast`/`--gate` half, AC-6 and AC-7's row are red in RED by
construction. Paste that run.

**Amended in RED (2026-10-04, Test Developer).** AC-5's not-executed assertion
is **red** in RED, not green on arrival: it compares `flaky.failed.log` against
a copy taken before `--gate broke`, and in RED no such file exists to copy, so
it reports `missing:`. It still needs DV-3 to be earned in GATES, because once
the file exists it would pass against any implementation that never touches
other gates' files. AC-7's assertion is a `grep -E` row reader, not
downstream's awk (see `## Test plan`).

### C-7 Commands

| When | Command |
|---|---|
| RED and GREEN | `bash .claude/tests/gates.test.sh` (about 1.5 min here) and `bash .claude/tests/settings.test.sh` |
| After GREEN | `bash .claude/tests/sigpipe.test.sh`, `bash .claude/tests/selftest.test.sh`, `bash scripts/check-sigpipe.sh`, `bash scripts/check-grep-count.sh` |
| GATES | `bash .claude/tests/boundaries.test.sh`, then `bash scripts/gates.sh` from the story branch |
| Once, before REVIEW | the full `bash scripts/selftest.sh`, in the background (CI runs it in about 2 min) |

**`mutate.sh` takes one expression.** For two edits, use newline-separated sed
commands inside that one argument.

### C-8 Oracle partition

| Kind | Criteria | Instruction to RED |
|---|---|---|
| **Settled** | The header format, the file name and the printed line (from downstream, kept), and PO decision 1 | Read them out. |
| **Mechanical** | AC-1 to AC-7 | Pin exactly: `cmp` for bytes, anchored lines for text. |
| **Oracle-free** | none | |

## Deferred verifications

Each runs through `bash scripts/mutate.sh scripts/gates.sh '<one expression>'
-- bash .claude/tests/gates.test.sh`, against the committed GREEN code. None can
run in RED, because the keep block does not exist yet. **Owner: GATES** for all
three.

- **DV-1: the defect put back.** Make the keep block never fire. The expression
  is `s/if \[ "\$outcome" != pass \]; then/if false; then/`. AC-1, AC-2's "still
  there after the pass", AC-3 and AC-6's line **must** go red. AC-4 stays green.
- **DV-2: earning AC-4.** Make the keep block fire on every executed gate, with
  `s/if \[ "\$outcome" != pass \]; then/if true; then/`. AC-4's "no
  `steady.failed.log` after a pass" and AC-6's "no line for a passing gate"
  **must** go red.
- **DV-3: earning AC-5's not-executed half.** Make every gate write one shared
  file:
  `s|> "\$LOGDIR/\$id.failed.log"|> "$LOGDIR/flaky.failed.log"|`, with RED or
  GATES adapting the quoting to the committed line. AC-5's "`--gate <other>`
  leaves `flaky.failed.log` byte-identical" **must** go red. The scenario is a
  kept `flaky.failed.log` followed by `--gate broke`, where the other
  gate fails.


**DV-1 result (GATES, 2026-10-04).** Restored and verified:

```
=== mutate: scripts/gates.sh (1 line(s) changed by 602s/if \[ "\$outcome" != pass \]; then/if false; then/) ===
  602 -   if [ "$outcome" != pass ]; then
  602 +   if false; then
    FAIL AC-3: gates.sh full run over project.conf is byte-identical to the pre-rewrite golden
    FAIL AC-3: gates.sh full run over crlf.conf is byte-identical to the pre-rewrite golden
    FAIL AC-1: an optional gate printed WARN still did not pass, and keeps broke.failed.log
    FAIL AC-6: and the kept line is printed for it, once
    FAIL AC-1: a failing gate leaves flaky.failed.log
    FAIL AC-1 header 1 names the gate
    FAIL AC-1 header 2 is the outcome
    FAIL AC-1 header 3 is a UTC time, YYYY-MM-DDTHH:MM:SSZ
    FAIL AC-1 header 3 is no earlier than the run was started
    FAIL AC-1 header 4 is the commit line the same run recorded in ## Gate results
    FAIL AC-1 header 4 is the short HEAD with the uncommitted-changes note
    FAIL AC-1 header 5 is gate_tree_hash, computed independently
    FAIL AC-1 header 5 is the tree the same run recorded
    FAIL AC-1 header 6 closes the header
    FAIL AC-1: after six header lines, the run's log byte for byte
    FAIL AC-1: and it is this run's log
    FAIL AC-6: the kept line is printed once
    FAIL AC-6: the kept line comes right after flaky's output
    FAIL AC-6: and before the next gate's header
    FAIL AC-2: after the pass, flaky.failed.log is byte-identical
    FAIL AC-3: the newer failure is kept
    FAIL AC-3: none of the older output remains
    FAIL AC-3: one header, replaced rather than appended
    FAIL AC-3: header then the newer log, byte for byte
    FAIL AC-3: gate-logs/ holds flaky.failed.log and flaky.log, nothing else for flaky
    FAIL AC-5 --fast: a failing gate leaves flaky.failed.log
    FAIL AC-5 --fast: header 1
    FAIL AC-5 --fast: header 2
    FAIL AC-5 --fast: header 4
    FAIL AC-5 --fast: log byte for byte
    FAIL AC-5 --fast: kept line, once
    FAIL AC-5 --gate flaky: a failing gate leaves flaky.failed.log
    FAIL AC-5 --gate flaky: header 2
    FAIL AC-5 --gate flaky: this run's log, byte for byte
    FAIL AC-5 --gate flaky: and it is this run's
    FAIL AC-5 --gate flaky: kept line, once
    FAIL AC-5: --gate broke leaves flaky.failed.log byte-identical
gates: 297 passed, 37 failed
=== mutate: command exited 1; restored (verified byte-for-byte against its .bak) ===
```

**DV-2 result (GATES, 2026-10-04).** Restored and verified:

```
=== mutate: scripts/gates.sh (1 line(s) changed by 602s/if \[ "\$outcome" != pass \]; then/if true; then/) ===
  602 -   if [ "$outcome" != pass ]; then
  602 +   if true; then
    FAIL AC-3: gates.sh full run over project.conf is byte-identical to the pre-rewrite golden
    FAIL AC-3: gates.sh full run over broken.conf is byte-identical to the pre-rewrite golden
    FAIL AC-3: gates.sh full run over crlf.conf is byte-identical to the pre-rewrite golden
    FAIL AC-4: a plain pass leaves no flaky.failed.log
    FAIL AC-4: a pass annotated for no evidence line leaves no steady.failed.log
    FAIL AC-6: no kept line for the gate that passed plainly
    FAIL AC-6: no kept line for the annotated pass
    FAIL AC-2: after the pass, flaky.failed.log is byte-identical
    FAIL AC-6: the pass printed no kept line for flaky
gates: 325 passed, 9 failed
=== mutate: command exited 1; restored (verified byte-for-byte against its .bak) ===
```

**DV-3 result (GATES, 2026-10-04).** Restored and verified:

```
=== mutate: scripts/gates.sh (1 line(s) changed by 611s|> "\$LOGDIR/\$id.failed.log"|> "$LOGDIR/flaky.failed.log"|) ===
  611 -     } > "$LOGDIR/$id.failed.log"
  611 +     } > "$LOGDIR/flaky.failed.log"
    FAIL AC-4: a plain pass leaves no flaky.failed.log
    FAIL AC-1: an optional gate printed WARN still did not pass, and keeps broke.failed.log
    FAIL AC-1 header 1 names the gate
    FAIL AC-1: after six header lines, the run's log byte for byte
    FAIL AC-1: and it is this run's log
    FAIL AC-2: after the pass, flaky.failed.log is byte-identical
    FAIL AC-3: the newer failure is kept
    FAIL AC-3: one header, replaced rather than appended
    FAIL AC-3: header then the newer log, byte for byte
    FAIL AC-5 --fast: header 1
    FAIL AC-5 --fast: log byte for byte
    FAIL AC-5: --gate broke leaves flaky.failed.log byte-identical
gates: 322 passed, 12 failed
=== mutate: command exited 1; restored (verified byte-for-byte against its .bak) ===
```

DV-1 reproduces RED's 37 failures exactly; DV-2 earns AC-4 and AC-6's "nothing for a pass"; DV-3 earns AC-5's "`--gate broke` leaves `flaky.failed.log` byte-identical". All three were run detached (`nohup`).

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

Planned by `bash scripts/plan.sh write HARNESS-027` from `.claude/harness/models.conf`.
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

- Keeping more than one failure per gate, or rotating old ones. MT-046's design
  is "last failure only", and the audit kept that design.
- Removing a kept log when its gate later passes. Keeping it is the point.
- Any change to the `## Gate results` record format, or to `last-gate-run`.
- Documenting the file in the `quality-gates` skill. The printed line and the
  state README row are what an agent meets.
- MT-037 `skipped-when`, the next story in group 3. It adds the `environment`
  outcome, and that outcome is covered here by `!= pass` without change.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

Level: integration, `gates.sh` run end to end in the suite's `FIX` fixture
(real scripts and hooks copied in), because every criterion is about files and
stdout of a whole run. AC-7 is a static read of the shipped README.

**`.claude/tests/gates.test.sh`**, new last block `HARNESS-027 AC-1..AC-6`.
One manifest - `flaky` (required, evidence line, reads
`.claude/state/h27/fail-a|fail-b`), `steady` (required, no evidence line),
`broke` (optional, always `exit 1`) - on `story/T-1-fixture` with T-1 active at
GATES, run seven times:

| Run | Mode | State | Criteria |
|---|---|---|---|
| R0 | full | no marker | AC-4 (plain pass, annotated pass), AC-6 (no line for a pass), AC-1/AC-6 on `broke` (WARN, outcome fail) |
| R1 | full | `fail-a` | AC-1 all six header lines, body, commit = the record's `commit:`, tree = the record's and an independent `gate_tree_hash`; AC-6 order and "not in ## Gate results" |
| R2 | full | none | AC-2 (`cmp` against R1's copy), `flaky.log` holds the pass |
| R3 | full | `fail-b` | AC-3: `boom B` present, `boom A` absent, one header, body, `ls` shows `flaky.failed.log flaky.log` only |
| R4 | `--fast` | `fail-a`, kept file removed | AC-5 + AC-1 headers 1/2/4, body, AC-6 line |
| R5 | `--gate flaky` | `fail-b`, kept file removed | AC-5 + AC-1 header 2, body, this run's output, AC-6 line |
| R6 | `--gate broke` | after R5 | AC-5 not-executed: `flaky.failed.log` byte-identical, no line for flaky |

Bytes are compared with `tail -n +7 | cmp -s - <id>.log` and `cmp -s`. Every
text needle is a whole line (`count_line`, `grep -cxF`, `grep -m1 -nxF`) or an
anchored regex; the `run:` line uses `grep -cE` because awk interval
expressions are not in every mawk. No awk of the block's own.

**`.claude/tests/settings.test.sh`**, new block after `no disagreements`:
`failed_row <readme> <path cell>` counts lines matching
``^\| `<path>` +\| `scripts/gates\.sh` +\|.*\| yes +\|$`` (path regex-escaped).
Chose this over downstream's awk `-F'|'`/`gsub` reader (C-3 allowed either):
`grep -E` has no field-splitting or gsub dialect to differ between gawk and
mawk. It pins the first two cells and the last, which is what AC-7 states, and
leaves the prose cell free.

**Goldens (PO decision 1):** `project.run.golden` and `crlf.run.golden` gain the
single line `failing log kept: .claude/state/gate-logs/e2e.failed.log` after
`RuntimeError: no device here`. `gates_golden`'s normalisation is untouched.

**Floors:** `gates` 281 -> 334, `settings` 20 -> 22, in `floors.conf` (dated
note at its foot) and `selftest.test.sh` `COUNTS`.

## Handoff: RED -> GREEN

**RED, 2026-10-04, Test Developer** (dispatched as `test-developer`, agent
`model: opus`; ran as `claude-opus-5-5`; no override given in the dispatch).

**Commands.** `bash .claude/tests/gates.test.sh` (2m07s locally, Windows Git
Bash; about 30 s more than before the block - seven extra `gates.sh` runs) and
`bash .claude/tests/settings.test.sh`. All timings here are local, none from CI.

**Failure output, verbatim** (gates.sh, state README and sigpipe pins all
untouched):

```
  HARNESS-024 AC-3: gates.sh prints what it printed before the rewrite, byte for byte
    FAIL AC-3: gates.sh full run over project.conf is byte-identical to the pre-rewrite golden
         20d19
         < failing log kept: .claude/state/gate-logs/e2e.failed.log
    FAIL AC-3: gates.sh full run over crlf.conf is byte-identical to the pre-rewrite golden
         20d19
         < failing log kept: .claude/state/gate-logs/e2e.failed.log

  HARNESS-027 AC-1..AC-6  a failing gate's log survives the passing re-run
    FAIL AC-1: an optional gate printed WARN still did not pass, and keeps broke.failed.log
         expected: yes
         actual:   no
    FAIL AC-6: and the kept line is printed for it, once
         expected: 1
         actual:   0
    FAIL AC-1: a failing gate leaves flaky.failed.log
         expected: yes
         actual:   no
    FAIL AC-1 header 1 names the gate
         expected: # gates.sh: last failing run of gate 'flaky'
         actual:   
    FAIL AC-1 header 2 is the outcome
         expected: # outcome: fail
         actual:   
    FAIL AC-1 header 3 is a UTC time, YYYY-MM-DDTHH:MM:SSZ
         expected: 1
         actual:   0
    FAIL AC-1 header 3 is no earlier than the run was started
         expected: yes
         actual:   no ([] before [2026-10-04T17:57:25Z])
    FAIL AC-1 header 4 is the commit line the same run recorded in ## Gate results
         expected: # commit:  bcafb4b (working tree had uncommitted changes)
         actual:   
    FAIL AC-1 header 4 is the short HEAD with the uncommitted-changes note
         expected: # commit:  bcafb4b (working tree had uncommitted changes)
         actual:   
    FAIL AC-1 header 5 is gate_tree_hash, computed independently
         expected: # tree:    7a9007398605cab653649d77765cca56c79dd2c9
         actual:   
    FAIL AC-1 header 5 is the tree the same run recorded
         expected: # tree:    7a9007398605cab653649d77765cca56c79dd2c9
         actual:   
    FAIL AC-1 header 6 closes the header
         expected: # ----
         actual:   
    FAIL AC-1: after six header lines, the run's log byte for byte
         expected: identical
         actual:   no flaky.failed.log was written
    FAIL AC-1: and it is this run's log
         expected: 1
         actual:   no flaky.failed.log
    FAIL AC-6: the kept line is printed once
         expected: 1
         actual:   0
    FAIL AC-6: the kept line comes right after flaky's output
         expected: yes
         actual:   no (output at 4, kept line at absent)
    FAIL AC-6: and before the next gate's header
         expected: yes
         actual:   no (kept line at absent, next header at 6)
    FAIL AC-2: after the pass, flaky.failed.log is byte-identical
         expected: identical
         actual:   missing: /tmp/tmp.kBmS6OwhYN/.claude/state/h27/flaky.first
    FAIL AC-3: the newer failure is kept
         expected: 1
         actual:   no flaky.failed.log
    FAIL AC-3: none of the older output remains
         expected: 0
         actual:   no flaky.failed.log
    FAIL AC-3: one header, replaced rather than appended
         expected: 1
         actual:   no flaky.failed.log
    FAIL AC-3: header then the newer log, byte for byte
         expected: identical
         actual:   no flaky.failed.log was written
    FAIL AC-3: gate-logs/ holds flaky.failed.log and flaky.log, nothing else for flaky
         expected: flaky.failed.log flaky.log
         actual:   flaky.log
    FAIL AC-5 --fast: a failing gate leaves flaky.failed.log
         expected: yes
         actual:   no
    FAIL AC-5 --fast: header 1
         expected: # gates.sh: last failing run of gate 'flaky'
         actual:   
    FAIL AC-5 --fast: header 2
         expected: # outcome: fail
         actual:   
    FAIL AC-5 --fast: header 4
         expected: # commit:  bcafb4b (working tree had uncommitted changes)
         actual:   
    FAIL AC-5 --fast: log byte for byte
         expected: identical
         actual:   no flaky.failed.log was written
    FAIL AC-5 --fast: kept line, once
         expected: 1
         actual:   0
    FAIL AC-5 --gate flaky: a failing gate leaves flaky.failed.log
         expected: yes
         actual:   no
    FAIL AC-5 --gate flaky: header 2
         expected: # outcome: fail
         actual:   
    FAIL AC-5 --gate flaky: this run's log, byte for byte
         expected: identical
         actual:   no flaky.failed.log was written
    FAIL AC-5 --gate flaky: and it is this run's
         expected: 1
         actual:   no flaky.failed.log
    FAIL AC-5 --gate flaky: kept line, once
         expected: 1
         actual:   0
    FAIL AC-5: --gate broke leaves flaky.failed.log byte-identical
         expected: identical
         actual:   missing: /tmp/tmp.kBmS6OwhYN/.claude/state/h27/flaky.before-broke

gates: 297 passed, 37 failed
```

```
  HARNESS-027 AC-7: the kept failing log has its own row
    FAIL AC-7: README has one gate-logs/*.failed.log row, written by scripts/gates.sh, hand-editable yes
         expected: 1
         actual:   0

settings: 21 passed, 1 failed
```

**Why it is the right failure.** Every red line is the absence of the kept file,
the kept line or the README row - never a fixture error. The fixture's own
controls are green in the same run: `flaky` FAILs and passes when the markers
say so, `steady` is the annotated PASS, `broke` is WARN, the failing full run
recorded into T-1 (so `rec_commit`/`rec_tree` were real: the expected values
above are the record's, and the record's commit equals the independently
computed `k_commit`, and its tree equals the independent `gate_tree_hash`). The
only red outside the new block is the two goldens, by exactly the one line
decision 1 added.

**One line per test** (gates.test.sh unless marked):

- R0: `AC-4 control: flaky passes plainly` / `steady is a PASS annotated ...` -
  fixture reached the outcome (AC-4).
- `AC-4: a plain pass leaves no flaky.failed.log` (AC-4).
- `AC-4: a pass annotated for no evidence line leaves no steady.failed.log` (AC-4).
- `AC-6: no kept line for the gate that passed plainly` / `... for the annotated pass` (AC-6).
- `control: the optional gate that fails is printed WARN, not FAIL` (definition).
- `AC-1: an optional gate printed WARN still did not pass, and keeps broke.failed.log` (AC-1, definition).
- `AC-6: and the kept line is printed for it, once` (AC-6).
- R1: `AC-1 control: flaky failed`, `... the failing full run recorded into T-1`,
  `control: the record has a commit line to compare against`.
- `AC-1 header 1..6` - each line exact; header 3 regex plus "no earlier than
  the run started"; header 4 equal both to the record's `commit:` and to the
  independent short HEAD + dirty note; header 5 equal to the independent
  `gate_tree_hash` and the record's `tree:` (AC-1).
- `AC-1: after six header lines, the run's log byte for byte` / `and it is this run's log` (AC-1).
- `AC-6: the kept line is printed once` / `comes right after flaky's output`
  (line number = `boom A`'s + 1) / `and before the next gate's header` (AC-6).
- `AC-6: ## Gate results does not carry the kept line` (AC-6 last sentence).
- R2: `AC-2 control: the re-run passed`; `AC-2: after the pass, flaky.failed.log
  is byte-identical`; `while flaky.log holds the passing run`; `and not the
  failure`; `AC-6: the pass printed no kept line for flaky` (AC-2, AC-6).
- R3: `AC-3: the newer failure is kept`, `none of the older output remains`,
  `one header, replaced rather than appended`, `header then the newer log, byte
  for byte`, `gate-logs/ holds flaky.failed.log and flaky.log, nothing else` (AC-3).
- R4: `AC-5 --fast:` exists, header 1, 2, 4, body, kept line (AC-5 with AC-1/AC-6).
- R5: `AC-5 --gate flaky:` exists, header 2, body, this run's, kept line (AC-5).
- R6: `AC-5 control: --gate broke runs broke` / `and not flaky`; `AC-5: --gate
  broke leaves flaky.failed.log byte-identical`; `and prints no kept line for flaky` (AC-5).
- settings.test.sh: `AC-7: README has one gate-logs/*.failed.log row, written
  by scripts/gates.sh, hand-editable yes`; `AC-7 control: the same reader finds
  the existing gate-logs/*.log row` (AC-7). The existing `no disagreements`
  assertion is AC-7's second sentence.
- HARNESS-024's `AC-3: gates.sh full run over project.conf / crlf.conf is
  byte-identical ...` now pin the e2e kept line too (AC-6, decision 1).

**Files touched.** `.claude/tests/gates.test.sh`, `.claude/tests/settings.test.sh`,
`.claude/tests/fixtures/manifest/project.run.golden`,
`.claude/tests/fixtures/manifest/crlf.run.golden`, `.claude/tests/floors.conf`,
`.claude/tests/selftest.test.sh`, and this story (`## Contract` C-3 and C-6
amended in place, `## Test plan`, this handoff). Not touched:
`scripts/gates.sh`, `.claude/state/README.md`, `.claude/tests/sigpipe.test.sh`
- all GREEN's (C-1, C-4, C-5).

**The golden diff (decision 1)**, `diff <old> <new>` for each:

```
$ diff project.run.golden.old .claude/tests/fixtures/manifest/project.run.golden
19a20
> failing log kept: .claude/state/gate-logs/e2e.failed.log
$ diff crlf.run.golden.old .claude/tests/fixtures/manifest/crlf.run.golden
19a20
> failing log kept: .claude/state/gate-logs/e2e.failed.log
```

`git diff --stat` shows `1 +` for each and nothing else.

**Caller check re-run (C-2).** `grep -n 'END { print NR }\|wc -l'
.claude/tests/gates.test.sh` returns only `:996`, `:997` (padded manifest line
count) and `:1156` (trim input) - manifest/fixture line counts, no run output.
Suites invoking `gates.sh`: `boundaries.test.sh:257,308` (`>/dev/null`),
`sigpipe.test.sh:967` (`gates7`, matched by `says` needle, never whole output),
`worktree.test.sh:291` (anchored `count` needles), `ci-local`/`doctor`/`policy`/
`refresh` only mention it as text. The only whole-output comparisons are the
HARNESS-024 goldens via `gates_golden` (`gates.test.sh:1064`), whose `run`
goldens are the two updated. `broken.run.golden` runs only passing gates and
is unchanged.

**`--list` / `--audit` confirmed (C-1).** `--list` prints at `gates.sh:372-` and
`continue`s; `--audit` `continue`s in every branch at `:465-488`; both are
before the command runs at `:504-506`, so neither can reach a keep block placed
after the outcome `esac`. Not asserted in the suite (trimmed per C-3).

**The interface the tests pin** (stated as fact):

- File: `.claude/state/gate-logs/<id>.failed.log`, lines 1-6 exactly
  `# gates.sh: last failing run of gate '<id>'`, `# outcome: <outcome>`,
  `# run:     <YYYY-MM-DDTHH:MM:SSZ>` (no earlier than the run started),
  `# commit:  <short HEAD>[ (working tree had uncommitted changes)]` - the dirty
  test is `git status --porcelain -- . ':!docs'` non-empty, exactly as the
  record - `# tree:    <gate_tree_hash>`, `# ----`; then `<id>.log`
  byte for byte. Replaced whole on the next non-pass; one per gate; no other
  `<id>.*` file in `gate-logs/`.
- Stdout: the whole line `failing log kept: .claude/state/gate-logs/<id>.failed.log`,
  on the line immediately after the gate's last output line (so before the
  blank line that precedes the next `=== gate:` header), exactly once per
  non-passing gate, never for a pass, never inside `## Gate results`.
- Outcome `fail` for a required FAIL and for an optional WARN.
- README row: first cell `` `gate-logs/*.failed.log` ``, second
  `` `scripts/gates.sh` ``, last `yes`, single spaces after the leading `|`.

**Not constrained:** the prose cell of the README row and the paragraph under
"The exhaust"; where exactly `commit_with_note` lives; whether `started` is
`date -u` (only its format and "no earlier than the run started" are pinned -
the test does not distinguish start time from end time, downstream's `sleep 1`
discriminator was trimmed); the `noevidence` and `blocked` header values are
not asserted by header (blocked e2e is pinned only through the golden's line).

**Passed on arrival (18 in the new block, plus `no disagreements` in settings).**
Fixture controls (9: flaky PASS/FAIL, steady annotated, broke WARN, recorded,
record has a commit line, R2 PASS, R6 runs broke / not flaky) need no earning.
Behaviour-claiming ones:

| Assertion | Earned by |
|---|---|
| AC-4 no `flaky.failed.log` / no `steady.failed.log` after a pass | DV-2 (GATES) |
| AC-6 no kept line for a plain / annotated pass (R0), for flaky's pass (R2) | DV-2 (GATES) |
| AC-5 no kept line for flaky under `--gate broke` | DV-3 (GATES) does not cover it; it is a regression guard |
| AC-6 `## Gate results does not carry the kept line` | not covered by any DV; a GATES probe would append the line to `$results` - flagged, not owed by the budget |
| AC-2 `flaky.log holds the passing run` / `and not the failure` | today's `tee` behaviour, a guard that the fix does not stop rewriting `<id>.log` |
| settings `no disagreements` | unchanged existing assertion |

AC-5's "`--gate broke` leaves `flaky.failed.log` byte-identical" is **red** in
RED (no file to snapshot), contrary to C-6's original text (amended); DV-3
still earns it.

**Negative controls - expected values.** No assertion in the new block ran
against a keep implementation; these are claims until GREEN confirms them.

| Control | Threshold | Expected after GREEN | Measured in RED |
|---|---|---|---|
| `failed_row README 'gate-logs/*.failed.log'` | = 1 | 1 | 0 on today's README; 1 on a scratch copy with C-4's exact row added; 0 with that row's `yes` -> `no`; 0 with its writer -> `scripts/phase.sh` (run outside the suite, same function) |
| `failed_row README 'gate-logs/*.log'` (reader control) | = 1 | 1 | 1 (in the suite) |
| R0 `steady` annotated PASS | 1 line `^PASS +steady (.*-- no evidence line: ...$` | 1 | 1 |
| R0 `broke` printed WARN | 1 | 1 | 1 |
| R1 recorded into T-1 | 1 `^recorded in docs/backlog/stories/T-1\.md` | 1 | 1 |
| R1 record `commit:` vs independent `k_commit` | equal | equal | equal (`bcafb4b (working tree had uncommitted changes)` both) |
| R1 record `tree:` vs independent `gate_tree_hash` | equal | equal | equal (`7a90073...`, both) |
| AC-6 kept line position | = `boom A` line + 1, < next header | 5, header at 7 | `boom A` at 4, next header at 6 |

**For GREEN.**
- Nothing found that changes C-1's approach. The commit SHA in the fixture
  changes between runs because R1's record is not committed; the header and the
  record are compared from the same run, so this is fine.
- `gates.test.sh` takes 2m07s locally now; it was about 1.5 min.
- After GREEN: `bash .claude/tests/selftest.test.sh` (passes now: 100/0 with the
  new floors), `bash scripts/check-sigpipe.sh` and `bash
  scripts/check-grep-count.sh` (both `0 finding(s)` over 44 files with these
  test changes).
- `bash scripts/gates.sh --fast`: every gate in this repo is UNCONFIGURED, so it
  reports `All required gates passed (0 ran, 5 unconfigured, 0 known)` - no
  lint/timeout/config signal either way; `selftest.sh` in CI is the judge.

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

    run:    2026-10-04T18:54:55Z
    commit: 03280f4 (working tree had uncommitted changes)
    tree:   543faf9df0576a801bb1750788eeb38fceab1f42
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


**PLANNED, 2026-10-04 (Lead PO).** PO decision 1: the HARNESS-024 run goldens
`project.run.golden` and `crlf.run.golden` gain exactly one line,
`failing log kept: .claude/state/gate-logs/e2e.failed.log`, because their `e2e`
gate is `blocked`. RED shows the `diff` is that single line. The golden's
normalisation is not widened (C-2). Downstream's tests are trimmed to about 25
assertions in `gates.test.sh` and 2 in `settings.test.sh` (C-3). `:526`'s pin
moves, and GREEN updates that one number (C-5). Every DV is a single `mutate.sh`
expression. `depends_on` is empty, as instructed.
- GATES (2026-10-04): full `bash scripts/selftest.sh`: `assertion floors: all
  22 suite(s) met their declared floor (2039 assertions executed, 1809
  declared)`, `22 harness suite(s) passed`, 1255 s. Not added: RED's two
  optional GATES probes (the kept line never reaching `## Gate results`, and no
  kept line for `flaky` under `--gate broke`) - beyond the mutation budget, and
  left to `/audit-mutations`.
- GREEN changed `sigpipe.test.sh`'s one pin with `sed -i` on a harness-classified
  file the lock permits, as C-6 assigned; `git diff` showed the one line.

**DONE, 2026-10-04.** Merged in #103 (merge commit 5b627fc), release 70. The
VERSION bump lands in this DONE commit. `phase.sh set DONE --force` was run on
`main`, overriding the branch check. PR CI: `gates` passed in 1m38s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37227649575),
`boundaries` in 8s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37227649661).
No epic. Next in the port audit: MT-037 (`skipped-when`).
