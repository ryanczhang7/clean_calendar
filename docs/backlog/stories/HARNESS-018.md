---
id: HARNESS-018
title: Closing a story names what to run next, and what can run alongside it
slug: closing-a-story-names-what-to-run-next-a
epic: 
type: chore
status: done
phase: DONE
branch: story/HARNESS-018-closing-a-story-names-what-to-run-next-a
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [scripts/plan.sh, scripts/phase.sh, .claude/tests/plan.test.sh, .claude/tests/phase.test.sh, .claude/commands/advance-story.md, .claude/commands/complete-story.md, .claude/agents/lead-po.md, CLAUDE.md]         # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

<!-- Why this story exists. Link the epic and any wiki pages that constrain it.
     Name the REQUIRED gate that would fail if this story's artifact broke. If
     only an optional gate can, put it in required_gates above before RED:
     every required gate once passed over a story none of them exercised. -->

Asked for by the user on 2026-10-01: every time a story is finished, the agent
should say which story or stories to run next, whether to run each with
`/advance-story` or `/complete-story`, whether more than one can start, and how
to run several at once.

None of that is mechanical today. `/advance-story` says only "report what the
next story is" (REVIEW → DONE), and `/complete-story` says "the next story you
recommend". The pieces exist, but nothing puts them together:

- `plan.sh next <id>` answers advance vs complete for **one** story, but only
  when you already know which story to ask about;
- `plan.sh waves` and `plan.sh conflicts --pairs` answer which stories may run
  together, but say nothing about which command each should run with, or how to
  set up the worktrees;
- the `/audit-mutations` recommendation when an epic closes lives only in
  prose in `advance-story.md`.

So each closing report is reconstructed by hand, from memory of five commands,
and it comes out different every time. This story adds one command that
produces the whole answer, and makes `phase.sh set <id> DONE` print it.

Required gate that would fail if this story's artifact broke: `unit`
(`bash scripts/selftest.sh`, which runs `plan.test.sh` and `phase.test.sh`).

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC.
     An AC that names a statistic, a metric or a threshold names a NEGATIVE
     CONTROL too: the deliberately broken input the metric must reject, and
     roughly what it should score. A criterion can be perfectly testable and
     still be blind to the defect it exists to catch, and that is more
     dangerous than a vague one - it survives review and goes green. -->


- **AC-1** — Given a backlog with at least one startable PLANNED story, when
  `bash scripts/plan.sh after <closed-id>` runs, then it prints a `Next:` line
  naming the first startable PLANNED story in backlog order, with the command
  `plan.sh next` recommends for it (`/complete-story <id>` or
  `/advance-story <id>`) and that command's reason. A blocked story is never
  the one named.
- **AC-2** — Given other startable PLANNED stories that declare no path shared
  with the `Next:` story, with each other, or with any story in flight, when
  `plan.sh after` runs, then it lists each under `Alongside:` with its own
  recommended command, and prints one `git worktree add` line per listed story
  using that story's frontmatter `branch:`, with the instruction to run each
  command from inside its worktree. *Control:* a story that shares a path with
  the `Next:` story, or with another listed story, is **not** listed, and the
  output names the path it shares. A story that declares no paths is not
  listed, and is named as one that cannot be judged.
- **AC-3** — Given no story that can start alongside the `Next:` story, when
  `plan.sh after` runs, then `Alongside:` says to run one story at a time, and
  the output still names why each other startable story was left out.
- **AC-4** — Given stories that are in flight (any phase other than PLANNED and
  DONE) or blocked by a `depends_on` that is not DONE, when `plan.sh after`
  runs, then each in-flight story is named under `In flight:` with its phase and
  `/advance-story <id>`, and each blocked story is named under `Blocked:` with
  every dependency that is not DONE.
