---
id: HARNESS-030
title: A killed mutation is announced, and the gates refuse to judge the tree behind it
slug: a-killed-mutation-is-announced-and-the-g
epic: 
type: fix
status: done
phase: DONE
branch: story/HARNESS-030-a-killed-mutation-is-announced-and-the-g
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [scripts/mutate.sh, scripts/gates.sh, .claude/tests/mutate.test.sh, .claude/tests/gates.test.sh, .claude/state/README.md, CLAUDE.md, .claude/harness/rules.md, .claude/tests/sigpipe.test.sh, .claude/tests/floors.conf, .claude/tests/selftest.test.sh]         # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

This story is item (b) of group 4, "mutation safety", in
`docs/wiki/audits/manga-translator-port-2026-10-02.md` (issue #97). It ports
manga-translator's `a0b43a2` together with MT-047's placement fix, `43bad7c`.
It builds on the trap structure HARNESS-029 settled in the current
`scripts/mutate.sh`, not on downstream's version.

**The hole it closes.** `mutate.sh` puts the file back on every path where it can
still run code. A kill leaves no such path: SIGKILL, a closed terminal, or a tool
limit that does not wait. The file then stays mutated, and the only trace is a
`.bak` and a `.new` in `.claude/state/mutations/`, which nothing reads. The next
`gates.sh` run then judges code nobody wrote and records the verdict in the story
as evidence.

This nearly happened. On HARNESS-024 a tool time limit killed a deferred
verification mid-mutation. `mutate.sh`'s trap restored `scripts/gates.sh` on the
SIGTERM (log: `exited 143`). A SIGKILL would have run no trap, and nothing would
have stopped the gates.

**Decided by the audit, and implemented here without reopening:**

- An `.active` sentinel, written **before** the file is touched and removed only
  after a `cmp`-verified restore.
- `mutate.sh --check`.
- `gates.sh` refusing to run behind a stranded mutation, with the check placed
  **before any gate runs**. That is MT-047's placement, not `a0b43a2`'s, which
  ran every gate first.

**What triage found that this story must handle:**

1. **Downstream's `--check` compares the backup against `$ROOT/$a_file`.** That
   breaks for a target given as an absolute path, which `mutate.sh:89-92`
   allows. Here the sentinel also records the resolved absolute path.
2. **Downstream writes the sentinel with `|| true`.** A sentinel that silently
   fails to exist defeats the mechanism.
3. **Downstream refuses every gate run while any sentinel is live, including
   the mutation's own.** That breaks a documented use. A **gate probe** mutates
   a config file and runs the gate under the mutation, for example manga-translator
   MT-004:1226, `bash scripts/mutate.sh .claude/harness/project.conf '<expr>' --
   bash scripts/gates.sh --gate unit`. `rules.md` requires gate probes. Under
   downstream's rule that probe refuses itself (PO decision 2).

**Required gate that would fail if this broke:** `unit`, through `bash
scripts/selftest.sh`, which runs the `mutate` and `gates` suites. Every gate in
this repository is UNCONFIGURED, so in practice CI's `selftest.sh` step judges it.

## Acceptance criteria

All cases run in the suites' fixture trees. A **stranded** mutation is planted
in the fixture as an `.active` file whose `pid` belongs to a process that has
already exited (C-4). No test races a real SIGKILL.

- **AC-1.** When `mutate.sh` runs, an `.active` file exists in
  `.claude/state/mutations/` **while the command runs**. The command can see
  it. It holds tab-separated `pid`, `file`, `path`, `backup`, `expr`, `command`
  and `started` lines. The file is removed after the verified restore, whatever
  the command's exit status.
- **AC-2.** The sentinel exists only while the tree may be wrong:
  - It **survives** a `COULD NOT RESTORE` (exit 90).
  - It is **never written** when sed rejects the expression (exit 2) or the
    expression changes nothing (exit 3).
  - It is **removed** when `cannot write` is verified unchanged (exit 2), and
    after a TERM during the command once the restore is verified.
  - If it cannot be written, `mutate.sh` does not mutate. It exits 2 with
    `mutate: cannot record the mutation in flight at <path>; refusing to mutate
    without it`, the file stays unchanged, and no `.bak` or `.new` is left.
- **AC-3.** `mutate.sh --check` with nothing planted exits 0 and prints exactly
  one line to stdout:
  `mutate: no stranded mutation; nothing of a previous run is in the tree.`
- **AC-4.** `mutate.sh --check` with a planted stranded sentinel:
  - exits 1;
  - names the file, the expression, the command, the start stamp and the
    backup on stderr;
  - reports the process as `GONE`;
  - ends with the summary `1 unaccounted-for mutation(s). Nothing that judges
    this tree should run` / `until each is resolved above.` (amendment A-1).

  The remedy depends on the file:
  - If the file **differs** from the backup, it prints the exact `cp <backup>
    <path> && cmp <backup> <path> && rm -f <backup> <sentinel>` line.
  - If the file **matches**, it prints `rm -f <backup> <sentinel>`.
  - Both hold for a sentinel whose target was given as an **absolute path**.

  A sentinel whose `pid` is a live process is reported as `RUNNING`.
- **AC-5.** `gates.sh` with a planted stranded sentinel, invoked with no
  arguments, with `--fast` and with `--gate <id>`, in each case:
  - exits 2;
  - prints `--check`'s report followed by
    `gates: refusing to run. The gates judge the working tree, and the tree may
    hold a mutation nobody restored.`;
  - prints no `=== gate:` line;
  - leaves `gate-logs/` and `last-gate-run` untouched, and the story's `## Gate
    results` byte-identical.

  `--list` and `--audit` still run and exit 0.
  *Control:* with the sentinel removed, the same run proceeds.
- **AC-6.** A mutation's own command is not refused by its own sentinel. Given
  `mutate.sh <conf> '<expr>' -- bash scripts/gates.sh --gate <id>`, in the same
  tree:
  - the gate runs, and its result is the gate's;
  - a **full** `gates.sh` run under a mutation runs but is **not recorded**: it
    prints `(not recorded: this run is inside mutate.sh's mutation of <file>; a
    verdict on mutated code is not evidence)`, exits 1 and stamps `FULL=no`;
  - `mutate.sh --check` run as that command exits 0 and says the one mutation in
    flight is its own.

  *Control:* a **second**, unrelated live sentinel is still reported as
  `RUNNING`, and `gates.sh` still refuses.
- **AC-7.** The documentation:
  - `.claude/state/README.md` has a `mutations/*.active` row: written by
    `scripts/mutate.sh`, read by `mutate.sh --check` and `gates.sh` through it,
    hand-editable `yes`;
  - `settings.test.sh` still reports no disagreements;
  - CLAUDE.md's "Running things" block lists `bash scripts/mutate.sh --check`;
  - `rules.md`'s `.bak` sentence also says what a surviving `.active` means;
  - the suites that read those files (`reporting.test.sh` and the others C-6
    names) stay green.

## Contract

**RED may amend any block below in place, with a reason stated in the block.
GREEN builds what the amended block says.**

**Writes:** `scripts/mutate.sh`, `scripts/gates.sh`, `.claude/tests/mutate.test.sh`, `.claude/tests/gates.test.sh`, `.claude/state/README.md`, `CLAUDE.md`, `.claude/harness/rules.md`, `.claude/tests/sigpipe.test.sh`, `.claude/tests/floors.conf`, `.claude/tests/selftest.test.sh`

### C-1 `scripts/mutate.sh`, at `aa74229`

**The sentinel's path.** `ACTIVE="$MUTDIR/$SAFE.$STAMP.$$.active"` sits beside
`BAK`, `NEW` and `DIFF` (`:110-112`).

**Writing it.** It is written immediately **before** `cp "$NEW" "$FILE"`
(`:301`) and after the preview `printf`, so it is never present for a run that
never mutates:

```bash
{ printf 'pid\t%s\n'     "$$"
  printf 'file\t%s\n'    "$REL"
  printf 'path\t%s\n'    "$FILE"
  printf 'backup\t%s\n'  "$BAK"
  printf 'expr\t%s\n'    "${EXPR//$'\n'/\\n}"
  printf 'command\t%s\n' "${CMD[*]}"
  printf 'started\t%s\n' "$STAMP"
} > "$ACTIVE" 2>/dev/null || { rm -f "$ACTIVE" "$BAK"; die "cannot record the mutation in flight at $ACTIVE; refusing to mutate without it"; }
```

- **Multi-line expressions.** `mutate.sh` takes ONE expression, and
  multi-command probes put newlines inside it (HARNESS-026). The newlines are
  written as the two characters `\n`, so the record stays one line per key.
- **`path`** is the resolved absolute target. It is what `--check` compares, and
  it fixes triage finding 1.
- **The `|| die`** replaces downstream's `|| true` (triage finding 2). `die`
  exits 2, and the EXIT trap removes the `.new`.

**Removing it.** The sentinel goes only when the file is verifiably the original:

- `clear_active() { [ -f "$BAK" ] && cmp -s "$BAK" "$FILE" 2>/dev/null && rm -f "$ACTIVE" 2>/dev/null; return 0; }`
  is called from `on_exit`, after `put_back`, and from `on_signal`'s pre-mutation
  branch.
- The verified-restore path (`:348`) becomes `rm -f "$ACTIVE" "$BAK"`.
- So does the cannot-write-but-verified path (`:312`).
- The `COULD NOT RESTORE` paths leave it.

**The command's environment.** The command runs with
`HARNESS_MUTATION="$ACTIVE"` exported (`:323`):
`( cd "$ROOT" && HARNESS_MUTATION="$ACTIVE" "${CMD[@]}" )`.
That is how a gate probe's `gates.sh` and `--check` recognise the enclosing
mutation (PO decision 2).

**`--check`** is parsed before the ordinary arguments, right after `die`
(`:75`). Port downstream's body (quoted in this story's planning notes) with
these changes:

- it compares against the sentinel's `path`, falling back to `$ROOT/$file` for a
  sentinel with no `path`;
- a sentinel whose path equals `$HARNESS_MUTATION` **and** whose pid is alive is
  the caller's own enclosing mutation. It is not counted. When it is the only
  one, the success line becomes
  `mutate: no stranded mutation; the one in flight is this command's own (<file>).`
  and the exit is 0;
- every other message is verbatim from downstream (AC-3, AC-4).

`usage()` gains its `--check` line, and the header comment gains downstream's
`--check` paragraph and "a mutation in flight SAYS SO" bullet, reworded for
upstream's structure.

**`kill -0`** works on MSYS pids (`$$`) within Git Bash. That is what is
recorded, and the planted-pid tests prove it on this host.

### C-2 `scripts/gates.sh`, at `aa74229`

**The refusal goes immediately after the `--gate` typo check (`:206-212`),
before `STORY` is loaded and before any gate runs.** It is guarded by
`[ "$LIST" = 0 ] && [ "$AUDIT" = 0 ]`:

```bash
if [ "$LIST" = 0 ] && [ "$AUDIT" = 0 ] && [ -f "$ROOT/scripts/mutate.sh" ]; then
  if ! mutation_report="$(bash "$ROOT/scripts/mutate.sh" --check 2>&1)"; then
    printf '%s\n' "$mutation_report" >&2
    printf 'gates: refusing to run. The gates judge the working tree, and the tree may hold a mutation nobody restored.\n' >&2
    printf 'Resolve each mutation above, then run the gates again.\n' >&2
    exit 2
  fi
fi
```

Exit 2 is the existing "nothing ran" code (the `--gate` typo). It is not 1,
because no gate failed, and not 3, because nothing was blocked.

**PO decision 1: a run inside a mutation is never recorded.** This goes in the
refusal block (`:869-890`) as the first check, ahead of the branch refusal:

```bash
if [ "$FULLRUN" = yes ] && [ -n "${HARNESS_MUTATION:-}" ] && [ -f "$HARNESS_MUTATION" ] \
   && [ "${HARNESS_MUTATION%/*}" = "$ROOT/.claude/state/mutations" ]; then
  REFUSED=1; FULLRUN=no
  REFUSED_WHY="this run is inside mutate.sh's mutation of $(awk -F'\t' '$1 == "file" { print $2; exit }' "$HARNESS_MUTATION"); a verdict on mutated code is not evidence"
fi
```

- **The directory comparison is load-bearing.** Every deferred verification in
  this harness runs `mutate.sh <file> ... -- bash .claude/tests/gates.test.sh`,
  whose fixture copies of `gates.sh` have their own `ROOT`. Those copies must
  **not** treat the outer mutation as theirs, or every recorded-run assertion in
  `gates.test.sh` would fail under every such verification.
- **Precedence.** Mutated code first, then the branch, then untracked files.
  The existing exits at `:858-872` already exit 1 on `REFUSED=1`.

### C-3 PO decisions, and why

**PO decision 2: the mutation's own command may run the gates.** Downstream's
rule, "any live sentinel refuses", makes every gate probe impossible. A gate
probe mutates a config and runs `gates.sh --gate <id>` under it. `rules.md`
requires one whenever a story adds or changes a gate, and MT-004 used exactly
this form.

- **Who passes.** `HARNESS_MUTATION` tells a process it is that mutation's own
  command. The sentinel must also be in *this* tree's `mutations/` and its pid
  must be alive. A stale exported variable, or a fixture tree, therefore gains
  nothing.
- **What still refuses.** A second sentinel, live or dead, still refuses.
- **What is given up.** A command could in principle export the variable
  itself. That would take deliberate effort, and it still could not get a
  recorded verdict, because of PO decision 1.

**PO decision 3: a sentinel that cannot be written stops the mutation.** This
is triage finding 2. The sentinel's whole purpose is to exist while the tree is
wrong.

**PO decision 4: detection, not a lock.** As downstream did: `--check` reports
and exits, and holds and waits for nothing. A lock that a subagent could
deadlock against is worse than the race, and group 6 item C owns run locking.

### C-4 Tests

**The stranded fixture.** To plant one in a fixture tree:

1. Write the target file with mutated content.
2. Write a `.bak` holding the original.
3. Write an `.active` with the seven keys.
4. Make its `pid` the `$$` of a finished `bash -c 'echo $$'`, which has been
   reaped and so is dead.

A `RUNNING` case uses `sleep 30 & pid=$!`, killed afterwards. All of these are
bounded, and nothing sends a real SIGKILL.

**`mutate.test.sh`** gains one block per mutate-side AC (AC-1 to AC-4, and
AC-6's `--check` half).

- **AC-1's "command sees it".** The command copies `.claude/state/mutations/*.active`
  to a path outside `src/`, under the ignored `.claude/state` or a `mktemp`
  path, so the phase lock is not involved.
- **AC-2's unwritable sentinel.** Plant a **directory** named exactly as the
  sentinel will be. That is not knowable in advance (stamp and pid), so the
  alternative is a read-only `mutations/` directory. RED proves on this host
  that its method really makes the redirect fail before relying on it, as
  HARNESS-029 did for `cannot write`, and records the method.

**`gates.test.sh`** gains one block for AC-5 and AC-6's gates half.

- It reuses the existing marker-gate pattern (`MARKER=…`, around
  `gates.test.sh:785`) to prove that no gate ran.
- **Remove every planted sentinel when its block ends.** The suite shares one
  `FIX`, so a sentinel left behind would make every later block exit 2.
- The recorded-run cases run from `story/T-1-fixture`, per HARNESS-026.
- AC-6's full-run case uses the **fixture's own** `mutate.sh` to wrap the
  fixture's `gates.sh`, so the sentinel is in the fixture's `mutations/`.

**Lesson from HARNESS-026: grep every affected setup.** The refusal fires only
when a sentinel exists, and the inside-mutation refusal only when
`HARNESS_MUTATION` names this tree's directory. No existing suite plants
either. RED runs `grep -rn 'active\|HARNESS_MUTATION' .claude/tests/` to confirm
that, and records the result in the handoff.

**Needles.** Whole lines with `count_line` (`grep -cxF`), or exact substrings of
one line. Any regex obeys HARNESS-028's rule: no intervals, no `\d`, no
backreferences.

**Floors.** Raise `mutate` (93) and `gates` (389) to the executed counts measured
in RED, in both `floors.conf` and the `selftest.test.sh` `COUNTS` block.

### C-5 Line pins

`.claude/tests/sigpipe.test.sh:567-568` pins two lines:

- **`scripts/gates.sh:74`** must not move. Nothing is added above it.
- **`scripts/gates.sh:542`** moves, because the refusal block at `:213` sits
  above it. GREEN updates that one number to wherever
  `why="could not launch: $(` lands.

No pin names `mutate.sh`. Run `bash scripts/check-sigpipe.sh` and `bash
scripts/check-grep-count.sh` over the tree after GREEN, and paste both summary
lines.

- The new `$(bash ... --check 2>&1)` is a substitution, not a pipeline.
- The `awk ... exit` in `REFUSED_WHY` reads a file, not a pipe, so there is no
  SIGPIPE.
- `--check`'s loop reads each sentinel with `while read`, from a file.

### C-6 Docs

- **`.claude/state/README.md`.** Add this row after `mutations/log`:
  ``| `mutations/*.active` | `scripts/mutate.sh` | `mutate.sh --check`, and `gates.sh` through it | yes |``.
  Add one paragraph under "The exhaust": what a surviving `.active` means (a
  killed run, or a restore that failed), and that `bash scripts/mutate.sh
  --check` prints the remedy. It is `yes` because deleting it is that remedy,
  and a deny rule would also block the printed `rm`.
- **CLAUDE.md, "Running things".** One line below the `mutate.sh F 'EXPR'` line
  (`:167`): `bash scripts/mutate.sh --check  # is a killed mutation still in the
  tree? gates.sh asks first`. `reporting.test.sh` checks CLAUDE.md's
  "Reporting to the user" section only; RED confirms no suite pins the "Running
  things" block. The suites that read CLAUDE.md are lib, phase-guard, plan,
  refresh, reporting, sigpipe and worktree.
- **`rules.md`.** Extend the `.bak` sentence (`:305-307`) with one sentence: a
  `.active` left behind means a mutation was killed or not restored, and
  `gates.sh` refuses to run until `mutate.sh --check` is clean.

### C-7 Commands

| When | Commands |
|---|---|
| RED and GREEN | `bash .claude/tests/mutate.test.sh` (1m12s before HARNESS-029; RED re-times it) and `bash .claude/tests/gates.test.sh` (about 2 min) |
| After GREEN | `bash .claude/tests/settings.test.sh`, `bash .claude/tests/reporting.test.sh`, `bash .claude/tests/sigpipe.test.sh`, `bash .claude/tests/selftest.test.sh`, both guards |
| GATES | `bash .claude/tests/phase-guard.test.sh`, in the background (30-37 min), because the guard's `mutate.sh` exemption is exercised there. Then `bash scripts/gates.sh` from the story branch. |
| Once, before REVIEW | the full `bash scripts/selftest.sh`, in the background |

### C-8 Oracle partition

| Kind | Criteria | Instruction to RED |
|---|---|---|
| **Settled** | The sentinel's keys, downstream's message texts, exit 2 for the refusal, MT-047's placement, PO decisions 1 to 4 | Read them out. |
| **Mechanical** | AC-1 to AC-7 | Pin each exactly, with whole lines. Every wait is bounded. |
| **Oracle-free** | none | — |

## Deferred verifications

These run against the committed GREEN code. RED cannot run any of them, because
none of the mechanisms exists yet. **Owner: GATES** for all three. Each is a
single expression, adapted to the committed line.

- **DV-1: the defect put back in `gates.sh`.** Make the refusal never fire:
  `bash scripts/mutate.sh scripts/gates.sh 's/if ! mutation_report="\$(bash "\$ROOT\/scripts\/mutate.sh" --check 2>&1)"; then/if false; then/' -- bash .claude/tests/gates.test.sh`.
  AC-5's "exits 2" and "no `=== gate:` line" **must** go red. AC-5's `--list` and
  `--audit` controls stay green.
- **DV-2: the sentinel written after the file is touched, a wrong order.** This
  uses HARNESS-029's C-6 out-of-tree runner, because `mutate.sh` refuses to
  mutate itself:
  `R="$(mktemp -d)"; mkdir -p "$R/scripts"; cp scripts/mutate.sh "$R/scripts/"; bash "$R/scripts/mutate.sh" "$PWD/scripts/mutate.sh" '<expr>' -- bash "$PWD/.claude/tests/mutate.test.sh"; rm -rf "$R"`.
  The expression makes the sentinel record no `path`
  (`s/printf 'path\\t%s\\n'    "\$FILE"/:/`, adapted). AC-4's absolute-path
  case **must** go red. This is triage finding 1 put back.
- **DV-3: the enclosing-mutation exemption widened.** Make `gates.sh`'s
  inside-mutation check never fire, by changing the `HARNESS_MUTATION` directory
  comparison to `false`:
  `bash scripts/mutate.sh scripts/gates.sh '<expr>' -- bash .claude/tests/gates.test.sh`.
  AC-6's "full run under a mutation is not recorded / exit 1 / FULL=no"
  **must** go red.


**DV-1 result (GATES, 2026-10-05).** Restored and verified:

```
=== mutate: scripts/gates.sh (1 line(s) changed by 227s/if ! mutation_report=.*; then/if false; then/) ===
  227 -   if ! mutation_report="$(bash "$ROOT/scripts/mutate.sh" --check 2>&1)"; then
  227 +   if false; then
    FAIL AC-5 gates.sh: behind a stranded mutation gates.sh exits 2
    FAIL AC-5 gates.sh: it prints the refusal, whole
    FAIL AC-5 gates.sh: after --check's report, which opens with the unaccounted-for line
    FAIL AC-5 gates.sh: and names the stranded file
    FAIL AC-5 gates.sh: the report comes before the refusal
    FAIL AC-5 gates.sh: no '=== gate:' line is printed
    FAIL AC-5 gates.sh: the gate command never ran (marker absent)
    FAIL AC-5 gates.sh: gate-logs/ is untouched
    FAIL AC-5 gates.sh: last-gate-run is untouched
    FAIL AC-5 gates.sh: the story's ## Gate results is byte-identical
    FAIL AC-5 gates.sh --fast: behind a stranded mutation gates.sh exits 2
    FAIL AC-5 gates.sh --fast: it prints the refusal, whole
    FAIL AC-5 gates.sh --fast: after --check's report, which opens with the unaccounted-for line
    FAIL AC-5 gates.sh --fast: and names the stranded file
    FAIL AC-5 gates.sh --fast: the report comes before the refusal
    FAIL AC-5 gates.sh --fast: no '=== gate:' line is printed
    FAIL AC-5 gates.sh --fast: the gate command never ran (marker absent)
    FAIL AC-5 gates.sh --fast: gate-logs/ is untouched
    FAIL AC-5 gates.sh --fast: last-gate-run is untouched
    FAIL AC-5 gates.sh --gate unit: behind a stranded mutation gates.sh exits 2
    FAIL AC-5 gates.sh --gate unit: it prints the refusal, whole
    FAIL AC-5 gates.sh --gate unit: after --check's report, which opens with the unaccounted-for line
    FAIL AC-5 gates.sh --gate unit: and names the stranded file
    FAIL AC-5 gates.sh --gate unit: the report comes before the refusal
    FAIL AC-5 gates.sh --gate unit: no '=== gate:' line is printed
    FAIL AC-5 gates.sh --gate unit: the gate command never ran (marker absent)
    FAIL AC-5 gates.sh --gate unit: gate-logs/ is untouched
    FAIL AC-5 gates.sh --gate unit: last-gate-run is untouched
    FAIL AC-6 control: under a mutation, a second, dead sentinel still refuses: exit 2
    FAIL AC-6 control: with the refusal, whole
    FAIL AC-6 control: and the gate never ran
    FAIL AC-6 control: beside a second live sentinel the probe is refused: exit 2
    FAIL AC-6 control: that sentinel is reported RUNNING
    FAIL AC-6 control: with the refusal, whole
    FAIL AC-6 control: and the gate never ran
gates: 435 passed, 35 failed
=== mutate: command exited 1; restored (verified byte-for-byte against its .bak) ===
```

**DV-2 result (GATES, 2026-10-05).** Restored and verified (run through a runner copy of `mutate.sh` in `mktemp -d`, HARNESS-029 C-6):

```
=== mutate: /c/Users/ryanc/Projects/agentic-dev-harness/scripts/mutate.sh (1 line(s) changed by 430s/.*/  :/) ===
  430 -   printf 'path\t%s\n'    "$FILE"
  430 +   :
    FAIL AC-1: the command saw exactly one sentinel of seven lines
    FAIL AC-1: its keys, in order, are pid file path backup expr command started
    FAIL AC-1: path is the resolved absolute target
    FAIL AC-1: a two-line expression still leaves a seven-line sentinel
    FAIL AC-4 (absolute): the cp && cmp && rm -f remedy names the absolute path
    FAIL AC-4 (absolute): once the file matches, it says MATCHES
    FAIL AC-4 (absolute): with the exact rm -f remedy
