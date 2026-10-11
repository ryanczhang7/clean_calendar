---
id: HARNESS-028
title: A floor shortfall the environment caused reports BLOCKED or KNOWN, not FAIL
slug: a-floor-shortfall-the-environment-caused
epic: 
type: fix
status: done
phase: DONE
branch: story/HARNESS-028-a-floor-shortfall-the-environment-caused
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [scripts/gates.sh, .claude/tests/gates.test.sh, .claude/tests/sigpipe.test.sh, .claude/tests/floors.conf, .claude/tests/selftest.test.sh, .claude/harness/project.conf, .claude/skills/quality-gates/SKILL.md, .claude/skills/quality-gates/reference/configuring.md]         # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

This story ports manga-translator's MT-037 (`5a51681`), the last item of group 3
("gate correctness") in `docs/wiki/audits/manga-translator-port-2026-10-02.md`.
The source is issue #97.

**What the gap is upstream.** Downstream's starting defect was a gate that
reported PASS after running 1 test of 26, because the other 25 skipped for want
of gitignored test data. Its fix had two halves: a `floor` on that gate, and a
new `skipped-when` kind. Upstream already has `floor`, so a run like that already
fails the floor here. What upstream lacks is the second half: a way to tell
**a suite that shrank** from **a suite whose inputs this machine does not
have**. Today both come out as the same FAIL (required) or WARN (optional). The
second case is a true non-result. Reporting it as FAIL sends an agent off to
"fix" code that is fine, and reporting it as a WARN on every run teaches people
to ignore WARN. `skipped-when` classifies a floor shortfall whose log says the
work was skipped:

- **BLOCKED** (exit 3) when the gate is required, whether by the manifest or by
  the story's `required_gates`;
- **KNOWN** (exit 0) when it is optional.

A shortfall the pattern does not match stays exactly what it is today.

**What the audit decided, and this story implements without reopening:**

- Port `skipped-when`.
- Detect it with the **awk matcher** from `95a31c5`, the expression `gates.sh`
  already uses for evidence and `blocked-when`
  (`awk 'BEGIN{r=ARGV[1];ARGV[1]=""} $0~r{h=1} END{exit !h}'`).
  Downstream's `clean_log | grep -Eq` is refused by `check-sigpipe.sh`.
- **Never port** downstream's `REAL_CONF` / `real_conf_value` block, or any
  assertion about a project's real `project.conf` values. Every case here uses a
  fixture.
- Downstream's `assert_not_contains` hunk to `_lib.sh` is already upstream, so
  it is not ported.

**Re-verified against `91eed2c`, 2026-10-04:**

- Upstream parses no `skipped-when`.
- A below-floor run is `outcome=noevidence` (`gates.sh:547-551`), which prints
  FAIL when required and WARN when optional.
- The outcomes are `pass`, `fail`, `noevidence` and `blocked`. HARNESS-027 keeps
  a `.failed.log` for any outcome other than `pass`.

**Required gate that would fail if this broke:** `unit`, through `bash
scripts/selftest.sh` and the `gates` suite. Every gate in this repository is
UNCONFIGURED, so in practice CI's `selftest.sh` step judges it.

## Acceptance criteria

All criteria use the fixture manifest in C-3. Its gate `itest` has evidence
`Tests +[1-9][0-9]* passed`, floor `26`, and `skipped-when | itest |
[1-9][0-9]* (skipped|deselected)`.

- **AC-1.** Given `itest` **optional** and a run that exits 0 with log `Tests  1
  passed, 25 skipped`, then:
  - the summary has exactly one line for it, beginning `KNOWN        itest (`;
  - that line contains `did 1 units of work, below the floor of 26` and `the
    log says 25 skipped`;
  - there is no `PASS` and no `WARN` line for `itest`;
  - the run exits 0 and records `result: pass`.
- **AC-2.** Given the same run with `itest` **required**, both as declared in the
  manifest and as optional but escalated by the story's `required_gates`, then:
  - its line begins `BLOCKED      itest`;
  - the run exits 3;
  - the story's `## Gate results` records `result: blocked`;
  - no line begins `PASS         itest`.
- **AC-3.** *Control: a full run still passes.* Given the same manifest and a log
  of `Tests  26 passed`, the line is `PASS         itest (Ns, observed 26, floor
  26)`. With `Ns` normalised, it is compared on the whole line.
- **AC-4.** *Control: the pattern never excuses a real shortfall.* Given a log of
  `Tests  3 passed`, which is below the floor and matches no skip pattern, the
  gate is reported **exactly as today's `gates.sh` reports it**: the same FAIL
  line when required, the same WARN line when optional. This is compared on the
  whole line, against output captured from today's script in RED.
- **AC-5.** `--audit` fails, naming the problem, for each of these:
  - a `skipped-when` line that names no configured gate;
  - one that has no pattern;
  - one on a gate with no `floor` line.

  *Control:* a well-formed `skipped-when` on a floored gate passes the audit, and
  its pattern is printed under that gate.
- **AC-6.** `--list` prints `skipped-when: <pattern>` under the gate, in the same
  column style as `blocked-when:`. The printed pattern keeps its `|` alternation
  whole.
- **AC-7.** A skip-classified run is an outcome other than `pass`. Its
  `itest.failed.log` is kept (HARNESS-027) with header `# outcome: environment`,
  and the `failing log kept:` line is printed.
