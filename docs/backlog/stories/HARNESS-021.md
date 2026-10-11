---
id: HARNESS-021
title: The real-tree floor check counts project-floors.conf too
slug: the-real-tree-floor-check-counts-project
epic: 
type: fix
status: done
phase: DONE
branch: story/HARNESS-021-the-real-tree-floor-check-counts-project
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [.claude/tests/selftest.test.sh]         # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

<!-- Why this story exists. Link the epic and any wiki pages that constrain it.
     Name the REQUIRED gate that would fail if this story's artifact broke. If
     only an optional gate can, put it in required_gates above before RED:
     every required gate once passed over a story none of them exercised. -->

Found on 2026-10-01 refreshing `fantasy-world-builder` (FWB) to release 63, the
release that shipped HARNESS-020. FWB declares floors for its five
`project-*.test.sh` suites in `.claude/tests/project-floors.conf`, as HARNESS-020
intends, and `scripts/selftest.sh`'s own audit accepts them. But one assertion in
upstream's `selftest` suite still fails in FWB:

```
  AC-6/AC-7  the shipped floors file covers every suite, at its count
    FAIL every suite in .claude/tests has a floor
         expected:
         actual:    project-ci project-handoff project-harness-deps project-sections project-sigpipe
selftest: 94 passed, 1 failed
```

`.claude/tests/selftest.test.sh:406-429` walks the **real** tree's suites and looks
each one up in `floors.conf` only, through its own private `floor_of`. Upstream
has no `project-*` suites, so the check passed here and HARNESS-020 shipped green.
In any consuming project that uses HARNESS-020 as designed, it fails. This is the
`rules.md` case of a rule probed only against the tree that wrote it.

This is a defect in a **test**, not in `selftest.sh`. The production audit
already handles both files.

Required gate that would fail if this story's artifact broke: `unit`
(`bash scripts/selftest.sh`, which runs `selftest.test.sh`).

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC.
     An AC that names a statistic, a metric or a threshold names a NEGATIVE
     CONTROL too: the deliberately broken input the metric must reject, and
     roughly what it should score. A criterion can be perfectly testable and
     still be blind to the defect it exists to catch, and that is more
     dangerous than a vague one - it survives review and goes green. -->


- **AC-1** — Given a tree whose `.claude/tests` holds a suite floored only in
  `.claude/tests/project-floors.conf`, when the `selftest` suite's
  "every suite has a floor" check runs against that tree, then the suite is
  **not** reported missing.
- **AC-2** — Given a tree with a suite floored in neither file, the same check
  reports that suite as missing. *Control:* without it, a check that reports
  nothing satisfies AC-1.
- **AC-3** — Given a tree with no `project-floors.conf`, the check behaves
  exactly as before: a suite missing from `floors.conf` is reported. And this
  repository's real tree still passes the check.

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

**Writes:** `.claude/tests/selftest.test.sh`

- The real-tree loop becomes a helper that takes a root:
  `suites_without_floor <root>`. It prints the space-joined names of the suites
  in `<root>/.claude/tests/*.test.sh` that have a floor line in neither
  `<root>/.claude/tests/floors.conf` nor, when it exists,
  `<root>/.claude/tests/project-floors.conf`. The existing assertion calls it
  with `$REPO_ROOT`, under the same name and message.
- AC-1 to AC-3 are fixture cases: a throwaway root holding just the
  `.claude/tests` files the helper reads (empty suite files are enough, since
  the helper reads names, not contents).
- `floor_of`'s one-awk shape stays, because check-sigpipe flagged the earlier
  pipeline. It takes a file argument.

**Watched to fail.** RED first lands the helper with today's logic (floors.conf
only) plus the fixture cases, and runs them: AC-1 must be red. Only then does it
extend the helper to read `project-floors.conf`, and AC-1 goes green. Both runs
are pasted in the handoff. Everything here is test code, so **GREEN is a
verified no-op**, done by the orchestrator, not dispatched.

**The FWB fact.** After the change, the fixed `selftest.test.sh` copied into
FWB's refresh branch must pass there. That is checked when FWB is refreshed to
the release that ships this, and is recorded in FWB's refresh PR, not here.

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

