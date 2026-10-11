---
id: HARNESS-013
title: The LOCAL alarm counts only release refs as shipped
slug: the-local-alarm-counts-only-release-refs
epic: 
type: fix
status: done
phase: DONE
branch: story/HARNESS-013-the-local-alarm-counts-only-release-refs
depends_on: [HARNESS-012]  # story ids; phase.sh refuses to start this story until they are DONE
touches: [scripts/refresh-harness.sh, .claude/tests/refresh.test.sh, .claude/tests/floors.conf, .claude/tests/selftest.test.sh]  # files this story expects to write
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

**HARNESS-012 fixed the alarm for objects no ref reaches. It left it switched
off for objects the WRONG ref reaches, and the incident that motivated
HARNESS-012 is one of those in any clone that fetched at the wrong time.**

`refresh-harness.sh` warns before it overwrites a downstream file that upstream
has never shipped (the LOCAL report, H26). Since release 51 it asks whether the
downstream blob is reachable from upstream:

    scripts/refresh-harness.sh:255   (release 51)
      up_reachable="$(git -C "$UP" rev-list --objects --all 2>/dev/null | awk '{print $1}')"

`--all` means every ref plus `HEAD`. So every ref is treated as a release, and
these still silence the alarm (HARNESS-012 PO-5 names them and defers them here):

* a **live stash** in the upstream checkout (`refs/stash`);
* a **fetched PR** kept as a ref (`refs/pull/*`, or a remote-tracking `pr/*`);
* a **remote-tracking experiment branch** (`refs/remotes/origin/<throwaway>`).

**The third is the sharp one.** HARNESS-010 pushed manga-translator's hooks to a
throwaway branch, `xcompare/HARNESS-010`, so that it could run a comparison on
CI. That branch was later deleted on origin. The push that deleted it also
removed the tracking ref in the clone that made the push, which is why this
repository's store holds the blobs as dangling objects and HARNESS-012 could see
them. **Any other clone** that fetched while the branch existed, and has not
run `git fetch --prune`, still has `refs/remotes/origin/xcompare/HARNESS-010`.
In that clone `--all` reaches the blobs, and the four reconciled files
HARNESS-012 brought back into the report drop out again. This was reproduced
against the real script and the real commit (Notes, M-3): 17 LOCAL becomes 13.

Pruning is not something the refresh can rely on. This clone has **40**
remote-tracking refs whose branches no longer exist on origin (M-1). Clones
that have never been pruned are the normal case.

The question this story answers: **which refs count as a release?** `--all` is
too wide. Narrowing it has a cost in the opposite direction, because each ref
dropped from the set can produce new false alarms. HARNESS-012's AC-2 (the
quiet half) exists because an alarm that fires for every file a project behind
by several releases carries is an alarm nobody reads. The measurements in
`## Notes` show which narrowings cost that silence and which do not. **One of
the narrowings needs a product decision (`## Open question`), which must be
answered before this story leaves PLANNED.**

**Required gate.** `BOOTSTRAPPED=no`, so all eight `gates.sh` gates are
UNCONFIGURED (as for HARNESS-008 through HARNESS-012). The thing that fails if
this artifact breaks is `bash scripts/selftest.sh refresh`, which runs in CI as
a required step. `required_gates: []` is the honest value.

## Acceptance criteria

Every "LOCAL" or "not LOCAL" below is judged by a `--dry-run` report line of the
exact form `    LOCAL     <path>` (four spaces, `LOCAL`, five spaces, the
path), matched as a whole line. It is never judged by the word `LOCAL`, which
also appears in the report's explanatory paragraph.

- **AC-1: a live stash is not a release.** Given a downstream file whose
  content is reachable in upstream only from `refs/stash`, the refresh lists it
  as LOCAL. *Control:* in the same fixture, a second file whose content is
  committed on upstream's default branch is NOT listed.
- **AC-2: a remote-tracking branch other than the default's upstream is not a
  release.** This is the sharp case. Given a downstream file whose content is
  reachable in upstream only from `refs/remotes/origin/<b>`, where `<b>` is not
  the default branch (the stale-experiment case), the refresh lists it as LOCAL.
  *Control (a quiet-half case):* upstream's local default branch is behind
  `refs/remotes/origin/<default>`, and the downstream file's content is
  reachable only from `origin/<default>`. That file is NOT listed. This is a
  project refreshed from a newer clone and now checked against an older one.
  Measured on real trees, dropping this ref costs 4 false alarms (Notes, M-5).
- **AC-3: a fetched PR ref is not a release.** Given a downstream file whose
  content is reachable in upstream only from `refs/pull/<n>/head`, the refresh
  lists it as LOCAL. *Control:* after the same commit is merged into the default
  branch, the file is NOT listed.
- **AC-4: the quiet half holds.** In the same run as the positive cases in
  AC-1 to AC-3, a downstream file whose content matches an OLDER release on the
  default branch is NOT listed. That means a commit at least one release before
  the default branch's tip, not the tip itself. The existing quiet-half
  assertions in `refresh.test.sh` stay green: `while merely being behind is
  silent`, `a project holding upstream's own files is told nothing`, and
  `while a scripts/ file matching upstream is silent`.
- **AC-5 - an unmerged local branch is not a release.** Given a downstream
  file whose content is reachable in upstream only from a local branch
  `refs/heads/<b>` that is not the default branch and is not merged into it,
  the refresh lists it LOCAL. Only the default branch, its `origin`
  counterpart and HEAD count as shipped (user decision, 2026-09-24 - see
  `## Open question` and PO-1). *Control:* the same content, after `<b>` is
  merged into the default branch, is NOT listed.
- **AC-6: an upstream whose default branch cannot be identified does not cry
  wolf.** Given an upstream with no `refs/remotes/origin/HEAD`, no `main` and no
  `master`, a downstream file whose content is reachable from upstream's
  checked-out branch is NOT listed. An upstream the script cannot classify is
  not evidence that the content was never released. The refresh script's
  source-branch NOTE already follows this rule (lines 167-170 at release 51).
  *Control:* in the same fixture, content reachable only from `refs/stash` IS
  listed. Excluding the stash must not depend on finding a default branch.
- **AC-7: nothing HARNESS-012 fixed comes back, and the no-history guard is
  not weakened.** HARNESS-012's dangling-blob assertions (content in upstream's
  store that no ref reaches is LOCAL, at all three walks) still pass. A shallow
  or single-commit upstream still reports that it could not check. Neither
  outcome is presented as a clean result. The diff to the `up_has_history`
  branch is expected to be empty.
- **AC-8: the floor is raised in both places.** `.claude/tests/floors.conf` and
  the `COUNTS` table in `.claude/tests/selftest.test.sh` (currently line 452,
  `refresh 79`) record the same new count for `refresh`. *Control:* the value
  is the executed assertion count reported by `bash scripts/selftest.sh
  refresh`, not a count of `assert_` call sites. `bash scripts/selftest.sh
  selftest` passes, which is how the two records are checked to agree.

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

**Pinned at PLANNED on 2026-09-24, after the user chose Option B (PO-1).
RED may amend any block below in place, giving its reason next to it, and GREEN
builds what the amended block says.** The acceptance criteria are frozen from
here; this section is not.

Everything the story changes is in `scripts/refresh-harness.sh`, in **one
line**: the one that computes `up_reachable` (line 255 at release 51). The
three walks, `up_shipped`, the `up_has_history` guard, the report text and the
copy loop do not change.

### C-1. The release set

`up_reachable` is computed from exactly these starting points and no others:

