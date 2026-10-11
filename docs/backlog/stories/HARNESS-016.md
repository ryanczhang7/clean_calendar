---
id: HARNESS-016
title: Drift reads the paths a Contract writes, not every path it mentions
slug: drift-reads-the-paths-a-contract-writes
epic: 
type: chore
status: done
phase: DONE
branch: story/HARNESS-016-drift-reads-the-paths-a-contract-writes
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [scripts/plan.sh, .claude/tests/plan.test.sh, scripts/new-story.sh, .claude/tests/new-story.test.sh, .claude/skills/story-authoring/SKILL.md, CLAUDE.md]  # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

<!-- Why this story exists. Link the epic and any wiki pages that constrain it.
     Name the REQUIRED gate that would fail if this story's artifact broke. If
     only an optional gate can, put it in required_gates above before RED:
     every required gate once passed over a story none of them exercised. -->

No epic. The harness maintaining itself. Follows HARNESS-006 (release 56).

**HARNESS-006 shipped a warning that is wrong every time it fires on this
repository.** `plan.sh conflicts` prints a `DRIFT` line when a story's
`## Contract` names a path its `touches:` does not cover. Its GATES probe against
the real backlog printed 15 DRIFT lines, and 0 of them were real. After
`touches:` was filled for HARNESS-001..005 the count was 9, all on HARNESS-007
and HARNESS-009, and again 0 were real:

    DRIFT     HARNESS-007   contract names phase.sh, touches: does not
    DRIFT     HARNESS-007   contract names rules.md, touches: does not
    DRIFT     HARNESS-009   contract names check-boundaries.sh, touches: does not
    DRIFT     HARNESS-009   contract names lead-po.md, touches: does not
    ...

**The drift rule is right; what it reads is not.** `contract_paths` extracts
every token in the Contract prose that looks like a path. That includes:
- files the story only reads, such as a helper it calls or a script it cites;
- bare basenames of files `touches:` already lists in full (`plan.sh` next to
  `scripts/plan.sh`);
- directory prefixes (`.claude/skills/stack-profiles/reference/`);
- tokens that are not paths at all (`AC-1..AC`).

That precision was tolerable for `conflicts`' old fallback, where a false
CONFLICT is loud and gets read. It is not tolerable for a warning: a signal that
is false 15 times out of 15 teaches the reader to skip it, and HARNESS-007 is
about to build the planner on it.

**Why this is its own story and not a fix inside HARNESS-006.** `contract_paths`
has a second reader: `contract_unenforced`, which decides whether RED runs on
the weaker model. HARNESS-006's Contract froze it for that reason. Changing what
it returns changes the model plan, and that has to be decided rather than
happen as a side effect.

**Required gate.** `BOOTSTRAPPED=no`, so every `gates.sh` gate is unconfigured
here. The binding check is `bash scripts/selftest.sh`, specifically the `plan`
suite, which is a required CI step (`gates` job).

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC.
     An AC that names a statistic, a metric or a threshold names a NEGATIVE
     CONTROL too: the deliberately broken input the metric must reject, and
     roughly what it should score. A criterion can be perfectly testable and
     still be blind to the defect it exists to catch, and that is more
     dangerous than a vague one - it survives review and goes green. -->

- **AC-1** — Given a story whose `touches:` lists every file its Contract says it
  WRITES, and whose Contract prose also mentions files it only reads (a helper
  it calls, a script it cites, the bare basename of a file `touches:` lists in
  full), when `bash scripts/plan.sh conflicts` runs, then no DRIFT line is
  printed for that story. *Control:* the same story with one written file
  removed from `touches:` still gets exactly one DRIFT line, naming that file.
- **AC-2** — Given a Contract containing tokens that are not repository paths
  (`AC-1..AC`, `e.g.`, a version like `1.2`) and a directory prefix ending in
  `/`, when `conflicts` runs, then none of them appears on a DRIFT line or as a
  shared path on a CONFLICT row. *Control:* a real path in the same Contract
  that the story writes and `touches:` omits is still reported.
- **AC-3** — Given every story in this repository's backlog at the commit this
  story starts from, when `bash scripts/plan.sh models <id>` runs before and
  after the change, then the RED row is the same for every story, unless
  `## Amendments` records a deliberate change to the RED model policy with the
  stories it moves.
- **AC-4** — Given a story with no `touches:` and a written Contract, when
  `conflicts` runs, then the pair is still judged on the Contract's paths, so
  the fallback HARNESS-006 kept does not regress. *Control:* the existing
  `plan.test.sh` conflict and UNKNOWN assertions stay green unchanged.

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

RED may amend any block below in place, with a one-line reason beside the
change; GREEN builds what the amended block says. `.claude/tests/*` and
`scripts/*` both classify as `harness`, so the phase lock freezes none of this
story's files in any phase: this Contract is the only enforcement there is. RED
writes only `.claude/tests/*`; GREEN writes no test file.

**Writes:** `scripts/plan.sh`, `.claude/tests/plan.test.sh`, `scripts/new-story.sh`, `.claude/tests/new-story.test.sh`, `.claude/skills/story-authoring/SKILL.md`, `CLAUDE.md`