- **AC-5** — Given no startable story, when `plan.sh after <id>` runs, then
  `Next:` says no new story is startable and names `/plan-story`. Given a
  closed story whose `epic:` is non-empty and every story in that epic is DONE,
  the output recommends `/audit-mutations <epic>`. *Control:* with an empty
  `epic:`, or with another story in that epic not DONE, it does not.
- **AC-6** — Given any story, when `bash scripts/phase.sh set <id> DONE`
  succeeds, then its output ends with the report `plan.sh after <id>` prints.
  *Control:* `phase.sh set <id>` to any other phase does not print it. And
  `/advance-story` (REVIEW → DONE), `/complete-story` (the final report) and the
  `lead-po` agent each tell the orchestrator to relay that report, by naming
  `bash scripts/plan.sh after`.

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

**Writes:** `scripts/plan.sh`, `scripts/phase.sh`, `.claude/tests/plan.test.sh`,
`.claude/tests/phase.test.sh`, `.claude/commands/advance-story.md`,
`.claude/commands/complete-story.md`, `.claude/agents/lead-po.md`, `CLAUDE.md`

### `plan.sh after [<closed-id>]`

A new subcommand in `scripts/plan.sh`, dispatched from the `case` at the bottom
of the file. `<closed-id>` is optional. When it is given and names an existing
story, the report adds the header and the epic check; without it, the report
still prints, minus both. **Always exits 0**: an empty backlog is an answer,
not an error. It writes to stdout only, so `p="$(plan.sh after X)"` captures
all of it.

It **reuses**, and does not reimplement: `story_walk` (candidates and blocked
stories), `cmd_next` (the command and reason for each story), `unmet_deps` (the
blocked detail), and `story_paths` and `shared_paths` (the collision test). If
two of these disagree with `waves` or `conflicts` about what is clear, that is
a defect.

The help text at the top of the file gains a line for `after`, and the `-h`
branch's `sed -n '3,7p'` range grows with it, so `plan.sh --help` lists `after`.

**Labels.** Each block starts with a label padded to 11 columns
(`printf '%-11s'`), and continuation lines are indented 11 spaces. Tests anchor
on the label at the start of a line.

```
After HARNESS-003:                              <- only when <closed-id> exists

Next:      /complete-story HARNESS-018
           <cmd_next's reason, verbatim>

Alongside: can start now, in parallel with HARNESS-018 - no two of these, and no story in flight, declare a shared path:
             /advance-story HARNESS-019
           To run them together, give each its own worktree (one worktree, one story):
             git worktree add ../<repo>-HARNESS-019 -b story/HARNESS-019-<slug>
           then run its command from inside that worktree.
           HARNESS-020 shares scripts/plan.sh with HARNESS-018
           HARNESS-021 declares no paths, so it cannot be judged - UNKNOWN is not clear

In flight: HARNESS-017 (REVIEW)  /advance-story HARNESS-017

Blocked:   HARNESS-022  depends_on HARNESS-018 (PLANNED)

Epic:      E1 has no open story left - /audit-mutations E1 is recommended; nothing runs it automatically.
```

**What each block means:**

- **Candidates.** `story_walk` yields the non-DONE stories in the glob order of
  their files, which is backlog order. A candidate in phase PLANNED is
  *startable*; a candidate in any other phase is *in flight*. A story that
  `story_walk` calls `blocked` goes under `Blocked:`, whatever its phase.
- **`Next:`** names the first startable story, as `/<cmd> <id>` from
  `cmd_next`'s first field, with the second field verbatim on the next line.
  With no startable story it prints `Next:      no new story is startable.`,
  and then, when nothing is in flight either,
  `           Add work with /plan-story.`
