---
id: HARNESS-035
title: The lock follows the session into a worktree and judges a write by the worktree that owns it
slug: the-lock-follows-the-session-into-a-work
epic: 
type: fix
status: done
phase: DONE
branch: story/HARNESS-035-the-lock-follows-the-session-into-a-work
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [.claude/hooks/lib.sh, .claude/hooks/phase-guard.sh, .claude/tests/_lib.sh, .claude/tests/_spawns.sh, .claude/tests/phase-guard.test.sh, .claude/tests/lib.test.sh, .claude/tests/spawns.test.sh, .claude/tests/fixtures/classify/classify.golden, CLAUDE.md]         # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

<!-- Why this story exists. Link the epic and any wiki pages that constrain it.
     Name the REQUIRED gate that would fail if this story's artifact broke. If
     only an optional gate can, put it in required_gates above before RED:
     every required gate once passed over a story none of them exercised. -->

Field report: fantasy-world-builder WORLD-113, PO decision D-7, measured
2026-10-05 against harness release 64. Upstream release 75 contains the same
code, unchanged (`lib.sh:10`, `to_rel`, `command_cwd`).

A Claude Code desktop session started in the main checkout
`D:/fantasy-world-builder` (WORLD-018 in RED) moved its working directory to the
linked worktree `D:/fwb-WORLD-113` (WORLD-113 in RED). `CLAUDE_PROJECT_DIR` kept
its first value, and `lib.sh` takes `HARNESS_ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"`.
So:

1. **Every hook read the wrong tree.** The prompt hook reported WORLD-018, the
   Stop hook asked for a gate run on WORLD-018, and a probe
   `: >> src/core/worldfile/codec.ts` run in the worktree was refused as
   `story: WORLD-018  phase: RED`. That refusal was correct only because both
   stories happened to be in RED.
2. **Absolute paths into the worktree were not judged at all.** `to_rel`
   compares a path with the root and then falls back to "does the path contain
   `/<root's folder name>/`". `D:/fwb-WORLD-113/...` does not contain
   `/fantasy-world-builder/`, so `to_rel` returned empty ("outside this
   repository") and every Write/Edit into the worktree was allowed, in any
   phase. The same fallback has the opposite defect: an unrelated directory
   that happens to share the root's folder name, e.g. `C:/elsewhere/<name>/src`,
   is judged as if it were this repository.

The worktree rule in CLAUDE.md is "one worktree, one story, one lock". The
guard keeps that rule only while the session never leaves the tree it started
in. The desktop app's directory move, `.claude/worktrees/<name>` sessions and an
absolute `cd` all leave it.

**Decision.** The guard judges every write by **the lock of the worktree that
owns the file**, not by `CLAUDE_PROJECT_DIR`:

- The session's tree is the harness tree that contains the hook input's `cwd`
  field, which the host keeps current. `CLAUDE_PROJECT_DIR` is the fallback,
  then `$PWD`.
- A target's owner is the nearest ancestor holding `.git`, found by a walk in
  pure bash. When that owner is a **different worktree of the same
  repository** (the same common git directory), the target is classified by that
  worktree's `paths.conf` and judged by its `current-story.env`, and the denial
  names that worktree.
- A target in a different repository, or in no repository, is still
  "outside", as before. A nested repository under the root that is not a
  worktree of it is still judged by the root, as before.
- `to_rel`'s folder-name fallback is replaced by real drive-spelling equivalence
  (`/d/x` = `D:/x` = `D:\x`), which is what its comment says it was for.

The required gate is `selftest`, which runs `phase-guard`, `lib` and `spawns`.

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC.
     An AC that names a statistic, a metric or a threshold names a NEGATIVE
     CONTROL too: the deliberately broken input the metric must reject, and
     roughly what it should score. A criterion can be perfectly testable and
     still be blind to the defect it exists to catch, and that is more
     dangerous than a vague one - it survives review and goes green. -->

Fixture for all of them: one repository, main checkout A (`T-1`) plus a linked
worktree B made with `git worktree add`, each with its own harness confs and its
own `current-story.env`. `CLAUDE_PROJECT_DIR` always names A, as in the field.

- **AC-1: the session's tree follows `cwd`.** Given A in RED and B in GREEN, when
  a hook input carries `"cwd": "<B>"`, then: the prompt hook reports B's story
  and not A's; `echo x > src/main.ts` is **allowed** (B's GREEN), and
  `echo x > tests/main.test.ts` is **refused naming B's story and phase GREEN**.
  The same with A IDLE. Control: with no `cwd` field the behaviour is exactly
  today's (A's lock).
