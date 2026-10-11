---
id: HARNESS-006
title: A story declares the files it touches, so the harness can say which may run together
slug: a-story-declares-the-files-it-touches-so
epic: 
type: chore
status: done
phase: DONE
branch: story/HARNESS-006-a-story-declares-the-files-it-touches-so
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [scripts/plan.sh, scripts/new-story.sh, .claude/tests/plan.test.sh, .claude/tests/new-story.test.sh, .claude/tests/boundaries.test.sh, .claude/skills/story-authoring/SKILL.md, CLAUDE.md, .claude/harness/VERSION]  # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

No epic. The harness maintaining itself.

**Two stories can run at once only if neither is blocked and neither writes the
files the other writes.** `depends_on` has always answered the first half -
`plan.sh next` returns `blocked`, `phase.sh board` shows it. Release 45 added
`plan.sh conflicts` for the second half, reading the paths a story's
`## Contract` declares and intersecting them pairwise.

**That check cannot do its job, and the reason is a lifecycle problem rather
than a defect.** A `## Contract` is written by the Lead PO *before RED* - which
is *after* planning. So at the moment `/plan-product` decides how to cut the
backlog, the information `conflicts` needs does not exist yet. Measured on this
repository's own backlog at release 45:

    STATUS    PAIR                      DETAIL
    UNKNOWN   HARNESS-001 + HARNESS-002 no Contract paths declared yet
    ... ten pairs, all UNKNOWN, zero judgeable

Ten of ten. The check is honest about it - UNKNOWN is deliberately not `clear` -
but an honest "I cannot tell you" every single time is not a working feature.

**And detection is the wrong half of the problem.** A lint over a decomposition
says which of the planner's choices were unfortunate. It cannot make the
planner choose differently, because nothing in `create-product.md`,
`plan-product.md`, `lead-po.md` or `story-authoring/SKILL.md` mentions
simultaneous development at all - grepped at release 45, zero hits in all four.
Stories are cut for size and ordering. Whether their file footprints partition
is not a consideration anyone has been asked to weigh.

So this story moves the declaration EARLIER, to where the planner can use it:
a story states the files it expects to touch when it is authored, in
frontmatter, and `conflicts` reads that. The `## Contract` keeps its job - it is
the precise agreement RED sharpens - and gains a cross-check against what the
story said it would touch when it was cut.

**Sizing.** The whole idea - footprints, a planner organised around producing
disjoint waves, worktrees, an orchestrator running N stories - is four
behaviours and fails this harness's own sizing rule on every line of it. This
story is the first behaviour only: **the declaration exists, is machine-read,
and shrinks UNKNOWN.** The rest are named in `## Out of scope` with the order
they have to happen in.
## Acceptance criteria

- **AC-1** - Given a story whose frontmatter declares `touches:` with one or
  more paths, when `bash scripts/plan.sh conflicts` runs, then those paths are
  what the story is judged on. *Control:* a story declaring `touches: []` is
  judged as declaring nothing, not as touching everything.
- **AC-2** - Given two startable stories whose `touches:` sets intersect, when
  `conflicts` runs, then the pair is CONFLICT, the shared path is named, and the
  command exits non-zero. *Control:* two whose sets are disjoint are `clear` and
  it exits 0.
- **AC-3** - Given a story with `touches:` and an EMPTY `## Contract`, when
  `conflicts` runs, then it is judged rather than UNKNOWN. This is the whole
  point: at planning time no contract exists yet. *Control:* a story with
  neither `touches:` nor Contract paths is still UNKNOWN, and UNKNOWN is still
  never reported as clear.
- **AC-4** - Given a story that declares BOTH `touches:` and `## Contract`
  paths, when `conflicts` runs, then a Contract path absent from `touches:` is
  reported as a drift warning naming both. The contract is the sharper document;
  a story that turned out to touch more than it said should say so out loud
  rather than being silently overruled in either direction.
- **AC-5** - Given `bash scripts/new-story.sh <id> "<title>"`, when it creates a
  story, then the file carries a `touches:` key with a comment saying what it is
  for. *Control:* a story file missing `touches:` entirely is accepted by
  `check-boundaries.sh` - this is a new field, and refusing every story that
  predates it would make the backlog unmergeable.
- **AC-6** - `story-authoring/SKILL.md` documents how to fill `touches:` and
  states the rule that makes it worth filling: a decomposition whose footprints
  partition is one that can be worked in parallel. *Verified by review, not by
  assertion* - see `## Deferred verifications`.
## Contract

Written by the Lead PO at the end of PLANNED. RED may amend a block in place
with a reason; GREEN builds what the amended block says.

**`touches:` in story frontmatter.** A YAML list of repo-relative paths and
globs the story expects to write, read by `frontmatter_list` in
`.claude/hooks/lib.sh` - the reader `depends_on` uses. This story does not
parse YAML itself and does not change that reader.

    touches: [scripts/plan.sh, .claude/tests/plan.test.sh]

**PO decision 1 - `touches: []` declares nothing.** An empty list is treated
exactly like an absent key: the story falls through to its Contract paths, and
with none it is UNKNOWN. AC-1's control says "judged as declaring nothing", and
UNKNOWN is what `conflicts` has always called a story that declares nothing.
The other reading - empty means "touches no file", so the story is `clear`
against everything - was rejected because AC-5 makes `new-story.sh` emit
`touches: []` into every new story: under that reading every fresh story would
report `clear`, which is precisely the "UNKNOWN reported as clear" failure AC-3's
control forbids. (This replaces the planning draft's sentence that an empty list
is "distinct from the key being absent"; no AC changed.)

**`scripts/plan.sh`** gains

    story_touches <file>   the declared paths, one per line, sorted and unique;
                           empty when the key is absent or the list is empty

`cmd_conflicts` takes each story's paths from, in order:

  1. `story_touches`, when it is non-empty
  2. `contract_paths`, otherwise
  3. neither - UNKNOWN, as today

Comparison is unchanged: exact string equality of paths, pairwise. A glob in
`touches:` is compared as its literal text; glob-against-path overlap is NOT in
scope (see `## Out of scope`).

The UNKNOWN row's detail and the footer stop saying "no Contract paths" and say
the story declares neither `touches:` nor Contract paths. The row's first column
stays `UNKNOWN`, and UNKNOWN is never printed as `clear`.

`contract_paths()` and `contract_unenforced()` keep their behaviour and
signatures. The RED model policy (`cmd_models`) must not move: it still reads
the Contract only.

