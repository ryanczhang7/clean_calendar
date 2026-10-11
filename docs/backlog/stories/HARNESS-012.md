---
id: HARNESS-012
title: The LOCAL alarm asks whether a blob is reachable, not whether it exists
slug: the-local-alarm-asks-whether-a-blob-is-r
epic: 
type: chore
status: done
phase: DONE
branch: story/HARNESS-012-the-local-alarm-asks-whether-a-blob-is-r
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [scripts/refresh-harness.sh, .claude/tests/refresh.test.sh, .claude/tests/floors.conf, .claude/tests/selftest.test.sh]  # files this story expects to write
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

**The alarm that justified four stories of work can be silenced by a deleted
branch, and it silenced itself during those four stories.**

`refresh-harness.sh` warns before it overwrites a downstream file that upstream
has never shipped - the LOCAL report. Its own header explains why it exists
(H26): a project vendors the harness, fixes a defect locally WITH TESTS, and the
next refresh removes the fix and the assertions that pin it in one operation,
leaving a green self-test and nothing said.

It decides by hashing the downstream file and asking upstream's object store
about that blob:

    scripts/refresh-harness.sh:249, :270, :277
      git -C "$UP" cat-file -e "$h" 2>/dev/null && continue

`cat-file -e` answers **"does this object exist"**, not **"has upstream ever
shipped this"**. Those differ for every blob that entered the store without
being on a branch: a deleted branch, a `git stash`, a fetched PR ref, an
abandoned rebase, a CI experiment. Until `git gc` runs - which it may not for
weeks - the blob exists, and the alarm concludes upstream shipped it.

**Measured on this repository, 2026-09-23, at release 50:**

    $ git fsck --dangling --no-progress | grep -c '^dangling blob'
    9

    $ h=$(git hash-object ../manga-translator/.claude/hooks/lib.sh)
    632dc4e6d35c78a82e44ce93cb472c054a6be2a6
      cat-file -e (existence):  YES  -> refresh stays silent
      log --find-object (reachable): NO -> no commit contains it

That file is manga-translator's own reconciled-away parser. It is not in any
upstream release, and the refresh no longer warns about it.

**How the blobs got there is the sharp part: this round put them there.**
HARNESS-010's RED phase ran a union-corpus cross-comparison on CI, which meant
committing manga-translator's hooks onto a throwaway branch of THIS repository.
The branch was deleted afterwards, correctly. Its blobs stayed. So the story
that reconciled the two parsers is the reason the alarm stopped reporting the
two parsers - and the LOCAL list for manga-translator fell from eleven files to
nine for that reason rather than because anything was fixed.

Nothing was lost this time: HARNESS-010 made upstream's parser the union of
both, so overwriting downstream's copies is now correct. That is luck. The next
project to fix a harness defect locally, in a repository where somebody once
pushed an experiment, gets the H26 failure with the alarm switched off.

## Acceptance criteria

- **AC-1** - Given a downstream file whose content exists in upstream's object
  store only as an UNREACHABLE object, when the refresh reports, then that file
  is listed as LOCAL. *Control:* the same file, after its blob becomes
  reachable from a commit, is NOT listed.
- **AC-2** - Given a downstream file whose content IS reachable from upstream
  history - an older release the project is simply behind on - then it is NOT
  listed as LOCAL. **This is the quiet half and it is load-bearing:** across
  fifteen releases nearly every harness file differs because upstream moved on,
  and an alarm that fires for all of them is one nobody reads. `refresh.test.sh`
  already asserts both halves; keep it that way.
- **AC-3** - All three call sites use the corrected question. *Control:* a test
  that would pass with only one of the three fixed must fail.
- **AC-4** - Given an upstream with no history to answer from - a shallow or
  single-commit checkout - the refresh still reports that it CANNOT judge,
  rather than reporting a clean result. The existing `up_has_history` branch
  covers this; the criterion is that the change does not weaken it.
- **AC-5** - `.claude/tests/floors.conf` records the raised count for
  `refresh`. *Control:* the floor is the executed assertion count.

## Out of scope

- **Making `refresh-harness.sh` run `git gc`**, or otherwise mutating the
  upstream checkout. It is somebody else's repository and the refresh only reads
  it.
- **The cost of the reachability question on a large history.** If
  `--find-object` over `--all` turns out to be slow enough to matter, say so
  and propose the alternative; do not silently pick a cheaper question that
  answers something else, which is the defect being fixed.
- **Anything about WHICH files are replaced.** This story changes what the
  report SAYS, never what the copy loop DOES.
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

**Everything this story touches is inside `scripts/refresh-harness.sh`. No
exported signature changes, so the caller list below is short by fact rather
than by omission — it was grepped, and it is the whole of it.**

### The question

Replace *"does upstream's object store contain this blob"* with *"is this blob
reachable from a ref of upstream"*. The criterion is the question; what follows
is the command chosen for it, and why it is not the one the story's Notes
proposed.

### `up_reachable` — computed once

Inside the existing `if [ "$up_has_history" = 1 ]; then` branch, **before** the
three walks:

    up_reachable="$(git -C "$UP" rev-list --objects --all 2>/dev/null | awk '{print $1}')"

`rev-list --objects --all` enumerates every object reachable from any ref plus
`HEAD`. `--objects` prints `<sha> <path>` for trees and blobs and a bare `<sha>`
for commits, so `$1` is the object id in both shapes. A dangling blob — deleted
branch, dropped stash, abandoned rebase, fetched PR ref — is absent from it by
construction, which is the whole fix.

### `up_shipped <blob-sha1>` — a new shell function

    up_shipped() { case "$up_reachable_padded" in *"$NL$1$NL"*) return 0 ;; esac; return 1; }

* **Returns** 0 when the blob is reachable, 1 otherwise. Prints nothing.
* **Reads** `$up_reachable_padded` — `up_reachable` with a leading and trailing
  newline, so the newlines in the pattern make it a whole-line match. An
  unanchored substring test would match a *prefix* of some other object id;
  that is the needle rule, and it is one character of pattern away.
* **Spawns no process.** That is a constraint, not an optimisation — see the
  cost section.

The exact spelling of the body is GREEN's to choose. What the contract pins is
the name, the argument, the return convention, that the set is computed once
outside the walks, and that the membership test is whole-line and
subprocess-free.

### The three call sites

Each loses its `git … cat-file -e` and gains the function. Nothing else on
those lines changes:

| line (rel. 50) | walk | before | after |
|---|---|---|---|
| 249 | `.claude/{agents,commands,skills,hooks,tests}` | `git -C "$UP" cat-file -e "$h" 2>/dev/null && continue` | `up_shipped "$h" && continue` |
| 270 | `scripts/*.sh` | same | same |
| 277 | the five named `.claude/harness` + settings files | `[ -n "$h" ] && git -C "$UP" cat-file -e "$h" 2>/dev/null && continue` | `[ -n "$h" ] && up_shipped "$h" && continue` |

