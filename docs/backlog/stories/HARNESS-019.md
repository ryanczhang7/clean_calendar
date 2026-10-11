---
id: HARNESS-019
title: plan.sh write reports only what the file on disk says (port of WORLD-097)
slug: plan-sh-write-reports-only-what-the-file
epic: 
type: chore
status: done
phase: DONE
branch: story/HARNESS-019-plan-sh-write-reports-only-what-the-file
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [scripts/plan.sh, .claude/tests/plan.test.sh]         # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

<!-- Why this story exists. Link the epic and any wiki pages that constrain it.
     Name the REQUIRED gate that would fail if this story's artifact broke. If
     only an optional gate can, put it in required_gates above before RED:
     every required gate once passed over a story none of them exercised. -->

A port of `fantasy-world-builder`'s WORLD-097 (FWB commits `269d0ed` RED and
`dbb29d2` GREEN, 2026-09-23). A dry run of `refresh-harness.sh` in FWB on
2026-10-01 flagged `scripts/plan.sh` and `.claude/tests/plan.test.sh` as
`LOCAL`. Refreshing FWB from release 61 would replace both and lose the fix
together with its 30 tests, so the fix comes upstream first (the
port-before-refresh rule).

The defect: `cmd_write` rendered the plan, spliced it in with an awk keyed off
`^## Model guidance`, then printed `wrote the model plan into …` and exited 0
**whether or not anything matched**. A story file without that heading (FWB's
WORLD-072 was split out of WORLD-012 by hand) passed through byte-identical
while the tool reported writing the plan. `rules.md` says a model choice with no
recorded verdict is folklore; this tool claimed the plan was recorded when it
was not. Two more defects ride with it:

- `file="$(story_file "$id")"` runs `die` inside a command substitution, so the
  die kills only the subshell. `cmd_write` then carried on with `$file` empty,
  dropped a `.new` in the project root, and printed success.
- A failed render (for example, a regular file sitting at `.claude/state`)
  spliced nothing in and **deleted** the section.

Upstream's `cmd_write`, `story_file` and `cmd_models` are byte-identical to
FWB's pre-fix copies (checked on 2026-10-01 with `diff` against FWB `783ea74`),
so the patch applies cleanly (`git apply --check`: plan.sh hunks at offset 70,
the plan.test.sh hunk at offset 14), and FWB's evidence was measured on this
exact code.

Required gate that would fail if this story's artifact broke: `unit`
(`bash scripts/selftest.sh`, which runs `plan.test.sh`).

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC.
     An AC that names a statistic, a metric or a threshold names a NEGATIVE
     CONTROL too: the deliberately broken input the metric must reject, and
     roughly what it should score. A criterion can be perfectly testable and
     still be blind to the defect it exists to catch, and that is more
     dangerous than a vague one - it survives review and goes green. -->


Carried over verbatim from FWB WORLD-097.

- **AC-1** — Given a story file with no `## Model guidance` heading, when
  `bash scripts/plan.sh write <id>` runs, then the file gains a `## Model guidance`
  section containing the rendered plan table, and the command exits 0.
  *Control:* the same run must not duplicate, reorder or drop any other `## `
  heading already in the file — compare the heading list before and after; only
  `## Model guidance` is added.
- **AC-2** — Given any story file, when `bash scripts/plan.sh write <id>` exits 0 and
  prints its success line, then the file on disk contains exactly one
  `## Model guidance` section and that section's body is the rendered plan. When
  that is not true of the file after the run, the command exits non-zero and prints
  no success line.
  *Controls, both required:* (a) the heading-less fixture must **fail** against
  today's `plan.sh` and pass against the fix; (b) a run in which the render is made
  to fail — so the splice cannot produce a plan — must exit non-zero, leave no
  `<id>.md.new` behind, and print no success line.
- **AC-3** — Given a story file that already has a `## Model guidance` heading, when
  `bash scripts/plan.sh write <id>` runs, then the section is **replaced**, not
  appended to, and exactly one `## Model guidance` heading remains. Running it twice
  in a row leaves the file identical to running it once.
  *Control:* a story with the heading as the **last** section in the file (nothing
  after it) must also end with exactly one, and must not lose its trailing content.
- **AC-4** — Given a story id that does not resolve to a file, when
  `bash scripts/plan.sh write <id>` runs, then it exits non-zero and names the path
  it looked for, and prints no success line.

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

**Writes:** `scripts/plan.sh`, `.claude/tests/plan.test.sh`

The port is the downstream diff, applied as it stands:

- RED: `git diff 783ea74 HEAD -- .claude/tests/plan.test.sh`, taken in FWB and
  applied here with `git apply`. This is the WORLD-097 block plus nothing else:
  it is the only change to that file in FWB since its release-45 refresh.
- GREEN: `git diff 783ea74 HEAD -- scripts/plan.sh` from FWB, applied the same
  way. It changes `cmd_write` and nothing else.

No re-measured constants are needed. The block pins no file counts and no
`file:line` lists, and it reads only fixtures it builds itself. If any assertion
fails here for a reason other than the defect, that is a finding and stops the
port.

**Earning what passes on arrival.** FWB found 14 of the 30 assertions green
against the pre-fix code and earned 12 of them with four mutations (M1, M2', M4,
M5 in WORLD-097's ## Regressions). The code is byte-identical here, so that
evidence carries over. This tree re-runs one of them, M2', as a spot check (the
budget in `rules.md`). The other two passes-on-arrival (15 and 17) are GREEN's
to confirm, as they were in FWB.

**Callers:** none. No signature changes; `cmd_write` keeps its interface, and
its only callers are the `write` dispatch and the docs that name the command.

