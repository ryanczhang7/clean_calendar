---
id: HARNESS-009
title: lead-po dispatches into more than one worktree
slug: lead-po-dispatches-into-more-than-one-wo
epic: 
type: chore
status: done
phase: DONE
branch: story/HARNESS-009-lead-po-dispatches-into-more-than-one-wo
depends_on: [HARNESS-008]      # story ids; phase.sh refuses to start this story until they are DONE
touches: [.claude/agents/lead-po.md, scripts/plan.sh, .claude/tests/plan.test.sh]  # files this story expects to write
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

No epic. The harness maintaining itself, and the last of the four.

**HARNESS-008 makes two phase locks possible. Something still has to decide to
use them.** `lead-po` holds the loop: it reads the board, picks a story, and
dispatches `test-developer` for RED and `feature-developer` for GREEN and GATES.
It dispatches one at a time because one is all `current-story.env` could express.
Once that is per-worktree, the orchestrator is the remaining constraint.

**This is a different orchestrator, not a modified one**, and that is why it is
last. Dispatching into N worktrees means holding N phase states, deciding which
stories may pair, choosing a merge order, and - the part with no equivalent
today - deciding what happens when one of the N goes red while the others are
mid-phase. `lead-po.md` has no vocabulary for any of that: grepped at release
45, it mentions parallelism zero times.

**The pieces it can lean on already exist**, which is the argument for doing it
rather than inventing a scheduler:

- `plan.sh conflicts` (release 45, sharpened by HARNESS-006) says which pairs
  are safe, and says UNKNOWN rather than guessing when it cannot tell.
- `plan.sh next` says what to run a story with, and returns `blocked` when
  `depends_on` is unmet.
- `phase.sh set` refuses to advance a story on the wrong branch, which is the
  per-worktree invariant already enforced.
- HARNESS-008 gives each worktree its own lock, gate record and doctor line.

**What has no answer yet, and this story must give one.** Two stories that both
go green still merge into one `main` sequentially, and `gates.sh` never saw them
together. Two green PRs can be individually correct and jointly wrong - the
"one machine" limit `CLAUDE.md` already warns about, moved to "one branch". An
orchestrator that dispatches in parallel without a position on that is shipping
the problem it was built to manage.
## Acceptance criteria

- **AC-1** - Given a backlog and `n` worktrees, when the orchestrator selects
  what to run, then it selects only pairs `plan.sh conflicts` reports as
  `clear`. *Control:* a pair reported `CONFLICT` is never selected, and a pair
  reported `UNKNOWN` is never selected either - unknown is not permission.
- **AC-2** - Given a story selected for a worktree, when it is dispatched, then
  the worktree is on that story's `branch` and its own phase lock names that
  story. *Control:* dispatching a second story into a worktree that already has
  one active is refused, naming the story already there.
- **AC-3** - Given `n` stories in flight, when one fails a gate, then the others
  continue to their next phase boundary and stop there, and the orchestrator
  reports which stopped where. *Control:* nothing is left mid-phase with no
  record of why - the failure of one is not silent in the others.
- **AC-4** - Given two stories that have both reached REVIEW, when the
  orchestrator reports, then it states a merge order and the reason for it, and
  states that the second PR's gates ran against a tree without the first.
  *Control:* it does not claim the two were verified together, because they were
  not.
- **AC-5** - Given a single worktree, when the orchestrator runs, then behaviour
  is identical to today's - one story, dispatched as now. Parallelism is a
  capability, not a new default, and a project that never creates a second
  worktree must not be able to tell this story landed.
- **AC-6** - `lead-po.md` documents the selection rule, the failure behaviour of
  AC-3, and the merge-order position of AC-4. *Verified by review* - see
  `## Deferred verifications`.
## Contract

**Writes:** `.claude/agents/lead-po.md`, `scripts/plan.sh`, `.claude/tests/plan.test.sh`

**`.claude/agents/lead-po.md`** is where this lives. It is an agent definition -
prose the orchestrator follows - not a scheduler in bash. The harness has no
daemon and this story must not introduce one: what changes is what `lead-po` is
instructed to do, and the machine-readable inputs it is instructed to consult.

**The selection rule, stated once and referenced:**

    candidates = stories where `plan.sh next` is not `blocked`
    pairs      = those where `plan.sh conflicts` says `clear`
    UNKNOWN is not a candidate pair

**`scripts/plan.sh`** gains `conflicts --pairs`, printing only the `clear`
pairs, one per line, `<id>\t<id>` - a machine-readable form of the table
`conflicts` already prints. The human table stays exactly as it is; this adds a
shape an orchestrator can read without parsing columns.

**`conflicts --pairs`, pinned** (PO, at PLANNED → RED; RED may amend any block
of this Contract in place, with a reason written beside it, and GREEN builds
what the amended block says):

- **Output.** Exactly one line per pair the table reports `clear`, and nothing
  else on stdout: no header, no rule line, no footer count, no `DRIFT` line, no
  "UNKNOWN is not clear" note. Each line is `<first-id>\t<second-id>` - one
  literal TAB, no trailing whitespace - with the two ids in the order the table
  prints them (`story_walk` order; the earlier story first). Each pair once.
- **Same judgement as the table.** The set of lines is exactly the set of
  `clear` rows of `plan.sh conflicts` over the same backlog. One computation,
  two renderings: a `clear` decided twice is a `clear` that will one day
  disagree with itself (`story_walk`'s own comment, and `shared_paths`').
- **Omits** every `CONFLICT` pair, every `UNKNOWN` pair, and every pair with a
  `blocked` story (blocked stories are never candidates, as in the table).
