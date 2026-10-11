---
id: HARNESS-049
title: The refresh names new files a project's linter will read
slug: the-refresh-names-new-files-a-project-s
epic: 
type: fix
status: done
phase: DONE
branch: story/HARNESS-049-the-refresh-names-new-files-a-project-s
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [scripts/refresh-harness.sh, .claude/tests/refresh.test.sh]       # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

<!-- Why this story exists. Link the epic and any wiki pages that constrain it.
     Name the REQUIRED gate that would fail if this story's artifact broke. If
     only an optional gate can, put it in required_gates above before RED:
     every required gate once passed over a story none of them exercised. -->

Found refreshing fantasy-world-builder from release 64 to 88 (2026-10-08).
The refresh brought in HARNESS-043's `.claude/skills/security-audit/`: two
`.cjs` validators, their two `.test.cjs` suites and `report-schema.json`. The
project's `biome.json` included `"**"`, so its required `lint` gate failed on
them, and so did `unit` and `coverage` through a guard requiring biome to
print no warnings. `format` warned on all five. It went red on `main` (CI run
ryanczhang7/fantasy-world-builder 37870684583) and was fixed there by adding
`"!.claude"` to `biome.json` (d91351f):

    FAIL         lint (2s, exit 1)
    FAIL         unit (190s, exit 1)
    FAIL         coverage (277s, exit 1)
    .claude\skills\security-audit\validate-findings.cjs:11:20 lint/style/useNodejsImportProtocol  FIXABLE
    .claude\skills\security-audit\validate-coverage-ledger.cjs:258:11 lint/complexity/useOptionalChain  FIXABLE