- **Defect put back.** With the `project-floors.conf` read removed from
  `suites_without_floor`, AC-1's fixture case MUST fail and AC-2/AC-3 stay
  green. **Owner: GATES**, with `scripts/mutate.sh` against
  `bash .claude/tests/selftest.test.sh`. RED's first run shows the same thing

  **Result (GATES, 2026-10-01, orchestrator):** exactly the two AC-1
  assertions red, AC-2/AC-3 and the real-tree check green. Restored.

  ```
  === mutate: .claude/tests/selftest.test.sh (1 line(s) changed by s/\[ -f "\$_swf_dir\/project-floors.conf" \]/false/) ===
    439 -     if [ -f "$_swf_dir/project-floors.conf" ]; then
    439 +     if false; then
  === mutate: running bash .claude/tests/selftest.test.sh ===
      FAIL a suite floored in project-floors.conf alone is not reported as missing a floor
      FAIL beside an unfloored suite, only the unfloored one is reported
  selftest: 98 passed, 2 failed
  === mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/.claude_tests_selftest.test.sh.20261002T015836Z.318206.bak) ===
  ```
  before the helper was extended; GATES shows it against the committed code.

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

Planned by `bash scripts/plan.sh write HARNESS-021` from `.claude/harness/models.conf`.
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

- RED: `test-developer` resolved to `opus` (`claude-opus-5-5`, agent definition; no override). Verdict: AC-1 red against the old helper, green once extended; the orchestrator confirmed `selftest 100/0` here and inside FWB's refreshed tree.
- GREEN: no dispatch. A verified no-op, because every change is test code (`git diff --stat` touches only `.claude/tests/selftest.test.sh` and this story).

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Out of scope

<!-- Explicit non-goals. Prevents the Feature Developer from over-building. -->

- Any change to `scripts/selftest.sh`. Its audit is already correct.
- A general sweep for other real-tree assertions. A grep on 2026-10-01 found
  `floors.conf` read against the real tree only at `selftest.test.sh:410`.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

All in `.claude/tests/selftest.test.sh`, block "AC-6/AC-7 the shipped floors file
covers every suite, at its count". Level: unit (a shell helper called directly on
throwaway roots under `$FIX/floor-roots/<case>`; empty suite files and the floors
files only). Every needle compares the helper's **whole output** with `assert_eq`,
never a substring.