mutate: 182 passed, 7 failed
=== mutate: command exited 1; restored (verified byte-for-byte against its .bak) ===
```

**DV-3 result (GATES, 2026-10-05).** Restored and verified:

```
=== mutate: scripts/gates.sh (1 line(s) changed by 898s/&& \[.*\]; then/\&\& false; then/) ===
  898 -    && [ "${HARNESS_MUTATION%/*}" = "$ROOT/.claude/state/mutations" ]; then
  898 +    && false; then
    FAIL AC-6: a full run under a mutation exits 1
    FAIL AC-6: and says why it is not recorded, whole
    FAIL AC-6: that is the only '(not recorded:' line
    FAIL AC-6: no line claims to have recorded
    FAIL AC-6: the stamp says FULL=no
    FAIL AC-6: the story's ## Gate results is byte-identical
    FAIL AC-6 (C-2): from another branch the reason given is still the mutation
    FAIL AC-6 (C-2): and not the branch
gates: 462 passed, 8 failed
=== mutate: command exited 1; restored (verified byte-for-byte against its .bak) ===
```

After all three, `git diff --quiet -- scripts` printed `clean`. All run detached.

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

**A-1 (RED, 2026-10-05) — AC-4's closing line.** It said the stranded report
"ends with `1 unaccounted-for mutation(s).`". It now says it ends with the
summary `1 unaccounted-for mutation(s). Nothing that judges this tree should
run` / `until each is resolved above.` Why: the Contract ports downstream's
messages verbatim, and downstream's summary continues past the quoted words on
the same line and the next, so the literal reading and the Contract disagreed.
Raised by the test-developer; approved by the user in chat on 2026-10-05.
*Orchestrator's own reproduction:* `grep -n "unaccounted-for"
../manga-translator/scripts/mutate.sh` gives line 163, `printf '%d
unaccounted-for mutation(s). Nothing that judges this tree should run\n'`.