- **AC-2: an absolute path into a sibling worktree is judged by that worktree's
  lock.** Given the session in A, when Write, Edit or a Bash redirect targets
  `<B>/src/main.ts` by absolute path, then it is refused while B is in RED, and
  the denial names B's story, `phase: RED`, `path: src/main.ts` and a
  `worktree:` line naming B. This holds **even when A is IDLE**. The same through
  `cd <B> && echo x > src/main.ts`. Controls: allowed while B is IDLE, and allowed
  while B is in GREEN even though A is in RED.
- **AC-3: a worktree nested under the root is its own tree.** A linked worktree
  at `<A>/.claude/worktrees/w` in RED: a write to its `src/main.ts`, by absolute
  path or through `cd .claude/worktrees/w &&`, is judged by w's lock, not as the
  path `.claude/worktrees/w/src/main.ts` under A's.
- **AC-4: another repository, or a same-named folder, is still outside.** A
  write to `src/main.ts` in a separate repository (its own `git init`, its own
  RED state) is allowed from a session in A. `C:\elsewhere\<A's folder
  name>\src\main.ts` is `outside`, and `classify.golden` records that for both
  `@BASE@` lines.
- **AC-5: drive spellings are one root.** `to_rel` maps `D:\p\src\a.ts`,
  `D:/p/src/a.ts` and `/d/p/src/a.ts` to `src/a.ts` under a root spelled in any
  of those three ways. Control: `/d/pp/src/a.ts` and `/e/p/src/a.ts` are outside
  a root of `/d/p`.
- **AC-6: no process is added to the ordinary path.** HARNESS-025's bound
  (`echo hi > src/main.ts` in RED spawns at most 27) still holds, and it also
  holds with `"cwd": "<root>"` in the input. The `cwd` extraction and the
  ownership walk spawn nothing.

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

**Writes:** `.claude/hooks/lib.sh`, `.claude/hooks/phase-guard.sh`, `.claude/tests/_lib.sh`, `.claude/tests/_spawns.sh`, `.claude/tests/phase-guard.test.sh`, `.claude/tests/lib.test.sh`, `.claude/tests/spawns.test.sh`, `.claude/tests/fixtures/classify/classify.golden`, `CLAUDE.md`

`lib.sh`, new or changed (all pure bash, with no process unless noted):

- At source time: if `${HOOK_INPUT:-}` has a `"cwd"` string, it is read by a
  bash regex, with JSON `\\` and `\/` made into `/`. Then `worktree_top`
  locates its tree. If that tree has `.claude/harness/phases.conf`, it becomes
  `HARNESS_ROOT`; otherwise `CLAUDE_PROJECT_DIR`, then `$PWD`. `SESSION_CWD` is
  the slashed `cwd`, or empty. Scripts that source lib.sh without
  `HOOK_INPUT` behave exactly as before.
- `worktree_top <abs path>` prints the nearest ancestor (or the path itself)
  holding `.git` as a file or a directory, and returns 1 if there is none.
- `git_common_dir <tree>` prints the common git directory: `<tree>/.git` when
  that is a directory; otherwise `gitdir:` followed through `commondir`.
- `same_repo <tree> <tree>` is true when the two common dirs are the same path
  under `path_key`.
- `path_key <path>` gives slashes, `/x/` or `/cygdrive/x/` as `x:/`, `.` and `..`
  collapsed, and lower case. One `tr`, and it is called only off the ordinary path.
- `to_rel` uses `path_key` equivalence for its prefix test. The folder-name
  fallback is deleted. Empty output still means "outside".
