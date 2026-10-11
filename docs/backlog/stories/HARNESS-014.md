---
id: HARNESS-014
title: The gate stamp covers the commit to be, not untracked files
slug: the-gate-stamp-covers-the-commit-to-be-n
epic: 
type: fix
status: done
phase: DONE
branch: story/HARNESS-014-the-gate-stamp-covers-the-commit-to-be-n
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [.claude/hooks/lib.sh, scripts/gates.sh, .claude/tests/lib.test.sh, .claude/tests/gates.test.sh, .claude/tests/boundaries.test.sh, .claude/tests/floors.conf, .claude/tests/selftest.test.sh, .claude/commands/advance-story.md, .claude/harness/VERSION]  # files this story expects to write
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

<!-- Why this story exists. Link the epic and any wiki pages that constrain it.
     Name the REQUIRED gate that would fail if this story's artifact broke. If
     only an optional gate can, put it in required_gates above before RED:
     every required gate once passed over a story none of them exercised. -->

**The gate stamp is computed over files that CI never sees, so a record can
pass `check-boundaries.sh` locally and fail it on CI for the same commit.
Nothing in the code changed between the two runs. The defect is in how the
local side measures.**

`gates.sh` stamps every full run with `tree: <hash>` from `gate_tree_hash()`
(`.claude/hooks/lib.sh:1036` at `ca8c414`). `check-boundaries.sh` recomputes
that hash and refuses a PR whose record does not match (`:366-374`). On CI it
recomputes from the commit (`gate_tree_hash_of "$PR_HEAD_SHA"`). Locally it
recomputes from the working tree (`gate_tree_hash`). `gate_tree_hash` seeds a
temporary index from HEAD and then runs `git add -A .` (`lib.sh:1048`), which
**adds every untracked, non-ignored file**. Any untracked file that classifies
as source, test, config or non-markdown harness is folded into the hash. A
commit contains none of them. The effect has a direction:

* **Record made with strays present:** local `check-boundaries.sh` passes, and
  CI fails with `gates were recorded against tree … but commit … is …`. The
  message says code changed after the run, which is wrong.
* **Record made clean, strays present later:** local `check-boundaries.sh`
  fails, and CI passes.

