---
id: HARNESS-051
title: plan.sh refuses an id with no story file instead of recommending from nothing
slug: plan-sh-refuses-an-id-with-no-story-file
epic: 
type: fix
status: todo
phase: PLANNED
branch: story/HARNESS-051-plan-sh-refuses-an-id-with-no-story-file
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [scripts/plan.sh, .claude/tests/plan.test.sh]         # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

<!-- Why this story exists. Link the epic and any wiki pages that constrain it.
     Name the REQUIRED gate that would fail if this story's artifact broke. If
     only an optional gate can, put it in required_gates above before RED:
     every required gate once passed over a story none of them exercised. -->

**Observed 2026-10-10** in `D:\agentic-dev-harness` on branch
`story/HARNESS-047-…`, which predates the HARNESS-050 story file. Reproduced
on this branch (origin/main, 2026-10-10) with an id that exists nowhere:

    $ bash scripts/plan.sh HARNESS-999 </dev/null
    stderr:
    plan: no story at docs/backlog/stories/HARNESS-999.md
    plan: no story at docs/backlog/stories/HARNESS-999.md
    stdout:
    Story HARNESS-999

      Recommended:  /complete-story HARNESS-999
      Because:      HARNESS-999 is an ordinary cycle: a contract to work from, 0 criteria, nothing deferred, no dependency waiting. Run it end to end.

      Model plan (from .claude/harness/models.conf … [full six-row table]
    exit 0

`plan.sh next HARNESS-999` prints the same `complete-story` recommendation on
stdout and exits 0; `plan.sh models HARNESS-999` prints the full six-row
model table and exits 0. Both print the `no story` line once. Only
`plan.sh write HARNESS-999` behaves: one stderr line, nothing on stdout,
exit 2.

The planner is stating facts it never read ("a contract to work from", "no
dependency waiting") about a file it just said does not exist, and its exit
code says everything is fine. CLAUDE.md tells agents to ask `plan.sh` rather
than the user, so on a stale branch, in a worktree that lacks the story, or
after a typo, the orchestrator is handed a confident wrong answer with no
signal to distrust it. On `main`, where HARNESS-050 exists with
`depends_on: [HARNESS-047]`, the same command correctly says `blocked`. This
is rules.md "evidence, not a diagnosis" failing inside the instrument.

**Cause (established from the code).** `scripts/plan.sh:32` defines
`die() { printf …; exit 2; }` and `scripts/plan.sh:34-38` `story_file()`
calls it when the file is absent. `cmd_models` (`scripts/plan.sh:191`) and
`cmd_next` (`scripts/plan.sh:254`) both call it as
`file="$(story_file "$id")"` with nothing after the substitution, so the
`exit 2` ends only the subshell; the function carries on with `$file` empty
and every `frontmatter_value "" …` / `section "" …` read returns nothing,
which the defaults turn into `type=feature`, `phase=PLANNED`, zero criteria,
no dependency. The script has `set -uo pipefail` and no `-e`, so nothing
stops it. **Why the message prints twice:** `cmd_both` (`scripts/plan.sh:311`,
the bare-id form) calls `cmd_next` at `:313` and `cmd_models` at `:323`, and
each dies once in its own subshell. `cmd_write` (`scripts/plan.sh:365-367`)
was already fixed for exactly this by HARNESS-019 (commit 984ba88, port of
WORLD-097): `file="$(story_file "$id")" || exit $?`, and the comment above it
at `:348-353` describes this very fall-through. The fix never reached the
other two callers.

**Existing tests.** `.claude/tests/plan.test.sh:587-607` ("AC-4: a missing
story is refused, and names the path") covers `plan write T-99` only, and it
is a correct, anchored test: it passes today because `write` is fixed, not
because of a loose needle. No test exercises `next`, `models` or the bare id
with a missing story (`grep -n 'no story' .claude/tests/plan.test.sh` finds
only that block's comment). So this is a coverage gap, not a needle problem.

**Callers and the exit code.** `scripts/phase.sh:122` and `:126` (`show`)
call `plan.sh next` and `models` with `2>/dev/null`, guarded by
`[ -f "$STORIES/$id.md" ]` at `:120`; `scripts/phase.sh:135` (`recommended`,
used by `board`) runs `next` over ids that come from existing story files;
`scripts/phase.sh:194` runs `after … || true`. No caller relies on a missing
story exiting 0, and none reads the output of a missing one, so a non-zero
exit changes nothing for them. `/advance-story` and `/complete-story`
(`.claude/commands/*.md`) read `plan.sh` output by eye, not by exit code.

Required gate that fails if this breaks: `selftest` (`.claude/tests/plan.test.sh`
runs under `bash scripts/selftest.sh plan` and in CI's `selftest` step). No
optional gate is involved, so `required_gates` stays empty.

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC.
     An AC that names a statistic, a metric or a threshold names a NEGATIVE
     CONTROL too: the deliberately broken input the metric must reject, and
     roughly what it should score. A criterion can be perfectly testable and
     still be blind to the defect it exists to catch, and that is more
     dangerous than a vague one - it survives review and goes green. -->

All five run from a project fixture with stdin redirected from `/dev/null`
(the existing AC-4 block in `plan.test.sh` says why: today's fall-through
reads stdin). "The id" below is an id with no file at
`docs/backlog/stories/<id>.md`, such as `T-99`.

- **AC-1** — Given the id, when `bash scripts/plan.sh next <id>` runs, then
  stderr is exactly one line, `plan: no story at docs/backlog/stories/<id>.md`,
  stdout is empty, and the exit status is 2.
- **AC-2** — Given the id, when `bash scripts/plan.sh models <id>` runs, then
  stderr is exactly that one line, stdout is empty (no `PHASE<TAB>agent…`
  row at all), and the exit status is 2.
- **AC-3** — Given the id, when `bash scripts/plan.sh <id>` (the bare form,
  `cmd_both`) runs, then stderr is exactly that one line - once, not twice -
  stdout is empty (no `Story <id>` header, no `Recommended:` line, no
  `Model plan` table), and the exit status is 2.
- **AC-4** — Given the id, when `bash scripts/plan.sh write <id>` runs, then
  the behaviour pinned by the existing `plan.test.sh` AC-4 block
  (`:587-607`) is unchanged: one error line naming the path, no success
  line, no `.new` file, non-zero exit. This is the control that the fix did
  not regress the subcommand that already worked.
- **AC-5** — Given a story file that exists, when `plan.sh next <id>`,
  `plan.sh models <id>` and `plan.sh <id>` run, then their stdout and exit
  status are byte-for-byte what they are today - every existing case in
  `plan.test.sh` stays green with no assertion changed. Specifically, for a
  PLANNED story with a contract and no unmet dependency, `plan.sh next`
  still prints `complete-story<TAB>…` and exits 0, and for a story whose
  `depends_on` is not DONE it still prints `blocked<TAB>…` and exits 0.

*Negative control for the "exactly one line / empty stdout" assertions:*
on the unfixed tree, AC-1 and AC-2 see one stderr line but a non-empty
stdout and exit 0; AC-3 sees two stderr lines. A test that passed on today's
tree would be asserting nothing, so RED must watch each of AC-1..AC-3 fail
on exactly those counts before GREEN.

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

**Pinned by the Lead PO before RED (2026-10-10).** RED may amend any block
below in place, with a reason beside it; GREEN builds what the amended block
says.

- **Where the fix lives.** `scripts/plan.sh`, in `cmd_next` (`:254`) and
  `cmd_models` (`:191`): the `file="$(story_file "$id")"` assignment in each
  must stop the script when `story_file` dies, the way `cmd_write` (`:367`)
  already does with `|| exit $?`. That is the whole production change; GREEN
  may choose the exact spelling (the `|| exit $?` idiom is the one already in
  the file and the comment at `:348-353` explains it). No new function, no
  change to `story_file` or `die`, no change to the dispatch `case` at
  `:864-878`.
- **Exit status: 2.** It is what `die` already exits with, what `write`
  already exits with for the same condition, and what every usage error in
  the dispatch exits with. Nothing else in the harness distinguishes 1 from
  2 here; pinning 2 means a caller can tell "no story" from a `set -u`
  crash (1) or a mutate/gates refusal.
- **The one stderr line** is `die`'s existing text, unchanged:
  `plan: no story at docs/backlog/stories/<id>.md`. Anchored assertion:
  `grep -cx 'plan: no story at docs/backlog/stories/T-99\.md'` equal to 1
  over the merged stderr+stdout capture, and stdout captured separately
  must be empty. The existing `plan()` helper in `plan.test.sh` merges
  `2>&1`; RED adds (or amends) a capture that keeps the streams apart, since
  AC-1..AC-3 assert about each.
- **`cmd_both` prints nothing on stdout** for a missing story. Today it
  prints `Story <id>` *before* calling `cmd_next`; with `cmd_next` exiting
  inside `nxt="$(cmd_next "$id")"` (`:313`, again a command substitution)
  `cmd_both` would itself carry on unless it also checks. So GREEN must make
  `cmd_both` stop after the `cmd_next` substitution fails, and the `Story`
  header must not have been printed yet - either test the file first in
  `cmd_both` or move the header after a successful `cmd_next`. RED pins the
  observable: empty stdout, one stderr line, exit 2.
- **Oracle partition.** Every criterion is *mechanical*: exact line counts,
  an exact message, an exact exit code, an empty stream. Pin them exactly;
  nothing to calibrate, no settled numbers to read out beyond exit code 2.
- **Test placement.** New cases go in `.claude/tests/plan.test.sh`, in or
  next to the existing AC-4 block at `:587-607`, using the same `T-99`
  fixture id and the same `</dev/null` discipline. Suite command:
  `bash scripts/selftest.sh plan`. Helpers already present: `plan`,
  `zero_or_not` (`:443`), `success_lines` (`:442`), `present` (`:444`).
- **`sigpipe` line pins.** `grep -n 'plan\.sh' .claude/tests/*sigpipe*.test.sh`
  returns nothing on this tree, so adding lines to `plan.sh` moves no pinned
  line number. GREEN re-checks before committing (memory: full selftest
  before REVIEW).
- **No signature changes.** `story_file`, `die`, `cmd_next`, `cmd_models`
  and `cmd_both` keep their names and arguments; no caller list is owed.
- **Test-only dependencies:** none. bash, awk, coreutils only (rules.md,
  Portability).

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

- **DV-1 (defect put back)** — With the early exit removed again from
  `cmd_next` (through `scripts/mutate.sh`, a `sed` that strips the
  `|| exit $?` - or whatever GREEN's spelling is - from the `cmd_next`
  assignment only), AC-1's assertions and AC-3's "exactly one stderr line /
  empty stdout" assertions MUST go red in the `plan` suite, and the
  `write T-99` block (AC-4) MUST stay green, because its guard is a
  different line. RED cannot run this: the exit it would remove does not
  exist yet. Owner: GATES. Command shape, for the orchestrator to adapt to
  GREEN's exact text:

      bash scripts/mutate.sh scripts/plan.sh \
        '254s/ || exit \$?$//' \
        -- bash scripts/selftest.sh plan

  Paste the failing assertion names and the restore line here.

That is the rules.md budget: one defect-put-back for the central claim. No
test here is written against existing behaviour that already passes
(AC-4 and AC-5 are controls over cases that already exist in the suite and
are not being added), so no "earn an arrived test" mutation is owed. The
`write` guard was earned by HARNESS-019 and its block is not touched.

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

Planned by `bash scripts/plan.sh write HARNESS-051` from `.claude/harness/models.conf`.
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

- PLANNED, `lead-po`, 2026-10-10: **Fable 5.1** (`claude-fable-5-1`) - the
  agent's declared `model:`, matching the plan; no override reported.

**Oracle partition for the RED brief:** all five criteria are *mechanical*
(exact message, exact line counts, empty stream, exit code 2); nothing is
settled-by-measurement or oracle-free. Pin exactly; leave nothing open-ended.

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Out of scope

<!-- Explicit non-goals. Prevents the Feature Developer from over-building. -->

- **`plan.sh after <id>` with an id that has no file.** Its id is optional
  by design (`after [<id>]`, `scripts/plan.sh:724` tests `-f` and sets
  `cfile=""`), it reports about the backlog rather than about that id, and
  `phase.sh set <id> DONE` calls it with `|| true` (`scripts/phase.sh:194`).
  Reproduced here: `after HARNESS-999` prints the ordinary backlog report
  and exits 0. That is a different, smaller question - a misspelled closed
  id silently drops the "alongside the closed story" check - and changing
  it would change what `phase.sh set DONE` prints. Not this story; if it is
  wanted, cut it separately.
- **`plan.sh conflicts` and `plan.sh waves`** take no id and are untouched.
- **`story_file`, `die` and the message text** are not changed. The fix is
  at the callers, as `cmd_write`'s already is.
- **`phase.sh`** is not changed; its callers already guard on the file's
  existence and discard stderr.
- **Replacing the `|| exit $?` idiom with `set -e`** or a trap. `plan.sh`
  deliberately runs without `-e` (`:362-363` says why); this story does not
  reopen that.
- **Validating the id's shape** (`valid_story_id`, HARNESS-046). A
  malformed id simply has no file and gets the same one-line refusal.

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
         or Gate probes section describes a failure without showing one.
         A result counts only as a block: a line beginning with three
         backticks or three tildes (a fence), or a line indented by exactly
         four spaces. Prose does not count, nor inline code in backticks, nor
         a tab, nor anything inside an HTML comment
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

- Planned 2026-10-10 on branch `harness/HARNESS-051-plan` from origin/main,
  in a worktree, by the Lead PO dispatched as a subagent. The model this
  planning dispatch resolved to is **Fable 5.1** (`claude-fable-5-1`), the
  agent's own declared `model:`; no override was reported to it. Recorded
  again under `## Model guidance` once `plan.sh write` has rendered it.
- Id check right before writing: `git ls-tree origin/main` lists stories up
  to HARNESS-050 and `git ls-remote --heads origin | grep HARNESS-05` lists
  no branch, so HARNESS-051 was free.
- `bash scripts/plan.sh conflicts`, 2026-10-10, on this branch (HARNESS-050
  is absent from the table because it is blocked on HARNESS-047; it declares
  `.claude/settings.json`, `.claude/tests/settings.test.sh`,
  `.claude/state/README.md`, `.claude/harness/rules.md` and an audit doc -
  none shared with this story):

      STATUS    PAIR                      DETAIL
      --------- ------------------------- ------------------------
      clear     HARNESS-047 + HARNESS-051 no shared path

      0 conflict(s), 0 pair(s) that could not be judged, 0 drift warning(s).

- `bash scripts/plan.sh HARNESS-051` recommends `/advance-story` because the
  story carries a Deferred verification (DV-1) that GATES must stop and run.