**PO decision 1 — the mechanism is an explicit declaration.** A Contract says
what it writes on a line that starts, at column 0, with `**Writes:**`; the
paths are the backticked tokens on that line. More than one such line is
allowed and they union. The stricter-extractor option was measured against
AC-1 and rejected: HARNESS-009's Contract says "No change to `phase.sh`,
`gates.sh` or `check-boundaries.sh`", and no extractor reading prose can tell a
path the story promises not to touch from one it writes — spelled in full, the
negation would drift under any extractor. Only the author knows which files
are written, so the author says. The cost the Notes named, a third place a
story names its files, is accepted: `touches:` is the planner's guess at cut
time, `**Writes:**` is the Contract's commitment, and DRIFT is exactly the
disagreement between the two.

**`scripts/plan.sh`**, in order of the helpers:

- `contract_writes <file>` — **new.** The paths on `**Writes:**` lines of the
  story's `## Contract`, after `strip_comments`, one per line, `sort -u`. Empty
  when there is no such line. A `**Writes:**` inside an HTML comment is not
  read (the template's own example lives in one; see `new-story.sh` below).
- `contract_paths <file>` — **same signature, narrower output.** When
  `contract_writes` is non-empty it returns exactly that. Otherwise it returns
  the prose extraction it returns today, minus tokens that are not paths. A
  token is dropped when it:
  1. contains `..` (`AC-1..AC`);
  2. ends in `/` (`.claude/skills/stack-profiles/reference/`);
  3. ends in a dot followed only by digits (`1.2`, `4.9`);
  4. contains no `/` and has a one-character stem before its first dot
     (`e.g`, `i.bak`, `0.139s`).
  Every other token is kept, including bare basenames such as `plan.sh` —
  the fallback exists for stories that declare nothing better, and dropping
  real basenames there would turn CONFLICT into clear silently.
- `contract_unenforced <file>` — **unchanged code**, reads `contract_paths` as
  it does today, so it follows the new output. See AC-3 below for why that
  moves no RED row.
- `story_paths <file>` — **unchanged code**: `touches:` if non-empty, else
  `contract_paths`. AC-4's fallback therefore judges a `**Writes:**` line when
  there is one and the filtered prose when there is not.
- `story_drift <file>` — **reads `contract_writes`, not `contract_paths`.** A
  story whose Contract has no `**Writes:**` line produces no DRIFT line: it has
  not said what it writes, so there is nothing to disagree with `touches:`.
  Coverage stays as HARNESS-006 pinned it — equality, or a `touches:` entry
  matching as a `case` glob. No basename matching: a `**Writes:**` entry is a
  repository-relative path, and a bare basename there is itself the drift.
- `cmd_conflicts` — output format unchanged: the DRIFT line text
  `contract names <path>, touches: does not`, the summary line and the exit
  status are byte-for-byte what HARNESS-006 shipped.

**Callers of changed behaviour** (no signature changes; `rg` over the tree at
the start commit, excluding `.claude/worktrees/`):

    scripts/plan.sh:132   contract_unenforced -> contract_paths   follows it
    scripts/plan.sh:346   story_paths         -> contract_paths   follows it
    scripts/plan.sh:356   story_drift         -> contract_paths   CHANGES to contract_writes
    scripts/plan.sh:391   cmd_conflicts       -> story_drift
    scripts/plan.sh:408-9 cmd_conflicts       -> story_paths
    .claude/tests/plan.test.sh:317   comment only
    docs/backlog/stories/HARNESS-007.md:99,304  prose: `waves` is to reuse
                              story_touches/contract_paths - unaffected, and
                              better served by story_paths, which it should call
    docs/backlog/stories/HARNESS-008.md:291,301  prose describing the pre-006
                              cmd_conflicts; unaffected
                              (RED, amended: added - the rg found it and the
                              list above did not; prose only, no behaviour)

RED's handoff states that this list was checked against the tree.

**`.claude/tests/plan.test.sh`** carries AC-1 to AC-4 under a new
`describe "drift reads what a Contract writes (HARNESS-016)"`, using the
existing `story_with` fixture (`CONTRACT:` lines and `TOUCHES:`). Every
existing assertion stays byte-identical and green — AC-4's control. Check
before writing that the existing conflict fixtures' Contract tokens
(`src/core/world.ts`, `src/ui/panel.tsx`, …) survive the four drop rules; if one
does not, stop and say so rather than editing it.

*(RED, amended 2026-09-30; option 1 of RED's escalation in the handoff, approved
by the orchestrator:)* each HARNESS-006 drift fixture - every fixture in the
"is a drift warning" section - gains one `CONTRACT:**Writes:** ...` line naming
the paths its prose already names. Reason: those fixtures stated their Contract
in prose only and asserted that it drifts, which PO decision 1 forbids (no
`**Writes:**`, no DRIFT). The input changes and no assertion does: the diff
against the base is insertions only. AC-4's control, the conflict and UNKNOWN
assertions, is unaffected.

**`scripts/new-story.sh`** — the `## Contract` template comment gains one
bullet asking for the `**Writes:**` line and saying `plan.sh conflicts` compares
it with `touches:`. It stays inside the HTML comment: no uncommented
`**Writes:**` line is emitted, so a fresh story declares no writes and drifts
on nothing. **`.claude/tests/new-story.test.sh`** pins both: the comment names
`**Writes:**`, and `contract_writes` of a freshly generated story is empty.

**`.claude/skills/story-authoring/SKILL.md`** (near line 72) and
**`CLAUDE.md`** (the DRIFT paragraph near line 111, "today it is noisy") say
that DRIFT compares `**Writes:**` with `touches:` and is silent without it. Not
asserted by a test: prose.

**Oracle partition.**
- *Settled* — AC-3. The baseline is below; read it out, do not re-derive it.
- *Mechanical* — AC-1, AC-2, AC-4. Exact lines, exact counts, anchored
  needles: `grep -cx` on the DRIFT line, never a floating `DRIFT` substring
  (a needle of `DRIFT` is satisfied by the summary's `drift warning(s)`).
- *Oracle-free* — none.

**Baseline for AC-3**, measured at `c37b02a` on this machine with
`plan.sh models <id> | grep '^RED'` for every story in the backlog:

    HARNESS-001..005        opus   (no-contract)
    HARNESS-006..015        fable  (base row)
    HARNESS-016             opus   (no-contract, before this Contract existed)

And the simulation of the four drop rules over every existing Contract: no
story's `contract_unenforced` changes. What keeps HARNESS-006..015 on `fable`
is a bare basename that classifies `source` — `plan.sh`, `phase.sh` — and rule
4 does not drop those. No existing story has a `**Writes:**` line, so none is
read differently by the first branch. **Expected: zero RED rows move among
HARNESS-001..015.** If GREEN measures anything else, that is an escalation, not
a fix.

**HARNESS-016 itself moves, and that is measured, not assumed.** With this
Contract written, the pre-change `plan.sh` reads its prose, finds bare
`plan.sh`/`phase.sh` (`source`) and says `fable`; the post-change one reads the
`**Writes:**` line above, all `harness`/`docs`, and says `unenforced` → `opus`.
Measured with the pre-change code on this file:

    RED	test-developer	fable	the measured case. ...

Any story that gains a `**Writes:**` line can move the same way; this is the
only one that does in this story. See `## Amendments`.

**A finding this story does NOT act on.** The same measurement shows
HARNESS-006..009 are harness-only stories on `fable`, because a bare `plan.sh`
in their prose classifies as `source` and switches the `unenforced` exception
off. A `**Writes:**` line in their Contracts would move them to `opus`. That is
the RED-model change AC-3 says must be decided rather than happen as a side
effect, so it is left to the user, reported, and not made here.

**Test-only dependencies:** none. bash, awk, coreutils.

## Deferred verifications

**DV-1 — defect put back (central claim, AC-1).** With `story_drift` reading
`contract_paths` again instead of `contract_writes`, AC-1's no-DRIFT assertion
MUST fail: the read-only mention reappears on a DRIFT line. RED cannot run it:
there is no `contract_writes` to revert from. Run through `scripts/mutate.sh`
against `.claude/tests/plan.test.sh` only. Owner: GATES

*Result (GATES, 2026-09-30).* The first run, with only `story_drift` switched back to `contract_paths`, did NOT turn AC-1 red, because a Contract with a `**Writes:**` line makes `contract_paths` return that line, so this mutant is equivalent whenever one exists. It failed a different assertion: `FAIL a Contract with no **Writes:** line produces no DRIFT line, whatever its prose names` (94/1). This entry was wrongly designed, not the suite. The defect actually put back is "drift reads the prose", both lines:

    bash scripts/mutate.sh scripts/plan.sh 's/c="\$(contract_writes "\$1")"; \[ -n "\$c" \] || return 0/c="$(contract_paths "$1")"; [ -n "$c" ] || return 0/; s/if \[ -n "\$w" \]; then printf/if false; then printf/' -- bash .claude/tests/plan.test.sh
        FAIL files a Contract only reads or cites are not drift when touches: covers every file it writes
        FAIL and the summary counts no drift warning
        FAIL a written file missing from touches: is exactly one DRIFT line, naming that file
        FAIL and the summary counts exactly one
        FAIL a Contract with no **Writes:** line produces no DRIFT line, whatever its prose names
        FAIL with no touches:, a pair is judged on the **Writes:** lines, not on files merely read
        FAIL a **Writes:** line naming only harness paths puts RED on the stronger model
        FAIL a source file the prose only reads does not make a harness-only **Writes:** enforced
    plan: 87 passed, 8 failed
    === mutate: command exited 1; restored (verified byte-for-byte ...) ===

AC-1's no-DRIFT assertion went red. The file was restored and verified by `mutate.sh`.

**DV-2 — a probe against the real backlog (the rule judges it).** On the real
`docs/backlog/stories/`, `plan.sh conflicts` prints 0 DRIFT lines (today: 9).
Then, with `scripts/mutate.sh`, append to HARNESS-007's Contract a
`**Writes:**` line naming `scripts/phase.sh` (not in its `touches:`), and the
run must print exactly one DRIFT line naming `scripts/phase.sh`, file restored.
RED cannot run it: the reader it probes does not exist yet. Owner: GATES

*Result (GATES, 2026-09-30).* Real backlog, unmutated: `7 conflict(s), 0 pair(s) that could not be judged, 0 drift warning(s).` (9 before this story). Probe:

    bash scripts/mutate.sh docs/backlog/stories/HARNESS-007.md 's/^\*\*Test-only dependencies:\*\* none\.$/&\n\n**Writes:** `scripts\/plan.sh`, `.claude\/tests\/plan.test.sh`, `scripts\/phase.sh`/' -- bash scripts/plan.sh conflicts
    DRIFT     HARNESS-007   contract names scripts/phase.sh, touches: does not
    7 conflict(s), 0 pair(s) that could not be judged, 1 drift warning(s).
    === mutate: command exited 1; restored (verified byte-for-byte ...) ===

Exit 1 comes from the 7 real CONFLICTs. `git diff --quiet` on HARNESS-007.md came back clean afterwards.

**DV-3 — AC-3 against the real backlog.** `plan.sh models <id> | grep '^RED'`
for every story at the start commit, with the pre-change `scripts/plan.sh`
(from `git show c37b02a:scripts/plan.sh`) and the post-change one, diffed.
Expected: the table in the Contract's baseline, zero moved model columns.
RED cannot run it: there is no post-change `plan.sh`. Owner: GATES

*Result (GATES, 2026-09-30).* Pre-change `plan.sh` from `git show c37b02a:scripts/plan.sh`, against the post-change one, over every story on this branch:

    HARNESS-001..005  opus  -> opus   same
    HARNESS-006..015  fable -> fable  same
    HARNESS-016       fable -> opus   MOVED (Amendment A-1)

Zero moves among 001..015, as the Contract predicted.

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

**A-1 — AC-3, a deliberate move of one story's RED row. Approved by the user,
2026-09-29, at PLANNED.** AC-3's text is unchanged; this is the entry it asks
for. Stories moved: **HARNESS-016 only, `fable` → `opus`.** Reason: its own
Contract declares a `**Writes:**` line that is entirely `harness`/`docs`, so
the post-change reader applies the `unenforced` exception to it, which is the
exception doing what `models.conf` says it is for — the lock freezes none of
this story's files. The pre-change reader said `fable` only because bare
`plan.sh`/`phase.sh` in the prose classify as `source`. The RED model *policy*
(`models.conf`) is not changed. HARNESS-001..015 are expected to move zero
rows; DV-3 measures that. Reproduction: the orchestrator's own measurement,
recorded under the Contract's AC-3 baseline.

## Model guidance

Planned by `bash scripts/plan.sh write HARNESS-016` from `.claude/harness/models.conf`.
A PLAN, not a record: a session setting or an explicit override can beat both
this and the agent's own `model:` field, and nothing here can see which won.
The orchestrator still writes down the model each dispatch **resolved** to, by
name, below the table.

| Phase | Agent | Planned | Why |
|---|---|---|---|
| PLANNED | `lead-po` | `opus` | planning is the judgement phase: decomposition, the oracle partition, and what goes in the contract |
| RED | `test-developer` | `fable` | the measured case. With a partitioned contract to work from, the brief carries the judgement and the weaker model writes sharper negative controls than the stronger one did without it |
| GREEN | `feature-developer` | `opus` | the failure mode of a weaker model here is reaching green by weakening a test, which is the one thing this harness exists to prevent |
| GATES | `feature-developer` | `opus` | same risk as GREEN, and a gate failure is where "make it stop complaining" is most tempting |
| REVIEW | `lead-po` | `opus` | reading review feedback against the contract is judgement, and a wrong call here ships |
| SCAFFOLD | `lead-po` | `opus` | source, tests and config in one indivisible derivation, with no failing test in front of any of it |

**Resolved:**

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->

- RED, `test-developer`: resolved **claude-opus-5-5** (explicit `model: opus` on the dispatch; the agent reported running on Opus 5.5). Verdict against the success condition: met. 12 new plan tests and 3 new new-story tests fail, each because the **Writes:** reader, the drop rules or the template bullet is absent. All 75 prior plan assertions and 31 new-story assertions stay green (orchestrator run, 2026-09-30). One escalation: the Contract contradicted HARNESS-006 fixtures. It was reproduced by the orchestrator and resolved as a fixture-input amendment.

**Departure, RED: `opus`, not the planned `fable`.** The table above was
rendered by the PRE-change `plan.sh`, which reads this Contract's prose and
calls the story enforced. The post-change reader, which this story builds,
reads the `**Writes:**` line and applies `unenforced` → `opus` (Amendment A-1).
The lock freezes none of this story's files, so the Contract is the only
enforcement — the case the `unenforced` row exists for. Stay on `opus` as
orchestrator. Brief: the criteria, the oracle partition and the Contract; not a
pre-decided test list. Success condition that could fail: RED's tests go red
on AC-1, AC-2 and AC-3's `**Writes:**` fixture for the absence of
`contract_writes` and nothing else, and every existing `plan.test.sh`
assertion stays green.
## Out of scope

<!-- Explicit non-goals. Prevents the Feature Developer from over-building. -->

- **Checking `touches:` or the Contract against the actual diff.** HARNESS-006
  named this gap and did not schedule it. This story does not either.
- **Glob-against-path overlap in `conflicts`.** Paths are still compared as
  literal text, as HARNESS-006 pinned.
- **Filling `touches:` for stories that lack it.** That is backlog upkeep, not
  a behaviour.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

<!-- Filled by the Test Developer during RED: which tests, at which level,
     and which AC each one covers. -->

Level: integration - every test runs the real `scripts/plan.sh` (or
`scripts/new-story.sh`) inside a throwaway fixture, and reads its stdout. That
is where the contract lives: DRIFT lines, CONFLICT rows and the RED model are
all printed output, and `contract_writes` has no subcommand to call directly.

`.claude/tests/plan.test.sh`, new `describe "drift reads what a Contract writes
(HARNESS-016)"` (appended; no existing line edited):

| # | Test (assertion name) | AC | Today |
|---|---|---|---|
| 1 | files a Contract only reads or cites are not drift when touches: covers every file it writes | AC-1 | FAIL |
| 2 | and the summary counts no drift warning | AC-1 | FAIL |
| 3 | a written file missing from touches: is exactly one DRIFT line, naming that file | AC-1 control | FAIL |
| 4 | and the summary counts exactly one | AC-1 control | FAIL |
| 5 | a Contract with no **Writes:** line produces no DRIFT line, whatever its prose names | AC-1 (PO decision 1) | FAIL |
| 6 | every **Writes:** line is read, and they union | AC-1 / Contract | pass on arrival |
| 7 | a **Writes:** line inside an HTML comment declares nothing | AC-1 / Contract | pass on arrival |
| 8 | a bare basename on a **Writes:** line is drift, not covered by the full path | Contract (no basename matching) | pass on arrival |
| 9 | non-path tokens and directory prefixes never reach a DRIFT line; the omitted written path does | AC-2 + control | FAIL |
| 10 | two Contracts sharing only non-path tokens are clear, not a CONFLICT | AC-2 | FAIL |
| 11 | and the command exits 0 | AC-2 | FAIL |
| 12 | a real shared path beside the junk is still a CONFLICT naming only that path | AC-2 control | FAIL |
| 13 | a bare basename is still a path on the prose fallback | AC-2 other direction / AC-4 | pass on arrival |
| 14 | with no touches:, a pair is judged on the **Writes:** lines, not on files merely read | AC-4 | FAIL |
| 15 | and two **Writes:** lines naming the same file are a CONFLICT on it | AC-4 control | pass on arrival |
| 16 | a **Writes:** side and a prose-only side are still judged against each other | AC-4 | pass on arrival |
| 17 | a prose-only Contract naming a bare plan.sh keeps RED on the weaker model | AC-3 (a) | pass on arrival |
| 18 | a **Writes:** line naming only harness paths puts RED on the stronger model | AC-3 (b), A-1's mechanism | FAIL |
| 19 | a source file the prose only reads does not make a harness-only **Writes:** enforced | AC-3 (b') | FAIL |
| 20 | a **Writes:** line with one source path keeps RED on the weaker model | AC-3 (c) control | pass on arrival |

AC-4's other half - the existing conflict and UNKNOWN assertions, unchanged -
is the untouched HARNESS-006 blocks above it. Their Contract tokens
(`src/core/world.ts`, `src/ui/panel.tsx`, `src/ui/other.tsx`, `scripts/plan.sh`,
`scripts/task.sh`, `scripts/new-story.sh`, `.claude/tests/plan.test.sh`) all
contain a `/`, so none of the four drop rules can touch them; and the
conflict/UNKNOWN assertions stayed green under a Contract-faithful candidate
(see the handoff). The drift fixtures needed a `**Writes:**` line under PO
decision 1: escalated, resolved as option 1 (see the handoff), input-only.

`.claude/tests/new-story.test.sh`, new `describe "the Contract asks for a
**Writes:** line, and a new story declares none (HARNESS-016)"`:

| # | Test | Covers | Today |
|---|---|---|---|
| N1 | the Contract comment names the **Writes:** line | Contract, new-story block | FAIL |
| N2 | and says plan.sh conflicts compares it with touches: | Contract, new-story block | FAIL |
| N3 | a fresh story's Contract mentions **Writes:** only inside the comment, and declares no write | Contract, new-story block | FAIL |

N3 is one assertion over two facts (`commented 0`) so that neither half passes
alone: it fails today because there is no mention, and fails if the example
escapes the comment because the uncommented count becomes 1.

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

### Escalation - RESOLVED (option 1, approved by the orchestrator 2026-09-30)

RED stopped on a contradiction in the Contract: PO decision 1 says a Contract
with no `**Writes:**` line produces no DRIFT line, and HARNESS-006's drift
fixtures stated their Contract in prose only and asserted that it drifts. A
Contract-faithful candidate (scratch copy, never `scripts/`) turned 7 of those
assertions red (`plan: 68 passed, 7 failed`), and made `a Contract path matched
by a touches: glob is not drift` vacuous. The orchestrator reproduced it and
approved option 1. The Contract's `plan.test.sh` block is amended in place to
say so.

**What changed:** every fixture in the HARNESS-006 "is a drift warning" section
gained one `CONTRACT:**Writes:** ...` line naming the paths its prose already
names - seven fixtures:

| Fixture | Line added |
|---|---|
| the one-DRIFT-line case | `**Writes:** `scripts/plan.sh`, `scripts/new-story.sh`` |
| glob matches (now meaningful again) | `**Writes:** `src/ui/panel.tsx`` |
| glob does not match | `**Writes:** `src/ui/panel.tsx`` |
| fewer than two startable stories | `**Writes:** `scripts/plan.sh`, `scripts/new-story.sh`` |
| drift beside a conflict | `**Writes:** `scripts/plan.sh`, `scripts/new-story.sh`` |
| Contract but no `touches:` key (not drift) | `**Writes:** `scripts/plan.sh`, `scripts/new-story.sh`` |
| blocked story (not drift-checked) | `**Writes:** `src/ui/other.tsx`` |

The last two assert the ABSENCE of drift for a reason other than "no Writes
line" (no `touches:`; blocked). Without a Writes line they would pass under the
new reader for the wrong reason, the same vacuity as the glob-match case, so they
got one too. The input changed and no assertion did: `git diff --numstat` on
`plan.test.sh` against the base reads `290 0` - insertions only. AC-4's control
(the conflict and UNKNOWN assertions) is untouched.

**Still green on today's code**, as expected: today's reader reads the prose,
and the added `**Writes:**` line contains the same paths. **GREEN proves the
edited fixtures against the new reader**; the scratch candidate already runs the
whole file at `95 passed, 0 failed`, which is a claim until GREEN's run on the
shipped `scripts/plan.sh`.

### Commands

    bash .claude/tests/plan.test.sh        # ~2-3 min on this machine
    bash .claude/tests/new-story.test.sh   # ~1.5 s
    bash scripts/selftest.sh plan          # the binding CI form

### Counts (all local, this machine)

| Suite | Before RED | After RED, pre-change `scripts/plan.sh` | Scratch Contract-faithful candidate |
|---|---|---|---|
| plan | 75 passed, 0 failed (inferred: 83 - 8 new passes, no old FAIL printed) | **83 passed, 12 failed** - the 12 are all new HARNESS-016 assertions; all 75 pre-existing, including the 7 edited drift fixtures, green | 95 passed, 0 failed |
| new-story | 31 passed, 0 failed (HEAD's file, run) | 31 passed, 3 failed | 34 passed, 0 failed |

### Failure output (pre-change code, trimmed to the new block)

    drift reads what a Contract writes (HARNESS-016)
      FAIL files a Contract only reads or cites are not drift when touches: covers every file it writes
           expected:
           actual:   DRIFT     A             contract names .claude/harness/rules.md, touches: does not
           DRIFT     A             contract names plan.sh, touches: does not
           DRIFT     A             contract names scripts/check-boundaries.sh, touches: does not
           DRIFT     A             contract names scripts/phase.sh, touches: does not
      FAIL and the summary counts no drift warning
      FAIL a written file missing from touches: is exactly one DRIFT line, naming that file
           expected: DRIFT     A             contract names .claude/tests/plan.test.sh, touches: does not
           actual:   (that line plus the four read-only mentions above)
      FAIL and the summary counts exactly one
      FAIL a Contract with no **Writes:** line produces no DRIFT line, whatever its prose names
           actual:   DRIFT     A             contract names scripts/new-story.sh, touches: does not
      FAIL non-path tokens and directory prefixes never reach a DRIFT line; the omitted written path does
           actual:   DRIFT ... .claude/skills/stack-profiles/reference/ | 0.139s | 1.2 | 4.9 | AC-1..AC | e.g | i.bak | scripts/new-story.sh
      FAIL two Contracts sharing only non-path tokens are clear, not a CONFLICT
           expected: clear      actual: CONFLICT
      FAIL and the command exits 0
           expected: 0          actual: 1
      FAIL a real shared path beside the junk is still a CONFLICT naming only that path
           expected: CONFLICT 5 src/core/world.ts
           actual:   CONFLICT 11 .claude/skills/stack-profiles/reference/
      FAIL with no touches:, a pair is judged on the **Writes:** lines, not on files merely read
           expected: clear      actual: CONFLICT
      FAIL a **Writes:** line naming only harness paths puts RED on the stronger model
           expected: opus       actual: fable
      FAIL a source file the prose only reads does not make a harness-only **Writes:** enforced
           expected: opus       actual: fable
    plan: 83 passed, 12 failed

    the Contract asks for a **Writes:** line, and a new story declares none (HARNESS-016)
      FAIL the Contract comment names the **Writes:** line       expected: yes  actual: no
      FAIL and says plan.sh conflicts compares it with touches:  (Contract section has no such text)
      FAIL a fresh story's Contract mentions **Writes:** only inside the comment, and declares no write
           expected: commented 0
           actual:   absent 0
    new-story: 31 passed, 3 failed

Why these are the right failures: every one is the absence of the thing the
Contract adds - prose read for drift (no `contract_writes`), no drop rules
(junk tokens as paths), prose read by the fallback and the model plan instead
of the `**Writes:**` line, and no template bullet. No syntax error, no fixture
error: the same file runs 20/20 new assertions green against the candidate.

### Files touched

- `.claude/tests/plan.test.sh` - new describe block appended before `summary`;
  and one `CONTRACT:**Writes:**` line inserted into each of the seven HARNESS-006
  drift fixtures (escalation option 1). Insertions only; no existing line
  changed.
- `.claude/tests/new-story.test.sh` - new describe block appended before
  `summary`; no existing line changed.
- `docs/backlog/stories/HARNESS-016.md` - `## Test plan`, this handoff, and two
  Contract amendments: the callers list (below), and the drift-fixture
  `**Writes:**` lines in the `plan.test.sh` block.

Not touched: anything under `scripts/`.

### What the tests pin (as fact)

- **DRIFT line text**, exact, whole-line: `printf '%-9s %-13s %s' DRIFT <id>
  "contract names <path>, touches: does not"`. Summary line exact:
  `N conflict(s), N pair(s) that could not be judged, N drift warning(s).`
- **`**Writes:**` reading**: a line of the `## Contract` section that starts at
  column 0 with `**Writes:**`, after `strip_comments` (a column-0 one inside a
  multi-line `<!-- -->` is not read); every backticked token on it is a path;
  multiple lines union; entries compared to `touches:` by equality or `case`
  glob only - no basename matching.
- **drift reads only `**Writes:**`**: a Contract with none produces no DRIFT
  line whatever its prose says.
- **`contract_paths`**: exactly the `**Writes:**` set when there is one (the
  pair table and the RED model both follow it); otherwise the prose extraction
  minus the four drop rules. The fixtures exercise: `AC-1..AC` (rule 1),
  `.claude/skills/stack-profiles/reference/` (rule 2), `1.2`, `4.9` (rule 3),
  `e.g`, `i.bak`, `0.139s` (rule 4); and `plan.sh` must survive.
- **CONFLICT row detail**: the tests check `$1, NF, $5` of the row, so the
  shared-path list must be the single path (5 whitespace fields).
- **RED model**: read as field 3 of the tab-separated `RED` row of `plan.sh
  models <id>`.
- **new-story**: inside the `## Contract` section of a generated story, at least
  one `**Writes:**` inside the comment, the literal text `plan.sh conflicts`
  somewhere in the section, and zero uncommented lines starting `**Writes:**`.

**Not constrained:** the name `contract_writes` (no test calls it directly -
the Contract names it, GREEN should keep that name); how the drop rules are
implemented (awk, grep, case); whether surrounding whitespace on the
`**Writes:**` line is tolerated; whether non-backticked text on the line is
ignored (it should be, per the Contract, but no test puts any there); the
wording of the template bullet beyond the two needles; the prose in
`story-authoring/SKILL.md` and `CLAUDE.md` (Contract: not asserted).

### Passed on arrival, and what earns each

Each earned by a mutant of a **scratch** Contract-faithful candidate (a copy of
the harness under the session scratchpad, never `scripts/`), one mutation per
assertion, suite run against it. Local runs, this machine:

| Test | Why green today is correct | Mutant of the candidate | Result |
|---|---|---|---|
| #7 commented `**Writes:**` not read | today's prose reader already strips comments | `contract_writes` without `strip_comments` | exactly #7 FAILs (87/8, measured before the fixture edit; the other 7 were the escalation's) |
| #8 bare basename on `**Writes:**` drifts | today `plan.sh` != `scripts/plan.sh` either | `story_drift` also accepts a `touches:` entry ending in `/<p>` | exactly #8 FAILs |
| #6 `**Writes:**` lines union | today's prose happens to hold both paths | read only the first `**Writes:**` line | exactly #6 FAILs |
| #13 bare basename survives the fallback; #17 AC-3(a) | today has no drop rules | fallback drops every token without `/` | exactly #13 and #17 FAIL (86/9) |
| #15, #16 AC-4 controls; #20 AC-3(c) | controls: today's prose reader and the new reader agree on these inputs by construction | not separately mutated - they are the controls for #14 and #18/#19, which fail today | - |

These are claims about the candidate, not the shipped module. GREEN confirms
them by running the suite; `/audit-mutations` may re-earn them.

### Negative controls - expected values

No thresholds here; the "numbers" are exact lines and counts. Measured by
running the suite against the scratch candidate (outside the real
`scripts/plan.sh`, which does not have the feature):

| Control | Expected | Pre-change code | Candidate |
|---|---|---|---|
| AC-1: one written file dropped from `touches:` | exactly `DRIFT     A             contract names .claude/tests/plan.test.sh, touches: does not`, summary `1 drift warning(s)` | 5 DRIFT lines | 1 line, as expected |
| AC-2 drift: omitted written path beside junk | exactly the `scripts/new-story.sh` DRIFT line | 8 lines | 1 line |
| AC-2 conflict: shared real path beside junk | `CONFLICT 5 src/core/world.ts` | `CONFLICT 11 ...reference/` | as expected |
| AC-4: two `**Writes:**` on the same file | `CONFLICT 5 src/core/world.ts` | same (passes) | same |
| AC-3(c): source path on `**Writes:**` | `fable` | `fable` | `fable` |
| new-story: example escapes the comment | N3 FAILs with `commented 1` | n/a | FAILed with `commented 1` (template mutant with an uncommented `**Writes:** \`src/example.ts\``) |

**GREEN confirmation (2026-09-30, feature-developer, shipped `scripts/plan.sh`
and `scripts/new-story.sh`, this machine).** Each control re-measured outside
the assertion, by building the same fixture with the suite's own
`make_project_fixture` and `story_with` and reading `plan.sh`'s output:

| Control | Expected (RED) | Measured on shipped code | Match |
|---|---|---|---|
| AC-1: one written file dropped from `touches:` | the `.claude/tests/plan.test.sh` DRIFT line, `1 drift warning(s)` | `DRIFT     A             contract names .claude/tests/plan.test.sh, touches: does not` and `0 conflict(s), 0 pair(s) that could not be judged, 1 drift warning(s).` | yes |
| AC-2 drift: omitted written path beside junk | the `scripts/new-story.sh` DRIFT line only | exactly that one line, `1 drift warning(s)` | yes |
| AC-2 conflict: shared real path beside junk | `CONFLICT 5 src/core/world.ts` | `CONFLICT 5 src/core/world.ts` | yes |
| AC-4: two `**Writes:**` on the same file | `CONFLICT 5 src/core/world.ts` | `CONFLICT 5 src/core/world.ts` | yes |
| AC-3(c): source path on `**Writes:**` | `fable` | `fable` (measured with `src/core/world.ts` + `.claude/tests/plan.test.sh`; the suite's own fixture, `src/core/world.ts` + `scripts/plan.sh`, passes its assertion) | yes |
| new-story: example escapes the comment | N3 FAILs with `commented 1` | via `scripts/mutate.sh scripts/new-story.sh 's/^## Contract$/## Contract\n\n**Writes:** `src\/example.ts`/'`: `FAIL ... expected: commented 0 / actual: commented 1`, `new-story: 33 passed, 1 failed`, restored byte-for-byte | yes |

No divergence from RED's candidate. Suites on the shipped code: `plan: 95
passed, 0 failed`, `new-story: 34 passed, 0 failed` - the edited HARNESS-006
drift fixtures included, so the escalation's option 1 holds on the real reader.

### Contract callers list - checked

`grep -rn -E "contract_paths|story_drift|story_paths|contract_writes"` over the
tree excluding `.claude/worktrees/` and `.git`: every `scripts/plan.sh` line in
the Contract's list is correct (97/112 def, 132, 344-346, 353-356, 391,
408-409). Additionally found: `docs/backlog/stories/HARNESS-008.md:291,301`
(prose), now added to the list; `HARNESS-006.md` (its own history, prose); and
`.claude/state/mutations/log` (machine-local). No other code caller.

### Deferred verifications - declined, GATES-owned

- **DV-1** (defect put back: `story_drift` reading `contract_paths`) - I cannot
  run it: there is no `contract_writes` to revert from. The pre-change run
  above is the same defect and shows tests #1-#5 red, which is suggestive, not
  DV-1.
- **DV-2** (real-backlog probe, 0 DRIFT then 1 with a mutated HARNESS-007) - I
  cannot run it: the reader it probes does not exist.
- **DV-3** (AC-3 before/after `plan.sh models` over the real backlog) - I cannot
  run it: there is no post-change `plan.sh`. Not claimed.

### For GREEN

- The escalation is resolved (option 1). With the edited fixtures, the scratch
  candidate runs the whole plan suite at 95 passed, 0 failed; your run on the
  shipped `scripts/plan.sh` is what proves the edited drift fixtures.
- A candidate that passed all 20 new assertions: `contract_writes` = section |
  `strip_comments` | awk on `/^\*\*Writes:\*\*/` printing each backtick span |
  `sort -u`; `contract_paths` returns it when non-empty, else today's grep
  piped through awk dropping `/\.\./`, `/\/$/`, `/\.[0-9]+$/`, and
  `!/\// && /^[^.]\./`; `story_drift` swaps `contract_paths` for
  `contract_writes`. Offered as evidence the tests are satisfiable, not as a
  design.
- No test-only dependency. Timings: plan suite ~2-3 min locally, new-story
  ~1.5 s; no CI timing measured.

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

    run:    2026-09-30T13:44:53Z
    commit: 302adbf (working tree had uncommitted changes)
    tree:   c1726f80ead2589eff521c30be46f0a196e3c87a
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

Filed 2026-09-30 at the user's request, from HARNESS-006's GATES result (its
`## Deferred verifications`, "AC-4's drift case against the REAL backlog").

**Open for PLANNED: how a Contract says what it writes.** The ACs fix the
behaviour, not the mechanism. The PO decides the mechanism before RED:
- **An explicit declaration inside `## Contract`**, such as a `**Writes:**` line
  or a fenced list, read instead of the prose. It is precise, but it is a third
  place a story names its files, next to `touches:` and the prose. The template
  comment in `new-story.sh` and `story-authoring` would have to ask for it.
- **A stricter extractor**, for example: only tokens containing a `/`, and none
  ending in `/`; a bare basename counts as covered when `touches:` lists a path
  ending in it. It needs no new convention, but it is still a guess about
  prose, and a written file cited by its bare name would silently stop
  drifting.

Whichever is chosen, AC-3 decides whether `contract_unenforced` moves with it.
Record which, and why, in the Contract.

**This story is itself a candidate conflict.** It declares `scripts/plan.sh` and
`.claude/tests/plan.test.sh`, as do HARNESS-007 and HARNESS-009. Run it before
007, which builds on the signal it repairs.

**Decided at PLANNED (2026-09-29, lead-po):**
1. Mechanism: the explicit `**Writes:**` line, both options weighed in the
   Contract's PO decision 1. The stricter extractor cannot meet AC-1 against
   HARNESS-009's "No change to ..." sentence.
2. `contract_unenforced` moves with `contract_paths` (one extractor, as
   HARNESS-006 insisted). Measured: zero moves among HARNESS-001..015;
   HARNESS-016 itself moves `fable` → `opus`, approved by the user as
   Amendment A-1.
3. Required gate: `bash scripts/selftest.sh`, the `plan` and `new-story`
   suites. `BOOTSTRAPPED=no`, so no `gates.sh` gate is configured and
   `required_gates` stays `[]`.
4. HARNESS-006..009 sit on `fable` only through bare-basename noise. Not acted
   on here; the user chose to file a follow-up story (HARNESS-017).

**Orchestrator's check of RED's mutation table (GREEN, 2026-09-30).** RED listed
"`**Writes:**` lines union" as passing on arrival, earned by the mutant "read
only the first `**Writes:**` line", which should fail that one assertion. I ran it
against the shipped reader:

    bash scripts/mutate.sh scripts/plan.sh 's/index(\$0, "\*\*Writes:\*\*") == 1 {/index($0, "**Writes:**") == 1 \&\& !seen++ {/' -- bash .claude/tests/plan.test.sh
        FAIL every **Writes:** line is read, and they union
    plan: 94 passed, 1 failed
    === mutate: command exited 1; restored (verified byte-for-byte ...) ===

The count matched the prediction: one assertion. After the restore, `plan: 95 passed, 0 failed`.
GREEN resolved model: `feature-developer`, **claude-opus-5-5** (dispatch passed `model: opus`; agent confirmed).

**DONE, 2026-09-30.** Merged in #87 (merge commit 3081f3e), release 57. PR CI:
`gates` job success in 1m26s, with the harness self-test step taking 69s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/36730695020);
`boundaries` success in 12s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/36730694779).
The release bump was missed on the branch and landed with this DONE commit on
main; `VERSION` was not in `touches:`.
