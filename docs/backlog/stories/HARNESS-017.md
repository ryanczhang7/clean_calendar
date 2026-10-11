---
id: HARNESS-017
title: Declare Writes for 007 and 009 and decide their RED model
slug: declare-writes-for-007-and-009-and-decid
epic: 
type: chore
status: done
phase: DONE
branch: story/HARNESS-017-declare-writes-for-007-and-009-and-decid
depends_on: [HARNESS-016]     # story ids; phase.sh refuses to start this story until they are DONE
touches: [docs/backlog/stories/HARNESS-007.md, docs/backlog/stories/HARNESS-009.md]        # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

<!-- Why this story exists. Link the epic and any wiki pages that constrain it.
     Name the REQUIRED gate that would fail if this story's artifact broke. If
     only an optional gate can, put it in required_gates above before RED:
     every required gate once passed over a story none of them exercised. -->

No epic. Found while planning HARNESS-016 (its Contract, "A finding this story
does NOT act on", and Notes decision 4). The user chose to file it on
2026-09-29.

**HARNESS-006..009 run RED on `fable` only by accident.** Their Contracts name
only `harness`/`docs` paths in full. They also mention bare basenames such as
`plan.sh` and `phase.sh`, which `classify.sh` calls `source`. That turns off
the `unenforced` exception in `models.conf`, and `unenforced` exists for
exactly these stories: ones whose files the phase lock never freezes.
HARNESS-016 adds a `**Writes:**` line that `contract_paths` reads instead of
prose. Giving 007 and 009 a `**Writes:**` line would move their RED row to
`opus`. HARNESS-016's AC-3 forbids that move as a side effect, so it gets
decided here. 006 and 008 are DONE and are recorded, not changed.

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC.
     An AC that names a statistic, a metric or a threshold names a NEGATIVE
     CONTROL too: the deliberately broken input the metric must reject, and
     roughly what it should score. A criterion can be perfectly testable and
     still be blind to the defect it exists to catch, and that is more
     dangerous than a vague one - it survives review and goes green. -->

- **AC-1** — HARNESS-007's and HARNESS-009's `## Contract` each carry a
  `**Writes:**` line naming exactly the files that story writes, and
  `bash scripts/plan.sh conflicts` prints no DRIFT line for either.
- **AC-2** — `bash scripts/plan.sh models HARNESS-007` and `... HARNESS-009`
  give the RED row the user decides at PLANNED (expected: `opus`, via
  `unenforced`). `## Model guidance` in each is re-rendered with
  `plan.sh write`, and the decision is recorded in that story's `## Notes`.

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
change; GREEN builds what the amended block says. Every file this story writes
classifies as `docs`, so the phase lock freezes none of it in any phase: this
Contract is the only enforcement there is.

**Writes:** `docs/backlog/stories/HARNESS-007.md`, `docs/backlog/stories/HARNESS-009.md`

**PO decision 1 — there is no test file, and that is deliberate.** Both
criteria are statements about THIS repository's backlog. `.claude/tests/*`
ships to every consuming project through `refresh-harness.sh`, and a suite
there that reads `docs/backlog/stories/HARNESS-007.md` would fail in every one
of them. HARNESS-016's AC-3 set the precedent: a criterion over the real
backlog is a command over the real tree, run and pasted. So each AC's "test"
below is a command with an anchored needle. RED runs it against the tree as it
stands and pastes the red into the handoff. GREEN runs it again and pastes the
green. RED writes no file except this story's `## Test plan` and `## Handoff`.

**The checks, one per AC**, run from the repository root:

    # AC-1a: in each story's ## Contract, the backticked paths on lines that
    #        start at column 0 with **Writes:** (outside HTML comments),
    #        sorted, equal its touches: list, sorted. Equal, not "covers":
    #        "exactly the files that story writes"
    # AC-1b: no DRIFT line names either story
    bash scripts/plan.sh conflicts | grep -cE '^DRIFT +HARNESS-(007|009)( |$)'   # expect 0
    # AC-2: the RED row of each
    bash scripts/plan.sh models HARNESS-007 | grep -cx 'RED	test-developer	opus	.*'  # expect 1

*Amended in RED (test-developer, 2026-09-30):* the sketch above is superseded
by the single check block in `## Handoff: RED -> GREEN`, which is the command
GREEN and GATES run. Reasons: (1) the AC-2 line holds literal tabs, which a
copy-paste can turn into spaces and so into a silent 0 - the block spells them
`$'\t'`; (2) `plan.sh conflicts` exits 1 on its 5 expected CONFLICTs, so the
block captures its output rather than piping it; (3) AC-2's second half
(`## Model guidance` re-rendered, the decision in `## Notes`) had no check, and
now has two - AC-2b and AC-2c below. The needles are unchanged in substance.

RED pins the exact commands. `plan.sh` cannot be sourced for its
`contract_writes` helper, because it dispatches on `$1` at load. So AC-1a is an
`awk` over the `## Contract` section, reading lines that start at column 0 with
`**Writes:**`. That is the same shape HARNESS-016's PO decision 1 fixed. The needles
must not match their own negation. `grep -c DRIFT` is satisfied by the summary
line's `drift warning(s)`, and a floating `opus` is satisfied by
`the model: opus` anywhere in a reason column.

**The Writes lines GREEN adds**, one per story, placed as the first line of
prose in its `## Contract`, after the template comment:

    HARNESS-007:  **Writes:** `scripts/plan.sh`, `.claude/tests/plan.test.sh`, `.claude/commands/plan-product.md`, `.claude/skills/story-authoring/SKILL.md`
    HARNESS-009:  **Writes:** `.claude/agents/lead-po.md`, `scripts/plan.sh`, `.claude/tests/plan.test.sh`

Each is its story's `touches:` in full, so it names what that story's ACs
require: 007's AC-5 and AC-6 write `plan-product.md` and `SKILL.md`, and 009's
AC-6 writes `lead-po.md`. Neither story's criteria, `touches:` or prose change.

**Then, in each of the two stories:** run `bash scripts/plan.sh write <id>` to
re-render `## Model guidance`, and add one paragraph to `## Notes` recording the
RED-model decision (PO decision 2 below), the date, and that the user made it.

**PO decision 2 — the RED model, decided by the user on 2026-09-30.** With the
`**Writes:**` lines, every path either Contract names is `harness`, so the
`unenforced` exception fires and RED moves `fable` → `opus`. The user chose to
take that move as the policy states it: neither story has a lock over its
files, so the Contract is the only enforcement. `models.conf` is not edited.

**Baseline, measured on this branch at `64a24b3`** (read it out, do not
re-derive it):

    plan.sh models HARNESS-007 | grep ^RED   ->  RED  test-developer  fable  the measured case. ...
    plan.sh models HARNESS-009 | grep ^RED   ->  RED  test-developer  fable  the measured case. ...
    plan.sh conflicts                        ->  5 conflict(s), 0 pair(s) that could not be judged, 0 drift warning(s).

`classify.sh` of each path on the two Writes lines: `harness`, all seven.

**Oracle partition.**
- *Mechanical* — AC-1 and AC-2. Exact lines, anchored needles.
- *Settled* — the baseline above.
- *Oracle-free* — none.

**Not changed by this story:** any other story's RED row. The conflicts table
must stay `5 conflict(s)` with the same pairs; `CONFLICT HARNESS-007 +
HARNESS-009` stays, because both still write `plan.sh`.

**Test-only dependencies:** none. **Callers of changed signatures:** none; no
code changes.

**Required gate.** `BOOTSTRAPPED=no`, so `gates.sh` has no configured gate and
`required_gates` stays `[]`. The artifact is two story files, and the check that
would fail if it broke is the AC commands above. No gate in `gates.sh --list`
reads `docs/backlog/`. They run in RED, GREEN and GATES, and the PR body
carries their output.

## Deferred verifications

**DV-1 — the defect put back.** With HARNESS-007's `**Writes:**` line removed,
`plan.sh models HARNESS-007` MUST give RED `fable` again. That shows the move to
`opus` comes from the line this story adds, not from something else. RED cannot
run it, because the line does not exist yet. Run it with `scripts/mutate.sh` on
the story file, against the AC-2 command.
Owner: GATES

**Result (GATES, 2026-09-30, lead-po):** the check held. I removed HARNESS-007's
`**Writes:**` line with `mutate.sh` and ran the AC-2a needle against it:

    bash scripts/mutate.sh docs/backlog/stories/HARNESS-007.md '/^\*\*Writes:\*\* `scripts\/plan\.sh`/d' -- \
      bash -c 'bash scripts/plan.sh models HARNESS-007 | grep "^RED" | cut -f1-3; bash scripts/plan.sh models HARNESS-007 | grep -cx "RED	test-developer	opus	.*"'
    === mutate: running bash -c ... ===
    RED	test-developer	fable
    0
    === mutate: command exited 1; restored (verified byte-for-byte against .../.claude/state/mutations/docs_backlog_stories_HARNESS-007.md.20260930T150841Z.25816.bak) ===
      81: **Writes:** `scripts/plan.sh`, `.claude/tests/plan.test.sh`, `.claude/commands/plan-product.md`, `.claude/skills/story-authoring/SKILL.md`

After the restore, `plan.sh models HARNESS-007 | grep ^RED` gives
`RED	test-developer	opus`. So the move to `opus` comes from the line this
story added and from nothing else. This is also the one mutation from RED's
table that I ran: RED predicted it as the converse of P2, and it matched.

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

**A-1 (2026-09-30, PLANNED, lead-po; cosmetic).** Two placeholder lines from the
`new-story.sh` template were removed from `## Acceptance criteria`:
`- **AC-1** — Given <state>, when <action>, then <observable outcome>.` and the
same line for AC-2. They duplicated the real AC ids and asserted nothing. AC-1
and AC-2 as filed are unchanged, word for word. The entry exists because
`check-boundaries.sh` compares the section with `main` whatever phase the edit
was made in.

## Model guidance

Planned by `bash scripts/plan.sh write HARNESS-017` from `.claude/harness/models.conf`.
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

- PLANNED: `lead-po` - this orchestrating session, **claude-opus-5-5**.
- RED: `test-developer`, **claude-opus-5-5** (dispatch passed `model: opus`; agent reported opus, no override).
- GREEN: `feature-developer`, **claude-opus-5-5** (dispatch passed `model: opus`; agent reported opus).
- GATES: run by the orchestrator, lead-po, **claude-opus-5-5**. No dispatch: the gates configure nothing, and DV-1 is the orchestrator's.

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Out of scope


- Any other story's `**Writes:**` line or RED row. HARNESS-006 and HARNESS-008 are
  DONE and are not edited. HARNESS-001..005 sit on `opus` through `no-contract`.
- Any edit to `models.conf` or `plan.sh`.
- HARNESS-007's and HARNESS-009's criteria, `touches:` and Contract prose.
<!-- Explicit non-goals. Prevents the Feature Developer from over-building. -->

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

<!-- Filled by the Test Developer during RED: which tests, at which level,
     and which AC each one covers. -->

No test file (Contract, PO decision 1). The tests are ten checks in one bash
block, run over the real tree from the repository root. The block is in
`## Handoff: RED -> GREEN` below. Each check runs once per story, for
HARNESS-007 and for HARNESS-009:

| Check | AC | What it asserts | Needle |
|---|---|---|---|
| AC-1a | AC-1, first half | The backticked paths on `## Contract` lines that start at column 0 with `**Writes:**` (HTML comments stripped, the same extraction as `plan.sh contract_writes`), sorted and unique, EQUAL the frontmatter `touches:` list, sorted and unique. Both must be non-empty. | string equality of the two sorted lists |
| AC-1b | AC-1, second half | `plan.sh conflicts` prints no DRIFT line naming the story | `grep -cE "^DRIFT +$id( \|$)"` must be `0` |
| AC-2a | AC-2, RED row | `plan.sh models <id>` has a RED row whose model field is exactly `opus` | `grep -cx $'RED\ttest-developer\topus\t.*'` must be `1` |
| AC-2b | AC-2, "re-rendered with `plan.sh write`" | `## Model guidance`, comments stripped, holds the tool's header line and an opus RED table row | `grep -cx 'Planned by \`bash scripts/plan.sh write <id>\` from \`.claude/harness/models.conf\`.'` = 1, and `grep -cE '^\| RED \| \`test-developer\` \| \`opus\` \| '` = 1 |
| AC-2c | AC-2, "recorded in that story's `## Notes`" | `## Notes`, comments stripped, has a paragraph whose first line starts at column 0 with `**RED model` and contains `2026-09-30`. That paragraph, up to the next blank line, contains `` `opus` ``, `unenforced` and `user` (case-insensitive). | see the block |

Level: a command over the real tree, because the criteria are statements about
this repository's backlog. AC-1b is a regression guard and passes on arrival
(see the handoff). The other eight checks fail now, each for the reason its AC
names.

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

Written by test-developer, 2026-09-30, in RED. The model was declared `opus` in
the agent definition. The dispatch carried no override that I can see; the
orchestrator records what it resolved to.

**The command.** Paste the block as is, from the repository root. It prints one
PASS/FAIL line per check and story, and exits 1 if any check FAILs. It uses
only bash, awk and coreutils. It reads `plan.sh conflicts` into a variable
rather than piping it, because that command exits 1 on its 5 expected
CONFLICTs.

    bash <<'CHECK'
    # HARNESS-017 AC checks. Run from the repository root with bash. Prints one
    # PASS/FAIL line per check and story; exits 1 if any FAIL. bash/awk/coreutils.
    fails=0
    ok()  { printf 'PASS  %s\n' "$1"; }
    bad() { printf 'FAIL  %s -- %s\n' "$1" "$2"; fails=$((fails + 1)); }
    # sec FILE HEADING: the section's body, HTML comments stripped (same shape as
    # plan.sh section | strip_comments).
    sec() {
      awk -v h="## $2" 'index($0, h) == 1 { on = 1; next } on && /^## / { exit } on { print }' "$1" \
      | awk '{ s = s $0 "\n" } END { while ((i = index(s, "<" "!--")) > 0) { r = substr(s, i); j = index(r, "--" ">");
               if (j == 0) { s = substr(s, 1, i - 1); break } s = substr(s, 1, i - 1) substr(r, j + 3) } printf "%s", s }'
    }
    conf="$(bash scripts/plan.sh conflicts)" || true   # exits 1 on CONFLICT; 5 are expected
    for id in HARNESS-007 HARNESS-009; do
      f="docs/backlog/stories/$id.md"
      # AC-1a: **Writes:** paths (column 0, outside comments) == touches:, both sorted.
      w="$(sec "$f" Contract | awk 'index($0, "**Writes:**") == 1 { n = split($0, p, "`"); for (k = 2; k < n; k += 2) if (p[k] != "") print p[k] }' | sort -u)"
      t="$(awk 'NR == 1 && /^---$/ { on = 1; next } on && /^---$/ { exit }
                on && /^touches:/ { sub(/^touches:[ \t]*\[/, ""); sub(/\].*$/, ""); n = split($0, a, ",");
                  for (k = 1; k <= n; k++) { gsub(/^[ \t]+|[ \t]+$/, "", a[k]); if (a[k] != "") print a[k] } }' "$f" | sort -u)"
      if [ -n "$w" ] && [ "$w" = "$t" ]; then ok "AC-1a $id Writes == touches"
      else bad "AC-1a $id Writes == touches" "Writes=[$(printf '%s' "$w" | tr '\n' ' ')] touches=[$(printf '%s' "$t" | tr '\n' ' ')]"; fi
      # AC-1b: no DRIFT line for this story. Anchored at ^DRIFT and the id, so the
      # summary line's "drift warning(s)" cannot match.
      n="$(grep -cE "^DRIFT +$id( |\$)" <<<"$conf")" || true
      [ "$n" = 0 ] && ok "AC-1b $id no DRIFT line" || bad "AC-1b $id no DRIFT line" "$n DRIFT line(s)"
      # AC-2a: the RED row, whole line, tab-separated, model field exactly opus.
      m="$(bash scripts/plan.sh models "$id")" || true
      n="$(grep -cx $'RED\ttest-developer\topus\t.*' <<<"$m")" || true
      [ "$n" = 1 ] && ok "AC-2a $id RED row is opus" || bad "AC-2a $id RED row is opus" "got: $(grep '^RED' <<<"$m" | cut -f1-3 | tr '\t' ' ')"
      # AC-2b: ## Model guidance rendered by plan.sh write, with an opus RED row.
      g="$(sec "$f" 'Model guidance')"
      a="$(grep -cx "Planned by \`bash scripts/plan.sh write $id\` from \`.claude/harness/models.conf\`." <<<"$g")" || true
      b="$(grep -cE '^\| RED \| `test-developer` \| `opus` \| ' <<<"$g")" || true
      [ "$a" = 1 ] && [ "$b" = 1 ] && ok "AC-2b $id Model guidance rendered, RED opus" \
        || bad "AC-2b $id Model guidance rendered, RED opus" "rendered-header=$a opus-RED-row=$b"
      # AC-2c: ## Notes has a paragraph whose first line starts at column 0 with
      # **RED model and carries 2026-09-30, and whose paragraph (to the next blank
      # line) names opus, unenforced and the user.
      p="$(sec "$f" Notes | awk 'index($0, "**RED model") == 1 && index($0, "2026-09-30") { on = 1 } on && /^[ \t]*$/ { exit } on { print }')"
      if [ -n "$p" ] && grep -q '`opus`' <<<"$p" && grep -q 'unenforced' <<<"$p" && grep -qi 'user' <<<"$p"
      then ok "AC-2c $id Notes records the RED-model decision"
      else bad "AC-2c $id Notes records the RED-model decision" "paragraph lines=$(printf '%s' "$p" | grep -c '')"; fi
    done
    [ "$fails" = 0 ]
    CHECK

**The output in RED**, on this branch at `64a24b3` plus the uncommitted
HARNESS-017.md edits. The exit status was 1:

    FAIL  AC-1a HARNESS-007 Writes == touches -- Writes=[] touches=[.claude/commands/plan-product.md .claude/skills/story-authoring/SKILL.md .claude/tests/plan.test.sh scripts/plan.sh]
    PASS  AC-1b HARNESS-007 no DRIFT line
    FAIL  AC-2a HARNESS-007 RED row is opus -- got: RED test-developer fable
    FAIL  AC-2b HARNESS-007 Model guidance rendered, RED opus -- rendered-header=0 opus-RED-row=0
    FAIL  AC-2c HARNESS-007 Notes records the RED-model decision -- paragraph lines=0
    FAIL  AC-1a HARNESS-009 Writes == touches -- Writes=[] touches=[.claude/agents/lead-po.md .claude/tests/plan.test.sh scripts/plan.sh]
    PASS  AC-1b HARNESS-009 no DRIFT line
    FAIL  AC-2a HARNESS-009 RED row is opus -- got: RED test-developer fable
    FAIL  AC-2b HARNESS-009 Model guidance rendered, RED opus -- rendered-header=0 opus-RED-row=0
    FAIL  AC-2c HARNESS-009 Notes records the RED-model decision -- paragraph lines=0
    exit=1

**Why each red is the right one:**
- **AC-1a**: `Writes=[]`. Neither Contract has a `**Writes:**` line. The
  `touches:` side reads correctly: 4 paths for 007, 3 for 009, which is exactly
  the lines the Contract says GREEN adds.
- **AC-2a**: `fable`. This is the settled baseline, read out rather than
  re-derived. It is `fable` because the prose fallback reads bare basenames
  that classify as `source`, so `unenforced` does not fire.
- **AC-2b**: 0 and 0. `## Model guidance` in both stories is still only the
  template comment, and `plan.sh write` has never been run on either.