Nothing in the refresh's report pointed at it: it prints `REPLACED
.claude/skills/` for the whole directory, so five NEW files of a kind a
JavaScript or JSON tool reads arrive under a line that reads as "the same as
before". Its last block does say to run `bash scripts/gates.sh` afterwards;
that was skipped, and the harness self-test (which was run) cannot see a
project's own linter. The cheapest point to catch it is the report itself,
in the dry run, before anything is written.

**The gate that fails if this breaks** is the harness's own `selftest` (the
`refresh` suite), which CI runs on every PR.

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC.
     An AC that names a statistic, a metric or a threshold names a NEGATIVE
     CONTROL too: the deliberately broken input the metric must reject, and
     roughly what it should score. A criterion can be perfectly testable and
     still be blind to the defect it exists to catch, and that is more
     dangerous than a vague one - it survives review and goes green. -->

- **AC-1 (a new lintable file is named, dry run and real run)** — Given a
  consumer whose `.claude/skills/` lacks a directory that upstream ships, and
  that directory holds a `.cjs` file and a `.json` file, when
  `refresh-harness.sh --dry-run` runs, then the report has one `NEW` line per
  such file naming its path, and a note that the project's own linters and
  formatters will read them unless it excludes `.claude`; the same lines
  appear in a real run.
- **AC-2 (an unchanged or non-code file is not named)** — Given the same
  consumer where the upstream file already exists at the same path, or where
  the new file is `.md` or `.sh`, when the refresh runs, then no `NEW` line
  names it. *Control:* a refresh between two identical trees prints no `NEW`
  line and no note at all.
- **AC-3 (the extension set is written once)** — Given the refresh script,
  when read, then the extensions it treats as read by a project's tools are
  defined in one place, and include at least `.js`, `.cjs`, `.mjs`, `.ts`,
  `.tsx`, `.json`, `.jsonc` and `.py`.

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

**Writes:** `scripts/refresh-harness.sh`, `.claude/tests/refresh.test.sh`

- "New" means: present in the upstream tree under a directory the refresh
  REPLACES (`.claude/{agents,commands,skills,hooks,tests}`, `scripts/`), and
  absent from the consumer's tree before the refresh. Compared by path, before
  any copy, so the dry run can say it.
- Output: after the REPLACED lines, `  NEW       <path>  (a <ext> file your
  linters and formatters will read - exclude .claude if they should not)`,
  one per file, then nothing else. Exact wording is RED's to pin.
- Not a refusal and not a nonzero exit: the refresh still completes. The
  harness cannot know which tools a consumer runs; it can only name the files.
- Portability: bash 3.2, awk and coreutils only (rules.md), no python.
- `sigpipe` pins line numbers in some scripts; check whether it pins any in
  `refresh-harness.sh` before GREEN adds lines (memory: full selftest before
  REVIEW).

**Pinned by the Lead PO before RED (2026-10-09).** RED may amend any block
below in place, with a reason beside it; GREEN builds what the amended block
says.

- **Where the comparison lives.** `scripts/refresh-harness.sh`, between the
  LOCAL block (ends line 336) and the `rm -rf`/`cp -r` loop (line 379). It
  walks `find . -type f` under each `$UP/.claude/$d` for `d in agents commands
  skills hooks tests`, and `$UP/scripts/*.sh` is excluded by AC-2 (`.sh` is
  not a lintable extension) — so the walk may skip `scripts/` entirely, or
  include it and let the extension filter drop it; RED's choice, say which.
  **RED's choice (amended 2026-10-09): skip `scripts/`.** The refresh copies
  `scripts/*.sh` only, so no lintable file under `scripts/` is ever delivered;
  naming one NEW would describe a copy that does not happen. Pinned by an AC-2
  control: upstream ships `scripts/helper.mjs`, the consumer lacks it, and no
  NEW line may name it.
  "Absent from the consumer" is `[ ! -e "$PROJ/.claude/$d/$rel" ]`, judged
  BEFORE the copy loop runs, so the dry run and the real run print the same
  lines (AC-1).
- **The extension set, once (AC-3).** One variable, at column 0, near the
  comparison:
  `LINTABLE_EXT="js cjs mjs ts tsx json jsonc py"` — a space-separated list,
  matched by `case "$rel" in *.js|*.cjs|...)` built from it, or by a `case`
  whose single pattern list IS the one place. The test for AC-3 reads the
  script with `grep`: pin that the eight names each appear on one line that
  also carries the variable name, and that no second assignment to that name
  exists. Exact spelling of the variable name is RED's to pin.
  **Pinned by RED (amended 2026-10-09):** the name is `LINTABLE_EXT`, and the
  single-`case`-pattern alternative is withdrawn - the AC-3 tests read a
  variable. Exactly one line matches `^LINTABLE_EXT="[^"]*"[[:space:]]*(#.*)?$`
  (column 0, double-quoted, optional trailing comment); exactly one line in the
  file matches `(^|[^A-Za-z0-9_$])LINTABLE_EXT\+?=` (so no `local`, `readonly`
  or `+=` second assignment); the quoted value holds `js cjs mjs ts tsx json
  jsonc py` as space-separated BARE words, no leading dots (more words are
  allowed); `$LINTABLE_EXT` or `${LINTABLE_EXT` is read at least once; and each
  of the words `cjs`, `mjs`, `tsx`, `jsonc` appears as a whole word on exactly
  one NON-COMMENT line - the assignment - so no second hard-coded `*.cjs`
  pattern exists. Comment lines (first non-blank character `#`) may mention them
  freely. Reason: "defined in one place" is only checkable if the one place has
  a name the test can find, and a second hard-coded pattern is the drift AC-3
  exists to stop.
- **Output shape.** After the `REPLACED  .claude/<d>/` lines (line 397) and
  before the single-file `REPLACED` lines (line 400), one line per new file:

      ·· NEW       .claude/skills/security-audit/validate-findings.cjs  (a .cjs file your linters and formatters will read)

  (`··` = two spaces, column alignment with `KEPT      ` / `REPLACED  `; the
  word `NEW` is followed by seven spaces so the path starts in the same
  column). Then, once, after the last NEW line, the note:

      ··          Your project's own linters, formatters and test runners read
      ··          these unless they exclude .claude. If they should not, exclude it.

  Then an empty line. RED pins the exact wording; GREEN prints it verbatim.
  Zero new files: no NEW line and no note (AC-2 control).
  **Pinned by RED (amended 2026-10-09) - these are the exact lines, and they
  supersede the two examples above.** The note is reworded because "If they
  should not, exclude it." has no clear referent; the meaning is unchanged. One
  NEW line per new file, `<ext>` being the text after the LAST dot (so
  `validate.test.cjs` is "a .cjs file"):

      ··NEW·······<path>··(a .<ext> file your linters and formatters will read)

  i.e. `"  NEW       $path  (a .$ext file your linters and formatters will read)"`
  - two spaces, `NEW`, seven spaces, the path relative to the project root
  (`.claude/<d>/<rel>`, forward slashes, no `./`), two spaces, the parenthesis.
  Then the note, exactly these two lines, once per run however many NEW lines:

      "            Your project's own linters, formatters and test runners will read"
      "            these files unless their configuration excludes .claude."

  (twelve leading spaces each, no trailing space). The tests do NOT pin where in
  the report the NEW block sits, nor the empty line after the note, nor the
  order of two NEW lines; the after-the-REPLACED-dir-lines placement above is
  the recommendation, not a test.
- **Ordering.** NEW lines come out in `find` order; RED must not assert an
  order between two NEW lines (Git Bash `find` and Linux `find` differ).
- **Exit status and side effects.** Unchanged: exit 0 on both runs, nothing
  written in a dry run (the existing AC-4 fingerprint assertion stays green).
- **Oracle partition.** All three ACs are mechanical: exact lines in `$out`,
  counted with the suite's existing `whole_line_count` / `exact_count`
  helpers (here-doc, never a pipe — `check-sigpipe.sh` and
  `check-grep-count.sh` judge the test file too). No invented metric, no
  threshold.
- **Portability.** No new `"$(cmd | head …)"` substitution and no `grep -c …
  || printf 0`: `check-sigpipe.sh` pins four lines in this script (134, 135,
  147, 148, in `.claude/tests/sigpipe.test.sh` `DISCARDED`), so GREEN inserts
  **only below line 148** and adds no new pipefail SIGPIPE shape. A new
  pinned line would need that suite's table edited too.
- **Floors.** `.claude/tests/floors.conf` line 55 (`floor | refresh | 165`)
  and the hand-copied table at `.claude/tests/selftest.test.sh:546`
  (`refresh 165`) both carry the refresh suite's floor. RED raises BOTH to
  the EXECUTED count of its run (not the passing count), in its own commit,
  with the measurement comment the file's precedent shows (HARNESS-040's
  block there). Every file in this repository classifies `harness`, so the
  lock permits all of it; the role boundary is honoured by RED touching
  only the test file and the two floor tables, never the script.
- **Changed signatures.** None: no function in `refresh-harness.sh` changes
  its interface, and no other script or suite calls into it except
  `refresh.test.sh` and `security-audit.test.sh` (AC-4 there runs a real
  refresh and greps for `security-audit` paths — the NEW lines will name
  `.cjs`/`.json` files under it, which can only ADD matches; RED checks that
  suite's needles are anchored lines, not substrings that a NEW line would
  satisfy or break).
- **Test fixture.** The suite's `UP` already ships `.claude/skills/stack-
  profiles/reference/python-uv.md` and `.claude/tests/lib.test.sh`; add a
  `.cjs` and a `.json` under a NEW skill directory, plus a `.md` and a `.sh`
  there as AC-2's non-code controls, and one `.cjs` present in BOTH trees as
  AC-2's unchanged control. They must be committed into the fixture
  repository (`git add -A && commit`) or the LOCAL walk sees nothing
  different — but LOCAL judges the consumer's files, and these are absent
  from the consumer, so no LOCAL line appears; assert that too.

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

- **DV-1 (defect put back)** — With the NEW-file comparison made to return
  nothing (through `scripts/mutate.sh`), AC-1's assertions MUST go red in the
  `refresh` suite and AC-2's control stays green. Owner: GATES

  **Result (GATES, 2026-10-09, run by the orchestrator).** Line 363, the
  existence test `[ -e "$PROJ/.claude/$d/$rel" ] && continue`, replaced with
  an unconditional `continue`, so the walk collects nothing:

    $ bash scripts/mutate.sh scripts/refresh-harness.sh '363s/.*/    continue/' -- bash scripts/selftest.sh refresh
    === mutate: scripts/refresh-harness.sh (1 line(s) changed by 363s/.*/    continue/) ===
    === mutate: running bash scripts/selftest.sh refresh ===
        FAIL AC-1 dry run: the new .cjs is named NEW, once
        FAIL AC-1 dry run: the new .test.cjs is named NEW as a .cjs file, once
        FAIL AC-1 dry run: the new .json is named NEW, once
        FAIL AC-1 dry run: the note's first line is printed once
        FAIL AC-1 dry run: the note's second line, which says to exclude .claude, is printed once
        FAIL AC-1 dry run: the NEW lines are exactly the three new lintable files, nothing else
        FAIL AC-1 real run: the new .cjs is named NEW, once
        FAIL AC-1 real run: the new .test.cjs is named NEW, once
        FAIL AC-1 real run: the new .json is named NEW, once
        FAIL AC-1 real run: the note's first line is printed once
        FAIL AC-1 real run: the note's second line is printed once
        FAIL AC-1 real run: the NEW lines are the same set the dry run printed
    refresh: 203 passed, 12 failed
    === mutate: command exited 1; restored (verified byte-for-byte against /d/agentic-dev-harness/.claude/state/mutations/scripts_refresh-harness.sh.20261009T150828Z.2108436.bak) ===
    $ bash scripts/mutate.sh --check
    mutate: no stranded mutation; nothing of a previous run is in the tree.

  Exactly the 12 AC-1 assertions RED predicted; every AC-2 assertion and the
  identical-trees control stayed green; `git status` shows the script
  unchanged.

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