Either way the local check stops predicting CI, which is its only job.
HARNESS-008 found this as PO-M
(`docs/backlog/stories/HARNESS-008.md:1870-1928`, "`gate_tree_hash()` hashes
UNTRACKED files") and left it for its own story. No story has owned it until
now.

**What it cost this week:**

* **HARNESS-012, PO-6** (`HARNESS-012.md:1119-1128`, commit `4d9e642`). The
  first gate record was stamped over `handoff-world-080/*.patch`: three files
  classify as `source` and one as `test`. In REVIEW the phase lock correctly
  refused to move the source-classified files. So the story went back to
  GATES, the files were parked outside the repository, `gates.sh` was re-run,
  and the files were restored. `check-boundaries.sh` was then run in a clean
  `git worktree`, because the main checkout could not be trusted.
* **HARNESS-013.** According to the orchestrator's account of the session
  (the story file does not record it), the same files were parked before every
  gate run. `check-boundaries.sh` was again run in a throwaway worktree on a
  renamed branch. That produced a spurious branch-mismatch FAIL of its own,
  and the first time it skipped the story checks entirely, because the branch
  name did not contain the story id. The workaround for this defect cost a
  second defect's worth of confusion.
* **The user's standing memory** records it as a trap to step around: "Park
  them, run `gates.sh`, commit, restore."

The live specimen is still in this checkout: `handoff-world-080/` and two
root `.md` files, all untracked and all the user's. Measured here at
`ca8c414` (Notes, M-3), `gate_tree_hash` is `d2af6c3…` and CI's
`gate_tree_hash_of HEAD` is `62c0c30…`.

**The fix has a trap in the other direction.** "Hash tracked files only" leaves
out any file the story itself creates and has not committed. The documented
flow runs `gates.sh` in GATES and commits in REVIEW (`/advance-story`,
GATES → REVIEW, steps 1-2). A new test or module that was never staged would
drop out of the stamp and then enter the commit. `## Notes` measures both
flows against every candidate (M-4, M-5). One product decision remains open
(`## Open question`) and must be answered before this story leaves PLANNED.

**Required gate.** `BOOTSTRAPPED=no`, so all eight `gates.sh` gates are
UNCONFIGURED (as for HARNESS-008 to HARNESS-013). The thing that fails if this
artifact breaks is `bash scripts/selftest.sh`, specifically the `lib`, `gates`
and `boundaries` suites, which CI runs as a required step. `required_gates: []`
is the honest value.

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC.
     An AC that names a statistic, a metric or a threshold names a NEGATIVE
     CONTROL too: the deliberately broken input the metric must reject, and
     roughly what it should score. A criterion can be perfectly testable and
     still be blind to the defect it exists to catch, and that is more
     dangerous than a vague one - it survives review and goes green. -->

"Gated" below means what `gated_stdin` keeps: classified `source`, `test`,
`config`, or `harness` that is not markdown and not under `.claude/state/`.
"Untracked" means listed by `git ls-files --others --exclude-standard`, so it
is never ignored. A hash "equals CI's" when it equals `gate_tree_hash_of` for
the commit named.

- **AC-1: an untracked gated file does not move the stamp (the bug,
  reproduced).** Given a fixture repository with everything committed, when an
  untracked `handoff/x.patch` (which classifies as `source`, as the specimen's
  files do) and an untracked file that classifies as `test` are added, then
  `gate_tree_hash` equals `gate_tree_hash_of HEAD`. At `ca8c414` it does not
  (Notes, M-3). *Control:* in the same fixture, an unstaged edit to a
  **tracked** source file makes `gate_tree_hash` differ from
  `gate_tree_hash_of HEAD`. The working tree still counts for files git
  tracks. A fix that simply hashed HEAD would pass the positive case and fail
  this control.
- **AC-2: the local verdict and CI's verdict agree.** Given a story in REVIEW
  whose `## Gate results` was written by `gates.sh` against a committed tree,
  when an untracked gated file is then added, then `check-boundaries.sh` run
  without `PR_HEAD_SHA` prints `ok    gate record matches the working tree`
  and exits 0. With `PR_HEAD_SHA=$(git rev-parse HEAD)` it prints `ok    gate
  record matches commit …` and exits 0 as well. At `ca8c414` the first run
  refuses. That refusal is why HARNESS-012 and HARNESS-013 ran this check in a
  throwaway worktree. *Control:* after a committed change to a tracked source
  file, both runs refuse with `gates were recorded against tree` and a
  non-zero exit.
- **AC-3: a file the story creates is covered once it is staged (the opposite
  trap).** Given a new gated file that has been written and staged with `git
  add` but not committed, `gate_tree_hash` equals `gate_tree_hash_of` the
  commit that a following `git commit` makes. *Control:* the same file written
  but **not** staged: `gate_tree_hash` does not equal that later commit's
  hash. The unstaged file is exactly what AC-4 exists to name, so AC-3's
  positive case cannot pass for the wrong reason.
- **AC-4: gates.sh names every untracked gated file.** Given untracked gated
  files, both a full `gates.sh` run and a `--fast` run print one line per file
  of the exact form `    UNTRACKED  <path>` (four spaces, `UNTRACKED`, two
  spaces, the path). The line is matched whole (`grep -cx`) and never by the
  bare word. The same output says, in words, that those files are not part of
  the recorded tree. *Control:* in the same run, an untracked docs file
  (`notes.md` at the root) and a harness markdown file are not named. With no
  untracked gated files, no `UNTRACKED` line appears at all.
- **AC-5 - a full run with an active story refuses to record while AC-4 names
  anything.** With an active story, when a full `gates.sh` run names one or
  more untracked gated files (AC-4), it leaves `## Gate results`
  byte-for-byte unchanged, prints a `(not recorded: …)` line giving the reason,
  and exits non-zero even when every gate passed. With **no** active story (CI,
  and `ci-local.sh`'s gates step) it exits with the gates' own status and
  never refuses because of an untracked file. (Option R, the user's decision
  on 2026-09-24; see `## Open question` and PO-E.) *Control:* once the named
  files are staged, or excluded through `.git/info/exclude`, the same run
  records and exits 0.
- **AC-6: ignored files stay irrelevant, including the local exclude file.**
  Given an untracked file that would classify as `source` but is ignored,
  either by `.gitignore` or by `.git/info/exclude`, it neither moves
  `gate_tree_hash` nor gets an `UNTRACKED` line. *Control:* with the ignore
  rule removed, the same file is named by AC-4.
  `.git/info/exclude` is here on purpose. It is the remedy the refusal (under
  R) or the warning (under W) will point a user to for a stray they mean to
  keep, so it must actually work.
- **AC-7: what already holds still holds.** These existing assertions pass
  unchanged: in `lib.test.sh`, `working tree hash equals HEAD hash under
  autocrlf=true`; in `boundaries.test.sh`, `a stamp describing a different
  tree is refused`, `a test changing alone breaks the stamp too` and `and the
  stamp gates.sh wrote IS that hash`; and `worktree.test.sh`'s AC-3 block.
  Three `lib.test.sh` assertions in "covers what the gates judge" hash files
  the fixture never commits (Notes, M-6): `a hook moves the hash`, which fails
  under the fix, and `a command prompt does not move the hash` and `a docs
  file does not move the hash`, which would become vacuous. RED rewrites all
  three so that their files are tracked, keeping the names and what they
  claim. Each rewritten assertion is earned by a mutation, because it passes
  the moment it is written (`rules.md`, non-negotiables).
- **AC-8: the floor is raised in both places.** For every suite that gains
  assertions (expected: `lib`, `gates` and `boundaries`),
  `.claude/tests/floors.conf` and the `COUNTS` table in
  `.claude/tests/selftest.test.sh` (lines 437-456 at `ca8c414`: `lib 197`,
  `gates 92`, `boundaries 73`) record the same new count. *Control:* the value
  is the executed count reported by `bash scripts/selftest.sh <suite>`, not a
  count of `assert_` call sites. `bash scripts/selftest.sh selftest` passes,
  which is how the two records are checked to agree.

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

Pinned at PLANNED → RED, 2026-09-24, against `80bf504`. **RED may amend any
block below in place, with a one-line reason beside the change; GREEN builds
what the amended block says.** The criteria above are not amendable here (they
go through `## Amendments`).

### C-1. `gate_tree_hash` — `.claude/hooks/lib.sh`

* **Signature unchanged:** no arguments, prints one 40-hex hash (or
  `unavailable` with a non-zero return, as today). It still ends in
  `_hash_blob_listing`, and `gated_stdin` is not touched.
* **New meaning: "the tree `git commit -a` would make right now".** Tracked
  files as they are in the working tree, plus whatever is staged (new files
  included), minus tracked deletions. Untracked files contribute nothing,
  whatever they classify as.
* **Computation (measured as M-3 row C):** seed a temporary index from a copy
  of the **real** index (`git rev-parse --git-path index`, so a linked worktree
  uses its own), falling back to `git read-tree HEAD` only when no real index
  exists; then `GIT_INDEX_FILE="$idx" git add -u .`; then `ls-files -s` as
  today. The temporary index stays at `.claude/state/.tree-index.$$` and is
  removed on every path. Seeding from the index rather than an empty one keeps
  the CRLF property `lib.test.sh:239-254` pins.
* **The real index is never written.** A run of `gate_tree_hash` leaves
  `git status --porcelain` and `git diff --cached` byte-identical.
* The header comment above the function (`# The working tree as it is right
  now, tracked or not.`) is rewritten to the new meaning, and the
  `code_changed_since` comment at `lib.sh:936-939` is corrected to state the
  asymmetry (see `## Out of scope`).

### C-2. `untracked_gated` — new, `.claude/hooks/lib.sh`

* `untracked_gated` — no arguments; prints, one per line, repo-relative and
  `LC_ALL=C` sorted, every path that `git -C "$HARNESS_ROOT" ls-files --others
  --exclude-standard` lists **and** `classify_stdin | gated_stdin` keeps.
  Prints nothing when there are none; returns 0 either way.
* `--exclude-standard` is what makes `.gitignore` **and** `.git/info/exclude`
  count (AC-6). It is the one line DV-2 X-D removes.
* This is the only definition of "untracked gated file". `gates.sh` calls it;
  it does not re-derive the listing.

### C-3. `gates.sh` — naming (AC-4)

* In **every mode that runs gate commands** (full, `--fast`, `--gate`,
  `--required`; not `--list`, not `--audit`), after the `--- gate summary ---`
  block and before the record step, when `untracked_gated` prints anything:

      <blank line>
      untracked: N gated file(s) are not part of the recorded tree:
          UNTRACKED  <path>
          UNTRACKED  <path>
      Stage them (git add) if they belong to the story, or exclude them
      (.git/info/exclude) or move them if they do not.

  Each file line is exactly four spaces, `UNTRACKED`, two spaces, the path, and
  nothing after it, so `grep -cx '    UNTRACKED  <path>'` counts it. The
  lead line contains the words `not part of the recorded tree`. When the list
  is empty, none of this is printed: no `untracked:` line, no `UNTRACKED`.
* Docs-class, vendor, ignored and harness-markdown files are never named
  (that is `gated_stdin`, unchanged).

### C-4. `gates.sh` — refusal (AC-5, Option R)

* **"Active story"** means the story `gates.sh` would record into: `$STORY`,
  from `--story <id>` or the lock's `current-story.env`, with its file present.
  That is the branch that today calls `record_in_story`.
* On a **full** run with an active story and a non-empty `untracked_gated`:
  `record_in_story` is **not** called (the story file is byte-for-byte
  unchanged), and in place of the `recorded in …` line it prints one line
  beginning `(not recorded: ` that says N untracked gated file(s) are not in
  the tree this run would stamp, and names both remedies (stage, or exclude /
  move). The run then **exits 1**, whatever the gates did. Precedence: a gate
  failure also exits 1; a BLOCKED run that is refused exits 1, not 3, because
  nothing was recorded for a PO decision to stand on.
* The `.claude/state/last-gate-run` stamp of a refused run says `FULL=no`, so
  the Stop hook does not count it as GATES' full run. (PO-F; RED may pin it
  with an assertion, it is not an AC.)
* With **no** active story (CI, `ci-local.sh`'s gates step), or on a partial
  run, there is no refusal: the naming of C-3 is printed and the exit status
  is the gates' own, exactly as today.
* Staging the named files, or excluding them through `.git/info/exclude`,
  makes the same run record and exit 0 (AC-5's control).
* **RED amendment (2026-09-24), two pins the tests needed and the block left
  open.** (i) The refusal line reads `(not recorded: N untracked gated
  file(s) …` — the words `N untracked gated file` in that order, because the
  existing `(not recorded: no active story; …)` line also begins `(not
  recorded: ` and a test counting the prefix alone could not tell the refusal
  from the ordinary no-story case (`gates.test.sh` counts
  `^\(not recorded: .*N untracked gated file`). (ii) The refusal changes
  **nothing above it**: the gate summary, the `changes:` note and the gates'
  own verdict line (`All required gates passed (…)` when they did) are printed
  as today, and the refusal replaces only the `recorded in …` line and the exit
  status. The verdict is about the code and the refusal is about the record; a
  user has to be able to see both, and the existing `covers` assertions in
  `gates.test.sh` (which run with untracked source files and an active story)
  read that verdict line. The stamp's `RESULT=` is left to GREEN; only
  `FULL=no` is pinned (PO-F).

### C-5. Unchanged, and must stay so

`gate_tree_hash_of`, `gated_stdin`, `paths.conf`, `check-boundaries.sh`
(its `:366-374` branch needs no edit: it becomes right because
`gate_tree_hash` does), `.github/workflows/*`, `code_changed_since`'s
behaviour, HARNESS-001's file.

### C-6. Procedure — `.claude/commands/advance-story.md`

At GATES, beside "Then run `bash scripts/gates.sh`" (`:142`), one short
paragraph: the stamp covers tracked and **staged** files only; a file the story
created must be `git add`-ed before the full run; with an active story,
`gates.sh` refuses to record while it names any `UNTRACKED` file, and a user's
own stray belongs in `.git/info/exclude`. Nothing else in the procedure
changes.

### C-7. Release

`.claude/harness/VERSION` 52 → 53, in GATES, as HARNESS-013 did. (The
frontmatter's `touches: … VERSION` means this file.)

### C-8. Callers of every changed export

**No signature changes.** One new export (`untracked_gated`), one changed
meaning (`gate_tree_hash`). Every reader of `gate_tree_hash`, re-listed with
`grep -rn gate_tree_hash .claude scripts .github` at `80bf504` — identical to
M-1:

| Caller | Effect of C-1 |
|---|---|
| `scripts/gates.sh:206` `record_in_story` | records the new meaning — intended |
| `scripts/check-boundaries.sh:369` (local branch) | now agrees with `:367` (CI's) — the fix |
| `.claude/tests/lib.test.sh:239-254` (autocrlf) | must still pass (AC-7) |
| `.claude/tests/lib.test.sh:348-368` ("covers what the gates judge") | three assertions rewritten by RED so their files are tracked (AC-7, M-6) |
| `.claude/tests/boundaries.test.sh:1196-1222` | must still pass (AC-7) |
| `.claude/tests/gate-reminder.test.sh:277`, `lib.sh:936,986` | comments only; `lib.sh:936` is corrected by C-1 |
| `.claude/tests/worktree.test.sh:290-318` (reaches it through `gates.sh` / `check-boundaries.sh`) | must still pass (AC-7) |

RED's handoff states that this list was checked against the tree.

### C-9. Oracle partition (from PO-D)

* **Settled numbers, read out:** AC-8's floors — whatever `bash
  scripts/selftest.sh <suite>` reports executed, written identically into
  `floors.conf` and `selftest.test.sh`'s `COUNTS`. The baseline is `lib 197`,
  `gates 92`, `boundaries 73`. DV-1's specimen numbers (four `UNTRACKED` lines,
  `62c0c30…` for CI) are read out from M-2/M-3, not re-derived.
* **Oracle-free:** none. There is no metric to invent.
* **Mechanical, pin exactly:** AC-1 to AC-7. Hash equality against
  `gate_tree_hash_of <commit>` in fixture repos; whole-line `grep -cx` counts
  of `    UNTRACKED  <path>`; the `(not recorded: ` prefix; exit statuses; a
  byte-for-byte `cmp` of the story file for AC-5; the existing `ok    gate
  record matches …` / `gates were recorded against tree` messages of
  `check-boundaries.sh` for AC-2.

### C-10. Baselines (read out, do not re-measure)

* Specimen classification: M-2. Specimen hashes: M-3. New-file flow: M-4.
* Existing assertions that pin the old behaviour: M-6 — only `a hook moves
  the hash` fails under C-1.
* `boundaries` suite: ~15 min per run on this machine (M-6 / PO-B), so RED
  runs it once, at the end, not per edit.
* Test-only dependencies: none. Bash, git, coreutils.

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

### DV-1. Probe against the real tree: the live specimen

*Condition.* In this checkout, with the user's untracked files present and
**untouched** (`handoff-world-080/` and the two root `.md` files), and the
story's GREEN commit checked out:

* `gate_tree_hash` **must** equal `gate_tree_hash_of HEAD`. At `ca8c414` they
  differ: `d2af6c3…` against `62c0c30…` (M-3).
* `gates.sh --fast` **must** print exactly four `    UNTRACKED  <path>`
  lines: the three `.patch` files that classify as `source` and the one that
  classifies as `test` (M-2). It must not name `handoff-world-080/README.md`,
  `agentic-dev-harness-brief.md` or `harness-feedback-world-080.md`, which
  classify as `docs`.
* *Control on a real line:* with `lib.sh`'s hash computation mutated back to
  `git add -A .` through `scripts/mutate.sh`, the first check **must** fail on
  this same tree.

This is the real-tree probe that `rules.md` requires for a change to a rule
that judges the tree. The fixtures encode the reading of the problem written
here, and only this probe shows the rule is right about the files that are
actually in the tree.

*Why not RED.* It probes the fix, and in RED the fix does not exist. Nothing is
moved, staged or excluded. If the user has cleaned up the specimen by GATES,
say so, and rebuild the same shape in a scratch `git worktree` with an
untracked `.patch` file, rather than touching the user's files.

**Owner: GATES**

**Result (GATES, 2026-09-24, orchestrator, at `9c95a78`).** The specimen was
present and untouched throughout. `git status --porcelain` was byte-identical
before and after (`cmp`).

*Check 1: hash equality on the real tree.*

    gate_tree_hash:          aa61c1070f1e11ff75ca435d0ae06b5d032cebe6
    gate_tree_hash_of HEAD:  aa61c1070f1e11ff75ca435d0ae06b5d032cebe6
    DV-1: EQUAL

*Check 2: `gates.sh --fast` on the real tree* (run in GREEN at the same
commit, exit 0). It printed exactly four lines, all `.patch`, and none of the
three docs-class files:

    untracked: 4 gated file(s) are not part of the recorded tree:
        UNTRACKED  handoff-world-080/part-_lib.sh.patch
        UNTRACKED  handoff-world-080/part-phase-guard.sh.patch
        UNTRACKED  handoff-world-080/part-phase-guard.test.sh.patch
        UNTRACKED  handoff-world-080/world-080-phase-guard-sed-inplace.patch

*Control on a real line: the defect put back.*

    === mutate: .claude/hooks/lib.sh (1 line(s) changed by s/GIT_INDEX_FILE="$idx" git add -u \./GIT_INDEX_FILE="$idx" git add -A ./) ===
      1065 -       && GIT_INDEX_FILE="$idx" git add -u . >/dev/null 2>&1 \
      1065 +       && GIT_INDEX_FILE="$idx" git add -A . >/dev/null 2>&1 \
    gate_tree_hash:          02f668aa1f0ee34b6ae597e5c03b5d05a0cb9a37
    gate_tree_hash_of HEAD:  aa61c1070f1e11ff75ca435d0ae06b5d032cebe6
    DV-1: DIFFER
    === mutate: command exited 1; restored (verified byte-for-byte against …/.claude_hooks_lib.sh.20260924T230847Z.363601.bak) ===

**DV-1 passes.** On the tree it judges, the fix makes the local stamp equal
CI's, and removing the fix breaks that equality.

### DV-2. Wrong-value mutations of the hash

*Condition.* Each of the following, run one at a time through
`scripts/mutate.sh` against the GREEN implementation, **must** turn red the
assertions RED predicts, and nothing else. RED writes the predicted counts in
its handoff, and GATES compares against them.

* **X-A, the defect put back** (`add -A` in place of the fix): AC-1's
  positive case and AC-2's local run go red.
* **X-B, staged files dropped** (seed the temporary index from HEAD instead of
  from the real index, or whatever GREEN's spelling of "staged" is): AC-3's
  positive case goes red, and AC-3's control does not.
* **X-C, the wrong value: the working tree ignored for tracked files** (hash
  the index alone, with no update from the working tree): AC-1's control goes
  red, and AC-1's positive case does not. This is the one where a mutation
  that leaves out a step is not enough, because a fix of "hash HEAD" passes
  every positive case.
* **X-D, the ignore filter dropped** from the listing that AC-4 prints
  (`--exclude-standard` removed, or its equivalent): AC-6 goes red.

*Why not RED.* There is nothing to mutate until GREEN.

**Owner: GATES**

**Result (GATES, 2026-09-24, orchestrator, at `9c95a78`).** Each mutation was
run through `scripts/mutate.sh` in its own detached `git worktree` of
`9c95a78` under the session scratchpad, four at a time, so that no suite read a
mutated `lib.sh` in the main checkout. Every run ended `restored (verified
byte-for-byte …)`, `git status` of each mutated file was empty afterwards, and
the worktrees were removed. Each line gives the red assertions from that run's
suite output, verbatim.

    X-A  s/GIT_INDEX_FILE="$idx" git add -u \./GIT_INDEX_FILE="$idx" git add -A ./   (lib.sh)
      lib: 211 passed, 6 failed
        FAIL an untracked hook does not move the hash
        FAIL AC-1: an untracked gated file does not move the stamp off HEAD's
        FAIL AC-3 control: an UNSTAGED new file is not in the stamp, so it differs from the later commit's
        FAIL AC-6: a .gitignore'd file does not move the stamp
        FAIL AC-6: a file excluded through .git/info/exclude does not move the stamp
        FAIL AC-6 control: and it still does not move the stamp - untracked is untracked
      gates: 134 passed, 0 failed
      boundaries: 77 passed, 2 failed
        FAIL AC-2: an untracked gated file does not spoil the local verdict
        FAIL AC-2: and the local run exits 0

    X-B  s/\[ -f "$real" \] && cp "$real" "$idx"/false/   (seed from HEAD, not the index)
      lib: 216 passed, 1 failed
        FAIL AC-3: a staged new file is in the stamp, which equals the following commit's
      boundaries: 79 passed, 0 failed

    X-C  s/GIT_INDEX_FILE="$idx" git add -u \./true/   (the index copy hashed as-is)
      lib: 214 passed, 3 failed
        FAIL a hook moves the hash
        FAIL source moves the hash
        FAIL AC-1 control: an unstaged edit to a TRACKED source file moves the stamp
      boundaries: 79 passed, 0 failed

    X-D  s/--others --exclude-standard/--others/   (untracked_gated)
      lib: 214 passed, 3 failed
        FAIL AC-6: and is not listed by untracked_gated
        FAIL AC-6: and is not listed by untracked_gated either
        FAIL AC-6 control: with the exclude rule removed the same file is listed
      gates: 129 passed, 5 failed
        FAIL AC-6: excluded via .git/info/exclude, nothing is named
        FAIL AC-5 control: excluded, the run records
        FAIL AC-5 control: excluded, the run exits 0
        FAIL AC-6: a .gitignore'd stray is not named
        FAIL and the count in the reason says 1, not 2

**Against RED's predictions (handoff §6).** X-B (lib 1, AC-3 positive only, and
its control stays green), X-C (lib 3, the named three) and X-D gates (5, the
named five) match exactly. Two differ, and both differences come from R-1a
rather than from a missed catch:
* **X-A: lib 6, predicted 4.** The two extras are the AC-6 "does not move the
  stamp" pair. After R-1a, `handoff/x.patch` and `tests/stray.test.ts` are
  still untracked in that block, so `add -A` folds them in. The prediction was
  written when `:486` had committed them. Because this makes X-A red those two
  through the strays and not through the ignored file, DV-3 earns them
  separately with M6b.
* **X-D: lib 3, predicted 2.** The extra is `AC-6 control: … the same file is
  listed`. Without `--exclude-standard`, the ignored `src/scratch-ignored.ts`
  is listed as well, so the exact listing no longer matches.

The X-C case the story singled out ("hash HEAD passes every positive case")
is caught by `AC-1 control`, and AC-1's positive case stays green under it, as
required. **DV-2 passes.**

### DV-3. Every assertion that passes on arrival is earned by a mutation

*Condition.* RED's handoff lists every new or rewritten assertion that is
green against `ca8c414`. Expected: AC-1's control, AC-3's control, AC-6's
positive cases, AC-7's rewritten assertions, and AC-5's no-active-story
clause. Beside each, the handoff names the mutation that turns it red. GATES
runs each one and pastes the output here.

*Why not RED.* Most of the mutations target code that GREEN writes.

**Owner: GATES**

**Result (GATES, 2026-09-24, orchestrator, at `9c95a78`).** Every new or
rewritten assertion that was green on arrival appears below, with the mutation
that turned it red. The list is handoff §5 plus `a blocked gate is still
reported as BLOCKED`. Each mutation went through `scripts/mutate.sh`. Each
ended `restored (verified byte-for-byte …)`, and each file's `git status` was
empty afterwards. M5–M15 ran in detached worktrees, as DV-2 did. M6b, M16 and
M17 ran in the main checkout with nothing else running.

| Assertion(s) green on arrival | Mutation (file) | Red in that run |
|---|---|---|
| lib `a command prompt does not move the hash`, `a docs file does not move the hash`, `a hook moves the hash` (AC-7 rewrites) | M1–M3 on `gated_stdin` (`lib.sh`), run in RED | each red; output in handoff §5 |
| lib `an untracked hook does not move the hash` | X-A (`lib.sh`) | red (DV-2) |
| lib `AC-1 control: …`, `source moves the hash` | X-C (`lib.sh`) | both red (DV-2) |
| lib `AC-3: a staged new file is in the stamp, …` | X-B (`lib.sh`) | red, alone (DV-2) |
| lib `C-1: gate_tree_hash leaves git status --porcelain unchanged`, `C-1: and leaves the staged diff unchanged` | M5 `s/&& GIT_INDEX_FILE="$idx" git add -u/\&\& git add -u/` (`lib.sh`: the real index written) | `lib: 212 passed, 5 failed`; both C-1 red |
| lib `AC-6: a .gitignore'd file does not move the stamp`, `AC-6: a file excluded through .git/info/exclude does not move the stamp` | M6b `s/git add -u \. >/git add -u . \&\& GIT_INDEX_FILE="$idx" git add -f src >/` (`lib.sh`: force-adds the ignored `src/` files and **not** the strays, which are outside `src/`) | `lib: 213 passed, 4 failed`; both red. M6 (`add -A -f`) and X-A redden them too, but through the strays; M6b isolates the ignored file |
| gates `AC-4 control: the root docs file is not named` | M7 `gated_stdin` keeps `docs` (`lib.sh`) | red (`gates: 113 passed, 21 failed`; the rest is the docs story file cascading) |
| gates `AC-4 control: the harness markdown file is not named` | M8 `gated_stdin` keeps `.md` (`lib.sh`) | red (`gates: 115 passed, 19 failed`) |
| gates `AC-4 control: no untracked gated file, no UNTRACKED anywhere …`, `… and no untracked: lead line either` | M9 `s/^if \[ -n "$untracked" \]; then/if true; then/` (`gates.sh`) | both red (`gates: 120 passed, 14 failed`) |
| gates `a --fast run is partial, so it is NOT refused: exit is the gates' own`, `no active story: exit is the gates' own, 0` | M10: the refusal condition reduced to `[ "$untracked_n" -gt 0 ]` (`gates.sh`) | exactly those two (`gates: 132 passed, 2 failed`) |
| gates `not a refusal for untracked files`, `no active story: and there is no refusal for untracked files` | M16: a `(not recorded: N untracked gated file(s)` line printed on every run that names a file (`gates.sh:689`) | both red (`gates: 130 passed, 4 failed`, with the two refusal-count assertions, now doubled) |
| gates `the gates' own verdict is still printed - …` | M11: `[ "$REFUSED" = 1 ] && exit 1` before the verdict `printf` (`gates.sh`) | red (`gates: 131 passed, 3 failed`) |
| gates `AC-5 control: staged, nothing is named`, `… the run records`, `… the run exits 0`, `… and ## Gate results now carries a tree stamp` | M12: `ls-files --others --cached` (`untracked_gated` lists staged files) | all four red (`gates: 115 passed, 19 failed`) |
| gates `AC-5 control: excluded, …` (2), `AC-6: excluded via .git/info/exclude, nothing is named`, `AC-6: a .gitignore'd stray is not named` | X-D (`lib.sh`) | all four red (DV-2) |
| gates `C-4: the stamp of a recorded run says FULL=yes` | M13 `s/^FULLRUN=yes$/FULLRUN=no/` (`gates.sh`) | red (`gates: 124 passed, 10 failed`) |
| gates `and its not-recorded line is the ordinary partial-run one`, `no active story: the not-recorded line is the ordinary no-story one`, `a blocked gate is still reported as BLOCKED` | M17: the three messages reworded, one run (`gates.sh`) | all three red (`gates: 127 passed, 7 failed`; the other four are older assertions on the same messages) |
| boundaries `AC-2: CI's verdict on the same commit is the same`, `AC-2: and CI's run exits 0` | M14 `s/now=..gate_tree_hash_of ".PR_HEAD_SHA"./now=0000000/` (`check-boundaries.sh`) | exactly those two (`boundaries: 77 passed, 2 failed`) |
| boundaries `AC-2 control: a committed source change is refused locally`, `… and refused by CI's computation too` | M15: the stamp comparison replaced by `if true` (`check-boundaries.sh`) | both red, with the two older stamp-refusal assertions (`boundaries: 75 passed, 4 failed`) |
| lib `fixture: the stray patch classifies as source`, `… stray test classifies as test`, `… .gitignore'd scratch file classifies as ignored` | none | **WAIVED**: these are premise checks on `paths.conf` (out of scope) that make the fixture mean what its comments say. No production code of this story stands behind them |

M16's first attempt is discarded and recorded here so the discard can be
seen. My sed replacement had `\&` where it needed `&`, which left a bare `&`
in `gates.sh`. That is a syntax error, not a wrong value, and it turned 65
assertions red for that reason. It was re-run with `bash -n scripts/gates.sh
&&` placed ahead of the suite, and the result above is from that re-run.

Excerpt of the M17 run, as a sample of the pasted form:

    FAIL a launch failure is BLOCKED, not FAIL
    FAIL a failure alongside a block is reported as both
    FAIL a project pattern is honoured
    FAIL and so does the not-recorded line
    FAIL and its not-recorded line is the ordinary partial-run one
    FAIL a blocked gate is still reported as BLOCKED
    FAIL no active story: the not-recorded line is the ordinary no-story one
    gates: 127 passed, 7 failed
    === mutate: command exited 1; restored (verified byte-for-byte against …) ===

**DV-3 passes.** Every assertion that was green on arrival is either earned by
a mutation or WAIVED above with its reason.

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

Planned by `bash scripts/plan.sh write HARNESS-014` from `.claude/harness/models.conf`.
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

- PLANNED → RED, `lead-po` (orchestrator session): `claude-opus-5-5`, as planned.
- RED, `test-developer`: dispatched with an explicit `model: fable` override
  (the agent file says `opus`), so it resolved to **fable** (`claude-fable-5-1`),
  as planned. The subagent's own handoff says "no override was reported to me",
  which is true and is exactly why this line is written by the orchestrator.
  Verdict for the measured claim: the partitioned brief produced controls for
  every AC, found the untracked `project.conf` in the `gates` fixture on its own,
  and amended C-4 with two pins the contract had left open.
- GREEN, `feature-developer`: explicit `model: opus` → **opus**
  (`claude-opus-5-5`), as planned. It stopped at two defective frozen tests
  instead of weakening either. That is the failure mode the plan keeps opus
  here for, and it did not occur.
- RED re-entry (R-1), `test-developer`: explicit `model: fable` → **fable**,
  as planned. Both corrections were earned by mutation, and the orchestrator's
  own mutation confirmed one of them.
- GREEN re-entry: no dispatch. The orchestrator verified it as a no-op.
- GATES: no dispatch. The orchestrator ran DV-1 to DV-3 and the full gates on `claude-opus-5-5`, with no failure to hand to `feature-developer`.

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Out of scope

<!-- Explicit non-goals. Prevents the Feature Developer from over-building. -->

- **Deleting, moving, staging, ignoring or excluding the user's untracked
  files** (`agentic-dev-harness-brief.md`, `handoff-world-080/`,
  `harness-feedback-world-080.md`). They are the specimen DV-1 runs against.
  Adding them to `.gitignore` or `.git/info/exclude` is the user's decision,
  and the story does not make it for them.
- **HARNESS-001's mutation tests** for the same stamp. That story keeps its
  own criteria, and this one does not edit them (see Notes, PO-B).
- **CI configuration.** `.github/workflows/*.yml` is read here, not changed.
  CI already computes the correct answer (M-5). The fix makes the local
  side agree with it.
- **`gate_tree_hash_of`.** It reads a commit, and it is already correct.
- **Changing what is gated.** `gated_stdin` and `paths.conf` do not change. A
  `.patch` file falling through to `source` is correct for an authored file.
  The defect is that the file is untracked, not how it is classified.
- **`code_changed_since`, the Stop hook's staleness check.** It walks files
  newer than the stamp, whether tracked or not. After this story, an untracked
  gated file edited after a gate run will make the Stop hook ask for a re-run
  that the stamp does not need. That false alarm errs on the safe side and has
  not been seen in practice: the specimen files do not change. But it makes
  the comment at `lib.sh:936-939` ("the two answers cannot drift apart") false
  for untracked files. **GREEN corrects that comment** so that it states the
  asymmetry. Making the two predicates agree again is a separate story if
  anyone ever hits it.
- **Committing new files earlier in the cycle.** Whether RED and GREEN must
  commit is a procedural question for `/advance-story`. This story changes
  that file only to say that a new file must be staged before the full
  `gates.sh` run (see Contract, once written), and it does not otherwise
  change the procedure.
- **Retro-stamping past stories.** Gate records already merged are left alone.
  Their hashes were checked by CI against their own commits and matched.
- **The user's memory note** ("Park them, run gates.sh, commit, restore")
  becomes stale once this ships. Updating it is the user's or the
  orchestrator's job, not something for a story diff.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

<!-- Filled by the Test Developer during RED: which tests, at which level,
     and which AC each one covers. -->

Written 2026-09-24 in RED against `7543732`. Three suites, three levels, no new
dependencies. Every assertion runs against a throwaway fixture repository; the
live specimen in this checkout is never touched (DV-1 is GATES').

| Level | Suite | What it pins | ACs |
|---|---|---|---|
| unit (functions sourced from `lib.sh`) | `.claude/tests/lib.test.sh` | `gate_tree_hash` equals `gate_tree_hash_of HEAD` with untracked gated files present; still moves on an unstaged edit to a tracked file; the real index is untouched; a staged new file is in the stamp and an unstaged one is not; `.gitignore` and `.git/info/exclude` both keep a file out of the hash **and** out of `untracked_gated`; `untracked_gated`'s exact output (sorted, repo-relative, gated only, `.claude/state/` and markdown never named, returns 0). The three AC-7 assertions are rewritten so their files are tracked before `h0`, plus one discriminator: an untracked hook moves nothing. | AC-1, AC-3, AC-6, AC-7, C-1, C-2 |
| integration (`gates.sh` run in a project fixture) | `.claude/tests/gates.test.sh` | one `    UNTRACKED  <path>` line per untracked gated file, counted whole with `grep -cxF`, in `--fast` and full runs; docs and harness-markdown never named; the `not part of the recorded tree` sentence and both remedies; a full run with an active story leaves the story byte-identical (`cmp`), prints one `(not recorded: N untracked gated file` line, exits 1 even with every gate passed and even when a gate is BLOCKED (1, not 3), stamps `FULL=no`; with no active story exits 0 and refuses nothing; staged or `.git/info/exclude`d, the same run records and exits 0; a `.gitignore` rule silences exactly the file it names; with no untracked gated file the word `UNTRACKED` appears nowhere. One fixture change: `project.conf` is committed once at the top of the suite, because it is gated and `write_conf` created it untracked, and under C-4 every recorded full run in the suite would otherwise be refused. | AC-4, AC-5, AC-6, C-3, C-4, PO-F |
| integration (`check-boundaries.sh` in a two-branch fixture) | `.claude/tests/boundaries.test.sh` | a REVIEW story whose record `gates.sh` wrote against a committed tree, plus an untracked `handoff/x.patch`: the local run says `ok    gate record matches the working tree` and exits 0; the same run with `PR_HEAD_SHA=$(git rev-parse HEAD)` says `ok    gate record matches commit` and exits 0. Control: a committed source change makes both refuse with `gates were recorded against tree`, non-zero. | AC-2 |
| settled numbers | `.claude/tests/floors.conf`, `selftest.test.sh` `COUNTS` | the executed counts of the three suites as `selftest.sh` reports them on this tree | AC-8 |

Not tested here, by design: `gate_tree_hash_of` (out of scope, unchanged);
`code_changed_since` (out of scope); `/advance-story` wording (C-6, docs); the
release bump (C-7). DV-1, DV-2 and DV-3 are declared, not run — see the handoff.

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

Written 2026-09-24 by the Test Developer, RED, against `7543732` (working tree:
the user's three untracked specimen files present and untouched). Model: as
declared in `test-developer.md`; no override was reported to me.

### 1. Commands

    bash scripts/selftest.sh lib          # ~2 min here;  RED: lib: 206 passed, 11 failed  (217 executed)
    bash scripts/selftest.sh gates        # ~7 min here;  RED: gates: 115 passed, 19 failed (134 executed)
    bash scripts/selftest.sh boundaries   # ~15 min here; RED: boundaries: 77 passed, 2 failed (79 executed)
    bash scripts/selftest.sh selftest     # floors.conf vs COUNTS: 54 passed, 0 failed
    VERBOSE=1 bash scripts/selftest.sh <suite>   # names every assertion

`bash scripts/gates.sh --fast` exits 0 (every gate UNCONFIGURED, `BOOTSTRAPPED=no`);
`check-sigpipe.sh` and `check-grep-count.sh` both report 0 findings tree-wide.
Every timing above is from this machine, under no contention except where noted;
the three suites were run concurrently once and each took roughly twice as long.

### 2. The failures, and why each is the right one

`lib` (11 red). Two kinds. The hash ones fail because today's `gate_tree_hash`
runs `git add -A .` and so folds untracked files in; the `untracked_gated` ones
fail at `command not found` because C-2's function does not exist yet — that is
the expected shape for a function the story introduces, and it is the reason
those five assertions have not executed their comparison (see section 7).

    FAIL an untracked hook does not move the hash
         expected: 1d496e768a14401519d1f241091537bec62db628
         actual:   e1f91b7578223ee28afe93cb1e7a71145dc7f10a
    FAIL AC-1: an untracked gated file does not move the stamp off HEAD's
         expected: 1d496e768a14401519d1f241091537bec62db628
         actual:   008ce7b4bc74353e6784d8ad8864032669ce8d62
    FAIL AC-3 control: an UNSTAGED new file is not in the stamp, so it differs from the later commit's
         the stamp already equalled the later commit's hash: 82e4461be27218de00921c41b4cc5e09a077e4e2
    FAIL with no untracked gated file it prints nothing
         expected:
         actual:   .../lib.test.sh: line 463: untracked_gated: command not found
    FAIL and returns 0
         expected: 0
         actual:   127
    FAIL lists every untracked gated file, repo-relative, LC_ALL=C sorted, one per line
    FAIL and returns 0 when it printed something
    FAIL AC-6: and is not listed by untracked_gated
    FAIL AC-6: and is not listed by untracked_gated either
    FAIL AC-6 control: with the exclude rule removed the same file is listed
         (all five: `untracked_gated: command not found`)
    FAIL AC-6 control: and it still does not move the stamp - untracked is untracked
         expected: 7f70a55bb270c3e38d94a49ad1ee6177c8bbc302
         actual:   b4ebcb0f7250300d5bd6bc1d95d48fecf19ac4a3
    lib: 206 passed, 11 failed

`gates` (19 red). No `    UNTRACKED  ` line is printed, no `not part of the
recorded tree` sentence, no remedies; the full run records into the story and
exits 0 (or 3 when a gate is BLOCKED) instead of refusing with exit 1; the
stamp says `FULL=yes`. Trimmed:

    FAIL --fast names the stray patch, whole line                      expected: 1   actual: 0
    FAIL --fast names the stray test, whole line                       expected: 1   actual: 0
    FAIL and exactly those two: one UNTRACKED line per untracked gated file   expected: 2   actual: 0
    FAIL and says, in words, that they are not part of the recorded tree      (absent)
    FAIL and names the remedy for a file the story owns: stage it              (no `git add` in output)
    FAIL and the remedy for a stray the user keeps: .git/info/exclude          (absent)
    FAIL the full run still names each file                            expected: 2   actual: 0
    FAIL AC-5: ## Gate results is byte-for-byte unchanged              expected: yes actual: no
    FAIL AC-5: nothing claims to have recorded                         expected: 0   actual: 1
    FAIL AC-5: one line beginning '(not recorded: ' gives the reason - N untracked gated file(s)   expected: 1 actual: 0
    FAIL AC-5: and the run exits 1 although every gate passed          expected: 1   actual: 0
    FAIL C-4: the stamp of a refused run says FULL=no                  expected: 1   actual: 0
    FAIL C-4: but a refused run exits 1, not 3                         expected: 1   actual: 3
    FAIL no active story: the files are still named                    expected: 2   actual: 0
    FAIL AC-6 control: exclude rule removed, both files are named again   expected: 2 actual: 0
    FAIL AC-6 control: and the run is refused again                    expected: 1   actual: 0
    FAIL AC-6: while the other stray still is                          expected: 1   actual: 0
    FAIL and the count in the reason says 1, not 2                     expected: 1   actual: 0
    FAIL and one stray is enough to refuse                             expected: 1   actual: 0
    gates: 115 passed, 19 failed

`boundaries` (2 red). The local run refuses a record that CI's computation on
the same commit accepts — the defect, reproduced end to end:

    FAIL AC-2: an untracked gated file does not spoil the local verdict
         expected to contain: ok    gate record matches the working tree
         actual: ... FAIL  story T-1: gates were recorded against tree 'e8744cd9…' but the working tree is '15983e7f…'. Source, test or config changed after the last full gate run; ...
    FAIL AC-2: and the local run exits 0
         expected: 0
         actual:   1
    ok   AC-2: CI's verdict on the same commit is the same
    ok   AC-2: and CI's run exits 0
    boundaries: 77 passed, 2 failed

No failure is a fixture bug: every existing assertion in the three suites still
passes, and every control passed on arrival exactly as section 7 predicts.

### 3. Files touched, and test -> AC

* `.claude/tests/lib.test.sh` — the "covers what the gates judge" block
  rewritten (AC-7); three new `describe` blocks after it.
* `.claude/tests/gates.test.sh` — one fixture line after the first `write_conf`
  (commits `project.conf`, see section 10); two new `describe` blocks before
  `summary`.
* `.claude/tests/boundaries.test.sh` — one new `describe` block after "the
  gate record is a stamp on a tree".
* `.claude/tests/floors.conf`, `.claude/tests/selftest.test.sh` — AC-8.
* `docs/backlog/stories/HARNESS-014.md` — `## Contract` C-4 amended in place;
  `## Test plan`; this section.

| Suite | Assertion | AC |
|---|---|---|
| lib | `a command prompt does not move the hash`, `a docs file does not move the hash`, `a hook moves the hash` (rewritten: files tracked before `h0`) | AC-7 |
| lib | `an untracked hook does not move the hash` | AC-7 discriminator / AC-1 |
| lib | `fixture: the stray patch classifies as source`, `fixture: the stray test classifies as test` | AC-1 premise |
| lib | `AC-1: an untracked gated file does not move the stamp off HEAD's` | AC-1 |
| lib | `AC-1 control: an unstaged edit to a TRACKED source file moves the stamp` | AC-1 control |
| lib | `C-1: gate_tree_hash leaves git status --porcelain unchanged`, `C-1: and leaves the staged diff unchanged` | C-1 |
| lib | `AC-3: a staged new file is in the stamp, which equals the following commit's` | AC-3 |
| lib | `AC-3 control: an UNSTAGED new file is not in the stamp, so it differs from the later commit's` | AC-3 control |
| lib | `with no untracked gated file it prints nothing`, `and returns 0`, `lists every untracked gated file, repo-relative, LC_ALL=C sorted, one per line`, `and returns 0 when it printed something` | C-2 |
| lib | `fixture: the .gitignore'd scratch file classifies as ignored`, `AC-6: a .gitignore'd file does not move the stamp`, `AC-6: and is not listed by untracked_gated`, `AC-6: a file excluded through .git/info/exclude does not move the stamp`, `AC-6: and is not listed by untracked_gated either` | AC-6 |
| lib | `AC-6 control: with the exclude rule removed the same file is listed`, `AC-6 control: and it still does not move the stamp - untracked is untracked` | AC-6 control |
| gates | `--fast names the stray patch, whole line`, `--fast names the stray test, whole line`, `and exactly those two: …`, `and says, in words, …`, `and names the remedy … stage it`, `and the remedy … .git/info/exclude`, `the full run still names each file`, `no active story: the files are still named` | AC-4 / C-3 |
| gates | `AC-4 control: the root docs file is not named`, `AC-4 control: the harness markdown file is not named`, `AC-4 control: no untracked gated file, no UNTRACKED anywhere in the output`, `AC-4 control: and no untracked: lead line either`, `and the run records`, `and exits 0` | AC-4 control |
| gates | `a --fast run is partial, so it is NOT refused: exit is the gates' own`, `and its not-recorded line is the ordinary partial-run one`, `not a refusal for untracked files` | C-4 (partial run) |
| gates | `AC-5: ## Gate results is byte-for-byte unchanged`, `AC-5: nothing claims to have recorded`, `AC-5: one line beginning '(not recorded: ' …`, `AC-5: and the run exits 1 although every gate passed`, `the gates' own verdict is still printed …`, `C-4: but a refused run exits 1, not 3`, `a blocked gate is still reported as BLOCKED`, `and one stray is enough to refuse`, `and the count in the reason says 1, not 2` | AC-5 / C-4 |
| gates | `C-4: the stamp of a refused run says FULL=no`, `C-4: the stamp of a recorded run says FULL=yes` | PO-F |
| gates | `no active story: exit is the gates' own, 0`, `no active story: the not-recorded line is the ordinary no-story one`, `no active story: and there is no refusal for untracked files` | AC-5 (no active story) |
| gates | `AC-5 control: staged, nothing is named / the run records / the run exits 0 / and ## Gate results now carries a tree stamp`; `AC-5 control: excluded, the run records / the run exits 0` | AC-5 control |
| gates | `AC-6: excluded via .git/info/exclude, nothing is named`, `AC-6: a .gitignore'd stray is not named`, `AC-6: while the other stray still is` | AC-6 |
| gates | `AC-6 control: exclude rule removed, both files are named again`, `AC-6 control: and the run is refused again` | AC-6 control |
| boundaries | `AC-2: an untracked gated file does not spoil the local verdict`, `AC-2: and the local run exits 0`, `AC-2: CI's verdict on the same commit is the same`, `AC-2: and CI's run exits 0` | AC-2 |
| boundaries | `AC-2 control: a committed source change is refused locally`, `AC-2 control: and refused by CI's computation too` | AC-2 control |
| (unchanged) | lib `working tree hash equals HEAD hash under autocrlf=true`; boundaries `a stamp describing a different tree is refused`, `a test changing alone breaks the stamp too`, `and the stamp gates.sh wrote IS that hash`; worktree AC-3 block | AC-7 |

### 4. The shape the tests pin

**`.claude/hooks/lib.sh`**, sourced by the suites with `CLAUDE_PROJECT_DIR`
set to the fixture and `HARNESS_ROOT="$FIX"`:

* `gate_tree_hash` — no arguments; prints one 40-hex hash on stdout. Pinned:
  equals `gate_tree_hash_of HEAD` when the only difference between working tree
  and HEAD is untracked files (ignored or not); differs from it on an unstaged
  edit to a tracked file; equals the hash of the commit a staged new file will
  land in; leaves `git status --porcelain` and `git diff --cached`
  byte-identical. **Not constrained:** where the temporary index lives, the
  `unavailable` path, the header comment, the `code_changed_since` comment.
* `untracked_gated` — no arguments; prints repo-relative paths one per line,
  `LC_ALL=C` sorted (`Zed.ts` before `handoff/…`), no trailing text; prints
  nothing and **returns 0** when empty; returns 0 when non-empty. Lists exactly
  the `--others --exclude-standard` set that `gated_stdin` keeps: source, test,
  config, non-markdown harness; never docs, harness markdown, `.claude/state/`,
  `.gitignore`d or `.git/info/exclude`d paths. **Not constrained:** how it is
  implemented, whether it uses `classify_stdin | gated_stdin` (C-2 says so;
  the tests only read its output).

**`scripts/gates.sh`** (run as `bash scripts/gates.sh [--fast] [--story ID]`
from the fixture root, both streams captured):

* Naming, every mode that runs a gate command: the sentence `not part of the
  recorded tree` (anywhere on a line), the strings `git add` and
  `.git/info/exclude` (anywhere), and per file **exactly** the line
  `    UNTRACKED  <path>` — matched by `grep -cxF`, so nothing before the four
  spaces and nothing after the path; the count of lines matching
  `^    UNTRACKED  ` must equal the number of untracked gated files. With none,
  the word `UNTRACKED` must not appear anywhere in the output and neither must
  `not part of the recorded tree`. **Not constrained:** the lead line's exact
  wording beyond that phrase, the order of the file lines relative to the
  remedy sentence, placement relative to `--- gate summary ---` (C-3 says
  after it; not asserted).
* Refusal, full run with an active story (`current-story.env` via `set_phase`,
  story file present): the story file is `cmp`-identical before and after;
  zero lines match `^recorded in docs/backlog/stories/T-1\.md`; exactly one
  line matches `^\(not recorded: .*N untracked gated file` where N is the
  count (asserted with N=2 and N=1); the exit status is **1** whether the
  gates passed or a required gate was BLOCKED; `All required gates passed`
  is still printed when the gates passed; `.claude/state/last-gate-run`
  contains a line exactly `FULL=no`. **Not constrained:** `RESULT=` in the
  stamp, the rest of the refusal sentence, whether `RAN=` etc. are written.
* No active story: exit 0 with passing gates, exactly one line matching
  `^\(not recorded: no active story`, zero matching the refusal pattern,
  the `UNTRACKED` lines still printed.
* `--fast` with strays: exit 0, the ordinary
  `(not recorded in the story: a partial run is not evidence of anything)`
  line exactly once, zero refusal lines, the `UNTRACKED` lines printed.
* After staging or excluding: zero `UNTRACKED` anywhere, exactly one
  `recorded in …` line, exit 0, the story carries `    tree:   <40 hex>`,
  the stamp says `FULL=yes`.

**`scripts/check-boundaries.sh`** — nothing new pinned; the existing
`ok    gate record matches the working tree` / `ok    gate record matches
commit` / `gates were recorded against tree` strings and exit statuses are
what AC-2 reads. C-5 says it needs no edit; the tests agree.

### 5. Passes on arrival (DV-3 input) — each with the mutation that earns it

Run now, through `scripts/mutate.sh`, against today's `lib.sh` (output in
`scratchpad/mutations-ac7.txt`; every run ended `restored (verified
byte-for-byte …)` and `git status` showed `lib.sh` clean):

    === mutate: .claude/hooks/lib.sh (1 line(s) changed by s|\\.md\$/|\.zz$/|) ===
        FAIL a command prompt does not move the hash
        FAIL a docs file does not move the hash        <- cascade: h0 predates the reworded prompt the mutant now counts
        (+ the 11 RED failures)
    lib: 204 passed, 13 failed
    === mutate: .claude/hooks/lib.sh (1 line(s) changed by s/\$1 == "source" ||/$1 == "source" || $1 == "docs" ||/) ===
        FAIL a docs file does not move the hash
        (+ the 11 RED failures)
    lib: 205 passed, 12 failed
    === mutate: .claude/hooks/lib.sh (1 line(s) changed by s/|| \$1 == "harness")/|| $1 == "harnessX")/) ===
        FAIL a hook moves the hash
        (+ the 11 RED failures)
    lib: 206 passed, 11 failed

So the three AC-7 rewrites are earned. The rest are green today and need
GREEN's code to mutate; GATES runs them (DV-3):

| Suite | Assertion(s) green at `7543732` | Mutation that turns it red |
|---|---|---|
| lib | `AC-1 control: an unstaged edit to a TRACKED source file moves the stamp`; existing `source moves the hash` | **X-C**: drop the `git add -u .` step (hash the copied index alone) |
| lib | `C-1: … git status --porcelain unchanged`, `C-1: … staged diff unchanged` | drop `GIT_INDEX_FILE="$idx"` from the `git add -u` line, so the real index is written (the fixture has an unstaged tracked edit at that point, so `diff --cached` changes) |
| lib | `AC-3: a staged new file is in the stamp, …` | **X-B**: seed from `read-tree HEAD` instead of the real index |
| lib | `AC-6: a .gitignore'd file does not move the stamp`, `AC-6: a file excluded through .git/info/exclude does not move the stamp` | `s/git add -u \./git add -A -f ./` (force-adds ignored files; also reddens AC-1) |
| lib | `fixture: …` classification assertions (3) | premise checks on `paths.conf`, which is out of scope; not required to be earned |
| gates | `AC-4 control: the root docs file is not named` / `… harness markdown file is not named` | the M2 / M1 `gated_stdin` mutations above, once `untracked_gated` exists — `notes.md` / `.claude/commands/x.md` get named |
| gates | `AC-4 control: no untracked gated file, no UNTRACKED anywhere …`, `… no untracked: lead line either` | print the naming block unconditionally (drop GREEN's emptiness guard) |
| gates | `a --fast run is partial, so it is NOT refused …`, `not a refusal for untracked files`, `no active story: exit is the gates' own, 0`, `no active story: … no refusal …` | drop the full-run / `-n "$STORY"` condition from the refusal, so it fires on partial runs and with no story |
| gates | `the gates' own verdict is still printed …` | exit inside the refusal branch before the verdict line |
| gates | `AC-5 control: staged, …` (4) | make `untracked_gated` list staged files, e.g. append `git diff --cached --name-only` to its listing |
| gates | `AC-5 control: excluded, …` (2), `AC-6: excluded via .git/info/exclude, nothing is named`, `AC-6: a .gitignore'd stray is not named` | **X-D** |
| gates | `C-4: the stamp of a recorded run says FULL=yes`, `a blocked gate is still reported as BLOCKED` | existing behaviour; `FULLRUN=yes` -> `no` for the first |
| boundaries | `AC-2: CI's verdict on the same commit is the same`, `AC-2: and CI's run exits 0` | `s/now=\$(gate_tree_hash_of "\$PR_HEAD_SHA")/now=0000000/` in `check-boundaries.sh` |
| boundaries | `AC-2 control: … refused locally`, `… refused by CI's computation too` | `[ -n "$rec" ] && [ "$rec" = "$now" ]` -> `true` in `check-boundaries.sh` (HARNESS-001's mutation) |

### 6. DV-2 predictions (GATES compares)

| Mutation | Predicted red | Count |
|---|---|---|
| **X-A** `add -u` -> `add -A` | lib: `an untracked hook does not move the hash`, `AC-1: an untracked gated file does not move the stamp off HEAD's`, `AC-3 control: …`, `AC-6 control: and it still does not move the stamp …`; boundaries: `AC-2: an untracked gated file does not spoil the local verdict`, `AC-2: and the local run exits 0`; gates: none (no gates assertion compares hashes) | lib 4, gates 0, boundaries 2 |
| **X-B** seed from HEAD, not the real index | lib: `AC-3: a staged new file is in the stamp, …` only; `AC-3 control` stays green | lib 1, gates 0, boundaries 0 |
| **X-C** no `add -u` (index copy hashed as-is) | lib: `AC-1 control: …`, `a hook moves the hash`, `source moves the hash`; AC-1 positive, the autocrlf assertion and both AC-3 cases stay green; boundaries' stamp assertions stay green because their changes are committed | lib 3, gates 0, boundaries 0 |
| **X-D** `--exclude-standard` dropped | lib: `AC-6: and is not listed by untracked_gated`, `AC-6: and is not listed by untracked_gated either`; gates: `AC-6: excluded via .git/info/exclude, nothing is named`, `AC-5 control: excluded, the run records`, `AC-5 control: excluded, the run exits 0`, `AC-6: a .gitignore'd stray is not named`, `and the count in the reason says 1, not 2` | lib 2, gates 5, boundaries 0 |

If GREEN's spelling differs (e.g. the emptiness check lives elsewhere), the
sets may shift by the cascade assertions that read `rc`; the named positives
must be in each set.

### 7. Negative controls — expected value and what RED measured

| Control | Threshold / expected | Measured in RED at `7543732` |
|---|---|---|
| AC-1 control: unstaged edit to tracked `src/main.ts` | hash != `gate_tree_hash_of HEAD` | differ — passed (today's hash also covers tracked edits) |
| AC-2 control: committed source+test change, local and `PR_HEAD_SHA` runs | both print `gates were recorded against tree`, both exit non-zero | both refused, both rc 1 — passed |
| AC-3 control: unstaged new `src/unstaged-module.ts`, then committed | stamp != later commit's hash | **equal**: `82e4461b…` both sides — red, as the defect predicts |
| AC-4 control: untracked `notes.md`, `.claude/commands/x.md` | 0 lines matching `UNTRACKED.*notes\.md` / `…x\.md` | 0 and 0 — passed **vacuously** (no `UNTRACKED` line is printed at all today); GREEN must confirm it stays 0 while the positives become 2 |
| AC-4 control: no untracked gated file | 0 lines containing `UNTRACKED`; run records; rc 0 | 0, records, 0 — passed (vacuous today for the same reason) |
| AC-5 control (i): strays staged | 0 `UNTRACKED`; 1 `recorded in`; rc 0; `tree:` in story; `FULL=yes` | all as expected — passed (today records unconditionally, so this is not yet evidence) |
| AC-5 control (ii): strays in `.git/info/exclude` | 0 `UNTRACKED`; 1 `recorded in`; rc 0 | as expected — passed (same caveat) |
| AC-5 no active story | rc 0; 1 `(not recorded: no active story`; 0 refusal lines; 2 `UNTRACKED` lines | 0, 1, 0, **0** — the first three passed, the naming failed |
| AC-6 control, lib: exclude rule removed | `untracked_gated` lists `handoff/x.patch`, `src/scratch-excluded.ts`, `tests/stray.test.ts` | `command not found` — red; the listing has not run |
| AC-6 control, gates: exclude rule removed | 2 `UNTRACKED` lines; rc 1 | 0 and 0 — red |
| AC-6 `.gitignore` pair: `handoff/` ignored, `tests/stray.test.ts` not | 0 for the patch, 1 for the test, reason says `1 untracked gated file`, rc 1 | 0, 0, 0, 0 — the first passed vacuously, the other three red |
| C-4 BLOCKED precedence | rc 1 with a BLOCKED gate and strays | rc 3 — red |

The five `untracked_gated` assertions and every count of `UNTRACKED` lines
have executed against nothing (the function does not exist; no line is
printed), so the "0 expected, 0 measured" rows above are claims until GREEN
measures them against the shipped code. The `expected` values for the sorted
listing were computed by hand from `LC_ALL=C` byte order (`Z` < `h` < `t`);
`git ls-files` emits that order natively, and GREEN should see it without a
sort — the `sort` is still required by C-2 so that a filter cannot reorder.

### 8. Floors (AC-8)

`lib 197 -> 217`, `gates 92 -> 134`, `boundaries 73 -> 79`, written
identically into `floors.conf` and `selftest.test.sh`'s `COUNTS`;
`bash scripts/selftest.sh selftest` passes (54/54). Each is the EXECUTED count
of its RED run: `206+11`, `115+19`, `77+2`. No new assertion is in a loop and
none is conditional on a function existing (the `command not found` cases
still execute their `assert_eq`), so the executed count will not change at
GREEN; only the pass count will. Until then each suite reports `below the
floor` — the same state HARNESS-010 to HARNESS-013 recorded in RED.

### 9. C-8 caller list

Checked against the tree with `grep -rn gate_tree_hash .claude scripts .github`
at `7543732`: `scripts/gates.sh:206`, `scripts/check-boundaries.sh:367,369`,
`.claude/hooks/lib.sh:936,986,1035-1036,1057-1059`,
`.claude/tests/boundaries.test.sh:1196,1203`,
`.claude/tests/gate-reminder.test.sh:277` (comment),
`.claude/tests/lib.test.sh:239-254,348-368` — identical to C-8's table. No
caller outside it; the new callers are all in the test files listed in
section 3.

### 10. What changes the approach

* **AC-3's positive case is green today, and its control is red** — the
  reverse of what DV-3's "expected" list and the dispatch brief say. M-4
  already shows why: today's `add -A` covers a staged file *and* an unstaged
  one, so "staged file is in the stamp" holds and "unstaged file is not" fails.
  The red one is the one that pins the fix; the green one is earned by X-B.
* **`gates.test.sh`'s fixture had an untracked gated file all along:**
  `write_conf` creates `.claude/harness/project.conf` and never tracks it.
  Under C-4 every recorded full run in that suite would be refused, including
  the existing `a full run still is` assertion. The suite now commits the conf
  once after its first `write_conf`; every later `write_conf` is an edit to a
  tracked file. The `covers` block still runs full runs with untracked source
  files and an active story — those assertions read `All required gates
  passed` and never the exit status, which is why the C-4 amendment pins that
  the verdict line survives the refusal. GREEN should expect those runs to
  exit 1 without any assertion noticing; that is by design, not a gap.
* **`.claude/state/` in the fixtures is neither ignored nor tracked.** The
  refusal must not name `last-gate-run`, `gate-logs/*.log` or
  `current-story.env` — `gated_stdin` already drops the prefix and
  `untracked_gated` is pinned to go through it. A GREEN spelling that lists
  `--others` without that filter will name the fixture's own state files and
  fail `and exactly those two`.
* **The refusal line's wording** is pinned to `N untracked gated file` (C-4
  amendment (i)) because `(not recorded: no active story…` shares the prefix.
  The naming block's `git add` and `.git/info/exclude` strings are asserted
  in the `--fast` output too, so the remedies belong to the naming (C-3), not
  only to the refusal.
* **Nothing here touched the specimen.** `git status` before and after RED
  lists the same three untracked entries; DV-1 remains GATES'.

### Deferred verifications — declined in RED, in these words

* **DV-1** (real-tree specimen probe): not run. It probes the fix, and the fix
  does not exist in this phase. Owner GATES.
* **DV-2** (X-A..X-D): not run; there is nothing to mutate. Predictions in
  section 6. Owner GATES.
* **DV-3**: partially run — the three AC-7 rewrites were earned now (section
  5, output pasted). Every other green-on-arrival assertion is listed with its
  mutation and left to GATES, because the code it mutates is GREEN's.

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

### R-1. GREEN → RED, 2026-09-24: two frozen assertions cannot pass against any conforming implementation

Found by the feature-developer in GREEN, which stopped without editing either
test. **Reproduced independently by the orchestrator** as the rules require:
different inputs, none of the subagent's code.

**R-1a. `lib.test.sh`, the AC-6 block (`:486` at `dcf6f35`).** Three assertions
fail: `AC-6: and is not listed by untracked_gated`, `AC-6: and is not listed by
untracked_gated either` and `AC-6 control: with the exclude rule removed the
same file is listed`. Each expects `handoff/x.patch` and `tests/stray.test.ts`
in `untracked_gated`'s output. But `:480` removes the other fixture files and
leaves those two in place, and `:486`'s `fix_commit` is `git add -A` followed by
a commit (`:364-365`). By the time the assertions run, both files are
**tracked**. No function that follows C-2 (`ls-files --others`) can list them.
*What it should assert instead:* the same three claims, with the two strays
still untracked when they are read. For example, commit only `.gitignore` at
`:486`.

Orchestrator's reproduction, in a scratch repository with its own file names
(`stray/y.patch`, `tests/z.test.ts`) and plain git only:

    before commit-all: stray/y.patch tests/z.test.ts
    after add -A + commit: []  tracked: .gitignore stray/y.patch tests/z.test.ts

After an `add -A` commit, `--others --exclude-standard` lists nothing, so the
expected values are unreachable.

**R-1b. `gates.test.sh:308-313`, `a test file is not a changed source path`.**
This assertion is older than this story. It writes `tests/other.test.ts` and
leaves it **untracked**, then fails if the path appears *anywhere* in the output
(`*"tests/other.test.ts"*`). `classify.sh tests/other.test.ts` returns
`test`, which is gated. So AC-4, a frozen criterion, **requires** the line
`    UNTRACKED  tests/other.test.ts`, and that line satisfies the needle. The
assertion claims "not reported as a changed source path", but its needle floats
free of the `changes:` report it is about. This is the needle rule in
`rules.md` exactly. It could only pass by breaking AC-4. *What it should
assert instead:* the path is absent from every `changes:` line (a `WARN
changes:` or `FAIL changes:` line naming it), anchored to that report.

Orchestrator's reproduction: `grep -n` puts the untracked write at `:308` and
the floating needle at `:311`. `bash scripts/classify.sh tests/other.test.ts`
prints `test	tests/other.test.ts`. No `git add` stands between them. AC-4 therefore
obliges gates.sh to print the path.

**Earning.** Both corrected assertions are written while the implementation
exists, so each passes on first run. The test-developer earns each one by a
mutation through `scripts/mutate.sh` that turns that assertion red, and pastes
the output below.

**GREEN on re-entry.** Expected to be a no-op: the source that GREEN wrote is
committed before this return and is not edited again. The orchestrator verifies
this by running the suites, and does not re-dispatch.

#### Corrected and earned (RED, re-entry, 2026-09-24, test-developer)

Two test files changed, nothing else: `.claude/tests/lib.test.sh` (R-1a) and
`.claude/tests/gates.test.sh` (R-1b). No assertion name, claim or expected
value changed. Executed counts unchanged: lib 217, gates 134, so
`floors.conf` and `selftest.test.sh` are untouched. Every mutation below went
through `scripts/mutate.sh`; the restore line is quoted for each.

**R-1a, `lib.test.sh:486` — the fixture.** Before:

    fix_commit "ignore rule for the scratch file"   # .gitignore is gated, so HEAD carries it

After (commit only `.gitignore`; the two strays stay untracked when read):

    git -C "$FIX" add .gitignore >/dev/null 2>&1
    git -C "$FIX" -c user.email=t@t -c user.name=t commit -qm "ignore rule for the scratch file" >/dev/null 2>&1

`h_clean` still means what it says: at that point the working tree is HEAD
plus the `.gitignore` edit plus two untracked strays, so after committing
`.gitignore` alone the tree `git commit -a` would make IS HEAD, and the four
`AC-6 … does not move the stamp` assertions compare `gate_tree_hash` against
`gate_tree_hash_of HEAD` with the strays present and untracked — which is the
AC-1/AC-6 claim, not a vacuous equality. Nothing after the block reads the
fixture.

*Earned, pair (`AC-6: and is not listed by untracked_gated`, `… either`):* the
ignore filter dropped from `untracked_gated` (DV-2 X-D's mutation). Output,
trimmed to header / FAIL lines / summary / restore:

    === mutate: .claude/hooks/lib.sh (1 line(s) changed by s/--others --exclude-standard/--others/) ===
      1088 -   git -C "$HARNESS_ROOT" ls-files --others --exclude-standard 2>/dev/null \
      1088 +   git -C "$HARNESS_ROOT" ls-files --others 2>/dev/null \
    === mutate: running bash scripts/selftest.sh lib ===
        FAIL AC-6: and is not listed by untracked_gated
        FAIL AC-6: and is not listed by untracked_gated either
        FAIL AC-6 control: with the exclude rule removed the same file is listed
    lib: 214 passed, 3 failed
    FAIL lib  did 214 units of work, below the floor of 217 in .claude/tests/floors.conf
    === mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/.claude_hooks_lib.sh.20260924T213148Z.208594.bak) ===

(The control goes red under this mutation too, because the `.gitignore`'d
`src/scratch-ignored.ts` is then listed as well; the next mutation isolates the
control.)

*Earned, control (`AC-6 control: with the exclude rule removed the same file is
listed`):* `untracked_gated` made to drop exactly the excluded scratch file from
its listing — the "list nothing for this file" defect the control exists to
catch. Exactly one assertion goes red:

    === mutate: .claude/hooks/lib.sh (1 line(s) changed by s/| cut -f2- | LC_ALL=C sort$/| cut -f2- | LC_ALL=C sort | grep -v scratch-excluded/) ===
      1089 -     | classify_stdin | gated_stdin | cut -f2- | LC_ALL=C sort
      1089 +     | classify_stdin | gated_stdin | cut -f2- | LC_ALL=C sort | grep -v scratch-excluded
    === mutate: running bash scripts/selftest.sh lib ===
        FAIL AC-6 control: with the exclude rule removed the same file is listed
    lib: 216 passed, 1 failed
    FAIL lib  did 216 units of work, below the floor of 217 in .claude/tests/floors.conf
    === mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/.claude_hooks_lib.sh.20260924T213627Z.216535.bak) ===

**R-1b, `gates.test.sh:310-313` — the needle.** Before:

    case "$out" in
      *"tests/other.test.ts"*) _bad "a test file is not a changed source path" "reported it: $out" ;;
      *) _ok "a test file is not a changed source path" ;;
    esac

After (read only the `changes:` report lines, then the same containment test):

    changes_lines="$(printf '%s\n' "$out" | grep -E '^(WARN|FAIL) +changes: ')" || changes_lines=""
    case "$changes_lines" in
      *"tests/other.test.ts"*) _bad "a test file is not a changed source path" "reported it: $out" ;;
      *) _ok "a test file is not a changed source path" ;;
    esac

A first spelling piped into `grep -q` and `check-sigpipe.sh` refused it
(`pipeline into an early-exit reader under pipefail`); the shape above has no
early-exit reader and the guard reports 0 findings.

*The anchored needle is not satisfied by the AC-4 line.* On the unmutated tree,
the same fixture state rebuilt outside the suite (a scratch script over
`_lib.sh`'s `make_project_fixture`, identical conf/story/file writes):

    --- whole-output floating needle (the OLD assertion) matches?
    yes: the path is in the output
    --- UNTRACKED line present (grep -cx):
    1
    --- lines naming the path:
    15:    UNTRACKED  tests/other.test.ts
    --- changes: lines (the NEW needle reads only these):
    []
    NEW needle: no match (passes)

So the old needle could only pass by breaking AC-4; the new one passes while
the AC-4 line is present.

*Earned:* `gates.sh`'s changed-path filter mutated to report `test`-classified
paths as changed source paths. Exactly one assertion goes red:

    === mutate: scripts/gates.sh (1 line(s) changed by s/\$1 == "source" { print \$2 }/$1 == "source" || $1 == "test" { print $2 }/) ===
      596 -                 | sort -u | classify_stdin | awk -F'\t' '$1 == "source" { print $2 }')"
      596 +                 | sort -u | classify_stdin | awk -F'\t' '$1 == "source" || $1 == "test" { print $2 }')"
    === mutate: running bash scripts/selftest.sh gates ===
        FAIL a test file is not a changed source path
             …
             WARN         changes: tests/other.test.ts is exercised by no gate with a covers line
             …
                 UNTRACKED  tests/other.test.ts
    gates: 133 passed, 1 failed
    FAIL gates  did 133 units of work, below the floor of 134 in .claude/tests/floors.conf
    === mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_gates.sh.20260924T221136Z.274543.bak) ===

