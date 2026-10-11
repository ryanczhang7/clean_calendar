---
id: HARNESS-048
title: The audit check judges the real tree
slug: the-audit-check-judges-the-real-tree
epic: 
type: fix
status: done
phase: DONE
branch: story/HARNESS-048-the-audit-check-judges-the-real-tree
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [.claude/tests/gates.test.sh]       # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

<!-- Why this story exists. Link the epic and any wiki pages that constrain it.
     Name the REQUIRED gate that would fail if this story's artifact broke. If
     only an optional gate can, put it in required_gates above before RED:
     every required gate once passed over a story none of them exercised. -->

Found refreshing fantasy-world-builder from release 64 to 87 (2026-10-08). Its
full self-test failed in the `gates` suite on two HARNESS-039 assertions:

    FAIL AC-5: and its audit says it passed     expected: 1  actual: 0
    FAIL AC-5: and exits 0                      expected: 0  actual: 1
    gates: 496 passed, 2 failed   (below the floor of 498)

The assertion block's own comment says what it is for: "this repository's own
project.conf - what the CI step at gates.yml's `--audit` judges on this tree -
still passes". But it does not judge this tree. It copies `project.conf` into
the suite's scratch fixture (`make_project_fixture`: `scripts/`, `.claude/hooks`
and an empty project) and audits it there. `--audit` checks that every gate's
`cwd` exists, so any project whose gates run in a subdirectory fails it. Reproduced
in fantasy-world-builder by copying the same steps into a script:

    FAIL rust-format  cwd does not exist: src-tauri
    FAIL rust-lint    cwd does not exist: src-tauri
    FAIL rust-unit    cwd does not exist: src-tauri
    FAIL rust-coverage cwd does not exist: src-tauri
    FAIL rust-coverage-worldfile cwd does not exist: src-tauri
    5 manifest problem(s).
    rc=1