- **`Alongside:`** appears only when `Next:` names a story. The members start as
  the `Next:` story plus every in-flight story. Each remaining startable story,
  in backlog order, is checked against **every** member:
  - if it declares no paths, it gets the UNKNOWN reason line;
  - if it shares a path with a member, it gets the reason line
    `<ID> shares <paths> with <MEMBER>`, naming the first member it collides
    with;
  - otherwise it joins the members and is listed.

  This is greedy first fit, the same as `waves`, and like `waves` it does not
  claim to find the largest set.
  - If the `Next:` story or any in-flight story declares no paths, nothing can
    be judged against it. `Alongside:` then reads
    `nothing - <ID> declares no paths, so nothing can be judged against it.`
    and no other startable story is listed.
  - When nothing joins: `Alongside: nothing - run one story at a time.`,
    followed by the reason lines.
  - When at least one joins: the block shown above. The worktree directory is
    `../<basename of the repo root>-<ID>`, and the branch is the story's
    frontmatter `branch:` verbatim.
- **`In flight:`** prints one line per in-flight story:
  `<ID> (<PHASE>)  /advance-story <ID>`.
- **`Blocked:`** prints one line per blocked story, listing each unmet
  dependency the way `waves` does: `<dep> (<PHASE>)`, comma-separated, with
  `missing` for a dependency that has no story file.
- **`Epic:`** prints only when `<closed-id>` is given, its `epic:` is non-empty,
  and every story file whose `epic:` equals it is DONE.
- A block with nothing to say is left out entirely, except `Next:`, which always
  prints. Blocks are separated by one blank line.

**Sharpened in RED (2026-10-01), in place.** Each point below is something the
example above implies but does not say. The tests pin it, so GREEN has to know
it as fact:

- **Block order** is fixed: header (then one blank line), `Next:`,
  `Alongside:`, `In flight:`, `Blocked:`, `Epic:`. The report has no trailing
  blank line; `$(...)` captures it exactly.
- **Header** is `After <closed-id>:` and prints only when `<closed-id>` names a
  story file. An id that names none gives the report with no header and no
  epic check, and still exits 0. (Reason: the tests compare the no-id and
  unknown-id reports byte for byte against the same body.)
- **Multi-line blocks.** In `In flight:` and `Blocked:`, the first entry follows
  the label and each further entry is on its own line indented 11 spaces, in
  backlog order: `           U (REVIEW)  /advance-story U`.
- **Inside `Alongside:` when stories join**, the order is: the header line;
  one `             /<cmd> <ID>` line per listed story (13 spaces, in the order
  they joined, which is backlog order); the `To run them together…` line; one
  `             git worktree add ../<repo>-<ID> -b <branch>` line per listed
  story, same order; `           then run its command from inside that
  worktree.`; then the reason lines.
- **Reason lines** are indented 11 spaces and come in backlog order of the
  story they are about, after everything else in the block. With nothing
  joined they follow `Alongside: nothing - run one story at a time.` directly.
  A lone startable story with no other candidate gets that line and nothing
  after it.
- **`<paths>` in a shares line** is the shared paths joined by single spaces,
  with **no trailing space** - `H shares src/d.ts src/d2.ts with D`.
  `shared_paths` leaves one trailing space on its output, so GREEN trims it.
  (Reason: the tests match whole lines with `grep -cxF`; a trailing space
  would make every shares line a different string.)
- **Member order for "the first member it collides with"** is the `Next:`
  story, then the in-flight stories in backlog order, then the joined stories
  in the order they joined. The same order chooses the `<ID>` in
  `nothing - <ID> declares no paths, so nothing can be judged against it.`
  The tests do not pin whether reason lines follow that line; that is GREEN's
  choice.
- **Neither DONE nor blocked stories are members.** A path held only by a DONE
  or a blocked story does not stop a candidate joining.
- **`Add work with /plan-story.`** prints when nothing is startable and nothing
  is in flight. A blocked story does not count as in flight.
- **Epic equality is whole-string**: a story in `E10` does not hold `E1` open.
  `epic:` with an empty value counts as empty.

### `phase.sh set <id> DONE`

