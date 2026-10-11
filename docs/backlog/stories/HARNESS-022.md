---
id: HARNESS-022
title: The selftest suite's floor is the 100 assertions it runs
slug: the-selftest-suite-s-floor-is-the-100-as
epic: 
type: chore
status: done
phase: DONE
branch: story/HARNESS-022-the-selftest-suite-s-floor-is-the-100-as
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [.claude/tests/floors.conf, .claude/tests/selftest.test.sh]         # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

<!-- Why this story exists. Link the epic and any wiki pages that constrain it.
     Name the REQUIRED gate that would fail if this story's artifact broke. If
     only an optional gate can, put it in required_gates above before RED:
     every required gate once passed over a story none of them exercised. -->

Requested by the user on 2026-10-02, following up HARNESS-021's RED report: the
`selftest` suite's floor in `.claude/tests/floors.conf` is still **54**, but the
suite now executes **100** assertions (HARNESS-020 added 41, and HARNESS-021
brought it to 100). A floor of 54 catches the suite being gutted, but not losing
nearly half its assertions.

One gap came out while reading the twin. `floors.conf`'s header says a floor is
recorded twice: the hand-copied table in `selftest.test.sh` ("and each records
the executed count measured on this tree") is meant to catch a floor lowered to
make a run pass. That table has **no `selftest` row**, so the `selftest` floor
was never covered by it. Raising or lowering it alone would pass unnoticed.

Required gate that would fail if this story's artifact broke: `unit`
(`bash scripts/selftest.sh`, whose floors audit reads `floors.conf`, and whose
`selftest` suite holds the twin table).

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC.
     An AC that names a statistic, a metric or a threshold names a NEGATIVE
     CONTROL too: the deliberately broken input the metric must reject, and
     roughly what it should score. A criterion can be perfectly testable and
     still be blind to the defect it exists to catch, and that is more
     dangerous than a vague one - it survives review and goes green. -->


- **AC-1** — `.claude/tests/floors.conf` declares `floor | selftest | 100`, and
  a full `bash scripts/selftest.sh` passes with it. The suite executes 100.
- **AC-2** — The hand-copied table in `selftest.test.sh` carries a `selftest`
  row equal to the `floors.conf` value. A `floors.conf` floor for `selftest`
  that differs from the table fails the
  `and each records the executed count measured on this tree` assertion.
- **AC-3** — With `selftest.test.sh` executing fewer than 100 assertions, a
  `bash scripts/selftest.sh selftest` run fails, naming the shortfall against
  the floor of 100.

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

**Writes:** `.claude/tests/floors.conf`, `.claude/tests/selftest.test.sh`

- `floors.conf`: `floor | selftest | 54` becomes `floor | selftest | 100`. No
  other value changes.
- `selftest.test.sh`: the `COUNTS` heredoc gains `selftest 100`, in
  alphabetical position (between `refresh` and `settings`). No other row
  changes.

**Order, so the twin is watched to fail.** RED adds the table row first and
runs `bash .claude/tests/selftest.test.sh`: the twin assertion must fail with
`selftest=54(want 100)`. Then RED raises `floors.conf` and the suite goes green.
Both outputs are pasted. Everything is test-side, so **GREEN is a verified
no-op**.

**The floor itself is a gate change**, so ## Gate probes records AC-3. In
GATES, use `scripts/mutate.sh` to make one `assert_eq` in `selftest.test.sh` a
no-op (so the suite executes 99), run `bash scripts/selftest.sh selftest`, and
watch it fail with `did 99 units of work, below the floor of 100`.

**Oracle:** mechanical.

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

Planned by `bash scripts/plan.sh write HARNESS-022` from `.claude/harness/models.conf`.
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

- RED, GREEN: no dispatch; the orchestrator (`opus`, `claude-opus-5-5`) made the two one-line edits and verified that GREEN is a no-op.

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Out of scope

<!-- Explicit non-goals. Prevents the Feature Developer from over-building. -->

- Re-measuring any other suite's floor. Several are well below their executed
  counts (`plan` 42 against 242), and each is its own decision.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

<!-- Filled by the Test Developer during RED: which tests, at which level,
     and which AC each one covers. -->

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

**RED done by the orchestrator** (`opus`, `claude-opus-5-5`): two one-line edits
with nothing to design. Done in the Contract's order, so that the twin was
watched to fail.

1. Added `selftest 100` to the `COUNTS` table in `selftest.test.sh` (between
   `refresh` and `settings`), then ran `bash .claude/tests/selftest.test.sh`:

```
    FAIL and each records the executed count measured on this tree
         expected:
         actual:    selftest=54(want 100)

selftest: 99 passed, 1 failed
```

2. Raised `floors.conf` to `floor | selftest | 100`, then ran
   `bash scripts/selftest.sh selftest`:

```
selftest: 100 passed, 0 failed
assertion floors: all 1 suite(s) met their declared floor (100 assertions executed, 100 declared).
```

**GREEN is a no-op:** both files are test-side, and no script changes.

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

    run:    2026-10-02T14:50:45Z
    commit: 6933a4e (working tree had uncommitted changes)
    tree:   b31e499695dd61d53457c42f40f974ef0bf6bec1
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

**The `selftest` floor, raised to 100 (AC-3), 2026-10-02, orchestrator.**
What was broken: one `assert_eq` in `selftest.test.sh` made a no-op (`: assert_eq ...`)
with `scripts/mutate.sh`, so the suite executes 99. Gate run:
`bash scripts/selftest.sh selftest`. Reverted and verified by the script.

```
=== mutate: .claude/tests/selftest.test.sh (1 line(s) changed by s/^assert_eq "and each records the executed count measured on this tree"/: &/) ===
  541 - assert_eq "and each records the executed count measured on this tree" "" "$wrong"
  541 + : assert_eq "and each records the executed count measured on this tree" "" "$wrong"
=== mutate: running bash scripts/selftest.sh selftest ===
selftest: 99 passed, 0 failed
FAIL selftest  did 99 units of work, below the floor of 100 in .claude/tests/floors.conf
assertion floors: 0 of 1 suite(s) met their declared floor.
=== mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/.claude_tests_selftest.test.sh.20261002T143832Z.750386.bak) ===
```

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


**DONE, 2026-10-02.** Merged in #96 (merge commit 1716674), release 65. The
VERSION bump lands in this DONE commit. `phase.sh set DONE --force` was run on
`main`, overriding the branch check. PR CI: the `gates` job passed in 1m56s,
and its harness self-test step took 103s, with no `timeout-minutes` set
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37032518546).
`boundaries` passed in 5s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37032518432).
No epic.