**Oracle:** everything is mechanical.

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

- **Defect put back: the post-condition.** With the candidate check in the
  fixed `cmd_write` made always to pass, AC-2 control (a) (the heading-less
  story) still passes, because the append covers it. So the defect put back is
  the original one: the END-append removed. The heading-less fixture MUST then
  fail on its exit status or its success line. RED cannot run this, because the
  fix does not exist yet. **Owner: GATES**, with `scripts/mutate.sh` against
  `bash .claude/tests/plan.test.sh`.

  **Result (GATES, 2026-10-01, orchestrator):** run as planned. With the
  END-append removed, the heading-less fixture fails, and "and the command exits 0"
  fails with it: the post-condition now refuses rather than reporting a success it
  did not achieve. Restored.

  ```
  === mutate: scripts/plan.sh (1 line(s) changed by /END { if (!matched)/s#END {.*#END { }#) ===
    404 -     END { if (!matched) { print ""; while ((getline line < planfile) > 0) print line } }
    404 +     END { }
  === mutate: running bash .claude/tests/plan.test.sh ===
      FAIL AC-1: a story with no heading gains exactly one `## Model guidance`
      FAIL AC-1: and the command exits 0
      FAIL AC-1: the section's body is the rendered plan, byte for byte
      FAIL AC-1: it says which command planned it, from which file
      FAIL AC-1: it carries the table header
      FAIL AC-1: and the RED row from models.conf
      FAIL AC-1: and the Resolved marker
      FAIL AC-1: and the comment beneath it
      FAIL AC-2 (a): exit / success lines / headings agree on a story that had no heading
      FAIL AC-3: the section a heading-less story gained is replaced on the next run, not appended again
  plan: 232 passed, 10 failed
  === mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_plan.sh.20261001T185037Z.2499803.bak) ===
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

Planned by `bash scripts/plan.sh write HARNESS-019` from `.claude/harness/models.conf`.
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

- RED: no dispatch; the orchestrator (`opus`, `claude-opus-5-5`) applied the ported test patch, since there was nothing to design.
- GREEN: no dispatch; the orchestrator applied the ported source patch unchanged.

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

**RED done by the orchestrator, by applying the port.** The test-developer was
not dispatched because there was nothing to design: the tests are FWB's
WORLD-097 block, applied with `git apply` (hunk at offset 14), unchanged. The
file's only other change is that hunk.

**Command:** `bash .claude/tests/plan.test.sh`

**Failure output, unfixed `plan.sh`, 2026-10-01:** `plan: 226 passed, 16 failed`.
These are the same 16 that FWB recorded: every AC-1 assertion (no heading, so
nothing is written), AC-2 (a) and (b), the AC-3 heading-less re-run, and AC-4
(the `die` inside a command substitution does not reach the script). That is
the right failure, because each is the defect described in ## Context. 212
existing assertions plus 14 that pass on arrival make 226.

**Passing on arrival, earned.** FWB earned 12 of the 14 with four mutations
(WORLD-097 ## Regressions: M1, M2', M4, M5) against code that is byte-identical
here. This tree re-ran M2' as the spot check:

```
=== mutate: scripts/plan.sh (1 line(s) changed by s|) print line; skip = 1; next }|) print line; print "## Model guidance"; skip = 1; next }|) ===
  359 -     /^## Model guidance/ { while ((getline line < planfile) > 0) print line; skip = 1; next }
  359 +     /^## Model guidance/ { while ((getline line < planfile) > 0) print line; print "## Model guidance"; skip = 1; next }
    FAIL AC-2: exit / success lines / headings agree on a story that had one
    FAIL AC-3: an existing section is replaced, leaving exactly one heading
    FAIL AC-3: writing twice leaves the file identical to writing once
    FAIL AC-3 control: a heading that is the last section still ends up as exactly one
    FAIL AC-3 control: and the file ends with the plan's last line, not short of it
plan: 221 passed, 21 failed        (the 16 baseline reds omitted above; 16 + 5 = 21)
=== mutate: command exited 1; restored (verified byte-for-byte ...) ===
```

These are exactly the 5 new reds FWB recorded for M2'. The remaining two
passes on arrival, 15 (`.new` absent) and 17 (temp leftovers), are GREEN's to
confirm, as in FWB.

**GREEN applies** FWB's `scripts/plan.sh` diff (`cmd_write` only), hunks at
offset 70. Expected result: `plan: 242 passed, 0 failed`.

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

    run:    2026-10-01T18:58:58Z
    commit: 998c3a8 (working tree had uncommitted changes)
    tree:   e84a12150bb2b1279ccc7b3202bd374e6f00b1cc
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


### GREEN (orchestrator, 2026-10-01)

Applied FWB's `scripts/plan.sh` diff with `git apply` (hunks at offset 70),
with no edits. `plan: 242 passed, 0 failed`; that includes passes-on-arrival 15
and 17, confirmed. `check-sigpipe`: 41 files, 0 findings. `check-grep-count`:
41 files, 0 findings. `grep-count` 20/0 and `sigpipe` 82/0.

**DONE, 2026-10-01.** Merged in #93 (merge commit 3f3eaad), release 62. The
VERSION bump lands in this DONE commit, as for HARNESS-018. `phase.sh set DONE
--force` was run on `main`, overriding the branch check. PR CI: the `gates` job
passed in 1m48s, and its harness self-test step took 92s (72s on #92), with no
`timeout-minutes` set
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/36917356082).
`boundaries` passed in 5s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/36917356091).
Next: refresh fantasy-world-builder from this release, which is why the port
was made. No epic, so no `/audit-mutations` recommendation.