- **Exit status 0** whenever it ran, whether or not a `CONFLICT` or `UNKNOWN`
  pair exists and whether or not it printed anything. Empty output is a valid
  answer - "nothing may pair" - and a caller writing `pairs=$(plan.sh conflicts
  --pairs)` under `set -e` must not die on the ordinary case. The table keeps
  its non-zero-on-CONFLICT status unchanged.
- **Fewer than two startable stories:** empty stdout, exit 0 - not the table's
  "fewer than two startable stories" sentence.
- **stderr** may carry nothing that a caller has to filter; `--pairs` is read
  from stdout only.
- **An unrecognised argument to `conflicts`** (`--pair`, `--json`, anything
  not `--pairs`) exits non-zero with a usage message on stderr and prints no
  table. A typo must not silently fall back to the human table, which an
  orchestrator would then misparse. `conflicts` with no argument is unchanged.

**AC-5, the half a suite can hold.** `plan.sh conflicts` with no argument keeps
its exact output and exit status over the existing fixtures - the suite's
current `conflicts` assertions must pass unmodified, and RED does not edit
them. The other half (the orchestrator with one worktree behaves as today) is
prose, verified at REVIEW.

**AC-2's refusal comes from `lead-po`, not from `phase.sh`.** Measured at
PLANNED: `phase.sh set B <PHASE>` in a worktree whose active story is A does
not refuse on the grounds that A is active - it overwrites
`current-story.env`. What refuses today is the branch guard (`guard_transition`
in `phase.sh`: *"checkout is on '<A's branch>' but B belongs on '<B's
branch>'"*), which names the branch, not the story. Since this Contract forbids
a `phase.sh` change, `lead-po.md` instructs the orchestrator to read `bash
scripts/phase.sh show` in the target worktree before dispatching and to refuse,
naming the story it finds there, when that story is not the selected one. The
branch guard is the backstop, not the mechanism. If REVIEW judges that
insufficient, the fix is a HARNESS-008-shaped story against `phase.sh`, not a
change here.

**No change to** `phase.sh`, `phase-guard.sh`, `gates.sh` or
`check-boundaries.sh`. If this story finds it needs one, that is a sign the
per-worktree work of HARNESS-008 was incomplete and belongs there, not here.

**`.claude/tests/plan.test.sh`** covers `--pairs`: that it lists exactly the
`clear` pairs, omits `CONFLICT` and omits `UNKNOWN`. The prose criteria of AC-2
through AC-4 are verified by review and by the deferred probe below, because an
agent definition is not assertable by a shell suite - and writing a test that
greps `lead-po.md` for a sentence would pin the sentence, not the behaviour.

**Oracle partition** (for the RED brief):

- *Mechanical, exact pinning* - AC-1's `--pairs` output (line set, TAB
  format, order, exit status, empty cases, unknown-argument refusal) and AC-5's
  unchanged table. Every needle anchored: whole-line matches (`grep -cx`) or
  exact-equality against the full stdout, never a floating substring - `A\tB`
  floats inside `A\tBC`, and `HARNESS-01` inside `HARNESS-010`.
- *Settled number to read out* - the real backlog at PLANNED: `plan.sh
  conflicts` reports 11 `clear`, 4 `CONFLICT`, 0 `UNKNOWN` (below). A test does
  not pin these - the backlog moves - but GATES reads them out.
- *Oracle-free, verified by review* - AC-2 to AC-4 and AC-6: prose in
  `lead-po.md`. No shell assertion on its wording.

**Required gate.** `BOOTSTRAPPED=no`, so `gates.sh` configures none and
`required_gates` stays `[]`, as for HARNESS-007. What fails if this breaks is
`bash scripts/selftest.sh`, specifically its `plan` suite, which CI's `gates`
job runs. **Line pins:** `.claude/tests/grep-count.test.sh` cites `plan.sh`
line 108 in a comment and scans the file; `check-sigpipe.sh` scans it too. Run
the full selftest before REVIEW.

**Test-only dependencies:** none. bash, awk, coreutils.

**Callers of anything whose signature changes:** none. `--pairs` is a new flag;
`conflicts` with no flag is unchanged, and `phase.sh board` does not call it.
The one behavioural change to an existing form is `conflicts <junk>` now
refusing. `rg 'plan.sh conflicts|cmd_conflicts' scripts .claude .github
CLAUDE.md` at `980bba9`, excluding `plan.sh` itself and `.claude/worktrees/`
and `.claude/state/`: every invocation passes no argument - `CLAUDE.md:93,160`,
`.claude/commands/plan-product.md:93`, `.claude/skills/story-authoring/SKILL.md:72`,
`scripts/new-story.sh:37,74` (comments/prose), `.claude/tests/plan.test.sh:348,410`
(`conflicts` bare), and comments at `.claude/tests/plan.test.sh:397,704`,
`.claude/tests/boundaries.test.sh:1361`, `.claude/tests/new-story.test.sh:134-183`.
RED's handoff states that this list was checked against the tree.
## Deferred verifications

**AC-6, and the prose half of AC-2 to AC-4. Owner: REVIEW.**

`lead-po.md` is an agent definition. A shell suite cannot assert that prose
instructs correctly, and a test that greps it for a phrase pins the phrase
rather than the instruction - a failure already on this harness's record.
REVIEW reads it and records here that it answers three questions without
needing this story to be re-read: how a pair is chosen, what happens to the
others when one goes red, and what the report says about merge order.