**Drift (AC-4)** is judged per story, only when `story_touches` is non-empty AND
`contract_paths` is non-empty. A Contract path is drift when it neither equals a
`touches:` entry nor matches one as a shell glob (`case "$path" in $glob`), so a
story declaring `.claude/skills/stack-profiles/reference/*.md` does not drift on
naming one of those files. One line per drifting path, printed after the pair
table and before the summary:

    DRIFT     HARNESS-006   contract names scripts/new-story.sh, touches: does not

- first column exactly `DRIFT`, second the story id, then the path;
- drift is a WARNING: it does not change the exit status, which stays non-zero
  on CONFLICT only;
- the summary line gains a drift count:
  `N conflict(s), M pair(s) that could not be judged, D drift warning(s).`
- drift is reported for every startable story (not DONE, not blocked), even
  when there are fewer than two of them to pair.

**`scripts/new-story.sh`** emits, between `depends_on` and `required_gates`:

    touches: []         # files this story expects to write; `plan.sh conflicts` reads it

**Tests.**
- `.claude/tests/plan.test.sh` carries AC-1..AC-4. The existing 42 assertions
  stay green unchanged: this adds a source of paths, it does not change how
  paths are compared. Its `story_with` fixture helper gains a `TOUCHES:` line
  (absent means no key; `TOUCHES:` with an empty value writes `touches: []`).
- `.claude/tests/new-story.test.sh` carries AC-5's main case.
- `.claude/tests/boundaries.test.sh` carries AC-5's control: a story whose
  frontmatter has no `touches:` key raises no `problem` from
  `check-boundaries.sh`. (It passes on arrival - no code refuses it today - so
  RED earns it per the non-negotiables: see `## Deferred verifications`.)

**Docs, written by the orchestrator, not by RED or GREEN.**
`.claude/skills/story-authoring/SKILL.md` (AC-6) and `CLAUDE.md`'s "Two stories
at once" section, which today states that `conflicts` does not read `touches:`
at all - true until this story, false after it.
`.claude/harness/VERSION` is bumped, as `check-boundaries.sh` requires of any
harness change.

**Test-only dependencies:** none. bash, awk and git, as ever.

**Callers of anything whose signature changes:** none. `story_touches` is new;
`contract_paths` and `contract_unenforced` keep their signatures. `cmd_conflicts`
takes no arguments before or after, and is called only from the `conflicts` case
of the dispatcher in `scripts/plan.sh` (the tests invoke it through that
dispatcher). Checked with `rg -n 'cmd_conflicts|contract_paths|story_touches'`
over the tree at PLANNED.

**Gate.** `BOOTSTRAPPED=no`: every `gates.sh` gate is `unconfigured` here, so no
`project.conf` gate can fail on this artifact. The binding check is the
harness self-test, `bash scripts/selftest.sh` - the `plan`, `new-story` and
`boundaries` suites - which is a required CI step (`selftest` job).
## Deferred verifications

**AC-6, the documentation criterion. Owner: REVIEW.**

`story-authoring/SKILL.md` gaining a section is not assertable by this suite
without writing a test that greps a document for a phrase, which pins the phrase
rather than the guidance and goes stale the first time somebody rewrites the
paragraph better. The harness has that failure already recorded: an assertion
whose needle is a presentation rather than a behaviour.

So REVIEW reads it and records, here, that the section exists and answers two
questions a Lead PO will actually have: what granularity to declare (file, or
directory glob) and what to do when a story genuinely cannot know yet.

**Result (REVIEW, 2026-09-30, read by the orchestrator):** the section exists -
`.claude/skills/story-authoring/SKILL.md`, "## Declare the files a story
touches", directly after `## Sizing`'s `depends_on` paragraph. It states the rule
("a decomposition whose footprints partition is one that can be worked in
parallel") and answers both questions:
- *granularity* - files the story WRITES, not reads; a glob only for a real
  family of siblings, because paths are compared as literal text and the other
  story must spell the glob the same way for the collision to show; a directory
  glob as a hedge says nothing;
- *cannot know yet* - leave `touches: []`, which reads as declared-nothing and
  so UNKNOWN, never clear; a story whose files cannot be named at planning time
  is usually a spike; fill it in PLANNED once the Contract exists, where DRIFT
  then reconciles the two.
It also says `touches:` is intent, unchecked against the diff. `CLAUDE.md`'s
"Two stories at once" section, which said `conflicts` did not read `touches:` at
all, was rewritten to match.

**AC-4's drift case against the REAL backlog. Owner: GATES.**

Release 41 requires a probe against the tree the rule judges, not only against
fixtures, and release 45 earned that the hard way: removing `strip_comments`
from the extractor turned this backlog's ten pairs into ten false CONFLICTs on
`go.mod` and `requirements.txt`, paths that appear only in the story template's
own HTML comment. A fixture corpus has clean contracts and would never have
shown it.

GATES runs `bash scripts/plan.sh conflicts` against `docs/backlog/stories/` with
this story's own `touches:` filled in, and pastes the output. Expected: this
story judged against its declared paths rather than UNKNOWN.

**The drift half of the prediction was revised at PLANNED, by measurement.** The
draft predicted "no DRIFT line, because its `touches:` and its Contract were
written together". Running `contract_paths`' own pattern by hand over the
finished Contract says otherwise: it extracts every path the prose MENTIONS,
including ones this story only reads - `.claude/hooks/lib.sh`, `gates.sh`,
`check-boundaries.sh`, `project.conf`, `scripts/selftest.sh`, the bare
`plan.sh` / `new-story.sh`, and the non-path `AC-1..AC`. So the expected result
is DRIFT lines for those, and the question GATES answers is whether that noise
is tolerable for a warning or means the Contract extractor needs its own story.
Record which.

**Result (GATES, 2026-09-30):** run on the committed GREEN tree, this story's
`touches:` filled in:

    $ bash scripts/plan.sh conflicts; echo "exit=$?"
    UNKNOWN   HARNESS-001 + HARNESS-002 declares neither touches: nor Contract paths - cannot judge
    ... 20 UNKNOWN rows in all: every pair involving 001-005, which predate the field
    CONFLICT  HARNESS-006 + HARNESS-009 .claude/tests/plan.test.sh scripts/plan.sh

    DRIFT     HARNESS-006   contract names .claude/hooks/lib.sh, touches: does not
    DRIFT     HARNESS-006   contract names .claude/skills/stack-profiles/reference/, touches: does not
    DRIFT     HARNESS-006   contract names AC-1..AC, touches: does not
    DRIFT     HARNESS-006   contract names check-boundaries.sh, touches: does not
    DRIFT     HARNESS-006   contract names gates.sh, touches: does not
    DRIFT     HARNESS-006   contract names new-story.sh, touches: does not
    DRIFT     HARNESS-006   contract names plan.sh, touches: does not
    DRIFT     HARNESS-006   contract names project.conf, touches: does not
    DRIFT     HARNESS-006   contract names scripts/selftest.sh, touches: does not
    DRIFT     HARNESS-009   contract names check-boundaries.sh, touches: does not
    DRIFT     HARNESS-009   contract names gates.sh, touches: does not
    DRIFT     HARNESS-009   contract names lead-po.md, touches: does not
    DRIFT     HARNESS-009   contract names phase-guard.sh, touches: does not
    DRIFT     HARNESS-009   contract names phase.sh, touches: does not
    DRIFT     HARNESS-009   contract names plan.sh, touches: does not

    1 conflict(s), 20 pair(s) that could not be judged, 15 drift warning(s).
    exit=1

- **Judged, as expected.** HARNESS-006 is judged against HARNESS-009 on its
  declared paths rather than UNKNOWN, and the verdict is a REAL conflict: both
  stories write `scripts/plan.sh` and its suite. Before this story that pair was
  UNKNOWN.
- **Drift: 15 lines, 0 real.** Every one is a path the Contract prose MENTIONS
  and does not write (a reader, an example, a bare basename of a declared file),
  or not a path at all (`AC-1..AC`, a directory prefix). The prediction revised
  at PLANNED held.
- **Verdict: the noise is NOT tolerable as a signal, and the cause is the
  extractor, not the drift rule.** `contract_paths` answers "what does the prose
  mention", which was good enough for `conflicts` (a false CONFLICT is loud and
  gets read) and is not good enough for drift, where 15 of 15 false warnings
  teach the reader to skip the section. Fixing it means changing what
  `contract_paths` reads - which this Contract forbids, because
  `contract_unenforced` and the RED model policy share it. So it is a follow-up
  story, recommended in the PR, not a change made here. Drift stays a warning
  (it never changes the exit status), so shipping it costs noise, not a false
  refusal.

