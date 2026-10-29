---
id: HARNESS-052
title: ci-local runs only workflows that trigger on pull_request
slug: ci-local-runs-only-workflows-that-trigge
epic: 
type: fix
status: in-review
phase: REVIEW
branch: story/HARNESS-052-ci-local-runs-only-workflows-that-trigge
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [scripts/ci-local.sh, .claude/tests/ci-local.test.sh, .claude/tests/sigpipe.test.sh]  # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

<!-- Why this story exists. Link the epic and any wiki pages that constrain it.
     Name the REQUIRED gate that would fail if this story's artifact broke. If
     only an optional gate can, put it in required_gates above before RED:
     every required gate once passed over a story none of them exercised. -->

`scripts/ci-local.sh` exists to run, on this machine, what CI runs on a pull
request. Its `workflow_files()` (`scripts/ci-local.sh:83-91`) returns every
`.github/workflows/*.yml`, and `workflow_steps()` emits each file's `run:`
steps. Steps holding `${{ … }}` are skipped; plain-shell steps run.

CAL-030 adds `.github/workflows/deploy.yml`, triggered by `push` to `main` and
`workflow_dispatch` only, with plain-shell steps such as
`pnpm exec supabase db push --linked --password "$SUPABASE_DB_PASSWORD"` and
`pnpm exec supabase functions deploy --project-ref "$SUPABASE_PROJECT_REF" --use-api`.
Once it merges, `bash scripts/ci-local.sh` would attempt a production deploy
from a developer's machine. A script whose claim is "what PR CI runs" must
never run a step CI does not run on a pull request.

The fix: only workflows whose `on:` includes the `pull_request` event
contribute steps. `gates.yml` (`on:` block with `pull_request`, `schedule`,
`workflow_dispatch`) and `boundaries.yml` (`on:` block with `pull_request`)
stay in.

`.claude/tests/ci-local.test.sh`'s derivation check reads only `gates.yml` and
`boundaries.yml`, so nothing today notices a third workflow's steps leaking in.

Required gate that fails if this breaks: `selftest` (the `ci-local` suite runs
under `bash scripts/selftest.sh ci-local` and in CI's selftest step).
`required_gates` stays empty.

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC.
     An AC that names a statistic, a metric or a threshold names a NEGATIVE
     CONTROL too: the deliberately broken input the metric must reject, and
     roughly what it should score. A criterion can be perfectly testable and
     still be blind to the defect it exists to catch, and that is more
     dangerous than a vague one - it survives review and goes green. -->

All run from a project fixture whose `.github/workflows/` the test writes.

- **AC-1** — Given a `gates.yml` whose `on:` is a block mapping holding
  `pull_request:`, `schedule:` and `workflow_dispatch:` (the real file's
  shape), and a `deploy.yml` whose `on:` is a block mapping holding only
  `push:` (with `branches: [main]`) and `workflow_dispatch:`, when
  `bash scripts/ci-local.sh --dry-run` runs, then stdout lists `gates.yml`'s
  step and none of `deploy.yml`'s.
- **AC-2** — Given the same fixture, when `bash scripts/ci-local.sh` runs for
  real, then `deploy.yml`'s step is not executed (observable: the step would
  write a marker file, and no marker exists afterwards) while `gates.yml`'s
  step is (its marker exists).
- **AC-3** — Given a workflow whose `on:` is the flow sequence
  `[push, pull_request]`, when `--dry-run` runs, then its step is listed.
- **AC-4** — Given a workflow whose `on:` is the bare scalar `pull_request`,
  when `--dry-run` runs, then its step is listed.
- **AC-5** — Given a push-only workflow that mentions `pull_request`
  elsewhere in the file - in a comment and in a step's
  `if: github.event_name == 'pull_request'` - when `--dry-run` runs, then its
  step is NOT listed. This is the negative control for a filter that merely
  greps the file for the word.
- **AC-6** — Given an excluded workflow, when `ci-local.sh` runs (dry or
  not), then stderr says so, naming the file - `note: not running deploy.yml:
  it does not trigger on pull_request` - in the same "skip out loud" voice as
  the existing unresolved-expression note.
- **AC-7** — Every existing case in `.claude/tests/ci-local.test.sh` stays
  green with no assertion changed (their fixtures all use
  `on: [pull_request]`), and `bash scripts/selftest.sh` passes.

*Negative control:* on today's tree AC-1, AC-2, AC-5 and AC-6 fail (the
deploy step is listed, run, and not announced); AC-3 and AC-4 pass on
arrival, because today includes everything. They are earned by DV-1.

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

**Writes:** `scripts/ci-local.sh`, `.claude/tests/ci-local.test.sh`, `.claude/tests/sigpipe.test.sh` (R-1: one line-number pin)