**Result (REVIEW, 2026-09-30, `lead-po`):** read `## More than one worktree` in
`.claude/agents/lead-po.md` cold, against the criteria. It answers all three
questions without this story, and also covers AC-2 and AC-5:

- *How a pair is chosen (AC-1):* candidates are what `plan.sh next` does not
  call `blocked`; pairs are the lines of `plan.sh conflicts --pairs` and
  nothing else; "UNKNOWN is not permission"; for 3+ worktrees every pair in the
  set, stories already in flight included, must be a line; empty output means
  one at a time. Never parse the table.
- *Dispatch (AC-2):* the worktree is on the story's `branch:`; `phase.sh show`
  run in it first; a different `STORY_ID` is refused by name. States that
  `phase.sh set` overwrites and the branch guard is only a backstop - which
  matches what PLANNED measured.
- *One goes red (AC-3):* the failing story takes its usual route; every other
  finishes its current phase, stops at the boundary, and gets a `## Notes` line
  naming who failed which gate where; the report lists every story's worktree,
  stopped phase and reason; resume only once the cause is understood.
- *Merge order (AC-4):* stated with its reason; says plainly the second PR's
  gates ran without the first; forbids implying joint verification; the user
  merges.
- *Single worktree (AC-5):* "nothing in this section applies"; `lead-po` never
  creates a worktree on its own initiative.

One REVIEW change to the prose: GREEN's text had the second branch **rebased**
onto `main`, which on a published branch means a force-push. Changed to merging
`main` into the branch - the same tree, no history rewrite - and added the
consequence measured in `check-boundaries.sh:366`: the stamp is recomputed at
`PR_HEAD_SHA`, so once `main` brings the first PR's code into the branch the
old record stops matching and CI refuses it until `gates.sh` runs again. No
test touches this prose; `plan.test.sh` is unaffected.

**AC-1's selection rule against the REAL backlog. Owner: GATES.**

Release 41: probed against the tree it judges, not only against fixtures.
GATES runs `plan.sh conflicts --pairs` over `docs/backlog/stories/` and pastes
it beside `plan.sh conflicts`, and confirms the lines are exactly the table's
`clear` rows.

*PO correction at PLANNED → RED, 2026-09-30:* this paragraph originally
expected EMPTY, on the grounds that most stories declared no `touches:`. That
stopped being true when HARNESS-006 and HARNESS-017 landed. Measured at
`980bba9`, `plan.sh conflicts` prints 11 `clear`, 4 `CONFLICT`
(001+002, 001+003, 002+003 on `boundaries.test.sh`; 004+005 on
`phase-guard.test.sh`), 0 `UNKNOWN`, exit 1. So the expected `--pairs` output
is the 11 `clear` pairs - 001+004, 001+005, 001+009, 002+004, 002+005,
002+009, 003+004, 003+005, 003+009, 004+009, 005+009 - unless the backlog has
moved, in which case GATES re-reads the table and says what changed. This is a
Deferred-verifications expectation, not an acceptance criterion; no AC changed.

Because the real backlog has **no** UNKNOWN pair, pasting it cannot show
UNKNOWN being omitted. So GATES also runs one real-tree probe: `bash
scripts/mutate.sh docs/backlog/stories/HARNESS-004.md 's/^touches: \[[^]]*\]/touches: []/'
-- bash scripts/plan.sh conflicts --pairs`. Rehearsed on the table at PLANNED:
that mutation makes five HARNESS-004 pairs UNKNOWN (four of them formerly
`clear`), so `--pairs` must fall from 11 lines to 7 with no line naming
HARNESS-004. Paste the output and the restore line.

**Result (GATES, 2026-09-30, at `56395f1`):** as expected, 11 lines, and
exactly the table's `clear` rows (compared as whole strings: `identical`).

    $ bash scripts/plan.sh conflicts            # rc=1
    CONFLICT  HARNESS-001 + HARNESS-002 .claude/tests/boundaries.test.sh
    CONFLICT  HARNESS-001 + HARNESS-003 .claude/tests/boundaries.test.sh
    clear     HARNESS-001 + HARNESS-004 no shared path
    clear     HARNESS-001 + HARNESS-005 no shared path
    clear     HARNESS-001 + HARNESS-009 no shared path
    CONFLICT  HARNESS-002 + HARNESS-003 .claude/tests/boundaries.test.sh
    clear     HARNESS-002 + HARNESS-004 no shared path
    clear     HARNESS-002 + HARNESS-005 no shared path
    clear     HARNESS-002 + HARNESS-009 no shared path
    clear     HARNESS-003 + HARNESS-004 no shared path
    clear     HARNESS-003 + HARNESS-005 no shared path
    clear     HARNESS-003 + HARNESS-009 no shared path
    CONFLICT  HARNESS-004 + HARNESS-005 .claude/tests/phase-guard.test.sh
    clear     HARNESS-004 + HARNESS-009 no shared path
    clear     HARNESS-005 + HARNESS-009 no shared path
    4 conflict(s), 0 pair(s) that could not be judged, 0 drift warning(s).

    $ bash scripts/plan.sh conflicts --pairs    # rc=0
    HARNESS-001	HARNESS-004
    HARNESS-001	HARNESS-005
    HARNESS-001	HARNESS-009
    HARNESS-002	HARNESS-004
    HARNESS-002	HARNESS-005
    HARNESS-002	HARNESS-009
    HARNESS-003	HARNESS-004
    HARNESS-003	HARNESS-005
    HARNESS-003	HARNESS-009
    HARNESS-004	HARNESS-009
    HARNESS-005	HARNESS-009