After its existing output (`<id> -> DONE`, then `writes allowed: …`),
`cmd_set` prints one blank line and then the output of
`bash "$ROOT/scripts/plan.sh" after "$id"`, but **only** when the target phase
is DONE. By then the phase is already written, so a failure in `plan.sh` must
not fail the phase change: its exit status is ignored, and its stderr goes to
stderr.

### The prose sites

The first three must each contain the literal string
`bash scripts/plan.sh after`, because that is what AC-6's test reads.

- `.claude/commands/advance-story.md`, REVIEW → DONE: `phase.sh set … DONE`
  prints the report, and the orchestrator relays it to the user **as printed**,
  including any `Alongside:` set and its worktree commands. This replaces
  "report what the next story is". The existing `/audit-mutations` prose stays,
  now pointing at the `Epic:` line, and keeps "Recommend it; never run it".
- `.claude/commands/complete-story.md`: in the final report, "the next story you
  recommend" becomes the output of `bash scripts/plan.sh after $1`, relayed as
  printed. The story is at REVIEW by then, so it appears under `In flight:`.
- `.claude/agents/lead-po.md`: one sentence wherever it describes closing a
  story or reporting at the end of a run.
- `CLAUDE.md`: one line in "Running things" and one in the loop block. This one
  is untested; it is the index.

### Callers of changed signatures

None: no existing function's signature changes. `cmd_set`'s output grows only
for DONE, and no test pins `phase.sh set` output with `assert_eq` or a count.
`grep -rn 'phase.sh set\|phase set' .claude/tests/*.sh | grep 'assert_eq\|count'`
returns nothing (checked 2026-10-01).

### Oracle partition

Everything is mechanical, pinned by the labels and strings above. There is no
threshold and no metric.

### Test-only dependencies

None. The suites are bash. They use the existing `story_with` helper in
`plan.test.sh` and the `phase`/`story` helpers in `phase.test.sh`, and run in
`make_project_fixture`.

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

