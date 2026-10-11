---
id: HARNESS-025
title: One phase-guard invocation spawns at most 27 processes
slug: one-phase-guard-invocation-spawns-at-mos
epic: 
type: fix
status: done
phase: DONE
branch: story/HARNESS-025-one-phase-guard-invocation-spawns-at-mos
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [.claude/hooks/lib.sh, .claude/tests/_spawns.sh, .claude/tests/spawns.test.sh, .claude/tests/fixtures/classify/*, .claude/tests/floors.conf, .claude/tests/selftest.test.sh]         # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

This story ports manga-translator's MT-041 (`73ae959`) and its follow-up R-1
(`5f5ff6d`). It is the second item in the port order decided in
`docs/wiki/audits/manga-translator-port-2026-10-02.md`; the source is issue #97.
Every `Bash`, `Write` and `Edit` an agent makes runs `.claude/hooks/phase-guard.sh`
once. On this Windows/MSYS host one invocation costs about 46 external processes
at about 0.2 s each, which is several seconds per tool call before the tool
itself runs. Most of those processes are `tr` calls in `.claude/hooks/lib.sh`
that bash parameter expansion can do in-process, plus a second
`git check-ignore` that one git call with both spellings as argv replaces.

**Decided by the audit, and implemented here without reopening it:**

- Port the reductions and the spawn instrument `.claude/tests/_spawns.sh`,
  including R-1's quote-escape fix to the instrument.
- Re-baseline the limit against upstream. The audit measured 46; do not copy
  downstream's 27.

**Re-verified rather than trusted.** The Lead PO re-measured upstream on
2026-10-03 at `b6b4f27` and got 46, with the sites itemised in C-7. Downstream's
27 came from its own baseline of 45. Upstream's bound is derived in C-7 from
upstream's own breakdown. It also comes out at 27, and that agreement is
arithmetic, not inheritance: C-7 shows the subtraction.

**The audit's site list needs two corrections against upstream:**

- Downstream's `phase-guard.sh:140` quote `tr` has no counterpart in upstream's
  `phase-guard.sh`. Upstream line 140 is `CWD_PREFIX="$(command_cwd ...)"`.
  HARNESS-010 moved that strip into `lib.sh:632`, at the end of
  `write_candidates`.
- Downstream turned that strip into a `sed`, which saves nothing. Upstream can
  fold it into processes that already run (C-3), so upstream removes one
  process more than downstream did.

**Required gate that would fail if this broke:** `unit`, through
`bash scripts/selftest.sh`, which runs the new `spawns` suite. Every gate in this
repository is UNCONFIGURED, so in practice CI's `selftest.sh` step is the judge.

## Acceptance criteria

- **AC-1** — Given the `_lib.sh` fixture in phase RED, when the real
  `phase-guard.sh` is traced judging the Bash command `echo hi > src/main.ts`,
  then it spawns **at most 27** external processes, and **zero** each of these
  four: `tr -d '[:space:]'`, `tr '\134' '/'`, `tr -d` of the two quote
  characters, and `tr -d '\r'`. The invocation must still deny, and the trace
  must reach `classify`.
  *Measured at `b6b4f27`:* 46 in total, of which `tr:space` 7, `tr:backslash`
  5, `tr:quotes` 4, `tr -d '\r'` 1. The bound of 27 is derived in C-7.
  *Control:* the deny and `classify` checks are what stop a trace that never
  reached the judgement from satisfying "at most".
- **AC-2** — Given any guard invocation, `is_ignored` spawns **at most one**
  `git check-ignore` per classified candidate, and still asks git about **both
  spellings** (`<p>` and `<p>/`). This is checked on three invocations:
  `echo hi > src/main.ts`, which is at most 1; `rm -rf .vitest`, which is at
  most 1 and still allowed; and `rm src/a.ts src/b.ts src/c.ts` in GREEN, which
  makes 3 `classify` calls and at most 3 `git check-ignore`.
  *Measured at `b6b4f27`:* 2, 2 and 6.
  *Control, by verdict and not by count:* `rm -rf .vitest bareonly
  playwright-report` in REVIEW, with `bareonly` ignored only by its bare
  spelling (`bareonly` plus `!bareonly/`), is still **allowed**. If either
  spelling is dropped, one of the three falls to `source` and the command is
  refused.
- **AC-3** — Given the spawn instrument, when it traces a script whose answer is
  known, it counts exactly that answer. `tr a b; printf x; git rev-parse --git-dir; true; [ 1 = 1 ]`
  gives `tr` 1, `git rev-parse` 1, and a total of 2. A traced assignment
  containing an embedded single quote, such as `v="it's h025decoy here"` with an
  executable called `h025decoy` on `PATH`, counts **0**. That second case is
  R-1: xtrace writes the quote as `'\''`, and the unfixed parser counted the
  word after it as a command.
- **AC-4** — Every helper this story rewrites returns the same result as before,
  on inputs chosen to separate the right expansion from a near miss:
  - `_to_slashes` matches `$(printf '%s' "$x" | tr '\134' '/')`, including on
    trailing newlines, runs of backslashes, and a value with no backslash.
  - The whitespace deletion in `phase_allows` and `phase_message` matches
    `tr -d '[:space:]'`, including on tabs and carriage returns.
  - `phase_message`'s trim matches the old `sed` form.
  - `json_escape` of a value carrying `\r` matches its old output.
  - Each of the four quote-strip sites strips both `"` and `'`, judged by the
    verdict of a command quoting its target each way.
  *Control:* a whitespace deletion of spaces only (`${x// /}`) must **disagree**
  on the tab input. A quote strip of `"` alone must leave `'docs/x.md'`
  unstripped, and so be denied in RED as `source` where it must be allowed
  (amendment A-1).
- **AC-5** — Given about 30 representative paths, when `classify` judges them
  before and after this change, the categories are **byte-identical** to a
  golden captured from the unchanged `lib.sh`. The paths cover tracked source
  and tests, vendor and build directories, gitignored paths in both spellings,
  backslash-spelled absolute paths into the repo, and paths outside it.
  *Control:* this is what stops "spawn less" being done by "decide less".
- **AC-6** — No line of `.claude/tests/lib.test.sh` or
  `.claude/tests/phase-guard.test.sh` changes. `git diff --stat` against the
  base names neither file. Both suites pass at their floors (217 and 300) once,
  in GATES. `lib.sh` gains no `${x,,}` or `${x^^}`, since bash 3.2 does not
  have them; that is already enforced by the existing "lower" grep in the
  selftest.

## Contract

**RED may amend any block below in place, with a reason stated in the block.
GREEN builds what the amended block says.**

**Writes:** `.claude/hooks/lib.sh`, `.claude/tests/_spawns.sh`, `.claude/tests/spawns.test.sh`, `.claude/tests/fixtures/classify/*`, `.claude/tests/floors.conf`, `.claude/tests/selftest.test.sh`

### C-1 The instrument: `.claude/tests/_spawns.sh`

Port downstream's file at `5f5ff6d` (148 lines, R-1 included) verbatim, with
exactly two edits:

- **MT references.** Each comment that cites MT-041 gets
  `(manga-translator MT-041; upstream HARNESS-025)`.
- **The baseline comment.** It says 46, measured at `b6b4f27`.

These are the exported names, and their signatures as the tests destructure them:

- `spawn_trace <fixture> <tool> <key> <value> <trace-file>` runs the real hook
  from `$REPO_ROOT/.claude/hooks/phase-guard.sh` with xtrace on and
  `PS4='+|xt| '` set inside the shell. Stderr goes to `<trace-file>`; the
  verdict goes to `<trace-file>.out`.
- `spawn_trace_fn <fixture> <trace-file> <shell text>` runs a snippet with
  `lib.sh` sourced.
- `spawn_tally <trace-file>` prints one `<count>\t<key>` line per key, then
  `<total>\tTOTAL`. Keys are `git <subcommand>`, `tr:space`, `tr:backslash`,
  `tr:quotes`, `tr:lower`, `tr:other <argv>`, or the bare command name.
- `spawn_count <tally> <key>` returns 0 when the key is absent, and treats a
  trailing `*` as a prefix match.
- `spawn_traced_calls <trace-file> <function>`.

**A `tr -d '\r'` reads as `tr:other -d '\r'`.** AC-1's fourth zero is
`spawn_count "$tally" "tr:other -d*"`. RED may instead add a `tr:cr` key, and
records the choice here if it does.

It is a helper, not a suite. `selftest.sh` globs only `*.test.sh`
(`selftest.sh:215`), so it needs no floor. It imports nothing from
`.claude/hooks`, because the instrument must not share the assumptions of the
code it measures. It needs `json_str` and `REPO_ROOT` from `_lib.sh`.

### C-2 The suite: `.claude/tests/spawns.test.sh` (new)

**PO decision 1. All of this story's assertions go in a new suite, not in
`lib.test.sh` or `phase-guard.test.sh` as they did downstream.**

- **Cost.** On this host `phase-guard.test.sh` takes about 30 to 37 min and
  `lib.test.sh` 3m58s (measured 2026-10-03). A new suite runs only what this
  story asserts. The scratch measurement in C-7 took 57 s for four traces.
- **AC-6.** Keeping those two files untouched turns AC-6's "no existing
  assertion edited" into a property `git diff` can check.
- **Price.** A new floor in `.claude/tests/floors.conf` and a `COUNTS` row in
  `.claude/tests/selftest.test.sh`, at the executed count measured in RED.
  `selftest.test.sh` also checks that every suite has a floor.

The suite sources `_lib.sh`, then `_spawns.sh`. It builds its fixtures with
`make_fixture` and sets phases with `set_phase`. Its blocks are:

- `HARNESS-025 AC-3  the instrument counts processes, and only processes`,
  run first: a counter that counts nothing satisfies every "at most".
- `HARNESS-025 AC-1  one guard invocation spawns at most 27 processes`
- `HARNESS-025 AC-2  at most one git check-ignore per classified candidate`
- `HARNESS-025 AC-4  the rewritten helpers agree with the forms they replace`
- `HARNESS-025 AC-5  classify's verdicts are unchanged`

### C-3 The production changes (all in `.claude/hooks/lib.sh`)

Line numbers are at `b6b4f27`, re-verified 2026-10-03:

| Site | Today | Becomes |
|---|---|---|
| :335-336 `shell_assignments` | `sed -E 's/^[^A-Za-z_]+//' \| tr -d '"'"'"` | `sed -E -e 's/^[^A-Za-z_]+//' -e 's/["'"'"']//g'` |
| :369 `mutate_targets` | `awk '{ print $NF }' \| tr -d '"'"'"` | `awk '{ f = $NF; gsub(/["'"'"']/, "", f); print f }'` |
| :632 `write_candidates` | `{ awk "$_WC_AWK"; grep \| sed; } 2>/dev/null \| tr -d '"'"'"` | **Re-derived for upstream:** strip both quote characters from every line both branches print, inside the processes that already run. Add an output filter to the `awk` call at :627 (not into `_WC_AWK`'s shared text, unless RED shows that is the same thing), and add `-e 's/["'"'"']//g'` to the `sed` at :631. Then drop the trailing `tr`. Output must be byte-identical (AC-4, AC-5). |
| :649-650, :736, :747, :788, :799 | `$(printf '%s' "$x" \| tr '\134' '/')` | `_to_slashes "$x"` then `$__lib_fs`, with the helper verbatim from downstream (below) |
| :810-811 `command_cwd` | `sed -E '...' \| tr -d '"'"'"` | the same `sed` with a second `-e 's/["'"'"']//g'` |
| :847-848 `is_ignored` | two `git check-ignore -q` | `git -C "$HARNESS_ROOT" check-ignore -- "$1" "$1/" >/dev/null 2>&1` |
| :1176, :1215 | `ph="$(printf ... \| tr -d '[:space:]')"` | `ph=${line%%\|*}; ph=${ph//[[:space:]]/}` |
| :1179 | `cats="$(printf ... \| tr -d '[:space:]')"` | `cats=${cats//[[:space:]]/}` |
| :1218 `phase_message` | `$(printf \| sed -e ... -e ...)` | `msg="${msg#"${msg%%[![:space:]]*}"}"; msg="${msg%"${msg##*[![:space:]]}"}"; printf '%s' "$msg"` |
| :1235 `json_escape` | `tr -d '\r' \| awk '...'` | the same `awk`, with `gsub(/\r/, "")` as its first action |

```bash
_to_slashes() {
  __lib_fs=${1//\\//}
  while [[ "$__lib_fs" == *$'\n' ]]; do __lib_fs=${__lib_fs%$'\n'}; done
}
```

**The trailing-newline loop is load-bearing.** It reproduces what `$( )`
stripped. Downstream warns that the Bash tool collapses `\\` in typed probes, so
write backslash expressions from files and check them with `od -c`.

**`is_ignored` must not use `-q`.** Git exits 128 with more than one path
(re-verified here: `fatal: --quiet is only valid with a single pathname`), and
128 would then read as "not ignored" everywhere. That is why the call uses a
redirect.

**Left alone:**

- `lower()` at :643 stays `tr 'A-Z' 'a-z'`. It is bash-3.2 safe, and
  `nocasematch` is global state.
- The control-character map `tr` at :221 stays.
- `phase-guard.sh` itself is not edited. Its :80 `tr | cut` is on the decline
  path only.

No exported signature changes. `_to_slashes` and `__lib_fs` are new and
internal. Callers of the changed functions are unaffected, because each keeps
its name, arguments and output.

### C-4 Fixtures

`.claude/tests/fixtures/classify/paths.txt` holds the AC-5 input list, one path
per line. `classify.golden` holds `<category>\t<path>` for each path. **The
golden is captured in RED from the unchanged `lib.sh`**, through `classify` in a
`make_fixture` tree. That fixture has the real `paths.conf` and a `.gitignore`
holding `.vitest/` and `playwright-report/` (add them in the fixture if
`make_fixture` does not). The handoff records the capture command and the
golden's `sha256sum`. The golden judges the **fixture's** rules, which are
copies of the real `paths.conf` and `phases.conf`. If a later story changes
`paths.conf` it re-captures the golden, and says so.

### C-5 Earning the assertions that pass on arrival (RED)

AC-2's verdict control, AC-4's agreement checks and AC-5's golden all pass
against the shipped `lib.sh`. Earn each class once in RED with
`bash scripts/mutate.sh .claude/hooks/lib.sh '<expr>' -- bash .claude/tests/spawns.test.sh`:

1. In `is_ignored`, delete the `"$1/"` line (:848). AC-2's REVIEW verdict
   control goes red (refused).
2. In `phase_allows` (:1176), change `[:space:]` to a literal space.
   AC-4's tab case goes red.
3. At :632, change the `tr -d` quote set to `'"'` alone. AC-4's single-quote
   verdict goes red.

AC-5's golden is earned by probe 1 as well, if its path list includes a path
ignored only by its slashed spelling (it must). Paste each probe with its red
lines and `mutate.sh`'s `restored (verified ...)` line. AC-1 and AC-2's counts
are red in RED by construction, and AC-3's R-1 case is red in RED when RED
first lands `_spawns.sh` without R-1's line. Paste that run.

### C-6 Commands, narrowest first

This host is slow to spawn processes. A full `selftest.sh` takes about 102 min.

| When | Command | Time |
|---|---|---|
| RED, GREEN | `bash .claude/tests/spawns.test.sh` | about a minute or two; RED records it |
| GREEN, unit checks | `bash .claude/tests/classify.test.sh` | 1m27s |
| After edits | `bash scripts/check-sigpipe.sh` and `bash scripts/check-grep-count.sh`, over the tree | |
| After edits | `bash .claude/tests/sigpipe.test.sh` | |
| GATES, once | `bash .claude/tests/lib.test.sh` | 3m58s |
| GATES, once | `bash .claude/tests/phase-guard.test.sh` | 30 to 37 min, in the background |
| GATES | `bash scripts/gates.sh` | |
| Before REVIEW, once | the full `bash scripts/selftest.sh`, in the background | CI takes about 2 min |

`sigpipe.test.sh`'s C-5 `DISCARDED` list pins no `lib.sh` line, so nothing in
that list moves. Re-check after GREEN with
`grep -n 'lib.sh:[0-9]' .claude/tests/*.sh`. The new `_spawns.sh` pipelines
(`printf | awk`, `... | sort | uniq -c | awk`) consume all their input, but run
both guards anyway.

**Every new shell file must pass both guards:** `_spawns.sh` and
`spawns.test.sh`. Downstream's `spawn_count` is `printf | awk` with no early
exit.

### C-7 Baseline, and where 27 comes from

**Measured by the Lead PO on 2026-10-03 at `b6b4f27`, on this host.** The method
was downstream's `_spawns.sh`, copied to a scratch directory, tracing the real
upstream hook in a `make_fixture` tree. Read these figures out; do not
re-derive them.

`echo hi > src/main.ts`, RED, which denies; `classify` is called once. Total
**46**, made up of:

| Count | Key |
|---:|---|
| 8 | `awk` |
| 7 | `tr:space` |
| 6 | `grep` |
| 5 | `tr:backslash` |
| 4 | `sed` |
| 4 | `tr:quotes` |
| 3 | `tr:lower` |
| 2 | `git check-ignore` |
| 2 | `sort` |
| 1 | `cat` |
| 1 | `cut` |
| 1 | `dirname` |
| 1 | `tr:other` (control map) |
| 1 | `tr:other -d '\r'` |

The four `sed` are the redirect strip at :625, `shell_assignments`,
`command_cwd`, and `phase_message`'s trim. Three other invocations, measured the
same way:

| Invocation | Total | `git check-ignore` | `classify` calls |
|---|---:|---:|---:|
| `rm -rf .vitest` | 40 | 2 | |
| GREEN `rm src/a.ts src/b.ts src/c.ts` | 75 | 6 | 3 |
| Write `src/main.ts`, RED | 22 | | |

The bound is 46 minus the processes C-3 removes:

| Removed | Count |
|---|---:|
| `tr:space` | 7 |
| `tr:backslash` | 5 |
| `tr:quotes`, all four folded, including :632 | 4 |
| `tr -d '\r'` | 1 |
| the second `git check-ignore` | 1 |
| `phase_message`'s `sed` | 1 |
| **Total** | **19** |

46 - 19 = **27**.

Nothing C-3 does adds a process. If RED re-measures and the breakdown differs,
that is an escalation and not an edit. If the :632 fold proves impossible
without changing output, RED amends C-3 and AC-1's bound becomes 28. That is
an `## Amendments` entry put to the PO, not a silent change.

### C-8 Oracle partition

| Kind | Criteria | Instruction to RED |
|---|---|---|
| **Settled** | C-7's figures, the bound 27, and AC-2's 2/2/6 | Read them out. Do not calibrate. |
| **Mechanical** | AC-1 zeros, AC-2 counts and verdict, AC-3 exact counts, AC-4 agreement, AC-5 golden, AC-6 diff | Pin exactly. |
| **Oracle-free** | none | — |

## Deferred verifications

- **DV-1, the defect put back.** Restore the second
  `git check-ignore -q -- "$1/"` and one `tr -d '[:space:]'` in `phase_allows`
  (:1176) through `scripts/mutate.sh` against the committed `lib.sh`. One
  mutation with two `-e` expressions is allowed. Then, run with
  `-- bash .claude/tests/spawns.test.sh`:
  - AC-1's "no `tr:space`" assertion **must** go red.
  - AC-2's "at most 1" on `echo hi > src/main.ts` **must** go red.
  - AC-4 and AC-5 must stay green, because the output is the same.

  RED cannot run this: the reduced `lib.sh` does not exist yet.
  **Owner: GATES.**

  **DV-1 result (GATES, 2026-10-03).** AC-1 and AC-2 went red; AC-4 and AC-5 stayed green; restored and verified:

  ```
    876 -   git -C "$HARNESS_ROOT" check-ignore -- "$1" "$1/" >/dev/null 2>&1
    876 +   git -C "$HARNESS_ROOT" check-ignore -q -- "$1"  2>/dev/null && return 0; git -C "$HARNESS_ROOT" check-ignore -q -- "$1/" 2>/dev/null
    1205 -     ph=${line%%|*}; ph=${ph//[[:space:]]/}
    1205 +     ph="$(printf '%s' "${line%%|*}" | tr -d '[:space:]')"
  === mutate: running bash .claude/tests/spawns.test.sh ===
      FAIL AC-1: echo hi > src/main.ts spawns at most 27 external processes
      FAIL AC-1: no tr -d '[:space:]' is spawned
      FAIL AC-2: echo hi > src/main.ts spawns at most one git check-ignore
      FAIL AC-2: rm -rf .vitest spawns at most one git check-ignore
      FAIL AC-2: three candidates spawn at most three git check-ignore
      FAIL AC-2: three ignored candidates spawn at most three git check-ignore
  spawns: 60 passed, 6 failed
  === mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/.claude_hooks_lib.sh.20261003T233025Z.12281.bak) ===
           8	awk
           1	cat
           1	cut
           1	dirname
           2	git check-ignore
           6	grep
           3	sed
           2	sort
           3	tr:lower
           1	tr:other '\001\002\003\004\005\006\007\010' '|&;>< \t\n'
           3	tr:space
           31	TOTAL
  ```

  The mutated call spawned 31 = the shipped count + 3 `tr:space` + 1 `check-ignore`, so the shipped `lib.sh` spawns **27** for `echo hi > src/main.ts` (was 46): the bound C-7 derived, met exactly.
- **DV-2, a wrong value.** Change `_to_slashes` so it does not drop trailing
  newlines (delete its `while` line). AC-4's trailing-newline agreement case
  **must** go red; AC-1 stays green. This is the near-miss rewrite that a count
  cannot see. Run with `-- bash .claude/tests/spawns.test.sh`.
  RED cannot run this: `_to_slashes` does not exist yet.
  **Owner: GATES.**

  **DV-2 result (GATES, 2026-10-03).** Only the trailing-newline case went red; AC-1 stayed green; restored and verified. (The "613 line(s) changed" header for a one-line delete is the port audit's finding E, reproduced live.)

  ```
  === mutate: .claude/hooks/lib.sh (613 line(s) changed by 661d) ===
    661 -   while [[ "$__lib_fs" == *$'\n' ]]; do __lib_fs=${__lib_fs%$'\n'}; done
  === mutate: running bash .claude/tests/spawns.test.sh ===
      FAIL _to_slashes agrees with tr '\134' '/' on trailing newlines
  spawns: 65 passed, 1 failed
  === mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/.claude_hooks_lib.sh.20261003T233057Z.15874.bak) ===
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

**A-1 (RED, 2026-10-03) — AC-4's quote-strip control.** It said: "A quote
strip of `"` alone must leave `'src/main.ts'` unstripped, and so be allowed in
RED where it must be denied." It now says a `"`-only strip leaves `'docs/x.md'`
unstripped, so it is denied in RED as `source` where it must be allowed. Why:
an unstripped quoted path matches no `paths.conf` rule and falls to the
`source` default, so a quoted *source* path is still denied, and the original
control could not fail. The discriminating case is a quoted path the phase
*permits*. AC-4's main clause is unchanged. Raised by the test-developer;
approved by the user in chat on 2026-10-03.
*Orchestrator's own reproduction* (`scripts/classify.sh`, not the suite):

```
src/main.ts      -> source	src/main.ts
'src/main.ts'    -> source	'src/main.ts'
docs/x.md        -> docs	docs/x.md
'docs/x.md'      -> source	'docs/x.md'
'README.md'      -> source	'README.md'
```

## Model guidance

Planned by `bash scripts/plan.sh write HARNESS-025` from `.claude/harness/models.conf`.
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
- GREEN: `feature-developer`, dispatched by the main session, ran on `claude-opus-5-5` (Opus 5.5), as planned. Its session ended before it reported; the orchestrator verified its lib.sh change directly (spawns 66/0, lib 217/0, check-sigpipe and check-grep-count 0 findings) rather than re-dispatching.
<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Out of scope

- `lower()` and the control-map `tr` (C-3). Downstream left them, and a
  case-insensitive match without a process needs `nocasematch`, which is global
  state.
- `.claude/hooks/phase-guard.sh`, and every other hook.
- `classify()`'s trailing-slash retry for project rules. That is MT-034, a later
  story in the audit's order, which edits the same `classify` and `is_ignored`
  region of `lib.sh`.
- Downstream's assertions in `lib.test.sh:493-760` and `phase-guard.test.sh:1461-1557`
  are not ported into those files. They are ported, adapted, into `spawns.test.sh`
  (C-2).
- Making `phase-guard.test.sh` or `lib.test.sh` faster in themselves.
- The `mutate.sh ... | head -1` hang the audit noted. That belongs to the
  mutation-safety story.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

One new suite, `.claude/tests/spawns.test.sh` (C-2), 66 executed assertions,
five blocks in C-2's order. Two levels: the REAL hook traced end to end by the
instrument (AC-1, AC-2, AC-4's quote verdicts through `guard()`), and `lib.sh`
sourced in-process for the helper agreements (AC-4) and the golden (AC-5).
`lib.test.sh` and `phase-guard.test.sh` are not touched (AC-6).

| Block | Assertions | AC | State in RED |
|---|---:|---|---|
| AC-3 known script: `tr:*` 1, `git rev-parse` 1, TOTAL 2 | 3 | AC-3 | pass on arrival (instrument control) |
| AC-3 the four AC-1 tr forms + `tr:lower` each keyed once, TOTAL 5 | 6 | AC-3 / AC-1 control | pass on arrival |
| AC-3 R-1: decoy on PATH, `'\''` in trace, decoy 0, TOTAL 0 | 4 | AC-3 | pass on arrival; red without R-1's line (pasted below) |
| AC-1 deny + `classify` reached (vacuity controls) | 2 | AC-1 | pass on arrival |
| AC-1 TOTAL <= 27; `tr:space`, `tr:backslash`, `tr:quotes`, `tr:other -d*` each 0 | 5 | AC-1 | **RED** (46; 7, 5, 4, 1) |
| AC-2 `echo hi > src/main.ts` <= 1 per 1 classify | 1 | AC-2 | **RED** (2) |
| AC-2 `rm -rf .vitest` allowed in RED; <= 1 | 2 | AC-2 | verdict passes; count **RED** (2) |
| AC-2 GREEN `rm src/a.ts src/b.ts src/c.ts`: 3 classify, <= 3 | 1 | AC-2 | **RED** (6) |
| AC-2 control: REVIEW `rm -rf .vitest bareonly playwright-report` allowed; 3 classify, <= 3 | 2 | AC-2 | verdict passes (probe 1 earns it); count **RED** (5) |
| AC-4 `_to_slashes` vs `$(printf | tr '\134' '/')` on 7 inputs | 7 | AC-4 | **RED** (helper absent) |
| AC-4 control: `${x//\\//}` without the loop disagrees on trailing newlines | 1 | AC-4 | pass (control) |
| AC-4 `phase_allows` on a CR/TAB/VT/FF-padded RED row: source refused; test, docs, harness allowed; `phase_message` finds it | 5 | AC-4 | pass on arrival (probe 2 earns it) |
| AC-4 control: `${x// /}` disagrees with `tr -d '[:space:]'` on the padded field | 1 | AC-4 | pass (control) |
| AC-4 `phase_message` vs the old `sed` trim, 7 messages, byte-compared via files | 7 | AC-4 | pass on arrival |
| AC-4 `json_escape` vs the old `tr -d '\r' | awk`, 7 inputs, byte-compared via files | 7 | AC-4 | pass on arrival |
| AC-4 control: awk alone keeps a mid-line `\r` the old form deletes | 1 | AC-4 | pass (control) |
| AC-4 four quote-strip sites x two quotings, by verdict (all allowed in RED), plus `'src/main.ts'` blocked on `src/main.ts` | 9 | AC-4 | pass on arrival (probe 3 earns the class) |
| AC-5 39 paths byte-identical to `classify.golden`; line count matches | 2 | AC-5 | pass on arrival (probe 1 earns it) |

## Handoff: RED -> GREEN

**RED ran on `test-developer` resolved to `opus` (`claude-opus-5-5`); no
override in the dispatch.**

### Command

```bash
bash .claude/tests/spawns.test.sh          # 1m24s on this host, 3m08s on a cold first run
bash scripts/selftest.sh spawns            # the same, plus the floor (66): 4m04s
```

Both are the LOCAL figure. There is no CI figure yet; the suite has no
framework timeout to budget (plain bash), only wall time.

### Files touched

- `.claude/tests/_spawns.sh` (new) - downstream's file at `5f5ff6d`, verbatim but
  for C-1's two edits: each MT-041 citation now reads `(manga-translator MT-041;
  upstream HARNESS-025)`, and the baseline comment says 46 at `b6b4f27`.
- `.claude/tests/spawns.test.sh` (new) - the suite.
- `.claude/tests/fixtures/classify/paths.txt` (new) - 39 paths, three placeholders
  (`@ROOTBS@`, `@ROOT@`, `@BASE@`) expanded per fixture, because a backslash-spelled
  absolute path into a temp directory cannot be written down in advance.
- `.claude/tests/fixtures/classify/classify.golden` (new) - captured from the
  UNCHANGED `lib.sh` at `b6b4f27`.
- `.claude/tests/floors.conf` - `floor | spawns | 66`, with a note.
- `.claude/tests/selftest.test.sh` - one `COUNTS` row, `spawns 66`.
- This story: `## Test plan`, this section.

Not touched: `.claude/hooks/*`, `lib.test.sh`, `phase-guard.test.sh`
(`git diff --stat` names only `floors.conf` and `selftest.test.sh`; the rest is new).

### Golden capture (C-4)

```bash
H025_CAPTURE_GOLDEN=.claude/tests/fixtures/classify/classify.golden bash .claude/tests/spawns.test.sh
# captured 39 paths into .claude/tests/fixtures/classify/classify.golden
sha256sum .claude/tests/fixtures/classify/classify.golden
# 59a9634ff1d323c44d81654302be868ca52f7c2a9e1be524632408288fe4f87f
```

The capture mode is the suite's own `classify_paths` function, so the golden and
the assertion cannot measure different things. Its fixture is `ignore_fixture`:
`make_fixture` (which already ignores `.vitest/` and `playwright-report/`) plus
`bareonly`, `!bareonly/`, `*.tmp`, `!keep.tmp`. Each path is judged as
`check_path` judges it, `classify "$(to_rel "$p")"`. Do NOT re-capture in GREEN:
a golden re-captured after the change is fitted to whatever shipped.

### Failure output, RED (verbatim, `bash .claude/tests/spawns.test.sh`, lib.sh at b6b4f27)

```
  HARNESS-025 AC-3  the instrument counts processes, and only processes

  HARNESS-025 AC-1  one guard invocation spawns at most 27 processes
    FAIL AC-1: echo hi > src/main.ts spawns at most 27 external processes
         spawned 46
         measured, one line per tool (count, key):
         8	awk
         1	cat
         1	cut
         1	dirname
         2	git check-ignore
         6	grep
         4	sed
         2	sort
         5	tr:backslash
         3	tr:lower
         1	tr:other '\001\002\003\004\005\006\007\010' '|&;>< \t\n'
         1	tr:other -d '\r'
         4	tr:quotes
         7	tr:space
         46	TOTAL
    FAIL AC-1: no tr -d '[:space:]' is spawned
         expected: 0
         actual:   7
    FAIL AC-1: no tr '\134' '/' is spawned
         expected: 0
         actual:   5
    FAIL AC-1: no tr -d of the two quote characters is spawned
         expected: 0
         actual:   4
    FAIL AC-1: no tr -d '\r' is spawned
         expected: 0
         actual:   1

  HARNESS-025 AC-2  at most one git check-ignore per classified candidate
    FAIL AC-2: echo hi > src/main.ts spawns at most one git check-ignore
         spawned 2 git check-ignore for 1 classified candidates
         measured, one line per tool (count, key):
         8	awk
         1	cat
         1	cut
         1	dirname
         2	git check-ignore
         6	grep
         4	sed
         2	sort
         5	tr:backslash
         3	tr:lower
         1	tr:other '\001\002\003\004\005\006\007\010' '|&;>< \t\n'
         1	tr:other -d '\r'
         4	tr:quotes
         7	tr:space
         46	TOTAL
    FAIL AC-2: rm -rf .vitest spawns at most one git check-ignore
         spawned 2 git check-ignore for 1 classified candidates
         measured, one line per tool (count, key):
         7	awk
         1	cat
         1	cut
         1	dirname
         2	git check-ignore
         6	grep
         3	sed
         2	sort
         5	tr:backslash
         3	tr:lower
         1	tr:other '\001\002\003\004\005\006\007\010' '|&;>< \t\n'
         4	tr:quotes
         4	tr:space
         40	TOTAL
    FAIL AC-2: three candidates spawn at most three git check-ignore
         spawned 6 git check-ignore for 3 classified candidates
         measured, one line per tool (count, key):
         11	awk
         1	cat
         1	cut
         1	dirname
         6	git check-ignore
         8	grep
         3	sed
         2	sort
         13	tr:backslash
         7	tr:lower
         3	tr:other '\001\002\003\004\005\006\007\010' '|&;>< \t\n'
         4	tr:quotes
         15	tr:space
         75	TOTAL
    FAIL AC-2: three ignored candidates spawn at most three git check-ignore
         spawned 5 git check-ignore for 3 classified candidates
         measured, one line per tool (count, key):
         11	awk
         1	cat
         1	cut
         1	dirname
         5	git check-ignore
         8	grep
         3	sed
         2	sort
         13	tr:backslash
         7	tr:lower
         3	tr:other '\001\002\003\004\005\006\007\010' '|&;>< \t\n'
         4	tr:quotes
         21	tr:space
         80	TOTAL

  HARNESS-025 AC-4  the rewritten helpers agree with the forms they replace
    FAIL _to_slashes agrees with tr '\134' '/' on a drive-letter path
         expected: C:/Users/x/a.ts
         actual:   <__lib_fs unset: lib.sh defines no _to_slashes>
    FAIL _to_slashes agrees with tr '\134' '/' on a run of backslashes
         expected: //server///share
         actual:   <__lib_fs unset: lib.sh defines no _to_slashes>
    FAIL _to_slashes agrees with tr '\134' '/' on a value with no backslash
         expected: src/main.ts
         actual:   <__lib_fs unset: lib.sh defines no _to_slashes>
    FAIL _to_slashes agrees with tr '\134' '/' on trailing newlines
         expected: C:/x
         actual:   <__lib_fs unset: lib.sh defines no _to_slashes>
    FAIL _to_slashes agrees with tr '\134' '/' on a lone backslash
         expected: /
         actual:   <__lib_fs unset: lib.sh defines no _to_slashes>
    FAIL _to_slashes agrees with tr '\134' '/' on an inner newline and a trailing backslash
         expected: a
         b/
         actual:   <__lib_fs unset: lib.sh defines no _to_slashes>
    FAIL _to_slashes agrees with tr '\134' '/' on the empty string
         expected: 
         actual:   <__lib_fs unset: lib.sh defines no _to_slashes>

  HARNESS-025 AC-5  classify's verdicts are unchanged

spawns: 50 passed, 16 failed
```

**Why it is the right failure.** Every AC-1 and AC-2 red line is a count over a
trace that the vacuity controls show reached the judgement: the deny, the
`classify` call count, and the AC-3 instrument controls all pass. The breakdown
is C-7's to the process: 46 = awk 8, tr:space 7, grep 6, tr:backslash 5, sed 4,
tr:quotes 4, tr:lower 3, git check-ignore 2, sort 2, cat 1, cut 1, dirname 1,
control-map tr 1, `tr -d '\r'` 1; and 40 / 75 for the other two invocations,
with 2 / 2 / 6 `git check-ignore`. No escalation on the breakdown. The seven
`_to_slashes` reds name the absent helper, which is the first thing C-3 asks for.

### Export shape the tests pin

- `lib.sh` must define **`_to_slashes <value>`**, which sets the global
  **`__lib_fs`** and prints nothing that is read. The suite does `unset __lib_fs;
  _to_slashes "$x"` and reads `${__lib_fs}`. It must equal
  `$(printf '%s' "$x" | tr '\134' '/')` byte for byte, trailing newlines removed,
  including on `""` (expects `__lib_fs` set to empty, not unset).
- Unchanged names and behaviour, called directly in-process: `phase_allows <cat>`
  (exit status), `phase_message` (stdout, read through a file, no trailing
  newline), `json_escape <s>` (stdout, through a file), `classify`, `to_rel`,
  each reading `HARNESS_DIR` / `HARNESS_ROOT` / `PHASE` at call time.
- Through the real hook: `phase-guard.sh` verdicts only.
- **Not constrained:** how `is_ignored` asks both spellings (argv per C-3 or
  `--stdin`); the instrument sees argv only, so the both-spellings half is pinned
  by verdict. Whether the `:632` fold goes into the `awk` call or `_WC_AWK`.
  Whether `phase_allows` and `phase_message` share a helper. The exact form of
  the `json_escape` `\r` deletion.
- **Counted, so do not reintroduce:** a `tr -d` of ANY argument reads as
  `tr:other -d ...` and AC-1's fourth zero is the prefix `tr:other -d*`, so a
  new `tr -d` anywhere on the AC-1 path goes red. The control-map tr (`tr:other
  '\001...'`) and `tr:lower` are allowed and expected (1 and 3).

### Passed on arrival, and what earns each (C-5)

All four probes ran through `scripts/mutate.sh`, one full run of this suite each
(the narrowest command holding the assertions). Each pasted block shows the
mutation, every red line the probe ADDED over RED's 16, the summary, and the
verified restore. `git status --short .claude/hooks` was empty afterwards.

**AC-3 R-1, earned by removing R-1's line from the instrument** (C-5: "red in RED
when RED first lands `_spawns.sh` without R-1's line"). The two R-1 assertions,
and only they, go red:

```
=== mutate: .claude/tests/_spawns.sh (61 line(s) changed by /i += 2; continue }/d) ===
  90 -         if (c == "\\") { i += 2; continue }
  90 +         i++
  ...
=== mutate: running bash .claude/tests/spawns.test.sh ===
  (the 16 FAILs red in RED by construction are elided; every NEW red line follows in full)
    FAIL instrument R-1: a word after '\'' inside a value is not a command
         expected: 0
         actual:   1
    FAIL instrument R-1: an assignment alone spawns nothing
         expected: 0
         actual:   1



spawns: 48 passed, 18 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/.claude_tests__spawns.sh.20261003T202741Z.858534.bak) ===
```

Note: the AC-1 total stayed 46 under the unfixed parser on this host - the
`'\''` case that read 29 downstream arose on Ubuntu. The decoy control is what
makes it red on every platform.

**Probe 1, `is_ignored`'s `"$1/"` line deleted (`848d`).** Earns AC-2's verdict
control and AC-5's golden. Both verdicts go red, and the golden moves on every
path ignored only by its slashed spelling. (Under this probe the AC-2 *counts*
partly go green - one `git check-ignore` per call - which is the point: a count
cannot see a dropped spelling, the verdict can. The REVIEW count assertion
reads `classify was called 1 times, not 3 (instrument control)` because the
deny ends the hook at the first candidate.)

```
=== mutate: .claude/hooks/lib.sh (391 line(s) changed by 848d) ===
  848 -   git -C "$HARNESS_ROOT" check-ignore -q -- "$1/" 2>/dev/null && return 0
  848 +   return 1
  ...
=== mutate: running bash .claude/tests/spawns.test.sh ===
  (the 16 FAILs red in RED by construction are elided; every NEW red line follows in full)
    FAIL AC-2: rm -rf .vitest is still allowed in RED - ignored only as .vitest/
         expected NOT to contain: "permissionDecision":"deny"
         actual:                   {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"BLOCKED by the harness phase lock.\n\n  story:    T-1\n  phase:    RED\n  path:     .vi
    FAIL AC-2: rm -rf .vitest bareonly playwright-report is allowed in REVIEW - each ignored by a different spelling
         expected NOT to contain: "permissionDecision":"deny"
         actual:                   {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"BLOCKED by the harness phase lock.\n\n  story:    T-1\n  phase:    REVIEW\n  path:     
    FAIL AC-5: classify(to_rel(p)) for every path in paths.txt is byte-identical to classify.golden
         19c19
         < ignored	.vitest
         ---
         > source	.vitest
         22c22
         < ignored	playwright-report
         ---
         > source	playwright-report
         32,33c32,33
         < ignored	@ROOTBS@\.vitest
         < ignored	@ROOTBS@\playwright-report
         ---
         > source	@ROOTBS@\.vitest
         > source	@ROOTBS@\playwright-report
         36c36
         < ignored	C:\elsewhere\@BASE@\.vitest
         ---
         > source	C:\elsewhere\@BASE@\.vitest


spawns: 50 passed, 16 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/.claude_hooks_lib.sh.20261003T203031Z.862616.bak) ===
```

**Probe 2, `phase_allows`'s `[:space:]` narrowed to a space (`1176s/:space:/ /`,
giving `tr -d '[ ]'`).** Earns AC-4's whitespace deletion:

```
=== mutate: .claude/hooks/lib.sh (1 line(s) changed by 1176s/:space:/ /) ===
  1176 -     ph="$(printf '%s' "${line%%|*}" | tr -d '[:space:]')"
  1176 +     ph="$(printf '%s' "${line%%|*}" | tr -d '[ ]')"
  ...
=== mutate: running bash .claude/tests/spawns.test.sh ===
  (the 16 FAILs red in RED by construction are elided; every NEW red line follows in full)
    FAIL phase_allows: a category after a tab is still permitted
         refused test - the padded phase name was not read as RED
    FAIL phase_allows: a category after a form feed is still permitted
         refused docs
    FAIL phase_allows: a category before a tab and a carriage return is still permitted
         refused harness



spawns: 47 passed, 19 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/.claude_hooks_lib.sh.20261003T203342Z.866851.bak) ===
```

**Probe 3, the `:632` quote set narrowed to `"` alone (`632s/...$//`, giving
`tr -d '"'`).** Earns AC-4's quote-strip class:

```
=== mutate: .claude/hooks/lib.sh (1 line(s) changed by 632s/...$//) ===
  632 -   } 2>/dev/null | tr -d '"'"'"
  632 +   } 2>/dev/null | tr -d '"'
  ...
=== mutate: running bash .claude/tests/spawns.test.sh ===
  (the 16 FAILs red in RED by construction are elided; every NEW red line follows in full)
    FAIL allows: write_candidates strips a single-quoted redirect target (docs/x.md, RED)
         blocked with: BLOCKED by the harness phase lock.    story:    T-1   phase:    RED   path:     'docs/x.md'   category: source  Story is in RED. Production code is frozen: write the failing test first, and let it fail for t
    FAIL blocks: a single-quoted redirect to src/main.ts in RED
         blocked, but on the wrong path (wanted 'src/main.ts'): BLOCKED by the harness phase lock.    story:    T-1   phase:    RED   path:     'src/main.ts'   category: source  Story is in RED. Production code is frozen: write th



spawns: 48 passed, 18 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/.claude_hooks_lib.sh.20261003T203833Z.873741.bak) ===
```

The other three quote sites were checked the same way in a scratch copy of the
hooks before the suite was written (not through `mutate.sh`, and not counted as
evidence): narrowing `shell_assignments` (:336), `mutate_targets` (:369) or
`command_cwd` (:811) to `"` alone flipped exactly that site's single-quoted
command to DENY and left its double-quoted command allowed. The `phase_message`
trim, `json_escape` and the `_to_slashes` near miss are earned per class by
probes 2 and 3 and by their controls below; the remainder are DV-1 / DV-2
(GATES) and `/audit-mutations`.

### Negative controls - expected values

None of these depends on a module GREEN writes, so every one EXECUTED in RED
and the measured value is from the suite itself, local run.

| Control | Threshold | Expected | Measured in RED |
|---|---|---|---|
| AC-3 known script `tr a b; printf x; git rev-parse --git-dir; true; [ 1 = 1 ]` | exact | tr 1, git rev-parse 1, TOTAL 2 | 1, 1, 2 |
| AC-3 four AC-1 tr forms + `tr 'A-Z' 'a-z'` | exact | each key 1, TOTAL 5 | 1 x5, 5 |
| AC-3 R-1 decoy `v="it's h025decoy here"` | exact | h025decoy 0, TOTAL 0 | 0, 0 (fixed); 1, 1 without R-1's line |
| AC-1 deny / classify reached | present / >= 1 | deny, 1 | deny, 1 |
| AC-2 classify calls per invocation | exact | 1, 1, 3, 3 | 1, 1, 3, 3 |
| AC-2 REVIEW `rm -rf .vitest bareonly playwright-report` | verdict | allowed | allowed; DENY (`.vitest`, source) under probe 1 |
| AC-4 `${x//\\//}` vs tr on `C:\x` + three `\n` | must differ | differ | differ |
| AC-4 `${x// /}` vs `tr -d '[:space:]'` on `\r\tRED\t\v` | must differ | differ | differ |
| AC-4 awk-only vs old `json_escape` on `mid\rline` | must differ | differ | differ |
| AC-4 single-quote strip, by verdict | verdict | allowed (docs) / blocked on `src/main.ts` | as expected; DENY on `'docs/x.md'` and blocked on `'src/main.ts'` under probe 3 |
| AC-5 golden line count | = paths | 39 | 39 |

Expected after GREEN (read out of C-7, not calibrated): AC-1 TOTAL 27 with
`tr:space` 0, `tr:backslash` 0, `tr:quotes` 0, `tr:other -d*` 0; AC-2 1, 1, 3,
and 3 for the REVIEW control. Anything other than 27 exactly is worth a line
in GREEN's notes even when it passes.

### Discovered - may change the approach

1. **AC-4's control text names the wrong path.** It says a `"`-only strip leaves
   `'src/main.ts'` unstripped "and so allowed in RED where it must be denied".
   Measured on upstream: it stays DENIED, on the path `'src/main.ts'` (category
   source) - a quoted spelling falls to `source`, it does not escape the lock.
   The discriminating direction is the opposite one: a *permitted* target
   (`docs/x.md`, `cd 'docs'`, an exempt `mutate.sh` FILE) that, unstripped, falls
   to `source` and is refused. The suite tests that, plus `'src/main.ts'` blocked
   **on `src/main.ts`** (which catches the near miss as "blocked on the wrong
   path"). The criterion's main clause is satisfied as written; only its control
   wording is wrong. Not edited - that needs an `## Amendments` entry by the PO.
2. **On MSYS/Cygwin bash, `$( )` deletes every `\r` from its output** - mid-line
   too (`x="$(printf 'mid\rline' | awk ...)"` gives `midline`). So the old
   `p=$(printf | tr '\134' '/')` removed CRs from paths on this platform only, and
   `_to_slashes` will not. Likewise the old `phase_message` trim lost an inner CR
   on MSYS only. No AC-4 input carries a `\r` into `_to_slashes` or an inner `\r`
   into a message, because those agreements cannot hold on both platforms at once
   and a path or message with an embedded CR is not a real input. The
   `phase_message` and `json_escape` agreements are compared through files for
   this reason - a `$( )` comparison would have hidden the very `\r` under test.
3. Downstream's AC-1/AC-4 comments called the hook's `cat` of stdin extra to "the
   story's 44"; upstream's 46 already includes it (C-7's table lists `cat` 1).

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

    run:    2026-10-04T01:10:54Z
    commit: aeb7f74 (working tree had uncommitted changes)
    tree:   db57ddab1d2ab425494a816e87ab12ff3789018a
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


**PLANNED, 2026-10-03 (Lead PO).** The decisions, in one place:

1. All assertions go in a new `spawns` suite, with its own floor and a `COUNTS`
   row, so `lib.test.sh` and `phase-guard.test.sh` stay untouched and slow-host
   iteration takes about a minute rather than about 40 (C-2).
2. The bound of 27 is derived from upstream's own 46-process breakdown, minus
   the 19 processes the change removes (C-7). It equals downstream's number by
   arithmetic, not by copying. If the :632 fold cannot keep output identical,
   the bound becomes 28, and only through `## Amendments`.
3. Upstream's quote strip at `lib.sh:632` is folded into the existing `awk` and
   `sed`. Downstream's `phase-guard.sh:140` edit has no upstream counterpart and
   is not ported (Context).
4. AC-5 checks `classify` verdicts on about 30 paths against a golden captured
   before the change, rather than classifying every tracked file, which costs
   minutes per run on this host.

`depends_on` is empty, as instructed. MT-034, the later story, touches the same
region of `lib.sh`.
- GATES (2026-10-03): full `bash scripts/selftest.sh` on this machine:
  `assertion floors: all 22 suite(s) met their declared floor (1927 assertions
  executed, 1697 declared)`, `22 harness suite(s) passed`, with `lib: 217
  passed` and `phase-guard: 300 passed` at their floors (AC-6). Wall time 1186 s
  (~20 min), against ~95 min after HARNESS-024 and 6,135 s before it.
- GATES: DV-1 and DV-2 were run detached (`nohup`) so a tool time limit could
  not kill `mutate.sh` mid-mutation, as happened once on HARNESS-024.
- REVIEW -> GREEN (2026-10-03): PR #101's CI `gates` job failed one assertion
  that passed on every local run:

  ```
  FAIL json_escape: input 5, carrying \r, matches the tr | awk form byte for byte
  spawns: 65 passed, 1 failed
  FAIL spawns  did 65 units of work, below the floor of 66 in .claude/tests/floors.conf
  ```

  Input 5 is `$'\r\r\n\r'`. GREEN had moved the `\r` deletion into the awk as
  `gsub(/\r/, "")`, which runs after awk splits records. A lone `\r` after the
  last newline is a second record to Linux awk, so the new form emitted one
  extra `\n`. MSYS awk drops it, so no local run could see the difference.
  Measured here:

  ```
  $ printf '\r\r\n\r'  | awk 'END{print NR}'
  1
  $ printf '\r\r\n\rX' | awk 'END{print NR}'
  2
  ```

  The test was right, so this was a GREEN fix, not a return to RED. The
  deletion now happens by parameter expansion, `"${1//$'\r'/}"`, before the
  awk. For all seven of the test's inputs, the bytes awk receives are
  `cmp`-identical to the old `tr -d '\r'` output (7, 9, 4, 0, 1, 18 and 25
  bytes), so the output cannot depend on the platform's awk. Still no extra
  process. After the fix: `spawns: 66 passed, 0 failed`, `lib: 217 passed, 0
  failed`.
- After the fix: full selftest green again - all 22 suites met their floors (1927 assertions), 1185 s.

**DONE, 2026-10-04.** Merged in #101 (merge commit 22ad0bb), release 68. The
VERSION bump lands in this DONE commit. `phase.sh set DONE --force` was run on
`main`, overriding the branch check. PR CI: the first `gates` run failed on
json_escape input 5 (Linux-only; see the REVIEW -> GREEN note)
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37163170022);
after the fix, `gates` passed in 2m12s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37168273103)
and `boundaries` in 10s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37168273178).
No epic. Next in the port audit: group 3, gate correctness (MT-043 first).