The real-tree UNKNOWN probe:

    === mutate: docs/backlog/stories/HARNESS-004.md (1 line(s) changed by s/^touches: \[[^]]*\]/touches: []/) ===
      11 - touches: [.claude/tests/phase-guard.test.sh]  # files this story expects to write; `plan.sh conflicts` reads it
      11 + touches: []  # files this story expects to write; `plan.sh conflicts` reads it
    HARNESS-001	HARNESS-005
    HARNESS-001	HARNESS-009
    HARNESS-002	HARNESS-005
    HARNESS-002	HARNESS-009
    HARNESS-003	HARNESS-005
    HARNESS-003	HARNESS-009
    HARNESS-005	HARNESS-009
    rc=0
    7 lines
    0 lines naming HARNESS-004
    === mutate: command exited 0; restored (verified byte-for-byte against .../docs_backlog_stories_HARNESS-004.md.20260930T202933Z.886115.bak) ===

11 → 7 with no line naming HARNESS-004, as rehearsed at PLANNED.


**AC-1's central claim, defect put back. Owner: GATES.**

The story exists so that UNKNOWN is never selected. With `--pairs` changed to
print UNKNOWN pairs as well (via `scripts/mutate.sh` on `scripts/plan.sh`,
against `bash .claude/tests/plan.test.sh` only), the assertion that `--pairs`
omits UNKNOWN must go red and name itself; the suite must be green again after
the restore. RED cannot run this - there is no `--pairs` to break. RED's
handoff declines it and names the assertion GATES should watch.

