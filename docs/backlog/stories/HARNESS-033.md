---
id: HARNESS-033
title: Criteria freeze at the last committed PLANNED state, not the base branch
slug: criteria-freeze-at-the-last-committed-pl
epic: 
type: fix
status: done
phase: DONE
branch: story/HARNESS-033-criteria-freeze-at-the-last-committed-pl
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [scripts/check-boundaries.sh, .claude/tests/boundaries.test.sh, .claude/tests/sigpipe.test.sh, .claude/commands/advance-story.md, .claude/harness/rules.md, .claude/skills/story-authoring/reference/sections.md, scripts/new-story.sh, .claude/tests/floors.conf, .claude/tests/selftest.test.sh]         # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

<!-- Why this story exists. Link the epic and any wiki pages that constrain it.
     Name the REQUIRED gate that would fail if this story's artifact broke. If
     only an optional gate can, put it in required_gates above before RED:
     every required gate once passed over a story none of them exercised. -->

This story is finding B of group 6, "Process", in
`docs/wiki/audits/manga-translator-port-2026-10-02.md` (GitHub issue #97). The
audit's `## Decided` item 6 B is settled and is not reopened here:
**check-boundaries 3d freezes criteria against the base branch in every phase,
contradicting law 6 and `advance-story.md`. Fix the *check*: baseline the
criteria at the story's last committed PLANNED state in the branch, else the
base.** This story implements it.

**The field evidence (issue #97, finding B).** In manga-translator, MT-019 and
MT-065 were filed and merged to `main` at PLANNED, then refined on their own
branches before RED. `advance-story.md` calls PLANNED "the last phase in which
[criteria] may change without an `## Amendments` entry", but
`check-boundaries.sh` 3d compares the criteria with the base branch whatever the
phase, so both PRs failed until an Amendments entry was written for a change the
law permits.

**Verified at PLANNED against this tree (release 75, `c7c902f`):**

- `scripts/check-boundaries.sh:301-303` is the 3d comment, and it says the
  quiet part: "any difference from the base branch needs an ## Amendments
  entry, whatever phase the edit was made in. CI cannot see when in the
  branch's history an edit happened, only that it did." The second sentence is
  false: CI checks out with `fetch-depth: 0` (`.github/workflows/boundaries.yml:17`),
  and the per-commit RED manifest check at `:539-540` already walks
  `git rev-list "$BASE"..HEAD` reading the committed phase of every commit.
- `:304-316` is the block. `:312` is the refusal, which itself says "Criteria
  are frozen once a story leaves PLANNED" - the rule the block does not
  implement. `:315` is the skip note for a story new in the PR: "story file is
  new in this PR; nothing to freeze the criteria against". That skip is a second
  hole the same design leaves: a story that is new in its PR, which is every
  story this repository has run (HARNESS-032's file first appears in its RED
  commit `a947567`), has no criteria freeze at all, in any phase.
- `.claude/tests/boundaries.test.sh:205-221` is the only 3d test: base has the
  story at PLANNED, the branch commits it at REVIEW with a changed AC, and it is
  refused with `## Acceptance criteria differ from main`. It stays green.

**The audit's constraint, from "What would have to be true for this to be
wrong":** the fix trusts the committed frontmatter's phase per commit, so a
branch that flips back to PLANNED after RED must not move the baseline. The
definition in C-1 makes that structural: the baseline is fixed by the *first*
departure from PLANNED, and nothing later is consulted.

**The required gate that fails if this breaks:** `selftest`, through
`boundaries.test.sh`. No optional gate is involved; `required_gates` stays empty.

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC.
     An AC that names a statistic, a metric or a threshold names a NEGATIVE
     CONTROL too: the deliberately broken input the metric must reject, and
     roughly what it should score. A criterion can be perfectly testable and
     still be blind to the defect it exists to catch, and that is more
     dangerous than a vague one - it survives review and goes green. -->

Every criterion is observed by running `bash scripts/check-boundaries.sh
<base>` in a real two-branch fixture repository, as `boundaries.test.sh` already
does. "Accepted" means: the output contains **no** line starting `FAIL  story
<id>: ## Acceptance criteria differ from`, and **does** contain the exact `ok`
or `note` line the criterion names. It never means exit 0, because these
fixture stories carry no `## Gate results` and 3e refuses them for that. The
messages are pinned byte for byte in C-2. `<sha7>` is the first seven
characters of the full commit id (not `git rev-parse --short`, which can be
longer).

- **AC-1 (the field case)** — Given the base branch holds the story at
  `phase: PLANNED` with criteria v1, and the story branch commits it at
  PLANNED with criteria v2, then at RED, then at REVIEW, all with v2 and no
  `## Amendments`, check-boundaries accepts the criteria and prints
  `ok    acceptance criteria unchanged since the last committed PLANNED state (<sha7>)`
  naming the branch's PLANNED commit. *Control:* today's check refuses this
  history with `## Acceptance criteria differ from main`.
- **AC-2 (a flip back cannot move the baseline)** — Given a story new in the
  PR committed at PLANNED (v1), RED (v1), PLANNED again (v2), RED (v2), REVIEW
  (v2), with no `## Amendments`, check-boundaries refuses with
  `## Acceptance criteria differ from the last committed PLANNED state (<sha7>)`
  naming the **first** PLANNED commit, not the second. And given the base
  branch already holds the story at RED with v1, a branch that commits it at
  PLANNED with v2 and then at REVIEW is refused with
  `## Acceptance criteria differ from main`.
- **AC-3 (else the base)** — Given the base holds the story at PLANNED with v1
  and the branch's first commit of it is already at RED with v2 (the refinement
  was never committed at PLANNED), check-boundaries refuses with
  `## Acceptance criteria differ from main`. The existing test at
  `boundaries.test.sh:205-221` is this case at REVIEW and stays green.
- **AC-4 (a story new in the PR)** — (a) committed at PLANNED v1, PLANNED v2,
  RED v2, REVIEW v2: accepted, with the `ok` line naming the second PLANNED
  commit. (b) first committed at RED v1, then REVIEW v2, no `## Amendments`:
  refused with
  `## Acceptance criteria differ from the first commit that left PLANNED (<sha7>)`
  naming the RED commit, where today it is skipped. (c) first committed at RED
  v1, then REVIEW v1: accepted with
  `ok    acceptance criteria unchanged since the first commit that left PLANNED (<sha7>)`.
  (d) every committed state and the working tree at PLANNED: the note
  `story <id> has not left PLANNED in any committed state; its criteria are not frozen yet`
  and no criteria refusal.
- **AC-5 (the escape hatch still works)** — The refused histories of AC-2's
  first case and AC-4(b), each with a non-empty `## Amendments` section, print
  `ok    acceptance criteria changed, with an ## Amendments entry` and no
  criteria refusal.
- **AC-6 (no history to walk)** — Given a base ref with which `HEAD` has no
  merge base (a depth-1 clone, or unrelated history), and the base holding the
  story at PLANNED v1 while the branch commits PLANNED v2 then REVIEW v2,
  check-boundaries prints the note
  `no merge base with <base>, so the branch's history cannot be walked; criteria compared with <base> itself`
  and refuses with `## Acceptance criteria differ from <base>`, which is
  today's behaviour. *Control:* the same history with a merge base is AC-1,
  accepted.
- **AC-7 (the procedure says to commit at PLANNED)** — In the real
  `.claude/commands/advance-story.md`, the text between `Create and switch to
  the story's branch` and the first `Set the phase;` after it contains
  ``while it still says `phase: PLANNED` ``. *Control:* today's file does not,
  so the assertion fails in RED.
- **AC-8 (the suite and its floors)** — A full `bash scripts/selftest.sh`
  passes. `floors.conf` and `selftest.test.sh`'s `COUNTS` row raise
  `boundaries` from 79 to the count executed after RED. `sigpipe.test.sh`'s C-5
  pins on `scripts/check-boundaries.sh` name the lines where those three
  statements now are, and its freshness assertion stays green.
  `bash scripts/check-sigpipe.sh` and `bash scripts/check-grep-count.sh` stay
  clean over the tree.

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

**Writes:** `scripts/check-boundaries.sh`, `.claude/tests/boundaries.test.sh`, `.claude/tests/sigpipe.test.sh`, `.claude/commands/advance-story.md`, `.claude/harness/rules.md`, `.claude/skills/story-authoring/reference/sections.md`, `scripts/new-story.sh`, `.claude/tests/floors.conf`, `.claude/tests/selftest.test.sh`

**RED may amend any block below in place, with a reason. GREEN builds what the
amended block says.**

**The phase lock enforces nothing here.** At PLANNED, `bash scripts/classify.sh`
returned `harness` for `scripts/check-boundaries.sh`,
`.claude/tests/boundaries.test.sh`, `.claude/tests/sigpipe.test.sh` and
`.claude/commands/advance-story.md`; the other paths are in the same
directories. So the split is held by discipline, as in HARNESS-030 and
HARNESS-032:

- **RED** writes only `boundaries.test.sh` and the two `boundaries` floor lines
  (`floors.conf`, `selftest.test.sh` `COUNTS`).
- **GREEN** writes `check-boundaries.sh`, `advance-story.md`, `rules.md`,
  `sections.md`, `new-story.sh`, and the three line pins in `sigpipe.test.sh`
  (C-5). The pins are a fixture that tracks where a source line sits, not an
  assertion; HARNESS-030 C-5 gave the same pin update to GREEN.

### C-1 The baseline, defined

A new function in `scripts/check-boundaries.sh`, defined above 3d with the
other helpers or immediately before the 3d block:

```
criteria_baseline <story-file>      # prints exactly one line: <kind> <rev>
```

It reads the global `$BASE`. `<rev>` is a full commit id, the literal `$BASE`
ref, or `-`.

**The states.** An ordered list of the story file's states, oldest first:

1. **the base copy**, `git show "$BASE:<story-file>"`, if it exists there;
2. **each commit of** `git rev-list --reverse --topo-order "$BASE"..HEAD` in
   which the story file exists (commits where it is absent are skipped). Not
   path-limited, and not `--first-parent`: in CI `HEAD` is a merge commit whose
   first parent is the base, so `--first-parent` would skip every branch
   commit;
3. **the working tree's copy**, last. In CI it equals `HEAD`; locally it is what
   the rest of the script already reads (3b reads the phase from it).

**The phase of a state** is the `phase:` frontmatter value of that copy, read
with `frontmatter_value` (`lib.sh:1152`) with every whitespace character removed
(`${ph//[[:space:]]/}`), because a Windows checkout can leave a `\r`. An empty
or unreadable phase counts as *not* PLANNED, which can only make the freeze
earlier, never later.

**F** is the first state whose phase is not `PLANNED`.

| Condition | Prints | Meaning |
|---|---|---|
| `git merge-base "$BASE" HEAD` fails, base copy exists | `unwalked <BASE>` | history cannot be walked (depth-1 clone, unrelated history); compare with the base, as today |
| `git merge-base` fails, no base copy | `none -` | nothing to compare with |
| no state has a non-PLANNED phase | `open -` | the story has not left PLANNED; nothing is frozen yet |
| F has a state before it, and that state is a branch commit | `planned <sha>` | the last committed PLANNED state |
| F has a state before it, and that state is the base copy | `base <BASE>` | the branch never committed the story at PLANNED: "else the base" |
| F is the first state and is the base copy | `base <BASE>` | the story had already left PLANNED on the base |
| F is the first state and is a branch commit | `first <sha>` | new in the PR, first committed outside PLANNED |
| F is the first state and is the working tree | `none -` | no committed state at all |

Every state before F is PLANNED by definition of F, so "the last committed
PLANNED state" is simply the state immediately before F. **Nothing after F is
read**, which is what makes the audit's constraint hold: a later return to
PLANNED, edited or not, cannot move the baseline.

**Why `first` (the decision the audit left open).** A story new in its PR whose
first commit is already outside PLANNED has no committed PLANNED state and no
base copy. Three answers were possible:

- *skip, as today:* leaves the criteria of every new-in-PR story editable in
  GREEN and GATES without a trace. That is every story this repository has run,
  so the skip is not an edge case, it is the common case. Rejected.
- *refuse:* there is nothing to have changed against, so a refusal would have no
  diff to show. Rejected.
- *freeze at that first commit:* chosen. It is the earliest committed record of
  the criteria after they left PLANNED. Edits made before it are
  indistinguishable from PLANNED edits, because the PLANNED → RED transition
  happens in the working tree before anything is committed, so treating them as
  PLANNED edits is the only reading the history supports. Every later change
  needs `## Amendments`, which is law 6. It is the same rule as "else the base",
  applied to the one committed copy that exists.

**Why the base copy, not the merge-base copy.** 3d already compares with
`$BASE` (the tip), and its refusal text says `differ from main`. Keeping the tip
keeps AC-3's existing needle and every message about the base unchanged. The
merge-base is used only to decide whether the history can be walked.

**No pipeline into an early-exiting reader.** Read each committed copy into a
variable first, `txt="$(git show "$rev:$sfile" 2>/dev/null)"`, then feed it
with a here-string: `frontmatter_value - <<< "$txt"`, `section - <<< "$txt"`.
The existing `git show "$BASE:$sfile" | section - ...` at `:305` is that
pipeline (`section`'s awk exits at the next heading), and it goes. HARNESS-029
and the `has_content` comment at `:52-69` say why. Keep `check-sigpipe.sh` and
`check-grep-count.sh` clean.

**Portability.** bash, awk and git only. POSIX awk: no intervals, no `\d`, no
backreferences, no `length(array)` (HARNESS-025 and HARNESS-028: a Linux-only
awk difference passed every local run once). The commit loop costs one `git
show` and no other process per commit; a PR has a handful.

### C-2 The 3d block and its messages

The 3d block obtains the baseline on **exactly this line, at column 0**, so that
DV-1's one sed expression can put the old defect back:

```
crit_base="$(criteria_baseline "$sfile")"
```

then splits it into kind and rev (e.g. `crit_kind="${crit_base%% *}"`,
`crit_rev="${crit_base#* }"`). Labels:

| kind | `<label>` |
|---|---|
| `planned` | `the last committed PLANNED state (<sha7>)` |
| `first` | `the first commit that left PLANNED (<sha7>)` |
| `base`, `unwalked` | `$BASE` (as passed: `main` in the fixture, `origin/main` in CI) |

Lines, byte for byte (`ok` and `FAIL` carry the script's existing prefixes,
`ok    ` and `FAIL  `; `note` is two spaces):

- `unwalked` first prints the note
  `no merge base with $BASE, so the branch's history cannot be walked; criteria compared with $BASE itself`,
  then compares as `base`.
- `open`: note
  `story $sid has not left PLANNED in any committed state; its criteria are not frozen yet`
- `none`: note `story file is new in this PR; nothing to freeze the criteria against`
  (today's `:315` text, kept). The same note is printed for kind `base` or
  `unwalked` when `$BASE:$sfile` does not exist. `criteria_baseline` never
  returns that combination, but DV-1's mutation does, and with this clause the
  mutated script is exactly today's 3d, so DV-1 puts back the real defect and
  not a new one.
- unchanged: `ok "acceptance criteria unchanged since <label>"`
- changed, `## Amendments` has content: `ok "acceptance criteria changed, with an ## Amendments entry"` (unchanged from `:310`)
- changed, no amendments:
  `problem "story $sid: ## Acceptance criteria differ from <label> with no ## Amendments entry. Criteria are frozen once a story leaves PLANNED, against the last state committed while it was PLANNED (else the base branch); record which AC changed, what it said, what it says now, who approved it and why."`

"Unchanged" keeps today's comparison exactly: `section ... "Acceptance criteria"`
on both sides with trailing whitespace stripped (`sed 's/[[:space:]]*$//'`, as
at `:305-306`, or an awk equivalent).

The 3d comment at `:301-303` is rewritten: it must no longer say "whatever phase
the edit was made in" or that CI cannot see when an edit happened. One or two
lines naming the rule and pointing at `criteria_baseline`.

### C-3 The tests: `.claude/tests/boundaries.test.sh`

- A new `describe` block (or blocks) after the existing "acceptance criteria are
  frozen" block at `:205-221`, which stays as it is.
- Build each history commit by commit in the existing `$FIX`, with
  `commit_all` (`:64`) after each state. A helper such as
  `history_story <id> <base-spec|-> <PHASE:criteria-text>...` that resets a
  `story/<id>-fixture` branch from `main` is suggested, not required. Use a
  **fresh story id per case** (e.g. `T-31`...): `main` already carries `T-1` at
  PLANNED from `:210-213`, and a case that needs "new in the PR" must not find
  its id there. A case that needs a base copy commits it on `main` first.
- The story's `branch:` frontmatter must match the fixture branch, or 3c
  refuses, and `sid` resolution (`:197-214`) reads the story id from that branch name.
- `sha7` in a needle is computed from the commit just made:
  `c="$(git -C "$FIX" rev-parse HEAD)"; c7="${c:0:7}"`.
- **Acceptance** is asserted as two claims: the criteria `FAIL` line is absent
  (`assert_not_contains` with needle `## Acceptance criteria differ from`), and
  the exact `ok`/`note` line is present. **Refusal** uses the existing
  `refused` helper (`:41`) with the full `differ from <label>` needle, which
  checks the message; its `rc != 0` half is weak here (3e also refuses), so the
  message is the claim that matters.
- AC-6: `run_boundaries` hard-codes `main` (`:33`). Add a variant that takes the
  base ref. The unwalkable base can be an orphan branch (`git checkout
  --orphan`) holding the story at PLANNED v1, or a `git clone --depth 1
  --no-single-branch "file://$FIX"` with `GITHUB_HEAD_REF` set to the story
  branch and base `origin/main`. Both make `git merge-base` fail; the orphan is
  faster on Windows. RED chooses and says which.
- AC-7: read the real file with `$(< "$REPO_ROOT/.claude/commands/advance-story.md")`,
  cut the text after the first `Create and switch to the story's branch` and
  before the first `Set the phase;` after it with parameter expansion, and
  assert it contains ``while it still says `phase: PLANNED` ``. Pure bash, no
  fork. This assertion lives here rather than in `procedure.test.sh` because
  that suite builds every fixture by construction (`write_advance`, `:256`) and
  a new rule there would need the sentence in every fixture; here it is one
  assertion over the real file.
- Each AC's assertions name the AC in their description (`AC-1: ...`).
- Leave `assert_not_contains ... "touches"` at the end of the file alone.

### C-4 The procedure: `.claude/commands/advance-story.md`

In the paragraph that begins `Create and switch to the story's branch` (today
line 77), insert this sentence immediately before `Set the phase;`:

> Before setting the phase, commit the story file on that branch while it still
> says `phase: PLANNED`: `check-boundaries.sh` freezes the criteria at the last
> state committed at PLANNED, so a refinement first committed together with RED
> is compared with the base branch instead and needs an `## Amendments` entry.

Line 18-20's sentence ("the last phase in which they may change without an
`## Amendments` entry") is left as it is; with C-4 it becomes true.
`policy.test.sh`, `reporting.test.sh` and `procedure.test.sh` read this file and
must stay green.

### C-5 Line pins in `sigpipe.test.sh`

`.claude/tests/sigpipe.test.sh:561-563` pins three status-discarded lines of
`scripts/check-boundaries.sh`, all below 3d, so all three move:

- `scripts/check-boundaries.sh:326:res=$(printf`
- `scripts/check-boundaries.sh:365:rec=$(printf`
- `scripts/check-boundaries.sh:540:ph_at="$(git show`

GREEN updates the three numbers to wherever those statements land. Nothing else
in that suite changes; its comments citing `check-boundaries.sh:323` and `:382`
(`:1114`, `:1161`) are prose and are left. The C-5 freshness assertion ("all
twelve status-discarded lines are still where this suite says they are") is the
check. If `criteria_baseline` adds a status-discarding `$(...)` of its own,
the guard decides whether it needs a pin; do not add one by hand.

### C-6 Wording elsewhere

Three places state the old rule as "a PR whose criteria differ from the base
branch". Each becomes "differ from their last committed PLANNED state (else the
base branch)", or equivalent wording:

- `.claude/harness/rules.md:287-288`
- `scripts/new-story.sh:134-135` (the `## Amendments` template comment)
- `.claude/skills/story-authoring/reference/sections.md:72-73`

### C-7 Floors

`boundaries` executes 82 assertions at `c7c902f` (`bash scripts/selftest.sh
boundaries` at PLANNED: `boundaries: 82 passed, 0 failed`), against a floor of
79. RED raises the floor to the count it measures after its tests are written,
in both `.claude/tests/floors.conf:39` and the `COUNTS` row
`selftest.test.sh:520`, and pastes the summary line.

### C-8 Oracle partition

- **Settled** (read out, do not re-derive): the baseline rule itself, from the
  audit's `## Decided` 6 B and its constraint; and the `first` decision in C-1,
  made here. RED does not reopen either.
- **Mechanical** (pin exactly): every message in C-2, the kinds in C-1, the AC-7
  sentence. Everything in this story is mechanical; there is no metric.
- **Oracle-free:** none.

### C-9 Callers

No existing function changes its signature. `section`, `frontmatter_value` and
`story_field` gain new callers only. The 3d messages are read by
`boundaries.test.sh:221` (`## Acceptance criteria differ from main`, still
printed for kind `base`) and by nothing else: `rg "nothing to freeze|differ
from"` over `.claude/tests` and `scripts` at PLANNED found only that line and
the script itself.

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

**DV-1 (defect put back).** Use `scripts/mutate.sh` to make 3d compare with the
base branch again, unconditionally, which is the field defect itself. C-2 pins
the line this expression matches, and C-2's `none` clause makes the mutated 3d
behave exactly like today's. Run the one suite that holds the assertions:

```
bash scripts/mutate.sh scripts/check-boundaries.sh 's|^crit_base="$(criteria_baseline "$sfile")"$|crit_base="base $BASE"|' -- bash scripts/selftest.sh boundaries
```

**Must** fail: AC-1's acceptance (the field history is refused with
`differ from main`), AC-2's first case, AC-4 (a) to (d), both AC-5 cases (a new
story gets the "nothing to freeze" note instead of the amendments `ok`), and
AC-6's note. **Must** still pass: AC-2's second case, AC-3 (including
`:205-221`), AC-7, and every assertion that existed before this story. RED
records in the handoff the exact count it predicts; GATES compares the measured
`boundaries: N passed, M failed` with it. `mutate.sh` must report that it
restored the file and verified the restore, and the suite must be green again
afterwards.

RED cannot run this: in RED the line does not exist, so there is nothing to put
the defect back into. The expression was checked at PLANNED against C-2's line
in a scratch file: it replaces that line and nothing else. Run it detached
(`nohup`, or the Bash tool's `run_in_background`); the suite took 256 s here at
PLANNED. **Owner: GATES.**

**DV-2 (probe against a real line of the tree).** 3d is a rule over the real
repository's story histories, so it is probed on one, not only on fixtures.
HARNESS-032's branch is a real new-in-PR story whose file first appears in its
RED commit: `a947567` (RED), `1e13357` (GREEN), `95e22c7` (REVIEW), branched
from `f9ab433`. Its criteria are identical across the three commits (checked at
PLANNED). In a scratch worktree, never this one:

```
git worktree add --detach <scratch>/h032 95e22c7
cp scripts/check-boundaries.sh <scratch>/h032/scripts/check-boundaries.sh
cd <scratch>/h032
GITHUB_HEAD_REF=story/HARNESS-032-the-full-self-test-runs-before-a-story-r PR_HEAD_SHA= bash scripts/check-boundaries.sh f9ab433
bash scripts/mutate.sh docs/backlog/stories/HARNESS-032.md 's/^- \*\*AC-4\*\* /- **AC-4** (probe) /' -- env GITHUB_HEAD_REF=story/HARNESS-032-the-full-self-test-runs-before-a-story-r PR_HEAD_SHA= bash scripts/check-boundaries.sh f9ab433
```

The first run **must** print
`ok    acceptance criteria unchanged since the first commit that left PLANNED (a947567)`,
where today's script prints the "nothing to freeze" note. The mutated run
**must** print
`FAIL  story HARNESS-032: ## Acceptance criteria differ from the first commit that left PLANNED (a947567) with no ## Amendments entry.`
followed by the rest of C-2's text. HARNESS-032's `## Amendments` holds only the
template comment, so it does not excuse the change. Judge by those lines, not by
exit status: the copied script makes the scratch tree differ from its gate record, so other checks may refuse it for reasons that have nothing to do with 3d. Paste both
lines and `mutate.sh`'s restore report, then `git worktree remove --force` the
scratch tree. **Owner: GATES.**

### Results, run at GATES (2026-10-05) by the orchestrator

Both through `scripts/mutate.sh` with the one expression written above, detached, one at a time, against the GREEN commit. Passing lines elided.

**DV-1, the defect put back: `boundaries: 91 passed, 10 failed`, exactly the handoff's prediction.** The ten are the new-behaviour assertions other than AC-7; AC-2's second case, AC-3 (with `:205-221`), AC-7 and all 82 earlier assertions stayed green.

```
=== mutate: scripts/check-boundaries.sh (1 line(s) changed by s|^crit_base="$(criteria_baseline "$sfile")"$|crit_base="base $BASE"|) ===
  355 - crit_base="$(criteria_baseline "$sfile")"
  355 + crit_base="base $BASE"
=== mutate: running bash scripts/selftest.sh boundaries ===
  acceptance criteria are frozen
    FAIL AC-1: a refinement committed at PLANNED on the branch is not refused
         expected NOT to contain: ## Acceptance criteria differ from
         FAIL  story T-31: ## Acceptance criteria differ from main with no ## Amendments entry. Criteria are frozen once a story leaves PLANNED, against the last state committed while it was PLANNED (else the base branch); record which AC changed, what it said, what it says now, who approved it and why.
    FAIL AC-1: the criteria are judged against the branch's PLANNED commit
         expected to contain: ok    acceptance criteria unchanged since the last committed PLANNED state (fc6131b)
         FAIL  story T-31: ## Acceptance criteria differ from main with no ## Amendments entry. Criteria are frozen once a story leaves PLANNED, against the last state committed while it was PLANNED (else the base branch); record which AC changed, what it said, what it says now, who approved it and why.
    FAIL AC-2: a flip back to PLANNED is refused against the FIRST PLANNED commit, not the second
         expected a refusal saying: ## Acceptance criteria differ from the last committed PLANNED state (4e44f21)
    FAIL AC-4a: a new story is judged against its LAST PLANNED commit
         expected to contain: ok    acceptance criteria unchanged since the last committed PLANNED state (f854ac5)
    FAIL AC-4b: a new story first committed at RED is frozen at that commit
         expected a refusal saying: ## Acceptance criteria differ from the first commit that left PLANNED (8272369)
    FAIL AC-4c: and is reported unchanged since the first commit that left PLANNED
         expected to contain: ok    acceptance criteria unchanged since the first commit that left PLANNED (73a560e)
    FAIL AC-4d: and says its criteria are not frozen yet
    FAIL AC-5: the flip-back history is accepted on its ## Amendments entry
         expected to contain: ok    acceptance criteria changed, with an ## Amendments entry
    FAIL AC-5: a first-committed-at-RED change is accepted on its ## Amendments entry
         expected to contain: ok    acceptance criteria changed, with an ## Amendments entry
    FAIL AC-6: with no merge base the check says the history cannot be walked
         FAIL  story T-39: ## Acceptance criteria differ from unrelated-T-39 with no ## Amendments entry. Criteria are frozen once a story leaves PLANNED, against the last state committed while it was PLANNED (else the base branch); record which AC changed, what it said, what it says now, who approved it and why.
boundaries: 91 passed, 10 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /d/agentic-dev-harness/.claude/worktrees/nostalgic-williams-fcf700/.claude/state/mutations/scripts_check-boundaries.sh.20261005T165456Z.1478.bak) ===
```

**DV-2, the probe against HARNESS-032's real branch: both lines as required.** The scratch worktree was removed afterwards.

```
--- unmutated
ok    acceptance criteria unchanged since the first commit that left PLANNED (a947567)
--- mutated
=== mutate: docs/backlog/stories/HARNESS-032.md (1 line(s) changed by s/^- \*\*AC-4\*\* /- **AC-4** (probe) /) ===
  155 - - **AC-4** — complete-story.md's `- **GATES → REVIEW` bullet names
  155 + - **AC-4** (probe) — complete-story.md's `- **GATES → REVIEW` bullet names
=== mutate: running env GITHUB_HEAD_REF=story/HARNESS-032-the-full-self-test-runs-before-a-story-r PR_HEAD_SHA= bash scripts/check-boundaries.sh f9ab433 ===
FAIL  story HARNESS-032: ## Acceptance criteria differ from the first commit that left PLANNED (a947567) with no ## Amendments entry. Criteria are frozen once a story leaves PLANNED, against the last state committed while it was PLANNED (else the base branch); record which AC changed, what it said, what it says now, who approved it and why.
=== mutate: command exited 1; restored (verified byte-for-byte against /tmp/claude/D--agentic-dev-harness--claude-worktrees-nostalgic-williams-fcf700/62196ff3-22ca-4509-8ec9-310ab8c7b7f8/scratchpad/h032/.claude/state/mutations/docs_backlog_stories_HARNESS-032.md.20261005T165806Z.12202.bak) ===
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

Planned by `bash scripts/plan.sh write HARNESS-033` from `.claude/harness/models.conf`.
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

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->

- PLANNED, `lead-po`, resolved to Opus 5.5 (`claude-opus-5-5`), dispatched without a model override.
- RED, `test-developer`, resolved to Opus 5.5 (`claude-opus-5-5`), as planned; no override. Orchestrator re-ran boundaries: 90 passed, 11 failed, matching the handoff.
- GREEN, `feature-developer`, resolved to Opus 5.5 (`claude-opus-5-5`), as planned; no override. Orchestrator read the check-boundaries.sh diff.
- GATES: no dispatch. The orchestrator (`claude-opus-5-5`) ran DV-1, DV-2, `gates.sh` and the full selftest itself.
## Out of scope

<!-- Explicit non-goals. Prevents the Feature Developer from over-building. -->

- **The other checks in `check-boundaries.sh`.** Only 3d changes. 3b, 3e-3h and
  the RED manifest walk at `:536-566` are untouched, apart from moving down the
  file.
- **Changing the workflow.** `.github/workflows/boundaries.yml` already checks
  out with `fetch-depth: 0`. AC-6 makes a shallow checkout degrade to today's
  behaviour; it does not change any workflow.
- **Other loose descriptions of 3d.** `CLAUDE.md:178`,
  `.claude/skills/quality-gates/SKILL.md:25` and `scripts/gates.sh:997` say
  "the acceptance criteria against the base branch" as a summary of what CI
  checks. They stay. `gates.sh` especially: `sigpipe.test.sh` pins its line
  numbers and nothing here needs to move them.
- **`complete-story.md`.** It defers the per-phase procedure to
  `advance-story.md`, so C-4's sentence lives in one place.
- **Re-baselining historical stories, or making a PLANNED commit mandatory.**
  Nothing refuses a branch that never committed the story at PLANNED: it falls
  back to the base (AC-3), which is the conservative direction. C-4 tells the
  orchestrator how to get the benefit; it is not enforced.
- **Groups 6 C and 6 D of the audit** (the run lock and `SELFTEST_JOBS`, the
  3g/3h messages). Separate stories.
- **Stale prose line references** in `sigpipe.test.sh` comments
  (`check-boundaries.sh:323`, `:382`). Only the C-5 freshness pins are updated.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

<!-- Filled by the Test Developer during RED: which tests, at which level,
     and which AC each one covers. -->

All tests are integration-level, in `.claude/tests/boundaries.test.sh`, in
one new `describe "criteria freeze at the last committed PLANNED state
(HARNESS-033)"` directly after the untouched `:205-221` block. Each case
builds a real history in `$FIX`, commit by commit, under a fresh story id
(`T-31`..`T-39`), and runs the real `scripts/check-boundaries.sh`. Base
copies are committed on `main`; the block saves `main`'s sha first and
`reset --hard`s back to it at the end, so nothing after the block sees them.
AC-7 is one pure-bash assertion over the real `advance-story.md`.

| # | Assertion (description in the suite) | AC | RED today |
|---|---|---|---|
| 1 | `AC-1: a refinement committed at PLANNED on the branch is not refused` - no `## Acceptance criteria differ from` | AC-1 | FAIL (refused `differ from main`) |
| 2 | `AC-1: the criteria are judged against the branch's PLANNED commit` - `ok    acceptance criteria unchanged since the last committed PLANNED state (<p7>)` | AC-1 | FAIL |
| 3 | `AC-2: a flip back to PLANNED is refused against the FIRST PLANNED commit, not the second` - `refused` with `differ from the last committed PLANNED state (<first p7>)` | AC-2 | FAIL (skip note) |
| 4 | `AC-2: a story already past PLANNED on main cannot be reopened by a PLANNED commit on the branch` - `refused` `## Acceptance criteria differ from main` | AC-2 (2nd case) | pass - control |
| 5 | `AC-3: a refinement first committed at RED is compared with main` - `refused` `## Acceptance criteria differ from main` | AC-3 | pass - control |
| 6 | `AC-4a: a new story refined while PLANNED is not refused` | AC-4(a) | pass (today's skip) |
| 7 | `AC-4a: a new story is judged against its LAST PLANNED commit` - `ok ... last committed PLANNED state (<2nd p7>)` | AC-4(a) | FAIL |
| 8 | `AC-4b: a new story first committed at RED is frozen at that commit` - `refused` `differ from the first commit that left PLANNED (<r7>)` | AC-4(b) | FAIL (skip note) |
| 9 | `AC-4c: a new story whose criteria never changed after RED is not refused` | AC-4(c) | pass (today's skip) |
| 10 | `AC-4c: and is reported unchanged since the first commit that left PLANNED` - `ok ... first commit that left PLANNED (<r7>)` | AC-4(c) | FAIL |
| 11 | `AC-4d: a story that never left PLANNED has no criteria refusal` | AC-4(d) | pass (today's skip) |
| 12 | `AC-4d: and says its criteria are not frozen yet` - note `  story T-38 has not left PLANNED in any committed state; its criteria are not frozen yet` | AC-4(d) | FAIL |
| 13 | `AC-5: the flip-back history with an ## Amendments entry is not refused` | AC-5 | pass (today's skip) |
| 14 | `AC-5: the flip-back history is accepted on its ## Amendments entry` - `ok    acceptance criteria changed, with an ## Amendments entry` | AC-5 | FAIL |
| 15 | `AC-5: a first-committed-at-RED change with an ## Amendments entry is not refused` | AC-5 | pass (today's skip) |
| 16 | `AC-5: a first-committed-at-RED change is accepted on its ## Amendments entry` | AC-5 | FAIL |
| 17 | `AC-6: with no merge base the check says the history cannot be walked` - note `  no merge base with unrelated-T-39, so the branch's history cannot be walked; criteria compared with unrelated-T-39 itself` | AC-6 | FAIL |
| 18 | `AC-6: and falls back to comparing with the base itself, as before` - `refused` `## Acceptance criteria differ from unrelated-T-39` | AC-6 | pass - today's behaviour, kept |
| 19 | `AC-7: advance-story.md says to commit the story while it is still PLANNED, before setting the phase` | AC-7 | FAIL |

AC-6's control ("the same history with a merge base is accepted") is
assertions 1-2: AC-1 is that history. AC-8 is the floor raise (79 -> 101 in
`floors.conf:39` and `selftest.test.sh:520`) plus the full self-test and the
two tree guards, which GREEN/GATES run.

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

**RED, 2026-10-05, `test-developer`, ran on Opus 5.5 (`claude-opus-5-5`), no
model override in the dispatch.**

**Command.** `bash scripts/selftest.sh boundaries` (or directly
`bash .claude/tests/boundaries.test.sh`). About 4-5 minutes on this Windows
host; run it detached.

**Measured in RED (local run, this host, `check-boundaries.sh` and
`advance-story.md` unchanged):** `boundaries: 90 passed, 11 failed` - **101
executed** (82 before + 19 new). Every failure is in the new block; all 82
pre-existing assertions pass, including `:205-221`. Verbatim, abridged to the
failure header plus the line that decides it (the full haystacks are the
whole check-boundaries output):

```
  criteria freeze at the last committed PLANNED state (HARNESS-033)
    FAIL AC-1: a refinement committed at PLANNED on the branch is not refused
         expected NOT to contain: ## Acceptance criteria differ from
         FAIL  story T-31: ## Acceptance criteria differ from main with no ## Amendments entry. Criteria are frozen once a story leaves PLANNED; record which AC changed, what it said, what it says now, who approved it and why.
    FAIL AC-1: the criteria are judged against the branch's PLANNED commit
         expected to contain: ok    acceptance criteria unchanged since the last committed PLANNED state (2d7111d)
    FAIL AC-2: a flip back to PLANNED is refused against the FIRST PLANNED commit, not the second
         expected a refusal saying: ## Acceptance criteria differ from the last committed PLANNED state (4eee9a5)
           story file is new in this PR; nothing to freeze the criteria against
    FAIL AC-4a: a new story is judged against its LAST PLANNED commit
         expected to contain: ok    acceptance criteria unchanged since the last committed PLANNED state (f2d91de)
           story file is new in this PR; nothing to freeze the criteria against
    FAIL AC-4b: a new story first committed at RED is frozen at that commit
         expected a refusal saying: ## Acceptance criteria differ from the first commit that left PLANNED (a1932cb)
           story file is new in this PR; nothing to freeze the criteria against
    FAIL AC-4c: and is reported unchanged since the first commit that left PLANNED
         expected to contain: ok    acceptance criteria unchanged since the first commit that left PLANNED (390cce7)
           story file is new in this PR; nothing to freeze the criteria against
    FAIL AC-4d: and says its criteria are not frozen yet
         expected to contain:   story T-38 has not left PLANNED in any committed state; its criteria are not frozen yet
           story file is new in this PR; nothing to freeze the criteria against
    FAIL AC-5: the flip-back history is accepted on its ## Amendments entry
         expected to contain: ok    acceptance criteria changed, with an ## Amendments entry
           story file is new in this PR; nothing to freeze the criteria against
    FAIL AC-5: a first-committed-at-RED change is accepted on its ## Amendments entry
         expected to contain: ok    acceptance criteria changed, with an ## Amendments entry
           story file is new in this PR; nothing to freeze the criteria against
    FAIL AC-6: with no merge base the check says the history cannot be walked
         expected to contain:   no merge base with unrelated-T-39, so the branch's history cannot be walked; criteria compared with unrelated-T-39 itself
         FAIL  story T-39: ## Acceptance criteria differ from unrelated-T-39 with no ## Amendments entry. ...
    FAIL AC-7: advance-story.md says to commit the story while it is still PLANNED, before setting the phase
         expected to contain: while it still says `phase: PLANNED`
         actual:                (`story/<id>-<slug>`) if it does not exist.

boundaries: 90 passed, 11 failed
```

The shas differ per run (fixture commits carry the wall-clock time); each
needle computes its own from the commit just made. Every failure is the right
one: the AC-1 history is refused against `main` (the field defect), every
new-in-PR history gets today's skip note, the AC-6 run lacks the note but
already falls back, and AC-7's segment of `advance-story.md` is today's text.

**Expected after GREEN:** `boundaries: 101 passed, 0 failed`. Floor raised to
101 in `.claude/tests/floors.conf:39` (with a paragraph at the end of that
file) and the `COUNTS` row `.claude/tests/selftest.test.sh:520`;
`bash .claude/tests/selftest.test.sh` -> `selftest: 100 passed, 0 failed` with
the new floor. `check-sigpipe.sh` (45 files, 0 findings) and
`check-grep-count.sh` (45 files, 0 findings) are clean over the tree with the
new test file. `bash scripts/gates.sh --fast`: exit 0, every project gate
UNCONFIGURED (this repository is unbootstrapped; `selftest` is what judges it),
so it says nothing about the suite's shape beyond "no gate trips on it".

**Passed on arrival (8), and what earns each.** These are controls or the
"no refusal" half of an acceptance claim, not assertions of new behaviour:

- #4 (AC-2 second case), #5 (AC-3), #18 (AC-6 fallback refusal): today's
  base-branch comparison already produces them, and the story requires that it
  keep doing so. Earned by the paired new-behaviour assertions in the same
  history going red (#17 in AC-6's run) and, for #4/#5, by DV-1's prediction
  below that they survive the defect put back - i.e. they are the half of the
  discrimination that must NOT move. The `refused` helper's `rc != 0` half is
  weak here (3e always refuses); the message is the claim.
- #6, #9, #11, #13, #15 (the "not refused" halves of AC-4a/c/d and AC-5):
  green today only because today's 3d skips new-in-PR stories. Each is paired
  with an exact `ok`/`note` line (#7, #10, #12, #14, #16) that is red now. The
  not-refused half that has real teeth today is #1 (AC-1), and it is red.

**Export shape the tests pin (fact, not suggestion).** The tests call only the
script, `bash scripts/check-boundaries.sh <base>` with `GITHUB_HEAD_REF=` and
`PR_HEAD_SHA=` cleared, and read its stdout+stderr. They pin, byte for byte,
C-2's lines:

- `ok    acceptance criteria unchanged since the last committed PLANNED state (<sha7>)`
- `ok    acceptance criteria unchanged since the first commit that left PLANNED (<sha7>)`
- `ok    acceptance criteria changed, with an ## Amendments entry`
- `## Acceptance criteria differ from the last committed PLANNED state (<sha7>)` / `... the first commit that left PLANNED (<sha7>)` / `... main` / `... unrelated-T-39` (substring of the `FAIL  story <id>: ` line)
- note `  story <id> has not left PLANNED in any committed state; its criteria are not frozen yet`
- note `  no merge base with <BASE>, so the branch's history cannot be walked; criteria compared with <BASE> itself`

`<sha7>` is `${full:0:7}`; `<BASE>` is the ref as passed. The tests do NOT
constrain: the name or signature of `criteria_baseline` (C-1/C-2 still fix it
for DV-1's sed line), where it is defined, the kind vocabulary, the wording
after `with no ## Amendments entry` in the refusal, or the 3d comment text.
Nor do they pin the `none` note (today's text) - no case reaches it.

**AC-7 detail.** The segment between the first `Create and switch to the
story's branch` and the first `Set the phase;` after it has `\r` removed and
newlines folded to spaces before the match, so C-4's sentence may be wrapped
anywhere at a space. It must sit **before** the first `Set the phase;` in that
paragraph. If the anchor phrase itself is reworded, the test fails with
`anchor ... not found`.

**Fixture choices.** AC-6 uses an orphan branch (`git checkout --orphan
unrelated-T-39`, full fixture tree plus T-39 at PLANNED v1), not a depth-1
clone. `git diff "$BASE"...HEAD` at `check-boundaries.sh:174` is already
`|| true`-guarded, so the script reaches 3d with no merge base (observed: the
run printed `story T-39 is in REVIEW` and the 3d refusal). The working tree
always equals `HEAD` in these cases (`commit_all` after each state), so none
distinguishes "working tree as last state" from "HEAD as last state" - AC-4(d)
is the one case where that would matter and both are PLANNED there.

**Negative controls - expected values (claims until GREEN measures them).**

| Control | Threshold | Expected in RED | Measured in RED | Expected after GREEN |
|---|---|---|---|---|
| `:205-221` (base PLANNED, branch REVIEW changed) | `differ from main` present | pass | pass | pass (kind `base`) |
| #4 AC-2 second case (base RED v1, branch PLANNED v2, REVIEW v2) | `differ from main` present | pass | pass | pass (kind `base`, F is the base copy) |
| #5 AC-3 (base PLANNED v1, branch RED v2, REVIEW v2) | `differ from main` present | pass | pass | pass (kind `base`, state before F is the base copy) |
| #18 AC-6 fallback | `differ from unrelated-T-39` present | pass | pass | pass (kind `unwalked`) |
| AC-6's control = AC-1 (#1, #2) | no refusal + ok line | fail | fail | pass |

**DV-1 prediction (GATES runs it; RED cannot - the C-2 line does not exist
yet).** With `crit_base="base $BASE"`: the 10 new-behaviour assertions other
than AC-7 go red - #1, #2, #3, #7, #8, #10, #12, #14, #16, #17 - and
everything else passes, including #4, #5, #18, #19 and all 82 pre-existing
assertions. **Predicted: `boundaries: 91 passed, 10 failed`.** (#1 and #2 both
fail because main has T-31 and it differs; #6/#9/#11/#13/#15 pass because the
mutated 3d prints C-2's `none` note for a story with no base copy.)

**DV-2:** not run in RED, owned by GATES; it needs the GREEN script.

**Files touched:** `.claude/tests/boundaries.test.sh` (new block after
`:221`, helpers `crit_write`, `crit_base`, `crit_branch`, `crit_commit`,
`run_boundaries_against`), `.claude/tests/floors.conf` (line 39 and a closing
paragraph), `.claude/tests/selftest.test.sh` (line 520), and this story's
`## Test plan` / `## Handoff`. Nothing GREEN owns was touched.

**For GREEN.** No Contract amendment was needed. One thing to watch: in the
fixture the PLANNED -> RED history is linear and `HEAD` is the story branch,
not a merge commit, so the `--topo-order` / no-`--first-parent` choice is not
exercised here; DV-2 (and CI itself) is where a merge-commit `HEAD` meets it.

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

    run:    2026-10-05T16:58:41Z
    commit: 328ee4b
    tree:   4d435989b3b9da1a8d6d64fbe10e99b2b559ba65
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


**PLANNED (2026-10-05, lead-po).**

- Planned in a worktree detached at `origin/main` `c7c902f` (release 75). The
  story file is left uncommitted at PLANNED; the user creates the branch.
- **This story is judged by its own rule.** CI runs the PR's own
  `check-boundaries.sh`, so this story's 3d result comes from `criteria_baseline`.
  Following C-4 here costs one commit and is the first real use of it: commit
  this file on `story/HARNESS-033-criteria-freeze-at-the-last-committed-pl`
  while it says `phase: PLANNED`, then `phase.sh set HARNESS-033 RED`. Without
  that commit the baseline is the RED commit (`first`), which is also correct.
- Measured at PLANNED: `bash scripts/selftest.sh boundaries` ->
  `boundaries: 82 passed, 0 failed`, 256 s on this Windows host. Floor 79.
- Verified at PLANNED in a scratch repository (not the fixture): `git rev-list
  --reverse --topo-order main..HEAD` lists a PLANNED/RED/PLANNED/REVIEW history
  oldest first; in a `git clone --depth 1 --no-single-branch file://...`,
  `git merge-base origin/main HEAD` exits 1 and `git rev-parse
  --is-shallow-repository` says `true`. That is AC-6's condition.
- DV-1's sed expression was run against C-2's line in a scratch file: it changed
  that one line to `crit_base="base $BASE"` and nothing else.
- The GATES -> REVIEW procedure now runs the full self-test first (HARNESS-032).
  `sigpipe.test.sh` pins `check-boundaries.sh` line numbers as well as
  `gates.sh`'s; C-5 lists the three that move.

**GREEN (2026-10-05, `feature-developer`, ran on Opus 5.5 (`claude-opus-5-5`), no
model override in the dispatch).**

- **Built.** `criteria_baseline` and the new 3d block in
  `scripts/check-boundaries.sh` (the function sits immediately before the 3d
  block, inside its comment header). C-2's line is at column 0, line 355:
  `crit_base="$(criteria_baseline "$sfile")"`. Every committed copy is read into
  a variable and fed by here-string; the old `git show "$BASE:$sfile" | section`
  pipeline is gone. The 3d comment no longer says "whatever phase" or that CI
  cannot see when an edit happened. C-4's sentence is in
  `.claude/commands/advance-story.md`, before the first `Set the phase;`. C-6
  wording changed in `rules.md`, `new-story.sh` (the `## Amendments` template
  comment) and `story-authoring/reference/sections.md`. C-5 pins in
  `sigpipe.test.sh` moved 326 -> 394, 365 -> 433, 540 -> 608; nothing else in
  any test file changed. `criteria_baseline` added no status-discarding `$(...)`
  the guard flags (check-sigpipe: 0 findings).
- **Measured.** `bash scripts/selftest.sh boundaries` -> `boundaries: 101 passed,
  0 failed` (handoff predicted 101/0). `sigpipe: 82 passed, 0 failed`,
  `procedure: 37 passed, 0 failed`, `new-story: 34 passed, 0 failed`,
  `selftest: 100 passed, 0 failed`, `policy: 17 passed, 0 failed`,
  `reporting: 27 passed, 0 failed`. `check-sigpipe: scanned 45 shell file(s), 42
  with pipefail, 0 finding(s)`; `check-grep-count: scanned 45 shell file(s), 0
  finding(s)`. `bash scripts/gates.sh --fast`: exit 0, every project gate
  UNCONFIGURED (unbootstrapped repository), so it judges nothing here. The full
  `bash scripts/selftest.sh` was NOT run in GREEN.
- **Controls, measured against the shipped function** (the function extracted
  from the real script and run over scratch histories of the same shape, plus
  the suite run above, where every control assertion passed):

  | Control | Expected after GREEN | Measured |
  |---|---|---|
  | `:205-221` | pass (kind `base`) | pass |
  | #4 AC-2 second case | pass, kind `base` | pass; `criteria_baseline` -> `base main` |
  | #5 AC-3 | pass, kind `base` | pass; -> `base main` |
  | #18 AC-6 fallback | pass, kind `unwalked` | pass; -> `unwalked orph` (orphan base) |
  | AC-1 (AC-6's control) | no refusal + ok line | pass; -> `planned <sha of the branch's PLANNED commit>` |

  No divergence from RED's table.
- **The merge-commit `HEAD` the handoff flagged as unexercised** was checked in a
  scratch repository: branch PLANNED v1 then RED v1, base advanced by one
  commit, `--no-ff` merge, detached at the merge, `BASE=main~1`:
  `planned d0bf566...` = the PLANNED commit, as expected. Scratch only, not a
  test; DV-2 and CI remain the real exercise.
- **Own branch.** `bash scripts/check-boundaries.sh` (base `origin/main`) on this
  branch printed `ok    acceptance criteria unchanged since the last committed
  PLANNED state (f5be9a4)` - this story's PLANNED commit - and refused only
  `story HARNESS-033 is in phase 'GREEN'; a PR should be opened from REVIEW or DONE`.
- Not run, by instruction: `mutate.sh`, DV-1, DV-2 (Owner: GATES).

**GATES (2026-10-05), orchestrator.** DV-1 and DV-2 came out as required
(results under `## Deferred verifications`). `bash scripts/gates.sh`: all
required gates passed (0 ran, 7 unconfigured), recorded. Full
`bash scripts/selftest.sh`, detached and alone: exit 0 in 2,809 s, last line
`23 harness suite(s) passed.` (2,407 assertions executed, 2,180 declared);
boundaries 101/0, sigpipe 82/0, procedure 37/0.

**DONE, 2026-10-05.** Merged in #110 (merge commit 4971cce), release 76. The
VERSION bump lands in this DONE commit. `phase.sh set DONE --force` was run on
`main` (a detached checkout of `origin/main` in the worktree), overriding the
branch check. PR CI: `gates` passed in 2m05s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37351016881),
`boundaries` in 11s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37351016874).
No epic. Group 6 finding B of the port audit is complete; next is C + MT-042.