## Model guidance

Planned by `bash scripts/plan.sh write HARNESS-030` from `.claude/harness/models.conf`.
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

- PLANNED: `lead-po` resolved to `opus` (`claude-opus-5-5`); no override given in the dispatch.
- RED: `test-developer`, dispatched by the main session, ran on `claude-opus-5-5` (Opus 5.5), as planned. No override.
- GREEN: `feature-developer`, dispatched by the main session, ran on `claude-opus-5-5` (Opus 5.5), as planned. No override.
<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Out of scope

- A run lock between `selftest.sh` and `gates.sh`. That is group 6 item C. This
  story detects a stranded mutation and holds nothing (PO decision 4).
- Cleaning up stranded mutations automatically. `--check` prints the remedy, and
  a person or agent applies it.
- `check-boundaries.sh`. CI has no stranded mutations, because a clean checkout
  has no `.claude/state`.
- Surviving SIGKILL inside `mutate.sh` itself, which is impossible. The sentinel
  is how the next process learns of it.
- Any change to HARNESS-029's trap structure beyond calling `clear_active` and
  exporting `HARNESS_MUTATION`.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

Two suites, both at the level of the CLI: each script is run as a process in a
fixture tree (`make_project_fixture`), and every assertion reads exit status,
whole output lines, or files on disk. No unit level exists to choose: the
behaviour is the scripts' contract with their callers.