**Result (GATES, 2026-09-30, at `56395f1`):** the mutation lets UNKNOWN pairs
into `--pairs`; both controls RED's handoff named went red, and the file was
restored.

    === mutate: scripts/plan.sh (1 line(s) changed by s/\[ "\$verdict" = clear \] && printf/[ "$verdict" != CONFLICT ] \&\& printf/) ===
      543 -         [ "$verdict" = clear ] && printf '%s\t%s\n' "${ids[$i]}" "${ids[$j]}"
      543 +         [ "$verdict" != CONFLICT ] && printf '%s\t%s\n' "${ids[$i]}" "${ids[$j]}"
    === mutate: running bash .claude/tests/plan.test.sh ===
        FAIL AC-1: --pairs prints exactly the clear pairs, one <id><TAB><id> line each, in the table's order, and nothing else
        FAIL AC-1 control: the UNKNOWN story D appears on no line - unknown is not permission
        FAIL AC-1: each pair is printed once, in one orientation only
        FAIL AC-1: --pairs is exactly the table's clear rows over the same backlog, in the same order
        FAIL AC-1: with ids that prefix one another, the set of lines is exactly the two clear pairs
        FAIL AC-1: and in the table's order, matching it line for line
        FAIL AC-1 control: the UNKNOWN story H-1 is on no line, while H-10, H-11 and H-110 are
        FAIL AC-1: a backlog with no clear pair gives empty stdout and exit 0 (the table's CONFLICT status does not leak)
    plan: 159 passed, 8 failed
    === mutate: command exited 1; restored (verified byte-for-byte against .../scripts_plan.sh.20260930T203009Z.888436.bak) ===

The suite is green again after the restore: see the full selftest in `## Notes`.


**The joint-correctness question of AC-4. Owner: REVIEW, as a decision rather
than a measurement.**

Two stories that pass separately can fail together, and no gate in this harness
runs against both. REVIEW records which position this story took - report and
proceed, serialise the second PR's gates behind the first merge, or something
else - and why. A story that ships parallel dispatch without recording a
position here has shipped the problem silently.

**Result (REVIEW, 2026-09-30, decision):** **serialise the second PR's gates
behind the first merge.** After the user merges the first PR, `lead-po` merges
the updated `main` into the second branch, re-runs `gates.sh` in that worktree,
commits the record at REVIEW, pushes, and only then calls the second PR ready.
A merge conflict or a gate failure there is a gate failure of the second story.

Why this over "report and proceed": the merged tree is exactly `main` after the
second merge, so one extra gate run per extra PR is a real joint check, where
reporting alone would leave a joint failure to be found on `main`. Nothing in
the harness forced that run before - the stamp is checked at the PR head
(`check-boundaries.sh:366`, `PR_HEAD_SHA`), so a second PR left behind `main`
stays green. Once `main` is merged in, the old stamp no longer matches, so the
re-run is enforced by CI rather than by prose alone. Why merge rather than
rebase: the branch is published, and rebasing it needs a force-push. What this
does **not** give: a gate that runs two unmerged branches together - still out
of scope, as `## Out of scope` says.
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

Planned by `bash scripts/plan.sh write HARNESS-009` from `.claude/harness/models.conf`.
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

- PLANNED → RED, `lead-po` (this session): `claude-opus-5-5` (opus), as planned.
- RED, `test-developer`: dispatched with `model: opus`; resolved `opus` per the agent file, no override (its own report). As planned.
- GREEN, `feature-developer`: dispatched with `model: opus`; resolved `opus` per the agent file, no override (its own report). As planned.
- GATES, `lead-po` (this session): `claude-opus-5-5` (opus), as planned. No subagent dispatched: both GATES verifications ran green-to-red-to-green without a fix.
- REVIEW, `lead-po` (this session): `claude-opus-5-5` (opus), as planned.
<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Out of scope

- **Merging anything.** The orchestrator reports a merge order; it does not
  merge. The user merges, which is this project's standing convention and is
  load-bearing rather than habitual: every defect this harness shipped in
  releases 37-45 was one its own suite was green on, and the reviewer being a
  different process from the author is what caught them.
- **A gate that runs two branches together.** AC-4 requires the orchestrator to
  SAY that the second PR's gates did not see the first. Building a gate that
  would is a different story and a much larger one.
- **More than two worktrees, as a tested claim.** The design should not assume
  two, but the acceptance criteria are written for a pair because that is what
  HARNESS-008 will have demonstrated.
- **Any change to the phase model.** If parallel dispatch appears to need a new
  phase, or a story in two phases at once, the answer is no: that is the lock
  being routed around, and law 5 covers it.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

One new `describe` block at the end of `.claude/tests/plan.test.sh`,
"conflicts --pairs: the clear pairs, for an orchestrator to read (HARNESS-009)",
32 assertions. Level: the script's CLI over throwaway fixture backlogs built with
the suite's own `story_with`/`fresh` - the cheapest level at which the contract
(stdout, stderr, exit status) exists. stdout and stderr are captured separately
(`pairs_run`), not through `plan()`, which folds stderr into stdout.

Five fixtures:

| Fixture | Stories | What it discriminates |
|---|---|---|
| **mixed** | A `src/a.ts` (+ a `**Writes:**` line touches: misses, so the table prints DRIFT); B `src/b.ts`; C `src/a.ts`; D declares nothing; E `src/e.ts` depends_on F; F `src/f.ts` phase RED | clear A+B, A+F, B+C, B+F, C+F printed; CONFLICT A+C, four UNKNOWN D pairs, blocked E omitted - each against a printed sibling in the same run |
| **prefix ids** | H-1 nothing; H-10 `src/a.ts`; H-11 `src/b.ts`; H-110 `src/a.ts`; H-2 `src/z.ts` depends_on H-10 | ids that prefix one another; clear H-10+H-11, H-11+H-110 only |
| **no clear pair** | A, B both `src/a.ts`; C nothing | empty stdout, exit 0, while the table exits 1 |
| **fewer than two** | empty backlog; one story; two stories with one blocked | empty stdout, exit 0, not the table's sentence |
| **bad argument** | A `src/a.ts`, B `src/b.ts` (one clear pair) | `--pair`, `--json`, `pairs` refuse; `--pairs` on the same backlog prints `A<TAB>B` |

Assertion -> AC:

- AC-1 exact stdout over **mixed** equals the five-line literal (TAB-separated, story_walk order).
- AC-1 exit 0 over **mixed** despite CONFLICT and UNKNOWN.
- AC-1 stderr empty over **mixed**.
- AC-1 control: `A<TAB>B` whole-line count 1 (the printed sibling).
- AC-1 control: `A<TAB>C` and `C<TAB>A` whole-line counts 0 (CONFLICT).
- AC-1 control: no line has D as a whole field (UNKNOWN).
- AC-1 control: no line has E as a whole field (blocked).
- AC-1 shape: every line matches `^[^\t ]+\t[^\t ]+$`.
- AC-1 each pair once: 5 distinct unordered pairs and 5 lines.
- AC-1 no header/rule/DRIFT/footer/UNKNOWN note on stdout.
- AC-1 one computation: stdout equals the table's `clear` rows (read from the STATUS column) rendered `<id>\t<id>`, same order.
- AC-5 bare `conflicts` over **mixed** prints the table byte for byte as today (header, rule, 10 rows, DRIFT, footer, UNKNOWN note).
- AC-5 bare `conflicts` over **mixed** still exits 1.
- AC-1 **prefix ids**: set of lines (C-sorted, orientation-normalised) is exactly `H-10<TAB>H-11`, `H-11<TAB>H-110`.
- AC-1 **prefix ids**: stdout equals the table's clear rows in order.
- AC-1 control: whole-field counts H-1/H-10/H-11/H-110 = `0|1|2|1`.
- AC-1 control: `H-10<TAB>H-110` either way round = 0 (CONFLICT).
- AC-1 control: H-2 on no line (blocked).
- AC-1 **prefix ids** exit 0.
- AC-1 **no clear pair**: stdout empty and exit 0.
- AC-5 **no clear pair**: bare table still exits 1.
- AC-1 a `bash -e` caller doing `p="$(plan.sh conflicts --pairs)"` survives the empty answer.
- AC-1 **fewer than two** x3: empty stdout, exit 0.
- AC-1 **bad argument** x3 (`--pair`, `--json`, `pairs`): exit non-zero with empty stdout; stderr contains `usage` (case-insensitive).
- AC-1 control: the same backlog's `--pairs` prints exactly `A<TAB>B`, exit 0.

Not tested, by the Contract's oracle partition: AC-2, AC-3, AC-4, AC-6 (prose
in `lead-po.md`, REVIEW). `lead-po.md` is not grepped.

## Handoff: RED -> GREEN

**Command:** `bash .claude/tests/plan.test.sh` (about 5 minutes on this
Windows machine, measured locally; the new block alone is about 45 s). The
suite also runs under `bash scripts/selftest.sh`.

**Result in RED (local run):** `plan: 144 passed, 23 failed`. The 135 that
were there before all pass; of the 32 new ones, 9 pass and 23 fail. Pre-change
baseline on the same tree: `plan: 135 passed, 0 failed`.

**Why it is the right failure.** `plan.sh`'s dispatcher is
`conflicts) cmd_conflicts ;;` and ignores `$2`, so `conflicts --pairs` and
`conflicts --pair` both print the human table with the table's exit status.
Every failure is that: the table where lines were expected, exit 1 where 0 was
expected, and exit 0 plus a table where a refusal was expected. No failure is a
syntax, fixture or harness error. Excerpt, verbatim:

```
    FAIL AC-1: --pairs prints exactly the clear pairs, one <id><TAB><id> line each, in the table's order, and nothing else
         expected: A	B
         A	F
         B	C
         B	F
         C	F
         actual:   STATUS    PAIR                      DETAIL
         --------- ------------------------- ------------------------
         clear     A + B                     no shared path
         CONFLICT  A + C                     src/a.ts 
         UNKNOWN   A + D                     declares neither touches: nor Contract paths - cannot judge
         ...
    FAIL AC-1: --pairs exits 0 though the backlog holds a CONFLICT and an UNKNOWN pair
         expected: 0
         actual:   1
    FAIL AC-1 control: the clear sibling A<TAB>B is printed exactly once
         expected: 1
         actual:   0
    FAIL AC-1 control: the UNKNOWN story H-1 is on no line, while H-10, H-11 and H-110 are
         expected: 0|1|2|1
         actual:   0|0|0|0
    FAIL AC-1: a backlog with no clear pair gives empty stdout and exit 0 (the table's CONFLICT status does not leak)
         expected: |0
         actual:   STATUS    PAIR ...   CONFLICT  A + B   src/a.ts ... |1
    FAIL AC-1: an empty backlog gives empty stdout and exit 0
         expected: |0
         actual:   fewer than two startable stories; nothing to compare|0
    FAIL AC-1: conflicts --pair exits non-zero and prints nothing on stdout
         expected: nonzero|
         actual:   zero|STATUS    PAIR                      DETAIL ...
    FAIL AC-1: conflicts --pair puts a usage message on stderr
         expected: 1
         actual:   0

plan: 144 passed, 23 failed
```

The full list of 23 failing names: exact stdout (mixed); exit 0 (mixed);
sibling `A<TAB>B` once; line shape; each pair once; no table furniture; equals
table's clear rows (mixed); set (prefix); order (prefix); H-1/H-10/H-11/H-110
counts; exit 0 (prefix); no-clear-pair empty+0; `set -e` caller; empty
backlog; one story; two-with-one-blocked; `--pair`/`--json`/`pairs` x
(non-zero+empty stdout, usage on stderr); the bad-argument sibling control.

**Files touched:** `.claude/tests/plan.test.sh` (appended block, before the
final `summary "plan"`; no existing line edited), and this story's
`## Test plan` and `## Handoff`. Nothing else. The pre-existing `conflicts`
assertions (lines ~320-420 and the HARNESS-006/016 blocks) are untouched.

**The interface the tests pin (fact, not suggestion):**

- `bash scripts/plan.sh conflicts --pairs`, run from the project root.
  - stdout: exactly one line per `clear` pair, `<id>\t<id>`, one literal TAB,
    no other whitespace, ids in the table's order (the earlier story in
    `story_walk` order first), pairs in the table's row order. Nothing else.
    Empty when there is no clear pair or fewer than two startable stories.
  - stderr: empty on an ordinary run (the mixed fixture, which has DRIFT,
    CONFLICT and UNKNOWN - so none of those may be reported on stderr either).
  - exit: 0 in every case tested.
- `bash scripts/plan.sh conflicts <anything else>` (tested: `--pair`, `--json`,
  `pairs`): exit non-zero, stdout empty, stderr contains the word `usage` in any
  case. `die "usage: ..."` (exit 2) satisfies it.
- `bash scripts/plan.sh conflicts` with no argument: byte-identical to today
  over the mixed fixture, exit 1 on a CONFLICT.

**Not constrained - the implementer's choice:** how `--pairs` shares the
table's computation (a mode flag inside `cmd_conflicts`, a helper both
renderings call, etc. - the Contract asks for one computation, and the test
"equals the table's clear rows" is the mechanical check on it); the exact
non-zero exit code and usage wording for a bad argument; whether stderr is
empty for the "fewer than two" and "no clear pair" cases (only the mixed
fixture asserts empty stderr); behaviour of `conflicts --pairs <extra>`; whether
`--pairs` also appears in `plan.sh --help` (the `sed -n '3,7p'` header).

**Passed on arrival (9), and what earns each:**

| Assertion | Why green now | What earns it |
|---|---|---|
| AC-5 table byte-identical (mixed) | today's table | **probe, run in RED:** `bash scripts/mutate.sh scripts/plan.sh 's/"no shared path"/"no shared paths"/' -- bash <scratch runner of this block>` -> exactly `FAIL AC-5: conflicts with no argument prints the same table as before --pairs existed`, `h009: 8 passed, 24 failed` (from 9/23), `restored (verified byte-for-byte ...)` |
| AC-5 table exits 1 (mixed) and AC-5 table exits 1 (no clear pair) | today's status | **probe, run in RED:** `mutate.sh scripts/plan.sh 's/^  \[ "$conflicts" -eq 0 \]$/  true/'` -> exactly `FAIL AC-5: and still exits 1 when there is a CONFLICT` and `FAIL AC-5: while the table over the same backlog still exits 1`, restored (verified) |
| stderr empty (mixed) | today's table writes no stderr | vacuous in RED; meaningful once `--pairs` exists. Nothing further owed |
| controls: `A<TAB>C` absent, D absent, E absent, `H-10<TAB>H-110` absent, H-2 absent | **VACUOUS IN RED**: stdout is the table, which contains no TAB, so no whole-line or whole-field needle can match | the GATES "defect put back" mutation below, plus the out-of-framework measurements in the next table. Each is paired with a sibling assertion that FAILS today (`A<TAB>B` once; H-10/H-11/H-110 counts), so an empty or table-shaped stdout cannot pass the block |

