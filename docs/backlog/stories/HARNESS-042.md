---
id: HARNESS-042
title: gate_tree_hash keeps the index mtime
slug: gate-tree-hash-keeps-the-index-mtime
epic: 
type: fix
status: done
phase: DONE
branch: story/HARNESS-042-gate-tree-hash-keeps-the-index-mtime
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [.claude/hooks/lib.sh, .claude/tests/lib.test.sh]       # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

<!-- Why this story exists. Link the epic and any wiki pages that constrain it.
     Name the REQUIRED gate that would fail if this story's artifact broke. If
     only an optional gate can, put it in required_gates above before RED:
     every required gate once passed over a story none of them exercised. -->

Field report from fantasy-world-builder (harness release 45), PR
ryanczhang7/fantasy-world-builder#76: the `boundaries` workflow's
`bash scripts/selftest.sh` failed twice on ubuntu-24.04 / git 2.55.0, in
`.claude/tests/lib.test.sh`, describe "gate_tree_hash: covers what the gates
judge, and only that": `FAIL an untracked hook does not move the hash`
(expected 75098b49..., actual 9db8af45...), `lib: 216 passed, 1 failed`. The
branch changed no harness file; the same suite passed locally and on the five
PRs before it.

The defect is racy git in `gate_tree_hash` (`.claude/hooks/lib.sh`). It seeds
its temporary index with a plain `cp "$real" "$idx"`, which gives the copy a
fresh mtime. `git add -u` treats an entry as racily clean - and compares
content - only when the entry's mtime is not older than the index file's own
mtime. With the copy stamped "now", an entry written in the same second as the
real index is no longer racy, so a tracked file rewritten with the SAME SIZE in
that second keeps matching stat data and is skipped: the hash misses a real
edit. The fixture's rewrites (`x() { :; }` -> `y() { :; }`, `= 1` -> `= 2`)
are same-size, so whether it bites depends on whether they land in the same
second as the fixture's commits. The fix is `cp -p`, which keeps the index's
mtime. The reporter verified it on Windows Git Bash with the race forced:
plain `cp` missed the edit 3/3, `cp -p` caught it 3/3.

In production the miss is a gate stamp recorded against a tree that differs
from the one the gates judged - the record would claim code it never saw.

**The gate that fails if this breaks** is the harness's own `selftest` (the
`lib` suite), which CI runs on every PR. No `required_gates` entry is needed.

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC.
     An AC that names a statistic, a metric or a threshold names a NEGATIVE
     CONTROL too: the deliberately broken input the metric must reject, and
     roughly what it should score. A criterion can be perfectly testable and
     still be blind to the defect it exists to catch, and that is more
     dangerous than a vague one - it survives review and goes green. -->

- **AC-1 (a same-size edit in the index's own second moves the hash)** — Given
  a fixture repository whose tracked `.claude/hooks/lib.sh` and whose real
  index are both pinned to the same second, with ctime, inode and sub-second
  time taken out of git's stat comparison (`core.trustctime false`,
  `core.checkStat minimal`), when the file is rewritten with different bytes of
  the same size and re-pinned to that second, then `gate_tree_hash` returns a
  different hash than before the rewrite. *Control:* against the plain `cp`
  the two hashes are equal - the assertion is red before the fix,
  deterministically, not by timing.
- **AC-2 (nothing else about the hash changes)** — Given the rest of the `lib`
  suite (the HARNESS-014 cases: untracked files contribute nothing, the stamp
  matches `gate_tree_hash_of HEAD`, the real index is never written), when it
  runs after the fix, then every one of those assertions still passes.

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

**Writes:** `.claude/hooks/lib.sh`, `.claude/tests/lib.test.sh`

- `gate_tree_hash` in `.claude/hooks/lib.sh`: the seeding `cp "$real" "$idx"`
  becomes `cp -p "$real" "$idx"`, plus a sentence in the function's header
  comment saying why. No signature change; no caller changes.
- `cp -p` is POSIX and present in BSD/macOS `cp`, GNU coreutils and Git Bash;
  nothing in the bash 3.2 portability block forbids it. The test pins time with
  `touch -t CCYYMMDDhhmm.SS` (POSIX), not GNU `touch -d`, so it runs on BSD.