- **Defect put back: the collision check.** With the shared-path test inside
  the Alongside loop of `plan.sh after` made never to fire, AC-2's control (a
  conflicting story is not listed) MUST fail, and only assertions about
  collisions should fail. RED cannot run this, because `after` does not exist
  yet. **Owner: GATES.** Run it with `scripts/mutate.sh` against
  `bash .claude/tests/plan.test.sh`.

  **Result (GATES, 2026-10-01, orchestrator):** run as planned. All 11 failures
  are collision assertions, matching RED's prediction exactly; the UNKNOWN control
  and the DONE/blocked membership checks stayed green, as predicted. Restored.

  ```
  === mutate: scripts/plan.sh (1 line(s) changed by s#if \[ -n "\${s// /}" \]; then hit=#if false; then hit=#) ===
    730 -             if [ -n "${s// /}" ]; then hit="${m_ids[$k]}"; break; fi
    730 +             if false; then hit="${m_ids[$k]}"; break; fi
  === mutate: running bash .claude/tests/plan.test.sh ===
      FAIL AC-1..AC-4: after A prints exactly the Contract's report for this backlog
      FAIL AC-2: and one worktree line per listed story, no more
      FAIL AC-2 control: a story sharing a path with Next is not listed, and the shared path is named
      FAIL AC-2 control: a story sharing a path with another LISTED story is not listed, and the path and story are named
      FAIL AC-2 control: a story sharing paths with an in-flight story is not listed, and every shared path is named
      FAIL AC-2 control: no worktree line for any story left out, while the listed ones have theirs
      FAIL after with no id prints the same report without the header, exit 0
      FAIL after with an id that names no story prints the report without a header, exit 0
      FAIL AC-3: with nothing able to join, Alongside says run one at a time and still names why each was left out
      FAIL AC-3 control: no worktree instructions when nothing joins, while the one-at-a-time line is there
      FAIL AC-3 control: neither O nor P is listed
  plan: 201 passed, 11 failed
  === mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_plan.sh.20261001T163153Z.2220454.bak) ===
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

- **2026-10-01, Lead PO (orchestrator).** Removed two template placeholder
  lines, `- **AC-1** — Given <state>, when <action>, then <observable outcome>.`
  and the same for AC-2, which the PLANNED assembly step had left above the six
  real criteria. They gave the section duplicate AC ids and made `plan.sh next`
  count 8 criteria. No real criterion's text changed and no test reads them. The
  test-developer flagged it in RED, and the orchestrator confirmed against the
  file (the lines sat at 56-57, directly under the template comment). The story
  is not on `main`, so `check-boundaries.sh` has no base version to compare.

## Model guidance

Planned by `bash scripts/plan.sh write HARNESS-018` from `.claude/harness/models.conf`.
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

- RED: `test-developer` resolved to `opus` (`claude-opus-5-5`, from the agent definition; no override). Verdict: 55 assertions, every new one red for the right reason (orchestrator re-ran: phase 40/5, plan 168/44); it flagged the orchestrator's own placeholder-AC error.
- GREEN: `feature-developer` resolved to `opus` (`claude-opus-5-5`, agent definition; no override). Verdict: every test passed with no test file touched (orchestrator confirmed `git diff HEAD -- .claude/tests` empty); every negative control matched RED's expected value.

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Out of scope

<!-- Explicit non-goals. Prevents the Feature Developer from over-building. -->

- Creating worktrees, or dispatching into them. The report prints the commands,
  and the user or the lead-po runs them. "Never create a worktree to make work
  parallel on your own initiative" still stands.
- Choosing the largest parallel set. This is greedy first fit, like `waves`.
- Changing the thresholds in `plan.sh next`, or what `waves` and `conflicts`
  print.
- A machine-readable mode. `conflicts --pairs` is already what the orchestrator
  parses; this is a report for a person.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

<!-- Filled by the Test Developer during RED: which tests, at which level,
     and which AC each one covers. -->

Everything is mechanical (Contract, "Oracle partition"), so every test pins an
exact string. Level: integration over the real script in `make_project_fixture`,
the level both suites already use. No metric and no threshold.

**`.claude/tests/plan.test.sh`**: new last block, `describe "after: …
(HARNESS-018)"`, 45 assertions. It uses `fresh` like the blocks above it, so it
cannot affect them. `story_with` gains one optional line, `EPIC:<name>`, which
writes `epic: <name>`. No existing fixture contains `EPIC:`, so no earlier
fixture changes.

| Fixture | Stories | Pins |
|---|---|---|
| 1 | A DONE/E1 (closed); B blocked on C + missing Z; C next/E1; D RED; E deferred (advance) shares only with DONE A; F shares with C; G shares with E (listed); H shares two paths with D (in flight); I no paths; J paths via `**Writes:**` only, shares only with blocked B | AC-1, AC-2 and both of its controls, AC-4, the AC-5 "another story not DONE" control, the whole report byte for byte, no-id and unknown-id reports |
| 2 | N; O shares with N; P no paths | AC-3 with reason lines |
| 3 | N alone | AC-3 lone story |
| 4 | R RED no paths; S next; T disjoint; U REVIEW | in-flight member with no paths; two In flight lines; in-flight never Next |
| 5 | S next with no paths; T | Next member with no paths |
| 6 | X1, X2 DONE/E1; V blocked, epic E10 | AC-5: nothing startable plus /plan-story, Epic line, E10 is not E1, blocked never Next, no Epic line without an id |
| 6+W | plus W GREEN/E1 | AC-5 control: epic not closed; no /plan-story while in flight |
| 7 | Q1, Q2 DONE, empty epic | AC-5 control: empty epic |
| 8 | empty backlog | Next with /plan-story, exit 0 |
| — | `--help` | lists `after` |

**`.claude/tests/phase.test.sh`**: new last block, 10 assertions, AC-6.
`phase.sh set K-1 DONE` must end with a blank line and then exactly what
`plan.sh after K-1` prints, and that report must name
`Next:      /complete-story K-2`, so an empty report cannot pass the suffix check.
The control is `set K-2` to each of RED, GREEN, GATES, REVIEW and PLANNED. The
prose checks read the three docs from `$REPO_ROOT`, the real tree.

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

