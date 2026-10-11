---
id: HARNESS-001
title: Gate record tree stamp is verified end to end
slug: gate-record-tree-stamp-is-verified-end-t
epic: 
type: chore
status: done
phase: DONE
branch: story/HARNESS-001-gate-record-tree-stamp-is-verified-end-t
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [.claude/tests/boundaries.test.sh, .claude/tests/gates.test.sh]  # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

<!-- Why this story exists. Link the epic and any wiki pages that constrain it.
     Name the REQUIRED gate that would fail if this story's artifact broke. If
     only an optional gate can, put it in required_gates above before RED:
     every required gate once passed over a story none of them exercised. -->

Filed from `docs/wiki/audits/enforcement-mutants-2026-09-15.md`, cluster C1.

CLAUDE.md law 3 says "`## Gate results` ... carries the commit and a hash of the
code the gates ran against, and `check-boundaries.sh` refuses a PR where that
hash does not match the code being merged". Three mutants show that no test
observes any part of that sentence. All three survive the whole selftest (566
assertions, 13 suites):

1. `scripts/gates.sh:191` — `tree="$(gate_tree_hash)"` replaced by the constant
   `tree=0000000`. Every record the harness writes then carries a stamp that
   describes no tree at all.
2. `scripts/check-boundaries.sh:294` — `[ -n "$rec" ] && [ "$rec" = "$now" ]`
   replaced by `true`. The comparison that is supposed to refuse the PR accepts
   every stamp, including one for a different tree.
3. `.claude/hooks/lib.sh:637` — the tree hash stops covering `test` files, so a
   test edited after the last full gate run leaves the recorded hash matching.

The reason 2 survives is structural and applies to the whole of `check-boundaries.sh`:
`boundaries()` in `.claude/tests/boundaries.test.sh:23` captures the script's
output and never its exit status, and every assertion is an `assert_contains` on
a substring. A rule that stops firing is invisible unless some test constructs
the violating input and asserts on the refusal text. No test constructs a
stamp/tree mismatch.