| Block | Suite | AC |
|---|---|---|
| `HARNESS-030 AC-1: the command sees an .active sentinel with seven keys...` | mutate | AC-1, C-1 (`HARNESS_MUTATION`, multi-line expr) |
| `HARNESS-030 AC-1/AC-2: visible from outside while the command runs, and removed after a TERM...` | mutate | AC-1 (present while running), AC-2 (TERM) |
| `HARNESS-030 AC-2: the sentinel survives a restore that could not be verified` | mutate | AC-2 (exit 90, twice) |
| `HARNESS-030 AC-2: a sentinel that cannot be written stops the mutation` | mutate | AC-2 (unwritable, never-written for exit 2 and 3, removed after cannot-write) |
| `HARNESS-030 AC-3: --check on a clean tree...` | mutate | AC-3 |
| `HARNESS-030 AC-4: --check names a stranded mutation...` | mutate | AC-4 (GONE, both remedies, run; C-1 no-path fallback) |
| `HARNESS-030 AC-4: both remedies hold for a target given as an absolute path` | mutate | AC-4 (absolute), triage finding 1; the DV-2 target |
| `HARNESS-030 AC-4: a sentinel whose process is alive is RUNNING` | mutate | AC-4 (RUNNING) |
| `HARNESS-030 AC-6: --check run as a mutation's own command...` | mutate | AC-6 (`--check` half and its control), C-1/C-3 (liveness) |
| `HARNESS-030 AC-7: the sentinel is documented...` | mutate | AC-7 (README row, CLAUDE.md line, rules.md bullet) |
| HARNESS-030 block at the end of `gates.test.sh` | gates | AC-5 (three modes, `--list`/`--audit`, control), AC-6 (gates half, PO decision 1, C-2 precedence, `HARNESS_MUTATION` directory controls, second-sentinel controls) |

AC-7's other two clauses - `settings.test.sh` reports no disagreements, and the
suites that read CLAUDE.md and rules.md stay green - need no new assertion:
`settings.test.sh` already checks every README row against `settings.json` in
both directions, so the new `yes` row is judged by it the moment GREEN adds it.
RED confirmed that no suite pins CLAUDE.md's "Running things" block:
`reporting.test.sh` reads only the "Reporting to the user" section.

## Handoff: RED -> GREEN

**RED, 2026-10-04 (test-developer, `opus` / `claude-opus-5-5`, no override in the dispatch).**

### Commands