- `command_cwd <masked> [start]` takes an optional absolute start directory
  (the session's cwd). Its result is a repo-relative prefix as before, or an
  ABSOLUTE directory when the command ends up outside the root but somewhere
  known. It returns 1 only when the directory cannot be accounted for
  (variable, `~`, `-`, bare `cd`).
- `active_worktrees` prints, one per line, every worktree of the root's
  repository other than the root whose `.claude/state/current-story.env`
  exists. It reads `<common>/worktrees/*/gitdir` and skips stale entries.

`phase-guard.sh`:

- When the root is IDLE, exit 0 only if `active_worktrees` is empty.
- `check_path` resolves the owner of an absolute target. If the owner is a
  different worktree of the same repository, the swap is done in-process:
  `HARNESS_ROOT`, `HARNESS_DIR` and `STATE_FILE` are swapped and
  `load_state` runs; IDLE allows; otherwise classify and judge, then restore.
  The denial adds `  worktree: <owner>` after `category:`.
- A relative candidate under an absolute `command_cwd` result is joined and
  judged as an absolute path.

Denial text: `path:` stays relative to the tree that judged it, with its
spelling and position unchanged. The only change is the added `worktree:` line.

Oracle partition: all mechanical. AC-6's bound is settled (HARNESS-025, 27),
read out and not re-tuned.
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

Planned by `bash scripts/plan.sh write HARNESS-035` from `.claude/harness/models.conf`.
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

- PLANNED, RED, GREEN, and the return to RED: no subagent was dispatched. A
  single Claude Code session ran every phase itself on `claude-opus-5-5`, the
  orchestrator acting as each agent. The departure is that RED and GREEN were
  not separated by a fresh context. The compensations were: the RED failures
  were recorded before any source edit, the passed-on-arrival cases were earned
  with `mutate.sh`, and the hooks were driven by hand against real worktrees.

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Out of scope

<!-- Explicit non-goals. Prevents the Feature Developer from over-building. -->

- Writes into a **different** repository that has its own active lock. That
  needs a full Bash parse on every IDLE call to find out, and the harness rule
  "outside this repository is not the harness's business" stands.
- Which hook *code* runs. The host still runs
  `$CLAUDE_PROJECT_DIR/.claude/hooks/*.sh`, so a session that moved trees runs
  the first tree's release of the guard against the second tree's state and
  confs. `doctor.sh`'s `worktree` row already reports release skew.
- Whether the desktop host updates `cwd` after a directory move. AC-1 pins
  what the guard does with the field. AC-2 and AC-3 do not depend on it.
- Refreshing the field project (fantasy-world-builder is on release 64).

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

<!-- Filled by the Test Developer during RED: which tests, at which level,
     and which AC each one covers. -->

All are shell suites run through the real hooks against throwaway fixtures.

| AC | Suite: block | What it drives |
|---|---|---|
| premise | `phase-guard.test.sh`: `HARNESS-035 premise` | B and W share A's `.git` (checked with `git rev-parse --git-common-dir`); C does not; B's folder name differs from A's |
| AC-1 | `phase-guard.test.sh`: `HARNESS-035 AC-1` | `GUARD_CWD=<B>`: relative source write allowed (B is GREEN, A is RED); test write refused naming T-B/GREEN; `inject-state.sh` reports T-B; A IDLE; backslash-spelled `cwd` (added on return to RED); control with no `cwd` |
| AC-2 | `phase-guard.test.sh`: `HARNESS-035 AC-2` | Write, Edit, `>`, `: >>`, `cd <B> &&` into B from A; A IDLE; A spelled with backslashes and IDLE (added on return to RED); controls B IDLE / B GREEN / A's own path with no `worktree:` line |
| AC-3 | `phase-guard.test.sh`: `HARNESS-035 AC-3` | `<A>/.claude/worktrees/w`, by absolute path and by `cd .claude/worktrees/w &&`; control W GREEN |
| AC-4 | `phase-guard.test.sh`: `HARNESS-035 AC-4`; `spawns.test.sh` AC-5 golden | separate repo C allowed; `C:\elsewhere\<A's name>\src\main.ts` allowed; golden lines 36-37 now `outside` |
| AC-5 | `lib.test.sh`: `to_rel` | 4 root spellings x 4 path spellings, plus 3 controls per root and `/cygdrive/d` |
| AC-6 | `spawns.test.sh`: after HARNESS-025 AC-1 | `GUARD_CWD=<root>`: still at most 27, and exactly the cwd-less count |

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

Command: `bash .claude/tests/phase-guard.test.sh`, `bash .claude/tests/lib.test.sh`,
`bash .claude/tests/spawns.test.sh`. First RED run, at `c7c902f` plus the tests
(harness release 75):

- `phase-guard`: every AC-1 to AC-4 case failed for the field's reasons. With
  `cwd` = B the guard reported `story: T-A phase: RED` and the prompt hook
  `Active story: T-A`. Write, Edit and `>` into B and W were allowed with no
  judgement (empty reason). `C:\elsewhere\<A's name>\src\main.ts` was refused
  as A's `src/main.ts`. The premise and every control passed.
- `lib: 237 passed, 9 failed`, all AC-5. `/e/p/src/a.ts` and
  `C:/elsewhere/p/src/a.ts` came back as `src/a.ts` under every root (the
  folder-name fallback), and `d:/P/src/a.ts` came back unchanged under `/d/p`.
- `spawns: 71 passed, 1 failed`, the AC-5 golden diff on lines 36-37 only.
  **AC-6 passed on arrival**, as it must: it is a bound GREEN has to keep, and
  the code under test ignored `cwd` entirely. GREEN's run is what earns it.

No new export is imported by a test. The tests constrain hook behaviour only:
denial text, the `worktree:` line, and process counts.

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

### Return 1: GREEN -> RED, the suite only ever spoke in forward slashes

- **What was wrong.** No test was wrong; the suite was incomplete. Every
  fixture path was `/tmp/...`, so neither the hook input's `cwd` nor
  `CLAUDE_PROJECT_DIR` was ever spelled the way the host spells them on
  Windows. GREEN went green (`phase-guard: 347 passed, 0 failed`) with two
  defects still in it.
- **How it was found.** The orchestrator drove the GREEN hooks by hand against
  this repository's real worktrees, using the host's spellings. The calls are
  read-only, because the hook only judges.
  ```
  --- 1. session rooted at IDLE main checkout, Write into the HARNESS-035 worktree (GREEN) by Windows path
  (empty: allowed, unjudged)
  --- 2. same, into the nested HARNESS-033 worktree (GATES)
  (empty: allowed, unjudged)
  --- 3. prompt hook with cwd = the worktree (escaped JSON)
  (empty: no <harness-state> at all)
  ```
  Cause of 3: `_session_root` was a bash regex built around `[^"\\]`, and the
  heredoc that appended it to lib.sh collapsed `\\` to `\`, so the pattern
  never matched a value containing a backslash. It is now parameter expansion,
  which has no regex dialect to get wrong. Cause of 1 and 2:
  `git_common_dir` kept the root's backslashes, so `any_active_worktree`
  globbed `D:\agentic-dev-harness/.git/worktrees/*`. A glob reads `\` as an
  escape, so it found no worktree, and the IDLE root exited before judging.
- **What is asserted now.** Under AC-1, a backslash-spelled `cwd` is read
  (the prompt hook reports T-B, and B's GREEN allows a relative source write).
  Under AC-2, with A IDLE and `CLAUDE_PROJECT_DIR` spelled with backslashes,
  Write `<B>/src/main.ts` is refused by T-B.
- **What earns them.** The backslash-root case is red on arrival, because its
  defect was still in the tree. The two backslash-`cwd` cases passed on
  arrival, because GREEN had already replaced the regex, so they are earned by
  putting that defect back. The probe cuts the `cwd` value at its first
  backslash, which is exactly what the broken regex did:
  ```
  === unmutated (RED)
      FAIL AC-2: with A IDLE and spelled with backslashes, Write <B>/src/main.ts is refused by B
           expected to contain: story:    T-B
           actual:
  phase-guard: 349 passed, 1 failed
  === mutate: .claude/hooks/lib.sh (1 line(s) changed by 1524c  v="${v:1}"; v="${v%%[!A-Za-z0-9:/._ -]*}") ===
  === mutate: running bash .claude/tests/phase-guard.test.sh ===
      FAIL AC-1: a backslash-spelled cwd is read: the prompt hook reports B's story
      FAIL AC-1: with a backslash-spelled cwd, B (GREEN) allows a relative source write
      FAIL AC-2: with A IDLE and spelled with backslashes, Write <B>/src/main.ts is refused by B
  phase-guard: 347 passed, 3 failed
  === mutate: command exited 1; restored (verified byte-for-byte against /d/adh-HARNESS-034/.claude/state/mutations/.claude_hooks_lib.sh.20261005T182007Z.23539.bak) ===
  ```
  `bash scripts/mutate.sh --check` afterwards reported: `no stranded mutation`.
- **GREEN after the return** is not a no-op. `git_common_dir` slashes its
  argument, and `set_harness_root` keeps `HARNESS_ROOT` in forward slashes. The
  second change was needed because the full selftest still failed the
  backslash-root case (`phase-guard: 349 passed, 1 failed`): the raw root was
  file-tested as `\tmp\...` in `[ -f "$HARNESS_DIR/paths.conf" ]`, and that is
  no path. After it: `bash scripts/selftest.sh` reported `23 harness suite(s)
  passed`, with `phase-guard: 350 passed, 0 failed`.

## Gate results

<!-- gates.sh: written by bash scripts/gates.sh; do not edit or paste by hand -->

    run:    2026-10-05T23:18:21Z
    commit: f6c100b
    tree:   cee023bf5b3bfde651ec8f7eaa346855c734a3ea
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

### Renumbered from HARNESS-034 (in REVIEW, 2026-10-05)

This story was cut as HARNESS-034. While its PR (#112) was open, a different
story, "a run lock stops the self-test and the gates running on top of each
other", was also cut as HARNESS-034 from another session and merged first (#111,
release 77). The two story files collided on merge, and check-boundaries reads
the story id from the branch name, so this story became HARNESS-035 and its
branch was renamed to match. The criteria did not change. Pasted output below
and in `## Regressions` keeps the id and the worktree path
(`D:/adh-HARNESS-034`) it was measured with, verbatim.

`new-story.sh` checks only the local `docs/backlog/stories`, so two worktrees
cut from the same base will both choose the next free number. Nothing
currently catches the collision before merge. That is worth a story of its own.

### Field probe (GREEN, after the return), against this repository's real worktrees

The host's exact shapes, with no fixture involved. `CLAUDE_PROJECT_DIR` was
`D:\agentic-dev-harness` (the main checkout, IDLE). Each hook input was a JSON
file with escaped Windows paths. Read-only: the hook only judges.

| Input | release 75 | this branch |
|---|---|---|
| Write `D:\adh-HARNESS-034\tests\x.test.ts` | allowed | refused: `story: HARNESS-034 phase: GREEN path: tests/x.test.ts worktree: D:/adh-HARNESS-034` |
| Edit `D:\agentic-dev-harness\.claude\worktrees\nostalgic-williams-fcf700\tests\x.test.ts` | allowed | refused: `story: HARNESS-033 phase: REVIEW ... worktree: D:/agentic-dev-harness/.claude/worktrees/nostalgic-williams-fcf700` |
| Bash `cd D:/adh-HARNESS-034 && : >> tests/x.test.ts` | allowed | refused by HARNESS-034, GREEN |
| Bash `: >> tests/x.test.ts` with `cwd` `D:\adh-HARNESS-034` | allowed (main checkout IDLE) | refused by HARNESS-034, GREEN, with no `worktree:` line (it is the session's own tree) |
| Write `D:\agentic-dev-harness\tests\x.test.ts` (control) | allowed | allowed |
| UserPromptSubmit with `cwd` `D:\adh-HARNESS-034` | nothing printed | `Active story: HARNESS-034`, `Phase: GREEN` |

A trap for anyone reproducing this: typing such JSON into a shell command
inline lost one level of `\\` on the way in, which produced
`D:adh-HARNESS-034\testsx.test.ts`. That was the first false "it still allows"
here, and it is also how the regex in Return 1 lost its backslashes. Write the
input to a file with an editor.

**DONE, 2026-10-06.** Merged in #114 (merge commit b07e643), release 79. The
VERSION bump lands in this DONE commit. 78 had already gone to #113, the model
policy change, which merged alongside. `phase.sh set DONE --force` was run on
`main` (a detached checkout of `origin/main` in the worktree), overriding the
branch check. PR CI passed on the first attempt: `gates`
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37387807138)
and `boundaries`
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37387808742).
The first PR, #112, was closed by the branch rename and superseded by #114 (see
the renumber note above). No epic. Follow-ups: refresh fantasy-world-builder
(release 64) so that WORLD-113's D-7 compensation can be retired. Open a story
for `new-story.sh` choosing colliding ids across worktrees.

