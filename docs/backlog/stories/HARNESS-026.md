---
id: HARNESS-026
title: The audit counts only required gates, and a run from another branch is not recorded
slug: the-audit-counts-only-required-gates-and
epic: 
type: fix
status: done
phase: DONE
branch: story/HARNESS-026-the-audit-counts-only-required-gates-and
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [scripts/gates.sh, .claude/tests/gates.test.sh, .claude/tests/sigpipe.test.sh, .claude/tests/floors.conf, .claude/tests/selftest.test.sh]         # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

This story ports two small `scripts/gates.sh` fixes from manga-translator. They
are the first two items of group 3, "gate correctness", in
`docs/wiki/audits/manga-translator-port-2026-10-02.md`. The source is issue #97.

- **MT-043** (`b13e206`). `gates.sh --audit` ends with "N required gate(s) have
  no evidence line", but it counts **every** configured gate that has no
  `evidence` line, optional ones included. An optional `mutation` gate with no
  evidence line therefore produces a summary blaming a required gate that does
  not exist. The audit reproduced it on a fixture with a required `unit` gate
  that has evidence and an optional `mutation` gate that has none: upstream
  printed `1 required gate(s) have no evidence line`.
- **MT-032 F-2** (`5760086`). `gates.sh` records into whichever story
  `current-story.env` names, whatever branch is checked out. Meanwhile
  `.claude/hooks/gate-reminder.sh:72` tells the agent it should check out the
  story's branch "because gates.sh will refuse to record a run made from this
  branch". Today that sentence is false. The audit reproduced it on `main`, with
  a story declaring `branch: story/T-1-x`: upstream printed `recorded in
  docs/backlog/stories/T-1.md`.

**Settled by the audit, and implemented here without reopening it:** port both
fixes. F-1 and F-3 of MT-032 are already upstream (release 48). The one open
question the audit left, the exit status of a branch refusal, is decided below
(PO decision 1).

**Not settled: the evidence.** RED reproduces both defects on this repo's
fixtures before writing the fix. AC-1 and AC-4 are those reproductions.

**One story, not two.** Each fix is about one line of `gates.sh`, and their
tests share the fixture and suite. Together they are one RED→GREEN cycle, and
splitting them would cost two runs of the slowest suite for no gain in
isolation.

**Required gate that would fail if this broke:** `unit`, via `bash
scripts/selftest.sh` and the `gates` suite. Every gate in this repo is
UNCONFIGURED, so in practice CI's `selftest.sh` step judges it.

## Acceptance criteria