```bash
bash .claude/tests/mutate.test.sh     # 41.5 s locally (Git Bash), was 1m12s before HARNESS-029
bash .claude/tests/gates.test.sh      # 2m38s locally
bash .claude/tests/selftest.test.sh   # floors table; green now: 100 passed, 0 failed
```

All timings are from local runs on this Windows/Git Bash host; none is from CI.
Nothing new carries a timeout of its own except the TERM block, which reuses
HARNESS-029 AC-3's bounds (20 s to mutate, 30 s after TERM, then KILL).

### The failure, and why it is the right one

`mutate: 127 passed, 62 failed` (189 executed). `gates: 426 passed, 44 failed`
(470 executed). Every pre-existing assertion in both suites still passes; every
failure is a HARNESS-030 assertion. The suites do not "fail at import" - these
are bash scripts against shipped scripts - so **every assertion, controls
included, executed in RED**; the failing ones fail on the observed absence:
no `.active` is ever written, `--check` is parsed as a file name and dies with
usage (exit 2), and `gates.sh` neither refuses nor knows `HARNESS_MUTATION`.
Representative actuals: `AC-3: a clean tree exits 0  expected: 0  actual: 2`;
`AC-1: the command saw exactly one sentinel of seven lines  expected: 7  actual:
0`; `AC-5 gates.sh: gate-logs/ is untouched` shows `unit.log` rewritten
(`1891302685 11` -> `2951363307 22`); `AC-5 gates.sh: last-gate-run is
untouched` shows a fresh `RESULT=pass` stamp.

mutate, verbatim FAIL lines:

```
FAIL AC-1: the command, which reads the sentinel and the file HARNESS_MUTATION names, exits 0
FAIL AC-1: the command saw exactly one sentinel of seven lines
FAIL AC-1: its keys, in order, are pid file path backup expr command started
FAIL AC-1: file is the target as given
FAIL AC-1: path is the resolved absolute target
FAIL AC-1: backup is this run's .bak, named by the same stamp and pid
FAIL AC-1: expr is the expression
FAIL AC-1: command is the command, space-joined
FAIL AC-1 (C-1): the command is told its own sentinel in HARNESS_MUTATION, named <safe>.<stamp>.<pid>.active
FAIL AC-1 (C-1): the file HARNESS_MUTATION names is the sentinel the command found
FAIL AC-1: a two-line expression still leaves a seven-line sentinel
FAIL AC-1: and its expr holds the newline as the two characters \n
FAIL AC-1: while the command runs, exactly one sentinel is visible from outside
FAIL AC-2: and the sentinel survives it
FAIL AC-2: and the sentinel survives it, beside its backup
FAIL AC-2: an unwritable sentinel exits 2
FAIL AC-2: and says so, as a whole line naming the sentinel's path
FAIL AC-2: the command is not run when the mutation cannot be recorded
FAIL AC-3: a clean tree exits 0
FAIL AC-3: and prints exactly that one line on stdout
FAIL AC-3: with no mutations/ directory it exits 0
FAIL AC-3: and prints the same one line
FAIL AC-4: a stranded mutation exits 1
FAIL AC-4: it opens with the unaccounted-for line
FAIL AC-4: it names the file
FAIL AC-4: the expression
FAIL AC-4: the command
FAIL AC-4: the start stamp
FAIL AC-4: the backup
FAIL AC-4: and reports the dead process as GONE
FAIL AC-4: the file differs, and it says so
FAIL AC-4: the exact cp && cmp && rm -f remedy, against the recorded path
FAIL AC-4: the count line
FAIL AC-4: and the report's last line closes the count
FAIL AC-4: running the printed remedy puts the original back
FAIL AC-4: and leaves --check clean
FAIL AC-4: a matching file still exits 1
FAIL AC-4: and says it MATCHES
FAIL AC-4: with the exact rm -f remedy
FAIL AC-4: running that rm leaves --check clean
FAIL C-1: a sentinel with no path line falls back to <root>/<file> for the remedy
FAIL AC-4 (absolute): it exits 1
FAIL AC-4 (absolute): it names the target as given
FAIL AC-4 (absolute): the file differs, and it says so
FAIL AC-4 (absolute): the cp && cmp && rm -f remedy names the absolute path
FAIL AC-4 (absolute): once the file matches, it says MATCHES
FAIL AC-4 (absolute): with the exact rm -f remedy
FAIL AC-4: a live sentinel is still reported, exit 1
FAIL AC-4: as RUNNING
FAIL AC-6 control: beside another live sentinel, --check as the command exits 1
FAIL AC-6 control: the other one is reported RUNNING
FAIL AC-6 control: and only it is counted
FAIL C-1: HARNESS_MUTATION naming a live sentinel in this tree counts it out, exit 0
FAIL C-1: and says the one in flight is that command's own
FAIL C-3: HARNESS_MUTATION naming a dead sentinel still exits 1
FAIL C-3: and reports it GONE
FAIL AC-6: --check as the mutation's own command exits 0
FAIL AC-6: and says the one mutation in flight is its own
FAIL AC-7: .claude/state/README.md has the mutations/*.active row
FAIL AC-7: CLAUDE.md's Running things block lists bash scripts/mutate.sh --check
FAIL AC-7: rules.md's .bak bullet says what a surviving .active means
FAIL AC-7: and names mutate.sh --check

mutate: 127 passed, 62 failed
```

gates, verbatim FAIL lines:

```
FAIL AC-5 precondition: mutate.sh --check calls the planted sentinel stranded (exit 1)
FAIL AC-5 gates.sh: behind a stranded mutation gates.sh exits 2
FAIL AC-5 gates.sh: it prints the refusal, whole
FAIL AC-5 gates.sh: after --check's report, which opens with the unaccounted-for line
FAIL AC-5 gates.sh: and names the stranded file
FAIL AC-5 gates.sh: the report comes before the refusal
FAIL AC-5 gates.sh: no '=== gate:' line is printed
FAIL AC-5 gates.sh: the gate command never ran (marker absent)
FAIL AC-5 gates.sh: gate-logs/ is untouched
FAIL AC-5 gates.sh: last-gate-run is untouched
FAIL AC-5 gates.sh: the story's ## Gate results is byte-identical
FAIL AC-5 gates.sh --fast: behind a stranded mutation gates.sh exits 2
FAIL AC-5 gates.sh --fast: it prints the refusal, whole
FAIL AC-5 gates.sh --fast: after --check's report, which opens with the unaccounted-for line
FAIL AC-5 gates.sh --fast: and names the stranded file
FAIL AC-5 gates.sh --fast: the report comes before the refusal
FAIL AC-5 gates.sh --fast: no '=== gate:' line is printed
FAIL AC-5 gates.sh --fast: the gate command never ran (marker absent)
FAIL AC-5 gates.sh --fast: gate-logs/ is untouched
FAIL AC-5 gates.sh --fast: last-gate-run is untouched
FAIL AC-5 gates.sh --gate unit: behind a stranded mutation gates.sh exits 2
FAIL AC-5 gates.sh --gate unit: it prints the refusal, whole
FAIL AC-5 gates.sh --gate unit: after --check's report, which opens with the unaccounted-for line
FAIL AC-5 gates.sh --gate unit: and names the stranded file
FAIL AC-5 gates.sh --gate unit: the report comes before the refusal
FAIL AC-5 gates.sh --gate unit: no '=== gate:' line is printed
FAIL AC-5 gates.sh --gate unit: the gate command never ran (marker absent)
FAIL AC-5 gates.sh --gate unit: gate-logs/ is untouched
FAIL AC-5 gates.sh --gate unit: last-gate-run is untouched
FAIL AC-6 control: under a mutation, a second, dead sentinel still refuses: exit 2
FAIL AC-6 control: with the refusal, whole
FAIL AC-6 control: and the gate never ran
FAIL AC-6: a full run under a mutation exits 1
FAIL AC-6: and says why it is not recorded, whole
FAIL AC-6: that is the only '(not recorded:' line
FAIL AC-6: no line claims to have recorded
FAIL AC-6: the stamp says FULL=no
FAIL AC-6: the story's ## Gate results is byte-identical
FAIL AC-6 (C-2): from another branch the reason given is still the mutation
FAIL AC-6 (C-2): and not the branch
FAIL AC-6 control: beside a second live sentinel the probe is refused: exit 2
FAIL AC-6 control: that sentinel is reported RUNNING
FAIL AC-6 control: with the refusal, whole
FAIL AC-6 control: and the gate never ran

gates: 426 passed, 44 failed
```