- Other index copies: none. `gate_tree_hash_of` reads `git ls-tree` of a
  commit and has no index; `grep -rn 'git-path index\|GIT_INDEX_FILE'` over the
  tree finds only `gate_tree_hash`.
- Floors: the new case adds one executed assertion to `lib` (246 -> 247
  executed, floor 217). `floors.conf` says a story that only adds assertions
  need not touch it, so it is unchanged.

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

- **DV-1 (defect put back)** — With `cp -p` reverted to `cp` in
  `gate_tree_hash`, AC-1's assertion MUST go red in the `lib` suite. RED's own
  run is against the defect, so it is this mutation's first half; GATES runs
  it once more against the fixed tree through `scripts/mutate.sh`. Owner: GATES

  Result (GATES, 2026-10-07): red, restored.

    $ bash scripts/mutate.sh .claude/hooks/lib.sh 's/cp -p "\$real" "\$idx"/cp "$real" "$idx"/' -- bash scripts/selftest.sh lib
    === mutate: .claude/hooks/lib.sh (1 line(s) changed by s/cp -p "\$real" "\$idx"/cp "$real" "$idx"/) ===
    === mutate: running bash scripts/selftest.sh lib ===
          FAIL a same-size edit in the index's second moves the hash
    lib: 246 passed, 1 failed
    1 of 1 harness suite(s) FAILED.
    === mutate: command exited 1; restored (verified byte-for-byte against .../.claude/state/mutations/.claude_hooks_lib.sh.20261007T130328Z.9108.bak) ===

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

Planned by `bash scripts/plan.sh write HARNESS-042` from `.claude/harness/models.conf`.
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

- AC-1: `.claude/tests/lib.test.sh`, new describe "gate_tree_hash: a same-size
  edit in the index's own second is seen (HARNESS-042)", one assertion, placed
  right after the block the CI failure was in. It sets and then unsets the two
  config keys, so the cases after it run with git's defaults.
- AC-2: the existing `lib` cases, unchanged.

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

Command: `bash scripts/selftest.sh lib`. Run twice on Windows Git Bash
(2026-10-07), red both times, and red for the right reason - the hash did not
move on a real edit:

    gate_tree_hash: a same-size edit in the index's own second is seen (HARNESS-042)
      FAIL a same-size edit in the index's second moves the hash
           unchanged: 676652f141aaacc2f93665d724fc29c1cd7ef3a3 - the temporary index lost the real one's mtime, so add -u trusted stale stat data

    lib: 246 passed, 1 failed

GREEN: change `cp "$real" "$idx"` to `cp -p "$real" "$idx"` in
`gate_tree_hash` and nothing else; the one red assertion goes green and the
other 246 stay green. Why `trustctime`/`checkStat` are set: on Linux the
rewrite moves ctime, which git would otherwise use to see the edit, making the
case pass against the defect there.

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

    run:    2026-10-07T13:22:37Z
    commit: cf1f9d7
    tree:   7ef521275cf4ee42ca0036414d80c08664f3f7ef
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


**GREEN (2026-10-07).** `cp "$real" "$idx"` -> `cp -p "$real" "$idx"` in
`gate_tree_hash`, plus a header-comment paragraph saying why. No other source
changed. `bash scripts/selftest.sh lib`: `lib: 247 passed, 0 failed`.

**GATES (2026-10-07).** DV-1 run and recorded above. Full self-test with
`SELFTEST_JOBS=4`, while the story was at GATES, about 13 minutes:

    exit 0
    assertion floors: all 25 suite(s) met their declared floor (2942 assertions executed, 2651 declared).
    25 harness suite(s) passed.

`bash scripts/gates.sh`: recorded under `## Gate results`.

**DONE, 2026-10-07.** Merged in #122 (merge commit b21ca4a), release 86. The
VERSION bump lands in this DONE commit. `phase.sh set DONE --force` was run on
`main` (a detached checkout of `origin/main` in the worktree), overriding the
branch check. PR CI: `gates` passed in 2m39s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37628147596),
`boundaries` in 6s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37628147522).