RED was dispatched on `opus` (claude-opus-5-5), with no override.

**Commands**

    bash .claude/tests/plan.test.sh     # about 10 min locally on Windows; it was already the long suite
    bash .claude/tests/phase.test.sh    # about 80 s locally

Both timings are from a local Windows run. Neither suite carries a timeout, and
`selftest.sh` sets none.

**Result in RED**

    plan: 168 passed, 44 failed     (167 before + 45 new; 1 new passes, see below)
    phase: 40 passed, 5 failed      (33 before + 10 new; 7 new pass, see below)

No assertion that existed before this story fails.

**Why this is the right failure.** `after` is not a subcommand yet, so
`plan.sh after A` falls through to the `*)` arm, `cmd_both "after"`. That
prints a "Story after" report for a story named `after`, and stderr gets
`plan: no story at docs/backlog/stories/after.md`. Verbatim from the run:

    FAIL after exits 0 and writes nothing to stderr on an ordinary run
         expected: 0||1
         actual:   0|plan: no story at docs/backlog/stories/after.md
         plan: no story at docs/backlog/stories/after.md|0
    FAIL AC-1..AC-4: after A prints exactly the Contract's report for this backlog
         expected: After A:
         ...
         actual:   Story after

           Recommended:  /complete-story after
           Because:      after is an ordinary cycle: a contract to work from, 0 criteria, ...
    FAIL AC-2 control: a story sharing a path with Next is not listed, and the shared path is named
         expected: 0|0|1
         actual:   0|0|0
    FAIL plan.sh --help lists the after subcommand
         expected: 1
         actual:   0

    FAIL AC-6: phase.sh set K-1 DONE ends with a blank line and then exactly what plan.sh after K-1 prints, and that report names Next
         expected: ends|1
         actual:   does-not-end|0
    FAIL AC-6: .claude/commands/advance-story.md names bash scripts/plan.sh after
         expected: names
         actual:   silent
    (the same for complete-story.md and lead-po.md)

Every "is not listed" control fails in RED on its presence half, the reason
line (`0|0|0` against `0|0|1`). That is deliberate: none of them can pass on an
empty report.

`bash scripts/gates.sh --fast`: `All required gates passed (0 ran, 5
unconfigured, 0 known)`, rc 0. This repository has `BOOTSTRAPPED=no`, so the
gates are unconfigured, and `selftest.sh` (the `unit` gate the Context names)
is where these suites are judged. The new tests contain no lint-shaped and no
timeout-shaped failure.

**Files touched**

- `.claude/tests/plan.test.sh`: `story_with` gains `EPIC:`, and the `after`
  block is added before `summary`.
- `.claude/tests/phase.test.sh`: the AC-6 block is added before `summary`.
- `docs/backlog/stories/HARNESS-018.md`: `## Contract` is sharpened in place
  (see "Sharpened in RED"), and `## Test plan` and this section are filled.

**What the tests pin, stated as fact.** These are not suggestions. Each one is
an exact-string assertion, and a wrong guess fails it.

- The `plan.sh after [<id>]` dispatch. Stdout carries the report and stderr is
  empty on an ordinary run. Exit status is 0 in every fixture, including an
  empty backlog and an unknown id.
- Every label and indent in the Contract: 11-column labels, 11-space
  continuations, 13-space listing and worktree lines. The exact sentences are
  `Alongside: can start now, in parallel with <ID> - no two of these, and no
  story in flight, declare a shared path:`, `To run them together, give each
  its own worktree (one worktree, one story):`, `then run its command from
  inside that worktree.`, `<ID> shares <p1 p2> with <M>`, `<ID> declares no
  paths, so it cannot be judged - UNKNOWN is not clear`, `nothing - run one
  story at a time.`, `nothing - <ID> declares no paths, so nothing can be
  judged against it.`, `no new story is startable.`, `Add work with
  /plan-story.`, `<ID> (<PHASE>)  /advance-story <ID>`, `<ID>  depends_on <d>
  (<PH>), <d> (missing)` and `<E> has no open story left - /audit-mutations <E>
  is recommended; nothing runs it automatically.`