- **AC-8.** HARNESS-024's manifest goldens (`.claude/tests/fixtures/manifest/*.golden`)
  are byte-identical after this change. Those fixtures have no `skipped-when`
  line and no below-floor run, so none of their outputs may move.

## Contract

**RED may amend any block below in place, with a reason stated in the block.
GREEN builds what the amended block says.**

**Writes:** `scripts/gates.sh`, `.claude/tests/gates.test.sh`, `.claude/tests/sigpipe.test.sh`, `.claude/tests/floors.conf`, `.claude/tests/selftest.test.sh`, `.claude/harness/project.conf`, `.claude/skills/quality-gates/SKILL.md`, `.claude/skills/quality-gates/reference/configuring.md`

### C-1 `scripts/gates.sh`, line numbers at `91eed2c`

| Where | Change |
|---|---|
| `:139` | Add `SKIPPEDWHEN=""` to the same line, so nothing below moves. |
| `:154` | Add `skipped-when` to the kind list. |
| `:173-174` | Add a `skipped-when) SKIPPEDWHEN="$SKIPPEDWHEN$tid$TAB$tval` branch. The value is taken with `rest 3` (HARNESS-024), so an alternation keeps its `|`. |
| `:376` | Beside `floor=`, add `skippat=$(table_lookup "$SKIPPEDWHEN" "$id") || skippat=""`. Do **not** reuse the name `skipped`, which is the `--fast` list. |
| `--list`, after the `blocked-when` loop (`:389-391`) | Print `skipped-when: <pattern>` in the same `%-12s %-9s %-6s` style as `blocked-when:`. |
| `--audit` detail (`:494`) | Print `     %-12s skipped-when: <pattern>` beside the `floor:` detail. |
| The floor branch (`:550-551`) | Classify the shortfall, as shown below. |
| The outcome `case` (after `blocked)`, `:595`) | Add an `environment)` branch, as shown below. |
| `--audit`'s orphan loops (after the `blocked-when` loop, `:656`) | Add a `skipped-when` loop that fails each of the three AC-5 cases, with downstream's messages verbatim. |

The floor branch keeps today's `why`, and only for a shortfall extends it:

```bash
      elif [ "$observed" -lt "$floor" ]; then
        outcome=noevidence
        why="did $observed units of work, below the floor of $floor in project.conf"
        if [ -n "$skippat" ] && clean_log "$log" | awk 'BEGIN{r=ARGV[1];ARGV[1]=""} $0~r{h=1} END{exit !h}' "$skippat"; then
          skipmatch="$(clean_log "$log" | awk 'BEGIN{r=ARGV[1];ARGV[1]=""} !s && match($0, r){s=1; m=substr($0, RSTART, RLENGTH)} END{printf "%s", m}' "$skippat")"
          outcome=environment
          why="$why; the log says $skipmatch, so the work was skipped rather than lost: the environment did not supply it"
        fi
      fi
```

- **PO decision 1: the matched text is extracted with awk `match()`, not `grep
  -Eom1 | head -1`.** That way detection and extraction use one regex engine and
  cannot disagree about a pattern. The awk program reads every line and never
  `exit`s early, so `clean_log` never takes SIGPIPE, which is the same shape as
  `work_count`. Today's `blocked-when` extraction at `:535` is not touched.
- **Only the floor-shortfall branch consults the pattern.** A gate that exits
  non-zero, fails its evidence, or has no floor is never reclassified.

The `environment)` branch, with downstream's results verbatim:

```bash
    environment)
      if [ "$req" = "required" ]; then
        results="$results\nBLOCKED      $id$escalated (${dur}s, $why) -> $logrel"
        blocked=$((blocked+1))
      elif [ -n "$waiver" ]; then
        results="$results\nKNOWN        $id (${dur}s, $why; $waiver) -> $logrel"; known=$((known+1))
      else
        results="$results\nKNOWN        $id (${dur}s, $why) -> $logrel"; known=$((known+1))
      fi ;;
```

**PO decision 2: an `environment` outcome keeps a `.failed.log`.**
HARNESS-027's rule is "any outcome other than pass". The kept log is where the
skip line can be read once the next run has overwritten `<id>.log`, and the
`# outcome: environment` header already says it was not a code failure. AC-7
pins this. No special case is added.

**PO decision 3: the `gates.sh` header comment (`:2-42`, which `-h` prints) is
not edited.** Any line added above `:74` would move the `sigpipe.test.sh` pin
`scripts/gates.sh:74`. `skipped-when` is documented where every other line kind
is: the quality-gates skill, `reference/configuring.md`, and the commented
`project.conf` template (C-4). A two-line comment goes beside the classification
code.

### C-2 Platform-independent patterns

Lesson from HARNESS-025: awk regex dialects differ, and Ubuntu CI's default awk
is mawk.

- Every pattern in this story's fixtures, and every needle its tests match with
  `count_re` (which is awk), may use only `[...]`, `*`, `+`, `|`, `( )` and
  literal text. No interval expressions (`{n}`), no `\d` or `\s`, no
  backreferences.
- The KNOWN, BLOCKED and PASS lines are matched with `count_line` (`grep -cxF`,
  the exact whole line) once the duration is normalised with the suite's
  existing `(Ns` normalisation. They are not matched with an awk regex.
- The docs (C-4) say this about `skipped-when` patterns in one sentence: they
  are matched by awk, like `evidence` and `blocked-when`, so avoid interval
  expressions.

### C-3 Tests: one new block in `.claude/tests/gates.test.sh`

