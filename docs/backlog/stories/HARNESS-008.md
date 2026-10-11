---
id: HARNESS-008
title: One phase lock per worktree, so two stories can be in flight at once
slug: one-phase-lock-per-worktree-so-two-stori
epic: 
type: chore
status: done
phase: DONE
branch: story/HARNESS-008-one-phase-lock-per-worktree-so-two-stori
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [scripts/doctor.sh, .claude/tests/worktree.test.sh, .claude/tests/doctor.test.sh, CLAUDE.md]  # files this story expects to write
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

No epic. The harness maintaining itself, and the story that removes the hard
constraint on parallel work.

**One checkout works one story, and the reason is one file.**
`.claude/state/current-story.env` holds a single `STORY_ID` and a single
`PHASE`. Every hook reads it - `phase-guard.sh` to decide what may be written,
`gate-reminder.sh` to decide what to nag about, `inject-state.sh` to tell the
session where it is. Two stories in one checkout means one file and two truths.

**Most of the work is already done, and this was measured rather than assumed.**
A throwaway worktree at release 45:

    git worktree add -d <tmp> HEAD
    ls <tmp>/.claude/state/     -> README.md
    ls  ./.claude/state/        -> README.md  gate-logs  last-gate-run
    git check-ignore -v .claude/state/current-story.env
      -> .gitignore:2:.claude/state/*

`.claude/state/*` is gitignored, and a git worktree has its own working
directory, so **each worktree already gets its own phase lock**. Nothing is
shared. `phase.sh set` already refuses to advance a story while the checkout is
on the wrong branch, which is exactly the one-story-per-worktree invariant this
needs. The mechanism is not missing; it has never been tried, named, or tested.

**So this story is smaller than it looks and mostly adversarial.** It is not
"build a per-worktree lock" - it is "prove the lock is per-worktree, find what
breaks when two of them are live, and fix or document that". The things most
likely to break are the ones that assume a single tree:
`refresh-harness.sh` (run per worktree, or once?), `gates.sh`'s stamp in
`.claude/state/last-gate-run`, and `doctor.sh`, which says nothing today about
which worktree it is in.

**Why it is the story that matters.** HARNESS-006 makes it possible to ask which
stories could run together. It does not make running them possible. Until this
lands, the answer to "can we work two at once" is no, regardless of how good the
planning gets.
## Acceptance criteria

- **AC-1** - Given two git worktrees of this repository, when a story is set to
  a phase in one, then `phase.sh show` in the other reports no active story and
  the first still reports its own. *Control:* setting a second story in the
  second worktree leaves the first unchanged - neither overwrites the other.
- **AC-2** - Given two worktrees each with a different story active in a
  source-freezing phase, when a write to a source path is attempted in each,
  then each is judged against ITS OWN phase. A RED worktree refuses the write; a
  GREEN worktree beside it allows it, at the same moment.
- **AC-3** - Given a worktree, when `bash scripts/gates.sh` runs in it, then the
  record it writes and the record in the other worktree are independent, and
  `check-boundaries.sh` in each judges its own tree. *Control:* a gate run in
  one worktree does not satisfy `check-boundaries.sh` in the other.
- **AC-4** - Given a worktree that is not the main checkout, when
  `bash scripts/doctor.sh` runs, then it names which worktree it is in and
  whether that worktree's harness is the same release as the main checkout's.
  Two worktrees on different releases is a state the refresh procedure can
  produce and nothing currently reports.
- **AC-5** - `bash scripts/refresh-harness.sh` run inside a worktree either
  works correctly on that worktree alone, or refuses and says why. What it must
  not do is partially update a tree it shares files with. *Control for
  whichever it turns out to be:* the other worktree's `VERSION` is unchanged
  after the run.
- **AC-6** - `CLAUDE.md` documents the worktree workflow: how to create one per
  story, that `plan.sh conflicts` should be consulted before choosing the
  second story, and that the answer is only as good as the `## Contract`
  declarations it reads - NOT the `touches:` frontmatter, which
  `plan.sh conflicts` does not read. *Verified by review* - see
  `## Deferred verifications`. Amended after the freeze: see `## Amendments` A-1.
## Contract

**No new state file, and no change to `current-story.env`'s format.** The lock
is already per-worktree because `.claude/state/*` is gitignored and a worktree
has its own working directory. This story proves that and repairs what assumes
otherwise; a design that adds a registry of active stories is the wrong answer
and is out of scope.

**`scripts/doctor.sh`** gains a worktree line, printed always, in the existing
`ok`/`MISSING` style:

    ok       worktree     main checkout, harness 46
    ok       worktree     linked worktree of <path>, harness 46
    MISSING  worktree     linked worktree, harness 44 - main checkout is 46

Detected with `git rev-parse --git-common-dir` compared to `--git-dir`: they
differ in a linked worktree and match in the main one. No new dependency.

**`scripts/refresh-harness.sh`** — AMENDED IN PLACE BY RED, 2026-09-21. The
block said it "gains one refusal or one note, whichever the RED investigation
shows is correct". The investigation was done and the answer is NEITHER: refresh
already works correctly inside a linked worktree.

Measured by RED against a fixture, and reproduced independently by the
orchestrator against this real repository rather than by re-running RED's own
probe:

    git worktree add -d <tmp> HEAD
    cd <tmp> && bash scripts/refresh-harness.sh --dry-run <main checkout>
      into: <tmp>   (45)        <- the worktree, correctly, not the main checkout
      rc=0                      <- no refusal

It targets the worktree it is run in, leaves the other trees alone, and the
release-39 "not a release" note fires on source branch as normal. So this story
adds NOTHING to refresh-harness.sh, and AC-5's "works" branch is the one that
holds. AC-5 is unchanged and still falsifiable: its control - the other
worktree's `VERSION` unchanged after the run - is what the suite asserts.

Recorded rather than deleted, because "the contract asked for a change that
turned out to be unnecessary" is a finding, and a silently dropped clause reads
later like an oversight.

**`.claude/tests/worktree.test.sh`**, new, carries AC-1 through AC-5. It creates
real worktrees with `git worktree add -d` in a throwaway fixture and removes
them in a trap. It does NOT simulate a worktree by copying a directory: the
whole claim is about what git does with `.git`, and a copy would pass while
proving nothing - the release 41 rule, applied to this story's own fixtures.

**Test-only dependencies:** none. git worktree is git.

**Callers of anything whose signature changes:** none. `doctor.sh` gains
output; nothing parses it except `doctor.test.sh`, which this story updates.

## Deferred verifications

**AC-6, the documentation criterion. Owner: REVIEW.**

A `CLAUDE.md` section is not assertable without pinning its phrasing, which
goes stale the first time somebody rewrites it better. REVIEW reads it and
records here that it answers the question a person will actually have: what to
do when `plan.sh conflicts` says UNKNOWN, which - until every story has a
written `## Contract` - is most of the time.

REVIEW also confirms the shipped section does not repeat the error
`## Amendments` A-1 corrected: naming `touches:` as what the command
reads. It reads `## Contract` paths. A section that gets this wrong
satisfies the criterion's words and misdirects every reader of it.

**Result (REVIEW, 2026-09-22): PASSED, with one thing considered and left out.**

Read against the shipped `CLAUDE.md` section `## Two stories at once`, placed
after `## Phase lock`.

**The three things AC-6 requires are present.**

  * *How to create one per story* — the `git worktree add ../adh-WORLD-015 -b
    story/WORLD-015-slug` line, with `doctor.sh` named beside it as the thing
    that says which worktree you are in. The `WORLD-0NN` id is not this
    repository's numbering; it is the convention `CLAUDE.md` already uses in the
    `## Phase lock` block immediately above (`bash scripts/plan.sh WORLD-014`),
    so it is consistent rather than stray. Checked, not assumed.
  * *Consult `plan.sh conflicts` before choosing the second story* — its own
    fenced block, under a heading that says when to run it.
  * *The answer is only as good as the declarations it reads* — stated, and
    stated in the NEGATIVE as well: "It reads the paths in each story's
    `## Contract` section — not the `touches:` frontmatter, which it does not
    read at all." This is the point `## Amendments` A-1 corrected, and the
    negative form is deliberate so that a future skim cannot reintroduce it.

**The question this entry exists to ask is answered.** "What to do when
`plan.sh conflicts` says UNKNOWN, which is most of the time" gets its own
paragraph, which says why UNKNOWN is the ordinary state of a fresh backlog
rather than a fault, gives two concrete moves (write the contracts, or judge by
hand treating a shared script as a conflict until both are read), and closes
with "Never read `UNKNOWN` as permission" plus the reason the command exits 0
on it. A reader who hits UNKNOWN is not left guessing.

**Both factual claims in the section were executed before being written**, and
the evidence is in `## Notes` under PO-J: the `git worktree add` invocation with
the option after the path (valid, but not the order `git worktree --help` shows
first) exited 0 on this checkout and was then removed and pruned; and
`plan.sh conflicts` with 20 UNKNOWNs and 0 conflicts exits 0, confirming the
"exits non-zero only on a real `CONFLICT`" sentence. A command in `CLAUDE.md` is
read as instruction by every future agent.

**Considered and deliberately left out: the PO-H exit-status caveat.** The
section says `doctor.sh` reports whether the releases match. On an
unbootstrapped project it reports that and still exits 0, which the GATES
real-tree probe measured. It is not mentioned here because it is a property of
`doctor.sh`'s early-exit path rather than of the worktree workflow, it applies
equally to the CI block that has had the same hole for longer, and PO-H owns it
as its own story. Putting it in `CLAUDE.md` would document a defect in the file
that is supposed to stay short, instead of fixing it.

**One limitation worth stating rather than hiding.** Nothing asserts this
section's content — `refresh.test.sh` uses its own fixtures and `lib.test.sh`
only checks that `CLAUDE.md` classifies as `harness`. This reading is the only
verification AC-6 has, which is exactly why it was declared as a deferred
verification at PLANNED rather than left to a test that does not exist.

**AC-2 against a REAL pair of stories. Owner: GATES.**

Release 41 requires a probe against the tree the rule judges. GATES creates two
worktrees, sets a real story from this backlog to RED in one and another to
GREEN in the other, attempts a source write in each, and pastes both outcomes.
Fixture stories would demonstrate the mechanism; this demonstrates it on the
backlog that exists.

**Result (GATES, 2026-09-22): PASSED, on HARNESS-006 and HARNESS-001.**

Two real linked worktrees of this repository, each on the branch its story's
frontmatter names, with two stories from this backlog set to opposing phases by
`phase.sh` in each worktree:

    === THREE TREES, THREE TRUTHS (same moment) ===
    main:     HARNESS-008 / GATES
    wt A:     HARNESS-006 / RED
    wt B:     HARNESS-001 / GREEN

The SAME write — `src/main.ts`, which `classify.sh` reports as `source` —
offered to the real `phase-guard.sh` in each tree, at the same moment:

    --- CLAUDE_PROJECT_DIR=/tmp/adh-ac2-red ---
    {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",
     "permissionDecisionReason":"BLOCKED by the harness phase lock.

      story:    HARNESS-006
      phase:    RED
      path:     src/main.ts
      category: source

    Story is in RED. Production code is frozen: ...

    --- CLAUDE_PROJECT_DIR=/tmp/adh-ac2-green ---
    (no output: allowed)

**The discriminating detail is the story id in the refusal.** It says
`HARNESS-006` — worktree A's own story — not `HARNESS-008`, which is what the
main checkout's lock holds. A hook reading a shared location would have named
HARNESS-008. This is the assertion that makes the pair mean something, and it
is why the probe uses a real backlog with three different stories live rather
than two fixtures.

**One half is more discriminating than the other here, and saying so is the
point.** Main is in GATES, which permits source writes, so a hook wrongly
reading main's state would also have ALLOWED in worktree B — the allow-half
would pass vacuously. The refuse-half cannot pass vacuously: it requires the
guard to have found RED somewhere only worktree A holds, and to name A's story.
RED's own handoff recorded this asymmetry ("Three trees, not two, in AC-2") and
solved it in the fixture by putting the main checkout in RED; on the real tree
the orchestrator could not, because main carries this story in GATES and moving
it would be faking the experiment. The story id carries the weight instead.

**Cleanup.** Both worktrees removed with `git worktree remove --force`,
`git worktree prune` run, and both temporary branches deleted. Verified
afterwards that the backlog is untouched — `HARNESS-001: phase: PLANNED`,
`HARNESS-006: phase: PLANNED` in the main checkout — and that main's own lock
still reads `HARNESS-008 / GATES`. `phase.sh set` rewrites story frontmatter,
so those edits were real; they existed only on the two deleted branches.

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

### A-1. AC-6: `touches:` -> `## Contract`. Approved by the user, 2026-09-22.

**What it said:**

> ...that `plan.sh conflicts` should be consulted before choosing the second
> story, and that the answer is only as good as the `touches:` declarations it
> reads.

**What it says now:**

> ...that `plan.sh conflicts` should be consulted before choosing the second
> story, and that the answer is only as good as the `## Contract` declarations
> it reads - NOT the `touches:` frontmatter, which `plan.sh conflicts` does not
> read.

**Why.** `plan.sh conflicts` does not read `touches:`. It calls
`contract_paths`, which extracts paths from a story's `## Contract` section.
Left as written, AC-6 obliges GREEN to put a sentence into `CLAUDE.md` that is
false about the tool in this tree - the documentation instance of an assertion
whose needle cannot fail. `touches:` is frontmatter and is HARNESS-006's
subject, still PLANNED.

**Found by the orchestrator at the start of this dispatch, not by a subagent,**
so there is no subagent claim to reproduce - but the finding is a claim too, and
it was verified two independent ways before the criterion was touched:

1. Read `scripts/plan.sh`. `cmd_conflicts` calls `contract_paths "${files[$i]}"`
   for each side of a pair; `contract_paths` is `section "$1" "Contract" |
   strip_comments | grep -oE ...`. The string `touches` does not appear in
   `scripts/plan.sh` at all.
2. Ran it against the real backlog, where every story carries a `touches:` line
   and none but this one carries a `## Contract`:

        $ bash scripts/plan.sh conflicts
        STATUS    PAIR                      DETAIL
        UNKNOWN   HARNESS-001 + HARNESS-002 no Contract paths declared yet - cannot judge
        ...
        0 conflict(s), 20 pair(s) that could not be judged.

   If `touches:` were read, those pairs would have been judged: all of them
   declare paths there. The command says `Contract` in its own detail line.

**Scope of the change.** Wording of AC-6 only. No test asserts AC-6 - it is a
`## Deferred verifications` entry owned by REVIEW - so no test changes, and
this is not a return to RED. The REVIEW entry was extended to confirm the
shipped `CLAUDE.md` section does not repeat the original error.

**The alternative that was declined.** Documenting both, with a forward
reference to the `touches:` check HARNESS-006 will add. Declined by the user:
it stales if 006 changes shape or never lands, and a forward reference in
`CLAUDE.md` is read as a description of the present.

## Model guidance

Planned by `bash scripts/plan.sh write HARNESS-008` from `.claude/harness/models.conf`.
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

- **PLANNED** — `lead-po`, **Opus 5** (`claude-opus-5`), the session's own model.
  Matches the plan.
- **RED** — `test-developer`. Dispatched in an earlier session; that session did
  not record the resolved model, and the orchestrator arriving at this branch
  cannot recover it from the tree. **Recorded as UNKNOWN rather than as the
  plan's `fable`**, because writing down the plan in place of the fact is the
  exact confusion `rules.md` created this field to end. The verdict below is
  therefore about the OUTPUT, not about the model.
- **GREEN** — `feature-developer`, **Opus 5**. Matches the plan. No override was
  passed by the orchestrator; the agent definition's `model: opus` is what
  resolved, and the agent confirmed it in its own report.
- **RED (return from GREEN, R-1)** — `test-developer`, **Fable 5.1** (`fable`),
  dispatched with an explicit model override so that the plan's row for RED was
  actually exercised and recorded, which the first RED's was not. **Mixed
  result, and the split is informative.** The code change was exactly right:
  two lines of the `DISCARDED` census, correct line numbers verified against
  the tree, nothing else in the file and no production file touched — a clean
  minimal diff against a tight brief, which is the profile the plan predicts.
  What it did not do was finish: it started Probe A, its dispatch ended while
  that run was still in flight, and it returned without pasting any output,
  leaving `scripts/doctor.sh` mutated and `## Regressions` ending at "Output
  pasted below." with nothing below it. The orchestrator waited for the restore
  and ran all three probes itself.

  **Read carefully, this is not evidence about the model's judgement.** The
  brief was mechanical and it executed the mechanical part correctly. The
  failure was in seeing a long-running background command through to its end —
  and the harness's own evidence rule is what caught it, not a reviewer:
  `check-boundaries.sh` refuses a `## Regressions` that describes a failure
  without showing one, so the gap could not have reached a PR silently.

  **The operational lesson, which is the transferable one:** a dispatch that
  starts a mutation must not end before that mutation's restore. A mutated
  production file left behind by a finished agent is indistinguishable from a
  failed restore until someone checks whether the PID is alive, and the
  orchestrator nearly restored it by hand — which would have raced
  `mutate.sh`'s own restore. Brief future RED returns to run probes in the
  foreground, or to report the in-flight PID so the orchestrator can wait on it
  deliberately.

**Verdict on RED's success condition — met, with the model unattributable.**
The plan's claim for RED is that a partitioned contract lets the weaker model
write sharper negative controls. The controls this RED produced are sharp:
every AC-4 assertion is anchored (`^  ok       worktree +…`) with a
`([^0-9]|$)` tail so `45` cannot match `450`, each positive assertion is paired
with a 0-count control, and the exit-status assertions are separate from the
text assertions — which the orchestrator's mutation M2 proved is not decorative
(dropping only the `missing` increment reddens the two exit assertions and
leaves every text assertion green). RED also declined a Contract clause whose
premise it found false rather than inventing a test for it. That is the
behaviour the plan predicts. What cannot be claimed is that the weaker model
produced it, because nobody wrote down which model ran.

**The process finding, worth more than the verdict.** A dispatch's model is
recoverable only at the moment of dispatch. This story lost RED's permanently
because the session ended before it was written down, and the phase lock's
state file is machine-local and had been cleared. Record it in the same action
that dispatches, not at the end of the phase.

## Out of scope

- **HARNESS-009**, the orchestrator dispatching into these worktrees. This story
  makes two locks possible; something still has to decide to use them.
- **HARNESS-007**, the planner aiming for disjoint footprints. Not a dependency:
  this works without it, you just have fewer safe pairs to choose from.
- **Checking a `touches:` declaration against the diff a story produced.** Named
  in HARNESS-006 and still not scheduled. Parallel work makes it matter more,
  because a story that strays outside its declaration now strays into somebody
  else's worktree.
- **Any shared lock, registry or lease.** If two worktrees need to coordinate
  beyond "different branches, different files", that is a design this story has
  not earned and should not invent.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

One suite, `.claude/tests/worktree.test.sh`, at the level the contract lives:
the real scripts and the real hook, driven from inside real worktrees. Run by
`bash scripts/selftest.sh worktree`; picked up by the selftest glob, which CI
runs at `gates.yml:72`. No unit level exists below this - every claim is about
what a script does with `.git`, so a test that did not shell out would be
testing a re-implementation.

**The fixture** is one main checkout (`make_project_fixture`, with the real
`.claude/state/*` ignore rule appended, two chore stories `T-A`/`T-B` and a
one-gate `project.conf` committed) plus two linked worktrees made with
`git worktree add -b story/T-A-fixture` / `-b story/T-B-fixture`, and a
second project fixture stamped `99 (2099-01-01)` as the upstream for AC-5. The
trap removes the worktrees through `git worktree remove --force` before the
directories go. Not a copied directory, per the Contract: the premise block
asserts both linked trees resolve `--git-common-dir` to the main checkout's
`.git` and `--git-dir` to somewhere else, so a `cp -r` would fail before AC-1.

**The measurement in `## Context` reproduced** on this checkout at 6764f8a
before the suite was written: a fresh `git worktree add -d` had
`.claude/state/{.gitkeep,README.md}` only (the story's bare `ls` hid the
`.gitkeep`); this checkout had `current-story.env gate-logs last-gate-run
mutations` beside them; `git check-ignore -v` gave `.gitignore:2:.claude/state/*`;
`--git-dir`/`--git-common-dir` read `.git`/`.git` in main and
`<main>/.git/worktrees/<name>`/`<main>/.git` in the linked one.

| Block | AC | What it pins | Level |
|---|---|---|---|
| premise | Context | this repo ignores `current-story.env` and `last-gate-run` and does NOT ignore `state/README.md`; the fixture worktrees share main's `.git`; a fresh linked worktree has no state file | real repo (read-only), fixture |
| AC-1 | AC-1 | `phase.sh set T-A RED` in `a`; `phase.sh show` in `b` and in main is exactly `No active story. The phase lock is off.`; `a` shows `STORY_ID=T-A`/`PHASE=RED`. Control: `set T-B GREEN` in `b` leaves `a`'s state and `a`'s story frontmatter untouched, and `b`'s copy of `T-A.md` still says PLANNED | script + files |
| AC-2 | AC-2 | the same `printf x > src/main.ts` judged by the real hook in both worktrees concurrently (`&`, `wait`): refused in `a` naming `story: T-A`, `phase: RED`, `path: src/main.ts`; allowed in `b`. Controls: a test write refused in `b` (GREEN) and allowed in `a`; the `Write` tool path both ways | hook |
| AC-3 | AC-3 | `gates.sh` in `a` (REVIEW) writes `a/.claude/state/last-gate-run` with `RESULT=pass` and a `tree:` line into `a`'s `T-A.md`; `b` and main have neither. `check-boundaries.sh <base>` in `a`: rc 0, `ok    gate record matches the working tree`. Control: `b` set to REVIEW without a gate run: rc 1, `FAIL  story T-B: ## Gate results was not written by scripts/gates.sh`, no `gate record matches` line, no mention of T-A | scripts + files |
| AC-4 | AC-4 | doctor in `a`: exactly one `  ok       worktree     linked worktree of <path>, harness 45`, no `main checkout` row, no `MISSING  worktree` row, rc 0. In main: one `  ok       worktree     main checkout, harness 45`, no `linked worktree`. `a`'s VERSION rewritten to `44 (...)`: one `  MISSING  worktree     linked worktree ... harness 44 ... main checkout is 45`, no `ok worktree` row, rc 1; main still reads its own stamp | script |
| AC-5 | AC-5 | `refresh-harness.sh <up>` from inside `a` (cleared, clean): rc 0; `a`'s VERSION is `99 (2099-01-01)`; the hook upstream ships arrives in `a`; `b`'s and main's VERSION byte-identical to before; neither got the hook. Then doctor in `a` reports `harness 99 ... main checkout is 45`, rc 1, and doctor in main is still ok | script + files |

AC-6 is not asserted (deferred verification, owner REVIEW). Every needle is
anchored at line start and counted with awk over a here-string; the two
`check-boundaries.sh` needles read the `ok    `/`FAIL  ` status column.

## Handoff: RED -> GREEN

**Run:** `bash scripts/selftest.sh worktree` (the whole selftest: `bash
scripts/selftest.sh`). About 90 s on this Windows checkout, in line with the
other script-driving suites (`refresh` 61 s, `doctor` 59 s, `gates` 273 s
here); Linux CI is much faster at process spawn. No `gates.sh` gate covers it -
see PO decision 1 in `## Notes` - so `gates.sh --fast` is run only for shape:
`All required gates passed (0 ran, 5 unconfigured, 0 known)`, rc 0, not
recorded. `scripts/check-sigpipe.sh` and `scripts/check-grep-count.sh` both
scan 39 shell files including the new suite and report 0 findings. The full
`bash scripts/selftest.sh` after the last probe: 17 suites green, `worktree:
65 passed, 8 failed`, `1 of 18 harness suite(s) FAILED` - the eight below and
nothing else.

**Files touched:** `.claude/tests/worktree.test.sh` (new), this story's
`## Test plan` and this section. Nothing else. No test dependency: worktrees
are git.

### The failure, verbatim, and why it is the right one

```
=== worktree ===

  premise: the measurement the story rests on, reproduced

  AC-1: a story set in one worktree is invisible to the other

  AC-2: each worktree's write is judged against ITS OWN phase

  AC-3: the gate record belongs to the worktree that ran the gates

  AC-4: doctor names the worktree it is in, and whether its release matches
    FAIL a linked worktree is named as one, with its release
         expected: 1
         actual:   0
    FAIL the main checkout is named as one, with its release
         expected: 1
         actual:   0
    FAIL a linked worktree behind the main checkout is MISSING, naming both releases
         expected: 1
         actual:   0
    FAIL and doctor exits 1 on the mismatch
         expected: 1
         actual:   0
    FAIL the main checkout reads its own stamp, not the linked worktree's
         expected: 1
         actual:   0

  AC-5: refresh-harness.sh inside a linked worktree works on that worktree alone
    FAIL doctor in the refreshed worktree reports the mismatch the refresh produced
         expected: 1
         actual:   0
    FAIL and exits 1
         expected: 1
         actual:   0
    FAIL doctor in the main checkout still reports its own release as ok
         expected: 1
         actual:   0

worktree: 65 passed, 8 failed

1 of 1 harness suite(s) FAILED.
```

All eight reds are one absence: `doctor.sh` prints no `worktree` row. Five are
the AC-4 block; three are AC-5's tail, which asks doctor to report the
release mismatch the refresh just produced. Nothing else is red, and that is
the story's thesis - the lock already IS per-worktree - so the 65 that pass on
arrival are each earned below by a mutation, or named as a control/fixture
guard that no production mutation can reach.

### What GREEN builds - the output shape the tests already pin

Only `scripts/doctor.sh` is under a red test. The Contract's three lines are
pinned as follows; the regexes are the assertions' own:

| Situation | Line doctor must print (once) | Exit |
|---|---|---|
| main checkout | `  ok       worktree     main checkout, harness 45` — regex `^  ok       worktree +main checkout, harness 45([^0-9]\|$)` | 0 |
| linked worktree, same release | `  ok       worktree     linked worktree of <path>, harness 45` — regex `^  ok       worktree +linked worktree of [^,]+, harness 45([^0-9]\|$)` | 0 |
| linked worktree, release differs | `  MISSING  worktree     linked worktree, harness 44 - main checkout is 45` — regex `^  MISSING  worktree +linked worktree.*harness 44([^0-9]\|$).*main checkout is 45([^0-9]\|$)`, and NO `^  ok       worktree` row | 1 (counted into `missing`) |

`45` is read from the fixture's own stamp at run time (`first_version`), so a
bump does not break it. The two releases are: the tree doctor runs in reads
**its own** `.claude/harness/VERSION`; "main checkout is N" reads the main
working tree's, which is `$(git rev-parse --git-common-dir)/..` (the Contract's
detection; `--git-dir` and `--git-common-dir` both read `.git` in main and
differ in a linked worktree - measured on this checkout). The main checkout
must not print `linked worktree` anywhere, and a matching linked worktree must
not print a `MISSING  worktree` row.

**Not constrained, GREEN's choice:** what follows the release number (`45` and
`45 (2026-09-20)` both match; `450` does not); which path `<path>` is (the
assertion only requires something non-empty with no comma before `, harness` -
Windows path spelling made pinning it brittle; the main checkout's path is what
the Contract means); whether the main checkout's row mentions that linked
worktrees exist; the exact wording after `MISSING  worktree` beyond the two
release numbers in that order. Where the row sits in doctor's output is not
constrained either, but it must be printed on every run, including the early
`project.conf has no commands` exit, or the unbootstrapped case has no row.

**`doctor.test.sh`** is named in `touches:` but this RED did not change it:
nothing in it asserts the absence of a `worktree` row, so it stays green once
the row exists. If GREEN wants the row covered there too, that is a RED
change, not a GREEN one.

**`refresh-harness.sh`**: no red test. See "AC-5: what it turned out to be".

### Every assertion, and what earns it

Probe ids refer to the table in the next section. "cascade" means the
assertion also went red under other probes because the mutation broke an
earlier step it depends on; the probe named is the one aimed at it.

| Block | Assertion | On arrival | Earned by |
|---|---|---|---|
| premise | this repository ignores `.claude/state/current-story.env` | pass | P6 |
| premise | and `.claude/state/last-gate-run` | pass | P6 |
| premise | but not the README that documents the directory | pass | P9 (after the `--no-index` correction, below) |
| premise | a/b: shares the main checkout's `.git` | pass | fixture guard - refuses a copied directory; shown outside the framework, below |
| premise | a/b: has its own git dir, so it is linked, not main | pass | fixture guard - the other half; a copy passes this one, which is why both are asserted |
| premise | git lists three worktrees | pass | fixture guard - a copy lists 1 |
| premise | a fresh linked worktree has no state file | pass | the measurement itself; goes red only if state became tracked, which check-boundaries.sh refuses |
| AC-1 | T-A goes to RED in worktree a, on its own branch, without --force | pass | P7 |
| AC-1 | and phase.sh says so | pass | P7 |
| AC-1 | phase.sh show in worktree b reports no active story | pass | P1 |
| AC-1 | and so does the main checkout | pass | P1 |
| AC-1 | worktree a still reports T-A / in RED | pass | P7 |
| AC-1 | T-B goes to GREEN in worktree b | pass | P7 |
| AC-1 | worktree a is unchanged: still T-A / still RED | pass | P1 |
| AC-1 | and never mentions T-B | pass | P1 (actual 4) |
| AC-1 | worktree b reports T-B / in GREEN | pass | P7 |
| AC-1 | the main checkout still has no state file | pass | P1 |
| AC-1 | a's story file says RED; b's story file says GREEN | pass | P7 |
| AC-1 | b's copy of the same story file does not; a's copy of that one does not | pass | control - no single production line can make phase.sh write into a SIBLING worktree; these pin that the fixture's worktrees are separate directories (a copy-free fixture would fail the premise block first) |
| AC-2 | T-M goes to RED in the main checkout | pass | P7 cascade (branch read from the wrong tree) |
| AC-2 | the RED worktree refuses the source write | pass | P1, P7 (not blocked at all) |
| AC-2 | and the refusal names T-A | pass | **P2** (named T-M instead) |
| AC-2 | and RED | pass | P1, P7 |
| AC-2 | the GREEN worktree beside it allows the same write | pass | **P2** (refused, naming T-M / RED) |
| AC-2 | the main checkout refuses it too, naming T-M | pass | P7 cascade |
| AC-2 | blocks: the GREEN worktree refuses a test write | pass | P2 (main's RED allows tests) |
| AC-2 | allows: the RED worktree allows the same test write | pass | control against a hook that denies everything; the generic lock is pinned by phase-guard.test.sh. Not reddened by any worktree probe |
| AC-2 | Write to source in RED is refused | pass | P1, P7 |
| AC-2 | Write to source in GREEN is allowed | pass | **P2** |
| AC-3 | gates.sh runs in worktree a | pass | precondition (rc of the run whose record is asserted next) |
| AC-3 | and records into a's story file | pass | P2 (no story found in the shared location) |
| AC-3 | the stamp is written in worktree a / and says pass | pass | **P3** |
| AC-3 | worktree b has no stamp | pass | control - no production line puts a's stamp into a sibling |
| AC-3 | the main checkout has no stamp | pass | **P3** |
| AC-3 | a's story file carries the tree hash | pass | **P8** |
| AC-3 | b's copy of the same story file does not | pass | control, as for AC-1's sibling copies |
| AC-3 | nor does the main checkout's | pass | **P8** |
| AC-3 | check-boundaries in a accepts the record it finds (rc 0) | pass | P2, P8 cascade (rc 1) |
| AC-3 | and says the record matches a's tree | pass | **P4** |
| AC-3 | for story T-A | pass | **P4** |
| AC-3 | check-boundaries in b refuses (rc 1) | pass | **P4** (judged main's tree: no story, rc 0) |
| AC-3 | because b has no tool-written record | pass | **P4** |
| AC-3 | and never claims a's record matches; it judged T-B, not T-A | pass | controls - pass under every probe including P4, where b judged main's tree and mentioned neither story |
| AC-4 | 5 positive assertions | **red** | GREEN |
| AC-4 | and not as the main checkout / no mismatch while releases match / and not as a linked worktree / and is not also reported ok | pass, **vacuously** - there is no worktree row yet | GREEN's job: see the controls table |
| AC-4 | and doctor exits 0 (twice) | pass | vacuous until the row exists; the mismatch case's `exits 1` is red now |
| AC-5 | the refresh completes | pass | control on rc; P5 cascade would refuse if main were dirty |
| AC-5 | worktree a is stamped with upstream's release | pass | **P5** (stayed 45) |
| AC-5 | a hook upstream ships arrives in worktree a | pass | **P5** |
| AC-5 | worktree b's VERSION is unchanged; worktree b did not receive the hook | pass | controls - sibling; no production line reaches it |
| AC-5 | the main checkout's VERSION is unchanged | pass | **P5** (became 99) |
| AC-5 | nor did the main checkout | pass | **P5** |
| AC-5 | 3 doctor assertions | **red** | GREEN |

### The probes: what was mutated, what went red

Every one through `bash scripts/mutate.sh FILE 'EXPR' -- bash scripts/selftest.sh
worktree`, sequentially, against this checkout; every restore verified
byte-for-byte by the script. The eight AC-4 lines are red in every run and are
elided from the pastes as `[... 8 AC-4 lines, red in every run ...]`. The
mutation in each case is the same idea: point one path at the shared `.git`'s
parent - the main checkout - which is what "the lock is not per-worktree"
would look like in code.

**P1 - `scripts/phase.sh`, the lock's path.** Reddens AC-1.

```
=== mutate: scripts/phase.sh (1 line(s) changed by s|^STATE="\$ROOT/\.claude/state/current-story\.env"$|STATE="$(cd "$ROOT" \&\& cd "$(git rev-parse --git-common-dir)/.." \&\& pwd)/.claude/state/current-story.env"|) ===
  18 - STATE="$ROOT/.claude/state/current-story.env"
  18 + STATE="$(cd "$ROOT" && cd "$(git rev-parse --git-common-dir)/.." && pwd)/.claude/state/current-story.env"
    FAIL phase.sh show in worktree b reports no active story
         expected: No active story. The phase lock is off.
         actual:   Active story
         ------------
           # Written by scripts/phase.sh — do not edit by hand.
           STORY_ID=T-A
           [...]
    FAIL and so does the main checkout
    FAIL worktree a is unchanged: still T-A
    FAIL still RED
    FAIL and never mentions T-B
         expected: 0
         actual:   4
    FAIL the main checkout still has no state file
         expected: no
         actual:   yes
    FAIL the RED worktree refuses the source write
         not blocked at all
    [... AC-2/AC-3 cascade, 8 AC-4 lines ...]
worktree: 50 passed, 23 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_phase.sh.20260921T202122Z.2861564.bak) ===
  18: STATE="$ROOT/.claude/state/current-story.env"
```

**P2 - `.claude/hooks/lib.sh`, the hook's state path.** Reddens AC-2 in both
directions, because the main checkout has T-M in RED: the GREEN worktree is
refused and the refusal names the wrong story.

```
=== mutate: .claude/hooks/lib.sh (1 line(s) changed by s|^STATE_FILE="\$HARNESS_ROOT/\.claude/state/current-story\.env"$|STATE_FILE="$(cd "$HARNESS_ROOT" \&\& cd "$(git rev-parse --git-common-dir)/.." \&\& pwd)/.claude/state/current-story.env"|) ===
  12 - STATE_FILE="$HARNESS_ROOT/.claude/state/current-story.env"
  12 + STATE_FILE="$(cd "$HARNESS_ROOT" && cd "$(git rev-parse --git-common-dir)/.." && pwd)/.claude/state/current-story.env"
    FAIL and the refusal names T-A
    FAIL the GREEN worktree beside it allows the same write
         expected:
         actual:   BLOCKED by the harness phase lock.    story:    T-M   phase:    RED   path:     src/main.ts   category: source  [...]
    FAIL blocks: the GREEN worktree refuses a test write
         not blocked at all
    FAIL Write to source in GREEN is allowed
         expected:
         actual:   BLOCKED by the harness phase lock.    story:    T-M   phase:    RED   path:     src/main.ts   [...]
    FAIL and records into a's story file
    FAIL a's story file carries the tree hash
    FAIL check-boundaries in a accepts the record it finds
    FAIL and says the record matches a's tree
    [... 8 AC-4 lines, red in every run ...]
worktree: 57 passed, 16 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/.claude_hooks_lib.sh.20260921T202352Z.2869156.bak) ===
  12: STATE_FILE="$HARNESS_ROOT/.claude/state/current-story.env"
```

**P3 - `scripts/gates.sh`, the stamp path.** Reddens AC-3's stamp half.

```
=== mutate: scripts/gates.sh (1 line(s) changed by s|^STAMP="\$ROOT/\.claude/state/last-gate-run"$|STAMP="$(cd "$ROOT" \&\& cd "$(git rev-parse --git-common-dir)/.." \&\& pwd)/.claude/state/last-gate-run"|) ===
  45 - STAMP="$ROOT/.claude/state/last-gate-run"
  45 + STAMP="$(cd "$ROOT" && cd "$(git rev-parse --git-common-dir)/.." && pwd)/.claude/state/last-gate-run"
    FAIL the stamp is written in worktree a
         expected: yes
         actual:   no
    FAIL and says pass
    FAIL the main checkout has no stamp
         expected: no
         actual:   yes
    [... 8 AC-4 lines, red in every run ...]
worktree: 62 passed, 11 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_gates.sh.20260921T202626Z.2876425.bak) ===
  45: STAMP="$ROOT/.claude/state/last-gate-run"
```

**P4 - `scripts/check-boundaries.sh`, the tree it judges.** Reddens AC-3's
check-boundaries half, both worktrees: each judged the main checkout's tree,
where no story claims `master`, and exited 0 with nothing to say.

```
=== mutate: scripts/check-boundaries.sh (1 line(s) changed by s|^cd "\$ROOT"$|cd "$(cd "$ROOT" \&\& cd "$(git rev-parse --git-common-dir)/.." \&\& pwd)"|) ===
  21 - cd "$ROOT"
  21 + cd "$(cd "$ROOT" && cd "$(git rev-parse --git-common-dir)/.." && pwd)"
    FAIL and says the record matches a's tree
    FAIL for story T-A
    FAIL check-boundaries in b refuses
         expected: 1
         actual:   0
    FAIL because b has no tool-written record
    [... 8 AC-4 lines, red in every run ...]
worktree: 61 passed, 12 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_check-boundaries.sh.20260921T202812Z.2882167.bak) ===
  21: cd "$ROOT"
```

**P5 - `scripts/refresh-harness.sh`, the tree it refreshes.** Reddens AC-5:
the refresh landed in the main checkout instead.

```
=== mutate: scripts/refresh-harness.sh (1 line(s) changed by s|^PROJ="\$(pwd)"$|PROJ="$(cd "$(git rev-parse --git-common-dir)/.." \&\& pwd)"|) ===
  67 - PROJ="$(pwd)"
  67 + PROJ="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"
    FAIL worktree a is stamped with upstream's release
         expected: 99 (2099-01-01)
         actual:   45 (2026-09-20)
    FAIL a hook upstream ships arrives in worktree a
         expected: yes
         actual:   no
    FAIL the main checkout's VERSION is unchanged
         expected: 45 (2026-09-20)
         actual:   99 (2099-01-01)
    FAIL nor did the main checkout
         expected: no
         actual:   yes
    [... 8 AC-4 lines, red in every run ...]
worktree: 61 passed, 12 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_refresh-harness.sh.20260921T203050Z.2891448.bak) ===
  67: PROJ="$(pwd)"
```

**P6 - `.gitignore`, the ignore rule.** Reddens the premise.

```
=== mutate: .gitignore (1 line(s) changed by s|^\.claude/state/\*$|.claude/state-probe/*|) ===
  2 - .claude/state/*
  2 + .claude/state-probe/*
    FAIL this repository ignores .claude/state/current-story.env
         expected: 0
         actual:   1
    FAIL and .claude/state/last-gate-run
         expected: 0
         actual:   1
    [... 8 AC-4 lines, red in every run ...]
worktree: 63 passed, 10 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/.gitignore.20260921T203357Z.2902464.bak) ===
  2: .claude/state/*
```

**P7 - `scripts/phase.sh`, which tree's branch the transition guard reads.**
Reddens "set works in a worktree without --force" and everything downstream.

```
=== mutate: scripts/phase.sh (1 line(s) changed by s#^  cur="\$(git -C "\$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"$#  cur="$(git -C "$(cd "$ROOT" \&\& cd "$(git rev-parse --git-common-dir)/.." \&\& pwd)" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"#) ===
  95 -   cur="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  95 +   cur="$(git -C "$(cd "$ROOT" && cd "$(git rev-parse --git-common-dir)/.." && pwd)" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
    FAIL T-A goes to RED in worktree a, on its own branch, without --force
         expected: 0
         actual:   1
    FAIL and phase.sh says so
    FAIL worktree a still reports T-A
    FAIL in RED
    FAIL T-B goes to GREEN in worktree b
    FAIL a's story file says RED
         expected: RED
         actual:   PLANNED
    FAIL b's story file says GREEN
         expected: GREEN
         actual:   PLANNED
    [... AC-2/AC-3 cascade, 8 AC-4 lines ...]
worktree: 43 passed, 30 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_phase.sh.20260921T203713Z.2912400.bak) ===
  95:   cur="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
```

**P8 - `scripts/gates.sh`, which tree's story file receives the record.**
Reddens the story-file half of AC-3.

```
=== mutate: scripts/gates.sh (1 line(s) changed by s|^STORY_FILE="\$ROOT/docs/backlog/stories/\$STORY\.md"$|STORY_FILE="$(cd "$ROOT" \&\& cd "$(git rev-parse --git-common-dir)/.." \&\& pwd)/docs/backlog/stories/$STORY.md"|) ===
  221 - STORY_FILE="$ROOT/docs/backlog/stories/$STORY.md"
  221 + STORY_FILE="$(cd "$ROOT" && cd "$(git rev-parse --git-common-dir)/.." && pwd)/docs/backlog/stories/$STORY.md"
    FAIL a's story file carries the tree hash
         expected: 1
         actual:   0
    FAIL nor does the main checkout's
         expected: 0
         actual:   1
    FAIL check-boundaries in a accepts the record it finds
    FAIL and says the record matches a's tree
    [... 8 AC-4 lines, red in every run ...]
worktree: 61 passed, 12 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_gates.sh.20260921T203833Z.2915558.bak) ===
  221: STORY_FILE="$ROOT/docs/backlog/stories/$STORY.md"
```

**P9 - `.gitignore`, the README negation.** The control for P6. Its first run
did NOT go red: `git check-ignore` never reports a tracked file as ignored, so
the control was satisfied by the README being tracked, not by the rule. The
three premise calls were corrected to `--no-index` (the rules, not the index;
identical answers for the two untracked state files) and P6 and P9 re-run
against the corrected file:

```
=== mutate: .gitignore (1 line(s) changed by s|^\.claude/state/\*$|.claude/state-probe/*|) ===
  2 - .claude/state/*
  2 + .claude/state-probe/*
    FAIL this repository ignores .claude/state/current-story.env
         expected: 0
         actual:   1
    FAIL and .claude/state/last-gate-run
         expected: 0
         actual:   1
    [... 8 AC-4 lines, red in every run ...]
worktree: 63 passed, 10 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/.gitignore.20260921T204559Z.2937094.bak) ===
  2: .claude/state/*

=== mutate: .gitignore (1 line(s) changed by s|^!\.claude/state/README\.md$|# probe: negation removed|) ===
  4 - !.claude/state/README.md
  4 + # probe: negation removed
    FAIL but not the README that documents the directory
         expected: 1
         actual:   0
    [... 8 AC-4 lines, red in every run ...]
worktree: 64 passed, 9 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/.gitignore.20260921T204835Z.2944925.bak) ===
  4: !.claude/state/README.md
```

The final baseline of the corrected file is the block pasted at the top of
this section (65 passed, 8 failed), re-run after the edit.

**Probes P1-P5, P7 and P8 were run against the suite before that `--no-index`
edit.** The edit touched only the three `check-ignore` lines in the premise
block; no assertion those probes redden reads them.

### A copied directory fails the premise block

Run outside the framework (the same two `rev-parse` questions, against
`cp -r` of a fixture), so that the fixture guards are not merely asserted:

```
main .git:          /tmp/tmp.OPtk8sbQ03/.git
copy --git-common:  /tmp/tmp.S5WR1nVOTt/a/.git
copy --git-dir:     /tmp/tmp.S5WR1nVOTt/a/.git
shares the main checkout's .git: WOULD FAIL (expected: /tmp/tmp.OPtk8sbQ03/.git, actual: /tmp/tmp.S5WR1nVOTt/a/.git)
has its own git dir (copy): would pass - which is why BOTH halves are asserted
worktree list lines: 1
```

### Negative controls: expected values

No threshold in this suite - every criterion is mechanical - so the controls
are counts that must read 0, and they are the ones that cannot be earned in
RED because the row they guard does not exist yet. Their value is 0 today
**vacuously**. GREEN confirms each against the shipped doctor by mutating it
and watching the control alone go red:

| Control (AC-4) | Expected | Measured in RED | Meaning once the row exists | GREEN's probe |
|---|---|---|---|---|
| linked worktree: `^  ok       worktree +main checkout` count | 0 | 0 (no row at all) | detection is not inverted | swap the `--git-dir`/`--git-common-dir` comparison; both "not as" controls must go red |
| main checkout: lines containing `linked worktree` | 0 | 0 (vacuous) | same, other direction | same probe |
| linked worktree, same release: `^  MISSING  worktree` count | 0 | 0 (vacuous) | the mismatch row is conditional | make the MISSING row unconditional; this control and both `exits 0` must go red |
| mismatch: `^  ok       worktree` count | 0 | 0 (vacuous) | ok and MISSING are exclusive | print both rows on mismatch; must go red |
| `and doctor exits 0` (linked, same release; main) | 0 | 0 (vacuous: nothing is counted into `missing`) | the row does not count into `missing` when it is ok | count the ok row into `missing`; must go red |

### AC-5: what it turned out to be, and the one thing GREEN should not do

`refresh-harness.sh` run inside a linked worktree **works on that worktree
alone** - measured, not assumed: its tree is `$(pwd)`, every path it writes is
under it, and its git calls (`status`, `hash-object`, `cat-file -e` on
upstream) share nothing between worktrees. So the outcome pinned is "works":
rc 0, that worktree stamped, the hook delivered, the other worktree's and the
main checkout's `VERSION` byte-identical. P5 shows the assertions discriminate.

**Consequence for the Contract.** It says refresh "gains one refusal or one
note, whichever the RED investigation shows is correct". The investigation
shows it works, and AC-5's "works" branch requires nothing be printed. **There
is therefore no failing test behind a note**, and a refusal would turn this
suite red (`the refresh completes` expects 0). If the orchestrator wants a
note ("this is a linked worktree; the main checkout at X stays on release N"),
that is a sentence the AC does not require and a test does not demand - say
so, and it comes back to RED for one assertion. Left as GREEN's choice
otherwise: the suite does not constrain refresh's output at all. The mismatch
the refresh leaves behind IS reported, by AC-4's row, which is the mechanism
the story asked for.

One thing seen and not pinned: on this machine the refresh always prints
`upstream ships a different refresh-harness.sh; running that one`, because
`autocrlf` checks the worktree out CRLF while the upstream fixture's copy is
LF, so `cmp` differs. Harmless, Windows-only, and not a worktree property.

### Discoveries

- **The Context measurement reproduced** (see `## Test plan`), with one
  detail: a fresh linked worktree's `.claude/state/` holds `.gitkeep` as well
  as `README.md`; the story's `ls` without `-A` hid it. Nothing turns on it.
- **`git check-ignore` and tracked files** - above. A control that names a
  rule must ask the rule (`--no-index`); the default asks the index, and a
  tracked file is never "ignored" whatever the rules say. Worth knowing for any
  future guard over `.gitignore`.
- **Three trees, not two, in AC-2.** The main checkout carries a third story
  (T-M, RED) during that block because a hook reading a shared location finds
  no state at all when main is idle - and "allows everything" satisfies the
  allow-half of AC-2. With main in RED the shared-read mutation refuses in
  GREEN and names T-M, which is the failure the criterion is about.
- **`.claude/state/mutations/` held four `scripts_plan.sh.*.bak/.new` files
  from 00:16 today before this RED started.** Not mine; my nine probes cleaned
  up after themselves (`ls` after the chain shows only those four and `log`).
  rules.md says a leftover `.bak` means a restore failed and exited 90 - that
  session's story should say what happened.
- **No timeout to budget**: `selftest.sh` has none, and CI runs it directly.
  The suite is process-spawn bound (six `doctor` runs, two `check-boundaries`,
  three `phase.sh show` on an active story at ~8 s each here).

## Regressions

### R-1. Return from GREEN, 2026-09-22. `.claude/tests/sigpipe.test.sh`, the C-5 freshness census.

**Which test, and what it asserted.** `sigpipe.test.sh`'s `DISCARDED` list is
twelve `file:line:needle` triples naming real lines of this tree whose `$(...)`
exit status is discarded — the shape `check-sigpipe.sh` must NOT flag. Two
assertions stand on it: a FRESHNESS one (each line still holds its needle) and
an EXCLUSION one (the guard reports none of them). Freshness exists so the
exclusion assertion cannot go vacuous by pointing at lines that have moved.

Two of the twelve named `scripts/doctor.sh`:

    scripts/doctor.sh:39:hv="$(grep
    scripts/doctor.sh:62:BOOTSTRAPPED="$(grep

**What is wrong with it.** Nothing, in the sense that matters: the assertion is
correct and it caught what it was built to catch. GREEN added the `worktree`
row to `scripts/doctor.sh` and extracted `release_of()`, which moved both
lines. The census now points at a function header and a comment:

    FAIL C-5 freshness: all twelve status-discarded lines are still where this suite says they are
         scripts/doctor.sh:39 no longer holds [hv="$(grep] - it holds: release_of() { # <tree> - its harness stamp: first non-comment, non-blank line
         scripts/doctor.sh:62 no longer holds [BOOTSTRAPPED="$(grep] - it holds: # 2.55.0.windows.5: both print the bare string `.git` in the main checkout and
    sigpipe: 81 passed, 1 failed

This is a STALE FIXTURE, which is precisely the state the freshness assertion
was written to report rather than sail past. The guard itself is unaffected:
`check-sigpipe.sh` reports `scanned 39 shell file(s), 37 with pipefail, 0
finding(s)` against the tree, and C-5's exclusion assertion still passes.

**How it was found.** `bash scripts/selftest.sh` at the end of GREEN: 1 of 18
suites failed, and it was `sigpipe`, not `worktree` (which is 73/0). Reproduced
by the orchestrator at the start of this return.

**Why this is a return to RED rather than a fix in place.** `sigpipe.test.sh`
is a test file, frozen in GREEN and frozen in GATES. `rules.md`: "a gate
failure whose only legal fix is a write the current phase forbids is a return
to RED, not a reason to route around the lock." The alternative — reshuffling
`doctor.sh` so lines 39 and 62 stay byte-identical — was offered by the
feature-developer and REFUSED by the orchestrator; the reasoning is PO-G in
`## Notes`. In short it would force the two VERSION stamps that are compared to
each other to be read by two separate inline copies, which is the defect
`release_of()` exists to prevent.

**What it should assert instead.** The same two properties, pointed at where
those lines now live:

    scripts/doctor.sh:39:hv="$(grep            ->  scripts/doctor.sh:41:v="$(grep
    scripts/doctor.sh:62:BOOTSTRAPPED="$(grep  ->  scripts/doctor.sh:113:BOOTSTRAPPED="$(grep

Line 41 is the same `grep … VERSION … | head -1` read that was on line 39,
moved bodily into `release_of()`. Line 113 is the same `BOOTSTRAPPED=` read,
displaced by the 53 lines the worktree row added above it.

**The census is a SAMPLE, not an enumeration, so nothing is added.** Checked
before deciding the remit: `scripts/doctor.sh:149`,
`wf_all="$(cat "$WFDIR"/*.yml 2>/dev/null)"`, is a status-discarded
substitution that predates this story and has never been in the twelve. The
list is a curated set of real instances used to prove the exclusion rule, not a
claim that the tree holds exactly twelve. So the new substitutions GREEN
introduced (`doctor.sh:44`, `:71`, `:72`, `:78`, `:79`) do not need entries,
and "twelve" stays twelve.

**What earns the corrected assertion.** "Watch it fail" cannot apply: the code
whose absence would make it fail is not absent — `doctor.sh` already holds both
lines, so the corrected census passes on its first execution and every one
after, whether or not it asserts anything. Earned by PROBE instead, per
`rules.md`: mutate the specific production behaviour each entry pins — the
presence of that needle on that line number — and watch that one assertion go
red. Output pasted below.

**The change, in full.** Two lines of `.claude/tests/sigpipe.test.sh`'s
`DISCARDED` list. Nothing else in the file, and no production file:

    -scripts/doctor.sh:39:hv="$(grep
    -scripts/doctor.sh:62:BOOTSTRAPPED="$(grep
    +scripts/doctor.sh:41:v="$(grep
    +scripts/doctor.sh:113:BOOTSTRAPPED="$(grep

**The probes.** Three, run by the orchestrator through `scripts/mutate.sh`,
which is permitted in RED because it restores the file and verifies the restore
with `cmp`. Each mutation is behaviour-preserving — a space inserted after
`$(`, or a comment line — so that what goes red is the census entry and not
`doctor.sh` breaking.

**Probe A — break the needle on line 41.** The corrected entry must be pinned
to that line's CONTENT, not merely present in the list.

    === mutate: scripts/doctor.sh (1 line(s) changed by 41s/v="\$(grep/v="$( grep/) ===
    === mutate: running bash scripts/selftest.sh sigpipe ===
        FAIL C-5 freshness: all twelve status-discarded lines are still where this suite says they are
               scripts/doctor.sh:41 no longer holds [v="$(grep] - it holds:   v="$( grep -vE '^[[:space:]]*#|^[[:space:]]*$' "$1/.claude/harness/VERSION" 2>/dev/null | head -1)"
    sigpipe: 81 passed, 1 failed
    === mutate: command exited 1; restored (verified byte-for-byte against .../scripts_doctor.sh.20260922T190110Z.53493.bak) ===

One assertion red, naming line 41 alone. C-5's exclusion assertion ("and the
guard reports none of them") stayed green, so the two are independent.

**Probe B — break the needle on line 113.** The same, for the other entry.

    === mutate: scripts/doctor.sh (1 line(s) changed by 113s/BOOTSTRAPPED="\$(grep/BOOTSTRAPPED="$( grep/) ===
    === mutate: running bash scripts/selftest.sh sigpipe ===
        FAIL C-5 freshness: all twelve status-discarded lines are still where this suite says they are
               scripts/doctor.sh:113 no longer holds [BOOTSTRAPPED="$(grep] - it holds: BOOTSTRAPPED="$( grep -E '^BOOTSTRAPPED=' "$CONF" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '[:space:]')"
    sigpipe: 81 passed, 1 failed
    === mutate: command exited 1; restored (verified byte-for-byte against .../scripts_doctor.sh.20260922T190911Z.80931.bak) ===

**Probe C — REAL DRIFT, which is the failure this entry actually suffered.**
A and B prove each entry reads its own line's content. Neither reproduces what
went wrong: the lines MOVED. One inserted line above 41 shifts everything below
it, and both entries must go stale together — the original failure, induced
deliberately.

    === mutate: scripts/doctor.sh (222 line(s) changed by 40i\ ...) ===
    === mutate: running bash scripts/selftest.sh sigpipe ===
        FAIL C-5 freshness: all twelve status-discarded lines are still where this suite says they are
               scripts/doctor.sh:41 no longer holds [v="$(grep] - it holds:   local v
               scripts/doctor.sh:113 no longer holds [BOOTSTRAPPED="$(grep] - it holds: printf '\nProject toolchain (from project.conf)\n'
    sigpipe: 81 passed, 1 failed
    === mutate: command exited 1; restored (verified byte-for-byte against .../scripts_doctor.sh.20260922T191704Z.114325.bak) ===

This is the one that matters. A census whose entries each pass a content check
could still be blind to drift if it resolved lines by searching rather than by
number; C shows it does not, and that the corrected entries are as sensitive to
movement as the ones they replace. `222 line(s) changed` is `diff`'s count of a
one-line insertion shifting the remainder, not 222 edits.

After all three, `.claude/state/mutations/` holds `log` and no `.bak` — every
restore succeeded and was verified.

**Note on who ran what.** The test-developer made the two-line change and
started Probe A; its dispatch ended while that run was still in flight, leaving
`scripts/doctor.sh` mutated and no output recorded. The orchestrator waited for
that run to complete and restore rather than interrupting it — a second
mutation against a file already under one is how a mutated production file gets
committed — then ran all three probes itself and pasted the output above. The
in-flight run's own restore is in the log at `20260922T185258Z`, `restored
(verified)`.



### R-2. Return from REVIEW, 2026-09-22. `.claude/tests/worktree.test.sh`, the AC-3 block was environment-dependent.

**How it was found: the PR's own CI, which is the only machine that could.**
PR #76's `gates` job failed where every local run had passed. Seventeen suites
green, then:

    === worktree ===
      AC-3: the gate record belongs to the worktree that ran the gates
        FAIL and says the record matches a's tree      expected: 1  actual: 0
        FAIL for story T-A                             expected: 1  actual: 0
        FAIL check-boundaries in b refuses             expected: 1  actual: 0
        FAIL because b has no tool-written record      expected: 1  actual: 0
    worktree: 69 passed, 4 failed
    1 of 18 harness suite(s) FAILED.

Local, same commit: `worktree: 73 passed, 0 failed`.

**What was wrong with it.** `check-boundaries.sh:179` reads

    br="${GITHUB_HEAD_REF:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null)}"

deliberately, so that on CI it can name the PR's branch from a detached merge
commit. Under Actions that variable is set for the WHOLE JOB. The suite's
fixture worktrees are on `story/T-A-fixture` and `story/T-B-fixture`, so a
fixture run inherited the real branch being built, looked for HARNESS-008's
story inside a fixture that has only T-A and T-B, found none, and **skipped its
story checks entirely** - exiting 0 having judged nothing.

**The dangerous half is the control, not the positive.** Three of the four reds
are missing `ok` lines, which is merely wrong. The fourth is
`check-boundaries in b refuses`, which expects rc 1: the control that proves a
gate run in worktree `a` does not satisfy worktree `b`. A skipped run exits 0,
so on CI that control was being satisfied by a command that never judged
anything. It is the AC-3 control asserting the story's central claim, and in the
one environment that matters it was vacuous.

**How the defect was confirmed, not inferred.** One variable changed on this
machine:

    $ GITHUB_HEAD_REF=story/HARNESS-008-one-phase-lock-per-worktree-so-two-stori \
        bash scripts/selftest.sh worktree
        FAIL and says the record matches a's tree
        FAIL for story T-A
        FAIL check-boundaries in b refuses
        FAIL because b has no tool-written record
    worktree: 69 passed, 4 failed

Byte-for-byte CI's result, from setting that one variable.

**What it asserts now.** `run_in` - the single helper every fixture command goes
through - clears `GITHUB_HEAD_REF` and `PR_HEAD_SHA` before running anything.
Cleared for every command rather than only for `check-boundaries.sh`: those two
are the only ambient variables any harness script or hook reads, verified by
grep over `scripts/` and `.claude/hooks/`, and a fixture is never the CI
checkout, so no case exists where inheriting one is correct. The fix is in the
suite, not in `check-boundaries.sh`, whose use of the variable is deliberate and
documented for the real CI path.

    $ bash scripts/selftest.sh worktree                    # clean env
    worktree: 73 passed, 0 failed
    $ GITHUB_HEAD_REF=... PR_HEAD_SHA=5d19583 bash scripts/selftest.sh worktree
    worktree: 73 passed, 0 failed

**What earns it.** "Watch it fail" cannot apply - the implementation exists and
is correct. Green under both environments is also not enough on its own: the
suite could now be passing because it is skipping something else. So the probe
asks the sharper question - do those assertions have TEETH in the environment
where they had none? The production refusal the control reads
(`check-boundaries.sh:324`) was neutered, **under the simulated CI environment**:

    ##### PROBE: neuter the refusal AC-3's control reads, UNDER SIMULATED CI #####
    === mutate: scripts/check-boundaries.sh (1 line(s) changed by 324s/problem "story \$sid: ## Gate results was not written/ok "story $sid: ## Gate results was NOT written/) ===
    === mutate: running bash scripts/selftest.sh worktree ===
        FAIL check-boundaries in b refuses
        FAIL because b has no tool-written record
    worktree: 71 passed, 2 failed
    === mutate: command exited 1; restored (verified byte-for-byte against .../scripts_check-boundaries.sh.20260923T004454Z.16667.bak) ===

Exactly the two control assertions, red only because the behaviour they pin
broke - with `GITHUB_HEAD_REF` set, which is precisely the condition under which
they previously could not fail at all. Restored and verified.

**GREEN was a no-op.** No production file changed; `scripts/doctor.sh` is
untouched. The gates were re-run because
`.claude/tests/worktree.test.sh` is a gated path and the recorded tree hash had
to describe the new commit.

**The general lesson, which is bigger than this suite.** A test that drives a
script must control that script's environment. This one inherited two variables
from its runner and, in the runner that gates the PR, silently stopped
asserting. It is the same shape as PO-M in `## Notes` - the local instrument and
CI disagreeing - and the same shape as release 41's rule about fixtures: green
everywhere the author looked, and blind in the place that counts.

## Gate results

<!-- gates.sh: written by bash scripts/gates.sh; do not edit or paste by hand -->

    run:    2026-09-23T00:50:05Z
    commit: 5d19583 (working tree had uncommitted changes)
    tree:   d1504b18e6ef6e27f736220a465dfc585ef102d2
    result: pass (0 ran, 8 unconfigured, 0 known)

    UNCONFIGURED format
    UNCONFIGURED lint
    UNCONFIGURED typecheck
    UNCONFIGURED unit
    UNCONFIGURED coverage
    UNCONFIGURED integration
    UNCONFIGURED build
    UNCONFIGURED mutation

## Gate probes

<!-- REQUIRED if this story adds or changes a gate, its command, or its
     evidence line. Omit the section entirely otherwise.
     A gate that has never been observed to fail is not a gate: break the thing
     it guards, run the gate, paste the failure, revert. One block per gate:
       * what was broken, and where
       * the gate output proving it failed
       * confirmation the probe was reverted -->

**This story adds no gate.** `required_gates` is empty and every `project.conf`
gate is `<unconfigured>` (PO decision 1). What this section carries instead is
the obligation RED deferred to GREEN: the five AC-4 negative controls in
`## Handoff` -> "Negative controls: expected values", each of which read 0
**vacuously** in RED because the row it guards did not exist. rules.md requires
them measured against the shipped module, and this is where the measurement
lives.

All four probes ran as `bash scripts/mutate.sh scripts/doctor.sh '<EXPR>' --
bash scripts/selftest.sh worktree`, one at a time, against the shipped
`scripts/doctor.sh`. Every restore was verified byte-for-byte by `mutate.sh`
and is pasted with its probe; `ls .claude/state/mutations/` after the chain
shows `log` only - no `.bak`, no `.new`. The green baseline either side of the
chain is `worktree: 73 passed, 0 failed`.

### Control 1 and 2 - detection is not inverted

Controls: `and not as the main checkout` (a linked worktree must print no
`^  ok       worktree +main checkout` row) and `and not as a linked worktree`
(the main checkout must print no line containing `linked worktree` anywhere).
Probe: swap the `--git-dir`/`--git-common-dir` comparison, which is what "the
detection is backwards" looks like in code.

```
=== mutate: scripts/doctor.sh (1 line(s) changed by s|^  if \[ "\$wt_gitdir" = "\$wt_common" \]; then$|  if [ "$wt_gitdir" != "$wt_common" ]; then|) ===
  74 -   if [ "$wt_gitdir" = "$wt_common" ]; then
  74 +   if [ "$wt_gitdir" != "$wt_common" ]; then
  AC-4: doctor names the worktree it is in, and whether its release matches
    FAIL a linked worktree is named as one, with its release
         expected: 1
         actual:   0
    FAIL and not as the main checkout
         expected: 0
         actual:   1
    FAIL the main checkout is named as one, with its release
         expected: 1
         actual:   0
    FAIL and not as a linked worktree
         expected: 0
         actual:   1
    FAIL a linked worktree behind the main checkout is MISSING, naming both releases
         expected: 1
         actual:   0
    FAIL and is not also reported ok
         expected: 0
         actual:   1
    FAIL and doctor exits 1 on the mismatch
         expected: 1
         actual:   0
    FAIL the main checkout reads its own stamp, not the linked worktree's
         expected: 1
         actual:   0
  AC-5: refresh-harness.sh inside a linked worktree works on that worktree alone
    FAIL doctor in the refreshed worktree reports the mismatch the refresh produced
    FAIL and exits 1
    FAIL doctor in the main checkout still reports its own release as ok
worktree: 62 passed, 11 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_doctor.sh.20260922T162843Z.3901164.bak) ===
  74:   if [ "$wt_gitdir" = "$wt_common" ]; then
```

Both named controls went red, each with `actual: 1`. **One result beyond what
the handoff predicted:** `and is not also reported ok` also went red. With the
comparison inverted, the mismatch case (worktree `a` stamped 44) takes the
main-checkout branch and prints `ok ... main checkout, harness 44`, so an `ok`
row appears where only a `MISSING` one should. It is a genuine red for that
control, not a miscount - but Control 4's own probe below is the one aimed at
it, and it is sharper.

### Control 3 - the mismatch row is conditional

Control: `no mismatch is reported while the releases match` (0) and, beside it,
`and doctor exits 0` for a linked worktree on the same release. Probe: make the
release comparison unsatisfiable, so the `MISSING` branch is taken
unconditionally.

```
=== mutate: scripts/doctor.sh (1 line(s) changed by s|^    if \[ "\$hv" = "\$main_hv" \]; then$|    if [ "$hv" = "no such release" ]; then|) ===
  80 -     if [ "$hv" = "$main_hv" ]; then
  80 +     if [ "$hv" = "no such release" ]; then
  AC-4: doctor names the worktree it is in, and whether its release matches
    FAIL a linked worktree is named as one, with its release
         expected: 1
         actual:   0
    FAIL no mismatch is reported while the releases match
         expected: 0
         actual:   1
    FAIL and doctor exits 0
         expected: 0
         actual:   1
worktree: 70 passed, 3 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_doctor.sh.20260922T163057Z.3906969.bak) ===
  80:     if [ "$hv" = "$main_hv" ]; then
```

**Divergence from the handoff, and it is structural rather than a defect.** The
handoff's controls table predicted that this probe would redden "this control
and **both** `exits 0`". It reddens one of them. The main checkout's `and exits
0` is unreachable from this mutation: the main checkout never evaluates the
release comparison at all - it takes the `wt_gitdir = wt_common` branch, which
has no `MISSING` variant, because there is no second tree to be behind. Nothing
is wrong with the assertion; the prediction was made before the code existed
and assumed one shared condition where there are two branches. The main
checkout's `and exits 0` is earned by Control 5's probe below, which does reach
it.

### Control 4 - `ok` and `MISSING` are mutually exclusive

Control: `and is not also reported ok` (on a mismatch, zero
`^  ok       worktree` rows). Probe: print the `ok` row as well as the
`MISSING` one, by turning the mismatch block's first continuation line into an
`ok` row.

```
=== mutate: scripts/doctor.sh (1 line(s) changed by s|^      printf .*the main checkout is .*$|      echo "  ok       worktree     linked worktree of ${main_tree:-$wt_common}, harness ${hv:-unstamped}"|) ===
  86 -       printf '  %-10s   the main checkout is %s\n' "" "${main_tree:-$wt_common}"
  86 +       echo "  ok       worktree     linked worktree of ${main_tree:-$wt_common}, harness ${hv:-unstamped}"
  AC-4: doctor names the worktree it is in, and whether its release matches
    FAIL and is not also reported ok
         expected: 0
         actual:   1
worktree: 72 passed, 1 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_doctor.sh.20260922T163254Z.3913518.bak) ===
  86:       printf '  %-10s   the main checkout is %s\n' "" "${main_tree:-$wt_common}"
```

Exactly one assertion red, and it is the control. Nothing else in the suite
moved: the `MISSING` row still printed, doctor still exited 1, and the extra
`ok` row is the only difference. That is the sharpest form this evidence can
take.

### Control 5 - an `ok` row does not count into `missing`

Control: both `and doctor exits 0` assertions (linked worktree on the same
release; the main checkout). Probe: count each `ok` row into `missing`, which
is the historical defect `doctor.test.sh`'s own header records, pointed the
other way - a row that says `ok` while the exit status says otherwise.

```
=== mutate: scripts/doctor.sh (2 line(s) changed by s|^\( *\)"worktree" \(.*\)"\${hv:-unstamped}"$|\1"worktree" \2"${hv:-unstamped}"; missing=$((missing+1))|) ===
  76 -       "worktree" "${hv:-unstamped}"
  76 +       "worktree" "${hv:-unstamped}"; missing=$((missing+1))
  82 -         "worktree" "${main_tree:-$wt_common}" "${hv:-unstamped}"
  82 +         "worktree" "${main_tree:-$wt_common}" "${hv:-unstamped}"; missing=$((missing+1))
  AC-4: doctor names the worktree it is in, and whether its release matches
    FAIL and doctor exits 0
         expected: 0
         actual:   1
    FAIL and exits 0
         expected: 0
         actual:   1
worktree: 71 passed, 2 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_doctor.sh.20260922T163537Z.3920902.bak) ===
  76:       "worktree" "${hv:-unstamped}"
  82:         "worktree" "${main_tree:-$wt_common}" "${hv:-unstamped}"
```

Both, including the one Control 3's probe could not reach. The mutation
deliberately leaves the `MISSING` branch's own `missing=$((missing+1))` alone,
so the two reds are the `ok` rows and nothing else.

### Observed while probing, NOT fixed here, and not a gate

`doctor.sh` has an early `exit 0` on the `project.conf has no commands` path,
and it exits 0 there **whatever `missing` has reached**. The worktree row is
printed above that exit, as the handoff requires, so an unbootstrapped tree
does get the row - but in an unbootstrapped tree a release mismatch prints
`MISSING  worktree ...` and doctor still exits 0. Measured on this repository
(`BOOTSTRAPPED=no`), in a throwaway `git worktree add -d` with its VERSION
rewritten to `44 (2026-09-01)`:

```
  MISSING  worktree     linked worktree, harness 44 (2026-09-01) - main checkout is 45 (2026-09-20)
rc=0
```

It is **pre-existing**, not introduced here: the CI block above that exit
increments `missing` the same way, so a project with a broken workflow and no
stack yet has always been told so and then given a 0. No test in this story
reaches it - the AC-4 fixture has a gate in its `project.conf`, so it runs to
the end, where `missing > 0` exits 1, and that is the assertion that passes.
Left alone deliberately: no failing test demands it, and changing an exit
status nothing asserts is production code the law does not allow GREEN to
write. It wants its own story.

### BLOCKER handed back to the orchestrator: a frozen suite's line census drifted

**GREEN cannot clear this, and it is not a gate probe.** Recorded here because
it is the only section GREEN owns and the next agent needs it.

`bash scripts/selftest.sh worktree` is `73 passed, 0 failed`. The full
`bash scripts/selftest.sh` is `1 of 18 harness suite(s) FAILED`, and the
failing suite is **`sigpipe`**, not `worktree`:

```
  C-5: the twelve status-discarded lines in this tree are excluded by the rule, not by markers
    FAIL C-5 freshness: all twelve status-discarded lines are still where this suite says they are
         expected: 12 lines, none stale
         actual:   12 lines,
           scripts/doctor.sh:39 no longer holds [hv="$(grep] - it holds: release_of() { # <tree> - its harness stamp: first non-comment, non-blank line
           scripts/doctor.sh:62 no longer holds [BOOTSTRAPPED="$(grep] - it holds: # 2.55.0.windows.5: both print the bare string `.git` in the main checkout and

sigpipe: 81 passed, 1 failed
```

`.claude/tests/sigpipe.test.sh:565-566` hard-codes two lines of
`scripts/doctor.sh` in its `DISCARDED` census, and adding the worktree row
moved both. The guard itself is unaffected -
`bash scripts/check-sigpipe.sh` still reports `scanned 39 shell file(s), 37
with pipefail, 0 finding(s)` against the shipped `doctor.sh`, and the second
C-5 assertion (`and the guard reports none of them`) still passes. What failed
is the suite's own freshness check, which exists to fail loudly rather than let
the exclusion assertion go vacuous. It is doing its job.

The census is stale by exactly two lines:

    scripts/doctor.sh:39:hv="$(grep            ->  scripts/doctor.sh:41:v="$(grep
    scripts/doctor.sh:62:BOOTSTRAPPED="$(grep  ->  scripts/doctor.sh:113:BOOTSTRAPPED="$(grep

That file is a test file, frozen in GREEN and in GATES. rules.md's "a gate
failure whose only legal fix is a write the current phase forbids is a return
to RED" is this case exactly: one two-line fixture correction, in RED, recorded
in `## Regressions`, earned by the mutation the freshness check already
performed on itself (the pasted failure above IS the red, produced by the real
tree moving under it).

**The layout-preserving alternative was considered and declined.** Both line
numbers could have been held still: keep lines 39-41 exactly as they were and
put the whole worktree block after line 62. That needs no test change at all.
It was rejected because it costs a correctness property. `main_hv` and `hv` are
compared to each other, so the comparison is only sound if both stamps are read
the same way - which is why they go through one `release_of`. Preserving line
39 means reading the running tree's stamp with one inline pipeline and the main
checkout's with another, and a later edit to one and not the other makes the
comparison lie silently. It also puts the row under the `Project toolchain`
heading, where it does not belong, and it leaves the next person to touch
`doctor.sh` hitting the same wall with nothing on record explaining why the
file's layout is frozen by a census in another suite. Contorting production
layout to keep a fixture fresh is the tail wagging the dog; re-recording the
census is what the freshness check asks for.

### Real-tree probe at GATES - AC-4 against a REAL linked worktree of THIS repository

**Why this exists, and that it was not pre-declared.** Release 41: a rule is
probed against the tree it judges, not only against fixtures written by whoever
wrote the rule. Every control above runs inside `worktree.test.sh`'s fixture,
and every measurement in `## Contract` C-1..C-4 was taken either on this
checkout or on a `make_project_fixture`. The AC-4 comparison itself - a
worktree's release against the main checkout's - had never run against a real
linked worktree of this repository. This story declared no
`## Deferred verifications` entry owning that, so the probe is recorded HERE
rather than there, which is the choice rules.md asks to be stated rather than
left to live in two places.

A real linked worktree (`git worktree add -d`), all three branches exercised
against the shipped `scripts/doctor.sh`:

    === A. real linked worktree, releases MATCHING ===
      ok       worktree     linked worktree of /c/Users/ryanc/Projects/agentic-dev-harness, harness 45 (2026-09-20)
      doctor exit: 0

    === B. main checkout ===
      ok       worktree     main checkout, harness 45 (2026-09-20)
      doctor exit: 0

    === C. mismatch, via mutate.sh on the WORKTREE's own VERSION ===
    === mutate: .claude/harness/VERSION (1 line(s) changed by s/^45 /44 /) ===
    === mutate: running bash scripts/doctor.sh ===
      MISSING  worktree     linked worktree, harness 44 (2026-09-20) - main checkout is 45 (2026-09-20)
                   the main checkout is /c/Users/ryanc/Projects/agentic-dev-harness
                   refresh-harness.sh updates the tree it is run in; the
    === mutate: command exited 0; restored (verified byte-for-byte against /tmp/adh-ac4-probe/.claude/state/mutations/.claude_harness_VERSION.20260922T203952Z.385787.bak) ===
      34: 45 (2026-09-20)

All three rows are correct on the real tree. The main checkout's path is
rendered in the shell's spelling (`/c/Users/...`) rather than git's
(`C:/Users/...`) - the normalisation C-2 warned about, working.

**THE EXIT STATUS IS 0, NOT 1, AND NO FIXTURE COULD HAVE SHOWN THIS.** The
cause is not the worktree row. `scripts/doctor.sh:170-176`:

    if [ "$found_any" = 0 ] && ! grep -qE '^[[:space:]]*discovery[[:space:]]*\|' "$CONF"; then
      printf '  (nothing configured yet)\n'
      ...
      exit 0
    fi

That `exit 0` discards `missing` entirely. This repository is `BOOTSTRAPPED=no`
with no gate commands, so every run takes that path, and the mutated run's tail
confirms it got there:

      (nothing configured yet)
    project.conf has no commands, so there is no toolchain to check.

`worktree.test.sh`'s AC-4 fixture writes a CONFIGURED GATE into its
`project.conf`, so doctor runs past line 176 and exits 1 - which is what the
suite asserts, and what mutation M2 in `## Notes` confirmed discriminates. The
fixture is right about the mechanism and blind to this tree's configuration.
That is precisely the release 41 shape: fixture and tree disagree, both suites
green, and only the real-tree run says so.

**This does not fail AC-4.** AC-4 requires doctor to name "which worktree it is
in and whether that worktree's harness is the same release as the main
checkout's". It does, on the real tree, in all three cases. Exit status is not
part of the criterion.

**Pre-existing, and deliberately NOT fixed here** - see PO-H in `## Notes`. The
early exit predates this story and the CI block immediately above it has the
same hole, so an unbootstrapped project whose CI never runs the harness checks
is also reported and also exits 0. Changing it changes `doctor.sh`'s exit
contract for every unbootstrapped project, which is its own story. GREEN found
this by reading; this probe confirms it by running.

**One trap for whoever repeats this.** `git worktree add` checks out a COMMIT,
so a fresh worktree carries the COMMITTED `doctor.sh`. The first run of this
probe printed no `worktree` row at all, because GREEN's change was still
uncommitted - which looks exactly like the feature being absent. The shipped
file was copied into the worktree before the runs above: real worktree
mechanics, real file under test. Run after the commit, no copy is needed.

**Cleanup.** `mutate.sh` restored the VERSION and verified it byte-for-byte;
the worktree was removed with `git worktree remove --force` and
`git worktree prune` run. `git worktree list` afterwards shows the main
checkout alone.

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

Filed 2026-09-21, with HARNESS-009, after the user asked what HARNESS-006
actually enables. The honest answer was: nothing yet. 006 is the declaration,
007 is the planning, and THIS is the one that removes the constraint.

**`depends_on: []` deliberately.** 006 and 007 make parallel work sensible;
neither makes it possible, and neither is mechanically required to start this.
Pulling this forward is the fastest route to running two stories at once, and
the cost of doing it first is only that you pick the second story by hand
instead of being told which are safe.

**The measurement this story rests on** is in `## Context` and was taken before
the story was written rather than assumed from how worktrees are supposed to
behave. If RED finds it wrong, that is the story failing early and cheaply,
which is the point of taking it.

**PO decision 1, taken at PLANNED→RED: no `project.conf` gate covers this
story's artifact, and that is structural rather than a gap.**

`bash scripts/gates.sh --list` at release 45 reports every gate
`<unconfigured>`, because this repository is the harness template and
`BOOTSTRAPPED=no`. `gates.sh` judges a PROJECT; this repository has none.

The artifact is still verified, and by a required path: `.claude/tests/` is run
by `scripts/selftest.sh`, which CI invokes as its own workflow step
(`gates.yml:72`), and `selftest.sh` globs `.claude/tests/*.test.sh` - so
`worktree.test.sh` is picked up with no wiring. A broken suite fails CI.

So `required_gates` stays empty, and the admissibility question the advance
procedure asks of `gates.sh --fast` is answered by `bash scripts/selftest.sh`
here instead. Recorded because it applies to every story in this repository,
not just this one, and because "no gate covers it" would otherwise read as a
reason the story is not ready.

### PO decisions taken at the RED -> GREEN boundary (2026-09-22)

**PO-A. RED's escalation on `refresh-harness.sh` is ANSWERED: no note. Do not
add one.** RED asked, under "AC-5: what it turned out to be", whether
refresh should print a note when it runs inside a linked worktree, and
correctly declined to invent it. The answer is no, for this story:

  * AC-5 is satisfied by the "works correctly on that worktree alone" branch,
    and that branch requires nothing be printed. A note is a sentence no
    acceptance criterion asks for.
  * The state a note would announce - two trees on different releases - IS
    reported, by AC-4's `doctor.sh` row. That is the mechanism the story asked
    for, and a second channel for the same fact is not better reporting.
  * Adding it means a return to RED for one assertion, against no criterion.

So `scripts/refresh-harness.sh` is UNCHANGED by this story, and `touches:` is
correct in not listing it. GREEN must not edit it. If GREEN believes a note is
needed, that is an escalation, not an edit.

**Reproduced independently before answering.** RED's claim is that refresh run
in a linked worktree works on that worktree alone. The orchestrator measured
this on different inputs, in a different fixture pair, before reading RED's
report - upstream stamped `999 (probe)` rather than RED's `99 (2099-01-01)`,
and the assertion taken on the MAIN checkout's stamp rather than on a hook
marker:

    === BEFORE ===
    FIX VERSION: 46 (2026-09-22)      (main checkout)
    WTA VERSION: 46 (2026-09-22)      (linked worktree)
    === run refresh INSIDE worktree A ===
    refresh-harness
      from: /tmp/tmp.tzelE9hrFA  (999 (probe))
      into: /tmp/tmp.7pADnAaKlT-wtA  (46 (2026-09-22))
      REPLACED  .claude/harness/VERSION
      ...
    === AFTER ===
    FIX VERSION: 46 (2026-09-22)
    WTA VERSION: 999 (probe)

The worktree moved; the main checkout did not. Same conclusion, different
inputs and a different oracle. RED's finding stands.

**Candidate follow-up, deliberately NOT taken here.** Refreshing inside a
worktree leaves a large uncommitted diff to tracked files (`scripts/*.sh`,
`.claude/hooks/**`) on that worktree's story branch, where it will ride into
that story's PR unless somebody notices. That is a real hazard and it is
outside every criterion this story carries. It belongs in its own story, filed
through `/plan-story`, not absorbed here.

**PO-B. RED's own escalation discipline is the reason this went well.** It hit
a Contract clause that said "one refusal or one note, whichever the RED
investigation shows is correct", found the premise of both branches false -
there is nothing to refuse and no criterion demanding a note - and stopped
rather than writing a test for a sentence nobody had asked for. Recorded
because the failure mode it avoided is the one this harness is built against:
an agent resolving an open question in a contract by guessing, and the guess
becoming the specification.

**PO-C. The RED state was re-verified by the orchestrator, not accepted on
report.** `bash scripts/selftest.sh worktree` run fresh at the start of this
dispatch: `worktree: 65 passed, 8 failed`, the same eight, all of them the
absent `doctor.sh` row. `check-sigpipe.sh` and `check-grep-count.sh` each
scanned 39 shell files with 0 findings.

**PO-D. The branch is one release behind `main`.** This branch carries
`.claude/harness/VERSION` = 45; `main` is at 46 (release 46 and the `mutate.sh`
PIPE-trap fix landed after this branch was cut). The suite reads the fixture's
own stamp at run time rather than a literal, so nothing in it breaks on the
bump. Noted because the GATES gate record and the PR merge will both see 46.

### PO decisions and verification at the end of GREEN (2026-09-22)

**PO-E. The suite discriminates — verified by the orchestrator's own mutations,
not by re-running GREEN's.** `rules.md` requires the handoff's mutation table to
be checked against the committed implementation with mutations the orchestrator
picks. Two, each predicted to catch a specific pair, run through
`scripts/mutate.sh` on the shipped `scripts/doctor.sh`:

**M1 — swap the two release numbers in the MISSING row.** Tests that the
assertion's needle is order-sensitive rather than merely containing both
numbers.

    === mutate: scripts/doctor.sh (1 line(s) changed by s/"worktree" "${hv:-unstamped}" "${main_hv:-unstamped}"/"worktree" "${main_hv:-unstamped}" "${hv:-unstamped}"/) ===
        FAIL a linked worktree behind the main checkout is MISSING, naming both releases
        FAIL doctor in the refreshed worktree reports the mismatch the refresh produced
    worktree: 71 passed, 2 failed
    === mutate: command exited 1; restored (verified byte-for-byte against .../scripts_doctor.sh.20260922T174533Z.4133411.bak) ===

Exactly the two assertions that read both numbers in order. Nothing else moved:
the row still prints, still says `MISSING`, still names two releases — and the
suite still refuses it.

**M2 — drop ONLY the worktree block's `missing` increment** (line 89, leaving
every other increment in the file intact). Tests the property
`doctor.test.sh`'s header says was once lost: a block that prints its complaint
while doctor exits 0.

    === mutate: scripts/doctor.sh (1 line(s) changed by 89s/missing=\$((missing+1))/:/) ===
        FAIL and doctor exits 1 on the mismatch
        FAIL and exits 1
    worktree: 71 passed, 2 failed
    === mutate: command exited 1; restored (verified byte-for-byte against .../scripts_doctor.sh.20260922T174724Z.4140904.bak) ===

The two exit-status assertions go red and **every text assertion stays green**,
which is the point: the exit-status assertions are independent of the text ones,
so the historical defect cannot recur unnoticed here.

After both, `.claude/state/mutations/` holds `log` and no `.bak` — every restore
succeeded — and `bash scripts/selftest.sh worktree` is back to `73 passed, 0
failed`.

**PO-F. GREEN's two divergences from RED's predicted mutation counts are
accepted as corrections to the prediction, not as defects.** RED predicted
control 3's probe would redden both `exits 0` assertions; it reddens one,
because the shipped code has two branches where the prediction assumed one
shared condition — the main checkout takes the `wt_gitdir = wt_common` path,
which has no MISSING variant at all. Control 5's probe reaches the other one,
and did. This is a prediction written in RED against code that did not exist
yet, corrected by the phase that could finally run it. That is the mechanism
working.

**PO-G. RETURN TO RED. The blocker is real and the reshuffle is refused.**
`.claude/tests/sigpipe.test.sh` fails — not `worktree`:

    FAIL C-5 freshness: all twelve status-discarded lines are still where this suite says they are
         scripts/doctor.sh:39 no longer holds [hv="$(grep] - it holds: release_of() { ...
         scripts/doctor.sh:62 no longer holds [BOOTSTRAPPED="$(grep] - it holds: # 2.55.0.windows.5: ...
    sigpipe: 81 passed, 1 failed

Reproduced by the orchestrator. The guard itself is unaffected —
`check-sigpipe.sh` reports 0 findings over 39 files — and what failed is that
suite's own freshness census, which hard-codes twelve `file:line:prefix`
triples and exists precisely to fail when one drifts. It is doing its job.

The fix is two line numbers in a file GREEN and GATES both freeze. That is
`rules.md`'s "a gate failure whose only legal fix is a write the current phase
forbids is a return to RED", verbatim, and the everyday instance it describes.

**The alternative was offered by the feature-developer and is refused.** It
would keep `doctor.sh` lines 39 and 62 byte-identical by moving the whole
worktree block below line 62, needing no test change. Refused because it
inverts the relationship: it contorts production code to preserve a test's
hard-coded line numbers. Concretely it would force the two VERSION stamps that
are COMPARED TO EACH OTHER to be read by two separate inline copies of the same
`grep | head -1 | trim`, which is the defect `release_of()` exists to prevent —
a later edit to one copy makes the comparison lie silently. It would also put
the row under the `Project toolchain` heading, where it is not a project
toolchain fact, and leave the next person to move a line in `doctor.sh` hitting
the same wall with nothing on record.

The feature-developer raised it and declined to take it unilaterally, which is
the correct escalation. The answer is: take the return to RED.

**What RED's remit is, and is not.** Exactly two lines of
`.claude/tests/sigpipe.test.sh`'s `DISCARDED` census:

    scripts/doctor.sh:39:hv="$(grep           ->  scripts/doctor.sh:41:v="$(grep
    scripts/doctor.sh:62:BOOTSTRAPPED="$(grep ->  scripts/doctor.sh:113:BOOTSTRAPPED="$(grep

Nothing else. `scripts/doctor.sh` is frozen again by the lock on the way back,
which is correct and is not a signal to change phase. "Watch it fail" cannot
apply — the implementation already exists — so the corrected assertion is
earned by a PROBE, per `rules.md`: mutate the specific behaviour the census
pins and paste the red into `## Regressions`.

**PO-H. Filed for its own story, not fixed here.** GREEN found that
`doctor.sh`'s early `exit 0` on the `project.conf has no commands` path
discards `missing` entirely, so in THIS repository (`BOOTSTRAPPED=no`) a linked
worktree with a release mismatch prints the `MISSING  worktree` row and still
exits 0. The CI block above that exit has always had the same hole, so this is
pre-existing rather than introduced. No criterion of this story covers it —
AC-4's fixture has a configured gate, runs to the end, and exits 1, which is
what the assertion pins and what the mutation M2 above confirms discriminates.
Fixing it here would be scope this story has not earned.

### GREEN, second pass (after the R-1 return), 2026-09-22

**PO-I. GREEN was a genuine no-op for source, and no feature-developer was
dispatched.** The R-1 return corrected a test fixture, not an implementation:
`scripts/doctor.sh` was already correct and the corrected census passes against
it. `rules.md` and the `/advance-story` brief both say GREEN *may* be a no-op
here and that an agent given no work will find some, so none was dispatched.
Verified rather than assumed — `git diff --stat scripts/doctor.sh` is unchanged
from the first GREEN (53 insertions, 2 deletions), and the suites and fast
gates were re-run at this phase rather than carried over from the previous one.

**PO-J. AC-6's `CLAUDE.md` section was written here, by the orchestrator.**
It is the one criterion with no test behind it — a `## Deferred verifications`
entry owned by REVIEW — so nothing would have failed had it been forgotten,
which is exactly why it is recorded as a decision rather than left implicit.

Written by the Lead PO rather than the feature-developer for two reasons:
`rules.md` gives docs to the PO, and the section's whole content turns on
Amendment A-1, which the PO holds. A fresh feature-developer would have written
the sentence AC-6 originally asked for — the false one.

Placed after `## Phase lock`, which is where the one-checkout-one-lock
assumption is stated, and kept short because `CLAUDE.md` is in context on every
turn and says so about itself. It carries the three things AC-6 requires:

  * how to make a worktree per story, with `doctor.sh` named as the thing that
    says which worktree you are in and whether its release matches;
  * `bash scripts/plan.sh conflicts` before choosing the second story;
  * that it reads each story's `## Contract` paths and **not** the `touches:`
    frontmatter, stated explicitly in the negative so the error A-1 corrected
    cannot be reintroduced by someone skimming.

It also answers the question the REVIEW entry asks for — what to do when the
answer is `UNKNOWN`, which is most of the time — with two concrete options and
the reason `UNKNOWN` must not be read as permission.

**The documented command was run before being documented.** `git worktree add
../adh-WORLD-015 -b story/WORLD-015-slug` is the form in the section; the
option-after-path order is valid but is not the order `git worktree --help`
shows first, so it was executed verbatim on this checkout rather than trusted:

    Preparing worktree (new branch 'story/TEST-001-slug')
    HEAD is now at 7215b22 HARNESS-008: RED — worktree.test.sh, ...
    EXIT=0
    worktree created OK

Then removed, its branch deleted and `git worktree prune` run, leaving the main
checkout as the only worktree. A command in `CLAUDE.md` is read as instruction
by every future agent, so an untested one is a defect with a long fuse.

**Nothing in the tree asserts `CLAUDE.md`'s content**, checked before writing:
`refresh.test.sh` uses its own fixtures, and `lib.test.sh` only asserts that
`CLAUDE.md` classifies as `harness`. So this section is covered by AC-6's REVIEW
reading and by nothing else, which is what the deferred verification exists for.

### GATES, 2026-09-22

**Model resolved: `lead-po`, Opus 5.** No subagent was dispatched in GATES.
The phase's work was the two deferred verifications and the gate run, both of
which are orchestrator work by the `/complete-story` procedure, and neither
produced a source change for a feature-developer to make.

**PO-K. `## Gate results` records a run in which ZERO gates executed, and that
is not evidence about this story.** The recorded block reads
`result: pass (0 ran, 8 unconfigured, 0 known)`. Every gate in `project.conf`
is unconfigured because this repository is the harness template, not a project
with a stack - PO-2, taken at PLANNED, said so and said what stands in its
place. The artifact is judged by `bash scripts/selftest.sh`, which
`.github/workflows/gates.yml` runs as a step of the `gates` job, so a red suite
fails a required check on the PR.

The full self-test was therefore run at GATES, before REVIEW, as the real
verification the gate record cannot supply. `gates.sh` was still run, and its
record still matters for a different reason: `check-boundaries.sh` compares the
recorded tree hash against the tree being merged, so the record is what proves
no gated file changed after the last full run.

**Which files that hash covers, checked rather than assumed**, because the
ordering of the remaining steps depends on it. `gated_stdin` in
`.claude/hooks/lib.sh` counts `source`, `test`, `config` and `harness`, minus
harness `*.md`, minus `.claude/state/`. For this story:

    gated:      scripts/doctor.sh, .claude/tests/sigpipe.test.sh,
                .claude/tests/worktree.test.sh
    NOT gated:  docs/backlog/stories/HARNESS-008.md  (docs)
                CLAUDE.md                            (harness, but .md)

So writing these notes, pasting the verification results, and `phase.sh set
REVIEW` rewriting the frontmatter all leave the record valid. Had `CLAUDE.md`
been gated, AC-6's section would have had to land before the gate run.

**PO-L. The AC-4 real-tree probe had no declared owner, and is recorded in
`## Gate probes` rather than invented as a deferred verification.** This story
declares two `## Deferred verifications` - AC-6 (REVIEW) and AC-2 (GATES). It
does not declare one for AC-4. Release 41 still requires a probe against the
real tree for a rule that judges the tree, so the probe was run and filed under
`## Gate probes`, with a sentence saying why it lives there. rules.md asks for
that choice to be stated rather than left to want two homes.

It is also the probe that produced this story's most useful finding: on the
real tree `doctor.sh` prints the `MISSING worktree` row and still exits 0,
because this repository is unbootstrapped and takes an early `exit 0` that
discards `missing`. The fixture configures a gate and so never reaches that
path. Both suites green, fixture and tree disagreeing - the exact shape release
41 exists for. It does not fail AC-4, which says nothing about exit status, and
it is PO-H's pre-existing defect confirmed by running rather than by reading.

### REVIEW, 2026-09-22 - the first CI run failed, and it found a harness defect

**PO-M. `check-boundaries.sh` passed locally and the identical commit failed on
CI. The local instrument was wrong, not CI.**

PR #76's `boundaries` job, against commit `00e17c5`:

    ok    recorded gate result: pass (0 ran, 8 unconfigured, 0 known)
    FAIL  story HARNESS-008: gates were recorded against tree
          'c414aa7cded3f9f401def9ba8f607dd44c7c2db8' but commit 00e17c5 is
          '1f0730a6c0cde981e7277504b4daadf9cf5eaa15'. Source, test or config
          changed after the last full gate run; run 'bash scripts/gates.sh'
          again and commit the result.

Nothing had changed after the gate run. The message's diagnosis is wrong for
this case, and the real cause is in the instrument:

**`gate_tree_hash()` hashes UNTRACKED files.** It seeds an index from HEAD and
then runs `git add -A .`, so anything sitting in the working tree is folded into
the hash whether or not it is committed. `gate_tree_hash_of <sha>` on CI reads a
commit, which by construction has none. So the two disagree by exactly the
untracked, GATED files present when `gates.sh` ran.

This checkout had three untracked entries, left from an unrelated field report:

    agentic-dev-harness-brief.md              docs    - not gated
    harness-feedback-world-080.md             docs    - not gated
    handoff-world-080/README.md               docs    - not gated
    handoff-world-080/part-phase-guard.sh.patch          source  - GATED
    handoff-world-080/part-_lib.sh.patch                 source  - GATED
    handoff-world-080/world-080-phase-guard-sed-inplace.patch  source - GATED
    handoff-world-080/part-phase-guard.test.sh.patch     test    - GATED

Four gated files, none of them in any commit. `.patch` matches no rule in
`paths.conf`, so it falls through to the `source` default - correctly, for a
file about to be authored, and unhelpfully for a patch file parked in the root.

**Proof, rather than inference.** The three entries were moved aside, `gates.sh`
re-run against the now-clean tree, and the recorded hash came back as

    tree:   1f0730a6c0cde981e7277504b4daadf9cf5eaa15

which is byte-for-byte the value CI computed from `00e17c5`. The files were then
restored. One variable changed and the hashes converged on CI's answer.

**Why this matters beyond this story.** The local run is the check a developer
uses to know a PR will pass before opening it - `ci-local.sh` exists for exactly
that - and here it said yes while CI said no, on the same commit, with no code
difference. The failure is silent and directional: untracked gated files can
only make the local hash MORE permissive, never less, so the local check passes
and CI fails. Anyone with a scratch `.py`, `.ts` or `.patch` in their tree hits
it, and the error message sends them looking for a source change that does not
exist.

**Not fixed here.** It is `gate_tree_hash()` in `.claude/hooks/lib.sh`, used by
`gates.sh` and `check-boundaries.sh`, and changing what it hashes changes every
recorded gate result's meaning. No criterion of this story touches it. It wants
its own story, with a decision about which of these it should be: ignore
untracked files entirely (matching CI), or refuse to record a gate run while
untracked gated files are present (louder, and arguably more honest, since a
developer with uncommitted source in the tree has not gated what they are about
to merge either).

**What was done about it here, and what was deliberately not.** The three
entries are the user's, so they were not deleted and not added to `.gitignore` -
that would be a permanent repository decision about transient handoff artifacts.
They were parked, the gates re-run to record a hash describing the commit rather
than the working tree, and then restored to their original paths and contents.

A consequence worth stating plainly: with those files back, a LOCAL
`check-boundaries.sh` now reports the mismatch in the other direction, because
the working tree again contains four gated files the commit does not. CI is the
authority here, and CI is the machine whose answer the record now matches.

### REVIEW: CI green, and the timings read rather than glanced at

R-2's fix, commit `04a1114`. Both required checks pass:

    boundaries  pass  4s     actions/runs/35803806705
    gates       pass  1m8s   actions/runs/35803806651

    === sigpipe ===   sigpipe:  82 passed, 0 failed    (9.8 s)
    === worktree ===  worktree: 73 passed, 0 failed    (2.7 s)
    18 harness suite(s) passed.
    check-sigpipe: scanned 39 shell file(s), 37 with pipefail, 0 finding(s)

**Timings, because a pass within 10% of a limit is a pending failure.** Neither
workflow sets `timeout-minutes` - the only match in `.github/workflows/` is a
comment - so GitHub's 360-minute job default applies and `1m8s` is not close to
anything. `selftest.sh` imposes no per-suite timeout either, which RED recorded
as "no timeout to budget".

The one number worth keeping: `worktree` runs in **2.7 s on CI against roughly
90 s on this Windows machine**. The suite is process-spawn bound - six `doctor`
runs, two `check-boundaries`, several `phase.sh` - and Linux spawn is cheap. The
usual warning in CLAUDE.md runs the other way (slower on CI hardware); here the
margin is comfortable in the safe direction, and a future story adding worktrees
to this suite should expect the local run to be the painful one.

**What this does NOT show.** CI proves the suite passes where
`GITHUB_HEAD_REF` is set, which is the environment R-2 was about. It does not
re-prove the probe: that the assertions have teeth there was established locally
by mutating `check-boundaries.sh:324` under a simulated CI environment, pasted
under R-2. A green CI run is consistent with a suite that asserts nothing, which
is the whole reason that probe exists.
