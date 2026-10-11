---
id: HARNESS-045
title: The phase lock sees a git --output write
slug: the-phase-lock-sees-a-git-output-write
epic: 
type: fix
status: done
phase: DONE
branch: story/HARNESS-045-the-phase-lock-sees-a-git-output-write
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [.claude/hooks/lib.sh, .claude/tests/phase-guard.test.sh, .claude/tests/lib.test.sh]         # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

**The settings half of this lead is HARNESS-047** (the user chose option B on 2026-10-08: keep the `git log`/`git diff` allow rules and add deny rules for `--output`). This story is the lock half only and shares no file with it.

Lead 2 of the first `/security-audit` run, `docs/wiki/audits/security-2026-10-08.md`
(fingerprint `settings.json:allow:git-log-diff-output-arbitrary-write`; full
record at `C:\Users\ryanc\security-audit-skill\agentic-dev-harness\run-1\findings.json`
and `NEEDS-VALIDATION.md`). `git log` and `git diff` accept `--output=<file>`
(Git for Windows 2.55 docs: git-log.html:2947, git-diff.html:618; also the
two-word form `--output <file>`), which writes the command's output - with
`--format=<text>`, agent-chosen bytes - to that file. The phase lock's Bash
branch (`phase-guard.sh:152`) asks `write_candidates` (`lib.sh:636`) which
paths a command writes; its tool list (`_WC_AWK` `isname`, `lib.sh:411`) is
`sed tee cp mv rm touch`, plus redirects, and has no rule for `git --output`.
So in RED, `git log -1 --format=x --output=src/main.ts` overwrites frozen
source and the lock allows it with no trace, because the verdict is `-` (not
a write) and `no_candidate` never fires.

**Why this is fixed now rather than validated first.** The audit left the
lead `needs_validation` on the platform question above. The lock half does
not depend on it: `CLAUDE.md` "Phase lock" says the guard "covers
`Write`/`Edit`/`MultiEdit`/`NotebookEdit` and shell redirects alike", and
`lib.sh`'s parser already judges `git mv` by the `mv` rule - the lock's own
stated contract is that a shell command's writes are judged, and a git option
whose whole purpose is to write a file is a write the lock cannot see. That is
a defect in the harness's stated behaviour whichever way the platform
question falls. **No criterion below depends on Claude Code's permission
behaviour**; every one is a `phase-guard.test.sh` or `lib.test.sh` assertion
over `.claude/tests/_lib.sh` fixtures (`make_fixture`, `set_phase`,
`assert_blocked`, `assert_allowed`, `wcand`).

**Type `fix`; not split.** One rule added to one awk program in one file,
with its tests in the two suites that already pin that program. The tree's
own `git log`/`git diff` spellings are the real-line probe `rules.md`
requires of a story that changes a rule (DV-2).
**The gate that fails if this breaks** is the harness's own `selftest`: the
`phase-guard` suite (AC-1 to AC-4 through the hook) and the `lib` suite
(AC-5, `write_candidates` directly). No `required_gates` entry is needed.

One of three stories cut from the audit's three cheap leads; the others are
HARNESS-044 (`task.sh` arguments) and HARNESS-046 (story ids). HARNESS-046
also writes `.claude/hooks/lib.sh` and `.claude/tests/lib.test.sh`, so the
two **conflict** (`plan.sh conflicts`) and run one after the other, never in
parallel worktrees.

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC. -->

"The guard" below is `phase-guard.sh` fed a `Bash` PreToolUse input through
`_lib.sh`'s `guard_bash`, over a `make_fixture` fixture; "blocked on `P`"
means `assert_blocked` with path `P`.

- **AC-1 (a `--output` target is judged as a write)** — Given a fixture in
  RED (source frozen), when the guard judges each of
  `git log -1 --format=x --output=src/main.ts`,
  `git log -1 --format=x --output src/main.ts` (two-word form),
  `git diff --output=src/main.ts HEAD`, and
  `git log --output="src/main.ts"` (quoted value), then each is blocked on
  `src/main.ts`. *Reproduction today:* all four are allowed.
- **AC-2 (the target is judged by its category, not refused outright)** —
  Given a fixture in RED, when the guard judges
  `git log -1 --output=docs/notes.md`, then it is allowed (docs are writable
  in RED); and given the same fixture in GREEN, `git log -1
  --output=tests/main.test.ts` is blocked on `tests/main.test.ts` while
  `git log -1 --output=src/main.ts` is allowed. The target goes through the
  same `check_path` as every other candidate.
- **AC-3 (negative controls: read-only git stays read-only)** — Given a
  fixture in RED, when the guard judges each of
  `git log --output-indicator-new=+ -- src/main.ts`,
  `git log --oneline -- src/main.ts`, `git diff -- src/main.ts`,
  `git diff --stat`, `git diff --name-only` (the spelling at
  `scripts/check-boundaries.sh:173`) and `git diff --no-index a b` (the
  spelling at `scripts/mutate.sh:357`), then every one is allowed; and the
  existing assertions `git diff -- src/main.ts` allowed
  (`phase-guard.test.sh:68`) and "a read-only `git diff` logs nothing" /
  `git diff > /dev/null` logs nothing (`:1065-1067`) stay green - a `git`
  command with no `--output` has verdict `-`, so `no_candidate` must not
  start tracing every `git diff`.