The block is `HARNESS-028 AC-1..AC-8  a shortfall the environment caused is
classified, not excused`. It uses the suite's `FIX`, `write_conf`, `story`,
`set_phase` and the `gates` wrapper.

`itest`'s command prints the contents of a marker file, so one manifest can
produce each log:

```
gate         | itest | optional | . | cat itest.out
evidence     | itest | Tests +[1-9][0-9]* passed
floor        | itest | 26
skipped-when | itest | [1-9][0-9]* (skipped|deselected)
```

The required variant changes only `optional` to `required`. The escalated
variant keeps `optional` and adds `required_gates: [itest]` to T-1's frontmatter.

*Amended in RED (Test Developer, 2026-10-04):* the marker is
`.claude/state/h28/itest.out`, not `itest.out` at the fixture root, and the
command is `cat .claude/state/h28/itest.out; exit $(cat .claude/state/h28/itest.rc 2>/dev/null || printf 0)`.
Reason: an untracked file at the fixture root classifies as source, so a full
run would refuse to record (HARNESS-014) and AC-1's `result: pass` / AC-2's
`result: blocked` could never be read - the same reason HARNESS-027 keeps its
markers under `.claude/state/h27/`. The optional `itest.rc` lets the same
manifest pin the out-of-scope "non-zero exit is never consulted" case. The
manifest lines themselves (evidence, floor, skipped-when) are unchanged.

- **AC-4's expected lines** are captured in RED by running **today's**
  `gates.sh` over the same manifest *without* the `skipped-when` line. That
  makes them byte-for-byte what a non-matching shortfall prints today.
  AC-4 then runs the new manifest, *with* the line and a `Tests  3 passed` log,
  and compares the result whole-line. The capture goes in the handoff.
