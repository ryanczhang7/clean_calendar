---
id: HARNESS-020
title: A project declares its own suites' floors in a file the refresh keeps
slug: a-project-declares-its-own-suites-floors
epic: 
type: chore
status: done
phase: DONE
branch: story/HARNESS-020-a-project-declares-its-own-suites-floors
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [scripts/selftest.sh, .claude/tests/selftest.test.sh, .claude/tests/refresh.test.sh, .claude/tests/floors.conf]         # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

<!-- Why this story exists. Link the epic and any wiki pages that constrain it.
     Name the REQUIRED gate that would fail if this story's artifact broke. If
     only an optional gate can, put it in required_gates above before RED:
     every required gate once passed over a story none of them exercised. -->

Found on 2026-10-01 while refreshing `fantasy-world-builder` (FWB) from release
45 to 62. After the refresh, FWB's full `bash scripts/selftest.sh` fails before
running a single suite:

```
FAIL project-ci  no floor line in .claude/tests/floors.conf; every suite must declare one
FAIL project-handoff  no floor line in .claude/tests/floors.conf; every suite must declare one
FAIL project-harness-deps  no floor line in .claude/tests/floors.conf; every suite must declare one
FAIL project-sections  no floor line in .claude/tests/floors.conf; every suite must declare one
FAIL project-sigpipe  no floor line in .claude/tests/floors.conf; every suite must declare one
```