| ref | included when | why |
|---|---|---|
| `HEAD` | always | The content being installed comes from HEAD's working tree. Dropping it makes a second refresh from the same checkout report the first refresh's files as LOCAL. It is also the whole set when no default branch can be found (AC-6). |
| `$src_default` | when it is non-empty | The release line. See C-2 for how it is resolved. |
| `refs/remotes/origin/$src_default` | when `$src_default` is non-empty **and** `git -C "$UP" rev-parse --verify --quiet refs/remotes/origin/$src_default` succeeds | Covers a local default branch that is behind its origin (AC-2's control). M-5's last column measured 4 false alarms without it. |

Nothing else: no `--all`, `--branches`, `--remotes` or `--tags`, and no
`--reflog`. A stash, a PR ref, a stale tracking branch, or a local branch not
merged into the default therefore reaches nothing on its own (AC-1, AC-2,
AC-3, AC-5). Tags are left out because this repository does not use them
(M-4), and adding a starting point nobody uses only widens what can suppress
the alarm. If upstream starts tagging releases, that is a new story.

The call stays one `rev-list --objects <starts…> | awk '{print $1}'` with the
same `2>/dev/null`. Build the list of starting points as a bash array, or as a
word list with no globbing. **`$src_default` comes out of `symbolic-ref`, so
never let the shell split or glob it:** a branch name can contain characters
that do both.

**RED amendment, 2026-09-24 - a suggested spelling, not a requirement.** DV-2
and DV-3 are `sed` expressions, and a `sed` expression needs a line to match.
RED's mutation table (Handoff) is written against this shape; GREEN may spell
it differently, and GATES then adjusts the expressions, never the predictions:

    up_starts=(HEAD)
    if [ -n "$src_default" ]; then
      up_starts+=("$src_default")
      git -C "$UP" rev-parse --verify --quiet "refs/remotes/origin/$src_default" >/dev/null 2>&1 \
        && up_starts+=("refs/remotes/origin/$src_default")
    fi
    up_reachable="$(git -C "$UP" rev-list --objects "${up_starts[@]}" 2>/dev/null | awk '{print $1}')"

An array, so `$src_default` is never split or globbed. `"${up_starts[@]}"` on
an empty array is fine under `set -u` in bash 4.4+ (Git Bash and ubuntu both
ship 5.x), which only matters for DV-3's "drop HEAD" mutation. GREEN's choice
whether to spell the default as `refs/heads/$src_default` or append `--` to
the `rev-list`; the suite cannot see either.

### C-2. The default branch has one definition: reuse `$src_default`

The "not a release" NOTE block (lines 163-188 at release 51) already resolves
the default branch: `origin/HEAD`'s target with the `origin/` prefix removed,
then `main`, then `master`, keeping the first candidate that resolves with
`rev-parse --verify`. **The LOCAL check reads the same variable. It does not
resolve the default a second time.** Two definitions of "the release line"
would drift apart, and the NOTE and the alarm would then disagree about the
same checkout. The NOTE block runs whenever `$UP` is a git directory, and the
LOCAL check runs only when `up_has_history=1`, which implies that. So
`$src_default` is always set, possibly to the empty string, before it is read.

When `$src_default` is empty, the set is `HEAD` alone (AC-6). The stash is
still excluded, because it is not in the list.

### C-3. What does not change

* `up_shipped`, its whole-line `case` test, and the three call sites.
  HARNESS-012's AC-3 control ("a fix at one site leaves two red") still
  applies, although this story does not touch the sites.
* The `up_has_history` guard, byte for byte (AC-7). The diff there is expected
  to be empty.
* Every line of the report, including the per-file shape `    LOCAL     <path>`.
* The copy loop. This story changes what the report SAYS, never what the
  refresh DOES.
* `src_default`'s resolution. It is read, not rewritten. If RED or GREEN finds
  it wrong, that is a separate defect: report it rather than fixing it here.

### C-4. Callers of changed behaviour: the existing assertions that pin Option A

No function or exported signature changes. The one behaviour change that has
existing callers is the membership of `up_reachable`. `grep` over the tree at
`0c7138a` finds its only consumers in `.claude/tests/refresh.test.sh`, in the
block `describe "LOCAL asks whether upstream ever SHIPPED the blob…"`, lines
~318-441:

| line (≈) | what | status under Option B |
|---|---|---|
| 420-423 | comment "whether or not it is the default one" | **wrong**: rewrite it |
| 424-430 | fixture: commit the three contents to a local branch `survives`, never merged | still valid as a fixture. It is now AC-5's positive case |
| 431-434 | three `fixture: <f> is now reachable from the surviving branch` assertions, reading `rev-list --all` directly | still true, but no longer the script's question. Rewrite them to name what they check |
| 436-440 | three assertions: `once a surviving ref reaches the blob, walk N is silent` | **contradict Option B.** Under B that content is LOCAL |

**What RED does with them.** The shape is RED's to choose. The suggestion,
because it reuses the fixture and loses no coverage: keep the `survives`
fixture, and flip the three 436-440 assertions to assert that the file IS
listed. That makes them AC-5's positive case at all three walks, and they
fail today, so the RED run itself watches them fail. Then merge `survives` into
the default branch and assert all three silent. That is AC-5's control, and it
keeps HARNESS-012's AC-1 control ("after its blob becomes reachable from a
commit, not listed"). **The merged-control assertions pass on arrival**, so
each must name the mutation that earns it (DV-3).

No other assertion in the suite was found to depend on a non-default ref
counting as shipped (M-7). RED's handoff **states that it re-checked this
against the tree**, by running the suite against the unchanged script and
reading which assertions change result, and does not repeat this table.

**The fixture's default branch.** Line 48 creates the upstream fixture with a
plain `git init -q`. Its default branch is therefore whatever
`init.defaultBranch` says, which is `master` on this machine and on ubuntu CI.
Under Option B that name decides whether content counts as shipped. A
developer whose git sets `init.defaultBranch=trunk` would send the whole suite
down AC-6's no-default path and make it pass or fail for reasons unrelated to
this story. **RED pins it: `git init -q -b master`**, or sets
`init.defaultBranch` in the suite's git environment, whichever the suite's
style prefers. Any other fixture this story creates does the same.

**RED amendment, 2026-09-24 - done, and the table above re-checked.** Line 48
now reads `git init -q -b master` (git here is 2.55.0.windows.5; `-b` needs
2.28+, and ubuntu-latest ships 2.4x). The AC-6 upstream is `git init -q -b
trunk`. The re-check was not a reading: the *unchanged* suite was run against
the release-51 script with `--all` mutated to `HEAD master` through
`scripts/mutate.sh` (restore verified byte-for-byte), and exactly the three
`once a surviving ref reaches the blob, walk N is silent` assertions changed
result - `76 passed, 3 failed`, nothing else moved. The "source ref is named"
block, the only other place the fixture leaves the default branch, asserts on
the NOTE and never on a LOCAL line, so the table is complete. One shape change
the table did not anticipate: **the merged controls (AC-3's and AC-5's) read
their report with HEAD detached at `master~1`**, so that `$src_default` is the
only member of the set that vouches for the blob and DV-3's "drop
`$src_default`" mutation is visible. From a checkout on master it is not.

### C-5. Fixture recipes for the refs a unit test cannot `git push` to

The fixtures have no remote, so every ref is made with `git update-ref`. That
is the same thing the real case is: a ref the clone holds.

* **Stale tracking branch (AC-2, positive):** commit the content on a
  throwaway branch, then `git update-ref refs/remotes/origin/xcompare/exp
  <that commit>`, `git checkout -q master`, `git branch -qD <throwaway>`.
* **Default behind origin (AC-2, control):** commit the content on `master`,
  `git update-ref refs/remotes/origin/master HEAD`, then `git reset -q --hard
  HEAD~1` on `master`. The content is now reachable only from
  `origin/master`. The fixture is not a clone, so `origin/HEAD` does not exist
  and `$src_default` resolves through the `master` candidate. That is the same
  path the real case takes when `origin/HEAD` is missing, which is common.
* **PR ref (AC-3):** as the stale branch, but `refs/pull/7/head`. For the
  control, merge that commit into `master` (`git merge -q --no-edit <commit>`)
  and assert silence.
* **Live stash (AC-1):** write the content into the tracked file on `master`,
  run `git stash -q`, and leave the stash in place. `refs/stash` now reaches
  the blob. Check that with `git rev-list --objects refs/stash`, not
  `cat-file -e`.
* **No identifiable default (AC-6):** `git init -q -b trunk` in a fresh
  upstream, with no `main`, no `master` and no `origin/HEAD`. Commit twice, so
  that `up_has_history=1` still holds; otherwise the guard answers first and
  the test measures AC-7 instead.

**Every positive fixture proves its own precondition before it reads the
report**, as HARNESS-012's did. The blob is reachable from the injected ref,
and it is NOT reachable from the release set, computed by hand with
`rev-list --objects HEAD master [origin/master]`. Otherwise a red can come from
a fixture that did not arrange what it claims.

**RED amendment, 2026-09-24 - what the recipes needed when tried.** All five
did what they claim; every `fixture:` assertion in the RED run is green.
Details that were not in the recipe:

* **Stash.** `git stash` did not need an identity here (probed with
  `HOME=/nonexistent` and no config: exit 0), but the fixture passes `-c
  user.email=t@t -c user.name=t` anyway, as every commit in the suite does, so
  it cannot depend on the runner's config. Checked with `rev-list --objects
  refs/stash`, as the recipe says.
* **Stale branch and PR ref** share one helper, `side_commit <ref> <file>
  <content>`: branch `_side` from master, commit, `update-ref <ref> HEAD`,
  `checkout master`, delete `_side`. Master and the working tree are as found.
* **Merged controls** (AC-3, AC-5): after `merge --no-ff --no-edit` the report
  is read with HEAD detached at `master~1` (C-4 amendment says why), proved by
  `symbolic-ref -q HEAD` being empty and the blob reachable from `master`
  and not from `HEAD`. Then `checkout master`.
* **Default behind origin**: as written; afterwards `merge --ff-only
  refs/remotes/origin/master` brings master back level so the blocks below see
  the tip they expect. The refs made here - `refs/stash`,
  `refs/remotes/origin/xcompare/exp`, `refs/pull/7/head`,
  `refs/remotes/origin/master` - are **left in place**, so every later block
  now runs against a checkout that holds all four. None of them asserts on a
  LOCAL line, and the whole run is green below the new block.
* **No identifiable default**: the same fixture also carries a stash, for AC-6's
  control, made the same way. `rev-list --count HEAD` is asserted to be 2 so a
  fixture that lost a commit fails as AC-6 and not as AC-7.
* **The release set by hand** is one helper, `release_ids <repo> <default>`,
  which builds `HEAD <default> [refs/remotes/origin/<default>]` exactly as C-1
  says and never reads the script - so no mutation of the script's set can move
  a fixture assertion.

### C-6. Oracle partition

* **AC-1 to AC-7: mechanical.** Each is a fixture upstream with refs arranged
  by hand, plus a whole-line count of `    LOCAL     <path>` in a `--dry-run`
  report, compared with `assert_eq` against exactly 0 or exactly 1. There is no
  metric to invent. **The needle:** the word `LOCAL` also appears in the
  report's explanatory paragraph, so match the per-file line whole
  (`grep -cx`), as HARNESS-012's `local_line_count` helper already does.
  **Reuse that helper; do not write a second one.**
* **AC-8: settled.** Read the number off `bash scripts/selftest.sh refresh`.
  The floor is the executed count, and it is recorded twice: in `floors.conf`
  and in `selftest.test.sh`'s `COUNTS` table (`refresh 79` today).

### C-7. Baselines to read out, not re-derive

* **Suite before the story:** `refresh: 79 passed, 0 failed` at `0c7138a`
  (release 51, measured in HARNESS-012's closing run).
* **Real tree:** manga-translator is at 17 LOCAL at `76ed934`, and 13 with the
  stale ref injected (M-2, M-3). DV-1 compares two runs against each other and
  never uses a fixed number.
* **Cost:** unchanged in kind. It is still one `rev-list` and one `awk` per
  refresh, and HARNESS-012 measured that as 0.08s here. A narrower set walks
  **fewer** objects than `--all`, never more.

### Test-only dependencies

None.

## Deferred verifications

### DV-1. Probe against a real tree: the stale-tracking-ref case, with the real commit

*Condition.* Use a `--no-hardlinks` clone of this repository at the story's
merge base. Give it `refs/remotes/origin/xcompare/HARNESS-010` pointing at the
real throwaway commit `83add19415d3d0ad7aaff9a3ca84dee3a868d612`, which is
still in this repository's store as an unreachable commit. With that clone as
upstream, a dry run of `../manga-translator` **must** list
`.claude/hooks/lib.sh`, `.claude/hooks/phase-guard.sh`,
`.claude/tests/phase-guard.test.sh` and `.claude/tests/_lib.sh` as LOCAL. At
release 51 it does not: 13 LOCAL against 17 without the ref (Notes, M-3).
Everything else in the LOCAL list must be unchanged from the same run without
the ref. That second check is the quiet half against a real tree. It is
**not** checked against a fixed number, because manga-translator moves (see M-2).

*Why not RED.* This probes the fix itself, and during RED the fix does not
exist. RED's fixtures reproduce the same shape on a small scale. This entry is
the real-tree check that `rules.md` requires for a change to a rule that judges
a tree. The clone and the ref live in a scratch directory. Nothing is written to
this repository or to manga-translator except the refresh's own self-copy under
manga-translator's gitignored `.claude/state/`, which the script removes.

*Caveat for whoever runs it.* A plain `git clone` of a local path does not copy
unreachable objects. Use `--no-hardlinks` and check `git cat-file -t 83add19`
before creating the ref. If `gc` has pruned the commit by then, say so and
rebuild the equivalent by committing manga-translator's four files on a branch
in the clone, then moving that branch to `refs/remotes/origin/`.

**Owner: GATES**

**Result (GATES, 2026-09-24, run by the orchestrator): PASS.** The scratch
clone is a `git clone --no-hardlinks` of this repository, checked out at the
GREEN commit `4a0e72d`. `origin/HEAD` points to `origin/main` and a local `main`
exists, as in a real clone. (A clone of this checkout otherwise takes the story
branch as its default.) `git cat-file -t 83add19…` printed `commit`, so gc had
not pruned it. The downstream is manga-translator at `30bdc9a`, which has moved
since M-2's `76ed934`. Four dry runs, each LOCAL list sorted:

    green-plain: 20 LOCAL        # GREEN, no stale ref
    green-stale: 20 LOCAL        # GREEN, + refs/remotes/origin/xcompare/HARNESS-010 -> 83add19
    r51-stale:   19 LOCAL        # the same clone checked out at release 51 (0c7138a), + the stale ref
    r51-plain:   20 LOCAL        # release 51, the ref deleted again
    --- green plain vs green+stale ref (must be identical) ---
    IDENTICAL
    --- release 51 plain vs release 51+stale ref (control: must lose files) ---
    4d3
    <     LOCAL     .claude/hooks/phase-guard.sh

All four files the condition names are in GREEN's list, both with and without
the stale ref (`.claude/hooks/lib.sh`, `.claude/hooks/phase-guard.sh`,
`.claude/tests/phase-guard.test.sh`, `.claude/tests/_lib.sh`). Nothing else in
the list moved. The release-51 control shows the probe works on the real tree:
the same stale ref silences a file there.

**It silences one file, not the four M-3 measured, and that difference is
explained rather than ignored.** At `30bdc9a`, only `phase-guard.sh`'s content
is reachable from `83add19`. The other three hash to blobs not in that commit's
history (checked with `rev-list --objects 83add19`). `_lib.sh` changed in MT-040
(`d668336`), which landed between the two measurements, and `lib.sh` and
`phase-guard.test.sh` were not rechecked against `76ed934`. The condition is
stated relative to the runs, not as a count, and it holds.

### DV-2. The wrong-VALUE mutation: put `--all` back

*Condition.* With the fixed ref set mutated back to `--all` through
`scripts/mutate.sh`, the positive assertions for AC-1, AC-2 and AC-3 **must**
fail (at least three). No quiet-half assertion may fail. RED predicts the exact
count in its mutation table, and GATES compares against that prediction. A
second mutation that drops only `origin/<default>` from the set **must** turn
AC-2's control red.

*Why not RED.* There is no fixed ref set to mutate until GREEN.

**Owner: GATES**

**Result (GATES, 2026-09-24, run by the orchestrator): PASS, both halves exactly as RED predicted.** Run through `scripts/mutate.sh` against GREEN `4a0e72d`, one mutation at a time. Each restore was verified byte for byte.

(a) X-A, `--all` put back, predicted 9, with no quiet-half failure:

    === mutate: scripts/refresh-harness.sh (1 line(s) changed by s/rev-list --objects "\${up_starts\[@\]}"/rev-list --objects --all/) ===
    === mutate: running bash scripts/selftest.sh refresh ===
        FAIL an unmerged local branch is not a release: its content is LOCAL - walk 1, .claude/hooks
        FAIL and at walk 2, scripts/*.sh
        FAIL and at walk 3, the named files
        FAIL a live stash is not a release: content reachable only from refs/stash is LOCAL
        FAIL a stale remote-tracking branch is not a release: content reachable only from origin/xcompare/exp is LOCAL
        FAIL a fetched PR ref is not a release: content reachable only from refs/pull/7/head is LOCAL
        FAIL while the stash, in the same run, is still LOCAL
        FAIL while the stash, in the same run, is still LOCAL
        FAIL while content reachable only from refs/stash, in the same fixture, is LOCAL
    refresh: 113 passed, 9 failed
    FAIL refresh  did 113 units of work, below the floor of 122 in .claude/tests/floors.conf
    === mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_refresh-harness.sh.20260924T144547Z.75429.bak) ===

(b) X-B, `refs/remotes/origin/$src_default` dropped, predicted 1 (AC-2 control):

    === mutate: scripts/refresh-harness.sh (1 line(s) changed by s/up_starts+=("refs\/remotes\/origin\/\$src_default")/:/) ===
    === mutate: running bash scripts/selftest.sh refresh ===
        FAIL a local default branch behind its origin: content reachable only from origin/master is not listed
    refresh: 121 passed, 1 failed
    FAIL refresh  did 121 units of work, below the floor of 122 in .claude/tests/floors.conf
    === mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_refresh-harness.sh.20260924T145607Z.94414.bak) ===


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

### DV-3. Every assertion that passes on arrival is earned by a mutation

*Condition.* RED's handoff lists every new or rewritten assertion that is green
against the release-51 script. The expected set: AC-2's control (the content is
reachable only from `origin/<default>`, and release 51 reaches it through
`--all`), AC-3's and AC-5's merged controls, AC-4's older release, and AC-6's
positive case. Beside each, the handoff names a mutation of the shipped ref
set that **must** turn that assertion, and only a predicted few others, red.
Starting candidates, which RED sharpens:
* drop `refs/remotes/origin/$src_default` from the set: AC-2's control goes red (this is DV-2's second half);
* drop `$src_default` and keep `HEAD`: AC-3's and AC-5's merged controls go red **only if** the fixture's HEAD is not on the default branch at report time. Otherwise the mutation is invisible. RED says which, and if invisible, arranges HEAD so that it is not;
* add `--no-walk` to the `rev-list`, so only tip trees count: AC-4's older release goes red;
* drop `HEAD` when `$src_default` is empty: AC-6's positive case goes red.
GATES runs each through `scripts/mutate.sh`, compares the count with RED's
prediction, and pastes the output here.

*Why not RED.* The ref set these mutate is written in GREEN.

**Owner: GATES**

**Result (GATES, 2026-09-24, run by the orchestrator): PASS. Every prediction matched exactly, in count and in which assertions failed.** X-B is recorded under DV-2. RED's X-F (paths instead of ids) was also run: it is the mutation that earns assertion 38.

X-C, predicted 4:

    === mutate: scripts/refresh-harness.sh (1 line(s) changed by s/up_starts+=("\$src_default")/:/) ===
    === mutate: running bash scripts/selftest.sh refresh ===
        FAIL once the branch is merged into the default branch, walk 1 is silent
        FAIL and walk 2
        FAIL and walk 3
        FAIL once the PR is merged into the default branch, the same content is not listed
    refresh: 118 passed, 4 failed
    FAIL refresh  did 118 units of work, below the floor of 122 in .claude/tests/floors.conf
    === mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_refresh-harness.sh.20260924T150437Z.109216.bak) ===

X-D, predicted 4:

    === mutate: scripts/refresh-harness.sh (1 line(s) changed by s/rev-list --objects "\${up_starts\[@\]}"/rev-list --objects --no-walk "${up_starts[@]}"/) ===
    === mutate: running bash scripts/selftest.sh refresh ===
        FAIL while merely being behind is silent
        FAIL while a file from an older release, in the same run, is still not named
        FAIL while a file from an OLDER release of the default branch, in the same run, is still not named
        FAIL with no nameable default branch, content from the checked-out branch is not listed
    refresh: 118 passed, 4 failed
    FAIL refresh  did 118 units of work, below the floor of 122 in .claude/tests/floors.conf
    === mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_refresh-harness.sh.20260924T151156Z.127218.bak) ===

X-E, predicted 1:

    === mutate: scripts/refresh-harness.sh (1 line(s) changed by s/up_starts=(HEAD)/up_starts=()/) ===
    === mutate: running bash scripts/selftest.sh refresh ===
        FAIL with no nameable default branch, content from the checked-out branch is not listed
    refresh: 121 passed, 1 failed
    FAIL refresh  did 121 units of work, below the floor of 122 in .claude/tests/floors.conf
    === mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_refresh-harness.sh.20260924T152051Z.146741.bak) ===

X-F, predicted 12:

    === mutate: scripts/refresh-harness.sh (1 line(s) changed by s/awk '{print \$1}'/awk '{print \$2}'/) ===
    === mutate: running bash scripts/selftest.sh refresh ===
        FAIL while merely being behind is silent
        FAIL a project holding upstream's own files is told nothing
        FAIL while a scripts/ file matching upstream is silent
        FAIL while a file from an older release, in the same run, is still not named
        FAIL once the branch is merged into the default branch, walk 1 is silent
        FAIL and walk 2
        FAIL and walk 3
        FAIL while a file committed on the default branch, in the same run, is not
        FAIL while a file from an OLDER release of the default branch, in the same run, is still not named
        FAIL once the PR is merged into the default branch, the same content is not listed
        FAIL a local default branch behind its origin: content reachable only from origin/master is not listed
        FAIL with no nameable default branch, content from the checked-out branch is not listed
    refresh: 110 passed, 12 failed
    FAIL refresh  did 110 units of work, below the floor of 122 in .claude/tests/floors.conf
    === mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_refresh-harness.sh.20260924T152830Z.162129.bak) ===

After all six: `git diff --stat 4a0e72d -- scripts/` printed nothing, and 0 `.bak` files are left under `.claude/state/mutations/`.

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

### A-1. AC-5: from two open options to Option B (user, 2026-09-24)

* **Which:** AC-5.
* **What it said** (as filed on `main` in `0c7138a`): "a local branch that is
  not the default. THIS CRITERION IS NOT FINAL", followed by two alternative
  outcomes. *Option A*: content reachable only from an unmerged local branch is
  NOT listed. *Option B*: it IS listed, with a merge as the control.
* **What it says now:** Option B. Content reachable only from an unmerged local
  branch is listed LOCAL. *Control:* after the branch is merged into the
  default branch, the content is not listed.
* **Who approved it:** the user, in the session, answering the story's
  `## Open question` with "B" on 2026-09-24.
* **Why:** the criterion was filed deliberately unfinished, because the choice
  was a product decision (see `## Open question`, PO-1). It was rewritten while
  the story was still in PLANNED, before any test existed. It is recorded here
  because `check-boundaries.sh` compares criteria against the base branch, and
  the base carries the unfinished form. The diff cannot see that the change was
  made in PLANNED, and the change should be on record either way.
* **No subagent claim is involved.** No agent argued that a criterion was
  wrong, so there is nothing to reproduce. The change is the user's decision
  on a question the story itself asked.

## Model guidance

Planned by `bash scripts/plan.sh write HARNESS-013` from `.claude/harness/models.conf`.
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
| PLANNED (filing) | `lead-po` subagent | `opus` | `claude-opus-5-5` (self-reported) | dispatched by the orchestrator to file the story, with no model override | **met.** It measured before it recommended: M-5's table ruled out `--branches`, `--branches --tags` and `--branches --remotes` on real trees. It put the one real product fork to the user instead of guessing |
| PLANNED (contract) | `lead-po`, the orchestrator session | `opus` | `claude-opus-5-5` | no dispatch | RED amended three Contract blocks (C-1 spelling, C-4, C-5) and no acceptance criterion. See the RED row |
| RED | `test-developer` | `fable` | `claude-fable-5-1` (self-reported) | explicit `model: fable` on the dispatch | **met.** The success condition is sharp negative controls from a partitioned brief. Unprompted, it moved the merged controls to a HEAD detached at `master~1`, because the Contract's own DV-3 mutation ("drop `$src_default`") is invisible from a checkout on master. It re-checked C-4 by measurement, not by reading (`--all` → `HEAD master` on the unchanged suite: exactly the three `survives` assertions fell) |
| GREEN | `feature-developer` | `opus` | `claude-opus-5-5` (self-reported) | explicit `model: opus` | **met.** The tests were left untouched (`git diff --quiet a8134b6 -- .claude/tests/`) and the result is `122 passed, 0 failed`. It checked the orchestrator's mechanism claim before acting on it and found that claim was right: the Contract's own C-1 spelling would have added a false alarm that release 51 does not have (PO-3) |
| GATES | `feature-developer` | `opus` | **not dispatched**: the orchestrator session (`claude-opus-5-5`) ran it | `gates.sh` reports `0 ran, 8 unconfigured` (`BOOTSTRAPPED=no`), so there was no gate failure to fix. The orchestrator ran DV-1 to DV-3, bumped `VERSION` to 52 and ran `gates.sh` | not applicable. All six of RED's mutation predictions matched exactly, and the real-tree probe passed (DV-1 to DV-3) |
| REVIEW | `lead-po` | `opus` | the orchestrator session, `claude-opus-5-5` | no dispatch | **met.** PR #82 merged as `ebbc563` on 2026-09-24. Both CI checks passed on the first run (`boundaries` 5s, `gates` 85s), and in the CI log the `refresh` suite ran `122 passed, 0 failed` in 3.2s |

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Out of scope

<!-- Explicit non-goals. Prevents the Feature Developer from over-building. -->

- **Running `git fetch --prune`, `git stash drop`, `git gc`, or anything else
  that mutates the upstream checkout.** The refresh only reads upstream. It is
  somebody else's clone, and the 40 stale refs in this clone (M-1) are
  housekeeping for the user, not work for this story. The fix has to hold in an
  unpruned clone, because that is where the defect lives.
- **Changing WHICH files are replaced.** This story changes what the report
  SAYS. The KEPT/REPLACED copy loop does not change.
- **Changing what the "source is not a release" NOTE does.** The NOTE stays a
  warning and does not become a refusal. The story reuses the NOTE's
  default-branch resolution. It does not change it, and it does not change when
  the NOTE prints.
- **Introducing release tags or changing `VERSION`.** This repository has no
  tags (M-4). `VERSION` is the release marker, `51 (2026-09-23)`, and nothing
  parses it. "Tags only" is therefore not an available definition of a release,
  and tagging past releases is a separate decision for a separate story. Adding
  `--tags` to the ref set is PLANNED's choice (Notes, M-6). It makes no
  difference today.
- **The reflog question.** HARNESS-012 PO-5 settled it: reflogs are not roots,
  and `--reflog` stays out.
- **Remotes not named `origin`.** Both options use `refs/remotes/origin/<default>`
  as "the default branch's upstream", because the NOTE's resolution already
  assumes `origin`. An upstream checkout whose remote has another name (for
  example `upstream`) loses only AC-2's control case there. Its local default
  branch still counts. That is a known limit, to be recorded in the script's
  comment, not handled here.
- **The HEADs of other linked worktrees of the upstream checkout.** `--all`
  includes them. A narrower set includes them only through the branch each one
  has checked out. That is correct for this story's purposes and gets no
  special handling.
- **Porting manga-translator's MT-043 changes upstream.** M-2 found four new
  LOCAL files there, and they are real local edits. That is port-before-refresh
  work and belongs to its own round.
- **The cost of the ref set.** Every candidate set is smaller than `--all`
  (M-5, the `objects=` column), and the membership test is unchanged. If PLANNED
  finds a shape that costs more, it measures the cost as HARNESS-012 did. It
  must not choose a cheaper set that answers a different question.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

<!-- Filled by the Test Developer during RED: which tests, at which level,
     and which AC each one covers. -->

One level, as in HARNESS-012: the harness self-test `bash scripts/selftest.sh
refresh`, driving the real `scripts/refresh-harness.sh --dry-run` against
fixture repositories whose refs are arranged by hand. Every criterion is
mechanical (C-6): an `assert_eq` of exactly 0 or exactly 1 on
`local_line_count <path> <report>`, HARNESS-012's whole-line `grep -cx "    LOCAL
     <path>"`. No second helper was written for the needle. Three helpers were
added for the *fixtures*: `release_ids` (C-1's set by hand), `ref_ids` (one
ref's objects) and `count_id` (whole-line id match), plus `side_commit` in the
new block.

**Two places in `.claude/tests/refresh.test.sh` change.** The tail of
HARNESS-012's block `LOCAL asks whether upstream ever SHIPPED the blob…` is
rewritten (C-4), and one new block follows it: `LOCAL counts only the release
line as shipped: HEAD, the default branch, and its origin counterpart`. 79 ->
122 executed. Assertions are numbered below as they run within those two
blocks; 1-10 are HARNESS-012's, untouched.

| # | assertion (verbatim) | AC | on arrival (release 51) |
|---|---|---|---|
| 1-10 | HARNESS-012's dangling-blob fixture, walks 1-3, older release | AC-7 | green (7-9 were HARNESS-012's RED) |
| 11-16 | `fixture: <f> is reachable from the unmerged local branch 'survives'` / `fixture: and from nothing in the release set (HEAD, master)` (x3) | AC-5 precondition | green |
| 17 | `an unmerged local branch is not a release: its content is LOCAL - walk 1, .claude/hooks` | AC-5 | **RED** |
| 18 | `and at walk 2, scripts/*.sh` | AC-5 | **RED** |
| 19 | `and at walk 3, the named files` | AC-5 | **RED** |
| 20 | `fixture: HEAD is detached off the default branch for this report` | DV-3 precondition | green |
| 21-26 | `fixture: <f> is reachable from master once 'survives' is merged` / `fixture: and not from the detached HEAD, so only the default branch vouches for it` (x3) | AC-5 control precondition | green |
| 27 | `once the branch is merged into the default branch, walk 1 is silent` | AC-5 control | green (control) |
| 28 | `and walk 2` | AC-5 control | green (control) |
| 29 | `and walk 3` | AC-5 control | green (control) |
| 30-35 | `fixture: <f> is reachable from <ref>` / `fixture: and from nothing in the release set (HEAD, master)` for `refs/stash`, `refs/remotes/origin/xcompare/exp`, `refs/pull/7/head` | AC-1/2/3 precondition | green |
| 36 | `fixture: the run answered rather than refusing to check` | AC-7 guard not tripped | green |
| 37 | `a live stash is not a release: content reachable only from refs/stash is LOCAL` | AC-1 | **RED** |
| 38 | `while a file committed on the default branch, in the same run, is not` | AC-1 control | green (control) |
| 39 | `a stale remote-tracking branch is not a release: content reachable only from origin/xcompare/exp is LOCAL` | AC-2 | **RED** |
| 40 | `a fetched PR ref is not a release: content reachable only from refs/pull/7/head is LOCAL` | AC-3 | **RED** |
| 41 | `while a file from an OLDER release of the default branch, in the same run, is still not named` | AC-4 | green (control) |
| 42-44 | `fixture: HEAD is detached…` / `fixture: the PR's content is reachable from master once merged` / `fixture: and not from the detached HEAD` | AC-3 control precondition | green |
| 45 | `once the PR is merged into the default branch, the same content is not listed` | AC-3 control | green (control) |
| 46 | `while the stash, in the same run, is still LOCAL` | AC-1 (in-run control for 45) | **RED** |
| 47-49 | `fixture: master is an ancestor of origin/master, i.e. behind it` / `fixture: the content is reachable from refs/remotes/origin/master` / `fixture: and from neither HEAD nor master` | AC-2 control precondition | green |
| 50 | `a local default branch behind its origin: content reachable only from origin/master is not listed` | AC-2 control | green (control) |
| 51 | `while the stash, in the same run, is still LOCAL` | AC-1 (in-run control for 50) | **RED** |
| 52-56 | `fixture: no origin/HEAD, no main, no master - the script cannot name a default branch` / `fixture: and two commits, so the history guard does not answer first` / `fixture: the hook's content is reachable from the checked-out branch` / `fixture: the stashed content is reachable from refs/stash` / `fixture: and not from the checked-out branch` | AC-6 precondition | green |
| 57 | `fixture: the run answered rather than refusing to check` | AC-7 guard not tripped | green |
| 58 | `with no nameable default branch, content from the checked-out branch is not listed` | AC-6 | green (control) |
| 59 | `while content reachable only from refs/stash, in the same fixture, is LOCAL` | AC-6 control | **RED** |

**AC-4 in the same run.** Assertions 37, 39, 40 (the three positives) and 38,
41 (committed on master; an older release of master) read one report from one
fixture. The existing quiet-half assertions AC-4 names - `while merely being
behind is silent` (line 244), `a project holding upstream's own files is told
nothing` (267), `while a scripts/ file matching upstream is silent` (313) - are
untouched and green in the RED run.

**AC-7** is HARNESS-012's own assertions, executed and green in this run and
not duplicated: `fixture: <f> exists in upstream's store…` / `…no ref of
upstream reaches it…` (x3 each), `a local fix whose blob dangles in upstream is
named LOCAL - walk 1, .claude/hooks`, `and at walk 2, scripts/*.sh, which asks
the same question of its own blob`, `and at walk 3, the named files, whose line
has its own copy of the test`; and the no-history block's `a source with a
single commit says it could not check`, `while a source with real history still
answers`. Assertions 36 and 57 add the "answered" half inside the new fixtures
so a positive cannot go red for AC-7's reason.

**AC-8**: floor raised 79 -> 122 in `.claude/tests/floors.conf` (line 47, plus a
dated note at the foot) and in `selftest.test.sh`'s `COUNTS` table (line 452).
122 is the executed count read off the summary line `113 passed, 9 failed`.
`selftest.sh` compares the *passed* count against the floor, so `refresh` sits
below its floor until GREEN, as HARNESS-010/011/012 recorded.

**Which walk gets which file.** AC-5's three positives are one per walk, as
HARNESS-012's were (`.claude/hooks/phase-guard.sh`, `scripts/gates.sh`,
`.claude/harness/rules.md`). The new block's three positives are also one per
walk, deliberately: stash -> walk 1, stale tracking ref -> walk 2, PR ref ->
walk 3. The membership test is one helper, so a fix that reached one walk
reaches all three; spreading the refs over the walks costs nothing and keeps
each walk's line under a ref it has not seen before.

**Out of scope, pinned where cheap.** The four injected refs are left in the
fixture for every block that follows, so the copy loop, the hand-over and the
self-replacement cases now run against a checkout holding a stash, a PR ref,
a stale tracking ref and an `origin/master` - and all stay green, which is the
"changes what the report SAYS, never what the refresh DOES" non-goal observed
for free.

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

    bash scripts/selftest.sh refresh            # the suite; 7m15s wall on this machine today (2m15s in HARNESS-012's run)
    VERBOSE=1 bash scripts/selftest.sh refresh  # names every executed assertion

### The failure, verbatim (RED, 2026-09-24, tree at `0c7138a` + this RED diff, release-51 script untouched)

    === refresh ===

      it refuses to run when running would be unsafe

      what it replaces, and what it refuses to touch

      it reports before it acts

      it names the files of yours it is about to overwrite

      LOCAL covers scripts/, where the production code lives

      LOCAL asks whether upstream ever SHIPPED the blob, not whether its store holds it
        FAIL an unmerged local branch is not a release: its content is LOCAL - walk 1, .claude/hooks
             expected: 1
             actual:   0
        FAIL and at walk 2, scripts/*.sh
             expected: 1
             actual:   0
        FAIL and at walk 3, the named files
             expected: 1
             actual:   0

      LOCAL counts only the release line as shipped: HEAD, the default branch, and its origin counterpart
        FAIL a live stash is not a release: content reachable only from refs/stash is LOCAL
             expected: 1
             actual:   0
        FAIL a stale remote-tracking branch is not a release: content reachable only from origin/xcompare/exp is LOCAL
             expected: 1
             actual:   0
        FAIL a fetched PR ref is not a release: content reachable only from refs/pull/7/head is LOCAL
             expected: 1
             actual:   0
        FAIL while the stash, in the same run, is still LOCAL
             expected: 1
             actual:   0
        FAIL while the stash, in the same run, is still LOCAL
             expected: 1
             actual:   0
        FAIL while content reachable only from refs/stash, in the same fixture, is LOCAL
             expected: 1
             actual:   0

      LOCAL refuses to answer from a source with no usable history

      the source ref is named when it is not a release

      the procedure belongs to the release being installed

      it survives replacing the file it is being read from

    refresh: 113 passed, 9 failed

    assertion floors: all 1 suite(s) met their declared floor (113 assertions executed, 79 declared).
    1 of 1 harness suite(s) FAILED.

    real    7m15.026s
    user    0m24.982s
    sys     1m29.873s

(That run started before the floor was raised, hence `79 declared`. Re-run with
the floor at 122 the tail reads as below; `selftest.sh` compares the *passed*
count with the floor, so the suite sits below it until the nine go green. GREEN's
run should read `122 passed, 0 failed` and meet the floor exactly.)

    refresh: 113 passed, 9 failed
    FAIL refresh  did 113 units of work, below the floor of 122 in .claude/tests/floors.conf

    assertion floors: 0 of 1 suite(s) met their declared floor.
    1 of 1 harness suite(s) FAILED.

**Why it is the right failure.** Each `actual: 0` is the whole-line count of
`    LOCAL     <path>` in a dry-run report: the script judged the file and
called it shipped. Immediately before each report, the fixture assertions
passed - **not one `fixture:` line is red** - saying the blob is reachable from
the injected ref (`rev-list --objects <ref>` lists it) and reachable from
*nothing* in `HEAD master [origin/master]`. So release 51 had a blob in front of
it that only a stash, a stale tracking ref, a PR ref or an unmerged local branch
reaches, asked `--all`, heard YES, and stayed silent. That is the defect in the
Context, reproduced once per ref kind and at all three walks for AC-5. The
nine are exactly the assertions that the C-4 re-check predicted `--all` would
satisfy and Option B would not; no quiet-half assertion, old or new, is red; and
36 and 57 (`the run answered rather than refusing to check`) are green, so none
of the nine is a no-history refusal wearing a LOCAL count of 0.

**On arrival** (release 51 script, release 51 suite): `refresh: 79 passed, 0
failed` (C-7). The C-4 re-check run - unchanged suite, `--all` -> `HEAD master`
via `scripts/mutate.sh` - read `76 passed, 3 failed`, the three `once a
surviving ref reaches the blob, walk N is silent`; restore verified with `cmp`.

### Files touched

| file | change |
|---|---|
| `.claude/tests/refresh.test.sh` | line 48 `git init -q` -> `git init -q -b master` with a comment; three fixture helpers beside `local_line_count`; the tail of HARNESS-012's block (old lines 419-440) rewritten into AC-5's positive and control; one new `describe` block before `LOCAL refuses to answer…`. 79 -> 122 executed. Nothing else in the file edited |
| `.claude/tests/floors.conf` | `floor \| refresh \| 79` -> `122`, plus a dated note at the foot |
| `.claude/tests/selftest.test.sh` | `COUNTS` table, `refresh 79` -> `refresh 122` (line 452) |
| `docs/backlog/stories/HARNESS-013.md` | `## Contract` amendments in C-1, C-4, C-5 (each marked "RED amendment"); `## Test plan`; this section |

`scripts/refresh-harness.sh` was **not opened for writing**. The only time it
changed was inside `scripts/mutate.sh` for the C-4 re-check, which restored it
and verified the restore; `git status` shows it clean.

**HARNESS-012 assertion names changed (C-4), old -> new:**

| old (release 51) | new |
|---|---|
| `fixture: <f> is now reachable from the surviving branch` (x3) | `fixture: <f> is reachable from the unmerged local branch 'survives'` + `fixture: and from nothing in the release set (HEAD, master)` (x3 each) |
| `once a surviving ref reaches the blob, walk 1 is silent` | `an unmerged local branch is not a release: its content is LOCAL - walk 1, .claude/hooks` (expected 0 -> 1) |
| `and walk 2` | `and at walk 2, scripts/*.sh` (expected 0 -> 1) |
| `and walk 3` | `and at walk 3, the named files` (expected 0 -> 1) |
| - | `once the branch is merged into the default branch, walk 1 is silent`, `and walk 2`, `and walk 3` (new; HARNESS-012's AC-1 control kept, under Option B) |

The comment at old line 419-423 ("whether or not it is the default one") was
replaced with one that says what is now checked and why HEAD is detached.

**C-4 re-checked against the tree, and how.** Before editing, the release-51
suite was run against the release-51 script with `bash scripts/mutate.sh
scripts/refresh-harness.sh 's/rev-list --objects --all/rev-list --objects HEAD
master/' -- bash scripts/selftest.sh refresh`. Result: `76 passed, 3 failed`,
the three `once a surviving ref…` assertions and nothing else (`mutate: command
exited 1; restored (verified byte-for-byte…)`). So no other existing assertion
depends on a non-default ref counting as shipped, by measurement rather than by
reading. The "source ref is named" block was read as well: it moves HEAD to
`some-feature` and asserts only on the NOTE text.

### What the tests pin, and what they leave to GREEN

No import and no signature: the suite runs the script and reads its report.
Pinned:

* **The report's per-file line** `    LOCAL     <path>`, matched whole with
  `grep -cx`, and the path spellings `.claude/<dir>/<rel>`, `scripts/<b>`,
  `<named file>` - unchanged from HARNESS-012 (C-3).
* **The release set's membership**, observed from outside: a blob reachable
  only from `refs/stash`, `refs/remotes/origin/<not-default>`,
  `refs/pull/*/head` or an unmerged `refs/heads/<b>` is LOCAL; a blob reachable
  from `HEAD`, from the default branch (tip or older), or from
  `refs/remotes/origin/<default>` when the local default is behind it, is not.
  With no nameable default, `HEAD`'s history still counts and the stash still
  does not.
* **The default branch is what the NOTE block resolved** (`$src_default`): the
  fixture has no `origin/HEAD`, so `master` is found through the `master`
  candidate. A second resolution that agreed would also pass; C-2 says not to
  write one.
* **The no-history guard and the "answered" state**: 36 and 57 assert the report
  does not say `could not check` on a two-commit upstream; HARNESS-012's
  no-history assertions still assert that a one-commit one does.

Not pinned - the implementer's choice:

* the spelling of the set (array vs word list, `refs/heads/` prefix, a `--`
  terminator) - the C-1 amendment suggests one so the mutation table has a
  target;
* whether `up_shipped`, `$NL`, the padded list or any variable name survives;
* anything about the copy loop, the NOTE text, or the report's prose.

### Fixture invariants GREEN must not break

* HEAD is on `master` at the end of both blocks; `master` is level with
  `refs/remotes/origin/master`; branch `survives` exists and is merged; refs
  `refs/stash`, `refs/remotes/origin/xcompare/exp`, `refs/pull/7/head` remain.
  The later blocks (no-history, source-ref NOTE, hand-over, self-replacement)
  run against that checkout and are green with it.
* The merged controls (27-29, 45) read their report with HEAD **detached at
  `master~1`**; 20 and 42 assert it. `src_branch` is therefore empty there and
  the NOTE does not print. Do not make the LOCAL check depend on `src_branch`.
* Everything is hashed with `git -C "$PROJ" hash-object`, both in the script
  and in the fixture proofs, so `core.autocrlf` (on, here) lands the same on
  both sides. Do not hash raw bytes.
* No `gc`, `prune`, `stash drop`, `fetch --prune` or reflog expiry in the
  script (Out of scope). The fixtures' refs must still exist when the report
  is read; the proofs read them before, not after.

### Tests that passed on arrival, and what earns each (DV-3)

All `fixture:` assertions test the fixture, not the script; no probe applies.
Of the behavioural ones, these are green against release 51. Each mutation is
a `sed` expression against the C-1 amendment's spelling, run as

    bash scripts/mutate.sh scripts/refresh-harness.sh '<expr>' -- bash scripts/selftest.sh refresh

**Not run in RED** - there is no fixed set to mutate until GREEN. GATES runs
them and pastes the output into DV-3.

| id | mutation | sed expression | predicted failures | which assertions |
|---|---|---|---|---|
| X-A | **`--all` put back** (DV-2 a) | `s/rev-list --objects "\${up_starts\[@\]}"/rev-list --objects --all/` | **9** | 17, 18, 19, 37, 39, 40, 46, 51, 59 - the RED run above, exactly. **0 in the quiet half** |
| X-B | drop `refs/remotes/origin/$src_default` (DV-2 b) | `s/up_starts+=("refs\/remotes\/origin\/\$src_default")/:/` | **1** | 50 `a local default branch behind its origin: content reachable only from origin/master is not listed`. 51 stays green |
| X-C | drop `$src_default`, keep HEAD | `s/up_starts+=("\$src_default")/:/` | **4** | 27, 28, 29 (AC-5's merged control) and 45 (AC-3's). Visible only because HEAD is detached at `master~1` for those reports; 38, 41, 50 have HEAD on master or `origin/master` in the set and stay green |
| X-D | `--no-walk`: only tip trees count | `s/rev-list --objects "\${up_starts\[@\]}"/rev-list --objects --no-walk "${up_starts[@]}"/` | **4** | 41 (AC-4, older release), 58 (AC-6, older commit of trunk), HARNESS-012's `while a file from an older release, in the same run, is still not named`, and the pre-existing `while merely being behind is silent` (line 244). Tip-content controls 38, 45, 50, 27-29 stay green |
| X-E | drop HEAD | `s/up_starts=(HEAD)/up_starts=()/` | **1** | 58 `with no nameable default branch, content from the checked-out branch is not listed` - the set is empty there and `rev-list` with no start lists nothing. Everywhere else `master` covers HEAD. 59 stays green |
| X-F | **wrong value**: paths instead of ids, nothing is ever shipped | `s/awk '{print \$1}'/awk '{print \$2}'/` | **12** | every quiet-half assertion: `while merely being behind is silent`, `a project holding upstream's own files is told nothing`, `while a scripts/ file matching upstream is silent`, HARNESS-012's older-release one, 27, 28, 29, 38, 41, 45, 50, 58 |

Which earns which: 27-29 and 45 -> X-C; 38 -> X-F (it is tip content on the
default branch, so only "nothing is shipped" can name it); 41 -> X-D; 50 ->
X-B; 58 -> X-E. X-A is DV-2's first half and reproduces this RED run. If GATES
sees a different count, the prediction is wrong or the fixture drifted -
find which before adjusting anything.

**About X-C's visibility (the Contract's question).** With HEAD on master the
mutation is invisible at every report, because HEAD reaches everything master
does. So the fixture detaches HEAD at `master~1` (the pre-merge commit) for
the two merged controls, proves it (20, 42), and proves the blob is reachable
from `master` and not from `HEAD` (21-26, 43-44). That makes the control
earnable without a different mutation. It affects 27, 28, 29 and 45 only.

### Negative controls - expected values

No metric and no threshold: every control is a count of one report line, 0 or
1. A bash suite has no import failure, so **every assertion executed in RED**,
controls included; the "RED" column is measured, against the release-51
script. Where release 51 and Option B give the same answer the value is
expected to hold in GREEN; X-B..X-F are what show it holds for the right
reason.

| control | measures | RED (measured, release 51) | GREEN (expected) |
|---|---|---|---|
| 27, 28, 29 merged `survives`, per walk | count == 0 | 0, 0, 0 | 0, 0, 0 |
| 38 committed on master, same run as the positives | count == 0 | 0 | 0 |
| 41 older release of master, same run | count == 0 | 0 | 0 |
| 45 PR merged into master | count == 0 | 0 | 0 |
| 46, 51 stash still LOCAL in the control runs | count == 1 | **0, 0 (red)** | 1, 1 |
| 50 master behind origin/master | count == 0 | 0 | 0 |
| 58 no nameable default, HEAD's history | count == 0 | 0 | 0 |
| 59 stash under no nameable default | count == 1 | **0 (red)** | 1 |
| 36, 57 report does not say `could not check` | count == 0 | 0, 0 | 0, 0 |
| 11-16, 30-35 blob reachable from the injected ref / not from the release set | 1 / 0 | 1/0 x6 | same |
| 20, 42 HEAD detached | `symbolic-ref -q HEAD` empty | "" | "" |
| 21-26, 43-44 blob from master / not from HEAD | 1 / 0 | 1/0 x4 | same |
| 47-49 master behind; blob from origin/master; not from HEAD/master | 0 (exit) / 1 / 0 | 0, 1, 0 | same |
| 52-56 no default; two commits; hook from HEAD; stash from refs/stash; not from HEAD | 0 / 2 / 1 / 1 / 0 | 0, 2, 1, 1, 0 | same |

### DV-2 predictions, stated once

(a) `--all` back: **9 failures**, all positives (17-19, 37, 39, 40, 46, 51,
59), **none** in the quiet half - satisfies "at least AC-1, AC-2, AC-3's
positives". (b) `origin/$src_default` dropped: **1 failure**, assertion 50.

### Discovered, and worth knowing

* **Timing.** `selftest.sh refresh` took **7m15s** wall for the RED run and
  **15m16s** for the C-4 re-check under `mutate.sh`, then **2m31s** for the
  post-floor re-run of the identical suite - against HARNESS-012's 2m15s on
  the same machine. So the first two were machine load, not the suite;
  `sys` (1m30-1m40) says process spawn dominates as before. The new material
  is six more dry runs and ~60 git subprocesses, about 15s at the quiet
  figure. Nothing in this bash harness is timed per test; CI on ubuntu spawns
  an order of magnitude faster. All three timings are local; no CI figure
  exists yet for this tree.
* **`selftest.sh selftest`**: `54 passed, 0 failed` - the two floor records
  agree at 122. **`gates.sh --fast`**: `All required gates passed (0 ran, 5
  unconfigured, 0 known)`, BOOTSTRAPPED=no. **`check-sigpipe.sh`**: 40 files,
  38 with pipefail, 0 findings. **`check-grep-count.sh`**: 40 files, 0 findings.
* **`git stash` needs no identity** on this git (probed), but the fixture passes
  one, so the answer never depends on the runner's config.
* **The stash is reachable via `refs/stash` only through the stash commit's
  tree** - `rev-list --objects refs/stash` lists the blob (checked, and it is
  what assertion 30 pins). `cat-file -e` would have said the same and proved
  less, as C-5 says.
* **Nothing changes the approach.** Every C-5 recipe worked first time; the one
  addition is detaching HEAD for the merged controls, recorded in C-4 and C-5.
  GREEN can build exactly the C-1 amendment's six lines.
* **Model.** This RED ran on `claude-fable-5-1`, matching the plan row
  (`fable`). No override was reported to me.

### GREEN

**Model:** `claude-opus-5-5` (plan row `opus`). No override was reported to me.
**Phase:** `current-story.env` still read `PHASE=RED` throughout; the brief said
the orchestrator would set GREEN first, and I did not change it. The one file
written is `scripts/refresh-harness.sh`, which classifies `harness`, so the lock
permitted it either way. Nothing is committed.

**Diff summary, `scripts/refresh-harness.sh` only.** The single `--all` line is
replaced by the C-1 amendment's six lines, with one addition, a `--` ending the
revision list:

    up_starts=(HEAD)
    if [ -n "$src_default" ]; then
      up_starts+=("$src_default")
      git -C "$UP" rev-parse --verify --quiet "refs/remotes/origin/$src_default" >/dev/null 2>&1 \
        && up_starts+=("refs/remotes/origin/$src_default")
    fi
    up_reachable="$(git -C "$UP" rev-list --objects "${up_starts[@]}" -- 2>/dev/null | awk '{print $1}')"

`$src_default` is the NOTE block's, read and not re-resolved (C-2). The comment
above the check now says "the release line", why `--all` was too wide, where
the default comes from, and why the `--` is there; the one-line comment inside
the block says "from the release line" instead of "from a ref". `up_shipped`,
`NL`, `up_reachable_padded`, the `up_has_history` guard, the NOTE, the report
text, the three walks and the copy loop are untouched (C-3; the diff has two
hunks, both inside comments or the one line). No `--all`, `--branches`,
`--remotes`, `--tags` or `--reflog`; no temp file; no new pipeline.

**The suite, first against the unchanged script (watched it fail), then the fix:**

    refresh: 113 passed, 9 failed
    FAIL refresh  did 113 units of work, below the floor of 122 in .claude/tests/floors.conf
    real    6m8.847s

    refresh: 122 passed, 0 failed

    assertion floors: all 1 suite(s) met their declared floor (122 assertions executed, 122 declared).
    1 harness suite(s) passed.

    real    10m42.557s
    user    0m25.147s
    sys     2m1.525s

(The wall time is machine load again: `user` is the same 25s as RED's runs. A
second, VERBOSE run also read `122 passed, 0 failed`, and its numbered list
matches the Test plan's 1-59 one to one.)

    check-sigpipe: scanned 40 shell file(s), 38 with pipefail, 0 finding(s)
    check-grep-count: scanned 40 shell file(s), 0 finding(s)
    selftest: 54 passed, 0 failed
    gates.sh --fast: All required gates passed (0 ran, 5 unconfigured, 0 known).   [BOOTSTRAPPED=no]

**Negative controls, RED against GREEN.** Every one is an `assert_eq` on a
0/1 count, so an `ok` in the VERBOSE run IS the measured value.

| # | control | expected | RED (release 51) | GREEN (measured) |
|---|---|---|---|---|
| 27, 28, 29 | merged `survives`, HEAD detached at `master~1`, per walk | 0 | 0, 0, 0 | 0, 0, 0 |
| 38 | committed on master, same run as the positives | 0 | 0 | 0 |
| 41 | older release of master, same run | 0 | 0 | 0 |
| 45 | PR merged into master, HEAD detached | 0 | 0 | 0 |
| 46, 51 | stash still LOCAL in the control runs | 1 | 0, 0 (red) | 1, 1 |
| 50 | master behind origin/master | 0 | 0 | 0 |
| 58 | no nameable default, HEAD's history | 0 | 0 | 0 |
| 59 | stash under no nameable default | 1 | 0 (red) | 1 |
| 36, 57 | report does not say `could not check` | 0 | 0, 0 | 0, 0 |
| 11-16, 30-35 | blob from injected ref / not from the release set | 1 / 0 | 1/0 x6 | 1/0 x6 |
| 20, 42 | HEAD detached | "" | "" | "" |
| 21-26, 43-44 | blob from master / not from HEAD | 1 / 0 | 1/0 x4 | 1/0 x4 |
| 47-49 | master behind; from origin/master; not from HEAD/master | 0 / 1 / 0 | 0, 1, 0 | 0, 1, 0 |
| 52-56 | no default; 2 commits; hook from HEAD; stash from refs/stash; not from HEAD | 0/2/1/1/0 | same | same |
| AC-4's three | `while merely being behind is silent`, `a project holding upstream's own files is told nothing`, `while a scripts/ file matching upstream is silent` | 0 | ok | ok |
| AC-7 | `a source with a single commit says it could not check`, `while a source with real history still answers`, HARNESS-012's 1-10 | - | ok | ok |

No divergence. A pass here shows the value and not the reason; X-B..X-F
are what show the reason, and they belong to GATES.

**DV-2 / DV-3 targets.** Except for the added ` --`, the lines are spelled as
in the C-1 amendment. Each of RED's six `sed` expressions was dry-run with
`sed EXPR FILE | diff FILE -` (stdout only, the file was not touched) and each
changes exactly one line:
X-A gives `rev-list --objects --all -- 2>/dev/null`, X-D gives `--no-walk
"${up_starts[@]}" --`, both still valid; X-B turns the `&&` continuation into
`&& :`; X-C and X-E hit `up_starts+=("$src_default")` and `up_starts=(HEAD)`;
X-F hits the `awk`. GATES should not need to adjust them. With X-E the list is
empty and `git rev-list --objects --` exits 0 with no output (checked in scratch).
So the set is empty as predicted, not an error.

**The `--`: the ambiguity is real, and the suite could not see it.**
Reproduced first at the git level, in a scratch repo on `master` with a
committed file named `master`:

    $ git rev-list --objects HEAD master
    fatal: ambiguous argument 'master': both revision and filename
    Use '--' to separate paths from revisions, like this:
    exit=128
    $ out="$(git rev-list --objects HEAD master 2>/dev/null | awk '{print $1}')"   -> 0 lines
    $ git rev-list --objects HEAD master --              -> 6 lines, exit 0
    $ git rev-list --objects HEAD refs/heads/master      -> 6 lines
    $ git rev-parse --verify --quiet master              -> resolves (the NOTE's own test is not affected)
    directory named master:              without -- exit=128, with -- exit=0
    UNTRACKED file named master only:    without -- exit=128

Git consults the working tree, so an untracked file or a directory does it too.
The same applies to `HEAD` and to `refs/remotes/origin/<b>` as paths. Then end
to end, against the real script: a scratch upstream with two commits and a
file `master` at its root, and a project holding the *older* release of one
hook, which is a quiet-half case. The script hands off to upstream's own copy,
so each variant was placed at `$UP/scripts/refresh-harness.sh` in turn (scratch
only):

    shipped line (with --):                     LOCAL lines: 0
    same line without --:                           LOCAL     .claude/hooks/h.sh
                                                LOCAL lines: 1
    without --, file 'master' moved aside:      LOCAL lines: 0
    release 51's --all line:                    LOCAL lines: 0

So the C-1 amendment's spelling, taken literally, would have **introduced** a
false alarm that release 51 does not have. It would also cover the whole quiet
half of any upstream that has such a path. Why `--` and not `refs/heads/$src_default`:
the NOTE accepts any `$cand` that `rev-parse --verify` resolves, and that can be
something other than a local branch. In a scratch repo with a *tag* `master` and
no branch of that name, `rev-parse --verify master` exits 0 while `rev-list
--objects refs/heads/master --` exits 128. Because rev-list fails as a whole on
one bad argument, that too would empty the set. `--` keeps the name exactly as
the NOTE resolved it (C-2). No test was added (tests are frozen in GREEN). If
this is wanted as a pinned case, it is a RED change for a later story.

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

    run:    2026-09-24T15:43:36Z
    commit: 4a0e72d (working tree had uncommitted changes)
    tree:   62c0c30969085155993ac26dedab4fcf0d859a1a
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

Filed 2026-09-24 as the follow-up that HARNESS-012 PO-5 recommended. **The
`## Contract` is left for PLANNED.** This section holds the evidence, so that
PLANNED can use these numbers rather than measuring again.

### Measurements, 2026-09-24, this repository at `6c2d6a7` (release 51), Git Bash on Windows 11

**M-1. What refs this clone holds.** `git for-each-ref` returns 16 local
branches under `refs/heads/harness/*` plus `main`, and 41 remote-tracking refs
plus `origin/HEAD`. There is no `refs/stash`, no `refs/pull/*`, and there are
no tags. `git ls-remote --heads origin` returns **one** head, `main`. So **40
of the 41 remote-tracking refs are stale**: their branches were deleted on
origin and never pruned here. Every ref, local or remote, is merged into
`main` (`git branch -a --no-merged main` is empty). So in THIS clone no
narrowing changes anything today. The defect is latent here and live in other
clones.

**M-2. The manga-translator baseline moved while this story was being
measured.** The brief said 13 LOCAL. That was true at manga-translator
`51f2558`, and the first dry run here reproduced it. By the next run another
session had run `git pull --ff-only` there (reflog, 2026-09-23 23:53) to
`76ed934`, "MT-043: close as DONE". MT-043 changed `scripts/mutate.sh`,
`.claude/tests/mutate.test.sh`, `.claude/harness/rules.md` and
`.claude/state/README.md`. None of those blobs exists in this repository, so
the real script now reports **17 LOCAL**, correctly. They are the other 4.
**Quote this story's numbers as "17 at `76ed934`", and never as a bare
count.** DV-1 compares two runs against each other for this reason and does not
use a fixed number.

**M-3. The sharp case, reproduced against the real script with the real
commit.** The throwaway commit from HARNESS-010's CI run is still in this
store as an unreachable commit:

    $ git fsck --unreachable --no-reflogs --no-progress | awk '$2=="commit"{print $3}'   # 13 commits
    ... one of them contains blob 632dc4e6 (manga-translator's lib.sh):
    83add19415d3d0ad7aaff9a3ca84dee3a868d612  2026-09-23 12:02:27  THROWAWAY: HARNESS-010 union-corpus cross-comparison on CI

The test used a scratch `git clone --no-hardlinks` of this repository, made in
the scratchpad, with `git update-ref refs/remotes/origin/xcompare/HARNESS-010
83add19`. That simulates a clone that fetched while the branch existed and
never pruned. Then, from `../manga-translator` at `76ed934`:

    $ bash <clone>/scripts/refresh-harness.sh --dry-run <clone> | grep -cx '    LOCAL     .*'
    13          # the real release-51 script; 17 without the stale ref

The 4 that disappear are exactly the ones HARNESS-012 brought back:
`.claude/hooks/lib.sh`, `.claude/hooks/phase-guard.sh`,
`.claude/tests/phase-guard.test.sh` and `.claude/tests/_lib.sh`.

**M-4. Tags.** `git tag` prints nothing. `VERSION` is `51 (2026-09-23)`, a
number with a date, and nothing parses it (its own header says so). **Releases
are not tagged, so "tags only" is not an option.** A release, as this
repository practises it, is a commit on `main`. The refresh script's own NOTE
already uses that definition: "not merged into '<default>'" means "not a
release".

**M-5. Each candidate ref set against real trees.** A replica of the three
walks (`scratchpad/measure.sh`: the same candidate files, the same
`hash-object`, a membership test against each set) was checked against the real
script first. Both give 17 on the real tree and 13 with the stale ref, and they
list the same files. Upstream = the scratch clone, downstream =
manga-translator `76ed934` (69 candidate files), unless stated otherwise:

| ref set | real tree | + stale `origin/xcompare` | + `refs/pull/999/head` | + `refs/stash` | + local `refs/heads/experiment` | upstream `main` behind `origin/main`* |
|---|---|---|---|---|---|---|
| `--all` (release 51) | 17 | **13** | **13** | **13** | **13** | 0 |
| `--branches` | 17 | 17 | 17 | 17 | **13** | **4** |
| `--branches --tags` | 17 | 17 | 17 | 17 | **13** | **4** |
| `--branches --remotes` | 17 | **13** | 17 | 17 | **13** | 0 |
| `HEAD` | 17 | 17 | 17 | 17 | 17 | **4** |
| `main origin/main` | 17 | 17 | 17 | 17 | 17 | 0 |
| `HEAD main origin/main` | 17 | 17 | 17 | 17 | 17 | 0 |

Each injected ref points at `83add19`. Bold marks a result that differs from
the correct answer: 17 in the injected columns, 0 in the last.

\* Last column: downstream = this checkout at release 51, and upstream = the
scratch clone with local `main` moved back to `ce2ff90` (release 50) while
`origin/main` stays at release 51. This simulates a project refreshed from a
newer clone and then checked against an older one. `--branches` alone
reports `floors.conf`, `refresh.test.sh`, `selftest.test.sh` and
`refresh-harness.sh` as LOCAL. That is **four false alarms, all in the quiet
half**, for files that are release 51 exactly. **This rules out `--branches`
alone and `--branches --tags`.** Any acceptable set must include
`origin/<default>`, and that requirement is AC-2's control.

`--branches --remotes` fixes the stash and the PR ref but not the sharp case,
so it is ruled out too.

The fixtures were cleaned up afterwards (`update-ref -d`, `main` restored to
`6c2d6a7`). None of this touched this repository or manga-translator. The
dry runs wrote only their self-copy under manga-translator's gitignored
`.claude/state/`, which the script removes.

**M-6. What remains, and the only column where the two survivors differ.**
Two sets survive: *A* = `--branches HEAD origin/<default>`, and *B* = `HEAD
<default> origin/<default>`. Both give the correct answer in every column
except the local `refs/heads/experiment` one: A reports 13 (the file stays
silent) and B reports 17 (the file is listed). No real tree measured today can
tell them apart, because every local branch here is merged into `main` (M-1).
Adding `--tags` to either set changes nothing today (M-4).

**M-7. The existing assertions whose meaning depends on the answer.**
`refresh.test.sh` lines 424-440 (HARNESS-012's AC-1 control) commit three
contents on a local branch `survives`, which is never merged. They then assert
`once a surviving ref reaches the blob, walk 1 is silent`, `and walk 2` and `and
walk 3`, and the comment at line 420 says "whether or not it is the default
one". **These three assertions pin Option A.** Under Option B they go red and
must be rewritten in RED to use a branch that is merged, or a push to
`origin/<default>`. The rewritten assertions must then be earned by a mutation,
because a corrected test written against an existing implementation passes on
its first run (`rules.md`, non-negotiables). The fixture statements `fixture: <f>
is now reachable from the surviving branch` (lines 431-434) read `rev-list
--all` directly and stay true under either option, but under B they no longer
describe the script's question. The other 76 assertions do not depend on the
answer. The upstream fixture is created with a plain `git init -q` (line 48),
so its default branch is `master` unless `init.defaultBranch` is set. Neither
this machine nor ubuntu CI sets it. The fixture therefore resolves through the
`master` candidate, and a machine configured with some other name would send
it down AC-6's no-default path. RED may pin `git init -q -b master` for that
reason.

## Open question - DECIDED: Option B (the user, 2026-09-24)

**Is a LOCAL branch of the upstream checkout that is not merged into its default
branch a release?** The evidence does not settle it (M-6), and the two answers
lead to different code and to different results for three existing assertions
(M-7).

* **Option A: yes, every local branch counts.** Set: `--branches HEAD
  origin/<default>`.
  *For:* the smallest change from release 51. HARNESS-012's `survives`
  assertions stay as they are. A maintainer's own local work-in-progress never
  triggers the alarm against itself.
  *Against:* the HARNESS-010 incident began as a **local** branch in this very
  clone before it was pushed. While it existed, a dry run from this checkout
  would have been silent about those four files, which is the defect HARNESS-012
  was fixing. It also conflicts with the script's own NOTE, which already says
  an unmerged branch "is not a release".
  *Measured cost:* none on any real tree today. It fails only the one column
  where a local unmerged branch holds downstream content (13 instead of 17).

* **Option B: no, only the default branch counts, plus its `origin` counterpart
  and whatever is checked out.** Set: `HEAD <default> origin/<default>`.
  *For:* one definition of "a release" across the whole script, the same one
  the NOTE uses. It closes the local-branch case as well. It is correct in every
  column of M-5.
  *Against:* a project that vendored unreleased work from an upstream feature
  branch, which the NOTE warned about, is told those files are LOCAL on the
  next refresh from `main`. That can be read as correct (it WAS unreleased) or
  as noise. It also means three of HARNESS-012's assertions must be rewritten
  and earned again (M-7).
  *Measured cost:* none on any real tree today. There is no unmerged local
  branch here, so no new false alarm on manga-translator.

Under both options `HEAD` stays in the set. The content being installed comes
from HEAD's working tree, and dropping it would make a second refresh from the
same checkout report the first refresh's files as LOCAL.

**PO recommendation: Option B**, because the script already defines a release
as "merged into the default branch", and the incident this line of work exists
for started on a local branch. It is still a product decision about what the
alarm should say to a maintainer about their own unmerged work, so it goes to
the user. **AC-5 must be rewritten to the chosen option before the story leaves
PLANNED.** Record the decision in `## Notes` as PO-1, with who made it.

**PO-1. The Open question is decided: Option B.** The user answered on
2026-09-24, in the session that filed the story: "B". A release is the default
branch, its `origin` counterpart, and HEAD. An unmerged local branch is not
one. AC-5 was rewritten to that form while the story was still PLANNED, so
there is no `## Amendments` entry. The consequence M-7 names follows: the three
`survives` assertions HARNESS-012 added (`once a surviving ref reaches the
blob, walk N is silent`, `refresh.test.sh` ~424-440) contradict Option B and
must be rewritten in RED. They make the SAME content reachable from a
surviving non-default branch and assert silence; under B that content is LOCAL.

**PO-2. RED verified by the orchestrator, 2026-09-24.**
* `bash scripts/selftest.sh refresh`, run by the orchestrator: `refresh: 113
  passed, 9 failed`, `below the floor of 122`, 2m27s. These are the same nine
  failures RED reported, each `expected 1 / actual 0`. `git diff --quiet main --
  scripts/` is clean, and no `.bak` is left under `.claude/state/mutations/`.
* **AC-6's red is the right red, reproduced independently.** AC-6's fixture is
  a minimal hand-built upstream, so an `actual: 0` could also come from a script
  that refused it or never reached its report. The orchestrator built its own:
  a `develop`-only upstream with two commits and a live stash, different file
  contents, and none of RED's code. Against it the release-51 script printed
  `Dry run: nothing was written.`, no `could not check`, and no LOCAL line. The
  script completes and misses the stash, which is the defect.
* `selftest: 54 passed, 0 failed` (both floor records agree at 122).
  `gates.sh --fast`: `0 ran, 5 unconfigured`. `check-sigpipe` and
  `check-grep-count`: 0 findings over 40 files.
* **Cosmetic, not blocking:** two assertions share the name `while the stash,
  in the same run, is still LOCAL` (the in-run checks beside the AC-3 and AC-2
  controls). A failure report naming it will not say which one. GATES should
  read the line order when a DV mutation reports that name.
* **Timing to watch at REVIEW:** RED measured the suite at 7m15s and 15m16s
  under load, and 2m31s quiet. It went from about 2m to about 2.5m quiet
  locally. Read the `refresh` step's time out of the PR's first CI log before
  calling it green.

**PO-3. GREEN, 2026-09-24: two things the orchestrator records against itself
and against the Contract.**
* **The phase was set late.** The orchestrator dispatched the GREEN developer
  while `current-story.env` still said `PHASE=RED`, and set GREEN only when the
  developer reported it. The lock did not refuse the write, because
  `scripts/refresh-harness.sh` classifies as `harness` and the lock permits that
  in every phase. No production code reached a commit under `phase: RED`: the
  RED commit `a8134b6` holds tests and docs only, and GREEN was set before the
  GREEN commit. The tests were not touched after RED
  (`git diff --quiet a8134b6 -- .claude/tests/` is clean).
* **C-1's amended spelling had a defect, and GREEN's `--` fixes it.**
  Reproduced by the orchestrator on different inputs from GREEN's: branch
  `main` and a DIRECTORY `main/`, where GREEN used a file named `master`:

      without --: 0 objects
         stderr: fatal: ambiguous argument 'main': both revision and filename
      with --:    5 objects

  Behind `2>/dev/null` the set comes out empty, and every file would be
  reported LOCAL. `--` keeps the default's name exactly as the NOTE resolved
  it (C-2). GREEN also showed that `refs/heads/$src_default` fails when the
  name resolves to a tag. The suite cannot see this case, and no test was added
  because tests are frozen in GREEN. If it needs pinning, that is a RED change
  for a later story.
* Orchestrator's own run: `refresh: 122 passed, 0 failed`, `122 assertions
  executed, 122 declared`.