- **AC-4 (`git mv` and `git rm` keep their existing rules)** — Given a
  fixture in RED, when the guard judges `git mv src/main.ts docs/notes.md`,
  then it is blocked on `src/main.ts` with the `mv` role (as
  `phase-guard.test.sh:965` already asserts, under the `set_phase RED` at
  `:942`); given the fixture in GREEN, `git mv tests/main.test.ts
  docs/notes.md` is blocked on `tests/main.test.ts` with the `mv` role (as
  `:968-972` already assert); and in RED `git rm src/main.ts` is blocked on
  `src/main.ts`. Teaching the parser the word `git` must not stop it reaching
  the subcommand the existing rules already judge. (Amended A-1.)
- **AC-5 (`write_candidates` says what it found)** — Given the masked text
  of `git log -1 --format=x --output=src/x.ts`, when `write_candidates` runs,
  then its verdict line is `W` and it emits exactly one candidate,
  `src/x.ts` with the role `destination of git --output`; given the masked
  text of `git diff -- src/x.ts` or of
  `git log --output-indicator-new=+ src/x.ts`, the verdict is `-` and no
  candidate is emitted. (`lib.test.sh`'s `wcand` renders both as one string
  for an equality assertion.)

Every criterion is **mechanical** (oracle partition, Contract C-5).

## Contract

<!-- Written by the Lead PO BEFORE RED, and AMENDABLE BY RED IN PLACE with a
     reason - GREEN then builds what the amended block says. -->

**Writes:** `.claude/hooks/lib.sh`, `.claude/tests/phase-guard.test.sh`, `.claude/tests/lib.test.sh`

All three classify as `harness` (`bash scripts/classify.sh` at PLANNED), so
the phase lock freezes none of them; the role boundary is honoured by the
agents: RED writes the two test files only, GREEN writes `lib.sh` only. No
existing export changes signature: `write_candidates <masked command>` keeps
its signature and its output grammar (a verdict line `W`/`-`, then `TARGET`
or `TARGET<TAB>ROLE` lines). There is no caller list.

**RED may amend any block below in place, with a reason; GREEN builds what
the amended block says.**

- **C-1 The rule, in `_WC_AWK` (`lib.sh:410-606`).** `isname(w)` gains
  `w == "git"`. `dispatch` gains, **before** its `WRITE = 1` line,
  `if (name == "git") { do_git(a, b); return }` - `git` is not a write by
  itself, so the verdict is set only when a write is found (AC-3, AC-5).
  `do_git(a, b)`, a new function beside `do_touch`, does two things in order:
  1. **Reach the subcommand the existing rules judge.** For `k` from `a` to
     `b`: if `isname(tok[k])` and `tok[k] != "git"`, call
     `dispatch(tok[k], k + 1, b)` and return. That is what keeps `git mv` on
     the `mv` rule and `git rm` on the `rm` rule (AC-4): today the outer loop
     finds `mv` at the second word; once `git` is a name the loop stops at
     the first word, so `do_git` must hand on. A global option before the
     subcommand (`git -C x mv …`) is walked past by the same loop.
  2. **Find `--output`.** For `k` from `a` to `b`: if `islong(tok[k])` and
     `longname(tok[k]) == "output"` - an **exact** match, not the
     `index(...) == 1` prefix test `do_sed`/`do_mv` use - then `WRITE = 1`
     and the target is `LONGVAL` when `LONGHAS`, else `tok[k + 1]` (and `k`
     advances past it); emit it with `emitr(target, "destination of git
     --output")`. Exact rather than prefix because git's diff options
     include `--output-indicator-new`, `--output-indicator-old` and
     `--output-indicator-context`, none of which writes a file, and git
     refuses any abbreviation shorter than `--output` as ambiguous with them,
     so `--output` spelled in full is the only spelling that writes. There is
     no short `-o` for `git log`/`git diff`; `git format-patch -o` is out of
     scope.
  Quote characters survive masking and are stripped in `END`, so the quoted
  value in AC-1's fourth case needs no special handling. Redirects are
  stripped by `write_candidates` before the awk runs, as today.
- **C-2 Known assertions that must stay green**, read at PLANNED, because a
  parser change is judged by what it stops refusing as much as by what it
  starts: `phase-guard.test.sh:39` (an operator inside a commit message),
  `:68` (`git diff -- src/main.ts` allowed), `:464-474` (four `git commit`
  shapes with the harness vocabulary in the message), `:955` (`git status
  && mv …` blocked), `:965-972` (`git mv` by the mv rule), `:1065-1067`
  (read-only `git diff` logs nothing), and the HARNESS-010 C-6 block at
  `:1166` (what the parser must NOT start refusing). RED's handoff states
  the suite was run and these were green before the new block was added.
- **C-3 Where the tests go.** `phase-guard.test.sh`: one new
  `describe "HARNESS-045 …"` block per AC-1..AC-4, using `make_fixture`,
  `set_phase "$FIX" RED|GREEN`, `assert_blocked "$FIX" '<cmd>' <path>` and
  `assert_allowed`. `lib.test.sh`: AC-5 beside the HARNESS-010 C-4 block
  (`:654-700`), through `wcand` after `mask_shell_quotes`, as equalities on
  the whole rendered answer. No new suite. ~~so `floors.conf` is
  untouched~~ **Amended in RED (2026-10-09, test-developer):** the `lib` and
  `phase-guard` floors are raised to the new executed counts (217 -> 250,
  310 -> 369) in `floors.conf` and in `selftest.test.sh`'s hand-copied table,
  as HARNESS-044 did for `doctor`. Reason: a floor below the executed count
  cannot notice this story's assertions disappearing, and both floors had
  already fallen behind (lib executed 247, phase-guard 350 on arrival).