The assertion-floor audit (ported from manga-translator's MT-039) requires a
floor for **every** suite in `.claude/tests`. A consuming project's own suites
are named `project-*.test.sh` precisely so the refresh keeps them. But the only
place a floor can be declared, `.claude/tests/floors.conf`, ships upstream and is
**replaced on every refresh**. So a project can satisfy the audit only by editing
an upstream file, which the next refresh then wipes and flags as `LOCAL`. Every
consuming project with its own suites fails its selftest after refreshing, and
with it the CI job that runs the selftest first: FWB's `boundaries.yml` does.

The fix is a project-owned floors file that the refresh keeps:
`.claude/tests/project-floors.conf`. Upstream never ships it, so
`refresh-harness.sh` already treats it as `KEPT`, the same as `project-*.test.sh`.

Required gate that would fail if this story's artifact broke: `unit`
(`bash scripts/selftest.sh`, which runs `selftest.test.sh` and `refresh.test.sh`).

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC.
     An AC that names a statistic, a metric or a threshold names a NEGATIVE
     CONTROL too: the deliberately broken input the metric must reject, and
     roughly what it should score. A criterion can be perfectly testable and
     still be blind to the defect it exists to catch, and that is more
     dangerous than a vague one - it survives review and goes green. -->


- **AC-1** — Given a suite whose floor is declared only in
  `.claude/tests/project-floors.conf`, when the full `bash scripts/selftest.sh`
  runs, then the floors audit accepts it, and that floor is enforced: the run
  fails when the suite executes fewer assertions than declared, and passes when
  it executes at least that many.
- **AC-2** — Given a suite with a floor in neither file, when the full selftest
  runs, then it fails, and the message names both
  `.claude/tests/floors.conf` and `.claude/tests/project-floors.conf`, so a
  project knows where its own suite's floor belongs.
- **AC-3** — Given `project-floors.conf`, when a line in it is malformed, names
  a suite with no `.claude/tests/<name>.test.sh`, or names a suite that also
  has a floor in `floors.conf`, then the full run fails, naming
  `.claude/tests/project-floors.conf`, the line number, and the fault.
  *Control:* with no `project-floors.conf` at all, behaviour is exactly as
  before. An upstream tree passes, and the absence is not a fault.
- **AC-4** — Given a single-suite run (`selftest.sh <name>`) of a suite floored
  in `project-floors.conf`, then that floor is enforced, as a single-suite run
  already enforces a `floors.conf` floor.
- **AC-5** — Given a project with a `.claude/tests/project-floors.conf`, when
  `refresh-harness.sh` runs (dry run and real), then the file is reported
  `KEPT`, not `LOCAL`, and survives byte-identical. *Control:* upstream's
  `floors.conf` in the same refresh is still replaced.

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

RED may amend any block here in place, with a reason. GREEN builds what the
amended block says.

**Writes:** `scripts/selftest.sh`, `.claude/tests/selftest.test.sh`,
`.claude/tests/refresh.test.sh`, `.claude/tests/floors.conf`

### `scripts/selftest.sh`

- A second floors file, `PROJECT_FLOORS_REL=".claude/tests/project-floors.conf"`,
  is resolved from `$ROOT`, the same way `FLOORS_REL` is.
- The loading loop becomes one function applied to each file:
  `load_floors <abs-path> <rel-path>`, called for `floors.conf` and then,
  **only if it exists**, for `project-floors.conf`. It keeps the same grammar,
  the same three faults (not a floor line, unknown kind, names a missing suite,
  not a number), and the same messages, with `<rel-path>:<lineno>` in place of
  the hard-coded `$FLOORS_REL:$lineno`. So existing fault strings for
  `floors.conf` are unchanged, byte for byte.
- **A suite floored in both files is a fault**, recorded against
  `project-floors.conf`'s line:
  `.claude/tests/project-floors.conf:<n>  floor for '<name>' is already declared in .claude/tests/floors.conf; a suite has one floor`.
  The duplicate is not loaded.
- The missing-floor message on a full run becomes:
  `<name>  no floor line in .claude/tests/floors.conf or .claude/tests/project-floors.conf; every suite must declare one (a project's own suites go in project-floors.conf)`.
  This is the one existing message that changes, so any existing test that pins
  the old text is a caller (see below).
- `.claude/tests/floors.conf` absent remains a fault, as today.
  `project-floors.conf` absent is never a fault.
- The process budget stands: no new forks per suite (DV-5 in the file).
  Loading a second file is one more `while read` loop, not a subprocess.

**Amended in RED (2026-10-01), two additions, both forced by AC-1/AC-3:**

- **The shortfall names the file the floor came from.** Today it is
  `FAIL <name>  did <n> units of work, below the floor of <f> in $FLOORS_REL`,
  with `floors.conf` hard-coded. For a project-floored suite that sends the
  reader to edit the upstream file the refresh wipes, which is the defect this
  story removes. So: a floor loaded from `project-floors.conf` reports
  `FAIL <name>  did <n> units of work, below the floor of <f> in .claude/tests/project-floors.conf`,
  and a floor from `floors.conf` reports exactly what it reports today, byte for
  byte. Pinned by selftest.test.sh on both the full and the single-suite run.
  How the source travels with the floor (a third field in `$FLOORS`, a second
  list) is GREEN's choice, inside DV-5: no fork.
- **A fault that names no suite must be printed.** Found in RED and measured on
  the shipped `selftest.sh`: a fault queued as `"<TAB><message>"` (both
  `is not a floor line` and `does not exist` are) is read back by
  `while IFS="$TAB" read -r fname fmsg`. TAB is an IFS *whitespace* character,
  so `read` strips the leading TAB, the message lands in `fname`, `fmsg` is
  empty, and `[ -n "$fmsg" ] || continue` drops it. A `floors.conf` containing
  `this is not a floor` passes the full run today, exit 0; the missing-
  `floors.conf` fault is printed only by accident, because every suite then
  also lacks a floor. AC-3(a) needs a malformed `project-floors.conf` line to
  fail, so reusing the loading code as-is cannot satisfy it. The report path
  must carry an unnamed fault (a non-whitespace placeholder name, or a
  separator that is not IFS whitespace - GREEN's choice) and print
  `FAIL <message>` for it on a full run. The message strings themselves do not
  change. Consequence: a malformed line in `floors.conf` now fails the full run,
  as the file's header has always said it does. This tree has none, so the
  upstream run is unaffected. On a single-suite run an unnamed fault belongs to
  no suite and is not reported, as now (not pinned either way).

### `.claude/tests/floors.conf`

Its header gains one paragraph saying that a consuming project's own suites
declare their floors in `project-floors.conf`, which upstream never ships and
the refresh keeps. **No floor value changes**, so the hand-copied table in
`selftest.test.sh` is untouched.

### Callers of the changed message

The missing-floor text changes, so every test that matches
`no floor line in .claude/tests/floors.conf` is a caller. RED must grep for it
and update every one in the same phase; this story may change those
assertions' needles, because the criterion they serve is unchanged.
Orchestrator's grep, 2026-10-01:
`grep -rn 'no floor line' .claude/tests/ scripts/` returns only
`selftest.test.sh:242-243`, whose needle is the bare `no floor line`, which the
new text still contains. So no existing assertion needs changing. RED re-runs it and lists
the results in the handoff.

### `refresh-harness.sh`

**No change expected.** It keeps any file inside a replaced directory that
upstream does not ship, and upstream does not ship `project-floors.conf`. AC-5
pins that. If RED finds the refresh does not keep it, that is a finding, and the
Contract gains a block.

**Upstream must never ship `.claude/tests/project-floors.conf`.** If it ever
did, the refresh would replace every project's file. That is out of scope for a
guard here; it is noted in `## Out of scope`.

### Oracle partition

Everything is mechanical: exact fault strings, exact exit statuses, KEPT and
LOCAL lines.

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

- **Defect put back: the project file is not read.** With the call that loads
  `project-floors.conf` removed from `selftest.sh`, AC-1's fixture MUST fail
  with the missing-floor fault. RED cannot run this, because the call does not
  exist yet. **Owner: GATES.** Run it with `scripts/mutate.sh` against
  `bash .claude/tests/selftest.test.sh`.

  **Result (GATES, 2026-10-01, orchestrator):** run as planned; 18 red, exactly
  the set RED predicted (AC-1 entire, the floors.conf shortfall control, AC-2's
  only-the-unfloored, AC-3 (a)-(d), AC-4 except its at-floor exit). Restored.

  ```
  === mutate: scripts/selftest.sh (1 line(s) changed by s#^  load_floors "\$PROJECT_FLOORS_FILE" "\$PROJECT_FLOORS_REL"#  :#) ===
    183 -   load_floors "$PROJECT_FLOORS_FILE" "$PROJECT_FLOORS_REL"
    183 +   :
  === mutate: running bash .claude/tests/selftest.test.sh ===
      FAIL a full run with a project-floored suite exits 0
      FAIL and says both suites passed
      FAIL and counts both floors as met, the project's included
      FAIL and the project suite is not reported as missing a floor
      FAIL and no fault of any kind is printed
      FAIL the shortfall names the suite, both numbers and project-floors.conf
      FAIL and its shortfall line names floors.conf, byte for byte as before
      FAIL and only the unfloored suite is named
      FAIL named with project-floors.conf, line 4, and the fault
      FAIL named with project-floors.conf, line 3, the suite, and the missing file
      FAIL named against project-floors.conf's line 2, naming floors.conf
      FAIL an unknown kind is named with project-floors.conf and its line
      FAIL a non-number is named with project-floors.conf and its line
      FAIL a project suite below its project floor fails its single-suite run
      FAIL naming the suite, both numbers and project-floors.conf
      FAIL and it is not waved through as having no floor
      FAIL and the floor is counted as met
      FAIL with no missing-floor warning
  selftest: 77 passed, 18 failed
  === mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_selftest.sh.20261001T220201Z.2955167.bak) ===
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

Planned by `bash scripts/plan.sh write HARNESS-020` from `.claude/harness/models.conf`.
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

- RED: `test-developer` resolved to `opus` (`claude-opus-5-5`, agent definition; no override). Verdict: 51 assertions (24 red for the right reason); it found a pre-existing defect (dropped unnamed faults), which the orchestrator reproduced independently.
- GREEN: `feature-developer` resolved to `opus` (`claude-opus-5-5`, agent definition; no override). Verdict: suites green with no test touched; every RED control measured at its expected value.

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Out of scope

<!-- Explicit non-goals. Prevents the Feature Developer from over-building. -->

- A guard that upstream never ships `project-floors.conf`.
- Raising any floor in `floors.conf`.
- Changing which files `refresh-harness.sh` replaces.
- Writing FWB's floors. That happens in FWB's refresh, after this merges.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

<!-- Filled by the Test Developer during RED: which tests, at which level,
     and which AC each one covers. -->

All mechanical. Integration level throughout: each case builds a throwaway
tree, runs the real script (a fixture copy of `scripts/selftest.sh`, or
`scripts/refresh-harness.sh` against a stand-in upstream repository) and reads
its exit status and its output. Every fault needle is a **whole output line**,
compared with `grep -cxF` (`exact_lines` / `exact_count`), because the Contract
pins the strings byte for byte and a floating substring is satisfied by the
wrong file name in the right sentence. Every exit-status assertion sits beside
an exact-line assertion in the same block, because the current code also exits
1 in most of these fixtures - for the wrong reason.

`.claude/tests/selftest.test.sh` - 41 new assertions, appended after the
real-tree block; `reset_suites` now also removes `project-floors.conf`.

| Block | AC | What it pins |
|---|---|---|
| `AC-1 a suite floored only in project-floors.conf passes the full-run audit` | AC-1 | full run, `alpha` in floors.conf + `project-mine` (4 = floor 4) in project-floors.conf: exit 0, `2 harness suite(s) passed.`, floors line `all 2 ... (7 assertions executed, 7 declared)`, no `^FAIL project-mine  no floor line`, no `FAIL` anywhere |
| `AC-1 and that floor is enforced, not merely accepted` | AC-1 | `project-mine` 3 against 4: exit 1, exact `FAIL project-mine  did 3 units of work, below the floor of 4 in .claude/tests/project-floors.conf` (Contract amendment) |
| `AC-1 a floors.conf floor's shortfall still names floors.conf` | AC-1 (amendment control) | with a project file present, `alpha` 2 against 3: exact `FAIL alpha  did 2 units of work, below the floor of 3 in .claude/tests/floors.conf` |
| `AC-2 a suite floored in neither file names both files` | AC-2 | with no project file, and again with one present: exit 1, exact `FAIL project-orphan  no floor line in .claude/tests/floors.conf or .claude/tests/project-floors.conf; every suite must declare one (a project's own suites go in project-floors.conf)`; old one-file wording absent; only the orphan is named |
| `AC-3 a project-floors.conf fault is named, with its file, line and fault` | AC-3 | malformed line 4, missing suite line 3, duplicate-with-floors.conf line 2, unknown kind line 2, non-number line 3 - each exit 1 and the exact `FAIL .claude/tests/project-floors.conf:<n>  <fault>` line from the Contract. A comment and a blank line precede the faults, so a parsed-line counter gets the number wrong |
| `AC-3 a fault that names no suite is reported, not dropped` | AC-3 (amendment) | `floors.conf` line `this is not a floor` → exit 1 and `FAIL .claude/tests/floors.conf:2  is not a floor line: 'this is not a floor'`; no floors.conf → `FAIL .claude/tests/floors.conf  does not exist; ...` printed in its own words |
| `AC-3 control: no project-floors.conf is not a fault` | AC-3 control | upstream-shaped tree: exit 0, `2 harness suite(s) passed.`, the string `project-floors.conf` nowhere in the output, no `^FAIL` line |
| `AC-4 a single-suite run enforces a project-floors.conf floor` | AC-4 | `selftest.sh project-mine` at 3 against 4: exit 1, exact shortfall line naming project-floors.conf, no `WARNING: no floor line for project-mine`; at 4: exit 0, `all 1 suite(s) met ... (4 assertions executed, 4 declared)`, no warning |

`.claude/tests/refresh.test.sh` - 10 new assertions, one block at the end
(`AC-5 a project's project-floors.conf is KEPT, and floors.conf is replaced`).
Upstream gains a committed `floors.conf`; the project holds a
`project-floors.conf` with a trailing-space line, a blank line and no final
newline, an `OLD floors` floors.conf and a `project-ci.test.sh`. Dry run and
real run each: exit 0, exactly one line
`  KEPT      .claude/tests/project-floors.conf  (upstream does not ship it - yours)`,
zero lines `    LOCAL     .claude/tests/project-floors.conf`, and `cmp` against
a saved copy. Control: after the real run `floors.conf` is `cmp`-equal to
upstream's and is not reported KEPT.

Not tested, deliberately: the single-suite run's `WARNING: no floor line for X
in floors.conf` wording (not in any AC), the `N fault(s) in floors.conf. Nothing
was run.` summary line, and the DV-5 no-fork budget.

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

RED dispatched as `test-developer`, model resolved to `claude-opus-5-5`; no
override was passed to the agent.

### Commands

```
bash .claude/tests/selftest.test.sh      # AC-1..AC-4, ~15 s locally
bash .claude/tests/refresh.test.sh       # AC-5, ~3 min locally (pre-existing cost)
bash scripts/selftest.sh selftest        # same suite through the floors runner
```

### Result at the end of RED (local run, Windows, Git Bash)

```
selftest: 71 passed, 24 failed      (54 pre-existing assertions: all pass; 41 new: 24 red, 17 green)
refresh: 132 passed, 0 failed       (122 pre-existing; 10 new, all green on arrival - see below)
```

Verbatim, the AC-1 block (representative; every red has the same cause):

```
  HARNESS-020 AC-1  a suite floored only in project-floors.conf passes the full-run audit
    FAIL a full run with a project-floored suite exits 0
         expected: 0
         actual:   1
    FAIL and says both suites passed
         expected: 1
         actual:   0
    FAIL and counts both floors as met, the project's included
         expected: 1
         actual:   0
    FAIL and the project suite is not reported as missing a floor
         expected: 0
         actual:   1
    FAIL and no fault of any kind is printed
         expected NOT to contain: FAIL
         actual:                   FAIL project-mine  no floor line in .claude/tests/floors.conf; every suite must declare one
         
         1 fault(s) in .claude/tests/floors.conf. Nothing was run.
```

The other 19 reds, by assertion name: `the shortfall names the suite, both numbers
and project-floors.conf`; `and its shortfall line names floors.conf, byte for
byte as before`; `the fault names both files and where a project's own floor
belongs`; `the old one-file wording is gone`; `and the fault names both files,
the same words`; `and only the unfloored suite is named` (actual 2); the five
`named with project-floors.conf ...` / `named against project-floors.conf's line
2 ...` / `an unknown kind ...` / `a non-number ...` lines (each expected 1,
actual 0); `a malformed floors.conf line fails the full run` (actual 0);
`named with floors.conf, its line, and the fault`; `and says so in its own
words, not only through each suite's missing floor`; and in AC-4 `a project
suite below its project floor fails its single-suite run` (actual 0), `naming
the suite, both numbers and project-floors.conf`, `and it is not waved through
as having no floor`, `and the floor is counted as met`, `with no missing-floor
warning` (both showing `WARNING: no floor line for project-mine in
.claude/tests/floors.conf`).

**Why this is the right failure.** Two causes and only two, both the ones the
story exists to remove: `selftest.sh` does not read `project-floors.conf` (so a
project-floored suite is reported missing on a full run, warned about and waved
through on a single-suite run, and none of the project-file faults are ever
printed), and it still prints the one-file missing-floor wording. Plus the third,
found here and added to the Contract: unnamed faults are dropped (see below).
No red is an error in the test file: every pre-existing assertion passes.

### Every file touched

- `.claude/tests/selftest.test.sh` - `reset_suites` also removes
  `project-floors.conf`; helpers `project_floors`, `exact_lines`; 8 new
  `describe` blocks at the end.
- `.claude/tests/refresh.test.sh` - helper `exact_count`; 1 new `describe`
  block at the end (it commits a `floors.conf` into the stand-in upstream, and
  is the last block to touch it).
- `docs/backlog/stories/HARNESS-020.md` - `## Contract` (amended, see the
  dated block under `scripts/selftest.sh`), `## Test plan`, this handoff.

Not touched: `scripts/selftest.sh`, `scripts/refresh-harness.sh`,
`.claude/tests/floors.conf`. No `project-floors.conf` exists in the real tree.

### AC -> test

The table in `## Test plan` is the per-block map. In one line each:
AC-1 - three `HARNESS-020 AC-1` blocks (accepted, enforced, floors.conf's
shortfall unchanged); AC-2 - one block, two fixtures (project file absent and
present); AC-3 - the fault block (a)-(d), the unnamed-fault block, the control;
AC-4 - one block, below and at the floor; AC-5 - the refresh block.

### The interface the tests pin (bash, so no exports - the CLI and its output)

- Invocation: `bash scripts/selftest.sh` (full) and `bash scripts/selftest.sh <name>`
  (single), run from the fixture root; the fixture holds a copy of
  `scripts/selftest.sh` taken when `selftest.test.sh` starts, so GREEN's
  version is the one exercised.
- The second file is `$ROOT/.claude/tests/project-floors.conf`, grammar
  identical to floors.conf.
- Exact output lines (each matched as a whole line):
  - `FAIL <name>  no floor line in .claude/tests/floors.conf or .claude/tests/project-floors.conf; every suite must declare one (a project's own suites go in project-floors.conf)`
  - `FAIL .claude/tests/project-floors.conf:<n>  is not a floor line: '<line>'`
  - `FAIL .claude/tests/project-floors.conf:<n>  unknown kind '<kind>'; the only kind is 'floor'`
  - `FAIL .claude/tests/project-floors.conf:<n>  floor names '<name>', but .claude/tests/<name>.test.sh does not exist`
  - `FAIL .claude/tests/project-floors.conf:<n>  floor for '<name>' is not a number: '<value>'`
  - `FAIL .claude/tests/project-floors.conf:<n>  floor for '<name>' is already declared in .claude/tests/floors.conf; a suite has one floor`
  - `FAIL <name>  did <n> units of work, below the floor of <f> in .claude/tests/project-floors.conf` (amended) and the same with `.claude/tests/floors.conf` for a floors.conf floor (unchanged)
  - `FAIL .claude/tests/floors.conf:<n>  is not a floor line: '<line>'` and `FAIL .claude/tests/floors.conf  does not exist; every suite must declare its assertion floor there` - unchanged strings, now actually printed (amended)
  - `<k> harness suite(s) passed.` and `assertion floors: all <k> suite(s) met their declared floor (<e> assertions executed, <d> declared).` - unchanged
- With no project-floors.conf, the string `project-floors.conf` appears
  nowhere in a passing run's output.

**Not constrained** (implementer's choice): how the floor's source file is
carried (third field, second list); whether the duplicate check reads the
already-loaded floors.conf table or something else; the unnamed-fault carrier
(placeholder name or a non-IFS-whitespace separator); the single-suite
`WARNING:` text; the `N fault(s) in .claude/tests/floors.conf. Nothing was run.`
summary (it now undercounts its own file name when the faults are the project
file's - worth a tidy, not pinned); whether a single-suite run reports a
duplicate fault for its own suite (it will, by the name field, and that is fine).

### Passed on arrival, and what earns each

**refresh.test.sh, AC-5 - all 10 green on arrival**, as the Contract predicted:
`refresh-harness.sh` already keeps `project-floors.conf`. Earned with two
mutations through `scripts/mutate.sh`, each against `refresh.test.sh` only:

Mutation A - the refresh stops preserving unshipped files in `.claude/tests`
(the file is deleted by the directory replace). Exactly the survival assertion
went red, and nothing else in the 132:

```
=== mutate: scripts/refresh-harness.sh (1 line(s) changed by s|^      cp "\$dst/\$rel" "\$KEEP/\$d/\$rel"$|      [ "$d" = tests ] \|\| cp "$dst/$rel" "$KEEP/$d/$rel"|) ===
  365 -       cp "$dst/$rel" "$KEEP/$d/$rel"
  365 +       [ "$d" = tests ] || cp "$dst/$rel" "$KEEP/$d/$rel"
...
  HARNESS-020 AC-5  a project's project-floors.conf is KEPT, and floors.conf is replaced
    FAIL real run: project-floors.conf survives byte-identical
         it was deleted

refresh: 131 passed, 1 failed

=== mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_refresh-harness.sh.20261001T203237Z.2745432.bak) ===
  365:       cp "$dst/$rel" "$KEEP/$d/$rel"
```

Worth knowing: before this block, **no assertion in `refresh.test.sh` caught a
refresh that deletes a project's own files under `.claude/tests`** - which is
where every consuming project keeps its `project-*.test.sh`.

Mutation B - the LOCAL check stops skipping files upstream does not ship, so it
reports them LOCAL. Both `NOT reported LOCAL` assertions went red (the third red
is a pre-existing assertion in another block):

```
=== mutate: scripts/refresh-harness.sh (1 line(s) changed by s|^      \[ -e "\$UP/\.claude/\$d/\$rel" \] \|\| continue      # yours alone: that is KEPT, above$|      : # mutated: report every downstream file|) ===
  280 -       [ -e "$UP/.claude/$d/$rel" ] || continue      # yours alone: that is KEPT, above
  280 +       : # mutated: report every downstream file
...
  it names the files of yours it is about to overwrite ::     FAIL a project holding upstream's own files is told nothing
  HARNESS-020 AC-5  a project's project-floors.conf is KEPT, and floors.conf is replaced
    FAIL dry run: and is NOT reported LOCAL
         expected: 0
         actual:   1
    FAIL real run: and is NOT reported LOCAL
         expected: 0
         actual:   1

refresh: 129 passed, 3 failed

=== mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_refresh-harness.sh.20261001T203738Z.2753441.bak) ===
  280:       [ -e "$UP/.claude/$d/$rel" ] || continue      # yours alone: that is KEPT, above
```

Not earned by mutation (within the budget, left to `/audit-mutations`): the two
`KEPT, once` lines, the dry-run `untouched` cmp, and the two floors.conf control
assertions. The KEPT needle is a full anchored line, so a missing or reworded
line cannot satisfy it.

**selftest.test.sh, the AC-3 control - all 4 green on arrival** (current code
never mentions project-floors.conf). Earned with one mutation that models the
defect it guards - an absent file treated as a fault, named as the project file:

```
=== mutate: scripts/selftest.sh (2 line(s) changed by s|\[ -f "\$FLOORS_FILE" \] \|\||[ -f "$FLOORS_FILE.absent" ] \|\||; s|FAULTS="\$FAULTS\$TAB\$FLOORS_REL  does not exist|FAULTS="${FAULTS}x$TAB.claude/tests/project-floors.conf  does not exist|) ===
  178 -   [ -f "$FLOORS_FILE" ] || [ -z "$SUITES" ] || \
  178 +   [ -f "$FLOORS_FILE.absent" ] || [ -z "$SUITES" ] || \
  179 -     FAULTS="$FAULTS$TAB$FLOORS_REL  does not exist; every suite must declare its assertion floor there
  179 +     FAULTS="${FAULTS}x$TAB.claude/tests/project-floors.conf  does not exist; every suite must declare its assertion floor there
...
  HARNESS-020 AC-3  control: no project-floors.conf is not a fault
    FAIL with no project-floors.conf the full run exits 0
         expected: 0
         actual:   1
    FAIL and says both suites passed
         expected: 1
         actual:   0
    FAIL and project-floors.conf is not mentioned at all
         expected NOT to contain: project-floors.conf
         actual:                   FAIL .claude/tests/project-floors.conf  does not exist; every suite must declare its assertion floor there
         
         1 fault(s) in .claude/tests/floors.conf. Nothing was run.
    FAIL and no line is a fault
         expected: 0
         actual:   1

=== mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_selftest.sh.20261001T202512Z.2730345.bak) ===
```

The `x` name in that mutation is necessary, and it is how the unnamed-fault
defect was found: the first attempt left the name empty, and the fault never
printed.

**The other 13 green-on-arrival assertions in selftest.test.sh** are exit-status
and "not blamed" companions whose block also holds a red exact-line assertion
(for example `a project suite below its project floor fails the full run` -
today it exits 1 because the floor is missing, and the red shortfall line beside
it is what tells the two apart). Each block is red as a whole; those companions
are not claimed as independently earned.

### Negative controls - expected values

No thresholds in this story; every control is a mechanical count. The suite does
NOT fail at import here - all assertions ran - so the "measured" column is real,
taken against the current, unimplemented `selftest.sh`.

| Control | Expected after GREEN | Measured in RED |
|---|---|---|
| no project-floors.conf: exit status | 0 | 0 |
| no project-floors.conf: lines mentioning `project-floors.conf` | 0 | 0 |
| no project-floors.conf: `^FAIL` lines | 0 | 0 |
| floors.conf floor's shortfall names floors.conf (exact line count) | 1 | 0 (run aborts on project-mine's missing floor) |
| AC-1 enforced: shortfall exact line count | 1 | 0 |
| AC-5 control: floors.conf `cmp`-equal to upstream after real run | equal | equal |
| AC-5 control: `KEPT .claude/tests/floors.conf` lines | 0 | 0 |

### Discovered - changes the approach (Contract amended)

1. **Unnamed faults are dropped by the report loop** (`IFS=<TAB>` read: TAB is
   IFS whitespace, the leading TAB is stripped, `fmsg` comes back empty, the
   fault is skipped). Measured: a floors.conf containing `this is not a floor`
   passes the full run with exit 0 on the shipped script. AC-3(a) cannot pass by
   reusing the loader unchanged; the report path must be fixed. This makes a
   malformed floors.conf line fail too - which the file's own header already
   promises, and which no tree has today.
2. **The shortfall's file name** must follow the floor (see the Contract).

### `grep -rn 'no floor line' .claude/tests/ scripts/` (re-run at end of RED)

```
.claude/tests/selftest.test.sh:233:describe "AC-6  a suite with no floor line fails the run"
.claude/tests/selftest.test.sh:247:assert_contains "it says a floor is missing" "no floor line" "$out"
.claude/tests/selftest.test.sh:248:miss="$(printf '%s\n' "$out" | grep -F 'no floor line' | head -1)"
scripts/selftest.sh:41:#     not exist, a non-numeric value, or a suite with no floor line each fail
scripts/selftest.sh:185:      FAULTS="$FAULTS$name$TAB$name  no floor line in $FLOORS_REL; every suite must declare one
scripts/selftest.sh:229:    printf 'WARNING: no floor line for %s in %s, so this run cannot tell\n' \
```

plus this story's own new needles in selftest.test.sh (the HARNESS-020 blocks).
Confirmed: the pre-existing AC-6 needle is the bare `no floor line`, which the
new text still contains, so no pre-existing assertion needed changing.

### Prediction for the GATES deferred verification

Removing the call that loads `project-floors.conf` should turn red, in
`selftest.test.sh`: all of the AC-1 "accepted" block (exit 0, 2 passed, floors
met, `^FAIL project-mine  no floor line` count 1, `FAIL` present); the AC-1
enforced shortfall line and the floors.conf-shortfall control (the run aborts
on the missing floor); AC-2's `and only the unfloored suite is named` (2, not
1); every AC-3 (a)-(d) exact line; and all of AC-4 except `at its project floor
the single-suite run exits 0`. It should leave green: AC-2's first fixture (no
project file there), the unnamed-fault block (floors.conf only), and the
no-project-file control. The assertion named in the DV, AC-1's
`and the project suite is not reported as missing a floor`, goes red with
actual 1, and the run prints the NEW missing-floor wording naming both files.