(The `…` elides the gates' own printf output that `reported it: $out` pastes;
the two quoted lines are the `changes:` line the mutation made appear and the
AC-4 line, both from the same run.) Both mutation runs of the gates suite (the
`grep -q` spelling and the final one) turned exactly this assertion red.

*After the restores:* `bash scripts/selftest.sh lib` → `lib: 217 passed, 0
failed`; `bash scripts/selftest.sh gates` → `gates: 134 passed, 0 failed`;
`check-sigpipe.sh` 0 findings, `check-grep-count.sh` 0 findings; no `.bak`
under `.claude/state/mutations/`; `git status` shows `lib.sh` and `gates.sh`
unmodified.

**Orchestrator's check of the re-entry (2026-09-24).** This is a mutation of my
own, different from the test-developer's. It predicts a single red assertion,
the R-1a control:

    === mutate: .claude/hooks/lib.sh (1 line(s) changed by s#cut -f2- | LC_ALL=C sort#cut -f2- | sed /^src/d | LC_ALL=C sort#) ===
        FAIL AC-6 control: with the exclude rule removed the same file is listed
    lib: 216 passed, 1 failed
    === mutate: command exited 1; restored (verified byte-for-byte against …/.claude_hooks_lib.sh.20260924T224804Z.330211.bak) ===

One predicted and one red. `lib.sh` is clean afterwards and no `.bak`
remains. So the corrected fixture now discriminates, and the other 216 lib
assertions pass against the committed implementation.

## Gate results

<!-- gates.sh: written by bash scripts/gates.sh; do not edit or paste by hand -->

    run:    2026-09-24T23:50:59Z
    commit: 9c95a78 (working tree had uncommitted changes)
    tree:   e877e7dfbb8edd9f444c312c2b08c500a7bfaa25
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


Filed 2026-09-24 as the story HARNESS-008's PO-M asked for. **The
`## Contract` is left for PLANNED**, as in HARNESS-012 and HARNESS-013. This
section holds the evidence, so that PLANNED can read the numbers out rather
than measure them again. Line numbers are at `ca8c414` (release 52).

### Measurements, 2026-09-24, this repository at `ca8c414`, Git Bash on Windows 11

**M-1. Every caller of `gate_tree_hash`, and of what it claims to agree
with.** From `grep -rn gate_tree_hash` over `.claude/`, `scripts/` and
`.github/`. A change to what the function hashes changes the meaning of all of
them:

| Where | What it does | Affected? |
|---|---|---|
| `scripts/gates.sh:206` (`record_in_story`) | writes `tree:` into `## Gate results` | **yes**: this is the recorder |
| `scripts/check-boundaries.sh:369` | the local verifier, when `PR_HEAD_SHA` is unset | **yes**: this is the side that disagrees with CI today |
| `scripts/check-boundaries.sh:367` | `gate_tree_hash_of "$PR_HEAD_SHA"`, used by CI and by `ci-local.sh` | no: it reads a commit |
| `.claude/hooks/lib.sh:945` `code_changed_since` → `.claude/hooks/gate-reminder.sh:135` | Stop hook staleness check. It does not call the function, but its comment (`lib.sh:936-939`) claims to answer "would the recorded gate hash still match" | its **comment** becomes false for untracked files (see Out of scope) |
| `.claude/tests/lib.test.sh:239-254` | autocrlf: `gate_tree_hash` equals `gate_tree_hash_of HEAD` after a commit | must still pass (AC-7). The fix must keep the HEAD or index seeding that the CRLF fix depends on |
| `.claude/tests/lib.test.sh:348-368` | "covers what the gates judge": writes `.claude/commands/advance-story.md` and `.claude/hooks/lib.sh` into the fixture and hashes them **without committing** | see M-6 |
| `.claude/tests/boundaries.test.sh:1188-1222` | a record matches its tree, the stamp IS the hash, and a later source or test change is refused | must still pass (AC-7) |
| `.claude/tests/worktree.test.sh:290-318` | HARNESS-008 AC-3: a record belongs to the worktree that made it | must still pass (AC-7) |
| `.claude/tests/gate-reminder.test.sh:277` | comment only | no |

No signature changes are planned. Both options keep `gate_tree_hash` with no
arguments, printing one hash. What changes is its meaning, which is why the
list matters.

**M-2. The live specimen.** `git ls-files --others --exclude-standard`, each
path run through `scripts/classify.sh`:

    agentic-dev-harness-brief.md                               docs
    harness-feedback-world-080.md                              docs
    handoff-world-080/README.md                                docs
    handoff-world-080/part-_lib.sh.patch                       source
    handoff-world-080/part-phase-guard.sh.patch                source
    handoff-world-080/world-080-phase-guard-sed-inplace.patch  source
    handoff-world-080/part-phase-guard.test.sh.patch           test

Four gated files and three not gated: the same set HARNESS-008's PO-M listed
three days earlier. The files have been in the tree through three stories.

**M-3. The live comparison, read-only.** `scratchpad/measure.sh` sources
`lib.sh` from the repository root, the same way `boundaries.test.sh:1203`
does, and prints four hashes. Nothing in the tree was moved.
`git status --porcelain` was identical before and after:

    A gate_tree_hash (today, working tree incl. untracked): d2af6c301eb3e0190c595a0979507d6c0f7a284b
    B gate_tree_hash_of HEAD (what CI computes):           62c0c30969085155993ac26dedab4fcf0d859a1a
    C candidate (a), index + add -u:                        62c0c30969085155993ac26dedab4fcf0d859a1a
    D today's listing with untracked paths removed:        62c0c30969085155993ac26dedab4fcf0d859a1a

**They differ.** Today's local stamp is not the hash CI will compute for this
same commit. Two tracked-only computations agree with CI exactly:

* **C** copies the real index (tracked plus staged) and runs `git add -u`,
  which updates tracked files and records deletions. That is "the tree `git
  commit -a` would make".
* **D** is today's listing with the untracked paths removed.

All four took 6.9s together (a single hash is about 1.7s), so cost does not
separate the candidates.

"Files absent" measurement: in a scratch `git worktree add --detach` of
`ca8c414`, under the scratchpad and since removed, all four print
`62c0c30…`. So the whole difference is the untracked files.

**M-4. The new-file flow, the opposite trap, measured.** In the same scratch
worktree, a new `.claude/tests/new-thing.test.sh` (classifies as `harness`,
which is gated):

| state of the new file | A (today) | C (candidate a) | CI after `git commit` |
|---|---|---|---|
| absent | `62c0c30` | `62c0c30` | n/a |
| written, **untracked** | `40b6e7e` | `62c0c30` | n/a |
| **staged** (`git add`) | `40b6e7e` | `40b6e7e` | n/a |
| committed | - | - | `gate_tree_hash_of HEAD` = `40b6e7e` |

So **today's behaviour is right for a new file and wrong for a stray one**.
Candidate (a) is the reverse, **unless the new file is staged**. When staged,
(a) is right for both. An unstaged new file under (a) gives a stamp of
`62c0c30`, and after the commit CI computes `40b6e7e`. That is a **loud**
mismatch, never a silent match: nothing in (a) can make CI agree with a stamp
that left out a file the commit contains. The worse outcome the brief named,
"a match that judged less code than it claims", cannot come from the new-file
flow under any candidate. It can come from the stray flow (see M-7).

**M-5. What CI and `ci-local.sh` hash.**
* `.github/workflows/boundaries.yml` checks out with `fetch-depth: 0` and runs
  `check-boundaries.sh origin/<base>` with `PR_HEAD_SHA` set to the PR head.
  So CI always takes `gate_tree_hash_of <commit>`: **tracked files at that
  commit, nothing else**. `gates.yml` runs `selftest.sh`, the two tree guards,
  `gates.sh --list`, `--audit` and a full `gates.sh`. On CI there is no
  active story (`.claude/state/` is gitignored), so that `gates.sh` records
  nothing.
* `scripts/ci-local.sh:69` sets `PR_HEAD_SHA=$(git rev-parse HEAD)` before
  running the same steps (`--dry-run` lists them: 8 steps, `check-boundaries`
  last). So **`ci-local.sh` is not fooled.** Its boundaries step compares the
  story's record with the commit, exactly as CI does, and with strays present
  it reports CI's FAIL. This was established by reading, not by a run, because
  a full `ci-local.sh` here is a 15-minute-plus selftest.
  One interaction to know about: with an active story, `ci-local.sh`'s own
  `gates.sh` step rewrites `## Gate results` in the working tree before
  `check-boundaries` reads it. Today that re-records a stray-inclusive stamp,
  and the step then FAILs, which is the right verdict for the wrong reason.
  After this story it records a stamp that agrees. Under Option R it declines
  to record, and AC-5 says what the exit status is.
* So the defect affects exactly **two** readers: `gates.sh` when it records,
  and `check-boundaries.sh` run by hand. It is also the one CLAUDE.md tells
  you to run "after committing and before opening the PR".

**M-6. Existing assertions that pin today's behaviour.** Measured by running
candidate (a) as a mutation (`git add -A .` → `git add -u .` in
`gate_tree_hash`, through `scripts/mutate.sh`) over the `lib`, `gates`,
`worktree`, `gate-reminder` and `boundaries` suites.

    === mutate: .claude/hooks/lib.sh (1 line(s) changed by s/GIT_INDEX_FILE="\$idx" git add -A \. >/GIT_INDEX_FILE="$idx" git add -u . >/) ===
        FAIL a hook moves the hash
    lib: 196 passed, 1 failed
    gates: 92 passed, 0 failed
    worktree: 73 passed, 0 failed
    gate-reminder: 32 passed, 0 failed
    boundaries: 73 passed, 0 failed
    === mutate: command exited 0; restored (verified byte-for-byte against …/.claude_hooks_lib.sh.20260924T170114Z.362334.bak) ===

This matches the prediction made from reading M-1's rows. **Exactly one
existing assertion pins the defect:** `lib.test.sh:363-365`, `a hook moves
the hash`. It writes `.claude/hooks/lib.sh` into the fixture and never commits
it, so it passes only because untracked files are hashed. RED rewrites it so
that the file is tracked (or staged) before `h0` is taken, and earns it with
DV-3. **Two more become vacuous without failing:** `a command prompt does not
move the hash` and `a docs file does not move the hash` (`:360-362`) write
untracked files. Under the fix, an untracked file moves nothing whatever its
class, so these two would pass against a hash that counted markdown. RED
makes those files tracked as well, so that the negatives still discriminate
by class and not by tracking status. This is why AC-7 lists them. **Every
other assertion in the five suites is indifferent to the change.** It follows
that nothing in the suite today would notice the fix being reverted: that is
AC-1's job, and DV-2 X-A checks it.

**M-7. Which past stories created files, and whether those files were tracked
when `gates.sh` ran.** `git log --diff-filter=A` over `.claude/tests`,
`scripts` and `.claude/hooks`: the only story-cycle addition is HARNESS-008's
`worktree.test.sh`. It was committed in the RED commit `7215b22`, before the
gate record in `5d19583`. HARNESS-012 and HARNESS-013 added no files. Both
committed RED and GREEN before GATES (`a8134b6`, `4a0e72d`), and their
records say `commit: … (working tree had uncommitted changes)` only because
of docs and `VERSION`. **In this repository's practice, a new file is already
tracked when `gates.sh` runs.** `/advance-story` does not require that,
though, and a downstream project that writes a module in GATES to satisfy a
lint rule would hit the unstaged case. **The stray case happened in two
consecutive stories, and the new-file case has not happened at all.**

The stray flow also contains the one path to a silent wrong answer. The gates
**run** over the working tree, strays included. In a project whose test
runner collects by glob (vitest, pytest), an untracked `*.test.*` file is
executed and counted, and an untracked module can be imported by committed
code. With a tracked-only stamp, such a run records a hash that matches CI
while the gates judged a tree that CI will not have. CI's own `gates` job
re-runs the suite and would catch an import that breaks, but the recorded
stamp itself would claim more than it knows. This is the argument for Option
R below.

### Candidates

| | stray `.patch` present (the specimen) | new gated file, staged | new gated file, unstaged | cost |
|---|---|---|---|---|
| **today** | local passes, CI FAILs: silent until the PR | correct | correct | none, until it bites |
| **(a) hash tracked + staged** (M-3, row C) | stamp = CI's, and local `check-boundaries` agrees (AC-1, AC-2) | correct (M-4) | stamp omits it, and after the commit **both** local `check-boundaries` (REVIEW step 3) and CI refuse: loud, but found one step late | a stray that a runner collects is judged but not stamped (M-7) |
| **(b) refuse or warn, hash unchanged** | the specimen blocks or warns on every run, and **local `check-boundaries` stays wrong** (it still hashes the strays) | correct | named at `gates.sh` time | does not fix the verifier, so HARNESS-012's worktree dance remains. **Rejected on its own** |
| **(c) tracked + untracked inside `touches:` / `## Contract` paths** | stray excluded | correct | correct if declared | CI cannot reproduce it. `check-boundaries.sh` has no active-story context on CI and would need to parse frontmatter to rebuild a hash. `touches:` is not enforced, and CLAUDE.md says nothing checks a declaration against the diff. `gates.sh` with no active story (CI, `ci-local`) has no paths at all. **Rejected**: it makes the stamp's meaning depend on an unchecked declaration |
| **(a) + name them, W: warn and record** | named each run. Stamp = CI's | correct | named at `gates.sh` time, and refused locally at REVIEW step 3 if ignored | the specimen prints four lines on every run |
| **(a) + name them, R: refuse to record** | with an active story, no record until the strays are staged, moved or excluded (`.git/info/exclude`, the user's choice). With no story, no refusal | correct | refused at `gates.sh` time, the earliest point | this checkout cannot record a gate run until the user excludes or moves the four `.patch` files, once |

**PO-A. Recommendation: (a) plus naming, with Option R.** (a) is the part
that fixes the defect. It is the only candidate that makes the local
verifier and CI compute the same thing, and it measured equal to CI on the
real tree (M-3). Naming is the part that covers the opposite trap: an
unstaged new file is named at `gates.sh` time under either option. W and R
differ only in whether a record is written while the gates ran over files the
stamp does not describe. R is the honest one: the stamp means "the gates ran
against exactly this", and a user with a stray they mean to keep adds one line
to `.git/info/exclude` once (AC-6 makes that remedy real). W is the
convenient one. It is still correct for CI, but the recorded stamp can claim
less than the gates saw (M-7). That is a product decision about how loud the
harness is about the user's own files, so it goes to the user.

**PO-B. Relation to HARNESS-001.** HARNESS-001 ("Gate record tree stamp is
verified end to end", `type: chore`, `depends_on: []`, still PLANNED) targets
the same stamp at the same three sites. Its line numbers are stale
(`gates.sh:191` is now `:206`, `check-boundaries.sh:294` is now `:370`, and
`lib.sh:637` is now inside `_hash_blob_listing` at `:1023`). **Its criteria
appear to be satisfied already.** Commit `9fbd39d` ("Construct the violating
input for law 1 and law 3", 2026-09-15, the day the audit was filed) added
`boundaries.test.sh:1195-1222`:
* `and the stamp gates.sh wrote IS that hash` covers HARNESS-001's AC-2;
* `a stamp describing a different tree is refused` covers AC-1;
* `a test changing alone breaks the stamp too` covers AC-3;
* `run_boundaries` now captures `$rc`, and `refused` asserts that it is
  non-zero (`:32-49`), which covers AC-4.

The filing PO checked one of these rather than taking it from the
reading. HARNESS-001's own AC-2 mutation, through `scripts/mutate.sh`:

    === mutate: scripts/gates.sh (s#tree="\$(gate_tree_hash)"#tree=0000000#) ===
        FAIL and the stamp gates.sh wrote IS that hash
             expected: b37e2e9e04a492c81def59bae10190ad47147ce8
             actual:   0000000
    boundaries: 69 passed, 4 failed
    === mutate: command exited 1; restored (verified byte-for-byte against …/scripts_gates.sh.20260924T164550Z.330169.bak) ===

(The run took 14m48s, and 4 assertions fail rather than 1 because the other 3
depend on a matching stamp.) So **the orchestrator's premise, that
HARNESS-014 goes first "so HARNESS-001 pins the corrected behaviour", does not
hold as stated**. HARNESS-001's criteria say nothing about untracked files, and
the corrected behaviour is pinned by HARNESS-014's own AC-1 to AC-3. **The
order does not matter to HARNESS-001's criteria.** It matters only for
conflicts: the two touch `lib.sh`'s hash, `gates.sh:206`,
`check-boundaries.sh:367-370` and `boundaries.test.sh`, so they must not run
in parallel worktrees. **Recommendation to the user, not acted on:** check
AC-1, AC-3 and AC-4 of HARNESS-001 by their own mutations and, if they are
killed, close HARNESS-001 as already delivered by `9fbd39d`, rather than add
`depends_on: [HARNESS-014]` to it. If it is kept, adding `depends_on:
[HARNESS-014]` is harmless, and whether to do so is the user's call.
HARNESS-001's criteria were not edited.

`bash scripts/plan.sh conflicts` for the pair: `UNKNOWN   HARNESS-001 +
HARNESS-014 no Contract paths declared yet - cannot judge`. Neither story has
a Contract. **By hand: CONFLICT**, on the four files above. (The command
exited 1 because of an unrelated real conflict, `HARNESS-006 + HARNESS-009` on
`scripts/plan.sh` and `.claude/tests/plan.test.sh`.)

**PO-C. Sizing: one story, not split.** The candidate is one computation in
`gate_tree_hash` (C, measured), a listing plus a branch in `gates.sh`, and one
sentence in `/advance-story`. Every criterion falls in one of three suites the
harness already has, and each can be tested in isolation. Splitting "fix the
hash" from "name the files" would ship (a) alone for one story. By M-4, that
turns the unstaged-new-file case from correct into a mismatch found one step
late, with nothing naming the cause. The two halves are one behaviour: the
stamp means the commit to be, and the harness says when the working tree
holds more than that.

**PO-D. Oracle partition, for the Contract.** Every criterion is
**mechanical**: fixture repositories, hash equality against
`gate_tree_hash_of`, whole-line counts of `    UNTRACKED  <path>`, exit
statuses. There is no metric to invent. The one settled number is AC-8's
floors, which are read from `selftest.sh`.

## Open question - DECIDED: Option R (the user, 2026-09-24)

**When a full `gates.sh` run with an active story finds untracked gated
files, does it record anyway (W) or refuse to record (R)?** The hash fix is
the same under both. What differs is `gates.sh`'s record-and-exit branch and
AC-5's wording.

* **Option W: warn and record.** The `UNTRACKED` lines are printed. The record
  is written with the tracked-plus-staged stamp, which equals CI's. Exit
  status is the gates' own.
  *For:* nothing blocks. The specimen in this checkout costs four lines of
  output per run and nothing else. *Against:* the recorded stamp can describe
  less than the gates ran over, when a runner collects an untracked test or
  committed code imports an untracked module (M-7). An unstaged new file is
  named, but if the name is ignored, the mismatch surfaces one step later, at
  REVIEW step 3.
  *Measured cost here:* none. Gate runs in this checkout record correctly with
  the specimen in place.
* **Option R: refuse to record.** The `UNTRACKED` lines are printed. With an
  active story, `## Gate results` is left unchanged, a `(not recorded: …)`
  line gives the reason and the two remedies (stage the file, or exclude or
  move it), and the exit is non-zero. With no active story (CI, `ci-local`'s
  gates step), there is no refusal.
  *For:* a record exists only when the gates judged exactly the stamped tree.
  An unstaged new file is caught at the earliest point. *Against:* in this
  checkout no story can record a gate run until the user moves the four
  `.patch` files or adds them to `.git/info/exclude`, once.
  *Measured cost here:* four files, one exclude line (for example
  `handoff-world-080/*.patch`), done by the user and never by the story.

**PO recommendation: R** (PO-A). AC-5 must be rewritten to the chosen option
before the story leaves PLANNED, and the decision recorded here as PO-1, with
who made it.

**PO-E. The Open question is decided: Option R.** The user answered "R" on
2026-09-24, in the session that filed the story. With an active story, a full
`gates.sh` run that names untracked gated files does not record a result, and
exits non-zero. AC-5 was rewritten to that form on `main` before the story
left PLANNED, so the base branch carries the final criterion and no
`## Amendments` entry is needed. (HARNESS-013 rewrote its criterion on its
story branch instead, and `check-boundaries.sh` then required amendment A-1.)
**One consequence for this checkout:** before this story's own GATES can
record, the user's untracked `handoff-world-080/*.patch` files must be
excluded (for example with a line in `.git/info/exclude`) or moved. The story
never does either itself (Out of scope). The orchestrator puts that to the
user when GATES arrives.

**PO-F. A refused run does not discharge GATES (PLANNED → RED, 2026-09-24).**
Under Option R a full run that declines to record still writes
`.claude/state/last-gate-run`. If that stamp said `FULL=yes`, the Stop hook
(`gate-reminder.sh:111`) would treat GATES' obligation as met by a run that
left `## Gate results` untouched. So C-4 pins `FULL=no` for a refused run. It
follows from AC-5 rather than adding scope; it is a contract pin, not an AC,
and RED may test it.

**PO-G. PLANNED → RED checks (2026-09-24, against `80bf504`).**
* *Epic done-when:* `epic:` is empty; this is a standalone harness fix, so
  there is no epic promise for it to fall short of.
* *Required gate:* `project.conf:227-234` gives all eight gates an empty command
  (`BOOTSTRAPPED=no`), so no `gates.sh` gate reads this artifact and none can
  be escalated into `required_gates`. The binding check is `selftest.sh`'s
  `lib`, `gates` and `boundaries` suites, a required CI step (`gates.yml`).
  `required_gates: []` stays.
* *Callers:* C-8, re-grepped; no signature changes.
* *Deferred verifications:* DV-1 to DV-3, all owned by GATES, already written.
* *`touches:`* corrected from `VERSION` to `.claude/harness/VERSION`, the
  file that actually carries the release number.

**PO-H. The specimen is excluded, by the user's decision (GATES, 2026-09-24).**
DV-1 ran first, against the specimen untouched. Before the full `gates.sh`
run, the user was asked how to clear the four `handoff-world-080/*.patch`
files that the refusal (C-4) would otherwise name. The user chose "Exclude
them". On that instruction the orchestrator appended
`handoff-world-080/*.patch` to this checkout's `.git/info/exclude`. That file is
local and never committed; a copy of the previous version is at
`.git/info/exclude.pre-harness014`. The files themselves were not moved,
staged or edited. After the change, `untracked_gated` printed nothing. This is
the remedy AC-6 made real, used on the tree it was built for. The story diff
contains no part of it (`## Out of scope`).

**PO-I. Merged, and CI read (REVIEW → DONE, 2026-09-25).** PR #83 was merged
at 2026-09-25T01:59:04Z as `4521945`. First CI run on `613c56e`: `boundaries`
passed in 4s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/36082124964),
and its log reads `ok    gate record matches commit 613c56e (tree
e877e7dfbb8edd9f444c312c2b08c500a7bfaa25)`. That is the same tree the local
run in the main checkout reported, with the user's untracked files present.
`gates` passed in 1m29s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/36082125009);
its harness self-test step took 1m16s. Neither workflow sets
`timeout-minutes`, so both are far from a limit. No gate went through the
*pending CI* path.