| Assertion | AC | Red under old helper? |
|---|---|---|
| `every suite in .claude/tests has a floor` - real tree, now `suites_without_floor "$REPO_ROOT"` (same name, same message) | AC-3 (2nd half) | no - green, the regression guard |
| `a suite floored in project-floors.conf alone is not reported as missing a floor` - root {alpha in floors.conf, project-mine in project-floors.conf} -> `""` | AC-1 | **yes** |
| `beside an unfloored suite, only the unfloored one is reported` - root {alpha / project-mine / project-orphan floored nowhere} -> `"project-orphan"` | AC-1 (and AC-2's shape) | **yes** |
| `a suite floored in neither file is reported, and only that suite` - root {alpha in floors.conf, project-orphan nowhere, project-floors.conf present but comment-only} -> `"project-orphan"` | AC-2 (control) | no - green under both, by design |
| `with no project-floors.conf, a suite missing from floors.conf is reported` - {alpha, gamma floored; beta not} -> `"beta"` | AC-3 | no |
| `and several missing suites are reported space-joined, in name order` - {alpha floored; beta, gamma not} -> `"beta gamma"` | AC-3 | no |

## Handoff: RED -> GREEN

**GREEN is a verified no-op** (Contract): everything here is test code, and the
helper was extended in RED after its red run was observed, as the Contract
directs. No production file was touched; `scripts/selftest.sh` is unchanged.

**Command:** `bash .claude/tests/selftest.test.sh` (about 65 s locally). Also
`bash scripts/selftest.sh selftest` for the floor.

**Files touched:** `.claude/tests/selftest.test.sh` and this story's `## Test plan` /
`## Handoff`. Nothing else. No `project-floors.conf` was created in the real tree.

**Shape pinned (test-local, no export):**
- `floor_of <suite> <file>` - one awk, prints the recorded floor or nothing. Now
  takes the file as `$2`; its three other callers (the COUNTS loop, the profiles
  and lib assertions) pass `"$REAL"` (floors.conf) explicitly.
- `suites_without_floor <root>` - prints the space-joined names (glob order, no
  leading space, no trailing newline) of `<root>/.claude/tests/*.test.sh` suites
  with a floor in neither `floors.conf` nor, if it is a file, `project-floors.conf`.
- `floor_root <case> <suite>...` - fixture builder, prints the root.
- Not constrained: whether a suite floored in BOTH files is reported (it is not;
  that fault is `selftest.sh`'s, HARNESS-020 AC-3(c)).

### Run 1 - helper with TODAY's logic (floors.conf only), fixture cases added

Relevant section, verbatim (other blocks printed no FAIL lines):

```
  AC-6/AC-7  the shipped floors file covers every suite, at its count

  HARNESS-021 AC-1  a suite floored only in project-floors.conf is not reported missing
    FAIL a suite floored in project-floors.conf alone is not reported as missing a floor
         expected: 
         actual:   project-mine
    FAIL beside an unfloored suite, only the unfloored one is reported
         expected: project-orphan
         actual:   project-mine project-orphan

  HARNESS-021 AC-2  control: a suite floored in neither file is reported, by name

  HARNESS-021 AC-3  with no project-floors.conf the check behaves as before

  HARNESS-020 AC-1  a suite floored only in project-floors.conf passes the full-run audit
selftest: 99 passed, 2 failed
```

That is the right failure: the actual value `project-mine` is exactly the FWB
symptom in miniature (FWB printed `project-ci project-handoff ...`). Only the
AC-1 assertions failed. The real-tree assertion, AC-2 and AC-3 were green.

The run also carried one assertion that is no longer in the file:
`this repository's real tree ships no project-floors.conf`. It passed there and
was **removed after this run**, because this file ships to consuming projects
that do have a project-floors.conf, and there it would be the defect this story
removes. That accounts for 99+2 = 101 here against 100 below.

An earlier draft of AC-2 also failed run 1, because its fixture floored a suite in
project-floors.conf and so was really an AC-1 case. That mixed tree moved under
AC-1 (the second assertion above), and AC-2 became a pure control: a
project-floors.conf is present but floors nothing, which also refuses a helper
that treats the file's mere presence as excusing everything.

### Run 2 - helper extended to read project-floors.conf when present

```
  AC-6/AC-7  the shipped floors file covers every suite, at its count

  HARNESS-021 AC-1  a suite floored only in project-floors.conf is not reported missing

  HARNESS-021 AC-2  control: a suite floored in neither file is reported, by name

  HARNESS-021 AC-3  with no project-floors.conf the check behaves as before

  HARNESS-020 AC-1  a suite floored only in project-floors.conf passes the full-run audit
selftest: 100 passed, 0 failed
```

### Guards

```
check-sigpipe: scanned 41 shell file(s), 39 with pipefail, 0 finding(s)
check-grep-count: scanned 41 shell file(s), 0 finding(s)
$ bash scripts/selftest.sh selftest
assertion floors: all 1 suite(s) met their declared floor (100 assertions executed, 54 declared).
1 harness suite(s) passed.
```

`bash scripts/gates.sh --fast`: exit 0, with every gate UNCONFIGURED
(`BOOTSTRAPPED=no`, "0 ran, 5 unconfigured"). So in this repository the `unit`
gate the Context names runs nothing. What actually judges this suite is CI's
`selftest.sh` step.

### Negative controls

| Control | Expected | Measured (run 1, old helper) | Measured (run 2) |
|---|---|---|---|
| AC-2: project-orphan floored nowhere, comment-only project file | `project-orphan` | `project-orphan` (green) | `project-orphan` (green) |
| Defect put back = run 1 itself (no project-floors.conf read) | AC-1 red, AC-2/AC-3 green | as expected | n/a |

Both runs executed every assertion (no import failure here). Timings are local only.

### Deferred verification (Owner: GATES)

Not run in RED against the committed code, by design. Suggested probe:
`bash scripts/mutate.sh .claude/tests/selftest.test.sh 's/\[ -f "\$_swf_dir\/project-floors.conf" \]/false/' -- bash .claude/tests/selftest.test.sh`
Expected: the two AC-1 assertions red, everything else green. Run 1 above shows
the same behaviour before the extension.

### Discovered

- The `selftest` floor in `floors.conf` is 54 while the suite executes 100.
  This predates the story (HARNESS-020 left it). It is not raised here: that
  belongs to floors.conf and is outside this Contract's `**Writes:**`. A floor
  well below the count catches only a gutting, not a partial deletion. Worth a
  follow-up.

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

    run:    2026-10-02T02:00:26Z
    commit: f08a385 (working tree had uncommitted changes)
    tree:   d47151ad200eda2592c7eeee6fb9f99289641ea8
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


**DONE, 2026-10-02.** Merged in #95 (merge commit be358c8), release 64. The
VERSION bump lands in this DONE commit. `phase.sh set DONE --force` was run on
`main`, overriding the branch check. PR CI: the `gates` job passed in 1m32s,
and its harness self-test step took 79s, with no `timeout-minutes` set
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/36960427027).
`boundaries` passed in 5s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/36960427021).
Next: refresh fantasy-world-builder to this release. No epic.