### Timing

All timings local (Windows 11, Git Bash), none from CI. `selftest.test.sh` ran
in 14.5 s (`real 0m14.524s`, via `bash scripts/selftest.sh selftest`); `refresh.test.sh` took 3m08s wall (`real 3m8.107s`), which is
the existing suite's cost on this machine - the new block adds two refreshes to
the dozens already there. Neither suite carries a per-test timeout.

### `bash scripts/gates.sh --fast`

Exit 0, and it judged nothing: this repository's `project.conf` is
`BOOTSTRAPPED=no`, so `format`, `lint`, `typecheck`, `unit` and `coverage` are
all `UNCONFIGURED` (`All required gates passed (0 ran, 5 unconfigured, 0
known)`). The story's Context says the `unit` gate runs `bash
scripts/selftest.sh`; in this tree it does not - what actually judges these
suites is CI's `bash scripts/selftest.sh` step (and `ci-local.sh`). Through that
runner the suite is admissible: `bash scripts/selftest.sh selftest` reads the
summary line and reports `selftest: 71 passed, 24 failed`, floor met (71 vs 54),
failing only on the red assertions. `check-sigpipe.sh` (41 files, 0 findings)
and `check-grep-count.sh` (41 files, 0 findings) are clean over the new code.

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

    run:    2026-10-01T22:03:41Z
    commit: 065f55c (working tree had uncommitted changes)
    tree:   b4238b4742719c0698db66e2d236c855448403dc
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


### Orchestrator's reproduction of RED's Contract amendment 1 (2026-10-01)

RED claimed that a fault queued with an empty suite name is silently dropped.
Reproduced on different inputs, with none of RED's fixtures: a throwaway tree
containing only a copy of the shipped `scripts/selftest.sh`, one suite `alpha`
printing `alpha: 3 passed, 0 failed`, and a `floors.conf` of
`floor | alpha | 3` plus the line `garbage line with no pipes`:

```
=== alpha ===
alpha: 3 passed, 0 failed

assertion floors: all 1 suite(s) met their declared floor (3 assertions executed, 3 declared).
1 harness suite(s) passed.
exit=0
```

The mechanism, alone:
`printf '\tthe message\n' | while IFS=$'\t' read -r a b; ...` gives
`fname=[the message] fmsg=[]`. Tab is IFS whitespace, so a leading tab is
stripped and the message lands in the name field. Accepted: AC-3(a) (a malformed
`project-floors.conf` line fails the run) cannot pass without fixing the report
loop, so the fix is inside this story.

**DONE, 2026-10-01.** Merged in #94 (merge commit 389af40), release 63. The
VERSION bump lands in this DONE commit. `phase.sh set DONE --force` was run on
`main`, overriding the branch check. PR CI: the `gates` job passed in 1m48s,
and its harness self-test step took 95s, with no `timeout-minutes` set
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/36939450906).
`boundaries` passed in 5s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/36939450919).
Next: refresh fantasy-world-builder to this release, and declare its five
project floors in its own `project-floors.conf`. No epic.