**AC-5's control earns its assertion. Owner: GATES.**

The control ("a story with no `touches:` key raises no problem from
`check-boundaries.sh`") passes on arrival: nothing refuses such a story today,
so it has never been watched to fail. GATES earns it with ONE mutation through
`scripts/mutate.sh`: add `touches` to `check-boundaries.sh`'s required-key loop
(`for key in id title type status phase`), run
`bash scripts/selftest.sh boundaries`, and paste the red naming that assertion.

**Result (GATES, 2026-09-30):**

    $ bash scripts/mutate.sh scripts/check-boundaries.sh 's/for key in id title type status phase; do/for key in id title type status phase touches; do/' -- bash scripts/selftest.sh boundaries
    === mutate: scripts/check-boundaries.sh (1 line(s) changed by ...) ===
        FAIL a story with no touches: key is not refused for lacking one
             expected NOT to contain: touches
             actual:                   FAIL  docs/backlog/stories/T-1.md: frontmatter missing 'touches'
    boundaries: 75 passed, 5 failed
    mutate log: scripts/check-boundaries.sh ... exited 1  restored (verified)

The control's own assertion went red on exactly the defect it names. The other
four reds are pre-existing cases whose fixture stories also lack the key, which
is the backlog-unmergeable consequence AC-5's control exists to prevent. File
restored; `git diff --quiet scripts/` clean afterwards.

**The central claim, defect put back. Owner: GATES.**

Revert `cmd_conflicts`' source of paths to `contract_paths` alone, through
`scripts/mutate.sh`, and run `bash scripts/selftest.sh plan`. AC-3's assertion
("a story with `touches:` and an empty Contract is judged, not UNKNOWN") must go
red. Paste it.

**Result (GATES, 2026-09-30):** the pair's source of paths put back to
`contract_paths` (drift left in place, so this isolates the central claim):

    $ bash scripts/mutate.sh scripts/plan.sh 's/pa="$(story_paths /pa="$(contract_paths /;s/pb="$(story_paths /pb="$(contract_paths /' -- bash scripts/selftest.sh plan
        FAIL a story with touches: is judged on those paths, not on its Contract
        FAIL and changing only touches: changes the verdict
        FAIL touches: [] falls through to the Contract, like an absent key
        FAIL two stories whose touches: intersect are a CONFLICT
        FAIL and the shared path is named on the row
        FAIL and the command exits non-zero
        FAIL two stories whose touches: are disjoint are clear
        FAIL touches: with an empty Contract is judged, not UNKNOWN
        FAIL and the summary counts no unjudged pair
        FAIL and the pair is still judged on touches:
        FAIL and the summary line counts it
        FAIL drift and a conflict are counted separately
        FAIL and the conflict still decides the exit status
    plan: 62 passed, 13 failed
    === mutate: command exited 1; restored (verified byte-for-byte ...) ===

AC-3's assertion is red. 13 rather than RED's M-6 prediction of 19, because M-6
also removed drift; the six drift-only assertions correctly stay green when only
the pair source is reverted.
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

Planned by `bash scripts/plan.sh write HARNESS-006` from `.claude/harness/models.conf`.
A PLAN, not a record: a session setting or an explicit override can beat both
this and the agent's own `model:` field, and nothing here can see which won.
The orchestrator still writes down the model each dispatch **resolved** to, by
name, below the table.

| Phase | Agent | Planned | Why |
|---|---|---|---|
| PLANNED | `lead-po` | `opus` | planning is the judgement phase: decomposition, the oracle partition, and what goes in the contract |
| RED | `test-developer` | `fable` | the measured case. With a partitioned contract to work from, the brief carries the judgement and the weaker model writes sharper negative controls than the stronger one did without it |
| GREEN | `feature-developer` | `opus` | the failure mode of a weaker model here is reaching green by weakening a test, which is the one thing this harness exists to prevent |
| GATES | `feature-developer` | `opus` | same risk as GREEN, and a gate failure is where "make it stop complaining" is most tempting |
| REVIEW | `lead-po` | `opus` | reading review feedback against the contract is judgement, and a wrong call here ships |
| SCAFFOLD | `lead-po` | `opus` | source, tests and config in one indivisible derivation, with no failing test in front of any of it |

**Resolved:**

- PLANNED, `lead-po` (orchestrator, no dispatch): `claude-opus-5-5`, as planned.
- RED, `test-developer`: explicit `model: fable` → **fable** (`claude-fable-5-1`, self-reported), as planned. 33 plan + 2 new-story + 1 boundaries assertions; flagged the backtick trap in `new-story.sh`'s unquoted frontmatter heredoc and the early-return trap in `cmd_conflicts`, both of which GREEN hit exactly as described. Its one single-assertion mutation prediction checked (M-4) was right: predicted 1, measured 1.
- GREEN, `feature-developer`: explicit `model: opus` → **opus** (`claude-opus-5-5`, self-reported), as planned. Tests unchanged (`git diff --stat HEAD -- .claude/tests` empty after GREEN); every control value RED recorded confirmed.
- GATES: no dispatch. The orchestrator ran the three GATES-owned deferred verifications and the full selftest on `claude-opus-5-5`.

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Out of scope

Three follow-on behaviours, in the order they have to happen. Each is its own
RED to GREEN cycle; together with this one they are the feature.

**HARNESS-007 - the planner is organised around producing disjoint footprints.**
`plan-product.md` step 5 cuts the stories, and `story-authoring` sizes them by
one RED→GREEN cycle. Neither has any notion that a decomposition can be judged
by whether its footprints partition. This story only makes the declaration
possible and machine-readable; 007 makes the planner *aim* for it - emitting
stories in waves that can be worked together, and using `depends_on` for true
ordering rather than for "these would collide", which today it silently doubles
as. Depends on this.

**HARNESS-008 - one phase lock per worktree.** `.claude/state/current-story.env`
holds one `STORY_ID` and one `PHASE` per checkout, so one checkout can work one
story. Git worktrees give each its own working directory and therefore its own
gitignored `.claude/state/`, and `phase.sh set` already refuses to advance a
story while the checkout is on the wrong branch - which is the invariant wanted.
What needs doing is `refresh-harness.sh` per worktree and a decision about
whether `doctor.sh` should notice it is in one. Depends on 007 only in the sense
that running parallel stories before the planner produces parallelisable ones is
premature.

**HARNESS-009 - `lead-po` dispatches into more than one worktree.** The
orchestrator holds the loop and today dispatches one story at a time because
that is all the state file can express. Running N means managing N locks, a
merge order, and what to do when one of the N goes red. This is a different
orchestrator rather than a modified one, and it is deliberately last.

**Not in any of them: checking the contract against the eventual diff.** A
`touches:` list is a declaration of intent. Nothing here verifies that the diff
a story actually produced stayed inside it. That is a `check-boundaries.sh`
concern, it is a real gap, and naming it here is not the same as scheduling it.
## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

All at the level the harness's own suites already work at: the real script,
copied into a throwaway fixture, driven through its dispatcher and judged on
its stdout and exit status. Nothing here needs more than bash, awk and git.

**`.claude/tests/plan.test.sh`** - one new `describe` block at the end,
"conflicts: a story declares the files it touches in frontmatter (HARNESS-006)",
33 new assertions. The 42 existing assertions are untouched and green; the
`story_with` helper gained a `TOUCHES:` line and nothing else about it changed.
Every row assertion reads the STATUS column of the named pair with awk
(`row_status A B`); every drift assertion reads lines whose first column is
exactly `DRIFT` and second the story id (`drift_for A`); the exit status is a
separate claim (`conflicts_rc`).

| AC | Assertion(s) | What it pins |
|---|---|---|
| AC-1 | `a story with touches: is judged on those paths, not on its Contract` | A's Contract names the file B touches, A's `touches:` does not; row is `clear`. Contract-only or union-of-both both give CONFLICT. |
| AC-1 | `and changing only touches: changes the verdict` | same two stories, A's `touches:` moved onto B's file, Contract untouched; row flips to `CONFLICT`. Refuses "ignore both". |
| AC-1 control | `touches: [] falls through to the Contract, like an absent key` | A `touches: []` + Contract naming B's file; row is `CONFLICT`. Refuses both "empty means clear" and "empty means stop". |
| AC-1 control | `touches: [] with no Contract is UNKNOWN, not clear` | the new-story default with nothing to fall through to. |
| AC-2 | `two stories whose touches: intersect are a CONFLICT`, `and the shared path is named on the row`, `and only the shared path`, `and the command exits non-zero` | two-element lists sharing one path; the row names that path and not the other; exit 1. |
| AC-2 control | `two stories whose touches: are disjoint are clear`, `and the command exits 0` | |
| AC-3 | `touches: with an empty Contract is judged, not UNKNOWN`, `and the summary counts no unjudged pair`, `and an empty Contract raises no drift warning` | the planning-time case; both Contracts empty. |
| AC-3 control | `a story with neither touches: nor Contract paths is still UNKNOWN`, `and the row says which declaration is missing`, `and a Contract-less story with touches: on the other side raises no drift` | absent key (the `[]` twin is under AC-1); the UNKNOWN row's detail mentions `touches`. |
| AC-4 | `a Contract path absent from touches: is one DRIFT line for that story`, `naming the path`, `and not the path both documents agree on`, `a story whose Contract is empty has nothing to drift from`, `in the documented wording`, `and drift alone does not change the exit status`, `and the pair is still judged on touches:`, `and the summary line counts it` | exact line `DRIFT  A  contract names scripts/new-story.sh, touches: does not`; exit 0; summary `0 conflict(s), 0 pair(s) that could not be judged, 1 drift warning(s).` |
| AC-4 glob | `a Contract path matched by a touches: glob is not drift` / control `but a glob that does not match the path is drift` | `src/ui/*.tsx` vs `src/ui/panel.tsx` (no drift); `src/core/*.ts` vs `src/ui/panel.tsx` (drift). |
| AC-4 | `drift is reported even with fewer than two startable stories`, `and still exits 0` | one startable story. |
| AC-4 | `drift and a conflict are counted separately`, `and the conflict still decides the exit status` | summary `1 conflict(s), 0 pair(s) that could not be judged, 1 drift warning(s).`, exit 1. |
| AC-4 | `a story with a Contract and no touches: key is not drift` | the other conjunct of "only when BOTH are non-empty"; passes on arrival. |
| AC-4 | `a blocked story is not drift-checked` | drift follows the same startable filter as the pair table. |
| Contract ("RED model policy must not move") | `touches: does not stand in for the Contract in the model plan` | `plan models` on a story with `touches:` and no Contract still gives `RED  test-developer  opus`. Passes on arrival; earned by a probe, see handoff. |

**`.claude/tests/new-story.test.sh`** - one new `describe` block, 2 assertions
(AC-5): the generated story contains exactly one line matching
`touches: [] *# files this story expects to write; \`plan.sh conflicts\` reads it`
(anchored, `grep -cx`), and within the frontmatter the keys appear in the
order `depends_on`, `touches`, `required_gates`.

**`.claude/tests/boundaries.test.sh`** - one new `describe` block, 1 assertion
(AC-5 control): a story written by `story_on_branch` (no `touches:` key)
produces no output containing `touches` from `check-boundaries.sh`. Passes on
arrival; owned by GATES per `## Deferred verifications`.

AC-6 has no test: documentation, verified by REVIEW.

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

### Commands

    bash scripts/selftest.sh plan          # AC-1..AC-4 + model-policy guard; ~3 min on this machine
    bash scripts/selftest.sh new-story     # AC-5
    bash scripts/selftest.sh boundaries    # AC-5 control; ~4 min on this machine
    bash scripts/gates.sh --fast           # unconfigured here (BOOTSTRAPPED=no): 0 ran, 5 unconfigured, exit 0

Nothing in the gates judges this story; the selftest suites are the binding
check (Contract, "Gate"). `check-sigpipe.sh` and `check-grep-count.sh` both
report 0 findings over the three edited suites.

### Failure output, RED (tree at 4b8c960 plus the three test files)

`bash scripts/selftest.sh plan` - the 42 pre-existing assertions pass, and only
the new block is red:

```
  conflicts: a story declares the files it touches in frontmatter (HARNESS-006)
    FAIL a story with touches: is judged on those paths, not on its Contract
         expected: clear
         actual:   UNKNOWN
    FAIL and changing only touches: changes the verdict
         expected: CONFLICT
         actual:   UNKNOWN
    FAIL touches: [] falls through to the Contract, like an absent key
         expected: CONFLICT
         actual:   UNKNOWN
    FAIL two stories whose touches: intersect are a CONFLICT
         expected: CONFLICT
         actual:   UNKNOWN
    FAIL and the shared path is named on the row
         expected to contain: src/ui/panel.tsx
         actual:               UNKNOWN   A + B                     no Contract paths declared yet - cannot judge
    FAIL and the command exits non-zero
         expected: 1
         actual:   0
    FAIL two stories whose touches: are disjoint are clear
         expected: clear
         actual:   UNKNOWN
    FAIL touches: with an empty Contract is judged, not UNKNOWN
         expected: clear
         actual:   UNKNOWN
    FAIL and the summary counts no unjudged pair
         expected to contain: 0 pair(s) that could not be judged
         actual:               STATUS    PAIR                      DETAIL
         --------- ------------------------- ------------------------
         UNKNOWN   A + B                     no Contract paths declared yet - cannot judge

         0 conflict(s), 1 pair(s) that could not be judged.
         UNKNOWN is not clear: a Contract is written before RED, so a story that has
         not started declares nothing. Judge those pairs by hand or write the contract.
    FAIL and the row says which declaration is missing
         expected to contain: touches
         actual:               UNKNOWN   A + B                     no Contract paths declared yet - cannot judge
    FAIL a Contract path absent from touches: is one DRIFT line for that story
         expected: 1
         actual:   0
    FAIL naming the path
         expected to contain: scripts/new-story.sh
         actual:
    FAIL in the documented wording
         expected: 1
         actual:   0
    FAIL and the pair is still judged on touches:
         expected: clear
         actual:   UNKNOWN
    FAIL and the summary line counts it
         expected: 1
         actual:   0
    FAIL but a glob that does not match the path is drift
         expected to contain: src/ui/panel.tsx
         actual:
    FAIL drift is reported even with fewer than two startable stories
         expected to contain: scripts/new-story.sh
         actual:
    FAIL drift and a conflict are counted separately
         expected: 1
         actual:   0
    FAIL and the conflict still decides the exit status
         expected: 1
         actual:   0

plan: 56 passed, 19 failed

assertion floors: all 1 suite(s) met their declared floor (56 assertions executed, 42 declared).
1 of 1 harness suite(s) FAILED.
```

Why this is the right failure: every red assertion's `actual` is today's
behaviour - `UNKNOWN` where `touches:` was ignored, an empty string where no
DRIFT line exists, a two-count summary where the Contract wants three. No
assertion failed on a fixture or syntax error; the fixture helper's new
`TOUCHES:` line is exercised by all 33 and the 14 that pass on arrival pass for
the reason stated below, not by accident.

`bash scripts/selftest.sh new-story`:

```
  a new story declares the files it touches (HARNESS-006, AC-5)
    FAIL the frontmatter carries touches: [] with a comment naming plan.sh conflicts
         expected: 1
         actual:   0
    FAIL and it sits between depends_on and required_gates
         expected: depends_on touches required_gates
         actual:   depends_on required_gates

new-story: 29 passed, 2 failed
```

`bash scripts/selftest.sh boundaries`:

```
  a story that predates touches: is still accepted (HARNESS-006, AC-5 control)

boundaries: 80 passed, 0 failed
```

Green on arrival, as the Contract predicts; see "Passed on arrival" below.

### Files touched

- `.claude/tests/plan.test.sh` - `story_with` gains `TOUCHES:`; one new
  `describe` block (33 assertions) at the end, before `summary`. AC-1..AC-4 and
  the Contract's "model policy must not move" clause.
- `.claude/tests/new-story.test.sh` - one new `describe` block (2 assertions).
  AC-5.
- `.claude/tests/boundaries.test.sh` - one new `describe` block (1 assertion).
  AC-5 control.
- `docs/backlog/stories/HARNESS-006.md` - `## Test plan`, this section.

Not touched: `.claude/tests/floors.conf`. Floors are floors, and nothing was
removed; GREEN or GATES may raise `plan` 42 -> 75, `new-story` 29 -> 31 and
`boundaries` 79 -> 80 if it wants the count pinned (and must then update the
twin table in `.claude/tests/selftest.test.sh` in the same commit).

### The shapes the tests pin

**Input.** Story frontmatter `touches: [a, b]`, `touches: []`, or no key. The
tests write the inline form only; the block-list form is `frontmatter_list`'s
existing business and untested here. A list element may be a shell glob
(`src/ui/*.tsx`), written literally.

**`bash scripts/plan.sh conflicts` stdout**, as read by the assertions:

- A pair row is a line whose whitespace-split fields 2-4 are `<idA> + <idB>`
  and whose field 1 is exactly `CONFLICT`, `clear` or `UNKNOWN`. The existing
  `printf '%-9s %-25s %s\n'` layout satisfies this; the tests do not pin column
  widths.
- A CONFLICT row's remainder contains the shared path and does NOT contain a
  path only one side declares (`src/core/world.ts` in the AC-2 case).
- An UNKNOWN row's remainder contains the word `touches` (the Contract's "says
  the story declares neither `touches:` nor Contract paths"). The tests do not
  pin the rest of that sentence, nor the footer paragraph.
- A drift line has field 1 exactly `DRIFT`, field 2 the story id, and the
  AC-4 main case pins the full line with one regex:
  `^DRIFT[[:space:]]+A[[:space:]]+contract names scripts/new-story.sh, touches: does not$`
  - i.e. the Contract's wording verbatim, any run of spaces between columns.
  Exactly one DRIFT line per (story, drifting path).
- Drift lines are counted by `drift_for`, which reads the WHOLE output, so
  their position (the Contract says after the pair table, before the summary)
  is not pinned. Print them wherever the Contract says; the tests will not
  object either way.
- The summary line is pinned as a whole line (`grep -cx`) in two cases:
  `0 conflict(s), 0 pair(s) that could not be judged, 1 drift warning(s).` and
  `1 conflict(s), 0 pair(s) that could not be judged, 1 drift warning(s).`
  AC-3's case pins only the substring `0 pair(s) that could not be judged`.
- With ONE startable story the output must still carry DRIFT lines. Today's
  early return prints `fewer than two startable stories; nothing to compare`
  and exits; that message is not pinned, but the DRIFT line must be printed
  before (or instead of) returning. Exit 0 in that case is pinned.

**Exit status:** 1 when any pair is CONFLICT, 0 otherwise - drift and UNKNOWN
do not change it. Pinned via a separate run of the command
(`conflicts_rc`).

**`bash scripts/plan.sh models <id>`** on a story with `touches:` set and an
empty Contract still prints the row `RED<TAB>test-developer<TAB>opus`: the
Contract's rule that `cmd_models` reads the Contract only.

**`bash scripts/new-story.sh <id> "<title>"`** produces a story whose
frontmatter (between the two `---` lines) has exactly one line matching
`touches: \[\] *# files this story expects to write; \`plan.sh conflicts\` reads it`
- literal backticks, one or more spaces between `[]` and `#` - and in which
`depends_on:`, `touches:` and `required_gates:` occur in that order.

**Not constrained:** the name and signature of the helper (`story_touches` per
the Contract - the tests only drive the dispatcher), how paths are compared
(the Contract keeps literal equality; the tests use only exact paths for
pairs), what the DRIFT detail says for a glob-containing `touches:`, the exact
UNKNOWN wording beyond containing `touches`, the footer paragraph, column
widths, and the order of DRIFT lines relative to the table.

### A trap for GREEN in `new-story.sh` - not a Contract amendment

The Contract's `touches:` line contains backticks and belongs in the
frontmatter, which is written by an UNQUOTED heredoc (`cat > "$file" <<EOF`)
because it interpolates `$id` and friends. A literal `` `plan.sh conflicts` ``
in that heredoc is command substitution: stderr gets `plan.sh: command not
found`, the story gets an empty span, and `new-story.test.sh`'s existing
`writes nothing to stderr` and AC-5 assertions both fail. Escaping the
backticks (`` \` ``) fixes that but breaks the existing `every backtick span in
the template survives into the story` assertion, whose extractor reads the
script from the first `cat >` line and would collect the span WITH the
backslash. Two ways through that leave every existing assertion green: a
variable holding a backtick (`bt='`'` ... `${bt}plan.sh conflicts${bt}`), or
splitting the frontmatter into an interpolating heredoc up to `depends_on` and
a quoted one for `touches`/`required_gates`/`---`. The tests do not care
which. The Contract is unchanged: what it specifies is the emitted line, and
the emitted line is right.

### Passed on arrival

14 of the 33 plan assertions and the 1 boundaries assertion are green today.
Each is a control or a regression guard, and each is listed with what makes
it able to fail:

| Assertion | Why green today | What earns it |
|---|---|---|
| `touches: [] with no Contract is UNKNOWN, not clear` | today everything with an empty Contract is UNKNOWN | its twin `touches: [] falls through to the Contract` is red; an implementation reading `[]` as "touches nothing" would turn this one `clear`. Prediction table, M-3. |
| `and the command exits 0` (AC-2 control) | no CONFLICT is ever found today | its sibling `two stories whose touches: are disjoint are clear` is red, so the pair goes green together |
| `and an empty Contract raises no drift warning` (AC-3) | no DRIFT exists today | the AC-4 positive is red; an implementation drifting on "Contract empty" fails this. M-2. |
| `a story with neither touches: nor Contract paths is still UNKNOWN` | already UNKNOWN | the AC-1/AC-2/AC-3 positives are red; an implementation that treats "no declaration" as `clear` fails it |
| `and a Contract-less story with touches: on the other side raises no drift` | no DRIFT exists | as above |
| `and not the path both documents agree on` (AC-4) | no DRIFT lines at all, so the haystack is empty | `naming the path` beside it is red; the two together say "exactly the drifting path" |
| `a story whose Contract is empty has nothing to drift from` (AC-4, story B) | as above | M-2 |
| `and drift alone does not change the exit status` | exit is 0 today | `drift and a conflict ... conflict still decides the exit status` is red; M-1 flips this one |
| `a Contract path matched by a touches: glob is not drift` | no DRIFT | its control `but a glob that does not match the path is drift` is red; M-4 flips this one |
| `and still exits 0` (single startable story) | exit is 0 today | M-1 |
| `a story with a Contract and no touches: key is not drift` | no DRIFT | M-2 flips exactly this one |
| `a blocked story is not drift-checked` | no DRIFT | an implementation that drift-checks every story file, not only startable ones, fails it |
| `touches: does not stand in for the Contract in the model plan` | `cmd_models` reads the Contract only | PROBED in RED, below |
| boundaries: `a story with no touches: key is not refused for lacking one` | nothing refuses it today | Owner: GATES, per `## Deferred verifications` - add `touches` to the required-key loop through `mutate.sh`; the refusal reads `frontmatter missing 'touches'` and this assertion goes red |

**The model-policy guard, probed in RED.** The one assertion here that pins
EXISTING behaviour rather than a control of new behaviour. Mutated `cmd_models`
so the "has a contract" test also reads `touches:`, ran the single assertion
(a scratch script sourcing `_lib.sh`, same fixture, same needle), restored:

```
=== mutate: scripts/plan.sh (1 line(s) changed by s/section "$file" "Contract" | has_content && contract_has=1/{ section "$file" "Contract"; frontmatter_list "$file" touches; } | has_content \&\& contract_has=1/) ===
  137 -   section "$file" "Contract" | has_content && contract_has=1
  137 +   { section "$file" "Contract"; frontmatter_list "$file" touches; } | has_content && contract_has=1

=== mutate: running bash .../scratchpad/probe-models.sh ===
    FAIL touches: does not stand in for the Contract in the model plan
         expected to contain: RED	test-developer	opus
         actual:               PLANNED	lead-po	opus	planning is the judgement phase: ...
         RED	test-developer	fable	the measured case. ...
         ...
probe-models: 0 passed, 1 failed

=== mutate: command exited 1; restored (verified byte-for-byte against .claude/state/mutations/scripts_plan.sh.20260930T021243Z.27892.bak) ===
  137:   section "$file" "Contract" | has_content && contract_has=1
```

Unmutated, the same script reports `probe-models: 1 passed, 0 failed`.
`git status` shows `scripts/` untouched.

### Negative controls - expected values

No numeric thresholds in this story; every control is a row status, a line
count or an exit code. All of these DID run (bash suites do not fail at
import), so the "measured" column is what the current code printed, and GREEN
confirms the "expected" column against the shipped `cmd_conflicts`.

| Control | Fixture | Expected after GREEN | Measured in RED (today's code) |
|---|---|---|---|
| AC-1: `touches: []` + Contract naming B's file | A `[]`/Contract `src/core/world.ts`; B touches `src/core/world.ts` | row `CONFLICT` | `UNKNOWN` (red) |
| AC-1: `touches: []` + no Contract | A `[]`; B touches `src/core/world.ts` | row `UNKNOWN` | `UNKNOWN` (green) |
| AC-2: disjoint | A `{world.ts, climate.ts}`; B `{panel.tsx, design.md}` | row `clear`, exit `0` | `UNKNOWN`, exit 0 |
| AC-2: only the shared path named | A `{world.ts, panel.tsx}`; B `{design.md, panel.tsx}` | row contains `src/ui/panel.tsx`, not `src/core/world.ts` | row is the UNKNOWN sentence |
| AC-3: neither declaration | A touches `world.ts`; B nothing | row `UNKNOWN`, detail contains `touches`, no DRIFT lines | `UNKNOWN`, detail lacks `touches` |
| AC-3: empty Contract, no drift | A touches `scripts/plan.sh`; B touches `scripts/new-story.sh` | 0 DRIFT lines, `0 pair(s) that could not be judged` | 0 DRIFT lines, `1 pair(s)` |
| AC-4: agreed path not drift | A touches `scripts/plan.sh`, Contract names `scripts/plan.sh` + `scripts/new-story.sh` | exactly 1 DRIFT line for A, naming `new-story.sh` only | 0 |
| AC-4: glob covers | A touches `src/ui/*.tsx`, Contract `src/ui/panel.tsx` | 0 DRIFT lines for A | 0 |
| AC-4: glob does not cover | A touches `src/core/*.ts`, Contract `src/ui/panel.tsx` | 1 DRIFT line naming `src/ui/panel.tsx` | 0 |
| AC-4: drift + no conflict | as "agreed path" | exit `0`, summary `... 1 drift warning(s).` | exit 0, two-count summary |
| AC-4: drift + conflict | A and B both touch `scripts/plan.sh`, A's Contract adds `new-story.sh` | exit `1`, summary `1 conflict(s), 0 pair(s) ..., 1 drift warning(s).` | exit 0 |
| AC-4: blocked story | B depends on A, B's Contract disagrees with its touches | 0 DRIFT lines for B | 0 |
| Model policy | A touches `src/core/world.ts`, empty Contract | `RED  test-developer  opus` | same (green; probed) |
| AC-5 control (boundaries) | story with no `touches:` key | no `touches` in check-boundaries output | same (green; GATES earns it) |

### Mutation predictions for GREEN's implementation

For GATES' "defect put back" and for anyone checking the suite discriminates.
Counts are assertions in `bash scripts/selftest.sh plan` expected to go red.

| # | Mutation of the GREEN `cmd_conflicts` | Predicted red | Which |
|---|---|---|---|
| M-1 | drift changes the exit status (`[ "$conflicts" -eq 0 ] && [ "$drift" -eq 0 ]`) | **2** | `and drift alone does not change the exit status` and `and still exits 0` (single startable story). `and the conflict still decides the exit status` is unaffected: with a conflict present the exit is 1 either way, and `conflicts_rc` re-runs the command each time so no other case sees drift. |
| M-2 | drift judged from the Contract alone when `touches:` is absent (drop the `story_touches` non-empty guard, so a Contract-only story prints its whole path list as DRIFT) | **exactly 1** | `a story with a Contract and no touches: key is not drift`. The other conjunct - Contract empty, `touches:` set - is vacuous to mutate: nothing to iterate. |
| M-3 | `touches: []` read as "touches nothing" (a story with the key present but empty is judged on an empty set and reads `clear`) | **2** | `touches: [] falls through to the Contract, like an absent key` (expects CONFLICT, gets clear) and `touches: [] with no Contract is UNKNOWN, not clear` (expects UNKNOWN, gets clear) |
| M-4 | glob match dropped from the drift test (equality only) | **exactly 1** | `a Contract path matched by a touches: glob is not drift` |
| M-5 | `story_touches` consulted only when `contract_paths` is empty (precedence reversed) | **2** | `a story with touches: is judged on those paths, not on its Contract` (CONFLICT instead of clear) and `and changing only touches: changes the verdict` (clear instead of CONFLICT); the `[]` cases are unaffected because they fall through either way |
| M-6 | revert to `contract_paths` alone (the deferred "defect put back") | **19** | the same 19 listed in the RED output above |
| M-7 | summary line keeps the two-count form | **exactly 1** in AC-4's main case, **2** overall | `and the summary line counts it`, `drift and a conflict are counted separately` |


### Timings

All local, this machine (Windows, Git Bash), uninstrumented - there is no
instrumented run for bash suites. `plan` ~3 min, `new-story` ~5 s,
`boundaries` ~4 min. The `plan` suite was ~2 min before this story; the 30 s
added is 14 fixture rebuilds and 17 `plan.sh conflicts` runs, each of which
runs `cmd_next` per story. No per-test timeouts exist in these suites; CI's
`selftest` job runs all suites and its budget is the job's.

### Discovered, for the implementer

- `cmd_conflicts` returns early on fewer than two startable stories, before
  any per-story work. AC-4 wants drift reported in that case, so the drift
  pass has to come before that return (or the return has to go).
- `frontmatter_list` already handles `touches: []` (empty output) and a glob
  element (`src/ui/*.tsx` survives its `gsub(/[][,]/, " ")` - only brackets
  and commas are stripped). No change to `lib.sh` is needed, as the Contract
  says.
- The AC-4 fixtures put paths in Contract prose as `` `scripts/plan.sh` gains
  story_touches; `scripts/new-story.sh` emits the key. `` -
  `contract_paths`' regex extracts exactly those two tokens from it and
  nothing else (checked by hand: `story_touches;` has no dot, `key.` has no
  trailing alnum). If GREEN changes the extractor, that is out of this
  story's Contract.

### GREEN: controls confirmed

Measured against the shipped `cmd_conflicts` (GREEN working tree), each
fixture rebuilt from the table above in a throwaway `make_project_fixture`
copy - never in `docs/backlog/stories` - and `bash scripts/plan.sh conflicts`
run once per fixture.

| Control | Expected after GREEN | Measured in GREEN | Agrees |
|---|---|---|---|
| AC-1: `touches: []` + Contract naming B's file | row `CONFLICT` | `CONFLICT  A + B  src/core/world.ts`, exit 1 | yes |
| AC-1: `touches: []` + no Contract | row `UNKNOWN` | `UNKNOWN  A + B  declares neither touches: nor Contract paths - cannot judge` | yes |
| AC-2: disjoint | row `clear`, exit `0` | `clear`, exit 0 | yes |
| AC-2: only the shared path named | contains `src/ui/panel.tsx`, not `src/core/world.ts` | `CONFLICT  A + B  src/ui/panel.tsx`, exit 1 | yes |
| AC-3: neither declaration | `UNKNOWN`, detail contains `touches`, no DRIFT | `UNKNOWN`, detail as above, 0 DRIFT lines | yes |
| AC-3: empty Contract, no drift | 0 DRIFT, `0 pair(s) that could not be judged` | `clear`, 0 DRIFT, `0 conflict(s), 0 pair(s) that could not be judged, 0 drift warning(s).` | yes |
| AC-4: agreed path not drift | exactly 1 DRIFT for A, `new-story.sh` only | `DRIFT     A             contract names scripts/new-story.sh, touches: does not` (1 line) | yes |
| AC-4: glob covers | 0 DRIFT for A | 0 | yes |
| AC-4: glob does not cover | 1 DRIFT naming `src/ui/panel.tsx` | `DRIFT  A  contract names src/ui/panel.tsx, touches: does not` (1 line) | yes |
| AC-4: drift + no conflict | exit 0, `... 1 drift warning(s).` | exit 0, `0 conflict(s), 0 pair(s) that could not be judged, 1 drift warning(s).` | yes |
| AC-4: drift + conflict | exit 1, `1 conflict(s), 0 pair(s) ..., 1 drift warning(s).` | exit 1, `1 conflict(s), 0 pair(s) that could not be judged, 1 drift warning(s).` | yes |
| AC-4: blocked story | 0 DRIFT for B | 0 (B, depending on A, absent from both table and drift; A + C judged `clear`) | yes |
| AC-4: single startable story (not in RED's table; pinned by the suite) | DRIFT printed, exit 0 | `fewer than two startable stories; nothing to compare`, then the DRIFT line and `1 drift warning(s).`, exit 0 | - |
| Model policy | `RED  test-developer  opus` | `RED	test-developer	opus	what was measured was a partitioned BRIEF ...` | yes |
| AC-5 control (boundaries) | no `touches` in check-boundaries output | `boundaries: 80 passed, 0 failed`; mutation earning it is GATES' | yes (not earned here) |

No divergence from RED's expected column. Suites at the end of GREEN:
`plan: 75 passed, 0 failed`, `new-story: 31 passed, 0 failed`,
`boundaries: 80 passed, 0 failed`, `sigpipe: 82 passed, 0 failed`,
`grep-count: 20 passed, 0 failed`; `check-sigpipe.sh` and
`check-grep-count.sh` 0 findings over 41 files; `gates.sh --fast` 0 ran, 5
unconfigured, exit 0.

**Seen in passing, for GATES' real-backlog probe (not run as that probe):**
`bash scripts/plan.sh conflicts` on the real backlog now judges HARNESS-006
against HARNESS-009 - `CONFLICT` on `.claude/tests/plan.test.sh
scripts/plan.sh` - and prints 15 DRIFT lines (9 for HARNESS-006, 6 for
HARNESS-009), every one a path the Contract prose mentions rather than writes,
or a non-path (`AC-1..AC`, `.claude/skills/stack-profiles/reference/`), exactly
as the PLANNED revision predicted. The other 20 pairs are UNKNOWN. Exit 1.

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

    run:    2026-09-30T03:09:00Z
    commit: d4cd164 (working tree had uncommitted changes)
    tree:   fa7ddf26436d9cbfca79b104aba02f866e69f5fa
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

Filed 2026-09-20 by the user, after reviewing release 45 and observing -
correctly - that `plan.sh conflicts` is a lint over a decomposition rather than
a capability, and that the planner is where parallelism has to be decided.

**This story declares its own `touches:`,** which is both the point and the
first real test of the field: if the list is awkward to write for a story about
writing the list, the design is wrong.

**Why the field is frontmatter and not a new section.** `depends_on` is already
frontmatter, enforced by `phase.sh set`, and read by `frontmatter_list`. A
footprint is the same kind of fact - a machine-readable property of the story
rather than prose for a human - so it goes in the same place and uses the same
reader. A seventh `##` section would need its own parser, and rules.md is
explicit about what happens to a rule that gets a private copy per caller.

**The honest limit of the whole idea,** worth stating before anyone builds on
it: a declaration is intent. `touches:` says what a story expects to write, not
what it wrote. Two stories with disjoint declarations can still collide if one
of them was wrong. AC-4's drift check catches the case where the story's own
contract disagrees with its declaration, which is the cheap half; comparing
either against the actual diff is named in `## Out of scope` and not scheduled.

**GREEN verification by the orchestrator, 2026-09-30.** Tests unchanged since
the RED commit (`git diff --stat HEAD -- .claude/tests` empty). One mutation from
RED's table, the one predicting a single-assertion catch - M-4, glob match
dropped from the drift test:

    $ bash scripts/mutate.sh scripts/plan.sh '/case "$p" in $g) hit=1; break ;; esac/d' -- bash scripts/selftest.sh plan
        FAIL a Contract path matched by a touches: glob is not drift
             expected:
             actual:   DRIFT     A             contract names src/ui/panel.tsx, touches: does not
    plan: 74 passed, 1 failed
    === mutate: command exited 1; restored (verified byte-for-byte ...) ===

Predicted exactly 1, measured exactly 1. The rest of the table is
`/audit-mutations`' work.

**DONE, 2026-09-30.** Merged in #86 (merge commit 2ea8002), release 56. PR CI:
`gates` job success in 1m34s against `timeout-minutes: 45`
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/36664195905);
`boundaries` success in 7s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/36664195949).