- **C-4 The denial text.** The path line is `path:     src/main.ts` as for
  every candidate; the role line immediately after it is
  `operand:  destination of git --output` (`phase-guard.sh:75-80` prints a
  role when one is carried). The role string is part of AC-5's equality.
- **C-5 Oracle partition.** Every criterion is **mechanical**: exact
  blocked/allowed, exact path, exact verdict and candidate text. Nothing is
  invented or calibrated.
- **C-6 Process budget.** `_WC_AWK` is one awk process per guard call
  (HARNESS-025 cut the guard to that); the new function adds no process.
  `lib.test.sh`'s existing spawn-count assertions, if any cover the guard,
  must stay equal.
- **C-7 Docs.** `CLAUDE.md` "Phase lock" may gain the words "and a `git
  --output` target" to its list of what the guard covers; docs are writable
  in GREEN and this is GREEN's choice, not a criterion.
- **C-8 Test-only dependencies.** None.

## Deferred verifications

<!-- One block per entry; the owning phase pastes the result in. -->

- **DV-1 (defect put back - the story's central claim). Owner: GATES.**
  With `git` removed from `isname` again through `bash scripts/mutate.sh
  .claude/hooks/lib.sh '<sed expression for the exact token GREEN wrote>' --
  bash scripts/selftest.sh phase-guard`, AC-1's four cases and AC-2's GREEN
  case **must** go red and AC-3, AC-4 and every pre-existing assertion must
  stay green (RED predicts the exact red count in its handoff). Then the
  restore is verified and the suite is green again. RED cannot run this:
  there is no rule to remove. Paste the mutate.sh output and the red
  assertion names here, as a fenced block.

  **Result (GATES, 2026-10-09, orchestrator on fable):** exactly RED's
  predicted six went red (the four AC-1 writes, the C-4 role, AC-2's GREEN
  test target); AC-3, AC-4 and every pre-existing assertion stayed green;
  the restore was verified.

```
=== mutate: .claude/hooks/lib.sh (1 line(s) changed by s/ || w == "git")$/)/) ===
=== mutate: running bash scripts/selftest.sh phase-guard ===
    FAIL blocks: HARNESS-045 AC-1: git log --output=src/main.ts overwrites frozen source in RED
    FAIL blocks: HARNESS-045 AC-1: the two-word form --output src/main.ts is the same write
    FAIL blocks: HARNESS-045 AC-1: git diff --output=src/main.ts HEAD writes source too
    FAIL blocks: HARNESS-045 AC-1: a quoted --output value is still the target
    FAIL role: HARNESS-045 C-4: the denial says the path is the destination of git --output
    FAIL blocks: HARNESS-045 AC-2: git log --output onto a frozen test is blocked in GREEN
