# Assertion floors, ported back from manga-translator

## Scope

`scripts/selftest.sh`, `.claude/tests/_lib.sh`, and the new
`.claude/tests/floors.conf` and `.claude/tests/selftest.test.sh`, at
`harness/port-assertion-floors` off `main` at release 46.

The round started as a request to refresh manga-translator to the current
harness. It became a port instead, because the refresh would have destroyed
downstream work. What was audited is the downstream feature and its fitness for
upstream; what was NOT audited is the rest of manga-translator's divergence -
ten other LOCAL files, listed under **What was not checked**.

## Decided

**1. Port before refresh, and this is the case the rule was written for.**
manga-translator carries a bare-date stamp (`2026-09-11`, pre-numbering) against
upstream 46, and `refresh-harness.sh --dry-run` named eleven LOCAL files -
content upstream has never shipped. A refresh REPLACES `scripts/selftest.sh` and
`.claude/tests/_lib.sh` while KEEPING `floors.conf` and `selftest.test.sh`,
because upstream did not ship the latter two. That splits one feature in half:
the configuration and the suite that pins it survive, the implementation they
depend on does not. It is the H26 shape `refresh-harness.sh`'s own header
describes, and it would have been silent.

**2. Assertion floors belong upstream, unchanged in design.** A suite that
executed zero assertions exits 0; a suite replaced by a single `printf` exits 0.
`selftest.sh` read exit status and nothing else. The mechanism is the `evidence`
and `floor` idea `project.conf` already applies to the gates, turned on the
harness's own tests - one vocabulary, not two, which is why `floors.conf` reuses
`project.conf`'s grammar deliberately.

**3. The floor is the EXECUTED assertion count, never the `assert_` call-site
count.** Measured on this tree: `profiles` is ONE call site inside a loop and 37
executed assertions; `lib` is 50 call sites and 139. A call-site floor for
`profiles` would be 1, and deleting 36 of its 37 assertions would satisfy it.
Depends on the measurement in **Evidence 2**.

**4. The counts were re-measured on this tree, not inherited.** manga-translator
floors `profiles` at 44 and `lib` at 148. Copying those would have installed a
floor nobody measured - the exact defect this mechanism exists to catch, aimed
at itself. Depends on **Evidence 1**.

**5. A suite that prints no summary line FAILS the run.** "No count could be
read" is the strongest form of the defect, not an excuse to skip the check. This
was vindicated by accident during the round - see **Evidence 3**.

**6. The two SIGPIPE defects found in the ported code were fixed, not waived.**
`check-sigpipe.sh` flagged `shortfall()` and `floor_of()` in the incoming
`selftest.test.sh`, both `… | head -1` under `pipefail`. Rewritten as a single
`awk`, per the house rule. The downstream original still carries both, because
its own guard predates the rule.

## Evidence

**E1. The eleven LOCAL files are genuine downstream edits, not line-ending
noise and not a stale copy.**

- Claim, falsifiable: manga-translator's copies of those files contain content
  that has never existed in upstream's object store.
- Tool: `refresh-harness.sh --dry-run`, then `git hash-object` of the
  CR-stripped file against `git cat-file -e` in the upstream repo.
- Inputs: all eleven named files; the hash check run on
  `.claude/hooks/lib.sh` specifically.
- Result: both trees are LF (`grep -qU $'\r'` false on both), so CRLF is
  excluded; the CR-stripped hash `632dc4e6…` is absent from upstream history.
- How it could be wrong: if upstream history had been rewritten, old blobs
  would be unreachable and every stale file would read as LOCAL. Not checked
  directly; the selective result (11 of ~40 files, not all) argues against it.

**E2. The floors recorded are this tree's executed counts.**

- Claim: each value in `floors.conf` is the `N` of that suite's
  `<name>: N passed, M failed` line on this tree.
- Source: the full CI run of the merged tree,
  `actions/runs/35803806651`, which `pull_request` checks out as the merge
  result - so it is a full run of what `main` now is.