Planned by `bash scripts/plan.sh write HARNESS-049` from `.claude/harness/models.conf`.
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

- PLANNED - `lead-po` - the orchestrating session, resolved `fable` (Fable 5.1, `claude-fable-5-1`). As planned.
- RED - `test-developer` - resolved `opus` (Opus 5.5, `claude-opus-5-5`; reported by the agent, no override in the dispatch). As planned. Orchestrator re-ran `bash scripts/selftest.sh refresh`: `refresh: 188 passed, 27 failed`, exit 1, 27 `FAIL` lines, matching the handoff; `bash scripts/gates.sh --fast` exit 0 with every gate unconfigured (project.conf is not bootstrapped in this repository).
- GREEN - `feature-developer` - resolved `opus` (Opus 5.5, `claude-opus-5-5`; reported by the agent, no override in the dispatch). As planned. Orchestrator re-ran `bash scripts/selftest.sh refresh`: `refresh: 215 passed, 0 failed`, exit 0, floor 215/215 met; `bash scripts/gates.sh --fast` exit 0, every gate unconfigured.
- GATES - orchestrating session, resolved `opus` (Opus 5.5, `claude-opus-5-5`) after a session model change mid-story; planned `opus` for GATES, so as planned. No feature-developer dispatch: every gate unconfigured, nothing to fix. DV-1 run by the orchestrator through `mutate.sh`.

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Out of scope