- **AC-1.** Given a manifest with a required gate that has an `evidence` line
  and an optional gate that has none, when `gates.sh --audit` runs:
  - its output contains no `required gate(s) have no evidence line` summary;
  - the optional gate's own `WARN <id> no evidence line; a vacuous pass would go
    unnoticed` line is still printed;
  - the audit exits 0.

  *Today:* `1 required gate(s) have no evidence line.`, which is the defect.
- **AC-2.** Given one required and one optional gate, neither with an `evidence`
  line, `--audit` prints exactly `1 required gate(s) have no evidence line.`
  (not `2`), and both WARN lines.
  *Control:* the count is still 1, not 0, when the only gate without evidence is
  required. This holds with `BOOTSTRAPPED=no` too. It is what stops "count
  nothing" from satisfying AC-1.
- **AC-3.** Given an optional gate that the active story's `required_gates`
  escalates, with no `evidence` line, `--audit` counts it:
  `1 required gate(s) have no evidence line.` The count follows the gate's
  requirement after escalation, which is what the audit already prints for it.
- **AC-4.** Given an active story whose frontmatter says
  `branch: story/T-1-fixture`, when a full `gates.sh` run passes with the
  checkout on a different branch, then:
  - the run prints exactly one line beginning `(not recorded: the checkout is on
    '<checkout>'`, naming both branches;
  - the story's `## Gate results` section is byte-identical to before the run;
  - no line begins `recorded in`;
  - the run **exits 1**;
  - `last-gate-run` says `FULL=no`, while its `RESULT=` is still the verdict on
    the code.

  The same holds when `--story T-1` names the story explicitly.
  *Today:* the run records and exits 0, which is the defect.
- **AC-5.** The refusal fails open, and only where it cannot tell. Given the same
  story:
  - on `story/T-1-fixture` the run records and exits 0;
  - with HEAD detached, or with a story that has no `branch:` line, the run
    records and exits as before;
  - with no active story it prints `(not recorded: no active story` as before.

  *Control:* these keep the refusal from being satisfied by "never record".
- **AC-6.** When the branch refusal and HARNESS-014's untracked-file refusal both
  apply, exactly one `(not recorded:` line is printed, and it is the branch one;
  the exit status is 1. A refused run whose gates **fail** still exits 1, and a
  refused run with a BLOCKED gate exits 1, not 3, as HARNESS-014's refusal does
  today (`gates.sh:858-868`).

## Contract

**RED may amend any block below in place, with a reason stated in the block.
GREEN builds what the amended block says.**

**Writes:** `scripts/gates.sh`, `.claude/tests/gates.test.sh`, `.claude/tests/sigpipe.test.sh`, `.claude/tests/floors.conf`, `.claude/tests/selftest.test.sh`

### C-1 MT-043: `gates.sh` line numbers are at `28432ee`, re-verified 2026-10-03

The audit branch, `:475-477`:

```bash
    if [ "$exp" = "<none>" ]; then
      printf 'WARN %-12s no evidence line; a vacuous pass would go unnoticed\n' "$id"
      noevidence=$((noevidence+1)); continue
```

`:477` becomes **one line**:

```bash
      [ "$req" = "required" ] && noevidence=$((noevidence+1)); continue
```

It must be one line so that the `sigpipe.test.sh` pin `scripts/gates.sh:526`
does not move (C-4). The WARN line stays exactly as it is, and so does the
summary wording at `:646-650`. `req` here is already the value after story
escalation (the `GATE_REQ` table and the `escalated` note), so AC-3 needs no new
code. RED confirms that.

The run path's counter (`:552-556`) already counts only required gates. It is
**not touched**.

### C-2 F-2: the branch refusal

It goes in the refusal block at `:791-801`, before the untracked-file check,
reusing its `REFUSED` and `FULLRUN` variables:

```bash
# Refuse to record into a story from a checkout on another branch. The record
# would stamp another branch's tree into this story. gate-reminder.sh tells the
# agent this happens. A story with no `branch:`, or a detached HEAD, cannot be
# judged, so it fails open, as gate-reminder.sh does.
REFUSED=0; REFUSED_WHY=""
if [ "$FULLRUN" = yes ] && [ -n "$STORY" ] && [ -f "$STORY_FILE" ]; then
  checkout_branch="$(git -C "$ROOT" branch --show-current 2>/dev/null || printf '')"
  story_branch="$(frontmatter_value "$STORY_FILE" branch)"
  if [ -n "$checkout_branch" ] && [ -n "$story_branch" ] && [ "$checkout_branch" != "$story_branch" ]; then
    REFUSED=1; FULLRUN=no
    REFUSED_WHY="the checkout is on '$checkout_branch' but story $STORY belongs on '$story_branch'; check out '$story_branch' and run again"
  fi
fi
# then the existing untracked check, only if not already refused, setting
# REFUSED_WHY to today's untracked message
```

- **The branch to compare against** is the story file's frontmatter `branch:`,
  read with `frontmatter_value` (`lib.sh:1127`, already sourced by `gates.sh`).
  It is not `BRANCH` from `current-story.env`. `--story` is not an override,
  because the story file is what is written to.
- **The record branch at `:832-844`** prints `(not recorded: %s)` with
  `REFUSED_WHY` instead of today's untracked-only text. Today's untracked
  message must come out **byte-identical**, because `gates.test.sh:661` and
  `:740` match it.
- **The exits at `:858-872`** are unchanged. They already exit 1 on `REFUSED=1`,
  including on BLOCKED.

**PO decision 1. A branch refusal exits 1 and stamps `FULL=no`, as
HARNESS-014's untracked refusal does.** Downstream instead keeps the gates' own
exit status and writes `FULL=yes`. That is rejected for a reason specific to
this harness:

- `gate-reminder.sh:111` decides whether the active story's GATES obligation is
  met by reading `FULL=` from `last-gate-run`.
- A `FULL=yes`, `RESULT=pass` stamp from a run on another branch would discharge
  that obligation with a run of **another branch's code**. That is the forgery
  the stamp exists to prevent.
- Exiting 0 would also leave `ci-local.sh` and any `&&` chain treating an
  unrecorded run as complete.
- HARNESS-014 decided that "the verdict is about the code; the refusal is about
  the record". This keeps one convention for both refusals.

Two things are given up:

- A user who deliberately runs the gates on `main` with a story still active
  sees exit 1. In this repo's flow the lock is cleared at DONE, so that case
  means a stale `current-story.env`, and exit 1 is the right signal for it.
- CI is unaffected: it has no active story.

**PO decision 2. The branch refusal is checked first.** When both refusals
apply, the branch one is the message, because the untracked-file count is
meaningless for a tree that belongs to another story.

**`gate-reminder.sh` is not edited.** Its sentence at `:72` becomes true. RED
adds no gate-reminder test, because the suite (`gate-reminder: 32`) does not run
`gates.sh`.

### C-3 Tests: `.claude/tests/gates.test.sh`

New blocks go at the end of the file:

- `HARNESS-026 AC-1..AC-3  --audit counts only required gates without evidence`
- `HARNESS-026 AC-4..AC-6  a run from another branch is not recorded`

The fixture is the suite's own `FIX`: `make_project_fixture`, which is on
`main`, plus `story "$FIX" T-1 GATES` (frontmatter `branch: story/T-1-fixture`)
and `set_phase`. Every gate is a `printf`. To get a detached HEAD, use
`git -C "$FIX" checkout -q --detach`. To get a story without `branch:`, write
the story file directly.

Match every needle on the whole line with the suite's `count_re` / `count_line`
helpers, as the HARNESS-014 block does (`:640-750`), never as a floating
substring:

- `(not recorded: the checkout is on 'main' but story T-1 belongs on 'story/T-1-fixture'`
  is a prefix match anchored at `^`.
- `^recorded in docs/backlog/stories/T-1\.md` must count 0 under refusal and 1
  in AC-5's controls.
- The stamp is checked with `sed -n 's/^FULL=//p'` on
  `$FIX/.claude/state/last-gate-run`.

**Existing assertions this change flips (the callers of the changed
behaviour).** Each one runs a full recorded run on `main` with T-1 active, and
asserts that it records:

| Line | Assertion |
|---|---|
| `gates.test.sh:197` | `a full run still is` |
| `gates.test.sh:705` | `AC-5 control: staged, the run records` |
| `gates.test.sh:721` | `AC-5 control: excluded, the run records` |
| `gates.test.sh:750` | `and the run records` |

RED moves each block's **setup** onto `story/T-1-fixture`, with a `git checkout
-q -b story/T-1-fixture` (or a checkout of an existing branch) before the run
and a checkout back to `main` after. The assertions themselves are not edited.
They were earned by HARNESS-014, and the setup change does not alter what they
assert.

> **Amended in RED (2026-10-03, test-developer): the table is 4 of 16.** Running
> the *pre-story* suite against a candidate implementation of C-1/C-2 (applied
> through `mutate.sh`, see the Handoff) turns **16** existing assertions red, not
> 4: besides the four above, `:198` `and points at CI's other script`; the
> HARNESS-014 refusal's own `:661` `one line beginning '(not recorded: ' gives
> the reason - N untracked gated file(s)` and `:740` `the count in the reason
> says 1, not 2` (PO decision 2 makes the branch message win on `main`); `:706`
> `staged, the run exits 0`, `:707` `## Gate results now carries a tree stamp`,
> `:709` `FULL=yes`, `:722` `excluded, the run exits 0`, `:751` `and exits 0`;
> and four in the HARNESS-015 `ondemand` block, which also records on `main`:
> `:797` `the run exits 0`, `:798` `the recorded ## Gate results carries the ON
> REQUEST line`, `:800` `the stamp still says FULL=yes`, `:849` `exit 0`. So the
> move is by **block**, not by assertion: the `--fast` block runs on a
> `story/T-1-fixture` it creates and deletes again (the covers block creates it
> afresh); the HARNESS-014 block and both HARNESS-015 `ondemand` blocks run on
> `story/T-1-fixture` reset to `main`'s HEAD with `checkout -q -B`, returning to
> `main` after the second `ondemand` block. No assertion text changed. Measured:
> the amended suite is 281/281 against the candidate.

RED also re-checks every other suite that runs a recorded `gates.sh` against
the tree, and records the result in the handoff:

- `boundaries.test.sh:257` and `:308` run on `story/T-1-fixture`, so they are
  unaffected.
- `worktree.test.sh` uses matching branches.
- `ci-local.test.sh` runs with no story.

**HARNESS-024's goldens must stay byte-identical.** In
`.claude/tests/fixtures/manifest/`:

- `broken.conf`'s only required gate without evidence is `bare`, so
  `broken.audit.golden`'s `1 required gate(s)` stays 1;
- the full-run goldens are captured with no active story.

That suite's existing `cmp` assertions are AC-1's regression guard over a
broader manifest, and must not change. If one does, RED stops and reports it.

**Floors.** Raise `gates` from 224 to the executed count measured in RED, in
both `.claude/tests/floors.conf` and `.claude/tests/selftest.test.sh`'s `COUNTS`
block, with a dated comment in `floors.conf` in the house style. No new suite.

### C-4 Line pins

`.claude/tests/sigpipe.test.sh:567-568` pins two status-discarded lines:

- `scripts/gates.sh:74:BOOTSTRAPPED="$(grep`
- `scripts/gates.sh:526:why="could not launch: $(`

C-1 is written to move neither. C-2 sits below `:526`, so it moves neither
either. If GREEN's final shape does move `:526`, GREEN updates that one number,
and only that one. `sigpipe.test.sh:983` and `:1003` cite `gates.sh` lines in
prose comments, not as assertions, and are left alone. After GREEN, run `bash
scripts/check-sigpipe.sh` and `bash scripts/check-grep-count.sh` over the tree
and paste both summary lines. The new `$(git ... || printf '')` follows
gate-reminder.sh's existing shape.

### C-5 Earning what passes on arrival (RED)

Three classes of new assertion pass against today's `gates.sh` and must be
earned, each with one `bash scripts/mutate.sh scripts/gates.sh '<expr>' -- bash
.claude/tests/gates.test.sh` run in RED:

1. **AC-2's WARN-still-printed and count-1 controls, and AC-5's "records on the
   right branch".** Mutate `:477` so it no longer counts (`noevidence=$((noevidence+0))`).
   AC-2's "exactly 1" for a required gate goes red.
2. **AC-5's "no active story" control.** Covered by the existing HARNESS-014
   assertion `:695`. No new probe is needed; say so in the handoff.
3. **AC-6's "BLOCKED + refused exits 1".** Mutate `:867`'s
   `[ "$REFUSED" = 1 ] && exit 1` away, using a HARNESS-014 untracked refusal
   (which exists today) on a BLOCKED run. The assertion goes red.

Paste each probe with its red lines and `mutate.sh`'s `restored (verified ...)`
line. AC-1, AC-3, AC-4 and the branch half of AC-6 are red in RED by
construction. Paste that run.

> **Amended in RED (2026-10-03, test-developer), two corrections:**
>
> - **Probe 1 cannot earn AC-5's "records on the right branch", nor the WARN
>   lines.** Mutating the audit counter touches neither the record nor the WARN
>   text. Two more probes were run: **P3** `elif [ "$REFUSED" = 1 ]` → `elif
>   true` (never record) earns AC-5's three "records" controls; **P4** the WARN
>   text at `:476` earns AC-1/AC-2/AC-3's WARN-line assertions.
> - **AC-3 is not wholly red by construction.** Today's audit counts every gate
>   without evidence, so "an escalated optional gate is counted: 1" passes on
>   arrival (P1 earns it). AC-3 is pinned as a *pair*: the same manifest under a
>   story that does **not** escalate `mutation` must print no summary (red
>   today), and under one that does, `1`. Only the pair discriminates an
>   implementation that counts the pre-escalation requirement (`$confreq`), and
>   that can only be shown once the fix exists - see the Handoff's suggestion
>   for DV-1.

### C-6 Commands, narrowest first

On this host `gates.test.sh` takes about 6 minutes.

| When | Command |
|---|---|
| RED and GREEN | `bash .claude/tests/gates.test.sh` |
| After GREEN | `bash .claude/tests/sigpipe.test.sh`, `bash .claude/tests/selftest.test.sh` (for `COUNTS`), `bash scripts/check-sigpipe.sh`, `bash scripts/check-grep-count.sh` |
| GATES | `bash .claude/tests/boundaries.test.sh` and `bash .claude/tests/worktree.test.sh` (the other suites that record runs), `bash .claude/tests/gate-reminder.test.sh` (about 30 s), then `bash scripts/gates.sh` **from the story branch** |
| Once, before REVIEW | the full `bash scripts/selftest.sh`, in the background. CI runs it in about 2 minutes. |

**A platform note** (from HARNESS-025, where an awk difference passed every
local run and failed on Linux CI): nothing here introduces awk. Needles are
anchored `count_re` regexes over whole lines, which behave the same under
gawk and mawk. Do not add awk-specific constructs to the new tests.

### C-7 Oracle partition

| Kind | Criteria | Instruction to RED |
|---|---|---|
| **Settled** | PO decisions 1 and 2. The audit's two reproductions, which RED re-runs here as AC-1 and AC-4. | Read them out. A reproduction that does not reproduce is an escalation. |
| **Mechanical** | AC-1 to AC-6: exact lines, exit statuses, the `FULL=` value, byte-identical `## Gate results` | Pin exactly, on whole lines. |
| **Oracle-free** | none | |

## Deferred verifications

- **DV-1: the defects put back.** Against the committed `gates.sh`, run one
  `bash scripts/mutate.sh` whose single expression holds two newline-separated
  `sed` commands (`mutate.sh` takes one expression, not several `-e`; amended at
  the end of RED on the test-developer's report):
  - restore `:477`'s unconditional `noevidence=$((noevidence+1))`;
  - make the branch comparison never true (`[ "$checkout_branch" != "$story_branch" ]` → `false`).

  Run it with `-- bash .claude/tests/gates.test.sh`. AC-1's "no summary" and
  AC-4's "not recorded / exit 1 / FULL=no" assertions **must** go red. AC-5's
  controls stay green.

  RED cannot run this, because neither fix exists yet. **Owner: GATES.**

  **DV-1 result (GATES, 2026-10-04).** Restored and verified:

  ```
    477 -       [ "$req" = "required" ] && noevidence=$((noevidence+1)); continue
    477 +       noevidence=$((noevidence+1)); continue
    808 -   if [ -n "$checkout_branch" ] && [ -n "$story_branch" ] && [ "$checkout_branch" != "$story_branch" ]; then
    808 +   if [ -n "$checkout_branch" ] && [ -n "$story_branch" ] && false; then
  === mutate: running bash .claude/tests/gates.test.sh ===
      FAIL AC-1: an optional gate without evidence produces no 'required gate(s) have no evidence line' summary
      FAIL AC-2: one required and one optional gate without evidence: the summary says 1, not 2
      FAIL AC-3: an active story that does not escalate the optional gate: no summary
      FAIL AC-4: a passing full run on main prints the branch refusal, naming both branches, once
      FAIL AC-4: and it is the only line beginning '(not recorded:'
      FAIL AC-4: ## Gate results is byte-for-byte unchanged
      FAIL AC-4: no line claims to have recorded
      FAIL AC-4: the run exits 1 although every gate passed
      FAIL AC-4: the stamp says FULL=no
      FAIL AC-4 (--story T-1): a passing full run on main prints the branch refusal, naming both branches, once
      FAIL AC-4 (--story T-1): and it is the only line beginning '(not recorded:'
      FAIL AC-4 (--story T-1): ## Gate results is byte-for-byte unchanged
      FAIL AC-4 (--story T-1): no line claims to have recorded
      FAIL AC-4 (--story T-1): the run exits 1 although every gate passed
      FAIL AC-4 (--story T-1): the stamp says FULL=no
      FAIL AC-6: and it is the branch refusal
      FAIL AC-6: not the untracked-file one
      FAIL AC-6: a BLOCKED run refused for its branch alone prints the branch refusal
      FAIL AC-6: a BLOCKED run refused for its branch alone exits 1, not 3
      FAIL AC-6: and leaves ## Gate results unchanged
      FAIL AC-6: a failing run refused for its branch prints the branch refusal
      FAIL AC-6: and records nothing
      FAIL AC-6: ## Gate results unchanged after a refused failing run
  gates: 258 passed, 23 failed
  === mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_gates.sh.20261004T021640Z.1564.bak) ===
  ```
- **DV-2: AC-3's escalated half, which RED could not watch fail.** It passed
  on arrival, because today's code counts every gate. Mutate the fixed `:477`
  so the condition reads the manifest's own requirement (`$confreq`) and
  ignores the story's `required_gates`. Run with
  `-- bash .claude/tests/gates.test.sh`. AC-3's "escalated optional gate counts
  as required" assertion **must** go red. Added at the end of RED on the
  test-developer's report. **Owner: GATES.**

  **DV-2 result (GATES, 2026-10-04).** Restored and verified:

  ```
    477 -       [ "$req" = "required" ] && noevidence=$((noevidence+1)); continue
    477 +       [ "$confreq" = "required" ] && noevidence=$((noevidence+1)); continue
  === mutate: running bash .claude/tests/gates.test.sh ===
      FAIL AC-3: an optional gate the story's required_gates escalates, without evidence, is counted: 1
  gates: 280 passed, 1 failed
  === mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_gates.sh.20261004T021804Z.8445.bak) ===
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

Planned by `bash scripts/plan.sh write HARNESS-026` from `.claude/harness/models.conf`.
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

- The run path's no-evidence counter (`gates.sh:552-556`). It already counts
  only required gates, and only once bootstrapped.
- Any edit to `.claude/hooks/gate-reminder.sh`. Its claim becomes true; its
  wording stays.
- MT-046 (`<id>.failed.log`) and MT-037 (`skipped-when`), the rest of group 3.
  Each is its own story, cut once this one closes.
- A `--force`-style override for recording from another branch. If one is ever
  needed, it is its own story with its own reason.
- Comparing `current-story.env`'s `BRANCH` with the story frontmatter.
  `phase.sh set` writes both.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

All at one level: `gates.sh` driven end to end against the suite's own `FIX`
(`make_project_fixture`, every gate a `printf`), in two blocks at the end of
`.claude/tests/gates.test.sh`. That is the cheapest level that can falsify
these criteria: each one is about the script's output, exit status, stamp and
the story file it does or does not write. Needles are whole lines (`count_line`)
or `^`-anchored regexes (`count_re`), and nothing new uses awk beyond the
suite's existing `count_re`.

- **AC-1..AC-3** (`--audit`): AC-1's reproduction; AC-2 with both gates bare,
  and its control (required gate alone bare, with `BOOTSTRAPPED=yes` and `=no`);
  AC-3 as a pair (same manifest, story not escalating vs escalating).
- **AC-4** on `main` with T-1 active, then with no active story and `--story
  T-1`.
- **AC-5** on `story/T-1-fixture`, detached HEAD, a story with no `branch:`,
  no active story.
- **AC-6** branch + untracked refusal together (passing and BLOCKED), branch
  alone on BLOCKED, branch alone on a failing run.
- **Existing record-expecting blocks** moved onto `story/T-1-fixture` (C-3
  amendment): 16 assertions across the `--fast`, HARNESS-014 and HARNESS-015
  blocks; no assertion text changed.

Full table and evidence in the Handoff.

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

**RED, 2026-10-03 (test-developer, `opus`, no override in the dispatch).**

### Command

```
bash .claude/tests/gates.test.sh          # ~85 s on this host, not ~6 min
```

### Failure output (final RED run, gates.sh unchanged)

```
  HARNESS-026 AC-1..AC-3  --audit counts only required gates without evidence
    FAIL AC-1: an optional gate without evidence produces no 'required gate(s) have no evidence line' summary
         expected: 0
         actual:   1
    FAIL AC-2: one required and one optional gate without evidence: the summary says 1, not 2
         expected: 1
         actual:   0
    FAIL AC-3: an active story that does not escalate the optional gate: no summary
         expected: 0
         actual:   1

  HARNESS-026 AC-4..AC-6  a run from another branch is not recorded
    FAIL AC-4: a passing full run on main prints the branch refusal, naming both branches, once   (expected 1, actual 0)
    FAIL AC-4: and it is the only line beginning '(not recorded:'                                    (expected 1, actual 0)
    FAIL AC-4: ## Gate results is byte-for-byte unchanged                                            (expected yes, actual no)
    FAIL AC-4: no line claims to have recorded                                                       (expected 0, actual 1)
    FAIL AC-4: the run exits 1 although every gate passed                                            (expected 1, actual 0)
    FAIL AC-4: the stamp says FULL=no                                                                (expected no, actual yes)
    FAIL AC-4 (--story T-1): ... the same six, the same expected/actual
    FAIL AC-6: and it is the branch refusal                                                          (expected 1, actual 0)
    FAIL AC-6: not the untracked-file one                                                            (expected 0, actual 1)
    FAIL AC-6: a BLOCKED run refused for its branch alone prints the branch refusal                  (expected 1, actual 0)
    FAIL AC-6: a BLOCKED run refused for its branch alone exits 1, not 3                             (expected 1, actual 3)
    FAIL AC-6: and leaves ## Gate results unchanged                                                  (expected yes, actual no)
    FAIL AC-6: a failing run refused for its branch prints the branch refusal                        (expected 1, actual 0)
    FAIL AC-6: and records nothing                                                                   (expected 0, actual 1)
    FAIL AC-6: ## Gate results unchanged after a refused failing run                                 (expected yes, actual no)

gates: 258 passed, 23 failed
```

(AC-4 and AC-6 lines condensed from the two-line `expected:`/`actual:` form;
the values are verbatim.) **Both of the audit's reproductions reproduce here**:
AC-1's manifest prints `1 required gate(s) have no evidence line` (actual 1),
and AC-4's run on `main` records and exits 0. Every red line is an assertion
about the behaviour, not a harness or fixture error; every pre-existing
assertion stays green (224 of them).

### The right failure, proven the other way round

The suite was run against a **candidate** of exactly C-1 + C-2, applied through
`mutate.sh` (one sed expression, three commands: `:477` gains `[ "$req" =
"required" ] &&`; `REFUSED=0` at `:797` gains the C-2 branch check as one line;
a new `elif [ -n "$REFUSED_WHY" ]; then printf '\n(not recorded: %s)\n'
"$REFUSED_WHY"` before `:839`):

```
gates: 281 passed, 0 failed
=== mutate: command exited 0; restored (verified byte-for-byte against .../scripts_gates.sh.20261004T014811Z.1131.bak) ===
```

and, under the same candidate, `boundaries: 82 passed, 0 failed`, `worktree:
73 passed, 0 failed`, `ci-local: 28 passed, 0 failed`, `doctor: 50 passed, 0
failed` (restored, verified). So C-3's claim that those suites are unaffected
holds, and the Contract as written is sufficient for every test here. The
**pre-story** suite under the same candidate is `gates: 208 passed, 16 failed`
- the 16 listed in the C-3 amendment - which is what earns the setup moves:
without them those 16 go red, with them all 224 stay green. (Run as a
throwaway `.claude/tests/__probe_gates_head.test.sh` copy of HEAD's suite,
deleted after.)

### Tests, one line each

| Test | Asserts | AC |
|---|---|---|
| AC-1 no summary | `required gate\(s\) have no evidence line` appears 0 times for required-with-evidence + optional-without | AC-1 |
| AC-1 WARN | the whole line `WARN mutation     no evidence line; a vacuous pass would go unnoticed` appears once | AC-1 |
| AC-1 exit | `--audit` exits 0 | AC-1 |
| AC-2 count | `^1 required gate\(s\) have no evidence line\. Add one per gate:$` once, both lacking evidence | AC-2 |
| AC-2 one summary | exactly one `^[0-9]+ required gate(s)...` line | AC-2 |
| AC-2 WARN x2 | both whole WARN lines | AC-2 |
| AC-2 control | required alone without evidence: count line `1` | AC-2 control |
| AC-2 control WARN | its WARN line | AC-2 control |
| AC-2 control BOOTSTRAPPED=no | same, conf written with `BOOTSTRAPPED=no` | AC-2 control |
| AC-3 pair, unescalated | active T-1 without `required_gates`: no summary | AC-3 |
| AC-3 pair, escalated | `required_gates: [mutation]`: count line `1` | AC-3 |
| AC-3 WARN | escalated gate's WARN line | AC-3 |
| preconditions x2 | checkout is `main`; T-1 has `branch: story/T-1-fixture` | fixture |
| AC-4 x7, twice | refusal prefix once; only `(not recorded:` line; `## Gate results` cmp-identical; no `^recorded in`; exit 1; `FULL=no`; `RESULT=pass` - with T-1 active, then with no active story and `--story T-1` | AC-4 |
| AC-5 on branch x4 | on `story/T-1-fixture`: records, no `(not recorded:`, exit 0, `FULL=yes` | AC-5 |
| AC-5 detached x4 | precondition (no branch name), records, not refused, exit 0 | AC-5 |
| AC-5 no `branch:` x3 | records from `main`, not refused, exit 0 | AC-5 |
| AC-5 no story x3 | `(not recorded: no active story` once, no branch refusal, exit 0 | AC-5 |
| AC-6 both x5 | one `(not recorded:`; it is the branch one; not the untracked one; exit 1; record unchanged | AC-6 |
| AC-6 BLOCKED both x2 | still `BLOCKED types`; exit 1 not 3 | AC-6 |
| AC-6 BLOCKED branch-only x3 | branch refusal; exit 1 not 3; record unchanged | AC-6 |
| AC-6 failing x4 | branch refusal; exit 1; no `recorded in`; record unchanged | AC-6 |

57 new assertions; executed count 281 (floor raised 224 -> 281 in
`floors.conf` and `selftest.test.sh`'s `COUNTS`; `selftest: 100 passed, 0
failed` with the new floor).

### Files touched

- `.claude/tests/gates.test.sh` - two new blocks at the end; setup moved onto
  `story/T-1-fixture` in the `--fast` block (:189-205, creates and deletes the
  branch) and for the HARNESS-014 + both HARNESS-015 `ondemand` blocks (`checkout
  -q -B story/T-1-fixture` at :629, `checkout -q main` at :940). No existing
  assertion's text changed.
- `.claude/tests/floors.conf`, `.claude/tests/selftest.test.sh` - `gates` 281.
- this story: C-3 and C-5 amended in place, Test plan, this Handoff.
- Not touched: `scripts/*`, hooks, `sigpipe.test.sh`, the manifest goldens.

### What the tests pin for GREEN (the "export shape" of a shell script)

- The branch refusal line, prefix-anchored: `(not recorded: the checkout is on
  'main' but story T-1 belongs on 'story/T-1-fixture'` - what follows (C-2's `;
  check out '...' and run again)`) is not pinned, nor the closing paren.
- Exactly one line beginning `(not recorded:` per refused run, so the branch
  refusal must **replace** the untracked message, not add to it.
- `last-gate-run`: `FULL=no` and `RESULT=pass` on a refused passing run.
- Exit 1 on refusal, including BLOCKED (not 3).
- The untracked message must stay byte-identical (existing `:661`/`:740`
  needles, now on the story branch).
- The audit summary wording is unchanged; only the count moves.
- Not constrained: variable names, where the check sits (as long as it is
  before the untracked one), how the branch is read - beyond the fact that
  `--story T-1` with no `current-story.env` must still refuse, so the story
  file's frontmatter, not `current-story.env`'s `BRANCH`, has to be the source.

### Passed on arrival, and what earns each

Each probe: `bash scripts/mutate.sh scripts/gates.sh '<expr>' -- bash
.claude/tests/gates.test.sh`; only the lines that are NEW reds relative to the
23 baseline reds are quoted.

**P1** `477s/noevidence=\$((noevidence+1))/noevidence=$((noevidence+0))/`
```
  477 -       noevidence=$((noevidence+1)); continue
  477 +       noevidence=$((noevidence+0)); continue
    FAIL AC-3: gates.sh --audit over broken.conf is byte-identical to the pre-rewrite golden
    FAIL AC-2: and there is exactly one summary line
    FAIL AC-2 control: a required gate alone without evidence is still counted: 1, not 0
    FAIL AC-2 control: with BOOTSTRAPPED=no the required gate without evidence is still counted: 1
    FAIL AC-3: an optional gate the story's required_gates escalates, without evidence, is counted: 1
gates: 255 passed, 26 failed
=== mutate: command exited 1; restored (verified byte-for-byte against .../scripts_gates.sh.20261004T015116Z.472.bak) ===
```
And AC-1's "no summary" went **green** under P1: "count nothing" satisfies
AC-1, and the AC-2 controls are what catch it - as designed.

**P2** `867s/^  \[ "\$REFUSED" = 1 \] && exit 1$/  :/`
```
  867 -   [ "$REFUSED" = 1 ] && exit 1
  867 +   :
    FAIL C-4: but a refused run exits 1, not 3
    FAIL AC-6: a BLOCKED run under both refusals exits 1, not 3
gates: 256 passed, 25 failed
=== mutate: command exited 1; restored (verified byte-for-byte against .../scripts_gates.sh.20261004T015244Z.7478.bak) ===
```

**P3** `s/^  elif \[ "\$REFUSED" = 1 \]; then$/  elif true; then/` (never record)
```
  839 -   elif [ "$REFUSED" = 1 ]; then
  839 +   elif true; then
    FAIL a full run still is
    FAIL AC-5 control: staged, the run records
    FAIL AC-5 control: and ## Gate results now carries a tree stamp
    FAIL AC-5 control: excluded, the run records
    FAIL and the run records
    FAIL and the recorded ## Gate results carries the ON REQUEST line
    FAIL AC-5 control: on story/T-1-fixture the run records
    FAIL AC-5 control: on story/T-1-fixture it is not refused
    FAIL AC-5 control: with HEAD detached the run records
    FAIL AC-5 control: with HEAD detached it is not refused
    FAIL AC-5 control: a story with no branch: line records from main
    FAIL AC-5 control: a story with no branch: line is not refused
gates: 255 passed, 26 failed
=== mutate: command exited 1; restored (verified byte-for-byte against .../scripts_gates.sh.20261004T015412Z.14350.bak) ===
```
This also shows the moved HARNESS-014/015 record assertions still bite on
their new branch.

**P4** `476s/no evidence line; a vacuous/no evidence; a vacuous/`
```
  476 -       printf 'WARN %-12s no evidence line; a vacuous pass would go unnoticed\n' "$id"
  476 +       printf 'WARN %-12s no evidence; a vacuous pass would go unnoticed\n' "$id"
    FAIL AC-1: the optional gate's own no-evidence WARN line is still printed, whole
    FAIL AC-2: the required gate's WARN line is printed
    FAIL AC-2: and so is the optional gate's
    FAIL AC-2 control: with its WARN line
    FAIL AC-3: and its WARN line is printed
gates: 252 passed, 29 failed
=== mutate: command exited 1; restored (verified byte-for-byte against .../scripts_gates.sh.20261004T015530Z.20580.bak) ===
```

Not probed, with reason:
- AC-1 exit 0, AC-5 "exits 0" lines, AC-5 no-story lines: the no-story line is
  HARNESS-014's `:695` (C-5 item 2); exit-0 on an unrefused pass is pinned by
  every recorded run in the suite.
- AC-6 "a failing run refused for its branch exits 1": the `fails > 0 -> exit
  1` path, pinned by `and the run exits non-zero` (manifest-changed block). It
  is a regression guard here, not new behaviour.
- AC-5 "on story/T-1-fixture ... FULL=yes" and "it exits 0", and the "no
  branch refusal" zero in the no-story case: they discriminate only once the
  refusal exists; DV-1 (GATES) is where they are watched against it.

### Controls: expected values

The suite does not fail at import - it is shell - so every control below
**executed** in RED against today's `gates.sh`, and again against the
candidate. These are measured, not claims; GREEN confirms them against the
shipped fix.

| Control | Threshold | Today (measured) | Candidate C-1/C-2 (measured) | Under P1 "count nothing" |
|---|---|---|---|---|
| AC-2 required-alone count line | exactly 1 | 1 | 1 | 0 (red) |
| AC-2 BOOTSTRAPPED=no count line | exactly 1 | 1 | 1 | 0 (red) |
| AC-3 escalated count line | exactly 1 | 1 | 1 | 0 (red) |
| AC-3 unescalated summary | 0 | 1 (red) | 0 | 0 |
| AC-5 on-branch `recorded in` / exit / FULL | 1 / 0 / yes | 1 / 0 / yes | 1 / 0 / yes | - (P3: 0) |
| AC-5 detached `recorded in` / exit | 1 / 0 | 1 / 0 | 1 / 0 | - (P3: 0) |
| AC-5 no-`branch:` `recorded in` / exit | 1 / 0 | 1 / 0 | 1 / 0 | - (P3: 0) |
| AC-5 no-story line / exit | 1 / 0 | 1 / 0 | 1 / 0 | - |

### For GREEN and GATES

- **Timing:** the whole suite ran in 84 s locally (`real 1m23.9s`), not the
  ~6 min C-6 states. Local measurement only; no CI figure taken.
- **`gates.sh --fast`** in this repo: every gate UNCONFIGURED (`All required
  gates passed (0 ran, 5 unconfigured, 0 known)`), so it judges nothing here;
  the `selftest.sh` CI step is the real judge, as the Context says.
  `check-sigpipe: scanned 44 shell file(s), 41 with pipefail, 0 finding(s)`;
  `check-grep-count: scanned 44 shell file(s), 0 finding(s)` (with the test
  changes, before GREEN).
- **`mutate.sh` takes ONE expression, not two `-e`.** DV-1 as written ("two
  `-e` expressions") will not run; pass one expression with the commands
  separated by a newline, as the candidate run here did.
- **Suggested addition to DV-1** (not added, DV is not RED's to amend): a third
  command turning the fixed `:477` into `[ "$confreq" = "required" ] && ...`
  (the pre-escalation value) - AC-3's escalated assertion must go red. That is
  the one discrimination AC-3 has that RED could not watch.
- **CRLF, not pinned:** `frontmatter_value` strips trailing whitespace only
  before a `#`, so a story file with CRLF endings yields `story/...\r`, and the
  refusal would fire on the *right* branch. This repo pins `*.md eol=lf`, and
  no AC covers it; a consuming project without that pin would meet it. Worth a
  `tr -d '\r'` (or `${x%$'\r'}`) on the read; GREEN's call.

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

    run:    2026-10-04T02:19:42Z
    commit: 3ef3c2d (working tree had uncommitted changes)
    tree:   2ddcdb3d0d5882eafb87b559933751c3f8f2d837
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


**PLANNED, 2026-10-03 (Lead PO).** MT-043 and MT-032 F-2 are one story because
both are about one line in `gates.sh`, share a fixture and suite, and fit one
cycle (Context). PO decision 1: a branch refusal exits 1 and stamps `FULL=no`,
matching HARNESS-014. Downstream's exit 0 and `FULL=yes` are rejected, because
`gate-reminder.sh:111` would read that stamp as the active story's full run
(C-2). PO decision 2: the branch refusal takes precedence over the untracked
refusal. Four existing record-expecting assertions (`gates.test.sh:197`, `:705`,
`:721`, `:750`) have their setup moved onto the story branch; the assertions
themselves are unchanged (C-3). `depends_on` is empty, as instructed.
- GATES (2026-10-04): full `bash scripts/selftest.sh`: `assertion floors: all
  22 suite(s) met their declared floor (1984 assertions executed, 1754
  declared)`, `22 harness suite(s) passed`, 1280 s. DV-1 and DV-2 were run
  detached. Left out on purpose: the CRLF `\r` in `frontmatter_value` that RED
  noted, which no criterion covers (this repo pins `*.md eol=lf`).

**DONE, 2026-10-04.** Merged in #102 (merge commit 7c647b8), release 69. The
VERSION bump lands in this DONE commit. `phase.sh set DONE --force` was run on
`main`, overriding the branch check - which, from release 69, is also the case
the new branch refusal covers for `gates.sh`, so no full gate run was made here.
PR CI: `gates` passed in 1m46s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37171853679),
`boundaries` in 11s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37171853592).
No epic. Next in the port audit: MT-046 (a failing gate's log survives).