- Spot-check: `profiles`, `mutate` and `lib` re-run locally at the port and
  matched CI exactly (37, 44, 139). `mutate` is the one that moved - it was 39
  on the branch before the merge brought release 46's newer `mutate.sh`.
- How it could be wrong: a suite whose count varies by platform or by
  environment would disagree between CI (Linux) and a developer machine. Five
  more suites were confirmed identical on a local partial run before it died
  (boundaries 73, ci-local 28, classify 27, doctor 29, gate-reminder 27), which
  covers eight of nineteen against two machines.

**E3. The "no summary line" rule fired on a real incident, not a fixture.**

- During a full local run, MSYS ran out of fork capacity
  (`dofork: … exit code 0xC000026B, errno 11`, `fork: retry: Resource
  temporarily unavailable`) while 46 `bash` processes from other sessions were
  live. `grep-count` was killed mid-suite and printed no summary.
- The run reported `FAIL grep-count  printed no summary line, so its floor of
  20 could not be checked` and failed. Under the old `selftest.sh` a suite
  killed that way contributes its non-zero exit and nothing else; had it been
  killed after its last assertion but before `summary`, it would have exited 0
  and passed.
- `grep-count` run alone afterwards: `20 passed, 0 failed`, floor met. So the
  FAIL was the environment, and the mechanism classified it correctly.

**E4. The suite was watched failing before the implementation existed.**

- `bash .claude/tests/selftest.test.sh` against the unmodified 39-line
  `selftest.sh`: **25 passed, 29 failed**.
- After the port: **54 passed, 0 failed**, floor met.

## What would have to be true for this to be wrong

- That `summary()`'s format string is the only channel the count travels on. It
  is, and `selftest.test.sh` C-7 pins the string at the `_lib.sh` end so a
  reword cannot break the read silently.
- That every suite calls `summary`. A suite that does not now fails the run
  rather than passing - which is Decision 5, so this assumption is enforced
  rather than assumed.
- That bash 3.2 parameter expansion is enough for the parse. The implementation
  spawns no process per suite deliberately (a fork costs ~150 ms on Windows; an
  `awk` plus a `basename` per suite added ~2 s to every invocation downstream).
- That the floors file is read only by `selftest.sh`. Nothing else reads it
  today; if a second reader appears, the grammar is shared with `project.conf`
  but the parser is not.

## What was not checked

- **The other ten LOCAL files.** `phase-guard.sh`, `lib.sh`, `gate-reminder.sh`,
  `gates.sh`, and four test suites are also modified downstream and were NOT
  examined beyond confirming they are genuinely modified. They may contain
  further fixes worth porting, or may simply be stale. Until they are read, a
  refresh of manga-translator still risks losing something.
- **A clean full local run.** Two attempts died: one hung with an empty process
  tree, one exhausted MSYS fork capacity. A third was running at the time of
  writing. CI is the arbiter here - it runs the same suites on Linux in about a
  minute.
- **manga-translator's own suite set.** It has thirteen suites to upstream's
  nineteen and lacks `classify`, `grep-count`, `plan`, `refresh`, `sigpipe` and
  `worktree` entirely. Its floors file therefore cannot be copied down either;
  the refresh will need floors measured on whatever that tree ends up running.
- **Whether `selftest`'s own floor of 54 is stable.** It was measured once, on
  this tree, after the real-tree block was rewritten for upstream's counts.

## Spike code

None. Nothing throwaway was written; the port is the deliverable.

## Stories filed

None yet. Three candidates arising, all recorded in HARNESS-008's `## Notes`
rather than filed:

- PO-H - `doctor.sh`'s early `exit 0` discards `missing`, so an unbootstrapped
  tree reports a release mismatch and still succeeds.
- PO-M - `gate_tree_hash()` hashes untracked files while CI reads a commit, so
  a local `check-boundaries.sh` is silently more permissive than CI.
- `check-boundaries.sh` reads `GITHUB_HEAD_REF` unconditionally, which is right
  for the real CI path and wrong for any nested repo judged inside a CI job.