- **AC-2c**: no paragraph. Neither `## Notes` records a RED-model decision.
- **AC-1b passes on arrival, and it is vacuous.** `story_drift` returns nothing
  for a Contract with no `**Writes:**` line (`plan.sh`, "has said nothing to
  disagree with"). The summary line agrees with the baseline: `5 conflict(s),
  0 pair(s) that could not be judged, 0 drift warning(s).` AC-1a is what stops
  that from passing vacuously in GREEN, because it requires a non-empty Writes
  line. AC-1b is earned by probes P1 and P2 below.

**Needle probes.** Each was run through `scripts/mutate.sh` on the real
`HARNESS-007.md`, which restores the file and verifies the restore. Every
restore printed `restored (verified byte-for-byte ...)`, and afterwards
`git status` shows 007 and 009 unmodified. The rest are direct `grep`s against
the real output or a line built with plan.sh's own `printf` format.

| # | Input | Check / needle | Expected | Measured |
|---|---|---|---|---|
| P1 | 007 Contract gains `**Writes:** \`scripts/plan.sh\`, \`scripts/phase.sh\`` (phase.sh is not in touches:) | conflicts prints `DRIFT     HARNESS-007   contract names scripts/phase.sh, touches: does not` and `... 1 drift warning(s).`; AC-1b 007 | FAIL | `FAIL  AC-1b HARNESS-007 no DRIFT line -- 1 DRIFT line(s)`. AC-1a also FAILs: `Writes=[scripts/phase.sh scripts/plan.sh]` |
| P2 | 007 Contract gains the Contract's planned 007 Writes line, exactly | AC-1a, AC-1b, AC-2a for 007 | PASS x3 | `PASS` x3; conflicts: `5 conflict(s), 0 pair(s) that could not be judged, 0 drift warning(s).` AC-2b/2c still FAIL, as they should |
| N1 | summary line `5 conflict(s), 0 pair(s) that could not be judged, 1 drift warning(s).` | DRIFT needle / floating `grep -ci drift` | 0 / 1 | 0 / 1 |
| N2 | `printf '%-9s %-13s %s'` DRIFT line for HARNESS-016, and for `HARNESS-0070` | DRIFT needle | 0, 0 | 0, 0 |
| N3 | real `plan.sh models HARNESS-007` today; and `RED\ttest-developer\tfable\tweaker than opus` | RED needle | 0, 0 | 0, 0 |
| N4 | HARNESS-017's own `## Model guidance`, which was rendered by `plan.sh write` | header needle (id HARNESS-017) / opus row needle | 1 / 1 | 1 / 1 |
| N5 | `` | RED | `test-developer` | `fable` | the measured case, not `opus` | `` | opus row needle | 0 | 0 |
| N6 | HARNESS-017's own `## Notes` item "2. The RED model for HARNESS-007 ..." | AC-2c paragraph extractor | empty | empty |
| P3 | 007 Notes gains `**RED model (decided by the user, 2026-09-30).** RED moves \`fable\` to \`opus\` via \`unenforced\`.` | AC-2c 007 | PASS | PASS |
| P4 | P3 without `via \`unenforced\`` | AC-2c 007 | FAIL | `FAIL ... paragraph lines=1` |
| P5 | P3 with date `2026-09-29` | AC-2c 007 | FAIL | `FAIL ... paragraph lines=0` |

All of these were measured in RED, locally. There is no framework and no
import, so every assertion above actually executed. None is only a claim.

**What GREEN writes, and the shape the checks pin.** These are facts, not
suggestions:
- `docs/backlog/stories/HARNESS-007.md`: in `## Contract`, one line starting at
  column 0 with `**Writes:**`, outside any HTML comment, whose backticked
  tokens are exactly `scripts/plan.sh`, `.claude/tests/plan.test.sh`,
  `.claude/commands/plan-product.md` and `.claude/skills/story-authoring/SKILL.md`.
  Order is free; the check sorts.
- `docs/backlog/stories/HARNESS-009.md`: the same, with exactly
  `.claude/agents/lead-po.md`, `scripts/plan.sh` and `.claude/tests/plan.test.sh`.
- In each, run `bash scripts/plan.sh write <id>`. The checks need its header
  line verbatim and the RED row with `` `opus` ``. Do not hand-write the table.
- In each `## Notes`, one paragraph (no blank line inside it). Its first line
  starts at column 0 with `**RED model` and contains `2026-09-30`. The
  paragraph contains `` `opus` `` in backticks, the word `unenforced`, and
  `user`.
- This story's own `## Handoff` / GREEN evidence: the same block, run again,
  with its green output pasted.

**What the checks do NOT constrain.** They leave these to the implementer:
where the Writes line sits inside `## Contract` (the Contract asks for first
prose line; nothing checks that), the rest of the Notes paragraph's wording,
and whether `touches:` order changes. Do not change `touches:` itself; the
Contract and `## Out of scope` forbid it, and AC-1a would still pass if both
sides moved together. That is a hole only review can see: AC-1a checks
agreement, not the planned values. Compare the diff of each frontmatter against
`main`, which should be empty.

**Things GREEN should know:**
- AC-2a alone would pass on a Writes line with the wrong set, provided every
  path on it is `harness`. P1 showed `PASS AC-2a` with `scripts/phase.sh` on
  the line. AC-1a is the check that pins the set.
- `plan.sh conflicts` should still read `5 conflict(s), 0 pair(s) that could
  not be judged, 0 drift warning(s).`, with `CONFLICT HARNESS-007 +
  HARNESS-009` present (Contract, "Not changed by this story"). This block does
  not check that. Paste the tail of `plan.sh conflicts` beside the green run.
- `bash scripts/gates.sh --fast` in RED: `All required gates passed (0 ran, 5
  unconfigured, 0 known)`. `BOOTSTRAPPED=no`, so no gate reads this story's
  artifact, as the Contract says.

**Files touched in RED:** `docs/backlog/stories/HARNESS-017.md` only, in
`## Contract` (an in-place amendment, with its reason), `## Test plan` and this
section. The probes mutated `HARNESS-007.md` through `mutate.sh`, and each
restore was verified.

**DV-1 is declined in RED.** It needs HARNESS-007's `**Writes:**` line to
exist so it can be removed, and in RED the line does not exist. Probe P2 is
its converse (adding the line moves RED to `opus`), not DV-1 itself. Removing
the shipped line and watching AC-2a return `fable` stays with its owner.
Owner: GATES.

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

    run:    2026-09-30T15:11:15Z
    commit: 1c72216 (working tree had uncommitted changes)
    tree:   ee0f14784792bcd27743aa5dc7f1268fc942d73b
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


**Decided at PLANNED (2026-09-30, lead-po):**
1. No test file (Contract, PO decision 1). A shipped suite cannot read this
   repository's backlog. The AC commands are the tests, run red in RED and
   green in GREEN, with the output pasted.
2. The RED model for HARNESS-007 and HARNESS-009: `opus`, via `unenforced`.
   The user decided it on 2026-09-30, when asked with the measured
   fable → opus move in front of them.
3. Required gate: none configured (`BOOTSTRAPPED=no`). The docs-only diff
   touches nothing under `.claude/`, `scripts/` or `.github/`, so
   `.claude/harness/VERSION` needs no bump. HARNESS-016's missed bump does not
   apply here.
4. Epic: none, so there is no done-when to check.

**DONE, 2026-09-30.** Merged in #88 (merge commit 6410ce9). PR CI: the `gates`
job passed in 1m26s, with the harness self-test step taking 72s against
`timeout-minutes: 45`
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/36739416532).
`boundaries` passed in 6s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/36739416449).
The diff is docs only, so the harness VERSION was not bumped.