- `scripts/ci-local.sh` gains a function `triggers_on_pull_request <file>`
  (bash + awk, no python) that exits 0 when the workflow's top-level `on:`
  key names the `pull_request` event, and 1 otherwise. It reads only the
  `on:` value: the inline scalar or flow sequence on the key's own line, or
  the first level of the indented block below it (mapping key
  `pull_request:` or sequence item `- pull_request`). Comments are not
  read. `pull_request_target` is a different event and does not match.
- `workflow_files()` keeps its order (gates.yml first, the rest by name) and
  emits only files for which the predicate holds. For each file it drops,
  it prints to stderr:
  `note: not running <basename>: it does not trigger on pull_request`.
- The existing "no run: steps found" exit 2 is unchanged and now also covers
  "no workflow triggers on pull_request".
- Tests are added to `.claude/tests/ci-local.test.sh` under a new
  `describe "only workflows CI runs on a pull request"` block. No existing
  assertion changes.

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

- **DV-1 (defect put back)** — With `workflow_files()`'s call to
  `triggers_on_pull_request` neutralised again through `scripts/mutate.sh`
  (the predicate made to succeed for every file), AC-1, AC-2, AC-5 and AC-6's
  assertions MUST go red in the `ci-local` suite. RED cannot run this: the
  call it would remove does not exist yet. Owner: GATES.

  Result (GATES, 2026-10-29):

    === mutate: scripts/ci-local.sh (1 line(s) changed by s/if triggers_on_pull_request "\$f"; then/if true; then/) ===
    === mutate: running bash scripts/selftest.sh ci-local ===
    FAIL AC-1: a push-only workflow's step is not listed
    FAIL AC-5: pull_request mentioned outside on: does not count
    FAIL AC-6: an excluded workflow is named on stderr
    FAIL AC-6: so is the one that only mentions pull_request
    FAIL AC-2: the push-only workflow's step did not run
    FAIL AC-6: a real run names the excluded workflow too
    ci-local: 34 passed, 6 failed
    1 of 1 harness suite(s) FAILED.
    === mutate: command exited 1; restored (verified byte-for-byte against /d/clean_calendar/.claude/worktrees/bold-tu-6494dc/.claude/state/mutations/scripts_ci-local.sh.20261029T185554Z.137054.bak) ===