Mutation log: `.claude/state/mutations/log` (both entries, 2026-09-30T18:51Z
and 18:52Z). The scratch runner is the suite's own header (lines 1-62), its
`fresh` and `conflicts_rc` helpers and this block, verbatim - the narrowest
command holding the assertions.

**Negative controls - expected values.** No `--pairs` exists, so no control
has run against a real one. These were measured by calling the test's own
`pline`/`naming` helpers directly, in a plain shell, over hand-built stdout -
the correct output and each defect. **They are claims until GREEN runs the
suite against the shipped `--pairs`.**

| Control (assertion) | Fixture | Expected (correct) | Measured: correct stand-in | Measured: defective stand-in |
|---|---|---|---|---|
| sibling `A<TAB>B` whole-line count | mixed | 1 | 1 | 0 on empty stdout |
| `A<TAB>C`/`C<TAB>A` count (CONFLICT) | mixed | `0\|0` | 0 | 1 with CONFLICT let in |
| lines naming D (UNKNOWN) | mixed | 0 | 0 | 4 with UNKNOWN let in |
| lines naming E (blocked) | mixed | 0 | 0 | 4 with blocked story let in |
| H-1/H-10/H-11/H-110 field counts | prefix | `0\|1\|2\|1` | `0\|1\|2\|1` | `3\|2\|3\|2` with UNKNOWN let in; `0\|0\|1\|1` if H-1 is dropped by substring |
| `H-10<TAB>H-110` count (CONFLICT) | prefix | 0 | 0 | - |
| lines naming H-2 (blocked) | prefix | 0 | 0 | - |
| bad-arg sibling `--pairs` | bad argument | `A<TAB>B\|0` | table-derived clear rows = `A<TAB>B` | - |

The literal expected lines were cross-checked against the table: the
"equals the table's clear rows" assertions print their expected side from the
live table today, and it is exactly `A<TAB>B`, `A<TAB>F`, `B<TAB>C`, `B<TAB>F`,
`C<TAB>F` (mixed) and `H-10<TAB>H-11`, `H-11<TAB>H-110` (prefix) - so the
literals and `table_clear_pairs` agree before GREEN starts.

**Deferred verifications I cannot run, declined in writing:**

- *AC-1's central claim, defect put back (owner GATES)*: I cannot run it - in
  RED there is no `--pairs` to break. When GATES mutates `--pairs` to print
  UNKNOWN pairs too, the assertions to watch go red are, by name:
  `AC-1 control: the UNKNOWN story D appears on no line - unknown is not permission`
  (expected `0`, would read `4`) and
  `AC-1 control: the UNKNOWN story H-1 is on no line, while H-10, H-11 and H-110 are`
  (expected `0|1|2|1`, would read `3|2|3|2`). The exact-stdout and
  equals-the-table assertions will go red alongside them; the two controls are
  the ones whose names say what broke.
- *AC-1 against the real backlog (owner GATES)*: not run here; it is GATES'
  real-tree probe (11 lines expected, 7 with the HARNESS-004 mutation).

**Caller list checked.** `rg 'plan.sh conflicts|cmd_conflicts' scripts .claude
.github CLAUDE.md` on this tree, excluding `plan.sh`, `.claude/worktrees/` and
`.claude/state/`: matches the Contract's list - every invocation passes no
argument. One prose mention the Contract's list omits, `CLAUDE.md:120`
("`plan.sh conflicts` judges declarations"), is a sentence, not a call, and
changes nothing. `plan.test.sh`'s own bare calls are at 348 and 410 as listed.

**Checks run:** `bash scripts/check-sigpipe.sh` - 0 findings;
`bash scripts/check-grep-count.sh` - 0 findings (the new `grep -cxF` has no
printing fallback; `table_clear_pairs` captures and then reads, no pipe into
the reader). `bash scripts/gates.sh --fast` - 0 ran, 5 unconfigured
(`BOOTSTRAPPED=no`), as the Contract expects; the judge is `selftest.sh`.

**For GREEN:**

- `.claude/tests/floors.conf`'s `plan` floor is 42 against 167 assertions
  now; it is a floor, so nothing breaks, and this story does not touch it.
- The early `fewer than two` return in `cmd_conflicts` prints its sentence and
  the DRIFT block; `--pairs` must return before either reaches stdout.
- The dispatcher line `conflicts) cmd_conflicts ;;` is where the refusal of a
  bad argument has to happen; `conflicts` with no `$2` must remain the table.
- No Contract amendment was needed.

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

    run:    2026-09-30T21:55:31Z
    commit: 1e911a4 (working tree had uncommitted changes)
    tree:   a78951fb519df8de165a0f29a0e705df52189ad3
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

Filed 2026-09-21 with HARNESS-008, after the user asked what HARNESS-006
enables and then asked about making the loop more automatic.

**`depends_on: [HARNESS-008]`, and that one IS mechanical.** Dispatching into
worktrees that do not have independent phase locks would corrupt both. 006 and
007 are not dependencies - without them the selection rule simply finds fewer
`clear` pairs, which is a smaller capability rather than a broken one.

**On automation generally, since that is the question behind this story.** An
orchestrator that dispatches more work in parallel is a different thing from an
orchestrator that also reviews and merges it. This story does the first
deliberately and rules out the second in `## Out of scope`. The separation is
not caution for its own sake: releases 37-45 produced a phase-lock hole, two
blind guards and a rule that needed correcting, every one of them green in the
suite that was supposed to catch it, and every one found by something that had
not written it.