Required gate that would fail if this story's artifact broke: `unit`
(`bash scripts/selftest.sh` — the harness's own suites).

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC.
     An AC that names a statistic, a metric or a threshold names a NEGATIVE
     CONTROL too: the deliberately broken input the metric must reject, and
     roughly what it should score. A criterion can be perfectly testable and
     still be blind to the defect it exists to catch, and that is more
     dangerous than a vague one - it survives review and goes green. -->

- **AC-1** — Given a story whose `## Gate results` was written by a real
  `gates.sh` run, when a source, test or config file changes afterwards and
  `check-boundaries.sh` runs, then it reports a FAIL naming the recorded tree
  and the current one. Kills: `scripts/check-boundaries.sh:294`
  `s#\[ "$rec" = "$now" \]#true#`.
- **AC-2** — Given the same story, when `gates.sh` records its result, then the
  `tree:` line it writes equals `gate_tree_hash` for that tree and is not a
  constant. Kills: `scripts/gates.sh:191`
  `s#tree="\$(gate_tree_hash)"#tree=0000000#`.
- **AC-3** — Given a recorded gate run, when only a **test** file changes
  afterwards, then the recorded tree hash no longer matches and
  `check-boundaries.sh` says so. Kills: `.claude/hooks/lib.sh:637`
  `s#'{ print "C#'$1 != "test" { print "C#`.
- **AC-4** — Given any invocation of `check-boundaries.sh` in the harness's own
  suite, when the script reports at least one FAIL, then the test observes a
  non-zero exit status. (The helper at `.claude/tests/boundaries.test.sh:23`
  currently discards it, which is why AC-1 has no test today.)

## Contract

<!-- Written by the Lead PO BEFORE RED, and AMENDABLE BY RED IN PLACE with a
     reason - GREEN then builds what the amended block says. This is where "RED
     tested one shape and GREEN built another" is prevented, and it is not the
     acceptance criteria: the criteria are frozen and change only through
     ## Amendments; this is a working agreement RED is expected to sharpen.
     One block per thing the story touches:
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
       * THE PHASE THAT OWNS IT, by name. check-boundaries.sh refuses a PR
         whose block names no phase
       * the RESULT, pasted, once that phase runs it: what was mutated, what
         failed, and that the file was restored - or the word WAIVED with the
         reason. check-boundaries.sh refuses a PR that has neither
     Schedule it into GATES rather than RED where you can: source is writable
     there, and a story that bounced back to RED mid-cycle gets its corrected
     assertions earned by the same mutation, for free. Do THREE mutations rather
     than one, and make one of them a wrong VALUE rather than a missing field: a
     suite that catches an omission can be blind to a corruption, and a codec
     that is uniformly wrong round-trips through itself perfectly. -->

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

<!-- Optional, written by the Lead PO BEFORE the phase it applies to. Use it
     when a phase of this story is worth running on a different model from the
     default, and make it falsifiable rather than folklore:
       * which phase, which model, and why that phase specifically
       * THE RESOLVED MODEL ACTUALLY DISPATCHED, by name - never the word
         "default". An agent definition's `model:` field, or the session's
         setting, or an override: the orchestrator cannot see which won unless
         it records it. Two stories once compared "the default model" against a
         stronger one, and neither could say what the default had resolved to,
         so the comparison may have been the stronger model against itself
       * what the orchestrator should stay on
       * HOW to brief it differently - a model chosen for judgement wants the
         criteria and the constraints, not a pre-decided test design
       * the ORACLE PARTITION of the criteria: which are settled (read the
         numbers out, do not calibrate), which are oracle-free (invent the
         metric and demand a negative control that fires hard), which are
         mechanical (pin exactly). Measured to matter more than the model
       * a success condition that could come out either way
     Then record the VERDICT against that condition when the phase ends, with
     evidence. The verdict is the part that gets skipped, and without it a model
     choice becomes a habit nobody can argue with. -->

## Out of scope

<!-- Explicit non-goals. Prevents the Feature Developer from over-building. -->

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

<!-- Written by scripts/gates.sh itself on every full run, stamped with the
     commit and a hash of the code it ran against. Do not paste or edit it:
     check-boundaries.sh refuses a PR whose recorded run does not match the
     code being merged. -->

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


### Closed as already delivered (2026-09-30)

1. **PO decision, approved by the user:** closed without a RED→GREEN cycle.
   The work was delivered on 2026-09-15 by commit `9fbd39d` ("Construct the
   violating input for law 1 and law 3", closes #23) and this file was never
   moved past PLANNED. A cycle would have re-written tests that already exist.
   No source or test file changes in the closing commit.
2. `phase.sh set HARNESS-001 DONE --force` was run on `main`, overriding the
   branch check: there is no story branch because there is no code change.
3. Line numbers in ## Context have drifted (`gates.sh:214`,
   `check-boundaries.sh:371`) and `lib.sh`'s tree filter is now `gated_stdin`,
   so AC-3's `Kills:` expression no longer applies literally. The equivalent
   mutant below removes `test` from that filter. The criteria are unchanged.

Criteria against the tests that cover them, all in `.claude/tests/boundaries.test.sh`
(block "the gate record is a stamp on a tree, not a sentence about one"):

| AC | Test |
|---|---|
| AC-1 | "a stamp describing a different tree is refused" |
| AC-2 | "and the stamp gates.sh wrote IS that hash", "a record made against this tree matches it" |
| AC-3 | "a test changing alone breaks the stamp too" |
| AC-4 | `run_boundaries` sets `$rc`; `refused` fails any refusal that exits 0 |

The three mutants, re-run on 2026-09-30 with `scripts/mutate.sh` against
`bash .claude/tests/boundaries.test.sh`:

```
=== mutate: scripts/check-boundaries.sh (1 line(s) changed by s#\[ "$rec" = "$now" \]#true#) ===
    FAIL a stamp describing a different tree is refused
    FAIL a test changing alone breaks the stamp too
    FAIL AC-2 control: a committed source change is refused locally
    FAIL AC-2 control: and refused by CI's computation too
boundaries: 76 passed, 4 failed
=== mutate: command exited 1; restored (verified byte-for-byte ...) ===

=== mutate: scripts/gates.sh (1 line(s) changed by s#tree="$(gate_tree_hash)"#tree=0000000#) ===
    FAIL and it is not refused
    FAIL and the run is clean
    FAIL a record made against this tree matches it
         FAIL  story T-1: gates were recorded against tree '0000000' but the working tree is 'bfe08067af327107b0c43f4cf8edfde282efedc5'. ...
    FAIL and the stamp gates.sh wrote IS that hash
    FAIL AC-2: an untracked gated file does not spoil the local verdict
    (more; output truncated by the filter)

=== mutate: .claude/hooks/lib.sh (1 line(s) changed by s#($1 == "source" || $1 == "test" ||#($1 == "source" ||#) ===
    FAIL a test changing alone breaks the stamp too
boundaries: 79 passed, 1 failed
=== mutate: command exited 1; restored (verified byte-for-byte ...) ===
```

After the runs, `git status` showed no tracked file modified and no `.bak` was
left under `.claude/state/mutations/`.