### What does NOT change

* The `up_has_history` guard, its shallow/single-commit test, and the
  `local_unknown` branch — **AC-4 is "do not weaken it", so the diff there is
  expected to be empty.**
* Every line of the report: the `LOCAL` heading, the per-file lines, the
  `could not check` note.
* The KEPT/REPLACED copy loop. This story changes what the report SAYS, never
  what the refresh DOES.

### Callers of every changed signature

`up_shipped` is new, so it has no prior callers. The construct it replaces was
grepped tree-wide on 2026-09-23 at release 50:

    $ grep -rn "cat-file" --include=*.sh .
    ./scripts/check-boundaries.sh:265   git cat-file -e "$BASE:.claude/harness/VERSION"
    ./scripts/check-boundaries.sh:304   git cat-file -e "$BASE:$sfile"
    ./scripts/refresh-harness.sh:249    <- this story
    ./scripts/refresh-harness.sh:270    <- this story
    ./scripts/refresh-harness.sh:277    <- this story

The two in `check-boundaries.sh` take a `<rev>:<path>` argument, not a bare
blob id. They ask "does this path exist at that commit", which is already a
reachability question and is **not** in scope. No test greps for the string
`cat-file` in `refresh-harness.sh`, so no assertion is pinned to the old
spelling.

### Baseline measurements — read these out, do not re-derive them

All taken 2026-09-23 on `main` at release 50, commit `ce2ff90`, Git Bash on
Windows 11.

**M-1. The defect reproduces on this repository.**

    $ git fsck --dangling --no-progress | grep -c '^dangling blob'
    9
    $ d=f602ead4936c84b493b29f1916716a46190d3880   # one of them
    $ git cat-file -e "$d" && echo YES             # the question asked today
    YES
    $ git rev-list --objects --all | awk '{print $1}' | grep -qxF "$d" || echo NO
    NO                                             # the question this story asks

**M-2. Four files, not two, are currently suppressed.** The Notes say the
LOCAL list for `../manga-translator` fell from eleven to nine and that two of
those were suppressed rather than resolved. Re-measured today against release
50 — after HARNESS-010 and HARNESS-011 both landed — the divergence is four:

    .claude/hooks/lib.sh
    .claude/hooks/phase-guard.sh
    .claude/tests/phase-guard.test.sh
    .claude/tests/_lib.sh

each `exists=YES reachable=NO`. So a corrected refresh reports **13** LOCAL
files there where it reports 9 today. This is a fact update, not a change to
any acceptance criterion: nothing in AC-1..AC-5 names a count.

**M-3. Today's dry run, for the cost comparison below.**

    $ cd ../manga-translator && time bash ../agentic-dev-harness/scripts/refresh-harness.sh --dry-run ../agentic-dev-harness
    ...9 LOCAL lines...
    real 0m23.619s

81 candidate files here (61 under `.claude/{agents,commands,skills,hooks,tests}`,
15 `scripts/*.sh`, 5 named files), each already costing two git subprocesses.

### The cost question the story's Out of scope demands an answer to

> *If `--find-object` over `--all` turns out to be slow enough to matter, say
> so and propose the alternative; do not silently pick a cheaper question that
> answers something else.*

**Said: it is slow enough to matter, and there is a cheaper command for the
SAME question — not a cheaper question.** Measured, 100 lookups that miss:

| shape | 100 misses | per lookup | subprocesses |
|---|---|---|---|
| `git log --all --find-object=$h` | 1.141s | 11 ms | 100 |
| `git rev-list --objects --all` once, then `grep -qxF` per file | 12.023s | 120 ms | 100 |
| `git rev-list --objects --all` once, then bash `case` per file | **0.139s** | **1.4 ms** | **0** |

The middle row is the one that surprises and the one that sets the design.
Git Bash on Windows spends ~120 ms *spawning* a process, so on this platform
any per-file subprocess dominates the work inside it — which is also why M-3 is
23.6s for 81 files. `--find-object` is a subprocess per file and would make the
refresh slower; `grep -qxF` per file would make it slower still. The `case`
test removes the one subprocess per file that `cat-file -e` costs today, so the
corrected refresh is expected to be **faster** than the defective one.

**Scaling, stated so it is falsifiable rather than assumed.** The cost of the
`case` test is linear in the size of the object-id list, which is 41 bytes per
reachable object: 1,574 objects and 64,533 bytes here. At ten times that it is
~14 ms per lookup and ~1.1s per refresh, still cheaper than today. At a hundred
times it is ~11s and would matter — and the answer then is a single `awk` pass
over (reachable ids, candidate hashes), which is O(1) subprocesses and answers
the identical question. Do not reach for that now; record the measurement if a
consuming project meets it.

**A correctness reason to prefer `rev-list`, independent of cost.**
`git log --all --find-object` walks *diffs*, and `git log` does not diff merge
commits by default. A blob whose only introduction into history was a merge
resolution is therefore invisible to it, and would be reported LOCAL when
upstream did ship it — a false alarm in the quiet half that AC-2 exists to
protect. `rev-list --objects --all` enumerates the object graph and cannot miss
it.

### Two constraints on the implementation that are not style

* **No temp file, no `mktemp`, no `$TMPDIR`.** The script's own header (lines
  51-54) records why: `$TMPDIR` is unset in some shells this runs in, and a
  mutation backup once went nowhere because of it. `lib.test.sh` enforces the
  rule. If a future shape needs a file it goes to a path this script NAMES
  under `.claude/state/`, as `refresh-self.$$.sh` already does.
* **No `printf … | grep -q` pipeline.** The script runs under `set -uo
  pipefail` (line 32). `grep -q` exits at the first match, the writer takes
  SIGPIPE, and `pipefail` turns a successful test into a failed pipeline —
  which is exactly what `scripts/check-sigpipe.sh` refuses tree-wide. The
  `case` test has no pipeline at all, which is the third reason for it.

### Oracle partition

* **AC-1, AC-2, AC-3, AC-4 — mechanical.** Pin them exactly. Each is a fixture
  repository whose object store is arranged by hand, and an assertion on
  whether one filename appears in the `LOCAL` block of a `--dry-run`. There is
  no metric to invent and no threshold to calibrate. The one piece of craft is
  the **needle**: `grep 'LOCAL'` over the whole report matches the explanatory
  paragraph as well as the file lines, so an assertion that a file is *absent*
  must be anchored to the `    LOCAL     <path>` line shape rather than to the
  word. The suite's existing `case` guards do this correctly; follow them.