phase-guard: 363 passed, 6 failed
FAIL phase-guard  did 363 units of work, below the floor of 369 in .claude/tests/floors.conf
1 of 1 harness suite(s) FAILED.
=== mutate: command exited 1; restored (verified byte-for-byte against /d/agentic-dev-harness/.claude/state/mutations/.claude_hooks_lib.sh.20261009T235201Z.92.bak) ===
$ bash scripts/mutate.sh --check
mutate: no stranded mutation; nothing of a previous run is in the tree.
```
- **DV-2 (the rule, probed against real lines of the tree). Owner: GATES.**
  `rules.md`, "A rule is probed against the tree it judges": the fixtures in
  AC-3 are the author's spellings. Take every `git log` and `git diff`
  invocation actually present in `scripts/*.sh`, `.claude/hooks/*.sh` and
  `.claude/commands/*.md` (at PLANNED: `scripts/check-boundaries.sh:173`
  `git diff --name-only …`, `scripts/mutate.sh:357` `git diff --no-index …`,
  and whatever `grep -rnoE 'git (log|diff)[^`"'\'')|;&]*'` over those
  directories lists at GATES), feed each through the guard in a RED fixture
  as written, and then once more with ` --output=src/main.ts` appended.
  Every original **must** be allowed and every appended form **must** be
  blocked on `src/main.ts`. Paste the list and both verdict columns here as
  a fenced block. If any original is refused, that is a false positive the
  fixtures could not see, and the story returns to RED.

  **Result (GATES, 2026-10-09, orchestrator on fable):** every original
  allowed, every `--output` form blocked on `src/main.ts`. The grep at GATES
  lists three code invocations, not two: `check-boundaries.sh:610` is
  `git diff-tree`, and `mutate.sh:357` is a comment - the real call is
  `mutate.sh:362-363`, `git -c … -c … diff --no-index …`, with global `-c`
  options before the subcommand. Two of the three sit inside `$(…)`; the
  guard judges them there. `mutate.sh:169` and `:497` are `printf` messages
  that mention `git diff`, probed as data. `--output` was inserted as an
  option before the operands rather than appended, because after `--` git
  would read it as a pathspec. Script:
  `scratchpad/dv2-045.sh` (`make_fixture`, `set_phase RED`, `guard_bash`).

```
--- as written in the tree
check-boundaries.sh:173              allowed
check-boundaries.sh:610              allowed
mutate.sh:362-363                    allowed
mutate.sh:169 (message)              allowed
mutate.sh:497 (message)              allowed
--- the same, with --output=src/main.ts added as an option
check-boundaries.sh:173 +out         blocked: path:     src/main.ts
check-boundaries.sh:610 +out         blocked: path:     src/main.ts
mutate.sh:362-363 +out               blocked: path:     src/main.ts
```

## Out of scope

- **`.claude/settings.json` and `.claude/tests/settings.test.sh`** - the settings
  half of the lead, which is HARNESS-047 (see the first line of Context).
- `git format-patch -o/--output-directory`, `git worktree add`, `git
  checkout --`, `git stash`, `git clone`, `git config --file`: every other git
  write surface. The audit deferred "every auto-approved git prefix beyond
  `log`/`diff` for option-based writers" as a coverage unit; a story per
  surface, if one is wanted, after a run that confirms it.
- `--output` on any tool other than git.
- A target outside the repository (`--output=/tmp/x`, `--output=../x`):
  judged exactly as a redirect to that path is today (outside the root is
  outside), no better and no worse.
- Any observation of Claude Code's permission matcher.
- The other two leads: HARNESS-044, HARNESS-046.

## Amendments

### A-1. AC-4: the `git mv src/…` case is judged in RED, not GREEN (user, 2026-10-09)

- **Said:** "Given a fixture in GREEN, … `git mv src/main.ts docs/notes.md`
  and `git mv tests/main.test.ts docs/notes.md`, then the first is blocked on
  `src/main.ts` and the second on `tests/main.test.ts` … exactly as
  `phase-guard.test.sh:965-972` already assert".
- **Says now:** the `src/main.ts` case in RED (blocked), the
  `tests/main.test.ts` case in GREEN (blocked), `git rm src/main.ts` in RED
  (blocked) - the phases the cited lines actually use.
- **Why:** the criterion was unsatisfiable as written. Source is writable in
  GREEN (`.claude/harness/phases.conf:16`: `GREEN | vendor,ignored,source,…`),
  so `git mv src/main.ts …` is allowed in GREEN today and must stay allowed;
  and the assertion it cites at `:965` runs in RED, under `set_phase "$FIX"
  RED` at `:942` (GREEN is set at `:968`, for the `tests/` case only). The
  intent - the parser keeps reaching `mv`/`rm` once it knows the word `git` -
  is unchanged, and nothing GREEN builds changes.
- **How it was found:** the test-developer's first draft followed the literal
  phase and both GREEN `git mv src/…` assertions failed "not blocked at all"
  against today's `lib.sh`; it escalated rather than amending.
- **Orchestrator's own reproduction**, not the subagent's code: read
  `phases.conf:15-16` (RED excludes `source`, GREEN includes it) and
  `phase-guard.test.sh:940-944` (the `HARNESS-010 AC-3` block opens with
  `set_phase "$FIX" RED`), then ran the suite on the clean tree before RED's
  changes and with them:

      $ git stash; bash scripts/selftest.sh phase-guard   # clean tree
      1 harness suite(s) passed.
      $ git stash pop; bash scripts/selftest.sh phase-guard   # RED's tests
      phase-guard: 363 passed, 6 failed

  The 6 are the AC-1 and AC-2 defect cases; the AC-4 guards, written in the
  amended phases, pass on arrival.
- **Approved by:** the user, 2026-10-09, in conversation, choosing "Yes, amend
  AC-4" when the wording error was put to them.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

<!-- Filled by the Test Developer during RED: which tests, at which level,
     and which AC each one covers. -->

Two levels, as C-3 fixes: end to end through the hook (`phase-guard.test.sh`,
`guard_bash` over the shared `make_fixture` `$FIX`) for AC-1..AC-4, where the
contract is "blocked on this path in this phase"; and `write_candidates`
directly (`lib.test.sh`, `wcand`) for AC-5, the cheapest level that can see
the verdict line and the role of every candidate. Every assertion is an exact
match (C-5): `assert_blocked` checks the exact path, `assert_role` the exact
role line after the path line, `assert_eq` the whole rendered `wcand` string.

| Suite | `describe` block | Assertions | AC |
|---|---|---|---|
| phase-guard | `HARNESS-045 AC-1: a git --output target is judged as a write` | 4 `assert_blocked` (the four AC-1 spellings, RED, on `src/main.ts`) + 1 `assert_role` (`operand:  destination of git --output`) | AC-1, C-4 |
| phase-guard | `HARNESS-045 AC-2: the --output target is judged by its category, not refused outright` | RED `--output=docs/notes.md` allowed; GREEN `--output=tests/main.test.ts` blocked on it; GREEN `--output=src/main.ts` allowed | AC-2 |
| phase-guard | `HARNESS-045 AC-3: read-only git stays read-only` | 6 `assert_allowed` in RED, the six AC-3 commands | AC-3 |
| phase-guard | `HARNESS-045 AC-4: git mv and git rm keep the rules they already had` | RED `git mv src/main.ts docs/notes.md` blocked + mv-source role; RED `git rm src/main.ts` blocked; GREEN `git mv tests/main.test.ts docs/notes.md` blocked + mv-source role | AC-4 (see escalation in the handoff) |
| lib | `HARNESS-045 AC-5: write_candidates names a git --output target` | 3 `assert_eq` on `wcand` | AC-5 |

AC-3's existing assertions (`:68`, `:1065-1067`) and AC-4's existing `:965-972`
are left where they are and are not duplicated except as stated above.

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

Written by `test-developer`, RED, 2026-10-09.

### ESCALATED: AC-4's text contradicts the assertions it cites

AC-4 says "Given a fixture in **GREEN**, when the guard judges `git mv
src/main.ts docs/notes.md` ... the first is blocked on `src/main.ts` ...
exactly as `phase-guard.test.sh:965-972` already assert". Source is writable
in GREEN, so that command is **allowed** in GREEN and always was; `:965`
asserts it in **RED** (the block's `set_phase "$FIX" RED` is at `:942`; GREEN
is set at `:968`, before the `tests/` case only). Measured: my first draft
followed AC-4's literal phase and both GREEN `git mv src/...` assertions failed
`not blocked at all` against today's lib.sh, which already judges `git mv` by
the mv rule. That is AC-4's own wording being unsatisfiable, not a missing
rule.

I did NOT amend the AC (only the orchestrator/user can, under `##
Amendments`). The tests follow the phases of `:965-972`, which AC-4 names as
the reference: `git mv src/main.ts ...` in RED, `git mv tests/main.test.ts ...`
in GREEN. Suggested amendment wording: "Given a fixture in RED, `git mv
src/main.ts docs/notes.md` is blocked on `src/main.ts`; in GREEN, `git mv
tests/main.test.ts docs/notes.md` is blocked on `tests/main.test.ts`, both with
the mv roles, exactly as `:965-972` already assert; and in RED `git rm
src/main.ts` is blocked on `src/main.ts`." The orchestrator needs to record
that under `## Amendments` (or tell RED to do otherwise) before the PR; it
changes no assertion GREEN must satisfy.

### Commands

    bash scripts/selftest.sh phase-guard     # AC-1..AC-4 (about 8 min on this machine)
    bash scripts/selftest.sh lib             # AC-5
    bash scripts/selftest.sh selftest        # the hand-copied floors table

### Green on arrival, before any HARNESS-045 assertion was added (C-2)

Run on this tree with nothing changed but the story file, 2026-10-09:

    phase-guard: 350 passed, 0 failed
    lib: 247 passed, 0 failed

So every C-2 assertion (`:39`, `:68`, `:464-474`, `:955`, `:965-972`,
`:1065-1067`, the HARNESS-010 C-6 block at `:1166`) was green before the new
blocks, and is still green after them (the only failures below are new).

### RED output (verbatim), lib.sh unchanged

```
  HARNESS-045 AC-1: a git --output target is judged as a write
    FAIL blocks: HARNESS-045 AC-1: git log --output=src/main.ts overwrites frozen source in RED
         not blocked at all
    FAIL blocks: HARNESS-045 AC-1: the two-word form --output src/main.ts is the same write
         not blocked at all
    FAIL blocks: HARNESS-045 AC-1: git diff --output=src/main.ts HEAD writes source too
         not blocked at all
    FAIL blocks: HARNESS-045 AC-1: a quoted --output value is still the target
         not blocked at all
    FAIL role: HARNESS-045 C-4: the denial says the path is the destination of git --output
         not blocked at all, so there is no denial to read a role line from

  HARNESS-045 AC-2: the --output target is judged by its category, not refused outright
    FAIL blocks: HARNESS-045 AC-2: git log --output onto a frozen test is blocked in GREEN
         not blocked at all

  HARNESS-045 AC-3: read-only git stays read-only

  HARNESS-045 AC-4: git mv and git rm keep the rules they already had

phase-guard: 363 passed, 6 failed
```

```
  HARNESS-045 AC-5: write_candidates names a git --output target
    FAIL HARNESS-045 AC-5: git log --output=src/x.ts is a write of src/x.ts, destination of git --output
         expected: W | src/x.ts :: destination of git --output
         actual:   -

lib: 249 passed, 1 failed
```

**Why this is the right failure.** Nothing failed at load: both suites ran
every assertion (369 and 250 executed). Each red one fails on the defect itself
- the hook returns no denial for a `git --output` write (`not blocked at all`),
and `write_candidates` returns the bare verdict `-` with no candidate, exactly
the reproduction in `## Context`. No red line is an import or fixture error.

With the floors now 369 and 250, a single-suite run in RED also prints a floor
shortfall line (selftest.sh compares the floor against the PASSED count): that
is expected and clears when GREEN lands.

### Files touched

- `.claude/tests/phase-guard.test.sh` - four `describe "HARNESS-045 ..."` blocks
  appended before the final `summary "phase-guard"` (19 assertions).
- `.claude/tests/lib.test.sh` - one `describe "HARNESS-045 AC-5 ..."` block
  appended after the HARNESS-010 AC-4 block, before `summary "lib"` (3).
- `.claude/tests/floors.conf` - `lib` 217 -> 250, `phase-guard` 310 -> 369,
  with a note at the foot.
- `.claude/tests/selftest.test.sh` - the hand-copied `COUNTS` table (`lib 250`,
  `phase-guard 369`) and the named `lib is floored at its 250 ...` assertion.
- this story: `## Contract` C-3 amended (floors), `## Test plan`, this handoff.

### Each assertion, its AC, and its state now

| # | Assertion name (as printed) | AC | Now |
|---|---|---|---|
| 1 | `blocks: HARNESS-045 AC-1: git log --output=src/main.ts overwrites frozen source in RED` | AC-1 | **red** |
| 2 | `blocks: HARNESS-045 AC-1: the two-word form --output src/main.ts is the same write` | AC-1 | **red** |
| 3 | `blocks: HARNESS-045 AC-1: git diff --output=src/main.ts HEAD writes source too` | AC-1 | **red** |
| 4 | `blocks: HARNESS-045 AC-1: a quoted --output value is still the target` | AC-1 | **red** |
| 5 | `role: HARNESS-045 C-4: the denial says the path is the destination of git --output` | AC-1/C-4 | **red** |
| 6 | `allows: HARNESS-045 AC-2 control: git log --output into docs is allowed in RED` | AC-2 | control, green |
| 7 | `blocks: HARNESS-045 AC-2: git log --output onto a frozen test is blocked in GREEN` | AC-2 | **red** |
| 8 | `allows: HARNESS-045 AC-2 control: git log --output onto source is allowed in GREEN` | AC-2 | control, green |
| 9-14 | `allows: HARNESS-045 AC-3: ...` (indicator-new, --oneline, diff --, --stat, --name-only, --no-index) | AC-3 | controls, green |
| 15 | `blocks: HARNESS-045 AC-4: git mv of source in RED is still judged by the mv rule` | AC-4 | guard, green |
| 16 | `role: HARNESS-045 AC-4: git mv reports the mv source role, not a git role` | AC-4 | guard, green |
| 17 | `blocks: HARNESS-045 AC-4: git rm of source in RED is judged by the rm rule` | AC-4 | guard, green (git rm was not pinned anywhere before; it passes today because the outer loop reaches `rm` at the second word) |
| 18 | `blocks: HARNESS-045 AC-4: git mv of a frozen test in GREEN is blocked on the test` | AC-4 | guard, green |
| 19 | `role: HARNESS-045 AC-4: and the frozen test is named as the mv source` | AC-4 | guard, green |
| 20 | `HARNESS-045 AC-5: git log --output=src/x.ts is a write of src/x.ts, destination of git --output` | AC-5 | **red** |
| 21 | `HARNESS-045 AC-5 control: git diff -- src/x.ts is not write-capable and has no candidate` | AC-5 | control, green |
| 22 | `HARNESS-045 AC-5 control: --output-indicator-new is not --output` | AC-5 | control, green |

### Exact strings GREEN must produce (export shape)

No new export. The tests call only what exists: `write_candidates <masked
text>` (via `wcand`, after `mask_shell_quotes`) and the hook through
`guard_bash`. What is pinned:

- `write_candidates` on masked `git log -1 --format=x --output=src/x.ts` prints
  verdict line `W`, then exactly one line `src/x.ts<TAB>destination of git
  --output`. `wcand` renders that as the exact string
  `W | src/x.ts :: destination of git --output` - no second candidate (a stray
  `x` from `--format=x`, a `-1`, or a duplicate would break the equality).
- On masked `git diff -- src/x.ts` and `git log --output-indicator-new=+
  src/x.ts`: verdict line `-` and nothing else (`wcand` renders `-`). So `git`
  must not set `WRITE = 1` by itself, and `--output` must match exactly.
- The denial for a refused `--output` target carries `path:     src/main.ts`
  (or `tests/main.test.ts`) and, after it, the line
  `operand:  destination of git --output` (C-4; `assert_role` checks both the
  text and that it comes after `path:`).
- `git mv` keeps the role `operand:  source of mv (removed by the move)` for the
  source operand: `do_git` must hand `mv` to the existing mv rule, not emit its
  own role.

Not constrained, the implementer's choice: whether `do_git` is a separate awk
function or inline in `dispatch`; how global options (`-C`, `-c`) are walked;
the order of emission (`wcand` sorts); what happens to `--output` on a git
subcommand other than log/diff (out of scope - nothing asserts either way);
the trace behaviour for `git ... --output` with no value.

### Control table

No threshold is calibrated here (C-5: all mechanical), so the "number" each
control measures is a verdict. Unlike a suite that fails at import, these
suites RAN: every control below was executed in RED against today's lib.sh
and the value shown is the measured one. GREEN's job is to confirm each is
unchanged once the rule exists - the controls are what the rule could break.

| Control | Expected after GREEN | Measured in RED | Earned by (the red case it brackets) |
|---|---|---|---|
| #6 RED `git log -1 --output=docs/notes.md` | allowed | allowed | #1-4: same option, frozen target, red. A rule refusing every `--output` fails #6 |
| #8 GREEN `git log -1 --output=src/main.ts` | allowed | allowed | #7: same phase, frozen target, red. Proves the target goes through `check_path` |
| #9 `git log --output-indicator-new=+ -- src/main.ts` | allowed | allowed | #1: a prefix match on `output` would refuse this |
| #10-14 read-only `git log`/`git diff` spellings | allowed | allowed | #1-4: `git` alone must not be a write |
| #21 `wcand 'git diff -- src/x.ts'` | `-` | `-` | #20: rules out "git is always W" |
| #22 `wcand 'git log --output-indicator-new=+ src/x.ts'` | `-` | `-` | #20: rules out a prefix test, and rules out emitting `+` or `src/x.ts` |
| #15-19 `git mv` / `git rm` | blocked, mv roles | blocked, mv roles | C-1 step 1: once `git` is a name the outer loop stops at `git`, so these go red if `do_git` does not hand the subcommand on |

Note #15-19 are green on arrival and are not earned by a mutation in RED: there
is no `do_git` yet to break. They are earned in GREEN by construction - a
`do_git` without step 1 turns them red - and GREEN may confirm that with one
`mutate.sh` run if it wants; it is not owed by this story's budget.

### Predicted DV-1 red set (GATES)

With `git` removed from `isname` again (`do_git` unreachable), the
`phase-guard` suite returns to exactly today's RED for this story: **6 red**,
the six names marked **red** above that live in phase-guard - #1, #2, #3, #4,
#5 (the C-4 role line) and #7. Every other assertion, including #6, #8-19 and
every pre-existing one, stays green: `phase-guard: 363 passed, 6 failed`. (In
`lib`, the same mutation would turn #20 red and nothing else: `lib: 249
passed, 1 failed`; DV-1 runs only phase-guard.) Note that the selftest.sh
floor line will also report 363 < 369 under the mutation; that is the floor
doing its job, not an extra red assertion.

### Floors

| Suite | Old floor | New floor | Executed now (passed + failed) | Passed now |
|---|---|---|---|---|
| lib | 217 | 250 | 250 | 249 |
| phase-guard | 310 | 369 | 369 | 363 |

### Other results

    selftest: 268 passed, 0 failed          (the hand-copied table, after the edit)
    check-sigpipe: scanned 49 shell file(s), 45 with pipefail, 0 finding(s)
    check-grep-count: scanned 49 shell file(s), 0 finding(s)
    gates.sh --fast: All required gates passed (0 ran, 5 unconfigured, 0 known).

`gates.sh --fast` judges nothing in this repository (BOOTSTRAPPED=no; every
required gate is unconfigured); the harness's gate is `selftest`, above.

### Timings (local, Windows 11 Git Bash)

`selftest.sh phase-guard` took roughly 8-10 minutes wall time locally on each
run; `lib` about 2-3 minutes. No new timeout is introduced - these suites have
no per-test timeouts - and the 19 new phase-guard assertions are each one hook
invocation like the 350 before them. No CI timing taken.

### Approach notes for GREEN

- C-1's step 1 is load-bearing beyond `mv`/`rm`: `git ... | tee x` and
  `git status && mv ...` (`:955`) go through other segments and are unaffected,
  but anything where `git` is the first word and a write-capable name follows
  as a subcommand now goes through `do_git`. Check `git commit -m "... sed -i
  ..."` (`:464-474`, `lib.test.sh` last case): the message is one masked token,
  so `isname` must not fire on it - it doesn't today, keep it that way.
- In `git log --output-indicator-new=+ src/x.ts`, `src/x.ts` is a plain operand
  and must not become a candidate; only the value of an exact `--output` is.

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
         or Gate probes section describes a failure without showing one.
         A result counts only as a block: a line beginning with three
         backticks or three tildes (a fence), or a line indented by exactly
         four spaces. Prose does not count, nor inline code in backticks, nor
         a tab, nor anything inside an HTML comment
       * whether GREEN was a no-op, and the command output proving the source
         was untouched and still passes -->

## Gate results

<!-- gates.sh: written by bash scripts/gates.sh; do not edit or paste by hand -->

    run:    2026-10-10T00:05:01Z
    commit: dcee786
    tree:   5ff72388f4ff85ccd724b3f5318584ca41119af6
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
     it guards, run the gate, paste the failure, revert. A result counts
     only as a block: a line beginning with three backticks or three tildes
     (a fence), or a line indented by exactly four spaces. Prose does not
     count, nor inline code in backticks, nor a tab, nor anything inside an
     HTML comment. One block per gate:
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

**GATES → REVIEW (2026-10-09, orchestrator on fable).** Full self-test, run
detached while the story was at GATES, nothing else running in this worktree
and no other `selftest.sh` on the host (`ps` before and after):

    $ bash scripts/selftest.sh
    assertion floors: all 26 suite(s) met their declared floor (3076 assertions executed, 2855 declared).
    26 harness suite(s) passed.
    exit=0 duration=3308s

55 minutes, alone on the host; HARNESS-044's run took 85 beside another
repository's self-test.

**GREEN (feature-developer, 2026-10-09).** Resolved model: **Opus 5.5**
(`claude-opus-5-5`), as the definition declares (`opus`); no override in the
dispatch. Wrote `.claude/hooks/lib.sh` only, exactly as C-1 pins it; every
helper C-1 names (`isname`, `islong`, `longname`/`LONGVAL`/`LONGHAS`,
`dispatch`, `emitr`) behaved as C-1 assumes, so nothing was worked around. No
new process (C-6): the rule is inside the one existing awk. C-7 not taken:
`CLAUDE.md`'s sentence lists tools, not tool rules, and is left unchanged.

    function isname(w) {
      return (w == "sed" || ... || w == "touch" || w == "git")
    }
    function do_git(a, b,   k, t) {
      for (k = a; k <= b; k++) if (isname(tok[k]) && tok[k] != "git") { dispatch(tok[k], k + 1, b); return }
      for (k = a; k <= b; k++) {
        if (!islong(tok[k]) || longname(tok[k]) != "output") continue
        WRITE = 1
        if (LONGHAS) t = LONGVAL
        else { k++; t = (k <= b) ? tok[k] : "" }
        emitr(t, "destination of git --output")
      }
    }
    # in dispatch, before WRITE = 1:
      if (name == "git") { do_git(a, b); return }

Seen red first (lib, before the edit): `lib: 249 passed, 1 failed`, the AC-5
case, `actual: -`, as the handoff records. After:

    phase-guard: 369 passed, 0 failed
    assertion floors: all 1 suite(s) met their declared floor (369 assertions executed, 369 declared).
    lib: 250 passed, 0 failed
    assertion floors: all 1 suite(s) met their declared floor (250 assertions executed, 250 declared).
    check-sigpipe: scanned 49 shell file(s), 45 with pipefail, 0 finding(s)
    check-grep-count: scanned 49 shell file(s), 0 finding(s)
    gates.sh --fast: All required gates passed (0 ran, 5 unconfigured, 0 known).

Control table confirmed against the shipped rule by measured value, not only by
the assertions passing (`wcand` from `lib.test.sh:674`, sourced over `lib.sh`):

    git log -1 --format=x --output=src/x.ts          => W | src/x.ts :: destination of git --output
    git log -1 --format=x --output src/main.ts       => W | src/main.ts :: destination of git --output
    git diff --output=src/main.ts HEAD               => W | src/main.ts :: destination of git --output
    git log --output="src/main.ts"                   => W | src/main.ts :: destination of git --output
    git diff -- src/x.ts                             => -
    git log --output-indicator-new=+ src/x.ts        => -
    git log --output-indicator-new=+ -- src/main.ts  => -
    git log --oneline -- src/main.ts                 => -
    git diff --stat                                  => -
    git diff --name-only                             => -
    git diff --no-index a b                          => -
    git mv src/main.ts docs/notes.md                 => W | docs/notes.md :: destination of mv | src/main.ts :: source of mv (removed by the move)
    git rm src/main.ts                               => W | src/main.ts
    git -C x mv a b                                  => W | a :: source of mv (removed by the move) | b :: destination of mv
    git commit -m "fix: sed -i x.ts"                 => -
    git status && mv a b                             => W | a :: source of mv (removed by the move) | b :: destination of mv
    git diff > /dev/null                             => - | /dev/null

Every value equals RED's recorded one; no divergence. (`git diff > /dev/null`
carries the redirect candidate from the separate redirect branch with verdict
`-`, as before the change, so `no_candidate` does not fire on it.) The C-4
denial line is pinned by the passing `role: HARNESS-045 C-4` assertion.
Not earned by a mutation here (#15-19), per the handoff; DV-1 and DV-2 are
GATES'.


## Model guidance

Planned by `bash scripts/plan.sh write HARNESS-045` from `.claude/harness/models.conf`.
A PLAN, not a record: a session setting or an explicit override can beat both
this and the agent's own `model:` field, and nothing here can see which won.
The orchestrator still writes down the model each dispatch **resolved** to, by
name, below the table.

| Phase | Agent | Planned | Why |
|---|---|---|---|
| PLANNED | `lead-po` | `fable` | planning is the judgement phase - decomposition, the oracle partition, the contract - and planning is what fable is judged best at |
| RED | `test-developer` | `opus` | writing the failing tests, the negative controls and the handoff is development work, and opus is judged the stronger model for it |
| GREEN | `feature-developer` | `opus` | the failure mode of a weaker model here is reaching green by weakening a test, which is the one thing this harness exists to prevent |
| GATES | `feature-developer` | `opus` | same risk as GREEN, and a gate failure is where "make it stop complaining" is most tempting |
| REVIEW | `lead-po` | `fable` | reading review feedback against the contract is orchestration judgement, and a wrong call here ships; a fix it finds goes back to GATES or RED, on opus |
| SCAFFOLD | `lead-po` | `opus` | source, tests and config in one indivisible derivation - code, with no failing test in front of any of it, so the stronger development model |

**Resolved:**

- PLANNED: `lead-po` ran on **Fable 5.1** (`claude-fable-5-1`), the model its definition declares; the dispatching prompt stated no override and none was observed. 2026-10-08.
- RED: `test-developer` resolved **Opus 5.5** (`claude-opus-5-5`), as declared; no override in the dispatch. Escalated AC-4 rather than amending it; amendment A-1 approved by the user. 2026-10-09.
- GREEN: `feature-developer` resolved **Opus 5.5** (`claude-opus-5-5`), as declared; no override in the dispatch. 2026-10-09.
- GATES: orchestrator on **Fable 5.1** ran DV-1 and DV-2 itself; no `feature-developer` dispatch (all gates unconfigured, nothing to fix). 2026-10-09.

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->

**DONE, 2026-10-10.** Merged in #127 (merge commit c29ce0f), release 91. The
VERSION bump lands in this DONE commit. `phase.sh set DONE --force` was run on
`main`, overriding the branch check, as HARNESS-042 to 044 did. PR CI: `gates`
passed in 3m10s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/38011502269),
`boundaries` in 6s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/38011502248).
