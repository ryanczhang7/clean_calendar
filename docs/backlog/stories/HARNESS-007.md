---
id: HARNESS-007
title: The planner cuts stories into waves that can be worked together
slug: the-planner-cuts-stories-into-waves-that
epic: 
type: chore
status: done
phase: DONE
branch: story/HARNESS-007-the-planner-cuts-stories-into-waves-that
depends_on: [HARNESS-006]      # story ids; phase.sh refuses to start this story until they are DONE
touches: [.claude/commands/plan-product.md, .claude/skills/story-authoring/SKILL.md, scripts/plan.sh, .claude/tests/plan.test.sh, .claude/harness/VERSION]  # files this story expects to write
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

No epic. The harness maintaining itself, and the one that answers the original
criticism rather than working around it.

**The planner has never been asked to produce a parallelisable backlog.**
`plan-product.md` step 5 says "features in dependency order" and
`story-authoring` sizes a story by one RED to GREEN cycle. Grepped at release
45: `create-product.md`, `plan-product.md`, `lead-po.md` and
`story-authoring/SKILL.md` mention simultaneous development ZERO times between
them. Stories are cut for size and order. Whether their file footprints
partition is not something anyone has been asked to weigh.

**So everything downstream of planning is repair work.** `plan.sh conflicts`
(release 45) reports which of the planner's choices were unfortunate. It cannot
make the planner choose differently. HARNESS-006 moves the declaration early
enough to be usable; this is the story that makes it *used*.

**`depends_on` is doing two jobs and only admits to one.** It is enforced as
"A must be DONE before B may start", which is true ordering - B builds on what A
decided. It is also, in practice, where a planner puts "these two would tread on
each other", because it is the only tool available. Those are different
constraints: the first is about knowledge, the second about files. Conflating
them is why a backlog looks more sequential than it is - stories are chained
that could have run side by side, and nothing records which chains were real.

Once `touches:` exists, collision has its own expression, and `depends_on` can
mean only what it says.

**What this story adds, concretely.** A planner needs a tool as well as an
instruction, or the instruction is advice. `plan.sh waves` groups the startable
stories into waves: within a wave, every pair is `clear`; a story that cannot be
placed without a conflict starts the next wave. It is the same pairwise data
`conflicts` already computes, arranged the way a planner actually thinks.

**And it must stay honest about not knowing.** A story declaring nothing cannot
be placed, and a wave that quietly includes it would be worse than no waves at
all. UNKNOWN keeps the disposition it has everywhere else in this harness: not
clear, not a permission, reported in its own right.
## Acceptance criteria

- **AC-1** - Given startable stories whose `touches:` sets are pairwise
  disjoint, when `bash scripts/plan.sh waves` runs, then all of them appear in
  wave 1. *Control:* two whose sets intersect never share a wave.
- **AC-2** - Given three stories where A conflicts with B, B conflicts with C,
  and A does not conflict with C, when `waves` runs, then A and C share a wave
  and B is in another. A wave is a set of MUTUALLY disjoint stories, not a chain
  of pairwise-checked neighbours.
- **AC-3** - Given a story that declares nothing, when `waves` runs, then it is
  listed as unplaceable with the reason, and is in no wave. *Control:* it does
  not silently land in wave 1, and the exit status distinguishes "there are
  waves" from "nothing could be judged".
- **AC-4** - Given a story blocked by `depends_on`, when `waves` runs, then it
  appears in no wave and is reported as blocked. Ordering and collision are
  different constraints and the output names which one applies.
- **AC-5** - `plan-product.md` step 5 instructs the planner to fill `touches:`
  when cutting each story, and to prefer a decomposition whose footprints
  partition - stating that `depends_on` is for true ordering only, now that
  collision has its own expression. *Verified by review* - see
  `## Deferred verifications`.
- **AC-6** - `story-authoring/SKILL.md` gains the second sizing axis beside "one
  RED to GREEN cycle": a story that cannot state its footprint is not ready to
  be cut, and two stories that must share a file are one story or two waves.
  *Verified by review* - see `## Deferred verifications`.
## Contract

RED may amend any block below in place, with a one-line reason beside the
change; GREEN builds what the amended block says. Every file this story writes
classifies as `harness`, so the phase lock freezes none of it in any phase: this
Contract is the only enforcement there is. RED writes only
`.claude/tests/plan.test.sh`; GREEN writes no test file.

**Writes:** `scripts/plan.sh`, `.claude/tests/plan.test.sh`, `.claude/commands/plan-product.md`, `.claude/skills/story-authoring/SKILL.md`, `.claude/harness/VERSION`