`bash scripts/gates.sh --fast` on this tree: every gate is UNCONFIGURED
(`All required gates passed (0 ran, 5 unconfigured, 0 known)`), as the story's
Context says, so it judges nothing here; the suites above, run by
`selftest.sh`, are the real judge. `check-sigpipe: scanned 44 shell file(s), 41
with pipefail, 0 finding(s)`; `check-grep-count: scanned 44 shell file(s), 0
finding(s)` - both over the tree with the new test code in it.

### What each block asserts

mutate.test.sh (all at the end, before `summary`):

- **AC-1 seven keys.** One run whose command copies every `.active` and the file
  `$HARNESS_MUTATION` names to `$W`: exactly one sentinel, 7 lines, keys in the
  order `pid file path backup expr command started`; `file` = `src/main.ts`;
  `path` = `<fixture, pwd form>/src/main.ts`; `backup` =
  `<mutations>/src_main.ts.<started>.<pid>.bak`; `expr`; `command` = `${CMD[*]}`;
  `HARNESS_MUTATION` = `<mutations>/src_main.ts.<started>.<pid>.active` and the
  file it names is byte-identical to the sentinel found. No sentinel after exit
  0, exit 1, and a command that never started. A real-newline expression gives a
  7-line sentinel whose `expr` holds the two characters `\n`.
- **AC-1/AC-2 TERM.** While `sleep 3` runs, exactly one sentinel is visible from
  outside; after TERM to mutate.sh's pid, the file is restored and no sentinel
  is left.
- **AC-2 exit 90.** The sentinel survives a deleted backup and a read-only target.
- **AC-2 unwritable.** Exit 2, the whole line `mutate: cannot record the mutation
  in flight at <path>; refusing to mutate without it`, file byte-identical, no
  `.bak`, no `.new`, command not run. Under the same shim, a rejected expression
  (exit 2) and a no-op expression (exit 3) never print the cannot-record line -
  so "never written" is observed, not just "not left behind". Verified
  cannot-write (read-only target) leaves no sentinel.
- **AC-3.** Clean tree, and a tree with no `mutations/` at all: exit 0, stdout
  exactly `mutate: no stranded mutation; nothing of a previous run is in the tree.`
- **AC-4 planted GONE.** Exit 1, empty stdout, and on stderr each of downstream's
  lines whole (opening line, `  src/main.ts`, `mutated by:`, `command:`,
  `started:`, `process: <pid> (GONE - ...)`, `original:`, DIFFERS, the exact
  `cp ... && cmp ... && rm -f <bak> <sentinel>` line, the count line, last line
  `until each is resolved above.`). The printed remedy is then **executed**: it
  must restore the file and leave `--check` clean. Matching file: MATCHES, the
  exact `rm -f <bak> <sentinel>`, no `cp` line, and running it leaves `--check`
  clean. No `path` line: the remedy uses `<root>/src/main.ts`.
- **AC-4 absolute.** A real run on `$W/h30-outside.ts` (outside the fixture)
  made read-only by its command (exit 90): `--check` exits 1, names the target
  as given, prints the `cp` remedy against the absolute path; after the file is
  copied back, MATCHES and the exact `rm -f` line.
- **AC-4 RUNNING.** A planted sentinel with a live `sleep 30` pid: exit 1,
  `process: <pid> (RUNNING - a mutation is in flight right now; wait for it)`,
  no `GONE - `.
- **AC-6 --check half.** As the mutation's own command, alone: exit 0 and the
  whole line `mutate: no stranded mutation; the one in flight is this
  command's own (src/main.ts).` Control beside the live planted sentinel: exit
  1, RUNNING, exactly one count line, no `  src/main.ts` line.
  `HARNESS_MUTATION` naming the live planted sentinel: exit 0 and the own line
  naming `src/other.ts`; naming a dead one: exit 1, GONE.