* **AC-5 — settled.** Read the executed count off `bash scripts/selftest.sh
  refresh`. Do not estimate it from `grep -c assert_`; `floors.conf` says at
  length why. The floor is recorded in TWO files — `.claude/tests/floors.conf`
  and the hand-copied table in `.claude/tests/selftest.test.sh` (line 452 today,
  `refresh 63`). Raising one without the other fails the `selftest` suite; that
  is how HARNESS-011 found out, on CI.

### How to build the AC-1 fixture, since it is the only unobvious one

A dangling blob is made, not found. In the fixture upstream:

    ( cd "$UP" && git checkout -q -b throwaway \
        && printf '<the downstream content>\n' > .claude/hooks/phase-guard.sh \
        && git add -A && git -c user.email=t@t -c user.name=t commit -qm x \
        && git checkout -q - && git branch -qD throwaway )

After `branch -D` the blob is unreachable and `cat-file -e` still answers YES —
that is the defect, and the fixture IS the probe. **AC-1's control is the same
content while its branch still exists**, or equivalently a second file committed
on a branch that survives: reachable, and therefore silent.

### Test-only dependencies

None. `refresh.test.sh` uses git, coreutils and `_lib.sh`, and this story adds
no other tool.

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
     assertions earned by the same mutation, for free. Do THREE mutations rather
     than one, and make one of them a wrong VALUE rather than a missing field: a
     suite that catches an omission can be blind to a corruption, and a codec
     that is uniformly wrong round-trips through itself perfectly. -->

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

Planned by `bash scripts/plan.sh write HARNESS-012` from `.claude/harness/models.conf`.
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