- The worktree dir is `../$(basename "$ROOT")-<ID>`. The test computes it as
  `basename "$(cd "$FIX" && pwd)"`, which is the same `pwd` that `plan.sh`'s
  ROOT line uses.
- The `Next:` reason is verbatim `plan.sh next <id> | cut -f2-`.
- Help: a line matching `^  bash scripts/plan\.sh after( |$)` appears in
  `plan.sh --help`, after the `# ` strip. So the help line is
  `#   bash scripts/plan.sh after [<id>]   …`, and the `sed -n` range must
  include it.
- `phase.sh set <id> DONE`: stdout is `<id> -> DONE`, then `writes allowed: …`,
  then one blank line, then exactly the `plan.sh after <id>` stdout. Nothing
  may follow it.
- The three docs contain `bash scripts/plan.sh after`. CLAUDE.md is not tested.

**Not constrained, so GREEN chooses.** The internal structure of `cmd_after`.
Whether reason lines follow a `nothing - <ID> declares no paths…` line. The
stderr content for an unknown id (the exit status and stdout are pinned; stderr
is not). The wording of the help line beyond its prefix. Where in each prose
doc the sentence goes.

**Passing on arrival, and how each is earned**

| Test | Why it passes in RED | Earned by |
|---|---|---|
| plan: `AC-1 fixture: the reason expected for C is what plan.sh next says` | It pins the *fixture* against the existing `next`, not `after` | Nothing needed. It is a precondition, and if it ever fails the fixture is wrong, not `after` |
| phase: `the phase change itself is reported first, on the first line` | Existing behaviour | A regression guard so the report never lands *before* `-> DONE`. It is not probed, and the ordering assertion (`After` and `Next` after `-> DONE`, which fails in RED) carries the new claim |
| phase: `and the phase change happened` | Existing behaviour | Same: it guards that printing the report does not break the write. Not probed |
| phase: `AC-6 control: phase.sh set K-2 {RED,GREEN,GATES,REVIEW,PLANNED} prints no after report` (5) | Nothing prints a report yet | **Probe**, below: with a `Next:` line injected into every `set`, all five go red and nothing else changes |

Probe for the five controls. It went through `scripts/mutate.sh`, and the file
was restored and verified:

    $ bash scripts/mutate.sh scripts/phase.sh 's/^  printf .%s -> %s.n. "\$id" "\$phase"$/&; printf "Next:      probe\\n"/' -- bash .claude/tests/phase.test.sh
    FAIL AC-6 control: phase.sh set K-2 GREEN prints no after report
         expected: 1|0|0
         actual:   1|1|0
    FAIL AC-6 control: phase.sh set K-2 GATES prints no after report
         expected: 1|0|0
         actual:   1|1|0
    FAIL AC-6 control: phase.sh set K-2 REVIEW prints no after report
         expected: 1|0|0
         actual:   1|1|0
    FAIL AC-6 control: phase.sh set K-2 PLANNED prints no after report
         expected: 1|0|0
         actual:   1|1|0
    (and RED, scrolled off: 35 passed, 10 failed = the 5 RED failures + these 5)
    phase: 35 passed, 10 failed
    === mutate: command exited 1; restored (verified byte-for-byte against .../scripts_phase.sh.20261001T150951Z.2007792.bak) ===

(An earlier attempt with `\&` in the replacement broke the script's syntax: 32
failed, restored and verified. It discriminates nothing and is not counted.)

