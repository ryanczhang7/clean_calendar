---
id: HARNESS-005
title: phase.sh refuses an invalid phase and keeps frontmatter in step
slug: phase-sh-refuses-an-invalid-phase-and-ke
epic: 
type: chore
status: done
phase: DONE
branch: story/HARNESS-005-phase-sh-refuses-an-invalid-phase-and-ke
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [scripts/phase.sh, .claude/hooks/lib.sh, .claude/tests/phase.test.sh, .claude/tests/phase-guard.test.sh]  # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

<!-- Why this story exists. Link the epic and any wiki pages that constrain it.
     Name the REQUIRED gate that would fail if this story's artifact broke. If
     only an optional gate can, put it in required_gates above before RED:
     every required gate once passed over a story none of them exercised. -->

Filed from `docs/wiki/audits/enforcement-mutants-2026-09-15.md`, cluster C5.

`scripts/phase.sh` is the only supported way to change phase, and it writes two
things that must agree: the machine state the hooks read and the story's
frontmatter. Two mutants survive `bash .claude/tests/phase.test.sh`
(24 assertions, 24 passed):

1. `scripts/phase.sh:33` — `if (t == p)` → `if (t ~ p)` in `valid_phase`. The
   comment three lines above this function records the production defect it
   exists to prevent: "`GREEN.` matched the GREEN row, was written into the state
   file, and `phase_allows` - finding no row for it - fell back to 'unknown
   phase, do not block'. The lock off, by typo." The suite's one negative control
   for it is `phase set T-11 'GREEN.'` at `.claude/tests/phase.test.sh:75`, and
   that input does **not** discriminate the two implementations: as an awk regex,
   `GREEN.` requires a sixth character and so fails to match the row `GREEN`
   under `~` just as it fails under `==`. The inputs that do discriminate are the
   ones where the typo is a *prefix or substring* of a real phase - `GREE`,
   `RE`, `D`, or `.` - all of which `~` accepts. `cmd_set` uppercases its
   argument, so `gree` reaches `valid_phase` as `GREE`. A test named for the
   property it checks, using an input that cannot fail, is the shape this story
   exists to replace.
2. `scripts/phase.sh:165` — `set_frontmatter "$file" branch "$branch"` replaced
   by `true`. The frontmatter `branch:` is what `check-boundaries.sh` uses to
   decide which story claims a branch (section 3, lines 122-137); with no
   claimant, eight checks are skipped. `new-story.sh:30` also writes `branch:`,
   so in the common path this write is redundant - it is load-bearing only for a
   story file written or edited by hand, or one whose branch changed. Confirm
   which before deciding whether AC-2 is worth a test or the line is worth
   deleting.

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

- **AC-1** — Given a story at RED, when `phase.sh set <id> GREE` is run (a phase
  name that is a strict prefix of a configured one), then it exits non-zero
  saying "unknown phase", the story's frontmatter phase is still RED, and
  `.claude/state/current-story.env` still says `PHASE=RED`. Kills:
  `scripts/phase.sh:33` `s#if (t == p)#if (t ~ p)#`. The existing control
  `'GREEN.'` does not, and must be kept alongside rather than replaced.
- **AC-2** — Given a story file whose frontmatter has no `branch:` key, when
  `phase.sh set <id> RED` succeeds, then the file afterwards carries a `branch:`
  equal to the branch recorded in `.claude/state/current-story.env`. Kills:
  `scripts/phase.sh:165` `s#set_frontmatter "$file" branch "$branch"#true#`.
- **AC-3** — Given a phase name that is a regex metacharacter matching any row
  (`.`), when `phase.sh set <id> .` is run, then it is refused as an unknown
  phase.

- **AC-4** — Given a `current-story.env` whose `PHASE` is a value
  `phases.conf` does not list (`GREE`, `ZZZ`, empty), when the phase guard is
  asked to allow a `Write` to a `source` path, then it is **refused**, and the
  reason names the phase it could not recognise. Measured on the real hook
  today: `PHASE=RED` denies, and `GREE`, `ZZZ` and empty all **allow** — so
  `phase.sh`'s validation is the only thing between a typo and a silent lock,
  and this AC is the second defence that does not currently exist. *Control:*
  `PHASE=GREEN` must still allow the same write, or the fix has simply frozen
  the tree.
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


### Closed as already delivered (2026-10-01)

1. **PO decision, approved by the user:** closed without a RED→GREEN cycle.
   Delivered by commit `a23abac` ("The lock opened on a typo, at two layers"),
   which also built AC-4's fail-closed `phase_allows` in `.claude/hooks/lib.sh`.
   No source or test file changes in the closing commit.
   `phase.sh set HARNESS-005 DONE --force` was run on `main`, overriding the
   branch check, because there is no story branch.
2. Line numbers in ## Context have drifted: the `branch:` write is now at
   `phase.sh:182`, and the fail-closed return at `lib.sh:1196`. The Context's
   open question ("worth a test or worth deleting") was settled as worth a
   test, because the write is load-bearing for a story file written by hand,
   which is the fixture the test builds. The criteria are unchanged and every
   one is met as written.

| AC | Test |
|---|---|
| AC-1 | `phase.test.sh` "a phase name that is a prefix of a real one is refused: GREE" (and RE, D), "and after all of them the story is still RED", "and so is the state the hooks read"; the `'GREEN.'` control is kept at `:75` |
| AC-2 | `phase.test.sh` "and the branch key is written into the frontmatter", "matching the branch the hooks were told about" |
| AC-3 | `phase.test.sh` "so is a regex metacharacter matching any row" |
| AC-4 | `phase-guard.test.sh` "PHASE=GREE/ZZZ/GREEN. refuses a source write" (each also checks that the reason names the phase), "an empty PHASE refuses a source write"; control "while a phase the table DOES list still allows it" |

Mutants re-run on 2026-10-01 with `scripts/mutate.sh`, each against the suite
that holds its assertion:

```
=== mutate: scripts/phase.sh (1 line(s) changed by s#if (t == p)#if (t ~ p)#) ===
    FAIL a phase name that is a prefix of a real one is refused: GREE
    FAIL a phase name that is a prefix of a real one is refused: RE
    FAIL a phase name that is a prefix of a real one is refused: D
    FAIL so is a regex metacharacter matching any row
    FAIL and after all of them the story is still RED
    FAIL and so is the state the hooks read
phase: 27 passed, 6 failed
=== mutate: command exited 1; restored (verified byte-for-byte ...) ===

=== mutate: scripts/phase.sh (1 line(s) changed by s#^  set_frontmatter "$file" branch "$branch"#  true#) ===
    FAIL and the branch key is written into the frontmatter
    FAIL matching the branch the hooks were told about
phase: 31 passed, 2 failed
=== mutate: command exited 1; restored (verified byte-for-byte ...) ===

=== mutate: .claude/hooks/lib.sh (1 line(s) changed by /An unrecognised phase is not an absent one\./,/^}/s#^  return 1$#  return 0#) ===
  1196 -   return 1
  1196 +   return 0
    FAIL PHASE=GREE refuses a source write
    FAIL PHASE=ZZZ refuses a source write
    FAIL PHASE=GREEN. refuses a source write
    FAIL an empty PHASE refuses a source write
phase-guard: 296 passed, 4 failed
=== mutate: command exited 1; restored (verified byte-for-byte ...) ===
```