| Phase | Agent | Planned | Resolved | How dispatched | Verdict |
|---|---|---|---|---|---|
| PLANNED | `lead-po` (orchestrator session) | `opus` | `claude-opus-5` at session start; the session reported `claude-opus-5-5` by the end of RED | the orchestrator itself, no dispatch | the Contract's cost question was answered with measurements rather than adopting the Notes' candidate command, and RED amended nothing in the Contract |
| RED | `test-developer` | `fable` | `claude-fable-5-1` (the subagent's own report) | explicit `model: fable` on the dispatch, so it is the override that decided, not the agent definition's `opus` | **met.** The success condition for the measured case is sharper negative controls from a partitioned brief. RED produced a per-walk AC-3 control, surviving-branch controls that only an `--all`→`HEAD` mutation can catch, and an honest prediction of 0 for the one mutation (unanchored membership) that no test can observe, instead of claiming coverage it lacked. It also found the reflog subtlety (PO-5) without being prompted |
| GREEN | `feature-developer` | `opus` | `claude-opus-5-5` (the subagent's own report) | explicit `model: opus` on the dispatch, matching the agent definition | **met.** The success condition for GREEN is reaching green without weakening a test. Nothing under `.claude/tests/` changed after the RED commit (`git diff --quiet 01d3344 -- .claude/tests/`), the diff matches the Contract line for line, and two of RED's predicted mutations reproduced exactly (P-2, P-3) |
| GATES | `feature-developer` | `opus` | **not dispatched** — the orchestrator session (`claude-opus-5-5`) ran it | `gates.sh` reports `0 ran, 8 unconfigured` (`BOOTSTRAPPED=no`, PO-1), so there was no gate failure for a developer to fix. The orchestrator ran `gates.sh`, bumped `VERSION` to 51 and checked the tree guards itself | not applicable: the plan's reason for `opus` in GATES ("make it stop complaining" is tempting) needs a complaint, and there was none |
| REVIEW | `lead-po` | `opus` | the orchestrator session, `claude-opus-5-5` | no dispatch | **met.** PR #81 merged as `7fc7e84` on 2026-09-24 with no review changes requested, and both CI checks (`boundaries`, `gates`) passed on the first run |

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

<!-- Filled by the Test Developer during RED: which tests, at which level,
     and which AC each one covers. -->

One level only: the harness self-test, `bash scripts/selftest.sh refresh`, which
drives the real `scripts/refresh-harness.sh --dry-run` against a fixture
upstream repository whose object store is arranged by hand. Every criterion is
mechanical (Contract, "Oracle partition"), so every assertion is an exact count
of a specific line in the report. Nothing was estimated and no threshold exists.

**One new `describe` block** in `.claude/tests/refresh.test.sh`, placed between
"LOCAL covers scripts/" and "LOCAL refuses to answer from a source with no
usable history": `LOCAL asks whether upstream ever SHIPPED the blob, not whether
its store holds it`. Sixteen assertions, 63 -> 79 executed.

| # | assertion (verbatim) | AC | on arrival |
|---|---|---|---|
| 1-6 | `fixture: <f> exists in upstream's store, so the old question says shipped` / `fixture: and no ref of upstream reaches it, so the new question says never` (x3 files) | AC-1 precondition | green - proves the fixture dangles |
| 7 | `a local fix whose blob dangles in upstream is named LOCAL - walk 1, .claude/hooks` | AC-1, AC-3 | **RED** |
| 8 | `and at walk 2, scripts/*.sh, which asks the same question of its own blob` | AC-1, AC-3 | **RED** |
| 9 | `and at walk 3, the named files, whose line has its own copy of the test` | AC-1, AC-3 | **RED** |
| 10 | `while a file from an older release, in the same run, is still not named` | AC-2 | green (control) |
| 11-13 | `fixture: <f> is now reachable from the surviving branch` (x3) | AC-1 control precondition | green |
| 14 | `once a surviving ref reaches the blob, walk 1 is silent` | AC-1 control | green (control) |
| 15 | `and walk 2` | AC-1 control | green (control) |
| 16 | `and walk 3` | AC-1 control | green (control) |

**The fixture.** One project with three local fixes, one per walk of the check,
plus `.claude/agents/lead-po.md` at the previous release's content (behind, not
changed). In the upstream fixture the same three contents are committed on a
branch `throwaway`, HEAD is switched back, and the branch is deleted. The
Contract's recipe, verified before anything was asserted: `cat-file -e` says
YES for each blob and `rev-list --objects --all` does not list it. (`git fsck
--dangling` does *not* report them, because the HEAD reflog still holds the
deleted commit; `rev-list --all` excludes reflogs, which is the question the
Contract pins, so the fixture is faithful to the criterion rather than to
fsck's vocabulary.) Assertions 1-6 pin those two answers so that a git which
pruned the blob on branch delete fails *there* and cannot let 7-9 pass for the
ordinary never-shipped reason.

**Which walk gets which file:**

| walk | line (rel. 50) | fixture file | why this one |
|---|---|---|---|
| 1 | 249 | `.claude/hooks/phase-guard.sh` | the file the field report named; under `.claude/hooks` |
| 2 | 270 | `scripts/gates.sh` | freshly shipped by the fixture upstream in this block, so the block does not depend on the earlier `check-sigpipe.sh` commit |
| 3 | 277 | `.claude/harness/rules.md` | one of the five named files; committed in the fixture's first release |

**AC-3's control is assertions 7, 8 and 9 taken together.** They are three
different files, hashed and judged by three different lines of the script, in
one run of one fixture. A fix at walk 1 turns assertion 7 green and leaves 8 and
9 red at `expected: 1 / actual: 0`; there is no single call site whose
correction satisfies all three. The suite does not count call sites, so GREEN
collapsing the three into one helper (the Contract's `up_shipped`) is fine - what
is pinned is that each walk's blob is judged by the corrected question.

**AC-2** is pinned three times over, and none of it is new: the existing `while
merely being behind is silent` (line 244), `a project holding upstream's own
files is told nothing` (line 267) and `while a scripts/ file matching upstream
is silent` (line 313) all still execute and pass, and assertion 10 adds the same
check inside the new fixture's own run so that a noisy fix fails beside the
dangling-blob assertion it was written to satisfy.

**AC-4** is the two existing assertions under `LOCAL refuses to answer from a
source with no usable history`: `a source with a single commit says it could not
check` and `while a source with real history still answers`. Verified executed
in this RED run (VERBOSE=1 names both as `ok`). Not duplicated: the criterion is
"do not weaken", and the Contract expects an empty diff on that branch.

**AC-5**: floor raised 63 -> 79 in both records, `.claude/tests/floors.conf`
line 47 and the `COUNTS` table in `.claude/tests/selftest.test.sh` line 452.
`bash scripts/selftest.sh selftest` passes (`54 passed, 0 failed`), so the two
records agree. 79 is the executed count read off the summary line (`76 passed,
3 failed`), not a call-site count.

**The needle.** Every new assertion goes through
`local_line_count <path> <report>`, which is `grep -cx "    LOCAL     <path>"`:
the whole per-file line, four spaces, `LOCAL`, five spaces, the path. The
explanatory paragraph's `  LOCAL - upstream has never shipped` cannot match it,
and neither can a `REPLACED  scripts/` or `KEPT` line naming the same file. An
absence assertion is `expected 0` on that count, never the absence of the word.

**Out of scope, pinned where cheap.** Nothing about the copy loop changes, and
the existing "what it replaces" block already asserts the copy by content. No
`git gc` is run by the script; the fixture would notice if it were (assertion
1-6 read the store before the refresh, but a gc during the refresh would leave
7-9 green for the wrong reason - GREEN should not add one, and the Contract says
so).

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

### The command

    bash scripts/selftest.sh refresh            # the suite, 2m15s on Git Bash/Windows
    VERBOSE=1 bash scripts/selftest.sh refresh  # names every executed assertion

### The failure, verbatim (RED, 2026-09-23, tree at `ce2ff90` + this RED diff)

    === refresh ===

      it refuses to run when running would be unsafe

      what it replaces, and what it refuses to touch

      it reports before it acts

      it names the files of yours it is about to overwrite

      LOCAL covers scripts/, where the production code lives

      LOCAL asks whether upstream ever SHIPPED the blob, not whether its store holds it
        FAIL a local fix whose blob dangles in upstream is named LOCAL - walk 1, .claude/hooks
             expected: 1
             actual:   0
        FAIL and at walk 2, scripts/*.sh, which asks the same question of its own blob
             expected: 1
             actual:   0
        FAIL and at walk 3, the named files, whose line has its own copy of the test
             expected: 1
             actual:   0

      LOCAL refuses to answer from a source with no usable history

      the source ref is named when it is not a release

      the procedure belongs to the release being installed

      it survives replacing the file it is being read from

    refresh: 76 passed, 3 failed

    assertion floors: all 1 suite(s) met their declared floor (76 assertions executed, 63 declared).
    1 of 1 harness suite(s) FAILED.

    real    2m15.458s

(The floor line above reads 63 because the run was taken before the floor was
raised. Re-run after raising it, the tail reads:

    refresh: 76 passed, 3 failed
    FAIL refresh  did 76 units of work, below the floor of 79 in .claude/tests/floors.conf

    assertion floors: 0 of 1 suite(s) met their declared floor.
    1 of 1 harness suite(s) FAILED.

`selftest.sh` compares the **passed** count against the floor, so the suite sits
below its floor until the three red assertions go green - the same RED state
HARNESS-010 and HARNESS-011 recorded, and the reason the floor is written now
rather than fitted to whatever ships. GREEN's full run should read `79 passed,
0 failed` and meet the floor exactly.)

**Why it is the right failure.** `actual: 0` is the count of lines exactly equal
to `    LOCAL     <path>` in the dry-run report: the file was judged and found
"shipped". Immediately before that run, six fixture assertions passed saying the
blob for each of the three files **exists** in upstream's store (`cat-file -e`
exit 0) and is **listed by no ref** (`rev-list --objects --all` count 0). So the
script had a dangling blob in front of it, asked `cat-file -e`, heard YES, and
stayed silent - the defect in the Context, reproduced at all three walks. Not an
import error (a bash suite has none), not a fixture that failed to dangle, not a
needle that matched the wrong line.

**On arrival** (before any edit) the suite read `refresh: 63 passed, 0 failed`.

### Files touched

| file | change |
|---|---|
| `.claude/tests/refresh.test.sh` | one new `describe` block, lines 318-441, 16 assertions; nothing above or below it edited |
| `.claude/tests/floors.conf` | `floor \| refresh \| 63` -> `79`, plus a dated note at the foot |
| `.claude/tests/selftest.test.sh` | `COUNTS` table, `refresh 63` -> `refresh 79` (line 452) |
| `docs/backlog/stories/HARNESS-012.md` | `## Test plan`, this section |

`scripts/refresh-harness.sh` was **not opened for writing**. The phase lock
classifies it `harness` and would not have stopped me (PO-4); `git diff --stat`
shows it untouched.

### What the tests pin, and what they leave to GREEN

There is no import and no signature: the suite runs the script and reads its
report. What is pinned:

* **The report's per-file line shape** `    LOCAL     <path>` (4 spaces, LOCAL,
  5 spaces, path, nothing after), matched whole with `grep -cx`. The Contract
  says no report line changes; if GREEN reflowed that line every new assertion
  and the existing `case` guards would go blind together.
* **The path spelling** in that line: `.claude/hooks/phase-guard.sh`,
  `scripts/gates.sh`, `.claude/harness/rules.md` - i.e. the `.claude/$d/$rel`,
  `scripts/$b` and `$f` forms the script already prints.
* **The question**: a blob reachable from *any* ref of upstream (a surviving
  non-default branch counts) is shipped; a blob reachable from none is LOCAL,
  whether or not the store holds it. And a file at an older release's content
  stays silent in the same run.
* **`--dry-run` exit 0 and the report printed in a dry run** - existing
  assertions, unchanged.

What is NOT pinned - the implementer's choice:

* the command that computes reachability (the Contract chooses `rev-list
  --objects --all`; the suite would accept anything that answers the same
  question, including `--find-object`, though the Contract's cost table says
  not to);
* whether the three call sites share a helper (`up_shipped`) or not; the suite
  never counts them or greps the source;
* the name `up_shipped`, `up_reachable`, `$NL`, or any variable;
* the whole-line anchoring of the membership test. **Said plainly: the suite
  cannot observe it.** A 40-hex object id is a substring of a newline-separated
  list of 40-hex ids only by being an entry, so `*"$1"*` and `*"$NL$1$NL"*`
  behave identically on a correct list. The anchoring is defence against a
  future list that carries paths; keep it as the Contract says, but do not
  expect a test to fail without it.

### Fixture invariants GREEN must not break

* The upstream fixture's HEAD is on its default branch at the end of the block
  (`checkout -` twice), and a branch `survives` remains with three commits'
  worth of blobs reachable through it. The later "not a release" block reads
  only HEAD's branch, so this is harmless; if GREEN's implementation ever
  depended on there being exactly one ref, that block would tell you.
* `scripts/gates.sh` is committed to the upstream fixture's default branch by
  this block ("upstream ships gates.sh"). Later blocks do not assert its
  absence.
* No `git gc`, `prune`, `repack` or reflog expiry in the script. The three
  dangling blobs must still *exist* when the report is read; assertions 1-6
  check that before the run, not after.
* The script hashes with `git -C "$PROJ" hash-object`; the fixture does the
  same, so `core.autocrlf` conversion (this machine has it on; git warns on
  every write) lands identically on both sides. Do not switch the script to
  hashing raw bytes.

### Tests that passed on arrival, and what earns each

Ten of the sixteen are green against the unfixed script:

| assertion | why green today | what earns it |
|---|---|---|
| 1-6, 11-13 `fixture: ...` | they test the fixture, not the script | they are the precondition of 7-9; no probe applies |
| 10 `while a file from an older release, in the same run, is still not named` | existence implies it | mutation M-4 below (awk field 2) |
| 14-16 `once a surviving ref reaches the blob, walk N is silent` | existence implies it | mutation M-3 below (`--all` -> `HEAD`); the only assertions in the suite that catch it |

### Negative controls - expected values

No metric and no threshold: every control is a count of one report line, so
the "value" is 0 or 1. All were **run and observed** in RED (a bash suite has
no import failure; every assertion executed):

| control | threshold | measured in RED | expected after GREEN |
|---|---|---|---|
| 10: older-release file, same run | count of `    LOCAL     .claude/agents/lead-po.md` == 0 | 0 | 0 |
| 14-16: surviving branch, per walk | count of `    LOCAL     <f>` == 0 | 0, 0, 0 | 0, 0, 0 |
| 1,3,5: blob exists (old question) | `cat-file -e` exit == 0 | 0, 0, 0 | 0, 0, 0 |
| 2,4,6: blob unreachable (new question) | `rev-list --objects --all` count == 0 | 0, 0, 0 | 0, 0, 0 |
| 11-13: blob reachable via `survives` | count == 1 | 1, 1, 1 | 1, 1, 1 |

The RED values are measured against the *defective* script, where 10 and 14-16
are green for the wrong reason (existence). GREEN confirms them against the
shipped module by running the suite and by mutation M-3/M-4.

### Mutation table - predictions for GREEN and the orchestrator to check

Not run: there is nothing to mutate yet. Each is a `sed` expression against the
Contract's GREEN shape (`up_reachable` from `rev-list --objects --all | awk
'{print $1}'`, `up_shipped "$h" && continue` at walks 1 and 2, `[ -n "$h" ] &&
up_shipped "$h" && continue` at walk 3). **If GREEN spells a line differently,
adjust the expression, not the prediction.** Run as

    bash scripts/mutate.sh scripts/refresh-harness.sh '<expr>' -- bash scripts/selftest.sh refresh

| id | mutation | sed expression | predicted failures | which |
|---|---|---|---|---|
| M-1 | revert **walk 3 only** to the old question | `s/\[ -n "\$h" \] && up_shipped "\$h" && continue/[ -n "$h" ] \&\& git -C "$UP" cat-file -e "$h" 2>\/dev\/null \&\& continue/` | **1** | `and at walk 3, the named files, whose line has its own copy of the test` |
| M-2 | revert **walk 1 only** (first occurrence of the shared spelling) | `0,/up_shipped "\$h" && continue/s//git -C "$UP" cat-file -e "$h" 2>\/dev\/null \&\& continue/` | **1** | `a local fix whose blob dangles in upstream is named LOCAL - walk 1, .claude/hooks` |
| M-3 | **wrong value**: reachable from HEAD's ancestry only, not every ref | `s/rev-list --objects --all/rev-list --objects HEAD/` | **3** | `once a surviving ref reaches the blob, walk 1 is silent`, `and walk 2`, `and walk 3` |
| M-4 | **wrong value**: list of paths instead of ids, so nothing is ever shipped | `s/awk '{print \$1}'/awk '{print \$2}'/` | **7** | `while merely being behind is silent`; `a project holding upstream's own files is told nothing`; `while a scripts/ file matching upstream is silent`; `while a file from an older release, in the same run, is still not named`; `once a surviving ref reaches the blob, walk 1 is silent`; `and walk 2`; `and walk 3` |
| M-5 | membership test unanchored | `s/\*"\$NL\$1\$NL"\*/*"$1"*/` | **0** | none - see "what is NOT pinned"; a run reporting 0 here is the expected result, not a gap discovered |

M-1 is the single-assertion probe and the single-walk revert in one. M-2 is the
same shape at the other end, and the `0,/re/` address is GNU sed (Git Bash and
ubuntu both), which is why it is second. M-3 is the mutation that earns 14-16 -
they are the only assertions in the suite that see the difference between "any
ref" and "HEAD". M-4 earns assertion 10 alongside the three pre-existing
quiet-half assertions. Reverting all three walks reproduces this RED run: 3
failures, the ones pasted above.

### Discovered, and worth knowing

* **`git fsck --dangling` does not report the fixture's blobs**, because the
  deleted branch's commit is still in the HEAD reflog and fsck treats reflogs
  as roots. `rev-list --objects --all` does not, which is the Contract's
  question and the right one: a reflog entry is not a shipped ref. Do not
  reach for `fsck` to build or verify the reachable set, and do not add
  `--reflog` to the `rev-list` - it would silence the alarm for exactly the
  branch-deleted case this story is about.
* **Cost.** The suite went from >120s to 2m15s wall on Git Bash/Windows (sys
  1m12s - process spawn dominates, as the Contract's cost table says). The new
  block is two `--dry-run` invocations and ~25 git subprocesses, roughly 10-12s
  here. There is no per-test timeout in this bash harness; CI on ubuntu spawns
  processes an order of magnitude faster and runs the full suite well inside
  its step. No budget expression was needed because nothing here is timed.
* **`gates.sh --fast`**: `All required gates passed (0 ran, 5 unconfigured, 0
  known)` - every gate is UNCONFIGURED under `BOOTSTRAPPED=no` (PO-1). The
  gates that judge these tests are `bash scripts/selftest.sh` (full run, which
  CI invokes) and `check-boundaries.sh`; `selftest.sh selftest` passes with the
  raised floor, and `check-grep-count.sh` / `check-sigpipe.sh` each report 0
  findings on the test file.
* **`## Deferred verifications`** was left empty by PLANNED and I added no
  entry: the deferred checks are the mutation table above, owned by GREEN /
  the orchestrator's `/advance-story` probe. If the orchestrator prefers them
  as formal entries with `Owner: GREEN`, that is a docs edit any phase may make.
* **Nothing changes the approach.** The Contract's recipe produced a dangling
  blob first time; the `case`-based membership is unconstrained by the suite,
  so GREEN is free to build exactly what the Contract says.
* **Model.** This RED ran on `claude-fable-5-1`, matching the plan row
  (`fable`). No override was reported to me.

### GREEN

**Diff** (`scripts/refresh-harness.sh` only, +23 -7). Built as the Contract
says, with the Contract's spelling:

* inside `if [ "$up_has_history" = 1 ]; then`, before the walks: `NL`,
  `up_reachable="$(git -C "$UP" rev-list --objects --all 2>/dev/null | awk
  '{print $1}')"`, `up_reachable_padded="$NL$up_reachable$NL"`, and
  `up_shipped() { case "$up_reachable_padded" in *"$NL$1$NL"*) return 0 ;;
  esac; return 1; }`. No `--reflog`, no temp file, no pipeline into an
  early-exiting reader;
* the three call sites (now lines 265, 286, 293) read `up_shipped "$h" &&
  continue` / `[ -n "$h" ] && up_shipped "$h" && continue`; nothing else on
  those lines changed;
* the comment above the check now describes reachability, says why existence
  was the wrong question and why not `--reflog`;
* `up_has_history`, `local_unknown`, the report text and the copy loop: no diff.

The mutation table's expressions all match this spelling as written (M-3 and
M-4 each hit exactly one line: 255). Not run here; that is the orchestrator's.

**Suite, before the edit** (same tree as RED): `refresh: 76 passed, 3 failed`,
the three walk assertions, `below the floor of 79`. **After:**

    LOCAL asks whether upstream ever SHIPPED the blob, not whether its store holds it
    ...
    refresh: 79 passed, 0 failed

    assertion floors: all 1 suite(s) met their declared floor (79 assertions executed, 79 declared).
    1 harness suite(s) passed.

    real	2m8.779s

**Full `bash scripts/selftest.sh`:** all 19 suites 0 failed (boundaries 73,
ci-local 28, classify 42, doctor 29, gate-reminder 32, gates 92, grep-count 20,
lib 197, mutate 44, new-story 25, phase-guard 300, phase 33, plan 42, profiles
37, refresh 79, selftest 54, settings 20, sigpipe 82, worktree 73):

    assertion floors: all 19 suite(s) met their declared floor (1302 assertions executed, 1302 declared).
    19 harness suite(s) passed.
    real	47m52.713s

`check-sigpipe.sh`: 40 files, 38 with pipefail, 0 findings. `check-grep-count.sh`:
40 files, 0 findings. `gates.sh --fast`: `All required gates passed (0 ran, 5
unconfigured, 0 known)`, as RED recorded (BOOTSTRAPPED=no).

**Negative controls, measured against the shipped script.** Each is an
`assert_eq` on the exact count string, so a pass is a measurement of that value.
The shipped script no longer contains `cat-file` anywhere but its comment, so
silence can now only come from `up_shipped`: existence no longer implies them.

| control | RED (defective script) | GREEN (shipped) |
|---|---|---|
| 10: older-release file, same run | 0 | 0 |
| 14-16: surviving branch, per walk | 0, 0, 0 | 0, 0, 0 |
| 1,3,5: blob exists | 0, 0, 0 | 0, 0, 0 |
| 2,4,6: blob unreachable | 0, 0, 0 | 0, 0, 0 |
| 11-13: reachable via `survives` | 1, 1, 1 | 1, 1, 1 |
| 7-9: walk 1/2/3 named LOCAL | 0, 0, 0 (red) | 1, 1, 1 |

No divergence. What earns 10 and 14-16 for the right reason is still M-4 and
M-3, not this table.

**Cost and M-2/M-3.** `cd ../manga-translator && time bash
../agentic-dev-harness/scripts/refresh-harness.sh --dry-run ../agentic-dev-harness`,
exit 0, **13 LOCAL** - exactly M-2's prediction, the nine plus the four:

    LOCAL     .claude/skills/stack-profiles/SKILL.md
    LOCAL     .claude/hooks/gate-reminder.sh
    LOCAL     .claude/hooks/lib.sh                  <- new
    LOCAL     .claude/hooks/phase-guard.sh          <- new
    LOCAL     .claude/tests/floors.conf
    LOCAL     .claude/tests/gate-reminder.test.sh
    LOCAL     .claude/tests/gates.test.sh
    LOCAL     .claude/tests/lib.test.sh
    LOCAL     .claude/tests/phase-guard.test.sh     <- new
    LOCAL     .claude/tests/selftest.test.sh
    LOCAL     .claude/tests/_lib.sh                 <- new
    LOCAL     scripts/gates.sh
    LOCAL     scripts/selftest.sh

Wall time, and it is noisy on this machine, so all samples are given. Fixed:
**20.4s** (`time`), then 22s and 18s (`$SECONDS`). For a same-session baseline
instead of M-3's 23.6s from earlier in the day, the three call sites were
reverted to `cat-file -e` through `scripts/mutate.sh` (restore verified
byte-for-byte each time; the one-time `rev-list` stayed in, so this slightly
overstates the old cost): 21.7s with 9 LOCAL, then 30s and 29s. So the
corrected refresh is not slower and is probably faster, but the saving is well
under the ~10s that "one ~120 ms subprocess per file x 81" predicts. The first
pair differs by only 1.3s. Three samples a side cannot say more than that.

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

    run:    2026-09-24T01:11:45Z
    commit: 3d8ba4f
    tree:   87172dd610d085a25c85d08bcc0dc7e51f094b99
    result: pass (0 ran, 8 unconfigured, 0 known)

    UNCONFIGURED format
    UNCONFIGURED lint
    UNCONFIGURED typecheck
    UNCONFIGURED unit
    UNCONFIGURED coverage
    UNCONFIGURED integration
    UNCONFIGURED build
    UNCONFIGURED mutation

## Gate probes

<!-- REQUIRED if this story adds or changes a gate, its command, or its
     evidence line. Omit the section entirely otherwise.
     A gate that has never been observed to fail is not a gate: break the thing
     it guards, run the gate, paste the failure, revert. One block per gate:
       * what was broken, and where
       * the gate output proving it failed
       * confirmation the probe was reverted -->

This story adds no gate. What it changes is a **rule over a tree**, the LOCAL
alarm's judgement of a downstream project. `rules.md` requires such a change to
be probed against a real tree as well as the fixtures, so that probe is
recorded here. The orchestrator's check of RED's mutation table is recorded
beside it. All three probes were run by the orchestrator after GREEN, on the
GREEN working tree (`01d3344` plus the uncommitted `refresh-harness.sh` diff).

### P-1. Against a real downstream tree: the four files the old question hid are now named

The fixtures in `refresh.test.sh` were written from the same reading of the
problem as the fix. This probe is not a fixture. It is `../manga-translator`,
a real consumer, whose four locally-reconciled harness files were silenced by
dangling blobs in THIS repository (Contract M-2).

Before (release 50, the `cat-file -e` question, Contract M-3): 9 LOCAL.
After, 2026-09-23:

    $ cd ../manga-translator && time bash ../agentic-dev-harness/scripts/refresh-harness.sh --dry-run ../agentic-dev-harness
        LOCAL     .claude/skills/stack-profiles/SKILL.md
        LOCAL     .claude/hooks/gate-reminder.sh
        LOCAL     .claude/hooks/lib.sh
        LOCAL     .claude/hooks/phase-guard.sh
        LOCAL     .claude/tests/floors.conf
        LOCAL     .claude/tests/gate-reminder.test.sh
        LOCAL     .claude/tests/gates.test.sh
        LOCAL     .claude/tests/lib.test.sh
        LOCAL     .claude/tests/phase-guard.test.sh
        LOCAL     .claude/tests/selftest.test.sh
        LOCAL     .claude/tests/_lib.sh
        LOCAL     scripts/gates.sh
        LOCAL     scripts/selftest.sh
    Dry run: nothing was written.
    real	0m8.489s

That is 13 LOCAL, matching M-2's prediction: the previous 9 plus
`.claude/hooks/lib.sh`, `.claude/hooks/phase-guard.sh`,
`.claude/tests/phase-guard.test.sh` and `.claude/tests/_lib.sh`, each of which
M-2 measured as `exists=YES reachable=NO`. **The quiet half held on the real
tree as well.** Every file the walks consider that matches
some upstream release stayed silent. The list grew by exactly the four files
the defect had hidden and by no others.

### P-2. RED's mutation M-1, the single-assertion probe: predicted 1, observed 1

    $ bash scripts/mutate.sh scripts/refresh-harness.sh 's/\[ -n "\$h" \] \&\& up_shipped "\$h" \&\& continue/[ -n "$h" ] \&\& git -C "$UP" cat-file -e "$h" 2>\/dev\/null \&\& continue/' -- bash scripts/selftest.sh refresh
    === mutate: scripts/refresh-harness.sh (1 line(s) changed by ...) ===
    === mutate: running bash scripts/selftest.sh refresh ===
        FAIL and at walk 3, the named files, whose line has its own copy of the test
    refresh: 78 passed, 1 failed
    FAIL refresh  did 78 units of work, below the floor of 79 in .claude/tests/floors.conf
    1 of 1 harness suite(s) FAILED.
    === mutate: command exited 1; restored (verified byte-for-byte against .../.claude/state/mutations/scripts_refresh-harness.sh.20260924T005336Z.204438.bak) ===

This reverted one walk of three to the old question, and exactly the one
assertion RED named went red. This is AC-3's control working: a fix at two
call sites out of three does not pass.

### P-3. RED's mutation M-3, a wrong VALUE: predicted 3, observed 3

    $ bash scripts/mutate.sh scripts/refresh-harness.sh 's/rev-list --objects --all/rev-list --objects HEAD/' -- bash scripts/selftest.sh refresh
    === mutate: scripts/refresh-harness.sh (1 line(s) changed by s/rev-list --objects --all/rev-list --objects HEAD/) ===
    === mutate: running bash scripts/selftest.sh refresh ===
        FAIL once a surviving ref reaches the blob, walk 1 is silent
        FAIL and walk 2
        FAIL and walk 3
    refresh: 76 passed, 3 failed
    FAIL refresh  did 76 units of work, below the floor of 79 in .claude/tests/floors.conf
    1 of 1 harness suite(s) FAILED.
    === mutate: command exited 1; restored (verified byte-for-byte against .../.claude/state/mutations/scripts_refresh-harness.sh.20260924T005455Z.206770.bak) ===

These are the three controls that passed on arrival in RED, because the blob
existing implied them. M-3 is the mutation that shows they pass now for the
right reason: a reachability set drawn from HEAD instead of every ref turns
all three red. After both runs, `git diff --stat 01d3344 -- scripts/` shows
only GREEN's own `refresh-harness.sh` change (+22 −6).

M-4 (`awk` field 2, predicted 7) and M-5 (unanchored membership, predicted 0,
which RED stated in advance that no test can observe) were not run. Two of the
five predictions were checked, including the single-assertion one the brief
asked for, and both matched exactly.

### The cost verdict, against the Contract's prediction

The Contract predicted the corrected refresh would be **faster**, because it
removes one `git cat-file` subprocess per candidate file. **Measured: it is not
slower; whether it is faster is lost in the noise.** Dry
runs of `../manga-translator`, in wall-clock seconds:

| question | runs |
|---|---|
| old `cat-file -e` (M-3, PLANNED) | 23.6 |
| old, reverted via `mutate.sh` (GREEN) | 21.7, 30, 29 |
| corrected (GREEN) | 20.4, 22, 18 |
| corrected (orchestrator, P-1) | 8.5 |

The Contract's arithmetic (81 files × ~120 ms) predicted about 10 s saved. The
samples cannot show a saving that large, and the spread within one arm (8.5 s
to 22 s for identical work) is bigger than the difference between the arms.
Per-process spawn cost on this machine clearly varies from minute to minute.
The honest conclusion is that the new question costs no more than the old one,
which is all the Out-of-scope clause asked for. "Faster" is not established.

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


Filed 2026-09-23, the fifth and last finding of the port-before-refresh round
(releases 47-50, plus HARNESS-010 and HARNESS-011). Unlike the other four this
one is not a port from manga-translator - it is a defect in upstream's own
refresh tool, found while checking whether the refresh was finally safe.

**The `## Contract` is left for PLANNED.** What follows is the evidence so that
PLANNED reads numbers rather than re-deriving them.

**The three call sites**, at release 50:

    scripts/refresh-harness.sh:249   the .claude/{agents,commands,skills,hooks,tests} walk
    scripts/refresh-harness.sh:270   the scripts/*.sh walk
    scripts/refresh-harness.sh:277   the named single files

All three ask `git -C "$UP" cat-file -e "$h"`. All three want the other
question.

**A candidate answer, not a decision.** `git log --all --find-object=<hash>`
returns nothing for a dangling blob and at least one commit for a reachable one
- that is the query used to diagnose this, and it is the obvious first thing to
try. PLANNED should check its cost on a real history before pinning it: the
alternative shapes are `git rev-list --objects --all` piped to a lookup, or
`git cat-file --batch-check` with `--batch-all-objects` filtered by
reachability. The criterion is the QUESTION, not the command.

**What makes this worth a story rather than a one-line fix.** The quiet half.
`refresh.test.sh` already asserts that the alarm does NOT fire for a file whose
content is an older upstream release, and the whole value of the report is that
it stays silent for the dozens of files a behind-by-fifteen-releases project
carries. A fix that makes the alarm correct about dangling blobs and noisy about
everything else is worse than the defect, because an alarm nobody reads protects
nothing. Both halves are already pinned in that suite; keep them pinned.

**Provenance, and it is uncomfortable.** The dangling blobs in this repository
were created by HARNESS-010's own RED phase, which pushed manga-translator's
hooks onto a throwaway branch of this repository to run the union-corpus
cross-comparison on CI. Deleting the branch was right; the objects survived it.
So the story that reconciled the two parsers is why the alarm stopped reporting
the two parsers. Measured: manga-translator's LOCAL list fell from eleven files
to nine between the start and end of the round, and two of those two were
suppressed rather than resolved.

---

## PLANNED decisions, 2026-09-23

**PO-1. `required_gates: []`, and the gate that would fail is the self-test.**
`BOOTSTRAPPED=no` in `project.conf`, so all eight gates are UNCONFIGURED and
`gates.sh` reports `pass (0 ran, 8 unconfigured, 0 known)` — as it did for
HARNESS-008, -010 and -011. Naming an optional gate here would name one that
also does not run. The artifact this story changes is a bash script, and the
thing that fails when it breaks is `bash scripts/selftest.sh refresh`, which CI
runs as its own required step alongside `check-boundaries.sh`. That is the
honest answer to "name the required gate that would fail", and it is the same
answer every HARNESS story in this repository has.

**PO-2. `touches:` gained `.claude/tests/selftest.test.sh`.** AC-5 says
`floors.conf` records the raised count, and the floor is recorded twice — the
hand-copied table in `selftest.test.sh` is the other copy, and raising one
without the other fails the `selftest` suite. The original frontmatter listed
three files and would have sent RED into the trap HARNESS-011 hit on CI.

**PO-3. The command is settled in the Contract; the question is what AC-3
judges.** The story's Notes offered `git log --all --find-object` as "a
candidate answer, not a decision", and asked PLANNED to check its cost before
pinning it. Done, measured, and rejected on two independent grounds — cost
(a subprocess per file, on a platform where that is 120 ms) and correctness
(`git log` does not diff merges, so a blob introduced by a merge resolution
reads as never-shipped). The replacement is `git rev-list --objects --all`,
which is the same question asked of the object graph instead of the diff
stream. Numbers in the Contract's cost table.

**PO-4. The phase lock does not constrain this story, and that is not a licence.**
`bash scripts/classify.sh` returns `harness` for all four files in `touches:`,
so every one of them is writable in every phase. The RED/GREEN separation here
is therefore honoured by the agents rather than enforced by the hook: RED writes
`refresh.test.sh`, `floors.conf` and `selftest.test.sh` and does not open
`refresh-harness.sh`; GREEN writes `refresh-harness.sh` and opens no test file.
Said out loud because a lock that would have caught the slip is absent.

**PO-5. "UNREACHABLE" in AC-1 means reachable from no REF — reflogs are not
roots. Reproduced by the orchestrator, not taken from RED.** RED reported that
`git fsck --dangling` does not list its fixture's blobs, because the deleted
branch's tip is still in the HEAD reflog and fsck roots reflogs. That makes
AC-1's word "UNREACHABLE" readable two ways, and the two readings are different
code: `rev-list --objects --all` versus `rev-list --objects --all --reflog`.

Reproduced on a fresh scratch repository with different content and a
different branch name (none of RED's code), 2026-09-23:

    --- case A: deleted branch (tip still in HEAD reflog) ---
    cat-file -e:        exists
    fsck --dangling:    0 hits (reflog counts as a root)
    rev-list --all:     0 hits
    rev-list --all --reflog: 1 hits

It is not a real ambiguity, because the Context rules out one reading. It says
the alarm must fire for content from "a deleted branch" and "an abandoned
rebase", and both of those are held by the reflog for its 90-day default
expiry. Under fsck's reading they count as reachable and the alarm stays
silent, which is the defect restated. So AC-1 is read as *no ref reaches it*,
the Contract's `--all` without `--reflog` stands, and RED's warning against
adding `--reflog` is correct. The AC text is unchanged, so there is no
`## Amendments` entry.

**A residual limit the same reproduction found, and which this story does not
fix.** `--all` treats every ref as shipped, including a LIVE stash:

    --- case B: stash, then drop ---
    while stashed, rev-list --all: 1 hits (refs/stash is a ref)
    after drop,     rev-list --all: 0 hits; cat-file -e: exists

The Context lists "a `git stash`" among the sources of false silence. A dropped
or popped stash, which is the ordinary end of one, is fixed by this story. A
stash still sitting in upstream's `refs/stash`, a fetched PR stored as a ref,
or a remote-tracking experiment branch all still suppress the alarm, because
they are reachable. AC-1 is about unreachable objects, so these are outside
it. The question they raise is a different one: *which refs count as a
release?*, with `--branches --tags` versus `--all` versus an explicit
allow-list as the candidate answers. That needs its own story with its own
quiet-half control, and is recommended as the follow-up.

**PO-6. GATES was re-entered once, on purpose, to re-stamp the gate record.**
The first `gates.sh` run was stamped over a tree that included untracked files
in the checkout (`handoff-world-080/*.patch`, three of which classify as
`source` and one as `test`). `gate_tree_hash()` hashes untracked files, CI
reads only the commit, so that record would have passed `check-boundaries.sh`
locally and failed it on CI. The phase lock correctly refused to move those
files in REVIEW. So the story went back to GATES, the files were parked
outside the repository, `gates.sh` was re-run, the files were restored, and
the story came back to REVIEW. No code changed. `check-boundaries.sh` was then
run in a clean `git worktree` of the commit rather than in this checkout.