**Negative controls: expected values.** They are counts, not thresholds. In RED
`after` does not exist, so every control that shares an assertion with a
presence fails on the presence half. The expected values below are claims until
GREEN runs them against the shipped `cmd_after`.

| Control | Assertion shape | Expected in GREEN | Measured in RED |
|---|---|---|---|
| F shares with Next (C) | listing(complete)\|listing(advance)\|reason | `0\|0\|1` | `0\|0\|0` |
| G shares with listed E | same | `0\|0\|1` | `0\|0\|0` |
| H shares 2 paths with in-flight D | same | `0\|0\|1` | `0\|0\|0` |
| I declares nothing | same | `0\|0\|1` | `0\|0\|0` |
| no worktree for F/G/H/I | F\|G\|H\|I\|total | `0\|0\|0\|0\|2` | `0\|0\|0\|0\|0` |
| blocked B never Next | B complete\|B advance\|C next | `0\|0\|1` | `0\|0\|0` |
| closing A, C in E1 open | Epic\|audit-mutations\|Next C | `0\|0\|1` | `0\|0\|0` |
| W (GREEN) holds E1 open | Epic\|audit\|In flight W | `0\|0\|1` | `0\|0\|0` |
| empty epic | whole report equality, no Epic line | exact | `Story after…` |
| member R/S with no paths | nothing-line\|listings\|worktrees | `1\|0\|0` / `1\|1\|0` | `0\|0\|0` / `0\|0\|0` |
| phase.sh non-DONE | `-> PH`\|Next\|After | `1\|0\|0` | `1\|0\|0`; probed to `1\|1\|0` |

**Prediction for the GATES deferred verification** (the collision check made
never to fire, for example the `shared_paths` test inside the Alongside loop
replaced by an empty string). Then F, G, H and O join as members. These
assertions in `plan.test.sh` should fail:

- `AC-1..AC-4: after A prints exactly the Contract's report…`
- `after with no id prints the same report…` and `…an id that names no story…`
  (the same body)
- `AC-2: and one worktree line per listed story, no more` (2 becomes 5)
- `AC-2 control: a story sharing a path with Next…` (F), `…with another LISTED
  story…` (G), `…with an in-flight story…` (H)
- `AC-2 control: no worktree line for any story left out…`
- `AC-3: with nothing able to join…`, and `AC-3 control: no worktree
  instructions…` and `AC-3 control: neither O nor P is listed`

These should stay green: the I (UNKNOWN) control, every AC-4, AC-5 and AC-1
line assertion, both member-with-no-paths cases, the lone-story case, `DONE is
not a member` and `blocked is not a member`. Those two read `shares src/a.ts` /
`shares src/j.ts` = 0, which a dead collision check also satisfies. They pin
the *membership* rule, not the collision.

**Found along the way, for the orchestrator.** `## Acceptance criteria` still
carries the template's two placeholder lines (`- **AC-1** — Given <state>…`
and `- **AC-2** — …`) above the real six. That makes `cmd_next` count 8 ACs for
this story, and it puts two duplicate AC ids in the frozen section. RED has not
touched it, because criteria are frozen. It needs an `## Amendments` decision
if it is to be removed.

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

    run:    2026-10-01T16:38:59Z
    commit: 5374576 (working tree had uncommitted changes)
    tree:   52a97a6f95ebfd266242ace7e21b0c3f8c0ff05b
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


**DONE, 2026-10-01.** Merged in #92 (merge commit d528340), release 61. The
VERSION bump lands in this DONE commit, as for HARNESS-003 and HARNESS-009,
because the PR changed harness scripts without one. `phase.sh set DONE --force`
was run on `main`, overriding the branch check, as for every post-merge close.
That run printed the new report, the first close to do so. PR CI: the `gates`
job passed in 1m25s, and its harness self-test step took 72s (the same as #91),
with no `timeout-minutes` set
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/36900141844).
`boundaries` passed in 5s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/36900142083).
No epic, so no `/audit-mutations` recommendation.