The same audit run in fantasy-world-builder's real tree prints `Manifest audit
passed.` and exits 0, which is what its CI step would see. The assertion holds
only in this repository, whose gates all run in `.`; it ships to every consumer
in `.claude/tests/`, and any consumer with a subdirectory gate fails it.

**The gate that fails if this breaks** is the harness's own `selftest` (the
`gates` suite), which CI runs on every PR.

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC.
     An AC that names a statistic, a metric or a threshold names a NEGATIVE
     CONTROL too: the deliberately broken input the metric must reject, and
     roughly what it should score. A criterion can be perfectly testable and
     still be blind to the defect it exists to catch, and that is more
     dangerous than a vague one - it survives review and goes green. -->

- **AC-1 (AC-5 audits the tree CI audits)** — Given the `gates` suite, when
  HARNESS-039's AC-5 block runs, then it runs `bash scripts/gates.sh --audit`
  in `$REPO_ROOT` itself, not in a scratch fixture holding a copy of
  `$REPO_ROOT`'s `project.conf`, and asserts the same three things: no
  HARNESS-039 message under any id, `Manifest audit passed.`, exit 0.
  *Control:* with `ondemand | mutation` removed from this repository's real
  `project.conf` (through `scripts/mutate.sh`), the block goes red.
- **AC-2 (a consumer with a subdirectory gate is not failed by it)** — Given a
  project whose `project.conf` has a gate with a `cwd` that exists in its own
  tree (fantasy-world-builder's `src-tauri`), and whose real-tree audit passes,
  when its `gates` suite runs after refreshing to the release carrying this
  story, then the AC-5 assertions pass.

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

**Writes:** `.claude/tests/gates.test.sh`

- Only HARNESS-039's AC-5 block changes: `cp "$REPO_ROOT/.claude/harness/project.conf" "$FIX/..."`
  then `gates --audit` becomes `out="$( cd "$REPO_ROOT" && bash scripts/gates.sh --audit 2>&1 )"`.
  The three assertions keep their names and needles; the comment above them
  says why the fixture was wrong.
- `--audit` runs no gate command and takes no run lock (`gates.sh:240-244`), so
  running it in the real tree during a self-test is safe beside a gate run.
- It is the only test that copies the real `project.conf` into a fixture:
  `grep -n 'REPO_ROOT/.claude/harness/project.conf' .claude/tests/*.sh` finds
  only `gates.test.sh:1071`.
- No production code changes; the assertion count is unchanged (floor stays).

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
         reason. check-boundaries.sh refuses a PR that has neither. A result
         counts only as a block: a line beginning with three backticks or
         three tildes (a fence), or a line indented by exactly four spaces.
         Prose does not count, nor inline code in backticks, nor a tab, nor
         anything inside an HTML comment
     Schedule it into GATES rather than RED where you can: source is writable
     there, and a story that bounced back to RED mid-cycle gets its corrected
     assertions earned by the same mutation, for free. How many entries is the
     budget in rules.md, `Mutation work per story`: by default ONE
     "defect put back" entry for the story's central claim, run against the one
     suite that holds its assertion. A format or codec story may add one wrong VALUE
     mutation - a codec that is uniformly wrong round-trips through itself
     perfectly. Exhaustive earning of assertions that passed on arrival is not
     an entry here; it goes to `/audit-mutations`. -->

- **DV-1 (defect put back, and the earning mutation)** — The rewritten block
  passes on arrival here (this tree's audit passes), so it is earned by
  mutation: with `ondemand | mutation` deleted from `.claude/harness/project.conf`
  through `scripts/mutate.sh`, the AC-5 assertions MUST go red in the `gates`
  suite. RED has no production change to wait for, so RED runs it.
  Owner: RED

  Result (RED, 2026-10-08): red on all three AC-5 assertions, restored.

    $ bash scripts/selftest.sh gates
    gates: 498 passed, 0 failed
    $ bash scripts/mutate.sh .claude/harness/project.conf '/^ondemand | mutation/d' -- bash scripts/selftest.sh gates
    === mutate: .claude/harness/project.conf (1 line(s) changed by /^ondemand | mutation/d) ===
    === mutate: running bash scripts/selftest.sh gates ===
        FAIL AC-5: this repository's own project.conf draws the new message under no id
        FAIL AC-5: and its audit says it passed
        FAIL AC-5: and exits 0
    gates: 495 passed, 3 failed
    === mutate: command exited 1; restored (verified byte-for-byte against .../.claude/state/mutations/.claude_harness_project.conf.20261008T220954Z.1347038.bak) ===
- **DV-2 (the consumer)** — Before the PR, fantasy-world-builder (whose
  release-87 refresh is uncommitted on its `main`) is refreshed from this
  branch and its `gates` suite shows 0 failed. Owner: GATES

  Result (GATES, 2026-10-08): the refresh from this branch was refused -
  `refresh-harness: this tree has uncommitted changes` - because the
  release-87 refresh is still uncommitted there. So the rewritten block's
  three checks were run by hand in fantasy-world-builder's real tree, with
  `H39_MSG` read from this branch's `gates.test.sh`; they give the values the
  assertions expect (0, 1, 0). Its suite run after the release-88 refresh is
  the confirmation, recorded under `## Notes` at DONE.

    $ cd /d/fantasy-world-builder && out="$(bash scripts/gates.sh --audit 2>&1)"; rc=$?
    H39 hits: 0
    passed lines: 1
    rc=0

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

Planned by `bash scripts/plan.sh write HARNESS-048` from `.claude/harness/models.conf`.
A PLAN, not a record: a session setting or an explicit override can beat both
this and the agent's own `model:` field, and nothing here can see which won.
The orchestrator still writes down the model each dispatch **resolved** to, by
name, below the table.

| Phase | Agent | Planned | Why |
|---|---|---|---|
| PLANNED | `lead-po` | `fable` | planning is the judgement phase - decomposition, the oracle partition, the contract - and planning is what fable is judged best at |
| RED | `test-developer` | `opus` | writing the failing tests, the negative controls and the handoff is development work, and opus is judged the stronger model for it |
| GREEN | `feature-developer` | `opus` | the failure mode of a weaker model here is reaching green by weakening a test, which is the one thing this harness exists to prevent |
| GATES | `feature-developer` | `opus` | same risk as GREEN, and a gate failure is where "make it stop complaining" is most tempting |
| REVIEW | `lead-po` | `fable` | reading review feedback against the contract is orchestration judgement, and a wrong call here ships; a fix it finds goes back to GATES or RED, on opus |
| SCAFFOLD | `lead-po` | `opus` | source, tests and config in one indivisible derivation - code, with no failing test in front of any of it, so the stronger development model |

**Resolved:**

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Out of scope

<!-- Explicit non-goals. Prevents the Feature Developer from over-building. -->

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

<!-- Filled by the Test Developer during RED: which tests, at which level,
     and which AC each one covers. -->

- AC-1: `.claude/tests/gates.test.sh`, HARNESS-039's AC-5 block (three
  assertions, names unchanged), now audited in `$REPO_ROOT`. Earned by DV-1.
- AC-2: DV-2, fantasy-world-builder's own `gates` suite after a refresh.

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

Command: `bash scripts/selftest.sh gates`. A test-only story: the block was
rewritten against an implementation that already exists, so it passes on
arrival (`gates: 498 passed, 0 failed`) and is earned by DV-1's mutation
instead, pasted there. GREEN has no production change to make; it confirms
the suite still passes and that no source file changed.

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
         or Gate probes section describes a failure without showing one.
         A result counts only as a block: a line beginning with three
         backticks or three tildes (a fence), or a line indented by exactly
         four spaces. Prose does not count, nor inline code in backticks, nor
         a tab, nor anything inside an HTML comment
       * whether GREEN was a no-op, and the command output proving the source
         was untouched and still passes -->

## Gate results

<!-- gates.sh: written by bash scripts/gates.sh; do not edit or paste by hand -->

    run:    2026-10-08T22:38:14Z
    commit: dcc38c3
    tree:   1245a7d90736a3a3156fd9c69cf0c2054ad3d9ba
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
     it guards, run the gate, paste the failure, revert. A result counts
     only as a block: a line beginning with three backticks or three tildes
     (a fence), or a line indented by exactly four spaces. Prose does not
     count, nor inline code in backticks, nor a tab, nor anything inside an
     HTML comment. One block per gate:
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


**GREEN (2026-10-08), no-op.** A test-only story: no source or config file
changed (`git diff --stat f235dab -- scripts .claude/hooks .claude/harness`
is empty), and `bash scripts/selftest.sh gates` passed in RED's run above.

**GATES (2026-10-08).** DV-1 run in RED, DV-2 here; both pasted above.
`bash scripts/gates.sh`: recorded under `## Gate results`. Full self-test with
`SELFTEST_JOBS=4`, at GATES, 2939 s:

    exit 0 in 2939 s
    assertion floors: all 26 suite(s) met their declared floor (2993 assertions executed, 2702 declared).
    26 harness suite(s) passed.

**DONE, 2026-10-08.** Merged in #124 (merge commit f8790d6), release 88. The VERSION
bump lands in this DONE commit. `phase.sh set DONE --force` was run on `main`
(a detached checkout of `origin/main` in the worktree), overriding the branch
check. PR CI: `gates` passed in 2m34s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37859714800),
`boundaries` in 7s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37859714755).
DV-2's confirmation, fantasy-world-builder's own suite after refreshing to
this release, is reported to the user rather than recorded here: it happens
in that repository, after this commit.