**RED model: `opus`, decided by the user on 2026-09-30.** HARNESS-017 added the
`**Writes:**` line to this story's `## Contract`. Every path on it classifies
`harness`, so the `unenforced` exception in `models.conf` fires and RED moves
from `fable` to `opus`: the phase lock freezes none of these files, so the
Contract is the only enforcement there is. The user chose this on 2026-09-30,
when asked with the measured fable → opus move in front of them.
`models.conf` was not edited; `## Model guidance` was re-rendered with
`plan.sh write`.

**PO decisions at PLANNED → RED, 2026-09-30.**

1. **No epic check.** `epic:` is empty, so there is no done-when to read these
   criteria against.
2. **The GATES expectation for the real backlog was stale** (EMPTY → 11 `clear`
   pairs) and is corrected in `## Deferred verifications`, with the measurement.
   Criteria unchanged.
3. **`--pairs` shape pinned in `## Contract`**: TAB-separated, `story_walk`
   order, exit 0 always, empty on fewer than two candidates, and an unrecognised
   `conflicts` argument refuses. The last is the only change to an existing
   form; the caller list shows nothing passes one.
4. **AC-2's refusal is `lead-po`'s**, reading `phase.sh show`; measured that
   `phase.sh set` overwrites an active story in the same worktree and only the
   branch guard refuses. Recorded in the Contract rather than changing
   `phase.sh`, which the Contract forbids.
5. **A defect-put-back mutation for AC-1** added, owner GATES, per `rules.md`.

**GREEN, 2026-09-30 (`feature-developer`, `opus`, no override): negative
controls measured against the shipped `--pairs`.** Measured by running the
handoff's block (verbatim, in a scratch runner, with added measurement lines
only) against the real `scripts/plan.sh`. All match RED's expected values, and
none diverge:

| Control | Expected | Measured |
|---|---|---|
| sibling `A<TAB>B` count (mixed) | 1 | 1 |
| `A<TAB>C`/`C<TAB>A` (CONFLICT) | `0\|0` | `0\|0` |
| lines naming D (UNKNOWN) | 0 | 0 |
| lines naming E (blocked) | 0 | 0 |
| H-1/H-10/H-11/H-110 | `0\|1\|2\|1` | `0\|1\|2\|1` |
| `H-10<TAB>H-110` either way | 0 | `0\|0` |
| lines naming H-2 (blocked) | 0 | 0 |
| bad-arg sibling `--pairs` | `A<TAB>B\|0` | `A<TAB>B\|0` |

Defective side, which RED measured only on hand-built stand-ins. This is a
confirmation of the numbers, not the GATES defect-put-back, which is still
owed against `plan.test.sh`. `scripts/mutate.sh scripts/plan.sh
's/\[ "$verdict" = clear \] \&\& printf/[ "$verdict" != CONFLICT ] \&\& printf/'`
(this lets UNKNOWN in) gives D = **4** and H-1/H-10/H-11/H-110 = **3|2|3|2**,
exactly as RED predicted. The block went from `32 passed, 0 failed` to
`24 passed, 8 failed`, and the file was `restored (verified byte-for-byte ...)`.

**Orchestrator's GREEN verification, 2026-09-30.** Own run: `plan: 167 passed,
0 failed`; `git diff d7b3961 -- .claude/tests/` empty (tests frozen, though the
lock could not enforce it - `harness`); real backlog `conflicts --pairs` 11
lines, exit 0; `conflicts --pair` → `usage: plan.sh conflicts [--pairs]
(got '--pair')`, exit 2; sigpipe and grep-count 0 findings. **For REVIEW to
judge in the AC-4 position `lead-po.md` now takes:** "rebase the second branch
... push" implies a force-push of a published branch, and the re-run
`gates.sh` rewrites the story's `## Gate results` on a story already at
REVIEW, so that commit is an exit from REVIEW with the ordering rule attached.
Whether merging `main` into the branch (no force-push) is the better
instruction is REVIEW's call.

**GATES, 2026-09-30.** Both GATES-owned deferred verifications ran and are
pasted in their blocks (real backlog 11 → 7 under the HARNESS-004 probe;
defect put back, `plan: 159 passed, 8 failed` with both named UNKNOWN controls
red, restored). Full `bash scripts/selftest.sh` after the restores, exit 0:
20 suites, 0 failed (`plan: 167 passed, 0 failed`; floors met, 1613
assertions executed). Wall clock 2098 s on this Windows machine; CI runs the
selftest on `ubuntu-latest` (31 s measured, `gates.yml`), so the local figure
is process-spawn cost, not a timeout risk - REVIEW reads the real CI timing.
`gates.sh`: `pass (0 ran, 7 unconfigured, 0 known)`, as for every harness
story while `BOOTSTRAPPED=no`.

**DONE, 2026-09-30.** Merged in #90 (merge commit f76e233), release 59 - the
VERSION bump lands in this DONE commit, as HARNESS-016's did, because the PR
changed `lead-po.md` and `plan.sh` without one. PR CI: the `gates` job passed
in 1m41s. Its harness self-test step took 89s, against no `timeout-minutes`
(GitHub's 6h default); it was 86s on #89
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/36782581224).
`boundaries` passed in 5s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/36782581538).
No epic, so no `/audit-mutations` recommendation. Loose end noted in GREEN:
the comment at `.claude/tests/grep-count.test.sh:141` citing `plan.sh` line
108 was already stale before this story (the first `<<<` is at line 185).
