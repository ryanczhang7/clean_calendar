---
id: HARNESS-002
title: Production code cannot arrive without tests or an inventory
slug: production-code-cannot-arrive-without-te
epic: 
type: chore
status: done
phase: DONE
branch: story/HARNESS-002-production-code-cannot-arrive-without-te
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [.claude/tests/boundaries.test.sh]  # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

<!-- Why this story exists. Link the epic and any wiki pages that constrain it.
     Name the REQUIRED gate that would fail if this story's artifact broke. If
     only an optional gate can, put it in required_gates above before RED:
     every required gate once passed over a story none of them exercised. -->

Filed from `docs/wiki/audits/enforcement-mutants-2026-09-15.md`, cluster C2.

Section 3a of `check-boundaries.sh` is the commit-level enforcement of CLAUDE.md
law 1 ("No production code without a failing test that demanded it") and of the
bootstrap exception in `rules.md` ("`check-boundaries.sh` refuses the PR if a
changed source file is missing from that list"). Three mutants show that no
test exercises any branch of it. The first was confirmed against the whole
selftest (566 assertions, 13 suites) and survived:

1. `scripts/check-boundaries.sh:146` — `[ "$src" -gt 0 ] && [ "$tst" -eq 0 ]`
   replaced by `false`. Every PR then takes the `else` branch and reports
   `ok    source changes accompanied by test changes (N source, 0 test)`, which
   is the message a *correct* PR gets. Law 1 is unenforced at the commit.
2. `scripts/check-boundaries.sh:151` — the `if !` on the empty-inventory check
   inverted, so a `bootstrap`/`chore`/`spike` story with a completely empty
   `## Scaffold inventory` passes.
3. `scripts/check-boundaries.sh:157` — the per-file `grep -qF -- "$p"` short-circuited,
   so the inventory need not name any of the source files actually changed.

`.claude/tests/boundaries.test.sh` contains no story fixture that changes source
without changing tests, and none that omits a file from its inventory. The string
"Production code ships with the test that demanded it" appears nowhere in the
suite.

Required gate that would fail if this story's artifact broke: `unit`
(`bash scripts/selftest.sh`).

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC.
     An AC that names a statistic, a metric or a threshold names a NEGATIVE
     CONTROL too: the deliberately broken input the metric must reject, and
     roughly what it should score. A criterion can be perfectly testable and
     still be blind to the defect it exists to catch, and that is more
     dangerous than a vague one - it survives review and goes green. -->

- **AC-1** — Given a `feature` story whose diff changes a source file and no
  test file, when `check-boundaries.sh` runs, then it FAILs with "Production
  code ships with the test that demanded it" and exits non-zero. Kills:
  `scripts/check-boundaries.sh:146`
  `s#\[ "$src" -gt 0 \] && \[ "$tst" -eq 0 \]#false#`.
- **AC-2** — Given a `chore` story whose diff changes a source file and no test
  file, and whose `## Scaffold inventory` is empty or template-only, when
  `check-boundaries.sh` runs, then it FAILs naming the empty inventory. Kills:
  `scripts/check-boundaries.sh:151` `151s#if ! #if #`.
- **AC-3** — Given a `chore` story whose `## Scaffold inventory` names one file
  while the diff changes two source files, when `check-boundaries.sh` runs, then
  it FAILs naming the file that is missing from the list. Kills:
  `scripts/check-boundaries.sh:157` `157s#grep -qF -- "$p" ||#true ||#`.
- **AC-4** — Given a `bootstrap` or `chore` story whose inventory names every
  changed source file, when `check-boundaries.sh` runs, then it reports
  "every changed source file is named in ## Scaffold inventory" and does not
  FAIL — so AC-2 and AC-3 are not satisfied by a check that refuses everything.

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
   Delivered on 2026-09-15 by commit `9fbd39d` ("Construct the violating input
   for law 1 and law 3", closes #24). No source or test file changes in the
   closing commit. `phase.sh set HARNESS-002 DONE --force` was run on `main`,
   overriding the branch check, because there is no story branch.
2. **AC-4 reading, approved by the user:** "does not FAIL" is read as *the
   inventory rule does not fail*, which is the purpose the criterion states
   ("so AC-2 and AC-3 are not satisfied by a check that refuses everything").
   The control fixture has no `## Gate results`, so the run as a whole still
   FAILs on the gate-record rule; the control asserts the inventory rule's `ok`
   line, and mutants 1 and 2 below turn that assertion red.
3. Line numbers in ## Context have drifted (the rule now sits at
   `check-boundaries.sh:223-239`) and the per-file check is now an `awk`, not
   `grep -qF`. The mutants below are anchored on today's code. The criteria are
   unchanged.

Criteria against tests, all in `.claude/tests/boundaries.test.sh`:

| AC | Test |
|---|---|
| AC-1 | "a feature story whose source moved alone" (`refused`, so exit status checked too) |
| AC-2 | "a chore with a template-only inventory" |
| AC-3 | "a source file missing from the inventory", "and the refusal names the file it missed" |
| AC-4 | "an inventory naming every file is accepted" |

Mutants re-run on 2026-09-30 with `scripts/mutate.sh` against
`bash .claude/tests/boundaries.test.sh`:

```
=== mutate: scripts/check-boundaries.sh (1 line(s) changed by s#\[ "$src" -gt 0 \] \&\& \[ "$tst" -eq 0 \]#false#) ===
    FAIL a feature story whose source moved alone
    FAIL a chore with a template-only inventory
    FAIL a source file missing from the inventory
    FAIL and the refusal names the file it missed
    FAIL an inventory naming every file is accepted
boundaries: 75 passed, 5 failed
=== mutate: command exited 1; restored (verified byte-for-byte ...) ===

=== mutate: scripts/check-boundaries.sh (1 line(s) changed by /| has_content; then/s#if ! #if #) ===
    FAIL a chore with a template-only inventory
    FAIL a source file missing from the inventory
    FAIL and the refusal names the file it missed
    FAIL an inventory naming every file is accepted
boundaries: 76 passed, 4 failed
=== mutate: command exited 1; restored (verified byte-for-byte ...) ===

=== mutate: scripts/check-boundaries.sh (1 line(s) changed by /|| missing="\$missing \$p"/s#awk .* ||#true ||#) ===
    FAIL a source file missing from the inventory
    FAIL and the refusal names the file it missed
boundaries: 78 passed, 2 failed
=== mutate: command exited 1; restored (verified byte-for-byte ...) ===
```