- **AC-7.** README row whole (C-6's text); a CLAUDE.md line matching
  `^bash scripts/mutate\.sh --check +# is a killed mutation still in the tree\?
  gates\.sh asks first$` (any spacing before `#`, so GREEN may align it to the
  block); the rules.md bullet starting `- Do not commit `.claude/state/**``
  contains `.active` and `mutate.sh --check`.

gates.test.sh (one block at the end, on `story/T-1-fixture`, a marker gate that
touches `.claude/state/h30-ran`, floor 40):

- **Baseline.** Nothing planted: exit 0, marker present, recorded.
- **AC-5 x3** (`gates`, `--fast`, `--gate unit`), each from a known state
  (story as committed, `last-gate-run` = `RESULT=h30-before`, `gate-logs/unit.log`
  = `h30 before`): exit 2; the refusal line whole; `--check`'s opening line and
  `  src/main.ts`; the report's line number below the refusal's; no `^=== gate:`;
  marker absent; every file in `gate-logs/` unchanged by name and cksum;
  `last-gate-run` still exactly `RESULT=h30-before`; story byte-identical (cmp).
- **`--list`, `--audit`:** exit 0, no refusal, gate not run.
- **AC-5 control:** sentinel removed, file back - all three modes exit 0 and run
  the gate; the full run prints `=== gate: unit` and records.
- **AC-6 gates half.** The fixture's own `mutate.sh` mutating the fixture's
  `project.conf` around the fixture's `gates.sh`: `--gate unit` under a
  mutation exits 0, no refusal, header printed, marker present, and
  `PASS ... (Ns, observed 48, floor 40)`; a mutation to `3 passed` gets the
  gate's own `below the floor of 40`, exit 1. A **full** run under the mutation:
  exit 1, the whole `(not recorded: this run is inside mutate.sh's mutation of
  .claude/harness/project.conf; a verdict on mutated code is not evidence)`,
  the only `(not recorded:` line, no `recorded in`, `FULL=no`, story
  byte-identical, but the gate ran. From another branch (`h30-elsewhere`): the
  mutation reason, not the branch one (C-2 precedence).
- **C-2 directory controls:** `HARNESS_MUTATION` naming a live-pid sentinel in
  ANOTHER tree's `mutations/` - records, exit 0, `FULL=yes`; naming a missing
  file in this tree's - records, exit 0.
- **AC-6 controls:** a second DEAD sentinel and a second LIVE one (RUNNING line
  whole) each make the probe's `gates.sh --gate unit` refuse: exit 2, refusal,
  gate not run.
- Every planted sentinel is removed as its case ends; the block ends asserting
  none is left in the shared fixture.

### Files touched

- `.claude/tests/mutate.test.sh` - the HARNESS-030 blocks; `clear_strays` now
  also `rm -rf`s `*.active` (a COULD NOT RESTORE now leaves one, and the AC-2
  method plants directories under that name); the EXIT trap also kills a
  `sleep 30` left by an aborted block and restores `h30-outside.ts`'s mode.
- `.claude/tests/gates.test.sh` - the HARNESS-030 block before `summary`; it
  re-sets the EXIT trap to also remove its temp dir and kill its `sleep 30`.
- `.claude/tests/floors.conf` - `mutate` 93 -> 189, `gates` 389 -> 470, with the
  measurement paragraph at the foot.
- `.claude/tests/selftest.test.sh` - the same two numbers in `COUNTS`.
- this story: `## Test plan`, this handoff.

Not touched: `scripts/*.sh`, `.claude/state/README.md`, `CLAUDE.md`,
`rules.md`, `sigpipe.test.sh` (C-5's `gates.sh:542` pin is GREEN's).

### The interface the tests pin (stated as fact)

`scripts/mutate.sh`:

- `--check` is recognised as `$1` before the ordinary arguments. Clean: exit 0,
  stdout exactly the AC-3 line (or the own-mutation line), nothing required of
  stderr. Stranded/running: exit 1, stdout EMPTY, the report on stderr in
  downstream's exact format (above) - the indentation is pinned: two spaces
  before the file, four before each label, labels padded so values start at
  column 18 (`    mutated by:  `, `    command:     `, `    started:     `,
  `    process:     `, `    original:    `), six spaces before the remedy.
- The remedy compares against the sentinel's `path` (falling back to
  `<ROOT>/<file>`), and prints `path`, not `<ROOT>/<file>`, in the `cp` line.
  The sentinel in the remedy is the path as globbed from
  `$ROOT/.claude/state/mutations/*.active` with ROOT from `cd .. && pwd`.
- The sentinel is `$MUTDIR/$SAFE.$STAMP.$$.active` - the tests derive the
  expected name from the backup's name by swapping `.bak` for `.active`, and from
  `HARNESS_MUTATION`.
- `HARNESS_MUTATION` is in the command's environment and equals that path.
- `STAMP` must still come from ONE call to `date` found on PATH (the AC-2 shim
  replaces it). If GREEN reads the time any other way, or calls `date` a
  second time, the unwritable-sentinel test breaks - move the method, do not
  weaken the test (return to RED).

`scripts/gates.sh`: the refusal on stderr is `mutation_report` then the refusal
line, exit 2, before any `=== gate:`; the not-recorded line and `FULL=no` as
C-2 says.

Not constrained: the `Resolve each mutation above...` follow-up line (not
asserted), the header comment and `usage()` wording, whether stderr carries an
`Is a directory` complaint on the unwritable path, the order of sentinels in a
multi-sentinel report, and anything `--check` prints for a sentinel with no
backup.

### Passed on arrival, and what earns each

Every assertion executed in RED. These new ones passed, and each is either a
precondition or a control whose job is to stop an over-eager implementation:

| Assertion(s) | Why green now | What makes it bite (GREEN/GATES to confirm) |
|---|---|---|
| mutate: the AC-2/AC-4 preconditions (pid dead, pid alive, shim refuses the redirect, exit 90 for both strandings, exit 2 cannot-write, backup holds the original) | properties of the host and of HARNESS-029's code | a host where the method does not hold fails here, not later |
| mutate: every "no sentinel is left" and "no sentinel exists", "the file is restored", "no .bak/.new", file byte-identical, "not as GONE", "own mutation not listed", "does not call it unaccounted for" | nothing writes a sentinel yet | paired with a red assertion in the same block; each goes red if GREEN never clears the sentinel (e.g. drop `clear_active` from `on_exit`) |
| mutate: "never attempted" x2 (exit 2 sed reject, exit 3 no-op) | no sentinel code exists | goes red if GREEN writes the sentinel before the sed/cmp checks |
| gates: baseline x3, AC-5 control x8, `--list`/`--audit` x5, `--fast`/`--gate` story byte-identical x2 | no refusal exists | a refusal that fires unconditionally, or ignores the `LIST`/`AUDIT` guard |
| gates: AC-6 gate probes x8 (exit 0, no refusal, header, marker, PASS observed 48 floor 40; exit 1, below floor, no refusal) and "but the gates did run" | no refusal exists | downstream's rule: drop the own-sentinel exemption from `--check` and these go red (that is triage finding 3) |
| gates: AC-6 (C-2) "one `(not recorded:` line", "exit 1" | the branch refusal alone satisfies them in RED | the paired "reason is the mutation"/"not the branch" assertions are red |
| gates: C-2 directory controls x5 | gates.sh ignores `HARNESS_MUTATION` | delete the `${HARNESS_MUTATION%/*} = $ROOT/...` comparison and the other-tree case goes red |
| gates: "no sentinel is left in the shared fixture" | none planted survives | a case that forgets its cleanup |

The rightmost column is a claim: those mutations need the GREEN code to exist.
Running them is not in RED's power and is not claimed here.

### Negative controls: expected values

These are bash, not a module that failed to import, so each control below ran
in RED and its measured value is the RED value. GREEN must re-measure each
against the shipped scripts and record agreement or the difference.

| Control | Threshold | Expected after GREEN | Measured in RED |
|---|---|---|---|
| planted dead pid (`bash -c 'echo $$'`) | `kill -0` fails | `gone` | `gone` (both suites) |
| planted live pid (`sleep 30 &`) | `kill -0` succeeds | `alive` | `alive` |
| date-shim redirect probe | the redirect fails | `refused` | `refused` |
| `--check` clean, exit / stdout | 0 / the AC-3 line | 0 / line | 2 / empty |
| `--check` with a second LIVE sentinel under a mutation | exit 1, 1 counted | 1, RUNNING, 1 | (no `--check`: 2) |
| `HARNESS_MUTATION` -> dead sentinel | exit 1, GONE | 1 | 2 |
| AC-5 control: sentinel removed, full run | exit 0, records | 0, `recorded in` x1 | 0, x1 |
| AC-5 `--list` / `--audit` behind a sentinel | exit 0 | 0 / 0 | 0 / 0 |
| C-2: `HARNESS_MUTATION` -> another tree's sentinel | records, exit 0, FULL=yes | same | same |
| C-2: `HARNESS_MUTATION` -> missing file here | records, exit 0 | same | same |
| AC-6: probe `--gate unit`, mutation 47 -> 48 | exit 0, PASS observed 48 | same | same |
| AC-6: probe `--gate unit`, mutation 47 -> 3 | exit 1, below floor | same | same |
| AC-6: second dead / live sentinel under the probe | exit 2 | 2 / 2 | 0 / 0 |

### Discovered, and worth knowing before implementing

1. **The unwritable-sentinel method is a `date` shim, not a read-only
   directory** (C-4 left the choice to RED). A read-only `mutations/` would fail
   the backup first, since the backup lives there too; and on Git Bash a
   chmod'd directory does not refuse new files anyway. The shim is first on
   PATH, prints a fixed stamp, and plants a DIRECTORY at
   `$(pwd)/.claude/state/mutations/src_main.ts.20260101T000000Z.$PPID.active`,
   where `$PPID` is mutate.sh's `$$` because a command substitution's single
   command is exec'd directly. Proved on this host before use (scratch script:
   `planted.1784.active: Is a directory` / `REFUSED`, and `WROTE` without the
   shim); the suite re-proves it every run as a precondition. A redirect into a
   directory fails as root too, so CI's runner cannot defeat it the way root
   defeats `chmod 444`.
2. **With a floor in the conf, a PASS line reads `observed N, floor F`** - the
   first draft of the AC-6 probe assertion omitted `, floor 40` and failed for
   that reason alone; fixed before handoff.
3. **AC-4 says the report "ends with `1 unaccounted-for mutation(s).`".** The
   Contract says every message is downstream's verbatim, and downstream's
   closing is two lines: `1 unaccounted-for mutation(s). Nothing that judges
   this tree should run` / `until each is resolved above.` The tests pin
   downstream's two lines; the AC's quoted text is a prefix of the first. Read
   as the closing count statement, not as a change to the text. If the PO meant
   the line literally to end there, that is an Amendment, and these two
   assertions are where it lands.
4. **Under a deferred verification, `HARNESS_MUTATION` leaks into every
   fixture run of these suites.** DV-1/DV-3 run `gates.test.sh` inside a real
   mutation, so every fixture `gates.sh` and `mutate.sh --check` inherits the
   real tree's sentinel path. The tests do not unset it on purpose: the C-2
   directory comparison and the `--check` path-equality rule are what keep it
   harmless, and the C-2 other-tree control pins that explicitly.
5. **`grep -rn 'active\|HARNESS_MUTATION' .claude/tests/`**, with the ordinary
   uses of "active story" filtered out, found no suite planting either before
   this story (only `gate-reminder`'s `stop_hook_active` and gates.test.sh's
   `_mode in active explicit` loop). No existing setup is affected.
6. **`mkdir -p "$LOGDIR"` at `gates.sh:72` runs before C-2's refusal.** It
   creates nothing that already exists, and the AC-5 assertion compares files
   only, so it does not need to move - and moving it would shift C-5's
   `gates.sh:74` pin.

### Deferred verifications

DV-1, DV-2 and DV-3 are owned by GATES and need the GREEN code; RED cannot run
any of them, because none of the mechanisms they mutate exists yet. Each target
assertion exists and is red now: DV-1 -> `AC-5 gates.sh: behind a stranded
mutation gates.sh exits 2` and `no '=== gate:' line is printed` (and their
`--fast`/`--gate` twins); DV-2 -> `AC-1: path is the resolved absolute target`
and the `AC-4 (absolute)` cp/MATCHES lines (the absolute block strands a REAL
run so the sentinel judged is the one mutate.sh writes); DV-3 -> `AC-6: a full
run under a mutation exits 1`, `and says why it is not recorded, whole`, `the
stamp says FULL=no`.

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

    run:    2026-10-05T01:29:33Z
    commit: 7cfda08 (working tree had uncommitted changes)
    tree:   089b52e07a3a09da0c7b5d8ddeab9af7b1fe4d19
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


**PLANNED, 2026-10-04 (Lead PO).**

- **PO decision 1.** A full `gates.sh` run inside a mutation of the same tree is
  never recorded. It exits 1 with `FULL=no`, and this refusal takes precedence
  over the branch and untracked refusals.
- **PO decision 2.** The mutation's own command may run the gates, which keeps
  gate probes possible. It is recognised through `HARNESS_MUTATION`, a sentinel
  in this tree's `mutations/`, and a live pid. Downstream refuses its own probe.
- **PO decision 3.** A sentinel that cannot be written stops the mutation, where
  downstream used `|| true`.
- **PO decision 4.** This is detection, not a lock.
- **Triage fix.** `--check` compares against the recorded absolute `path`, so a
  target given as an absolute path works.
- **Pins.** `gates.sh:74` does not move. The `:542` pin moves, and GREEN
  updates it.
- **`depends_on`** is empty, as instructed.

**GREEN, 2026-10-05 (feature-developer, `claude-opus-5-5`, no override).**

- **Suites:** `mutate: 189 passed, 0 failed`; `gates: 470 passed, 0 failed`;
  `settings: 27 passed, 0 failed`; `reporting: 27 passed, 0 failed`;
  `sigpipe: 82 passed, 0 failed`; `selftest: 100 passed, 0 failed`;
  `check-sigpipe: scanned 44 shell file(s), 41 with pipefail, 0 finding(s)`;
  `check-grep-count: scanned 44 shell file(s), 0 finding(s)`; `gates.sh --fast`:
  `All required gates passed (0 ran, 5 unconfigured, 0 known)`.
- **One divergence from C-1's text.** C-1's literal `"${EXPR//$'\n'/\\n}"`
  writes `anb` for `a<newline>b` under this host's bash 5.3.15 (measured), i.e.
  the backslash is lost. Shipped as `NL=$'\n'; BSN='\n'; "${EXPR//"$NL"/"$BSN"}"`,
  which gives `a\nb` and is what the AC-1 two-line test pins.
- **Also:** `--check` skips a non-regular `*.active` (`[ -f ]`, downstream had
  `-e`): a directory under that name is never a sentinel mutate.sh wrote.
  `sigpipe.test.sh`'s pin moved `gates.sh:542` -> `gates.sh:563`; `:74` unmoved.
- **Negative controls, re-measured against the shipped code (VERBOSE runs):**
  every row of the handoff's table now reads its "Expected after GREEN" value -
  dead pid `gone`, live pid `alive`, shim `refused`; `--check` clean 0 + the AC-3
  line; second live sentinel under a mutation: exit 1, RUNNING, one count line;
  `HARNESS_MUTATION` -> dead sentinel: exit 1, GONE; AC-5 sentinel removed: full
  run exit 0 and records, `--fast`/`--gate unit` exit 0 and run the gate;
  `--list`/`--audit` 0/0; C-2 other-tree: records, exit 0, `FULL=yes`; C-2
  missing file: records, exit 0; probe 48: exit 0 PASS observed 48 floor 40;
  probe 3: exit 1, below floor; second dead / live sentinel under the probe: 2 / 2.
- **Two on-arrival controls shown to bite** (not the DVs, which stay GATES'):
  - own-sentinel exemption in `--check` replaced by `false` (out-of-tree runner,
    `bash "$R/scripts/mutate.sh" "$PWD/scripts/mutate.sh" 's/\[ "\$a" = "\$HARNESS_MUTATION" \] \&\& \[ "\$a_alive" = 1 \]/false/' -- bash "$PWD/.claude/tests/mutate.test.sh"`):
    `mutate: 182 passed, 7 failed` - `FAIL AC-6 control: and only it is counted`,
    `FAIL AC-6 control: the command's own mutation is not listed as unaccounted for`,
    `FAIL C-1: HARNESS_MUTATION naming a live sentinel in this tree counts it out, exit 0`,
    `FAIL C-1: and says the one in flight is that command's own`,
    `FAIL AC-6: --check as the mutation's own command exits 0`,
    `FAIL AC-6: and says the one mutation in flight is its own`,
    `FAIL AC-6: and does not call it unaccounted for`; `restored (verified ...)`.
  - `gates.sh`'s `HARNESS_MUTATION` directory comparison replaced by `true`
    (`bash scripts/mutate.sh scripts/gates.sh 's|\[ "\${HARNESS_MUTATION%/\*}" = "\$ROOT/.claude/state/mutations" \]|true|' -- bash .claude/tests/gates.test.sh`):
    `gates: 408 passed, 62 failed`, including `FAIL C-2 control: HARNESS_MUTATION
    naming another tree's sentinel: the run records` / `and exits 0` / `and stamps
    FULL=yes`, plus every recorded-run assertion in the suite - handoff item 4's
    leak, observed: the outer mutation's variable reaches every fixture run.
    `command exited 1; restored (verified byte-for-byte ...)`.
  `mutate.sh --check` on the real tree afterwards: clean, exit 0.
- GATES (2026-10-05): full `bash scripts/selftest.sh`: `assertion floors: all
  22 suite(s) met their declared floor (2325 assertions executed, 2095
  declared)`, `22 harness suite(s) passed` (phase-guard included), 1774 s.
  `bash scripts/mutate.sh --check` on the real tree before the recorded gate
  run: `no stranded mutation`. GREEN's two departures, kept: the newline
  escape via quoted variables (the literal form drops its backslash under bash
  5.3), and `--check` skipping a non-regular `*.active`.

**DONE, 2026-10-05.** Merged in #107 (merge commit 4fd8cde), release 73. The
VERSION bump lands in this DONE commit. `phase.sh set DONE --force` was run on
`main`, overriding the branch check. PR CI: `gates` passed in 1m24s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37253630451),
`boundaries` in 7s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37253630776).
No epic. Group 4 (mutation safety) of the port audit is complete; next is
group 6, process.