*(PLANNED, 2026-09-30: `.claude/harness/VERSION` added here and to `touches:`.
This is a harness change, and `check-boundaries.sh` refuses one without a
bump. HARNESS-016 missed the bump because the file was not declared.)*

**`scripts/plan.sh`** gains `cmd_waves`, reached as `plan.sh waves`. The block
below illustrates the SHAPE; it is not a prediction for today's backlog. The
real-backlog expectation is under `## Deferred verifications`.

    WAVE 1   HARNESS-002  HARNESS-005
    WAVE 2   HARNESS-003
    BLOCKED  HARNESS-009  depends_on HARNESS-008 (PLANNED)
    UNKNOWN  HARNESS-001  declares no paths - cannot be placed

    2 wave(s), 1 blocked, 1 unplaceable.

Greedy placement, first fit: walk the startable stories in id order, put each in
the first wave where it conflicts with nothing already there, else open a new
wave. Greedy is not minimal and must not claim to be - the comment says so,
because the next reader will wonder. Minimal graph colouring is NP-hard, the
input is a backlog of tens, and a planner wants a defensible grouping rather
than an optimal one.

**It reuses, and does not reimplement.** The pairwise question is already
answered by `story_paths` (HARNESS-016 factored out `touches:` first, then the
Contract's paths), and `cmd_conflicts` intersects two of those lists. `waves`
asks the same question the same way. *(PLANNED: `story_touches`/`contract_paths`
became `story_paths` in HARNESS-016; the rule is unchanged.)* GREEN may factor
the candidate walk and the pairwise test out of `cmd_conflicts` into helpers
both commands call. If it does, `conflicts` output stays byte-identical, which
the existing assertions pin. Two answers to "do these collide" is the failure
`rules.md` names.

**Pinned semantics, one line each:**

- **Which stories are considered.** A story in DONE is omitted entirely. Every
  other story whose `cmd_next` is `blocked` goes on a BLOCKED line. Every
  remaining story is a candidate. This is exactly the set `cmd_conflicts`
  compares, in-flight stories included, because they occupy their files too.
- **Order.** Candidates are walked in the order `"$STORIES"/*.md` yields them,
  which is the order `conflicts` uses. Within a wave, ids print in that order.
- **UNKNOWN.** A candidate whose `story_paths` is empty is placed in no wave
  and gets one UNKNOWN line. It is never compared, so it cannot land in wave 1
  by default.
- **Collision.** Two candidates collide when their `story_paths` lists share at
  least one line, compared exactly (the `conflicts` intersection). A story joins
  wave *k* only if it collides with NONE of wave *k*'s current members: mutual
  disjointness, checked against every member, not only the last one placed.
- **First fit.** Try waves 1, 2, … in order. The first wave with no collision
  takes the story, and if every wave has one, a new wave opens.
- **BLOCKED before UNKNOWN.** A blocked story that also declares nothing is
  listed once, as BLOCKED. Ordering is decided before collision, and the output
  names the one that applies.

**Output, exactly.** Each line is `printf '%-9s%s\n'`-shaped: a 9-column label,
then the rest.

    WAVE <k>  ->  label "WAVE <k>" padded to 9, then ids joined by two spaces
    BLOCKED   ->  "BLOCKED  <id>  depends_on <dep> (<PHASE>)[, <dep> (<PHASE>)...]"
                  each dep that is not DONE, in depends_on order; a dep with no
                  story file prints as "<dep> (missing)"
    UNKNOWN   ->  "UNKNOWN  <id>  declares no paths - cannot be placed"

Order of lines: every WAVE line in wave order, then the BLOCKED lines, then the
UNKNOWN lines, in candidate order. Then one blank line and the summary, always
printed, with fixed plurals:

    <W> wave(s), <B> blocked, <U> unplaceable.

*(RED, 2026-09-30: the blank line is printed even when no WAVE, BLOCKED or
UNKNOWN line precedes it, so an all-DONE backlog prints `\n0 wave(s), 0
blocked, 0 unplaceable.`. Reason: "one blank line and the summary, always
printed" read two ways for an empty body, and a test has to pin one.)*

**Exit status:** 0 when W >= 1; 1 when W = 0, and that includes a backlog with
nothing but DONE stories. A backlog of entirely undeclared stories is not a
success. `plan.sh` keeps exit 2 for usage errors (`die`).

**Dispatch:** a `waves) cmd_waves ;;` arm in the final `case`. The help header
(lines 3-6, printed by `sed -n '3,6p'`) may gain a `waves` line only if the
`sed` range moves with it. Nothing asserts the help text.

**`.claude/tests/plan.test.sh`** carries AC-1 to AC-4 under a new
`describe "waves: the planner cuts stories into waves (HARNESS-007)"`, using
the existing `story_with` fixture (`TOUCHES:`, `DEPENDS:`, `CONTRACT:`) and
`plan waves`. Each fixture set starts from an empty
`$FIX/docs/backlog/stories/` so that earlier sections' stories do not leak in.
The existing assertions stay byte-identical and green: this adds a command, and
`conflicts` is unchanged.

**Controls the tests must carry**, because the AC wording alone does not
discriminate:

- AC-1: two candidates sharing one path never share a wave, and each is in
  exactly one wave.
- AC-2, as written (A-B and B-C collide, A-C do not): A and C are in wave 1 and
  B is in wave 2. This fails a "next fit" placement, which only tries the
  newest wave.
- AC-2, mutual disjointness (A-C collide, B disjoint from both, id order A, B,
  C): C is NOT in wave 1. This fails a placement that checks only a wave's
  last-placed member. The AC's literal case cannot catch that mutant, and this
  control exists for it.
- AC-3: an undeclared candidate is on an UNKNOWN line and in no WAVE line. With
  only undeclared candidates the command exits 1; with one placeable story it
  exits 0.
- AC-4: a story whose `depends_on` names a non-DONE story is on a BLOCKED line
  naming that dependency and its phase, and in no WAVE line. A story whose
  dependency IS DONE is placed normally.

Needles are anchored (`grep -cx` on whole lines), never a floating `WAVE 1`.
`WAVE 1` also matches `WAVE 10`, and an id needle `T-1` matches `T-10`.

**Oracle partition.** *Mechanical:* AC-1 to AC-4, with exact lines and exact
counts. *Oracle-free:* none. *Settled:* the real-backlog expectation in
`## Deferred verifications`. *Review:* AC-5, AC-6.

**`plan-product.md` step 5 and `story-authoring/SKILL.md`** (AC-5, AC-6): GREEN
writes them. RED writes no test for them; see `## Deferred verifications`.

**No change to** `depends_on` semantics, `phase.sh`, or the frontmatter schema.
This story reads what HARNESS-006 writes and instructs the planner to write it;
it does not add a field.

**Test-only dependencies:** none. bash, awk, coreutils.

**Callers of anything whose signature changes:** none. `waves` is new, and a
helper factored out of `cmd_conflicts` keeps that function's output. `rg
'cmd_conflicts|story_paths' scripts .claude` at `b46ef1e` finds them only in
`scripts/plan.sh`, plus comments at `.claude/tests/plan.test.sh:397,704` and
`.claude/tests/new-story.test.sh:136`. RED's handoff
states that this list was checked against the tree.

**Required gate.** `BOOTSTRAPPED=no`, so `gates.sh` configures none and
`required_gates` stays `[]`. What fails if this breaks is `bash
scripts/selftest.sh`, specifically its `plan` suite, which CI's `gates` job
runs.

**Line pins.** `.claude/tests/grep-count.test.sh:141` cites `plan.sh` line 108
in a comment, and line 285 scans the file. Neither pins a line number, but run
the full selftest before REVIEW anyway.
## Deferred verifications

**AC-5 and AC-6, the two documentation criteria. Owner: REVIEW.**

`plan-product.md` and `story-authoring/SKILL.md` are instructions a Lead PO
follows. A shell suite cannot assert that prose instructs well, and a test that
greps either for a sentence pins the sentence rather than the instruction - a
failure already on this harness's record, and the reason AC-6 of HARNESS-006
and HARNESS-008 are deferred the same way.

REVIEW reads both and records here that they answer the two questions a planner
will actually hit, neither of which this story's own prose settles:

  * what granularity to declare - a file, or a directory glob - and what to do
    about a story that will touch "some of `src/core/`" without knowing which;
  * what to do when two stories genuinely must share a file. The instruction
    says "one story or two waves", and REVIEW should confirm the document says
    which to prefer and why, rather than leaving it as a coin toss.

**Result (REVIEW, 2026-09-30, lead-po):** both documents answer both
questions. I read the diffs against `main`.

- *Granularity.* In `plan-product.md` step 5, "Granularity": list the files
  the story WRITES. Paths compare as literal text, so `src/core/*` and
  `src/core/world.ts` are reported clear of each other; use a glob only for a
  set of sibling files. For "some of `src/core/`": list every file it might
  plausibly write, because over-declaring is the safer error. If it cannot
  list candidates, it is not ready to cut: leave it `touches: []`, and it
  shows as UNKNOWN.
- *One story or two waves.* Both documents prefer two waves when each is its
  own behaviour, because merging would break the one-cycle limit. They prefer
  one story when both edit the same function or table, and only if the merge
  still fits one cycle. `SKILL.md` adds that one story can own the file while
  the other builds on it after merge. `depends_on` is kept for true ordering in
  both.

`git diff main -- .claude/commands/plan-product.md .claude/skills/story-authoring/SKILL.md`:
41 lines added in `plan-product.md` step 5, and in `SKILL.md` a
"second axis: the footprint" under Sizing plus three amended paragraphs. No
other section changed.

**AC-1 to AC-3 against the REAL backlog. Owner: GATES.**

Release 41: probed against the tree it judges, not only against fixtures.
HARNESS-006's probe earned this the hard way - dropping `strip_comments` turned
this backlog's ten pairs into ten false CONFLICTs on `go.mod` and
`requirements.txt`, paths that exist only in the story template's own HTML
comment, which no fixture would have contained.

GATES runs `bash scripts/plan.sh waves` over `docs/backlog/stories/` and pastes
it. The expected result depends on how far HARNESS-006 has spread: stories
carrying `touches:` should be placed, and every story that predates it should
appear under UNKNOWN. If everything lands in wave 1, something is wrong -
that is the shape of a placement rule that is not reading the declarations at
all.

*(PLANNED, 2026-09-30: the expectation, derived by hand from
`plan.sh conflicts` at `b46ef1e`.)* Every non-DONE story now declares
`touches:`. HARNESS-009 is startable, because HARNESS-008 is DONE. The five
CONFLICT pairs are 001+002, 001+003, 002+003, 004+005 and 007+009. First fit
in id order therefore gives:

    WAVE 1   HARNESS-001  HARNESS-004  HARNESS-007
    WAVE 2   HARNESS-002  HARNESS-005  HARNESS-009
    WAVE 3   HARNESS-003

    3 wave(s), 0 blocked, 0 unplaceable.

HARNESS-007 is still listed, because a story in GATES is not DONE. Anything
else is an escalation to reproduce, not a fixture to adjust.

**Result (GATES, 2026-09-30, lead-po):** the output matches the prediction
exactly, and the stories are not all in wave 1. This is the real tree, at the
shipped `cmd_waves`:

    $ bash scripts/plan.sh waves; echo "rc=$?"
    WAVE 1   HARNESS-001  HARNESS-004  HARNESS-007
    WAVE 2   HARNESS-002  HARNESS-005  HARNESS-009
    WAVE 3   HARNESS-003

    3 wave(s), 0 blocked, 0 unplaceable.
    rc=0

No story in today's backlog is blocked or undeclared, so AC-3 and AC-4 are
exercised here only by their fixtures. This run does not exercise them.

**The defect put back: a wave checked as a chain. Owner: GATES.**

The central claim is AC-2's "a wave is a set of MUTUALLY disjoint stories, not
a chain of pairwise-checked neighbours". Mutate `cmd_waves` with
`scripts/mutate.sh`, so that a candidate is compared only with the LAST story
placed in each wave instead of every member. Then run
`bash .claude/tests/plan.test.sh`. The AC-2 mutual-disjointness control MUST
go red. The literal AC-2 case is predicted to stay green: that is the reason
the control exists. RED cannot run this, because `cmd_waves` does not exist
yet. The exact `sed` expression depends on the code GREEN writes, so GATES
writes it, pastes the red, and confirms the restore.

**Result (GATES, 2026-09-30, lead-po):** the check held. The control went red,
the literal AC-2 case stayed green, and the file was restored.

    $ bash scripts/mutate.sh scripts/plan.sh 's/for m in \${waves\[\$w\]}; do$/for m in ${waves[$w]##* }; do/' -- bash .claude/tests/plan.test.sh
    === mutate: scripts/plan.sh (1 line(s) changed by ...) ===
      583 -       for m in ${waves[$w]}; do
      583 +       for m in ${waves[$w]##* }; do
    === mutate: running bash .claude/tests/plan.test.sh ===
        FAIL AC-2 control: C collides with A, so it is NOT in wave 1 even though wave 1's last member B is clear of it
             expected: A=1 B=1 C=2
             actual:   A=1 B=1 C=1
        FAIL AC-2 control: wave 1 is exactly A and B
        FAIL AC-2 control: wave 2 is exactly C
        FAIL AC-4: every WAVE line, then BLOCKED, then UNKNOWN, then a blank line and the summary
        FAIL AC-4: with waves, blocked and unplaceable together, it exits 0
    plan: 130 passed, 5 failed
    === mutate: command exited 1; restored (verified byte-for-byte against .../.claude/state/mutations/scripts_plan.sh.20260930T173648Z.356350.bak) ===
      583:       for m in ${waves[$w]}; do

This run is also the one row of RED's mutation table that I checked. RED
predicted that mutant (b), chain / last-member, would turn tests 17–19, 38 and
40 red, which is 5 assertions. The run turned 5 red: the three AC-2 control
assertions and the two mixed-shape AC-4 assertions. No `AC-2:` assertion from
the literal case failed. The rest of the table belongs to `/audit-mutations`.
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

Planned by `bash scripts/plan.sh write HARNESS-007` from `.claude/harness/models.conf`.
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

- PLANNED: `lead-po` - the orchestrating session, **claude-opus-5-5**.
- RED: `test-developer`, **claude-opus-5-5** (dispatch passed `model: opus`; agent reported opus, no override).
- GREEN: `feature-developer`, **claude-opus-5-5** (dispatch passed `model: opus`; agent reported opus).
- GATES: run by the orchestrator, lead-po, **claude-opus-5-5**. No dispatch: nothing failed that needed a fix.

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Out of scope

- **HARNESS-008 and HARNESS-009**, the per-worktree lock and the orchestrator
  that dispatches into it. This story produces a plan that CAN be worked in
  parallel. Nothing here makes anything run in parallel, and a wave is a
  suggestion until 008 lands.
- **Re-planning an existing backlog.** The instruction applies when stories are
  cut. Retrofitting `touches:` onto stories written before HARNESS-006 is a
  separate job, and `waves` reporting them as UNKNOWN is the correct behaviour
  rather than a gap to paper over.
- **Minimal waves.** Greedy first-fit, explicitly. A story that wants optimal
  grouping is proposing graph colouring over a backlog of tens, which is a cost
  with no reader.
- **Checking a declaration against the diff a story produced.** Named in
  HARNESS-006, still not scheduled, and it matters more here: `waves` is only
  as good as the declarations, and a story that strays outside its footprint
  strays into another wave member's files.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

One level: the command, driven through the existing `plan` wrapper in
`.claude/tests/plan.test.sh`, over fixture backlogs built with `story_with`
(`TOUCHES:`, `DEPENDS:`, `CONTRACT:`). All of it is a new, final
`describe "waves: the planner cuts stories into waves (HARNESS-007)"`. Each
fixture set starts from `fresh` (the empty stories directory the HARNESS-006
block defines). It comes last in the file, so nothing after it loses its stories.
The diff against `main` for the file is insertions only (`git diff main
--numstat`: 334 added, 0 deleted).

**The needles.** Lines are matched whole with `grep -cxF` (`wline`), and ids
are matched by awk field equality (`where`, `labels_for`), never as a floating
substring. The whole output is pinned exactly in four cases: all-disjoint,
only-undeclared, only-DONE, and the mixed shape case.

**No bare absences.** "X is in no wave" and "exits 0" are both also what a
missing command produces. So each one travels in the same assertion as a
presence: `where A U V` = `A=1 U=- V=-`, and `waves_rc|summary-count` = `0|1`.
The first RED run showed why this matters: three bare `exits 0` assertions
passed on arrival (see Handoff). They were rewritten, and all 40 are now red.

| # | Test (as named in the file) | AC |
|---|---|---|
| 1 | pairwise disjoint stories, in flight or not, are all in wave 1 and nothing else is printed (whole output) | AC-1 |
| 2 | and there are waves, so it exits 0 | AC-1 |
| 3 | paths that merely share a prefix do not collide (`src/a.ts` vs `src/a.tsx`, `src/a.ts.bak`) | AC-1 (exact comparison) |
| 4-7 | AC-1 control: sharing one path among several gives `A=1 B=2`, exact lines `WAVE 1   A`, `WAVE 2   B`, and the summary | AC-1 control |
| 8-11 | many: ten stories sharing one file give ten waves; `WAVE 10  J`; exactly one `WAVE 1   A` line; `10 wave(s)` | AC-1 (anchoring, many) |
| 12 | a DONE story is omitted entirely: one wave, A alone, no line names D | candidate set |
| 13-16 | AC-2 literal: `A=1 B=2 C=1`, `WAVE 1   A  C`, `WAVE 2   B`, two waves not three | AC-2 (fails next-fit) |
| 17-19 | AC-2 control, mutual disjointness: `A=1 B=1 C=2`, `WAVE 1   A  B`, `WAVE 2   C` | AC-2 (fails last-member) |
| 20-24 | AC-3: undeclared U (no key) and V (`touches: []`) are in no wave, wave 1 is exactly A, one UNKNOWN line each with the reason, and the summary | AC-3 |
| 25 | AC-3 control: with one placeable story it exits 0 | AC-3 control |
| 26 | a story declaring only through its Contract `**Writes:**` is placed, and collides (`A=1 W=2`) | AC-3 (the meaning of "declares nothing" = empty `story_paths`) |
| 27-28 | AC-3 control: only undeclared stories give the exact output, and exit 1 | AC-3 control |
| 29-32 | only-DONE backlog: exact output `\n0 wave(s), 0 blocked, 0 unplaceable.`, exit 1; empty backlog: the summary, exit 1 | AC-3 control (exit on zero waves) |
| 33-37 | AC-4: blocked in no wave, and a dependency on a DONE story is placed; wave 1 is exactly `A  C  P`; `BLOCKED  B  depends_on P (PLANNED)`; `BLOCKED  E  depends_on P (PLANNED), Z (missing)`; DONE Q with a non-DONE dependency appears nowhere, plus the summary | AC-4 |
| 38 | AC-4 shape: WAVE lines, then BLOCKED, then UNKNOWN, a blank line, the summary. Ids are chosen so line order cannot fall out of id order (whole output) | AC-4 |
| 39 | a blocked story that also declares nothing is listed once, as BLOCKED | AC-4 (BLOCKED before UNKNOWN) |
| 40 | with waves, blocked and unplaceable together, it exits 0 | AC-4 / exit |

AC-5 and AC-6 get no test, by design. They are deferred to REVIEW.

## Handoff: RED -> GREEN

**Command:** `bash .claude/tests/plan.test.sh`. It takes 335-440 s locally on
Windows. There is no per-suite timeout, and CI runs `selftest.sh` on
ubuntu-latest.

**Files touched in RED:** `.claude/tests/plan.test.sh` (insertions only), and
this story's `## Contract` (one amendment, below), `## Test plan` and this
section. Nothing else. `scripts/plan.sh` is untouched.

**Result:** `plan: 95 passed, 40 failed`, exit 1. All 40 failures are in the
new `waves:` block, and all 95 pre-existing assertions pass (floor 42).
Excerpt, verbatim:

    waves: the planner cuts stories into waves (HARNESS-007)
      FAIL AC-1: pairwise disjoint stories, in flight or not, are all in wave 1 and nothing else is printed
           expected: WAVE 1   A  B  C

           1 wave(s), 0 blocked, 0 unplaceable.
           actual:   plan: no story at docs/backlog/stories/waves.md
           Story waves

             Recommended:  /complete-story waves
             ...
      FAIL AC-1: and there are waves, so it exits 0
           expected: 0|1
           actual:   0|0
      FAIL AC-2 control: C collides with A, so it is NOT in wave 1 even though wave 1's last member B is clear of it
           expected: A=1 B=1 C=2
           actual:   A=- B=- C=-
      FAIL AC-3 control: and with nothing judged it exits 1, not 0
           expected: 1
           actual:   0
      FAIL AC-4: the blocked story is reported as blocked, naming the dependency and its phase
           expected: 1
           actual:   0
    ...
    plan: 95 passed, 40 failed

**Why this is the right failure.** `waves` has no dispatch arm, so it falls to
`*) cmd_both "$1"`, which treats `waves` as a story id. Every assertion fails
because no WAVE, BLOCKED, UNKNOWN or summary line exists. None fails from a
fixture or harness error: the pre-existing 95 pass in the same run.

**Correction to the brief: the RED exit status is 0, not 2.** `cmd_both` calls
`cmd_next` inside `$(...)`, so `die` exits only that subshell. The script goes
on to print the model plan and exits 0. Measured: `bash scripts/plan.sh waves;
echo $?` gives `0`. On the first RED run, the three bare `assert_eq ... "0"
"$(waves_rc)"` assertions therefore **passed on arrival** (98 passed, 37
failed). Each is now paired with the summary line it implies (`0|1`), and all
three are red. **No test passes on arrival now.** GREEN's own `waves` arm
removes the fall-through. The fall-through itself (an unknown subcommand exits
0) is a pre-existing `cmd_both` behaviour and out of scope.

**What the tests pin (the interface, stated as fact):**
- `bash scripts/plan.sh waves` exists. No argument is required. stdout and
  stderr are read merged, so **nothing extra may go to either stream**: the
  four whole-output assertions would fail.
- Line formats are exactly the Contract's: `printf '%-9s%s\n'` (`WAVE 1   A  C`,
  `WAVE 10  J`), ids joined by two spaces, `BLOCKED  <id>  depends_on <dep>
  (<PHASE>)[, <dep> (<PHASE>)]` listing only deps that are not DONE (a missing
  one as `(missing)`), and `UNKNOWN  <id>  declares no paths - cannot be
  placed`.
- Line order is WAVE lines, then BLOCKED, then UNKNOWN, each in candidate
  order. Then one blank line and the summary. The blank line comes **even when
  nothing precedes it** (Contract amendment below).
- The summary is `<W> wave(s), <B> blocked, <U> unplaceable.`.
- Exit status is 0 iff W >= 1, and 1 otherwise, including an empty backlog, an
  all-DONE backlog and an all-UNKNOWN backlog.
- The candidate set: DONE is omitted, **even when its own dependency is not
  DONE** (fixture Q; note `cmd_next` checks blocked *before* DONE, so do not
  classify by `cmd_next` alone). Blocked means `cmd_next` = `blocked`. In-flight
  stories (RED) are candidates.
- "Declares nothing" means `story_paths` is empty. A story with only a
  Contract `**Writes:**` line is placed (fixture W). Collision is exact
  whole-path equality (`src/a.ts` does not collide with `src/a.tsx`).

**What the tests do NOT constrain (GREEN's choice):** whether the candidate
walk and pairwise test are factored out of `cmd_conflicts`. If they are,
existing `conflicts` output must stay byte-identical, and the existing
assertions pin that. Also free: the internal data structures; the help-text
line (nothing asserts it, but the `sed -n '3,6p'` range must move with it); the
wording of the "greedy, not minimal" comment; and behaviour for extra
arguments.

**Negative controls: expected values.** No assertion in the block has run
against a real `cmd_waves`. The placements below were measured outside the
framework with a plain awk simulation of first fit, next fit and last-member
placement over the same path sets (scratch script, not committed). Confirming
them against the shipped `cmd_waves` is GREEN's job.

| Control | Fixture (paths) | Correct (first fit) | next-fit mutant | last-member mutant |
|---|---|---|---|---|
| AC-1 shared path | A=[a,world] B=[b,world] | `A=1 B=2` | same | same |
| AC-2 literal | A=[p1] B=[p1,p2] C=[p2] | `A=1 B=2 C=1`, 2 waves | **`A=1 B=2 C=3`, 3 waves** | same as correct |
| AC-2 mutual | A=[p1] B=[p2] C=[p1] | `A=1 B=1 C=2` | same as correct | **`A=1 B=1 C=1`, 1 wave** |
| AC-4 shape | C=[x] D=[y] E=[x] F=[w] | `WAVE 1   C  D  F` / `WAVE 2   E` | **`C  D` / `E  F`** | **`WAVE 1   C  D  E  F`** |
| AC-3 all undeclared | U, V | 0 waves, exit 1 | - | - |
| zero waves | only DONE; empty | exit 1 | - | - |

**Predicted mutation table** (assertion numbers are from `## Test plan`):

| Mutant of `cmd_waves` | Assertions predicted red |
|---|---|
| (a) next fit (try only the newest wave) | 13-16 (AC-2 literal), 38 (shape). 5 in all |
| (b) chain / last-member check | 17-19 (AC-2 mutual), 38, 40 (summary becomes `1 wave(s)`). 5 in all. AC-2 literal 13-16 stays **green**, as the Contract predicts |
| (c) UNKNOWN placed in wave 1 (empty path list collides with nothing) | 20, 21, and 22-24 if the UNKNOWN lines are dropped; 25 (summary count changes); 27, 28 (exit 0); 38, 40 |
| (d) blocked stories placed as candidates | 33, 34, 35 and 36 if the BLOCKED lines go, 37 (summary), 38, 39 (B, which declares nothing, becomes UNKNOWN), 40 |
| (e) exit 0 on zero waves | 28, 30, 32. 3 in all |

**Deferred verifications, declined in RED.** Both GATES-owned entries - "AC-1
to AC-3 against the REAL backlog" and "the defect put back: a wave checked as a
chain" - need a `cmd_waves` to run or mutate, and in RED none exists. I did not
perform them and make no claim about either; they stay with GATES. AC-5/AC-6
are REVIEW's.

**Callers check (Contract, "Callers of anything whose signature changes").**
`rg 'cmd_conflicts|story_paths' scripts .claude --glob '!.claude/worktrees/**'`
at this branch finds `scripts/plan.sh` (lines 101, 353, 393, 420, 459, 460,
493), comments at `.claude/tests/plan.test.sh:397,704`, and
`.claude/tests/new-story.test.sh:136`. That matches the Contract. The only other
hit is `.claude/state/mutations/log`, which is gitignored machine-local state,
not a caller.

**Gates.** `bash scripts/gates.sh --fast` reports `All required gates passed (0
ran, 5 unconfigured, 0 known)`: `BOOTSTRAPPED=no`, so nothing is configured,
as expected. `check-grep-count.sh` (0 findings) and `check-sigpipe.sh` (0
findings) are clean over the tree including the new block.

**Contract amendment made in RED:** one, under "Output, exactly". The blank
line before the summary is printed even with no preceding line. The reason is
beside it.

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

    run:    2026-09-30T17:41:32Z
    commit: 1c43aba (working tree had uncommitted changes)
    tree:   45d70fad9c49fefe59a283992f98318a3f1f4550
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

Filed 2026-09-21, completing the set 006 named. The user's criticism of release
45 was that it was a lint over a decomposition rather than a capability, and
that the planner is where parallelism has to be decided. 006 made the data
exist; this is the half that answers the criticism directly.

**`depends_on: [HARNESS-006]`, and it is real rather than tidy.** `waves` can be
built without it - it would fall back to `contract_paths` - but every story
would report UNKNOWN, because a Contract is written before RED and a backlog
being planned has none. The command would be correct and useless.

**The distinction this story is really about.** `depends_on` currently answers
"must A finish before B" and is used for "would A and B collide", because
nothing else could express the second. Separating them is most of the value:
after this, a chain in the backlog means someone decided B needs what A learned,
and that is worth knowing on its own.

**RED model: `opus`, decided by the user on 2026-09-30.** HARNESS-017 added the
`**Writes:**` line to this story's `## Contract`. Every path on it classifies
`harness`, so the `unenforced` exception in `models.conf` fires and RED moves
from `fable` to `opus`: the phase lock freezes none of these files, so the
Contract is the only enforcement there is. The user chose this on 2026-09-30,
when asked with the measured fable → opus move in front of them.
`models.conf` was not edited; `## Model guidance` was re-rendered with
`plan.sh write`.

**Decided at PLANNED (2026-09-30, lead-po):**
1. The Contract pins the output format, the candidate set (the same set as
   `conflicts`), mutual disjointness, first fit, BLOCKED before UNKNOWN, and
   exit 1 on zero waves. The shape block was illustrative and is now labelled
   so. It predated HARNESS-008 being DONE.
2. AC-2 as written does not catch a wave checked only against its last member.
   So the Contract adds a mutual-disjointness control. This does not change the
   AC: the control tests the AC's own second sentence.
3. `.claude/harness/VERSION` joins `touches:` and `**Writes:**`, so the bump is
   planned rather than missed. RED stays `opus` (`unenforced`); re-rendered
   below.
4. Required gate: the `plan` suite of `selftest.sh`. None is configured in
   `gates.sh` (`BOOTSTRAPPED=no`), so `required_gates` stays `[]`.
5. No epic, so there is no done-when to check.

**RED check (orchestrator, 2026-09-30).** My RED brief claimed an unknown
subcommand makes `plan.sh` exit 2. That was wrong, and RED caught it.
Reproduced independently: `bash scripts/plan.sh waves; echo $?` gives `0`, and
`plan.sh nosuchcmd` prints `plan: no story at docs/backlog/stories/nosuchcmd.md`
and then the model plan. `cmd_both`'s `die` runs inside a command substitution.
RED therefore ties every exit-code assertion to the summary line it implies, so
none passes on arrival. The exit-0-on-unknown-subcommand behaviour is
pre-existing and out of scope here.
Suite, run by me: `plan: 95 passed, 40 failed`, exit 1. All 40 failures are in
the waves block, and each has `actual: plan: no story at
docs/backlog/stories/waves.md` or the 0-line count that follows from it.
`gates.sh --fast`: `All required gates passed (0 ran, 5 unconfigured, 0 known)`.

**GREEN (feature-developer, claude-opus-5-5, 2026-09-30).** `cmd_waves` plus the
`waves` arm, and a help line (the `sed` range moved from `3,6p` to `3,7p`). Three
helpers now serve both commands: `story_walk` (the candidate walk, DONE decided
before `cmd_next`, which is fixture Q), `shared_paths` (the `conflicts`
intersection, verbatim), and `unmet_deps` (the non-DONE `depends_on` entries.
`cmd_next` builds its `blocked` text from it, and `waves` builds its BLOCKED
line from it). The `conflicts` output on the real backlog is byte-identical
before and after (`cmp`), and so is the `cmd_next` text, which the existing
assertions pin. Every RED control value was measured against the shipped
module in a scratch fixture, and all of them match the handoff table.
For GATES's "defect put back": the mutual check is the line
`for m in ${waves[$w]}; do` in `cmd_waves`, which is unique in the file. A
last-member mutant is `s/for m in \${waves\[\$w\]}; do$/for m in ${waves[$w]##* }; do/`.
Tried on a scratch COPY only (not through `mutate.sh`, and not on the tree):
the AC-2 mutual fixture gave `WAVE 1   A  B  C`, and the AC-2 literal fixture
was unchanged. GATES still owns the real run.

**DONE, 2026-09-30.** Merged in #89 (merge commit c068309), release 58. PR CI:
the `gates` job passed in 1m43s. Its harness self-test step took 86s, against
`timeout-minutes: 45`; it was 72s on #88, and the new `plan` block accounts
for the difference
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/36756350738).
`boundaries` passed in 5s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/36756350705).