<!-- Explicit non-goals. Prevents the Feature Developer from over-building. -->

- Changing what upstream ships, or shipping a `.biomeignore`/`.eslintignore`:
  the consumer's tool config is the consumer's.
- Running the consumer's gates from the refresh.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

<!-- Filled by the Test Developer during RED: which tests, at which level,
     and which AC each one covers. -->

One new block at the end of `.claude/tests/refresh.test.sh` (the last to touch
`$UP`), 50 assertions. Level: integration - the real script run against a
fixture upstream repository and a fixture consumer, exactly as the existing
blocks do; AC-3 is a static read of the script text, the only instrument that
can see "defined in one place". All three ACs are mechanical: whole-line
needles (`exact_count`, here-docs) pinned by the amended Contract, no metric.

Fixture added to `$UP` and committed: `.claude/skills/lint-me/{validate.cjs,
validate.test.cjs, schema.json}` (AC-1 positives), `.claude/skills/lint-me/
{SKILL.md, run.sh}` (AC-2 non-code controls), `.claude/skills/stack-profiles/
check.cjs` (AC-2 unchanged control - the consumer gets upstream's bytes), and
`scripts/helper.mjs` (AC-2 undelivered control - the refresh copies
`scripts/*.sh` only).

| Assertion(s) | AC |
|---|---|
| fixture: consumer lacks `lint-me/`, holds `check.cjs`; tree committed (2) | precondition |
| dry run: exit 0; each of the three NEW lines exactly once; each note line once; the sorted set of NEW lines equals exactly the three; "Dry run: nothing was written." once; `lint-me/` not created; no `    LOCAL ` line names `lint-me/` (10) | AC-1 |
| real run: exit 0; three NEW lines once each; note lines once each; NEW set equals the same three; all five `lint-me/` files delivered byte-identical (8) | AC-1 |
| no line starting `  NEW ` names `check.cjs`, `SKILL.md`, `run.sh`, `scripts/helper.mjs` - dry and real (8); `helper.mjs` is indeed not delivered (1) | AC-2 |
| identical trees: fixture - nothing upstream ships under the five dirs is absent from the consumer, and 4 lintable files exist on both sides (2); exit 0, no NEW line, neither note line (4) | AC-2 control |
| `LINTABLE_EXT` assigned once at column 0; no second assignment; each of eight names in its value; read via `$LINTABLE_EXT`; `cjs mjs tsx jsonc` on no other code line (15) | AC-3 |

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

Written by the Test Developer (RED), 2026-10-09, model `opus` (Opus 5.5,
`claude-opus-5-5`), no override in the dispatch.

**Command.**

    bash scripts/selftest.sh refresh        # ~3 min on this machine (local, not CI)

**Result in RED, script unchanged:** `refresh: 188 passed, 27 failed`, exit 1,
plus the floor line `FAIL refresh  did 188 units of work, below the floor of 215`
(the floor is the executed count; it is met once GREEN turns the 27 green).
Every one of the 165 pre-existing assertions passes (188 = 165 + 23 new that
pass on arrival). The new failures, verbatim:

```
  HARNESS-049 AC-1  a new file a project's tools will read is named NEW, dry run and real run
    FAIL AC-1 dry run: the new .cjs is named NEW, once
         expected: 1
         actual:   0
    FAIL AC-1 dry run: the new .test.cjs is named NEW as a .cjs file, once
         expected: 1
         actual:   0
    FAIL AC-1 dry run: the new .json is named NEW, once
         expected: 1
         actual:   0
    FAIL AC-1 dry run: the note's first line is printed once
         expected: 1
         actual:   0
    FAIL AC-1 dry run: the note's second line, which says to exclude .claude, is printed once
         expected: 1
         actual:   0
    FAIL AC-1 dry run: the NEW lines are exactly the three new lintable files, nothing else
         expected:   NEW       .claude/skills/lint-me/schema.json  (a .json file your linters and formatters will read)
           NEW       .claude/skills/lint-me/validate.cjs  (a .cjs file your linters and formatters will read)
           NEW       .claude/skills/lint-me/validate.test.cjs  (a .cjs file your linters and formatters will read)
         actual:   
    FAIL AC-1 real run: the new .cjs is named NEW, once
         expected: 1
         actual:   0
    FAIL AC-1 real run: the new .test.cjs is named NEW, once
         expected: 1
         actual:   0
    FAIL AC-1 real run: the new .json is named NEW, once
         expected: 1
         actual:   0
    FAIL AC-1 real run: the note's first line is printed once
         expected: 1
         actual:   0
    FAIL AC-1 real run: the note's second line is printed once
         expected: 1
         actual:   0
    FAIL AC-1 real run: the NEW lines are the same set the dry run printed
         expected:   NEW       .claude/skills/lint-me/schema.json  (a .json file your linters and formatters will read)
           NEW       .claude/skills/lint-me/validate.cjs  (a .cjs file your linters and formatters will read)
           NEW       .claude/skills/lint-me/validate.test.cjs  (a .cjs file your linters and formatters will read)
         actual:   

  HARNESS-049 AC-2  an unchanged file, a non-code file and an undelivered file are not named

  HARNESS-049 AC-3  the extensions a project's tools read are written once
    FAIL AC-3: exactly one column-0 assignment LINTABLE_EXT="..."
         expected: 1
         actual:   0
    FAIL AC-3: and no second assignment to it anywhere (local, readonly, +=)
         expected: 1
         actual:   0
    FAIL AC-3: the set names js
         LINTABLE_EXT is ""
    FAIL AC-3: the set names cjs
         LINTABLE_EXT is ""
    FAIL AC-3: the set names mjs
         LINTABLE_EXT is ""
    FAIL AC-3: the set names ts
         LINTABLE_EXT is ""
    FAIL AC-3: the set names tsx
         LINTABLE_EXT is ""
    FAIL AC-3: the set names json
         LINTABLE_EXT is ""
    FAIL AC-3: the set names jsonc
         LINTABLE_EXT is ""
    FAIL AC-3: the set names py
         LINTABLE_EXT is ""
    FAIL AC-3: the script reads the variable rather than only declaring it
         expected: yes
         actual:   no
    FAIL AC-3: .cjs appears on no code line but the assignment
         expected: 1
         actual:   0
    FAIL AC-3: .mjs appears on no code line but the assignment
         expected: 1
         actual:   0
    FAIL AC-3: .tsx appears on no code line but the assignment
         expected: 1
         actual:   0
    FAIL AC-3: .jsonc appears on no code line but the assignment
         expected: 1
         actual:   0

refresh: 188 passed, 27 failed
```

**Why each failure is the right one.** Every AC-1 failure is a count of 0 for a
pinned whole line, or an empty NEW set: the script prints no NEW line and no
note today, which is the defect. The refresh itself ran and exited 0 in both
runs (those assertions pass), so nothing failed for a fixture or harness
reason. Every AC-3 failure is "no `LINTABLE_EXT` exists", the absence the
criterion names. Nothing failed on a syntax error, an unbound variable or a
timeout.

**The exact output GREEN must print** (amended Contract, "Output shape", is the
authority; repeated here verbatim, quotes not included):

    "  NEW       .claude/skills/lint-me/validate.cjs  (a .cjs file your linters and formatters will read)"
    "  NEW       .claude/skills/lint-me/validate.test.cjs  (a .cjs file your linters and formatters will read)"
    "  NEW       .claude/skills/lint-me/schema.json  (a .json file your linters and formatters will read)"
    "            Your project's own linters, formatters and test runners will read"
    "            these files unless their configuration excludes .claude."

General form `"  NEW       $path  (a .$ext file your linters and formatters will read)"`,
`$ext` = text after the last dot, `$path` = `.claude/<d>/<rel>`. The note once
per run, only when at least one NEW line printed. And the variable, at column 0:

    LINTABLE_EXT="js cjs mjs ts tsx json jsonc py"

**What the tests pin about behaviour.** New = present under
`$UP/.claude/{agents,commands,skills,hooks,tests}`, absent from the consumer at
the same path, extension in `LINTABLE_EXT`, judged BEFORE the copy loop (the
real run must print the same set as the dry run; a comparison after the copy
finds everything present and names nothing). `scripts/` is not walked (Contract
amended: `scripts/helper.mjs` must never be named). Exit 0 in both runs; the
dry run still writes nothing (existing fingerprint assertion and `lint-me/` not
created); no `    LOCAL ` line for the new files.

**What the tests do NOT constrain** (GREEN's choice): where in the report the
NEW block sits (Contract recommends after the `REPLACED  .claude/<d>/` lines);
the empty line after the note; the order of NEW lines; how the extension test
is implemented (`case` over `" $LINTABLE_EXT "`, a loop, ...) as long as it
reads the variable; case sensitivity of extensions (`.JSON` is untested);
files with no extension; whether a new lintable file inside a directory the
consumer already HAS is named (the logic implies yes; only the new-directory
case is fixtured); the variable's position in the file (bash 3.2 semantics
aside, the AC-3 greps read the whole file). Keep inserts below line 148
(sigpipe pins 134, 135, 147, 148 in `sigpipe.test.sh`).

**Files touched.**

- `.claude/tests/refresh.test.sh` - new HARNESS-049 block before `summary`
  (helpers `new_lines_naming`, `new_lines_of`; fixture; AC-1, AC-2, AC-3).
- `.claude/tests/floors.conf` - `floor | refresh | 165` -> `215`, plus the
  `# HARNESS-049 raised refresh 165 -> 215` measurement block at the end.
- `.claude/tests/selftest.test.sh` - hand-copied table `refresh 165` -> `215`.
- `docs/backlog/stories/HARNESS-049.md` - Contract amended in three places
  (scripts/ skip, AC-3 spelling, exact output lines), `## Test plan`, this
  handoff.
- Not touched: `scripts/refresh-harness.sh`.

**Passed on arrival (23), and what earns them.** They assert absence or are
fixture/side-effect checks that the unchanged script already satisfies:

| Assertion(s) | Earned by |
|---|---|
| fixture preconditions (2 AC-1, 2 control, 1 helper.mjs not delivered) | they check the fixture, not the script; the control's `lintable = 4` is what makes the identical-trees run non-vacuous |
| dry/real exit 0 (2), dry-run line, `lint-me/` not created, no LOCAL line, files delivered (4) | existing behaviour the story must not break; pinned by HARNESS-040/AC-4-era blocks already |
| AC-2 `check.cjs` not NEW (2) and control: no NEW line, no note (3); the control's exit 0 (1) is existing behaviour, unearned | mutant "drop the `[ -e "$PROJ/..." ] && continue` existence test" - measured below, 7 red |
| AC-2 `SKILL.md`/`run.sh` not NEW (4) | mutant "extension filter accepts everything" - measured below, 6 red |
| AC-2 `scripts/helper.mjs` not NEW (2) | NOT earned in RED: no candidate walked `scripts/`. A mutant adding `scripts/` to the walk would earn it; left to `/audit-mutations` |

**Negative controls, measured outside the tree.** In RED the script has no
comparison to break, so the controls were measured against a CANDIDATE
implementation in the session scratchpad (a copy of `refresh-harness.sh` with
an 11-line comparison inserted after the LOCAL block and a 6-line print after
the `REPLACED  .claude/<d>/` loop, plus copies of `_lib.sh` and this test file
in the same layout). These are numbers for that candidate, not for the shipped
script: GREEN confirms them against its own implementation.

| Run | Expected | Measured (local, this machine) |
|---|---|---|
| candidate | 215 passed, 0 failed | `refresh: 215 passed, 0 failed` |
| DV-1: list emptied before printing (comparison returns nothing) | the 12 AC-1 NEW/note/set assertions red, all AC-2 green | `refresh: 203 passed, 12 failed` - exactly the 12 AC-1 lines; AC-2 and its control green |
| existence test removed (names every lintable upstream file) | `check.cjs` and the identical-trees control red | `refresh: 208 passed, 7 failed` - both NEW-set checks, `check.cjs` dry+real, control no-NEW and both note lines |
| extension filter accepts all | `SKILL.md`, `run.sh` red | `refresh: 209 passed, 6 failed` - both NEW-set checks, SKILL.md and run.sh dry+real |

**DV-1 predicted outcome** (Owner: GATES, the orchestrator's to run with
`scripts/mutate.sh` against the shipped script): with the NEW-file list made
empty, `bash scripts/selftest.sh refresh` reports 12 failures, all "AC-1 dry
run"/"AC-1 real run" NEW-line, note-line and NEW-set assertions; every AC-2
assertion, including "AC-2 control: and prints no NEW line at all", stays
green. Measured as `203 passed, 12 failed` on the candidate - a claim about the
shipped script until GATES runs it.

**security-audit.test.sh AC-4 checked.** Its two refresh runs (lines 482, 504)
read `$out` for nothing but the exit status; every other assertion inspects
files in the project (`cmp`, `[ -e ]`, `vendor_problems`, `vendor_listed`). A
`NEW  .claude/skills/security-audit/....cjs` line can neither satisfy nor break
any of its needles. The real-tree refresh will now print NEW lines for
`security-audit/*.cjs` and `report-schema.json`; it must still exit 0, which the
Contract already requires.

**Timings.** All local (Windows, Git Bash), none from CI: the `refresh` suite
took 3m11s wall; `selftest` suite ~2.5 min. The new block adds four refresh
runs (two dry, one real, one control) to a suite of dozens; no timeout is
involved (bash suites have none).

**Checks run.** `bash scripts/check-sigpipe.sh` exit 0 (49 files, 0 findings);
`bash scripts/check-grep-count.sh` exit 0 (0 findings); `bash scripts/selftest.sh
selftest` exit 0, `selftest: 268 passed, 0 failed` with the raised table.
`gates.sh --fast` NOT run, per the dispatch (the orchestrator runs gates).
Nothing committed: the Contract asks for the floors in RED's own commit, which
is the orchestrator's to make.

**Discovered.** (1) The selftest floor check compares the PASSED count with the
floor, so in RED the suite also prints `below the floor of 215`; that is the
HARNESS-040 precedent, not a new failure. (2) The new note text replaces the
PO's draft wording; see the amended Contract. (3) `gawk`'s `index(s, "")`
returns 0, so an empty-needle "count NEW lines" helper would be vacuous; the
control uses `new_lines_of` (the set) instead.

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

    run:    2026-10-09T15:12:31Z
    commit: ad07683
    tree:   44f76cfe8a7d831edd855ce3950e50e7efd4d67e
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

**GREEN (Feature Developer, 2026-10-09).** Model resolved: `opus` (Opus 5.5,
`claude-opus-5-5`), the agent definition's own `model:`; the dispatch carried
no override.

Change, `scripts/refresh-harness.sh` only, 36 lines inserted, nothing removed,
all below line 148 (the sigpipe pins at 134, 135, 147, 148 are untouched):

- new lines 338-367, between the LOCAL block and the KEPT walk: a header
  comment (the fantasy-world-builder incident), the one column-0
  `LINTABLE_EXT="js cjs mjs ts tsx json jsonc py"`, and a walk of `find . -type f`
  under `$UP/.claude/{agents,commands,skills,hooks,tests}` (not `scripts/`),
  in the script's existing here-string idiom. A file is collected when its
  basename has a dot, the text after the last dot is a word of
  `" $LINTABLE_EXT "` (a `case`; the variable's only reader), and
  `$PROJ/.claude/$d/$rel` does not exist. Judged before the copy loop, so the
  dry and real runs collect the same set. The pinned NEW lines are built into
  `new_lintable` as they are found.
- new lines 428-433, right after the `REPLACED  .claude/<d>/` lines: when
  `new_lintable` is non-empty, print it, then the two pinned note lines, then
  an empty line. Empty: nothing.

Results (local, Windows Git Bash):

    bash scripts/selftest.sh refresh          -> refresh: 215 passed, 0 failed  (exit 0, floor met: 215/215)
    bash scripts/check-sigpipe.sh             -> exit 0, 49 files, 0 finding(s)
    bash scripts/check-grep-count.sh          -> exit 0, 49 files, 0 finding(s)
    bash scripts/selftest.sh sigpipe          -> exit 0, 82/82
    bash scripts/selftest.sh security-audit   -> exit 0, 51/51 (its real-tree refresh still exits 0)

Negative controls from the handoff, measured against the shipped script with
`scripts/mutate.sh` (both restored, `cmp`-verified; `mutate.sh --check` clean):

    existence test removed (line 363 -> `:`)       -> refresh: 208 passed, 7 failed
      FAIL AC-1 dry run: the NEW lines are exactly the three new lintable files, nothing else
      FAIL AC-1 real run: the NEW lines are the same set the dry run printed
      FAIL AC-2 dry run: no NEW line names a file the consumer already has at the same path (.claude/skills/stack-profiles/check.cjs)
      FAIL AC-2 real run: no NEW line names a file the consumer already has at the same path (.claude/skills/stack-profiles/check.cjs)
      FAIL AC-2 control: and prints no NEW line at all
      FAIL AC-2 control: and not the note's first line
      FAIL AC-2 control: nor its second
    extension filter accepts everything (line 362 -> `:`) -> refresh: 208 passed, 7 failed
      FAIL AC-1 dry run: the NEW lines are exactly the three new lintable files, nothing else
      FAIL AC-1 real run: the NEW lines are the same set the dry run printed
      FAIL AC-2 dry run: no NEW line names a new .md file (.claude/skills/lint-me/SKILL.md)
      FAIL AC-2 real run: no NEW line names a new .md file (.claude/skills/lint-me/SKILL.md)
      FAIL AC-2 dry run: no NEW line names a new .sh file (.claude/skills/lint-me/run.sh)
      FAIL AC-2 real run: no NEW line names a new .sh file (.claude/skills/lint-me/run.sh)
      FAIL AC-3: the script reads the variable rather than only declaring it

The first matches RED's prediction exactly (7, the same seven). The second
diverges, benignly: RED predicted 6 and measured 6 on its candidate; the
shipped script gives the same 6 plus `AC-3: the script reads the variable`,
because the mutated `case` line is the only place this implementation reads
`$LINTABLE_EXT`, so deleting the filter also deletes the read. RED's candidate
evidently read the variable somewhere else too. Not a defect in the test or
the script; recorded so GATES does not read 7 as a mismatch.

Not run here, per the dispatch: DV-1 (GATES, orchestrator), the full
`selftest.sh`, `gates.sh --fast` and `gates.sh`.


**GATES (orchestrator, 2026-10-09).** DV-1 run first and pasted under
`## Deferred verifications`: `refresh: 203 passed, 12 failed`, exactly the
predicted twelve AC-1 assertions, file restored. GREEN's second control (7
rather than RED's 6) checked against the diff: the extra failure is AC-3's
"reads the variable", because line 362 is the implementation's only read of
`$LINTABLE_EXT`; a benign difference between RED's candidate and the shipped
script, not a defect. `bash scripts/gates.sh`: recorded under
`## Gate results` (all gates unconfigured in this repository; required gate
for this story is the harness `selftest`, which CI runs). Full self-test
with `SELFTEST_JOBS=4`, at GATES, alone in the worktree:

    exit 0 in 2370 s
    assertion floors: all 26 suite(s) met their declared floor (3043 assertions executed, 2752 declared).
    26 harness suite(s) passed.

**DONE, 2026-10-09.** Merged in #125 (merge commit 9344200), release 89. The
VERSION bump lands in this DONE commit. `phase.sh set DONE --force` run on
`main`, overriding the branch check, as HARNESS-048 did. PR CI, first run,
timings read from the job: `gates` passed in 2m36s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37955316637),
of which the harness self-test took 2m23s and ended `26 harness suite(s)
passed.` with `refresh: 215 passed, 0 failed`; the sigpipe and grep-count
guards 3 s each; `Run gates` under a second (`All required gates passed (0
ran, 7 unconfigured, 0 known)`). `boundaries` passed in 7s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37955316622).
No step runs under a limit it could approach: the bash suites carry no
timeout and the job is 2.6 min against the runner's 6 h default.