- **AC-2's record** is read from `docs/backlog/stories/T-1.md`'s `## Gate
  results` (`result: blocked`). The run happens from `story/T-1-fixture`
  (HARNESS-026's branch refusal), using the branch setup that suite already
  uses.
- **AC-8 needs no new assertion.** The existing HARNESS-024 golden assertions
  (`gates.test.sh`, "AC-3: gates.sh ... is byte-identical") are that check.
  RED confirms none of the fixture manifests carries `skipped-when` or produces
  a below-floor run: the fixture floors are 40 for `unit`, which observes 47,
  and 3 for `lint`, which observes 5. If any golden moves, RED stops and
  reports it. The goldens are **not** re-captured.

**Floors.** Raise `gates` (334) to the executed count measured in RED, in both
`.claude/tests/floors.conf` and the `COUNTS` block of
`.claude/tests/selftest.test.sh`, with a dated comment in `floors.conf`.

### C-4 Docs (generic, nothing project-specific)

- **`reference/configuring.md`.** Add `skipped-when | <gate id> | <regex
  meaning the work was skipped, not lost>` to the kinds list (`:22-29`). Add one
  paragraph after `blocked-when`'s:
  - it applies only to a floor shortfall;
  - it makes that shortfall BLOCKED when the gate is required and KNOWN when it
    is optional;
  - a shortfall it does not match stays FAIL or WARN;
  - `--audit` refuses an orphan line, an empty pattern, and a gate with no
    floor;
  - the awk-dialect sentence from C-2.
- **The quality-gates skill.** One short subsection after BLOCKED (`:415+`):
  "A shortfall the environment caused". It covers:
  - the difference between a suite that shrank and inputs a checkout does not
    carry, such as gitignored data;
  - why that is BLOCKED or KNOWN and never PASS or WARN;
  - that the pattern classifies a shortfall and never excuses one.

  It names no project.
- **The `.claude/harness/project.conf` template.** Add a commented `# Format:
  skipped-when | <gate id> | <extended regex>` block after the `blocked-when`
  block (`:220-240`), with one generic example:
  `#   skipped-when | integration | [1-9][0-9]* skipped`.
  This file is the template that ships, so it gets **comments only, no live
  line**.

Before committing, check whether any test pins these docs' text: `grep -l
'configuring.md\|quality-gates/SKILL.md' .claude/tests/*.sh` returns `_lib.sh`,
`boundaries`, `doctor`, `gate-reminder`, `gates` and `refresh`. RED checks
whether any of them asserts on the sections being edited and lists the result
in the handoff.

*Amended in RED (Test Developer, 2026-10-04):* that grep, run as written at
`91eed2c`, returns **no files**. A wider `grep -n 'configuring\|quality-gates'`
finds one hit, a comment in `doctor.test.sh:54`. No suite asserts on the text
of `configuring.md`, the quality-gates `SKILL.md`, or the comments of the
shipped `.claude/harness/project.conf` (`doctor.test.sh:328` and
`gates.test.sh:957` both say they never read the real one). The C-4 edits are
unpinned by tests.

### C-5 Line pins

`.claude/tests/sigpipe.test.sh:567-568` pins `scripts/gates.sh:74` and
`scripts/gates.sh:535`.

- `:74` must not move. Hence C-1's same-line edit at `:139`, and no header edit.
- `:535` moves, because the lookup and the `--list`/`--audit` lines sit above it.
  GREEN updates that one number to wherever `why="could not launch: $(` lands.
- The prose mentions of `gates.sh` lines at `sigpipe.test.sh:983` and `:1003`
  are left alone.

After GREEN, run `bash scripts/check-sigpipe.sh` and `bash
scripts/check-grep-count.sh` over the tree, and paste both summary lines.

### C-6 What passes on arrival

| Assertion | State on arrival | How it is earned |
|---|---|---|
| AC-3 (PASS at the floor) | passes today | one RED probe: `bash scripts/mutate.sh scripts/gates.sh 's/elif \[ "\$observed" -lt "\$floor" \]; then/elif true; then/' -- bash .claude/tests/gates.test.sh`. AC-3's PASS line must go red. |
| AC-4 (today's FAIL/WARN for an unmatched shortfall) | passes today | nothing extra: the same probe does not move it, and AC-4 is red under DV-2 |
| AC-8 | existing assertions | already earned (HARNESS-024) |
| AC-1, AC-2, AC-5, AC-6 and AC-7 | red in RED by construction | paste that run |

Expressions must be single expressions, adapted to the committed line where
needed.

### C-7 Commands

| When | Commands |
|---|---|
| RED and GREEN | `bash .claude/tests/gates.test.sh` (2m06s here, measured 2026-10-04) |
| After GREEN | `bash .claude/tests/sigpipe.test.sh`, `bash .claude/tests/selftest.test.sh`, `bash scripts/check-sigpipe.sh`, `bash scripts/check-grep-count.sh` |
| GATES | `bash .claude/tests/profiles.test.sh` (which runs `--audit` over profile snippets), then `bash scripts/gates.sh` from the story branch |
| Once, before REVIEW | the full `bash scripts/selftest.sh`, in the background. CI runs it in about 2 minutes. |

### C-8 Oracle partition

| Kind | Criteria | Instruction to RED |
|---|---|---|
| **Settled** | The outcome mapping (required → BLOCKED/exit 3; optional → KNOWN/exit 0; unmatched shortfall unchanged); downstream's message texts; PO decisions 1-3 | Read them out. |
| **Mechanical** | AC-1 to AC-8 | Pin each on its whole line with `count_line`. Use regexes only per C-2. |
| **Oracle-free** | none | — |

## Deferred verifications

Both run through `bash scripts/mutate.sh scripts/gates.sh '<one expression>'
-- bash .claude/tests/gates.test.sh`, against the committed GREEN code. RED
cannot run either, because the classification does not exist yet.

- **DV-1, the defect put back.** Make the skip classification never fire:
  `s/if \[ -n "\$skippat" \] \&\& clean_log/if false \&\& clean_log/`, adapted to
  the committed line. AC-1's KNOWN line and AC-2's BLOCKED and exit 3 **must**
  go red, because they fall back to today's WARN and FAIL. AC-3 and AC-4 stay
  green. **Owner: GATES.**
- **DV-2, a wrong value: the pattern excuses instead of classifying.** Make
  every shortfall classify:
  `s/if \[ -n "\$skippat" \] \&\& clean_log "\$log" | awk/if true || clean_log "$log" | awk/`,
  adapted. AC-4's "unchanged FAIL/WARN" **must** go red. This is the bug the
  criterion "never excuses" exists for, and AC-1 and AC-2 are blind to it.
  **Owner: GATES.**


**DV-1 result (GATES, 2026-10-04).** Restored and verified:

```
=== mutate: scripts/gates.sh (1 line(s) changed by 562s/if \[ -n "\$skippat" \] &&/if false \&\&/) ===
  562 -         if [ -n "$skippat" ] && clean_log "$log" | awk 'BEGIN{r=ARGV[1];ARGV[1]=""} $0~r{h=1} END{exit !h}' "$skippat"; then
  562 +         if false && clean_log "$log" | awk 'BEGIN{r=ARGV[1];ARGV[1]=""} $0~r{h=1} END{exit !h}' "$skippat"; then
    FAIL AC-1: an optional gate whose shortfall the log says was skipped is one KNOWN line, naming the shortfall and the matched text
    FAIL AC-1: and it is the only line for itest beginning KNOWN
    FAIL AC-1: nor as the WARN today's gates.sh prints
    FAIL AC-7: whose outcome header says environment, not a code failure
    FAIL AC-1 (C-1): the pattern's second alternation branch classifies too, quoting what matched
    FAIL C-1: an optional waived gate names the waiver after the skip reason
    FAIL AC-2 manifest-required: a skipped shortfall is BLOCKED, whole line
    FAIL AC-2 manifest-required: the run exits 3
    FAIL AC-2 manifest-required: ## Gate results records result: blocked
    FAIL AC-2 manifest-required: and the stamp says RESULT=blocked
    FAIL AC-2 story-escalated: an optional gate the story requires is BLOCKED, naming the story
    FAIL AC-2 story-escalated: the run exits 3
    FAIL AC-2 story-escalated: ## Gate results records result: blocked
gates: 376 passed, 13 failed
=== mutate: command exited 1; restored (verified byte-for-byte against its .bak) ===
```

**DV-2 result (GATES, 2026-10-04).** Restored and verified:

```
=== mutate: scripts/gates.sh (1 line(s) changed by 562s/if \[ -n "\$skippat" \] &&/if true ||/) ===
  562 -         if [ -n "$skippat" ] && clean_log "$log" | awk 'BEGIN{r=ARGV[1];ARGV[1]=""} $0~r{h=1} END{exit !h}' "$skippat"; then
  562 +         if true || clean_log "$log" | awk 'BEGIN{r=ARGV[1];ARGV[1]=""} $0~r{h=1} END{exit !h}' "$skippat"; then
    FAIL an optional gate below its floor warns
    FAIL AC-4 control optional: a shortfall the pattern does not match prints today's WARN line
    FAIL AC-4 control optional: and is not excused as KNOWN
    FAIL AC-4 control optional: '0 skipped' does not match [1-9][0-9]*, so it is today's WARN
    FAIL AC-4 control required: a shortfall the pattern does not match prints today's FAIL line
    FAIL AC-4 control required: and is not reported BLOCKED
    FAIL AC-4 control required: exits 1, as today
gates: 382 passed, 7 failed
=== mutate: command exited 1; restored (verified byte-for-byte against its .bak) ===
```

Both run detached (`nohup`) against the committed GREEN line 562.

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

Planned by `bash scripts/plan.sh write HARNESS-028` from `.claude/harness/models.conf`.
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

- Downstream's `REAL_CONF` / `real_conf_value` block, and any assertion on this
  repository's or any project's real `project.conf`. The audit rules this out.
- A live `skipped-when` or `floor` line in the shipped `.claude/harness/project.conf`.
  It is a template, so it gets comments only.
- Consulting `skipped-when` anywhere other than the floor-shortfall branch. That
  means not for non-zero exits, not for missing evidence, and not for gates
  without a floor.
- Changing the `blocked-when` extraction at `gates.sh:535`, or the `gates.sh`
  header comment (PO decision 3).
- `environment.md` content, which downstream added. It is project content.
- `check-boundaries.sh`. Its required-gate PASS check already finds no PASS line
  for a BLOCKED gate, so it needs no change.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

One block at the end of `.claude/tests/gates.test.sh`,
`HARNESS-028 AC-1..AC-8  a shortfall the environment caused is classified, not excused`.
Level: integration - the real `scripts/gates.sh` run as a process inside the
suite's project fixture (`FIX`), which is the cheapest level that observes the
summary line, exit status, `## Gate results` record, stamp and kept log
together. One manifest (`it_conf`), one marker (`it_log`); every summary line
compared whole with `count_line` after the HARNESS-024 `(Ns` normalisation;
`count_re` only for anchored `^PREFIX` absences/counts, using `[...]`, `+`,
`( )`, `\(`, `\.` and literals (C-2). No downstream `REAL_CONF` /
`real_conf_value` - nothing reads this repo's project.conf.

| AC | Case | Oracle |
|---|---|---|
| AC-1 | optional, `Tests  1 passed, 25 skipped`, active story T-1 on `story/T-1-fixture` | exact KNOWN line; one `^KNOWN +itest \(`; no `^PASS`/`^WARN +itest`; exit 0; `^    result: pass \(` in T-1; stamp `RESULT=pass` |
| AC-1 / C-1 | `Tests  1 passed, 25 deselected` | exact KNOWN line quoting `25 deselected` - only reachable if `rest 3` kept the `|` |
| C-1 | optional + `waiver` | exact `KNOWN … ; <waiver>) -> log` line (Contract's waiver branch) |
| AC-2 | manifest `required` | exact BLOCKED line; exit 3; `result: blocked`; no PASS on stdout or in the record; stamp `RESULT=blocked` |
| AC-2 | optional + `required_gates: [itest]` | exact `BLOCKED      itest (required by story T-1) (…` line; exit 3; `result: blocked`; no PASS; no KNOWN |
| AC-3 control | `Tests  26 passed`, optional and required; `Tests  26 passed, 3 skipped` | exact `PASS         itest (Ns, observed 26, floor 26)`; exit 0; no KNOWN at the floor |
| AC-4 control | `Tests  3 passed` optional/required; `Tests  3 passed, 0 skipped` | exact lines captured from today's gates.sh; exit 0 / 1; no KNOWN / BLOCKED |
| scope | `1 passed, 25 skipped` with exit 2, optional/required | today's `WARN … exit 2, optional` / `FAIL … exit 2` lines; exit 1 |
| AC-5 | orphan id `itset`; empty pattern; no `floor` line | each exact `FAIL %-12s …` line (downstream's text); exit 1; `1 manifest problem(s).` |
| AC-5 control | well-formed | `Manifest audit passed.`; exit 0; no `^FAIL .*skipped-when`; exact `     %-12s skipped-when: <pat>` detail |
| AC-6 | `--list` | exact `%-12s %-9s %-6s skipped-when: <pat>` with `(skipped|deselected)` whole, beside the same-style blocked-when line |
| AC-7 | the AC-1 run | `itest.failed.log` line 1 names the gate, line 2 `# outcome: environment`, body carries the skip line; `failing log kept:` printed once |
| AC-8 | - | existing HARNESS-024 golden checks (unchanged, all green in RED) |

## Handoff: RED -> GREEN

**Model.** RED ran on `claude-opus-5-5` (the agent file's `opus`); no override
in the dispatch.

**Command.** `bash .claude/tests/gates.test.sh` (5m14s wall on this machine
today, 2026-10-04 - the Contract's 2m06s was measured on a quieter run; no
per-suite timeout exists, so this is cost, not a hazard).

**Result in RED:** `gates: 367 passed, 22 failed` (389 executed). Every one of
the 22 is in the new block; every pre-existing assertion, the HARNESS-024
goldens (AC-8) included, is green. Verbatim:

```
  HARNESS-028 AC-1..AC-8  a shortfall the environment caused is classified, not excused
    FAIL AC-1: an optional gate whose shortfall the log says was skipped is one KNOWN line, naming the shortfall and the matched text
         expected: 1
         actual:   0
    FAIL AC-1: and it is the only line for itest beginning KNOWN
         expected: 1
         actual:   0
    FAIL AC-1: nor as the WARN today's gates.sh prints
         expected: 0
         actual:   1
    FAIL AC-7: whose outcome header says environment, not a code failure
         expected: # outcome: environment
         actual:   # outcome: noevidence
    FAIL AC-1 (C-1): the pattern's second alternation branch classifies too, quoting what matched
         expected: 1
         actual:   0
    FAIL C-1: an optional waived gate names the waiver after the skip reason
         expected: 1
         actual:   0
    FAIL AC-2 manifest-required: a skipped shortfall is BLOCKED, whole line
         expected: 1
         actual:   0
    FAIL AC-2 manifest-required: the run exits 3
         expected: 3
         actual:   1
    FAIL AC-2 manifest-required: ## Gate results records result: blocked
         expected: 1
         actual:   0
    FAIL AC-2 manifest-required: and the stamp says RESULT=blocked
         expected: 1
         actual:   0
    FAIL AC-2 story-escalated: an optional gate the story requires is BLOCKED, naming the story
         expected: 1
         actual:   0
    FAIL AC-2 story-escalated: the run exits 3
         expected: 3
         actual:   1
    FAIL AC-2 story-escalated: ## Gate results records result: blocked
         expected: 1
         actual:   0
    FAIL AC-5: --audit fails a skipped-when that names no configured gate, naming it
         expected: 1
         actual:   0
    FAIL AC-5: and exits 1
         expected: 1
         actual:   0
    FAIL AC-5: --audit fails a skipped-when with no pattern
         expected: 1
         actual:   0
    FAIL AC-5: and exits 1
         expected: 1
         actual:   0
    FAIL AC-5: --audit fails a skipped-when on a gate with no floor
         expected: 1
         actual:   0
    FAIL AC-5: and exits 1
         expected: 1
         actual:   0
    FAIL AC-5: one manifest problem, not more
         expected: 1
         actual:   0
    FAIL AC-5 control: the audit prints the pattern under the gate
         expected: 1
         actual:   0
    FAIL AC-6: --list prints skipped-when with its | alternation whole
         expected: 1
         actual:   0

gates: 367 passed, 22 failed
```

Why these are the right failures: each is the assertion itself, against
today's behaviour - the shortfall prints today's WARN/FAIL and exits 0/1, the
kept log says `noevidence`, `--audit` ignores the unknown kind and passes, and
`--list` does not print it. No load error, no fixture error; the controls in
the same block (AC-3, AC-4, scope, AC-5's "audit passed" and exit 0, AC-6's
blocked-when line, AC-1's "recorded into T-1") are green.

**The exact strings the tests pin** (after `(Ns` normalisation; `$WHY1` is the
Contract's floor-branch `why`):

```
WHY1 = did 1 units of work, below the floor of 26 in project.conf; the log says 25 skipped, so the work was skipped rather than lost: the environment did not supply it
KNOWN        itest (Ns, $WHY1) -> .claude/state/gate-logs/itest.log
KNOWN        itest (Ns, <WHY1 with "25 deselected">) -> .claude/state/gate-logs/itest.log
KNOWN        itest (Ns, $WHY1; fixture data is not redistributable) -> .claude/state/gate-logs/itest.log
BLOCKED      itest (Ns, $WHY1) -> .claude/state/gate-logs/itest.log
BLOCKED      itest (required by story T-1) (Ns, $WHY1) -> .claude/state/gate-logs/itest.log
PASS         itest (Ns, observed 26, floor 26)
failing log kept: .claude/state/gate-logs/itest.failed.log      (and line 2 of that file: "# outcome: environment")
printf 'FAIL %-12s a `skipped-when` line names no configured gate' itset
printf 'FAIL %-12s a `skipped-when` line has no pattern' itest
printf 'FAIL %-12s a `skipped-when` line names a gate with no `floor` line: there is nothing to measure the shortfall it would classify' itest
printf '     %-12s skipped-when: %s' '' '[1-9][0-9]* (skipped|deselected)'          (--audit detail)
printf '%-12s %-9s %-6s skipped-when: %s' '' '' '' '[1-9][0-9]* (skipped|deselected)'  (--list)
```

These are C-1's code and downstream's messages verbatim; nothing here is a
new choice. Matched text is `25 skipped` (leftmost match of the pattern in
`Tests  1 passed, 25 skipped`), which `match()` extraction gives.

**AC-4's capture from today's script** (gates.sh at `91eed2c`, same manifest
without `skipped-when`, scratch fixture, 2026-10-04):

```
optional, Tests  3 passed, rc=0:   WARN         itest (Ns, did 3 units of work, below the floor of 26 in project.conf, optional)
required, Tests  3 passed, rc=1:   FAIL         itest (Ns, did 3 units of work, below the floor of 26 in project.conf) -> .claude/state/gate-logs/itest.log
optional, 1 passed, 25 skipped:    WARN         itest (Ns, did 1 units of work, below the floor of 26 in project.conf, optional)
required, 1 passed, 25 skipped:    FAIL         itest (Ns, did 1 units of work, below the floor of 26 in project.conf) -> .claude/state/gate-logs/itest.log   (rc=1)
optional/required, Tests 26 passed: PASS         itest (Ns, observed 26, floor 26)   (rc=0)
optional, skip log + exit 2:       WARN         itest (Ns, exit 2, optional) -> .claude/state/gate-logs/itest.log
required, skip log + exit 2:       FAIL         itest (Ns, exit 2) -> .claude/state/gate-logs/itest.log
```

**Passed on arrival, and what earns it.**

- AC-3 (four assertions: PASS line optional/required, exit 0 required, PASS at
  the floor with `3 skipped`): earned by C-6's probe, run in RED:

  ```
  $ bash scripts/mutate.sh scripts/gates.sh 's/elif \[ "\$observed" -lt "\$floor" \]; then/elif true; then/' -- bash .claude/tests/gates.test.sh
  === mutate: scripts/gates.sh (1 line(s) changed by s/elif \[ "\$observed" -lt "\$floor" \]; then/elif true; then/) ===
    549 -       elif [ "$observed" -lt "$floor" ]; then
    549 +       elif true; then
  ...
      FAIL AC-3 control (optional): 26 of 26 is a PASS, whole line
           expected: 1
           actual:   0
      FAIL AC-3 control (required): 26 of 26 is a PASS, whole line
           expected: 1
           actual:   0
      FAIL AC-3 control (required): and exits 0
           expected: 0
           actual:   1
      FAIL AC-3 control: at the floor, a log that also says skipped is still a PASS
           expected: 1
           actual:   0
  ...
  gates: 352 passed, 37 failed
  === mutate: command exited 1; restored (verified byte-for-byte against .../scripts_gates.sh.20261004T195759Z.37796.bak) ===
    549:       elif [ "$observed" -lt "$floor" ]; then
  ```

  The other 11 new reds under the probe are pre-existing floor assertions and
  the HARNESS-024 run goldens, which is expected for that mutation.
  `git status scripts/` is clean afterwards.
- AC-4 and the non-zero-exit scope pins: green on arrival by design (they are
  today's lines). Not moved by the AC-3 probe. Their discriminating mutation is
  DV-2 (classify every shortfall), which needs the GREEN code - **I cannot run
  DV-1 or DV-2 in RED; the classification they mutate does not exist yet.**
  Owner stays GATES.
- AC-5's "Manifest audit passed." / exit 0 and AC-6's blocked-when line: green
  today because the unknown kind is ignored; they are controls, not the
  claim. AC-5's exact detail line and the three FAILs are red.

**Negative controls - expected values.** No threshold here; each control is
an exact line or exit code. Unlike an import-failing suite, every assertion in
this block DID execute in RED (gates.sh exists), so these are measured, not
claimed:

| Control | Expected after GREEN | Measured in RED (today's code) |
|---|---|---|
| AC-3 26/26 optional | `PASS         itest (Ns, observed 26, floor 26)`, rc 0 | same, rc 0 |
| AC-3 26/26 required | same line, rc 0 | same, rc 0 |
| AC-3 `26 passed, 3 skipped` | PASS line, no KNOWN | same |
| AC-4 `3 passed` optional | TODAY_WARN3, rc 0, no KNOWN | same |
| AC-4 `3 passed, 0 skipped` optional | TODAY_WARN3 | same |
| AC-4 `3 passed` required | TODAY_FAIL3, rc 1, no BLOCKED | same |
| scope exit 2 optional / required | TODAY_WARNRC / TODAY_FAILRC, rc 1 | same |

**Files touched.**

- `.claude/tests/gates.test.sh` - the new block, before `summary "gates"`.
- `.claude/tests/floors.conf` - `gates` 334 -> 389, dated comment.
- `.claude/tests/selftest.test.sh` - `COUNTS` `gates 389`
  (`bash .claude/tests/selftest.test.sh`: `selftest: 100 passed, 0 failed`).
- this story: `## Test plan`, `## Handoff`, two in-place Contract amendments
  (C-3 marker path, C-4 grep result).

**Interface GREEN must meet (pinned, not suggestions).** The manifest kind is
spelled `skipped-when`; its value is the whole remainder (`rest 3`); the
outcome word in the kept-log header is `environment`; the `why` text, the
KNOWN/BLOCKED line shapes, the three audit messages and the two detail-line
formats are exactly as listed above. **Not constrained:** variable names
(`SKIPPEDWHEN`, `skippat`), where in the file the lookup happens, the comment
text, the order of the `skipped-when` audit loop relative to the others (only
one problem is present per case), and the docs (C-4 - no test reads them).

**Other checks run in RED.** `bash scripts/check-sigpipe.sh`:
`check-sigpipe: scanned 44 shell file(s), 41 with pipefail, 0 finding(s)`.
`bash scripts/check-grep-count.sh`: `check-grep-count: scanned 44 shell
file(s), 0 finding(s)`. `bash scripts/gates.sh --fast`: every gate
UNCONFIGURED, `All required gates passed (0 ran, 5 unconfigured, 0 known)` -
nothing to read for shape; the `gates` suite is judged by CI's `selftest.sh`.

**For GREEN.**

- C-5: `sigpipe.test.sh:568` pins `scripts/gates.sh:535`; update it to the
  line `why="could not launch: $(` lands on. `:74` must not move.
- AC-8: confirmed no `fixtures/manifest/*.conf` carries `skipped-when`, and no
  golden run line is below a floor (`unit 47/40`, `lint 5/3`). If a golden
  moves in GREEN, the change is wrong, not the golden.
- The `skipped-when` audit loop must sit where `--audit` runs (after the gate
  loop, beside the `blocked-when` loop) and the no-floor check reads `FLOORS`
  by the line's id.

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

    run:    2026-10-04T20:41:39Z
    commit: 856ff8a (working tree had uncommitted changes)
    tree:   e551315c84ddcb452b9e45b25d3f23518f58c4f9
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

- **The title is narrower than downstream's.** Upstream already refuses PASS
  below a floor; the gap is telling a skipped run from a shrunk suite (Context).
- **PO decision 1.** The matched text is extracted with awk `match()`, on the
  same engine as detection, consuming all of its input (C-1).
- **PO decision 2.** An `environment` outcome keeps a `.failed.log`, as
  HARNESS-027's "any non-pass outcome" rule says.
- **PO decision 3.** The `gates.sh` header is not edited, so the
  `scripts/gates.sh:74` pin does not move. The docs live in the skill,
  `configuring.md` and the template. `:535`'s pin moves, and GREEN updates
  that one number.
- **HARNESS-024 and HARNESS-027 goldens.** They do not change: no fixture has a
  `skipped-when` line or a below-floor run, so AC-8 is the existing
  byte-identity check.
- **Patterns.** All of them avoid awk intervals (C-2).
- **Frontmatter.** `depends_on` is empty, as instructed.

**GREEN, 2026-10-04 (Feature Developer, `claude-opus-5-5`, no override).**

- `scripts/gates.sh` built as C-1 says: `SKIPPEDWHEN=""` on line 139 and
  `skipped-when` in the kind list on line 154 (same-line edits; `:74` did not
  move), a `skipped-when)` table branch (value via `rest 3`), `skippat` lookup
  beside `floor=`, the `--list` loop and `--audit` detail line, the floor-branch
  classification with awk detection and awk `match()` extraction (C-1 verbatim),
  the `environment)` outcome branch, and the `--audit` loop with downstream's
  three messages. `blocked-when`'s extraction is untouched.
- C-5: `blocked-when`'s `why="could not launch: $(` is now `gates.sh:542`;
  `sigpipe.test.sh:568` updated from 535 to 542 (the one test edit the
  Contract assigns to GREEN). `:74` unchanged.
- C-4 docs: `configuring.md` (kinds list - "Six" became "Seven more kinds" -
  and one paragraph after `blocked-when`'s), quality-gates `SKILL.md`
  subsection "A shortfall the environment caused" at the end of the BLOCKED
  section, and a comment-only `skipped-when` block in the `project.conf`
  template after `blocked-when`'s. No live line.
- Results: `gates: 389 passed, 0 failed`; `sigpipe: 82 passed, 0 failed`;
  `profiles: 50 passed, 0 failed`; `doctor: 50 passed, 0 failed` (after the
  template edit); `check-sigpipe: scanned 44 shell file(s), 41 with pipefail, 0
  finding(s)`; `check-grep-count: scanned 44 shell file(s), 0 finding(s)`;
  `gates.sh --audit`: `Manifest audit passed.`; `gates.sh --fast`: `All required
  gates passed (0 ran, 5 unconfigured, 0 known).` - every gate UNCONFIGURED, so
  it judges nothing here.
- **Controls, measured against the shipped code** (scratch fixture, the C-3
  manifest with `skipped-when`, `gates.sh --gate itest`, `(Ns` normalised):

  | Case | rc | Line |
  |---|---|---|
  | optional, `Tests  26 passed` | 0 | `PASS         itest (Ns, observed 26, floor 26)` |
  | required, `Tests  26 passed` | 0 | same |
  | optional, `Tests  26 passed, 3 skipped` | 0 | same (no KNOWN) |
  | optional, `Tests  3 passed` | 0 | TODAY_WARN3, byte-identical |
  | optional, `Tests  3 passed, 0 skipped` | 0 | TODAY_WARN3 |
  | required, `Tests  3 passed` | 1 | TODAY_FAIL3 |
  | optional, skip log + exit 2 | **0** | `WARN         itest (Ns, exit 2, optional) -> .claude/state/gate-logs/itest.log` |
  | required, skip log + exit 2 | 1 | `FAIL         itest (Ns, exit 2) -> .claude/state/gate-logs/itest.log` |
  | optional, `1 passed, 25 skipped` | 0 | KNOWN1 |
  | required, `1 passed, 25 skipped` | 3 | BLOCK1 |

  One divergence from the handoff's control table, benign: it gives "rc 1" for
  *both* scope exit-2 rows, but an optional WARN exits 0, today and now. The
  test asserts the exit only for the required row (`scope required: and exits
  1`), so nothing pinned is affected; the table row was imprecise.
- DV-1 and DV-2 are GATES's, not run here.
- GATES (2026-10-04): full `bash scripts/selftest.sh`: `assertion floors: all
  22 suite(s) met their declared floor (2094 assertions executed, 1864
  declared)`, `22 harness suite(s) passed`, 1811 s. Not ported, as planned:
  downstream's `REAL_CONF` block (pins manga-translator's own project.conf
  values), its `assert_not_contains` hunk (already upstream) and its
  `environment.md` notes.

**DONE, 2026-10-04.** Merged in #105 (merge commit 889ca42), release 71. The
VERSION bump lands in this DONE commit. `phase.sh set DONE --force` was run on
`main`, overriding the branch check. PR CI: `gates` passed in 1m22s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37235179674),
`boundaries` in 9s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37235179644).
No epic. Group 3 (gate correctness) of the port audit is complete; next is
group 4, mutation safety.