- **DV-2 (earns AC-3 and AC-4)** — Both pass on arrival, because today's
  script includes everything. With the predicate's inline-value branch (the
  `on:` key's own line) made to never match, AC-3's and AC-4's assertions
  MUST go red while AC-1 stays green. Owner: GATES.

  Result (GATES, 2026-10-29). AC-3 and AC-4 red; AC-1's positive and negative assertions are not in the failure list. The other reds are the older fixtures, which all spell `on: [pull_request]` inline - expected collateral of the same branch:

    === mutate: scripts/ci-local.sh (1 line(s) changed by s/found = (v ~/found = 0 \&\& (v ~/) ===
    === mutate: running bash scripts/selftest.sh ci-local ===
    FAIL a project's install step is run
    FAIL and its browser install
    FAIL alongside the harness's own
    FAIL the base ref expression is resolved
    FAIL a block scalar's first line
    FAIL and its second
    FAIL a failing first step fails the run
    FAIL and says which step failed
    FAIL the failing step's output is shown
    FAIL the first ci-local: line names the commit being judged
    FAIL and says it before running anything
    FAIL so one grep returns both the subject and the verdict
    FAIL and a dirty tree says so under the same prefix
    FAIL a step that prints the old shape is not mistaken for the script
    FAIL while its output is still shown in full
    FAIL an unresolvable expression is skipped OUT LOUD
    FAIL and the note quotes what it could not resolve
    FAIL while the steps it CAN resolve still run
    FAIL a folded scalar's body is emitted
    FAIL and so is its continuation
    FAIL gates.yml runs first even when another workflow sorts before it
    FAIL AC-3: on: [push, pull_request] is listed
    FAIL AC-4: a bare on: pull_request is listed
    ci-local: 17 passed, 23 failed
    FAIL ci-local  did 17 units of work, below the floor of 28 in .claude/tests/floors.conf
    1 of 1 harness suite(s) FAILED.
    === mutate: command exited 1; restored (verified byte-for-byte against /d/clean_calendar/.claude/worktrees/bold-tu-6494dc/.claude/state/mutations/scripts_ci-local.sh.20261029T185632Z.138316.bak) ===

- **DV-3 (probe against the real tree)** — A rule over the tree is probed
  against a real line of it. With `scripts/mutate.sh` adding `pull_request:`
  to the real `.github/workflows/deploy.yml`'s `on:` block, `ci-local.sh
  --dry-run` MUST list its `supabase` steps; unmutated, it MUST list none and
  print the `not running deploy.yml` note. Owner: GATES. Needs CAL-030's
  `deploy.yml` on `main`; this branch is rebased onto it before GATES.


  Result (GATES, 2026-10-29, after rebasing onto `main` at e1b3400, which carries CAL-030's `deploy.yml`). Unmutated, no supabase step is listed and the note names the file. With `pull_request:` added to its `on:`, all three deploy steps are listed. Restore verified:

    $ bash scripts/ci-local.sh --dry-run   # unmutated
    note: not running deploy.yml: it does not trigger on pull_request
    bash scripts/selftest.sh
    FORCE_COLOR=1 CLICOLOR_FORCE=1 GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=color.ui GIT_CONFIG_VALUE_0=always bash scripts/selftest.sh
    bash scripts/check-boundaries.sh origin/main
    supabase deploy lines listed: 0
    
    $ bash scripts/mutate.sh .github/workflows/deploy.yml 's/^on:$/on:\n  pull_request:/' -- bash scripts/ci-local.sh --dry-run
    === mutate: .github/workflows/deploy.yml (1 line(s) changed by s/^on:$/on:\n  pull_request:/) ===
      9 +   pull_request:
    
    === mutate: running bash -c bash scripts/ci-local.sh --dry-run 2>&1 | grep -E "supabase (link|db push|functions)|not running" ===
    pnpm exec supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"
    pnpm exec supabase db push --linked --password "$SUPABASE_DB_PASSWORD"
    pnpm exec supabase functions deploy --project-ref "$SUPABASE_PROJECT_REF" --use-api
    
    === mutate: command exited 0; restored (verified byte-for-byte against /d/clean_calendar/.claude/worktrees/bold-tu-6494dc/.claude/state/mutations/.github_workflows_deploy.yml.20261029T201254Z.1982.bak) ===
    
    mutate: no stranded mutation; nothing of a previous run is in the tree.

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

Planned by `bash scripts/plan.sh write HARNESS-052` from `.claude/harness/models.conf`.
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

- `pull_request_target`. It runs on a pull request but checks out and runs the
  BASE branch, so its steps are not "what this PR would run"; it is not matched.
- Branch and path filters (`pull_request: branches: [...]`, `paths:`). A
  workflow that triggers on `pull_request` at all is included; reproducing
  GitHub's filter semantics locally is not attempted.
- Job-level or step-level `if:` conditions. Unchanged from today.
- Changing the derivation check at the top of `ci-local.test.sh`.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

<!-- Filled by the Test Developer during RED: which tests, at which level,
     and which AC each one covers. -->



All in `.claude/tests/ci-local.test.sh`, block `describe "only workflows CI runs on a pull request"`: one fixture with five workflows (`gates.yml` block `on:` with pull_request/schedule/workflow_dispatch; `deploy.yml` push+workflow_dispatch; `both.yml` `[push, pull_request]`; `bare.yml` `pull_request`; `release.yml` push-only that mentions pull_request in a comment and an `if:`). Each step is `touch .m-<name>`.

- AC-1: whole-line `touch .m-gates` in dry stdout; no `m-deploy` anywhere in it.
- AC-2: a real run exits 0, writes `.m-gates` (positive control), does not write `.m-deploy`.
- AC-3 / AC-4: whole-line `touch .m-both` / `touch .m-bare`.
- AC-5: no `m-release` in dry stdout.
- AC-6: exact stderr lines `note: not running deploy.yml: it does not trigger on pull_request` and the same for `release.yml`, dry and real; no `not running gates.yml`.
- AC-7: every pre-existing assertion untouched.

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



Command: `bash scripts/selftest.sh ci-local`. Result on the unfixed script (34 passed, 6 failed):

    FAIL AC-1: a push-only workflow's step is not listed
    FAIL AC-5: pull_request mentioned outside on: does not count
    FAIL AC-6: an excluded workflow is named on stderr
    FAIL AC-6: so is the one that only mentions pull_request
    FAIL AC-2: the push-only workflow's step did not run
    FAIL AC-6: a real run names the excluded workflow too
    1 of 1 harness suite(s) FAILED.
    ci-local: 34 passed, 6 failed

Right failure: every excluded workflow is listed, run and unannounced, which is the defect. Passed on arrival: AC-1 positive, AC-3, AC-4, AC-6 "gates not reported" (today includes everything and prints no note); AC-3/AC-4 are earned by DV-2 in GATES.

Shape the tests pin: only stdout lines, stderr note text, marker files. They do not constrain the function name `triggers_on_pull_request` (the Contract names it; DV-1/DV-2 target it) or the parser technique. Note text is pinned exactly.

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


### R-1 - GATES back to RED: a line-number pin in `sigpipe.test.sh` went stale

- **Which test.** `.claude/tests/sigpipe.test.sh`, block "C-5: the twelve status-discarded lines in this tree are excluded by the rule, not by markers". Its `DISCARDED` list pins `scripts/ci-local.sh:169:dirty="$(git status`, and its freshness assertion checks that the named line still holds that text.
- **What was wrong.** Nothing in its logic. GREEN added `triggers_on_pull_request` and a longer `workflow_files()` above that line, moving it from 169 to 208. The pin is a test file, frozen in GATES, so the one legal fix was a return to RED.
- **How it was found.** The full `bash scripts/selftest.sh` in GATES, after rebasing onto `main` at e1b3400:

      FAIL C-5 freshness: all twelve status-discarded lines are still where this suite says they are
             scripts/ci-local.sh:169 no longer holds [dirty="$(git status] - it holds:       *'${{'*) printf 'note: skipping a %s step ...
      FAIL sigpipe  did 81 units of work, below the floor of 82 in .claude/tests/floors.conf

- **What it asserts now.** The same thing at `scripts/ci-local.sh:208`. That is a one-line change; no other assertion was touched. `bash scripts/selftest.sh sigpipe` then gives `sigpipe: 82 passed, 0 failed`.
- **What earns it.** A corrected pin passes on its first run, so line 208 was mutated so that it no longer holds the needle, and the freshness assertion went red:

    === mutate: scripts/ci-local.sh (1 line(s) changed by 208s/^dirty="\$(git status/dirty="$(git  status/) ===
      208 - dirty="$(git status --porcelain 2>/dev/null | grep -vE '^\?\?' | head -1)"
      208 + dirty="$(git  status --porcelain 2>/dev/null | grep -vE '^\?\?' | head -1)"
    
    === mutate: running bash -c bash scripts/selftest.sh sigpipe 2>&1 | grep -E "FAIL C-5|ci-local.sh:208|^sigpipe:" ===
        FAIL C-5 freshness: all twelve status-discarded lines are still where this suite says they are
               scripts/ci-local.sh:208 no longer holds [dirty="$(git status] - it holds: dirty="$(git  status --porcelain 2>/dev/null | grep -vE '^\?\?' | head -1)"
    sigpipe: 81 passed, 1 failed
    
    === mutate: command exited 0; restored (verified byte-for-byte against /d/clean_calendar/.claude/worktrees/bold-tu-6494dc/.claude/state/mutations/scripts_ci-local.sh.20261029T213738Z.1669.bak) ===
      208: dirty="$(git status --porcelain 2>/dev/null | grep -vE '^\?\?' | head -1)"

- **GREEN after the return was a no-op.** `scripts/ci-local.sh` was not edited again, and `git diff HEAD~1 -- scripts/` on the R-1 commit is empty. The full self-test and gates were rerun in GATES; their records follow.

## Gate results

<!-- gates.sh: written by bash scripts/gates.sh; do not edit or paste by hand -->

    run:    2026-10-29T22:23:51Z
    commit: 23ddf48
    tree:   0d3067967e02c2a553cd9fae7b302768e3ed1562
    result: pass (10 ran, 0 unconfigured, 0 known)

    PASS         format (1s, observed 204)
    PASS         lint (1s, observed 205)
    PASS         typecheck (4s)
    PASS         unit (23s, observed 2380, floor 2)
    PASS         coverage (25s, observed 2380, floor 2)
    PASS         deno-check (0s, observed 10, floor 10)
    PASS         deno-test (1s, observed 145, floor 145)
    WARN         db (6s, could not launch: is the local stack running, optional) -> .claude/state/gate-logs/db.log
    PASS         build (4s, observed 2)
    PASS         integration (7s, observed 11)
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

- Planned 2026-10-29 in worktree `bold-tu-6494dc`, from `origin/main` at
  3a3bbfd, by a Claude Code session started from the CAL-030 session (model
  resolved: **Opus 5.5**, `claude-opus-5-5`, the session model; no subagent
  dispatched for PLANNED). HARNESS-052 was the next free id: stories on main
  stop at HARNESS-051 and no `HARNESS-05x` branch exists on origin.
- At planning time `deploy.yml` was not yet on `main` (only
  `deploy.yml.template`, which `*.yml` does not match); CAL-030 was in GATES
  with no PR. RED and GREEN use fixtures only; DV-3 waits for the merge.

- Departure from the model plan: PLANNED ran on Opus 5.5 (the session's own
  model) rather than a `fable` `lead-po` dispatch. The story is a small,
  fully specified harness fix handed over with its design; RED and GREEN run
  in the same session, on Opus 5.5, which matches their planned rows.
