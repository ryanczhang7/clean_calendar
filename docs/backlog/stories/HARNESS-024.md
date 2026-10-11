---
id: HARNESS-024
title: Parsing project.conf spawns no process per field
slug: parsing-project-conf-spawns-no-process-p
epic: 
type: fix
status: done
phase: DONE
branch: story/HARNESS-024-parsing-project-conf-spawns-no-process-p
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [scripts/gates.sh, scripts/doctor.sh, scripts/task.sh, .claude/tests/gates.test.sh, .claude/tests/doctor.test.sh, .claude/tests/_lib.sh, .claude/tests/fixtures/manifest/*, .claude/tests/sigpipe.test.sh, .claude/tests/floors.conf, .claude/tests/selftest.test.sh]         # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

Port of manga-translator's MT-040 (`d668336`), the first item in the port order
`docs/wiki/audits/manga-translator-port-2026-10-02.md` decided. Source issue #97.
`scripts/gates.sh`, `scripts/doctor.sh` and `scripts/task.sh` each parse
`.claude/harness/project.conf` with a `trim()` that is `printf | sed`, applied to
a `$(printf | cut -d'|' -fN)` for every field. That is at least one external
process per manifest line and two or three per data line. Even upstream's
mostly-comment manifest makes this slow on this Windows/MSYS host, where a
process spawn costs about a fifth of a second, and every later story's checks
run through these scripts. That is why the audit puts this story first.

**What the audit decided, and this story implements without reopening:** port
the builtin parser (`trim`, `field`, `rest` and the untrimmed `from_field`
under them) into all three scripts. Upstream must use **its own synthetic
manifest fixture**, with goldens captured from the *current* scripts before the
parser changes. Downstream's fixture is a copy of manga-translator's own
manifest and is **not** ported.

**What the audit measured, which this story re-verifies rather than trusts:** a
`--list` of 5m24s and 6m22s as shipped, against 5.7s with the helpers spliced
in, with byte-identical output. Re-measured by the Lead PO for this story; see
the Contract's baseline block.

Required gate that would fail if this broke: `unit`, i.e. `bash
scripts/selftest.sh` via `gates.test.sh` and `doctor.test.sh`. In this
repository every gate is UNCONFIGURED (`BOOTSTRAPPED=no`), so in practice the
judge is CI's `selftest.sh` step. The same holds for every harness story.

## Acceptance criteria

- **AC-1** — Given the synthetic fixture manifest, when `bash -x scripts/gates.sh
  --list` is traced, then the trace records **zero** `sed`, **zero** `cut`, and
  **at most 20** external processes in total.
  *Measured on the real `project.conf` at `ea0fba0`:* 735 externals (647 `sed`,
  82 `cut`, and one each of `dirname`, `grep`, `cksum`, `tr`, `head`, `mkdir`).
  *Control:* the trace counter is first shown counting a script whose answer is
  known (externals counted, builtins and the script's own functions not), so a
  counter that counts nothing cannot satisfy the two zeros.
- **AC-2** — Given the synthetic fixture manifest and a *padded* copy of it,
  which is the same manifest with 100 comment and blank lines interleaved
  (tab-indented comments among them), when each of these is traced over both:
  `gates.sh --list`, `gates.sh --audit`, a full `gates.sh` run, `doctor.sh`, and
  `task.sh <id>`, then the external-process count is **the same for both
  manifests**. The cost no longer grows with the length of the manifest.
  *Control:* the scripts as shipped fail this for every invocation, because each
  padding line costs at least one `sed`. RED shows that.
- **AC-3** — Given the fixture manifests, when the following run after the
  change, then each one's output and exit status are **byte-identical** to the
  goldens captured from the unchanged scripts:
  - `gates.sh --list`, `gates.sh --audit`, and a full `gates.sh` run, over both
    the well-formed and the broken manifest;
  - the `Project toolchain` and `Test discovery` sections of `doctor.sh`;
  - `task.sh` with no argument, and `task.sh <id> <extra-arg>` for each fixture
    task.

  The same holds for a CRLF copy of the well-formed manifest, except `task.sh`
  with no argument (amendment A-1). The only thing normalised is the full run's
  `(<N>s` duration field.
  *Control:* this is what stops "parse faster" being done by "parse less". A
  rewrite that skips a table, a kind or a line fails it.
- **AC-4** — Given manifest values that contain `|`, when they are parsed, then
  each stored value is the **whole remainder of the line, embedded pipes
  intact**. That means the `cut -fN-` semantics: `-f3-` for evidence regexes
  with alternation, a `blocked-when` regex, a `slow` reason and a `ci-factor`
  value; `-f4-` for a `discovery` command with three embedded pipes; and `-f5-`
  for gate and task commands. It also holds at the second level, where a
  `ci-factor` value is re-split into its number (`-f1`) and source (`-f2-`). A
  source that follows an empty second field is still a source.
  *Control:* splitting with `field` (or `IFS='|' read`) where `rest` belongs
  truncates every one of these at its first embedded pipe, and the assertions
  must go red.
- **AC-5** — Given every line of the fixture manifest plus six edge cases, when
  each is trimmed by the `trim()` each script ships and by the old `sed` form,
  then the two agree on **every** input. The edge cases are: empty,
  all-whitespace, leading and trailing space around inner spaces, tab-padded,
  no surrounding space, and a trailing carriage return.
  *Control:* a space-only trim (`${s## }` / `${s%% }`) must **disagree** on the
  tab case and the multi-space case. Otherwise the inputs cannot tell
  `[:space:]` from a literal space.
- **AC-6** — Given the three scripts, when they are searched, then none contains
  the `sed`-based trim body or a `cut -d'|'`, and the four helpers (`trim`,
  `from_field`, `field`, `rest`) are defined **byte-identically** in all three.
  *Measured today:* the `sed` trim body appears 3 times (`gates.sh:92`,
  `doctor.sh:17`, `task.sh:8`) and `cut -d'|'` appears 21 times.

## Contract

**RED may amend any block below in place, with a reason stated in the block;
GREEN builds what the amended block says.**

**Writes:** `scripts/gates.sh`, `scripts/doctor.sh`, `scripts/task.sh`, `.claude/tests/gates.test.sh`, `.claude/tests/doctor.test.sh`, `.claude/tests/_lib.sh`, `.claude/tests/fixtures/manifest/*`, `.claude/tests/sigpipe.test.sh`, `.claude/tests/floors.conf`, `.claude/tests/selftest.test.sh`

### C-1 The helpers: names, signatures, semantics

Port these verbatim from downstream `d668336`. The same four definitions go
into each of the three scripts, near the top, in the `name() { ... }` form,
because the trace counter and `extract_fn` both find functions by that form:

```bash
trim() { local _t="$1"; _t="${_t#"${_t%%[![:space:]]*}"}"; _t="${_t%"${_t##*[![:space:]]}"}"; if [ $# -gt 1 ]; then printf -v "$2" '%s' "$_t"; else printf '%s' "$_t"; fi; }
from_field() {
  local _r="$2" _i=1
  case "$_r" in
    *'|'*)
      while [ "$_i" -lt "$1" ]; do
        case "$_r" in *'|'*) _r="${_r#*|}" ;; *) _r=""; break ;; esac
        _i=$((_i+1))
      done ;;
  esac
  printf -v "$3" '%s' "$_r"
}
rest()  { local _v; from_field "$1" "$2" _v; trim "$_v" "$3"; }
field() { local _v; from_field "$1" "$2" _v; trim "${_v%%|*}" "$3"; }
```

- `trim <string> [var]` removes leading and trailing `[:space:]`, which
  includes tab and CR. It **prints** the result when given one argument and
  **assigns** it to `var` when given two. The printing form stays because
  `doctor.sh`'s `release_of()` (`doctor.sh:39-43`) returns its value by printing
  and is called as `$(release_of ...)`. Every call site in a parse loop uses the
  assigning form: a `$(...)` forks even when its body is all builtins, measured
  downstream at about 27 ms per fork on Windows.
- `from_field <n> <string> <var>` behaves as `cut -d'|' -f<n>-` and does not
  trim. A string with no `|` is returned whole (as `cut` does). A string with
  fewer than `n` fields gives `''`.
- `rest <n> <string> <var>` is the trimmed `-f<n>-`.
- `field <n> <string> <var>` is the trimmed `-f<n>`.
- `BOOTSTRAPPED` (`gates.sh:74`, `doctor.sh:113`) becomes `grep | head -1`
  followed by `${x#*=}` and `${x//[[:space:]]/}`, and drops the `cut` and the
  `tr`. **Line 74 of `gates.sh` must still begin `BOOTSTRAPPED="$(grep`**, as in
  downstream. The split goes onto the next line.
- `line="${line%%$'\r'}"` stays in both `gates.sh` loops. `doctor.sh` and
  `task.sh` have no CR strip and depend on `trim`'s `[:space:]` for CRLF
  manifests. AC-3's CRLF case pins this.
- Bash 3.2 only: no associative arrays and no `${x,,}`. Bash, awk and coreutils
  only. `printf -v` is bash 3.1+.

**PO decision 1. Copy the helpers, do not share them.** `gates.sh` sources
`.claude/hooks/lib.sh`, but `doctor.sh` exists partly to report a *missing*
`lib.sh` (`doctor.sh:95`), and `task.sh` sources nothing. A shared copy would
make the doctor depend on the thing it diagnoses. AC-6's byte-identity check
guards against the three copies drifting apart. `scripts/selftest.sh:84` already
has its own pure-bash `trim` that sets `$TRIMMED`. It is not touched.

**Call sites, all of which change:**
- `gates.sh`: :74, :92 (definition), :104/106/107/116 (tables loop),
  :255/258/260-263 (gate loop), :389/393 (ci-factor second-level split).
- `doctor.sh`: :17 (definition), :113, :117/119/121/122 (toolchain loop),
  :216/218/220-222 (discovery loop). :42 keeps the printing form.
- `task.sh`: :8 (definition), :17-21. The no-argument listing at :12 is already
  a single `awk` and stays.

No exported signature changes. `trim` keeps its one-argument printing form, so
no caller outside these scripts moves. A grep finds `trim` defined only in these
three scripts and in `selftest.sh` (separate).

### C-2 The fixtures (upstream-owned, synthetic)

**PO decision 2. The directory is `.claude/tests/fixtures/manifest/`, not
downstream's `manifest-parse/`.** Downstream's `manifest-parse/project.conf` is a
snapshot of manga-translator's own manifest, which the audit rules out
porting. A different name means the refresh brings in a new directory instead of
silently overwriting downstream's with a file of a different meaning. Downstream
deletes its old directory when it refreshes. Files:

| File | What |
|---|---|
| `project.conf` | well-formed; `--audit` passes (rc 0) |
| `broken.conf` | exercises every `--audit` failure path; rc 1 |
| `<conf>.list.golden`, `<conf>.audit.golden`, `<conf>.audit.rc` | AC-3, for each of the two |
| `<conf>.run.golden`, `<conf>.run.rc` | AC-3, full run, the `(<N>s` duration normalised to `(Ns` and nothing else |
| `doctor.golden` | the `Project toolchain` and `Test discovery` sections of `doctor.sh` over `project.conf` |
| `task.golden` | `task.sh` with no argument, then each `task.sh <id> extra` with its rc |

RED may rename these files, provided it records the final names here.

**Amended in RED (test-developer, 2026-10-02): the final names, and why they
differ.**

| File | What |
|---|---|
| `project.conf`, `broken.conf` | the two synthetic manifests |
| `<c>.list.golden`, `<c>.audit.golden`, `<c>.run.golden` for `<c>` in `project`, `broken`, `crlf` | AC-3 for gates.sh. Each is the output (stdout and stderr) **followed by a final `rc=<status>` line**, so there are no separate `.rc` files. `run` has `(<N>s` normalised to `(Ns` and nothing else |
| `project.doctor.golden`, `crlf.doctor.golden` | doctor.sh's `Project toolchain` and `Test discovery` sections |
| `project.task.golden` | `task.sh` with no argument, then `task.sh <id> extra` for `pipes where idle nope`, each with `rc=` |
| `crlf.task.golden` | the same **without the no-argument listing** - see below |
| `.gitattributes` | `* -text` for this directory, so git never normalises a golden's bytes |

The CRLF copy is not committed; `crlf_copy` builds it at test time, because
the repository's `* text=auto eol=lf` would normalise a committed one.

Two things the brief did not anticipate:

1. **The no-argument `task.sh` listing over a CRLF manifest has no
   platform-independent golden.** That listing is one `awk` (Out of scope, and
   unchanged by this story). MSYS `awk` (and `sed`) read in text mode and drop
   the carriage return before any pattern sees it, so on this host it prints
   `<unconfigured>` for an empty task; Linux `awk` keeps the `\r` in `$5` and
   prints a bare carriage return instead. The **unchanged** script therefore
   prints different bytes on the two platforms, and a golden captured on either
   fails on the other. `crlf.task.golden` leaves the listing out; every
   `task.sh <id> extra` over CRLF is still pinned, which is the path that
   depends on `trim`'s `[:space:]` (C-1). The LF listing is pinned in
   `project.task.golden`. This narrows AC-3's CRLF clause by one invocation of a
   code path the story does not touch; the orchestrator should confirm it.
2. **`broken.conf` gained two gates the list above does not name**: `nowhere`
   (a cwd that does not exist - an `--audit` failure path) and `bare` (a
   required gate with no evidence line - the audit's WARN path and the run's
   "no evidence line" warning). `nowhere` is `ondemand`: a full run that `cd`s
   into a missing directory prints `scripts/gates.sh: line N: cd: /tmp/...`, a
   line number and a temp path, neither of which survives GREEN or another
   machine. On request, the run reports it as `ON REQUEST` and the audit still
   reaches its cwd check. For the same reason no gate or task command in
   either manifest fails in a way bash itself reports.

**Use this one fixture for every assertion that needs a manifest.** It is
synthetic and owned upstream. **No assertion may read or pin a value from the
real `.claude/harness/project.conf`** (audit, "Decided": never port an assertion
about a project's real manifest values). This file ships to consuming projects,
and in their trees such an assertion would fail.

`project.conf` must contain every line shape the three parsers distinguish, at
least:

- `BOOTSTRAPPED= yes ` with surrounding spaces
- blank lines, whitespace-only lines, `#` comments, tab-indented `#` comments,
  and a commented-out gate that would change the verdict if it were read
- a non-pipe junk line, an unknown kind, and a line with fewer fields than its
  kind expects
- gates:
  - required, optional and unconfigured (empty command)
  - an empty cwd and a non-`.` cwd
  - tab padding
  - a command containing `|` and `||`
- evidence:
  - with `|` alternation
  - `-`
- `waiver`
- `floor`
- `slow`, with a reason that contains `|`
- `ondemand`
- `ci-factor`:
  - `N | source`
  - a source containing `|`
  - `N |  | source`, an empty second field
- `covers`, two lines for one gate
- `blocked-when`, with two or more alternations
- `discovery`:
  - an empty cwd
  - a command with three embedded pipes
- `task`:
  - a piped command
  - a cwd
  - an unconfigured task

Every gate and task command is a `printf`, `true` or shell builtin, and the
`doctor` toolchain lines name `printf` and one deliberately absent executable
(`no-such-tool-h024`). That keeps the goldens the same on every machine.

`broken.conf` carries one of each `--audit` failure:

- a non-numeric floor, and a floor with no evidence
- `slow` with no reason, and `slow` naming no gate
- `ondemand` with no reason, and `ondemand` on a required gate
- `ci-factor` that is not a number, and one with no source
- an orphan `blocked-when`, and an empty pattern
- an orphan `covers`, and an empty glob

**Goldens are captured in RED from the unchanged scripts, at the RED commit's
parent.** That tree has these scripts identical to `ea0fba0`. The handoff records
the capture commands and each golden's `sha256sum`. A golden captured after any
edit to the three scripts is not an oracle.

### C-3 The trace counter (AC-1, AC-2)

Port downstream's `trace_externals <trace> <script>...` and `ext_count`, and
put them in `.claude/tests/_lib.sh` so both suites can share them. They count
each `+`-prefixed trace line whose first word is a program on PATH and is
neither a builtin, a keyword, nor a function defined in the named scripts. Pure
assignments are skipped.

- The counter's control is downstream's: three externals, one builtin and one
  function, and it must count exactly 3.
- **Robustness.** These are **process counts read from a trace**, never wall
  clock, so they are the same on CI and on this host. Wall-clock time is
  recorded in the handoff and never asserted (PO decision 3).
- **Where the bound of 20 comes from.** The six non-parse externals measured
  today, plus room for code paths the `--list` trace does not reach. AC-2's
  invariance is the sharp claim and the bound is the backstop (PO decision 4).
- **Tracing each script.** `bash -x scripts/gates.sh ...` for `gates.sh`. For
  `doctor.sh` and `task.sh` the traced command is the same, under `bash -x`.
  `doctor.sh` runs git commands for its worktree row. Those are a constant count
  and do not break AC-2's equality. RED confirms that on the shipped code; if
  they do vary, RED amends this block.
  **Confirmed in RED:** `doctor.sh` traced 2 `git`, 2 `grep`, 2 `head`, 5
  `bash` (the `bash -n` hook checks), 8 `awk`, 1 `tr`, 1 `dirname` over both
  the plain and the padded manifest; only `sed` moved (211 -> 411). No
  amendment needed.

### C-4 Where the tests live, and the shared test helpers

- **`gates.test.sh`** holds AC-1, AC-2 (the gates invocations), AC-3 (gates),
  AC-4 (gates), AC-5 (`gates.sh`'s trim) and AC-6.
- **`doctor.test.sh`** holds AC-2, AC-3, AC-4 and AC-5 for `doctor.sh` and
  `task.sh`. No suite tests `task.sh` today; downstream put those tests here too.
- **`_lib.sh`** gains:
  - `MANIFEST_FIXTURES`
  - `extract_fn <script> <name>`
  - `trim_inputs`, `trim_oracle`, `apply_trim` and `disagreements`, as downstream
  - `trace_externals` and `ext_count`
  - `pad_manifest <in> <out>`, which writes the 100-line padded copy
    deterministically
  - `crlf_copy <in> <out>`

  Every new helper must pass `check-sigpipe` and `check-grep-count`. Downstream's
  `ext_count` pipes `printf | awk` with no early exit, which is acceptable; check
  it anyway.

  **Amended in RED:** `_lib.sh` also gained `TRIM_SED_BODY` (AC-6's needle),
  `manifest_fixture` and `use_manifest` (one fixture, the manifest swapped in),
  `gates_golden`, `doctor_golden`, `task_golden` and `MANIFEST_TASKS` (the
  goldens were captured through these same functions, so the capture and the
  check cannot drift apart), `golden_check`, `line_of`, `trace_script` (runs a
  script under `bash -x` in the fixture and counts) and `same_count` (AC-2's
  equality, with both tables on failure). `trim_inputs` sets `TRIM_EDGE`, the
  manifest's line count, so the edge cases are lines `TRIM_EDGE+1..+6`.
  `apply_trim` takes a fourth argument, `print` or `assign`, because C-1's
  assigning form is what every parse-loop call site uses. Both checks pass
  over the three files: `check-sigpipe: scanned 3 shell file(s), 3 with
  pipefail, 0 finding(s)`, `check-grep-count: scanned 3 shell file(s), 0
  finding(s)`.
- **Floors (PO decision 6).** Raise `gates` (169) and `doctor` (29) in
  `.claude/tests/floors.conf` **and** in the `COUNTS` block of
  `.claude/tests/selftest.test.sh`, in the RED commit. Use the executed count
  measured in RED, and add a dated comment in `floors.conf` in the house style.
  No new suite is added, so no new floor line is needed.

### C-5 Earning the assertions that pass on arrival (RED)

AC-3, AC-4 and AC-5 are written against code that already exists and is
correct, so they are green from their first run. Under `rules.md` they are not
tests until earned. Earn each **in RED, against the shipped code**, through
`bash scripts/mutate.sh`, each against the one suite that holds it:

1. `gates.sh:116`, `-f3-` → `-f3`: the `--list` golden and AC-4's `-f3-`
   assertions go red. Run with `-- bash .claude/tests/gates.test.sh`.
2. `doctor.sh:222`, `-f4-` → `-f4`: the doctor golden and the AC-4 discovery
   assertion go red. Run with `-- bash .claude/tests/doctor.test.sh`.
3. `task.sh:21`, `-f5-` → `-f5`: the task golden and the AC-4 task assertion go
   red. Run with `-- bash .claude/tests/doctor.test.sh`.
4. `gates.sh:92`, `[[:space:]]` → ` ` throughout: AC-5's tab case goes red. Run
   with `-- bash .claude/tests/gates.test.sh`.

Paste each probe's output into the handoff: the mutation, the red lines, and
`mutate.sh`'s `restored (verified ...)` line. AC-1, AC-2 and AC-6 are red in
RED by construction, and that red run is their evidence.

### C-6 Line pins that this story moves

`.claude/tests/sigpipe.test.sh` lists status-discarded lines by number in its C-5
`DISCARDED` block (around :557-571) and fails as stale when one drifts. Four are
in this story's files:

- `scripts/doctor.sh:41:v="$(grep`
- `scripts/doctor.sh:113:BOOTSTRAPPED="$(grep`
- `scripts/gates.sh:74:BOOTSTRAPPED="$(grep`
- `scripts/gates.sh:485:why="could not launch: $(`

Inserting the helpers moves three of them; `gates.sh:74` must not move (C-1).
**GREEN updates those numbers**, and only those. The "twelve lines" count does
not change. The prose references to `gates.sh:428/432` in that suite are
comments and stay as they are. After GREEN, run `bash scripts/check-sigpipe.sh`
and `bash scripts/check-grep-count.sh` over the tree and paste both summary lines
in the handoff. The new `BOOTSTRAPPED` shape is still a `$(grep | head)` with
the status discarded, so it stays in that list rather than becoming a finding.

### C-7 Commands, narrowest first

This host is very slow to spawn processes: on 2026-10-02 a full `selftest.sh`
took about 102 min, `phase-guard` alone about 37 min, and a `--list` over the
real manifest 2m52s.

- **RED and GREEN:** `bash .claude/tests/gates.test.sh` and `bash
  .claude/tests/doctor.test.sh` only. Use `bash scripts/selftest.sh gates` /
  `doctor` when a floor is involved.
- **After the GREEN edits:**
  - `bash .claude/tests/sigpipe.test.sh`
  - `bash .claude/tests/selftest.test.sh` (the `COUNTS` block)
  - `bash scripts/check-sigpipe.sh`
  - `bash scripts/check-grep-count.sh`
- **GATES**, for the other callers of these scripts:
  - `bash .claude/tests/worktree.test.sh`, because it runs `doctor.sh`
  - `bash .claude/tests/profiles.test.sh`, because it runs `gates.sh --audit`
    over profile snippets
  - `bash .claude/tests/boundaries.test.sh`, because it writes small manifests
  - then `bash scripts/gates.sh`
- **Once, before REVIEW:** the full `bash scripts/selftest.sh`, in the
  background. CI runs it in about 2 minutes.

### C-8 Baseline measurements

Read these out; do not re-derive them. All were taken by the Lead PO on
2026-10-02 at `ea0fba0`, on this host, against the real `project.conf` (283
lines, 16 data lines):

- `bash -x scripts/gates.sh --list`: 735 externals. Of those, 647 are `sed` and
  82 are `cut`, plus one each of `dirname`, `grep`, `cksum`, `tr`, `head` and
  `mkdir`. Time 2m52s.
- `bash scripts/gates.sh --list > list.out`: 20 lines, md5
  `207fdc8709297d9a891ca22ac92001eb`.
- `{ bash scripts/gates.sh --audit; echo "rc=$?"; } > audit.out 2>&1`: 14 lines,
  md5 `c700c2d2cd86c026cc7c6822872334e9` (rc=0). Time 1m56s.
- **Downstream, for comparison only:** 1,669 externals before and 6 after, on its
  629-line manifest.

### C-9 Oracle partition

| Kind | Criteria | Instruction to RED |
|---|---|---|
| **Settled** | AC-1's baseline and its bound of 20, C-8's figures, AC-6's "3 and 21 today" | Read them out. Do not calibrate. A contradicting re-measurement is an escalation, not an edit. |
| **Mechanical** | AC-2 equality, AC-3 byte-identity, AC-4 whole-value semantics, AC-5 agreement, AC-6 grep and identity | Pin exactly. Normalise nothing beyond AC-3's one named duration field. |
| **Oracle-free** | none | — |

## Deferred verifications

- **DV-1, the defect put back.** The `sed` form goes back into `gates.sh`'s
  `trim()`, with the call sites unchanged:
  `trim() { local _t; _t="$(printf '%s' "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"; ...`.
  It is applied through `scripts/mutate.sh` with an expression RED or GATES
  writes against the committed line. With it, AC-1's "zero `sed`" assertion and
  AC-2's `gates.sh` invariance assertions **must** go red, and AC-3's goldens
  must stay green, because the output is the same. Run with `-- bash
  .claude/tests/gates.test.sh`.
  RED cannot run this: the builtin `trim` does not exist yet.
  **Owner: GATES.**

  **DV-1 result (GATES, 2026-10-03).** AC-1 and AC-2 went red; AC-3 goldens stayed green (output unchanged); restored and verified:

  ```
    108 - trim() { local _t="$1"; _t="${_t#"${_t%%[![:space:]]*}"}"; _t="${_t%"${_t##*[![:space:]]}"}"; if [ $# -gt 1 ]; then printf -v "$2" '%s' "$_t"; else printf '%s' "$_t"; fi; }
    108 + trim() { local _t; _t="$(printf '%s' "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"; if [ $# -gt 1 ]; then printf -v "$2" '%s' "$_t"; else printf '%s' "$_t"; fi; }
  === mutate: running bash .claude/tests/gates.test.sh ===
      FAIL AC-1: tracing --list over the synthetic manifest records zero sed processes
      FAIL AC-1: tracing --list over the synthetic manifest records at most 20 external processes
      FAIL AC-2: gates.sh --list spawns as many processes over the padded manifest as over the plain one
      FAIL AC-2: gates.sh --audit spawns as many processes over the padded manifest as over the plain one
      FAIL AC-2: a full gates.sh run spawns as many processes over the padded manifest as over the plain one
      FAIL AC-6: no copy of the sed trim body in gates.sh, doctor.sh or task.sh
      FAIL AC-6: trim() is defined in gates.sh, and doctor.sh and task.sh define it byte-identically
  gates: 217 passed, 7 failed
  === mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_gates.sh.20261003T174951Z.601467.bak) ===
  ```
- **DV-2, a wrong value.** `rest`'s body in `gates.sh` changes to field
  semantics: `trim "$_v" "$3"` becomes `trim "${_v%%|*}" "$3"`. AC-4's `-f3-` and
  `-f5-` assertions and the `--list` golden for `project.conf` **must** go red.
  Run with `-- bash .claude/tests/gates.test.sh`. This is the second mutation
  `rules.md` allows a parser-shaped story: it is the bug a naive rewrite ships,
  and AC-1 and AC-2 are blind to it.
  RED cannot run this: `rest` does not exist yet.
  **Owner: GATES.**

  **DV-2 result (GATES, 2026-10-03).** AC-4 (-f3-, -f5-, second level) and the AC-3 goldens went red, 31 failures; restored and verified (excerpt):

  ```
    130 - rest()  { local _v; from_field "$1" "$2" _v; trim "$_v" "$3"; }
    130 + rest()  { local _v; from_field "$1" "$2" _v; trim "${_v%%|*}" "$3"; }
  === mutate: running bash .claude/tests/gates.test.sh ===
      FAIL AC-3: gates.sh --list over project.conf is byte-identical to the pre-rewrite golden
      FAIL AC-3: gates.sh --audit over project.conf is byte-identical to the pre-rewrite golden
      FAIL AC-3: gates.sh full run over project.conf is byte-identical to the pre-rewrite golden
      FAIL AC-3: gates.sh --list over broken.conf is byte-identical to the pre-rewrite golden
      FAIL AC-3: gates.sh full run over broken.conf is byte-identical to the pre-rewrite golden
      FAIL AC-3: gates.sh --list over crlf.conf is byte-identical to the pre-rewrite golden
      FAIL AC-3: gates.sh --audit over crlf.conf is byte-identical to the pre-rewrite golden
      FAIL AC-3: gates.sh full run over crlf.conf is byte-identical to the pre-rewrite golden
      FAIL AC-4 -f3-: an evidence regex keeps its alternation
      FAIL AC-4 -f3-: a blocked-when regex keeps all three alternations
      FAIL AC-4 -f3-: a slow reason containing | is kept whole
      FAIL AC-4 -f3-: a waiver containing | is kept whole
      FAIL AC-4 -f3-: an ondemand reason containing | is kept whole
      FAIL AC-4 -f3-: a ci-factor whose source contains | is kept whole
      FAIL AC-4 -f3-: a ci-factor with an empty second field is kept whole
      FAIL AC-4 -f5-: a gate command with | and || is listed whole
      FAIL AC-4 -f5-: and is echoed whole before it runs
      FAIL AC-4 -f5-: and runs whole, so its evidence is observed and floored
      FAIL AC-4 -f3-: a blocked-when regex matched on its THIRD alternation still names the launch failure
      FAIL AC-4 second level: the audit accepts every ci-factor (number -f1, source -f2-), and exits 0
      FAIL AC-4 second level: a source after an empty second field is still a source
      FAIL rest <n> behaves as the trimmed cut -d'|' -f<n>- on every input, n = 1..5
      FAIL AC-6: rest() is defined in gates.sh, and doctor.sh and task.sh define it byte-identically
  gates: 193 passed, 31 failed
  === mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_gates.sh.20261003T180916Z.642210.bak) ===
  ```
- **DV-3, the real tree, before and after.** On the committed GREEN tree, with
  the real `.claude/harness/project.conf` unchanged since `ea0fba0`:
  - `bash scripts/gates.sh --list` must give md5
    `207fdc8709297d9a891ca22ac92001eb`;
  - `{ bash scripts/gates.sh --audit; echo "rc=$?"; } 2>&1` must give md5
    `c700c2d2cd86c026cc7c6822872334e9`;
  - `bash -x` of `--list` must count no `sed` and no `cut`.

  Paste the md5s, the externals count and the wall time beside C-8's 2m52s and
  1m56s. This is deliberately not a test, because a test pinning the real
  manifest is exactly what the audit rules out (C-2).
  **Owner: GATES.**

  **DV-3 result (GATES, 2026-10-03), on the committed GREEN tree (bbb3102):**

  ```
  $ bash scripts/gates.sh --list | md5sum                          -> 207fdc8709297d9a891ca22ac92001eb   real 0m3.493s  (C-8: 2m52s)
  $ { bash scripts/gates.sh --audit; echo "rc=$?"; } 2>&1 | md5sum -> c700c2d2cd86c026cc7c6822872334e9   real 0m6.666s  (C-8: 1m56s)
  $ bash -x scripts/gates.sh --list 2>&1 >/dev/null | grep -cE "^\++ (sed|cut) "   -> 0
  ```
  Both md5s match C-8. GREEN measured 6 externals in total for --list (was 735).

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

**A-1 (RED, 2026-10-03) — AC-3's CRLF clause.** It said: "The same holds for a
CRLF copy of the well-formed manifest." It now says the same, *except `task.sh`
with no argument*. Why: that invocation prints its task list through an `awk`
the story leaves out of scope, and over a CRLF manifest the *unchanged* script
prints different bytes on Windows and Linux (MSYS `awk` drops the `\r` on
input; Linux `awk` keeps it), so no single golden can pass on both. The LF
listing stays pinned (`project.task.golden`), and every CRLF `task.sh <id>
extra` stays pinned. Raised by the test-developer; approved by the user in chat
on 2026-10-03.
*Orchestrator's own reproduction* (different input from the test-developer's):
`printf 'a\r\n' | awk '{print length($0)}'` prints `1` here (GNU Awk 5.4.1,
MSYS); a `\r`-keeping awk prints `2`.

## Model guidance

Planned by `bash scripts/plan.sh write HARNESS-024` from `.claude/harness/models.conf`.
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

- PLANNED: `lead-po` resolved to `opus` (`claude-opus-5-5`); no override was given in the dispatch.
- RED: `test-developer`, dispatched by the main session, ran on `claude-opus-5-5` (Opus 5.5), as planned. No override.
- GREEN: `feature-developer`, dispatched by the main session, ran on `claude-opus-5-5` (Opus 5.5), as planned. No override.
<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Out of scope

- `.claude/hooks/lib.sh`, including the same `sed` trim it carries inline
  (around `lib.sh:1219`, `phase_message`). That is the MT-041 port, the next
  story in the audit's order.
- `scripts/selftest.sh`'s own `trim` (`:84`), which is already pure bash.
- Any change to what `project.conf` *means*: no new line kind (`skipped-when` is
  a later story, MT-037), no change to `--list` or `--audit` wording, and no
  edit to the real `.claude/harness/project.conf`.
- The `awk`-based no-argument listing in `task.sh` (`:12`), and `doctor.sh`'s
  `awk '{print $1}'` for the executable name. Each runs once per data line on a
  short manifest; replacing them is optional and not required by any AC.
- Porting downstream's fixture or goldens, or any assertion that reads the real
  manifest (audit, "Decided").
- Making `gates.test.sh` itself faster beyond what this change gives it.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

All tests are at the script level: the real `gates.sh`, `doctor.sh` and
`task.sh`, copied into a throwaway project fixture (`manifest_fixture`) whose
`project.conf` is the synthetic manifest in `.claude/tests/fixtures/manifest/`.
The helpers are additionally exercised as units, lifted out of the script that
ships them (`extract_fn`), so the test runs the definition the script ships and
not a copy. No assertion reads the real `.claude/harness/project.conf`.

| Block (suite) | Level | Covers |
|---|---|---|
| C-3 instrument: trace counter control (`gates`) | unit, of the instrument | AC-1's control |
| fixtures: padded copy is +100 lines, +20 tab comments, padding before the last line (`gates`) | fixture | AC-2's premise |
| AC-1: `--list` traced, 0 `sed`, 0 `cut`, <= 20 externals (`gates`) | script, traced | AC-1 |
| AC-2: `--list`, `--audit`, full run traced over plain and padded, equal totals; padded `--list`/`--audit` output equals the golden (`gates`) | script, traced | AC-2 |
| AC-2: `doctor.sh` and `task.sh where extra` traced over plain and padded, equal totals; padded doctor sections and task output unchanged (`doctor`) | script, traced | AC-2 |
| AC-3: 9 gates.sh goldens (`list`/`audit`/`run` x `project`/`broken`/`crlf`) (`gates`) | script, golden | AC-3 |
| AC-3: doctor sections and task goldens, `project` and `crlf` (`doctor`) | script, golden | AC-3 |
| AC-4: whole-value needles from the `project` runs: evidence, blocked-when, slow, waiver, ondemand, ci-factor (-f3-); lint command listed, echoed and run (-f5-); BLOCKED-pattern matched on its third alternation; ci-factor second-level split and the empty-second-field source (`gates`) | script | AC-4 |
| AC-4: discovery with three pipes runs whole / quoted whole (-f4-); gate exe named from -f5-; task with pipes runs whole (-f5-); task cwd; unconfigured task; CRLF task (`doctor`) | script | AC-4 |
| C-1: `from_field`/`rest`/`field` from gates.sh against `cut -d'|' -fN-` / trimmed `-fN-` / trimmed `-fN`, n = 1..5, every data line plus 7 shapes (`gates`) | unit | C-1, AC-4 |
| AC-5: trim, printing and assigning forms, against the sed form over every manifest line plus the six edge cases; space-only-trim control on the tab and multi-space cases; the CR edge case is present (`gates` for gates.sh, `doctor` for doctor.sh and task.sh) | unit | AC-5, C-1 |
| AC-6: sed trim body and `cut -d'|'` counted in the three scripts (0 each); the four helpers defined in gates.sh and byte-identical in the other two (`gates`) | static | AC-6 |

Out of scope and pinned only where cheap: the `awk` no-argument `task.sh`
listing is pinned (LF only) by `project.task.golden`, unchanged; nothing pins
`lib.sh`'s own sed trim.

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

**RED, 2026-10-02 (test-developer, dispatched on `opus`; no override in the
dispatch).** Tests and fixtures only; `scripts/*.sh` untouched (`git status
scripts/` is clean; the four C-5 probes went through `mutate.sh` and each
restore is verified below).

### Commands

    bash .claude/tests/gates.test.sh      # AC-1, AC-2 (gates), AC-3/4/5 (gates), C-1 helpers, AC-6
    bash .claude/tests/doctor.test.sh     # AC-2/3/4/5 for doctor.sh and task.sh
    bash scripts/selftest.sh gates        # the same, with the floor checked
    bash scripts/selftest.sh doctor

Wall time on this host, RED: `gates.test.sh` 17m55s (was ~12 min before the
new block), `doctor.test.sh` 8m14s. Almost all of it is the shipped parser's
forks; downstream's suite fell from 667 s to 152 s after the same change.
Local timings, never asserted.

### The red, and why it is the right red

`gates: 209 passed, 15 failed` (224 executed) and `doctor: 46 passed, 4
failed` (50 executed). Every pre-existing assertion in both suites still
passes; every failure is in a HARNESS-024 block and is one of: a `sed`/`cut`
count (AC-1, AC-2), a helper that does not exist yet (C-1's `from_field`,
`rest`, `field`; the assigning form of `trim`; AC-6), or the old bodies
still being present (AC-6). Verbatim, `gates.test.sh`, the HARNESS-024 part
(the AC-2 tables shortened to their TOTAL lines; each lists the same commands
as AC-1's table with only `sed` differing):

    HARNESS-024 AC-1: --list over the synthetic manifest spawns no sed, no cut, and at most 20 processes
      FAIL AC-1: tracing --list over the synthetic manifest records zero sed processes
           expected: 0
           actual:   262
      FAIL AC-1: tracing --list over the synthetic manifest records zero cut processes
           expected: 0
           actual:   143
      FAIL AC-1: tracing --list over the synthetic manifest records at most 20 external processes
           counted 411; by command:
           143 cut
           1 dirname
           1 grep
           1 cksum
           262 sed
           1 tr
           1 head
           1 mkdir
           411 TOTAL

    HARNESS-024 AC-2: gates.sh spawns no more processes for a longer manifest
      FAIL AC-2: gates.sh --list spawns as many processes over the padded manifest as over the plain one
           plain manifest: 411 processes; padded (+100 comment/blank lines): 611
      FAIL AC-2: gates.sh --audit spawns as many processes over the padded manifest as over the plain one
           plain manifest: 423 processes; padded (+100 comment/blank lines): 623
      FAIL AC-2: a full gates.sh run spawns as many processes over the padded manifest as over the plain one
           plain manifest: 462 processes; padded (+100 comment/blank lines): 662

    HARNESS-024 AC-3: gates.sh prints what it printed before the rewrite, byte for byte

    HARNESS-024 AC-4: a value containing | is the whole remainder of its line

    HARNESS-024 C-1: gates.sh's from_field, rest and field are cut's -fN-, trimmed -fN- and trimmed -fN
      FAIL from_field <n> behaves as cut -d'|' -f<n>- on every input, n = 1..5
           expected: 0
           actual:   190
           line 1: expected [colour    | unit     | blue] got [<unassigned>]
      FAIL rest <n> behaves as the trimmed cut -d'|' -f<n>- on every input, n = 1..5
           expected: 0
           actual:   190
      FAIL field <n> behaves as the trimmed cut -d'|' -f<n> on every input, n = 1..5
           expected: 0
           actual:   190

    HARNESS-024 AC-5: gates.sh's trim() agrees with the shipped sed form
      FAIL C-1: gates.sh trim, assigning form (trim "$x" var), agrees with the sed form on every input
           expected: 0
           actual:   66
           line 1: expected [# HARNESS-024's synthetic manifest. UPSTREAM-OWNED: this is not any project's] got [<unassigned>]

    HARNESS-024 AC-6: one parser, in three identical copies, and no sed trim or cut -d'|' left
      FAIL AC-6: no copy of the sed trim body in gates.sh, doctor.sh or task.sh
           expected: gates.sh:0 doctor.sh:0 task.sh:0
           actual:   gates.sh:1 doctor.sh:1 task.sh:1
      FAIL AC-6: no cut -d'|' in gates.sh, doctor.sh or task.sh
           expected: gates.sh:0 doctor.sh:0 task.sh:0
           actual:   gates.sh:10 doctor.sh:7 task.sh:4
      FAIL AC-6: from_field() is defined in gates.sh, and doctor.sh and task.sh define it byte-identically
           expected: defined same same
           actual:   missing same same
      FAIL AC-6: field() is defined in gates.sh, and doctor.sh and task.sh define it byte-identically
           expected: defined same same
           actual:   missing same same
      FAIL AC-6: rest() is defined in gates.sh, and doctor.sh and task.sh define it byte-identically
           expected: defined same same
           actual:   missing same same

    gates: 209 passed, 15 failed

`doctor.test.sh`, the HARNESS-024 part:

    HARNESS-024 AC-2: doctor.sh and task.sh spawn no more processes for a longer manifest
      FAIL AC-2: doctor.sh spawns as many processes over the padded manifest as over the plain one
           plain manifest: 323 processes; padded (+100 comment/blank lines): 523
           (91 cut, 5 bash, 1 dirname, 2 git, 2 grep, 8 awk, 1 tr, 2 head both times;
            sed 211 -> 411)
      FAIL AC-2: task.sh <id> spawns as many processes over the padded manifest as over the plain one
           plain manifest: 132 processes; padded (+100 comment/blank lines): 230
           (36 cut, 1 dirname both times; sed 95 -> 193)
      FAIL C-1: doctor.sh trim, assigning form (trim "$x" var), agrees with the sed form on every input
           expected: 0
           actual:   66
      FAIL C-1: task.sh trim, assigning form (trim "$x" var), agrees with the sed form on every input
           expected: 0
           actual:   66

    doctor: 46 passed, 4 failed

The read-outs agree with the settled figures: the sed trim body 3 times and
`cut -d'|'` 21 times (10 + 7 + 4), as AC-6 says; and `--list`'s non-parse
externals are exactly C-8's six (`dirname grep cksum tr head mkdir`), so after
GREEN drops `tr` and the `BOOTSTRAPPED` `cut`, five remain against AC-1's 20.

`bash scripts/gates.sh --fast`: every gate in this repository is UNCONFIGURED,
so it ran nothing and exited 0 (`All required gates passed (0 ran, 5
unconfigured, 0 known)`); its only finding is the 16 new fixture files,
untracked until the RED commit stages them - **they must be `git add`ed**.
`check-sigpipe` and `check-grep-count` are clean over the three test files
(C-4).

### Each test, and what it covers

`gates.test.sh`:

- trace counter control: one `sed`, one `cut`, `printf` not counted, the
  function `f` not counted, total exactly 3 - C-3, AC-1's control.
- padded copy: exactly +100 lines; +20 TAB-indented comments; padding precedes
  the last line - AC-2's premise.
- traced `--list` exits 0; zero `sed`; zero `cut`; <= 20 externals - AC-1.
- `--list`, `--audit`, full run: equal TOTALs over plain and padded (3) - AC-2;
  the padded `--list` and `--audit` print the `project` golden (2) - AC-2's
  "the padding means nothing".
- 9 goldens: `list`, `audit`, `run` over `project`, `broken`, `crlf` - AC-3.
- AC-4, read from the `project` runs (13): evidence alternation, blocked-when
  with three alternations, slow reason, waiver, ondemand reason, ci-factor with
  piped source, ci-factor with an empty second field (all `-f3-`); the lint
  command listed whole, echoed whole and run whole to `observed 5, floor 3`
  (`-f5-`); e2e's WARN naming the THIRD blocked-when alternation; the audit
  reporting no `is not a number`, no `has no source` and `rc=0` (the ci-factor
  second-level split); the empty-second-field ci-factor printed by `--audit`.
- C-1 (3): `from_field`, `rest`, `field` lifted from gates.sh against `cut`
  itself, n = 1..5, over every data line plus `no pipe here`, `a|b`, `a||c`,
  ` x | | y |`, `|lead`, `trail|`, `  |  `.
- AC-5 (7): input count; exactly one input ends in CR; gates.sh defines trim;
  printing form agrees (0); assigning form agrees (0, C-1); space-only trim
  disagrees on the tab case; and on the multi-space case.
- AC-6 (6): no sed trim body (3 scripts); no `cut -d'|'`; each of `trim`,
  `from_field`, `field`, `rest` defined in gates.sh and byte-identical in
  doctor.sh and task.sh.

`doctor.test.sh`:

- 4 goldens: doctor sections and task over `project` and `crlf` - AC-3.
- AC-4 (7): `cpu` discovered (three pipes, `-f4-`); `gpu` MISSING quoting the
  whole command; `no-such-tool-h024` named from a gate's `-f5-`; `task.sh
  pipes extra` -> `[a|b]` / `args:extra`; `task.sh where extra` (tab-padded
  line, cwd `src`); `idle` unconfigured, rc 1; `where` over CRLF.
- AC-2 (4): equal TOTALs for `doctor.sh` and for `task.sh where extra`; the
  padded doctor sections equal the golden; the padded task output unchanged.
- AC-5 (6): for doctor.sh and task.sh, trim defined; printing form agrees;
  assigning form agrees.

### Files touched

- `.claude/tests/_lib.sh` - the helpers listed in C-4 (as amended).
- `.claude/tests/gates.test.sh` - the HARNESS-024 block, before `summary`.
- `.claude/tests/doctor.test.sh` - the HARNESS-024 block, before `summary`.
- `.claude/tests/fixtures/manifest/` - `.gitattributes`, `project.conf`,
  `broken.conf`, and the 13 goldens (C-2, as amended). **New, untracked.**
- `.claude/tests/floors.conf` - `doctor` 29 -> 50, `gates` 169 -> 224, dated
  comment.
- `.claude/tests/selftest.test.sh` - the same two numbers in `COUNTS`.
  `bash .claude/tests/selftest.test.sh`: `selftest: 100 passed, 0 failed`.
- this story: C-2, C-3, C-4 amended in place; Test plan; this handoff.

`sigpipe.test.sh` is not touched: its line pins move with GREEN's edits (C-6).

### The goldens: capture, and sha256

Captured on this host at `ea0fba0` (the RED commit's parent; `git status
scripts/ .claude/hooks` clean) by a scratch script that calls the very
`_lib.sh` functions the tests call:

    . .claude/tests/_lib.sh
    M="$(manifest_fixture)"; W="$(mktemp -d)"
    crlf_copy "$MANIFEST_FIXTURES/project.conf" "$W/crlf.conf"
    for c in project broken crlf; do
      case "$c" in crlf) conf="$W/crlf.conf" ;; *) conf="$MANIFEST_FIXTURES/$c.conf" ;; esac
      use_manifest "$M" "$conf"
      for mode in list audit run; do gates_golden "$M" "$mode" > "$MANIFEST_FIXTURES/$c.$mode.golden"; done
      case "$c" in broken) ;; *) doctor_golden "$M" > "$MANIFEST_FIXTURES/$c.doctor.golden"
        task_golden "$M" "$([ "$c" = crlf ] && printf nolist)" > "$MANIFEST_FIXTURES/$c.task.golden" ;; esac
    done

Captured twice, minutes apart; the `project` and `crlf` goldens came out
byte-identical both times (the first capture's `broken.run` held a temp path,
which is why `broken.conf` changed - C-2, amended).

    b58348445996eacd802f426822bf790f3fb9aaa18d1894592f907a7e891bfd7f  broken.audit.golden
    23dab0dc21c7d75f14bbdffc74a8d14f469ef24e6e9e3ca716b04516ea49a5fc  broken.list.golden
    58fdd5369f43c2ba3a3deb836f347f35f6b3cd9e5715e41817bc3d82c0f9c8a0  broken.run.golden
    af8588816d1e01df25661f01a78ce5a074de97daf77c3e0a6938fb7b6f4a1f20  crlf.audit.golden
    f81c4db753c4233c06b32cb9d96a81b555bbdb92a50521d05d2e8f0e75d2e942  crlf.doctor.golden
    5ab9d3498c6254932a186a2dd7e66e6ef63fc771291ef76742bae90937b43e30  crlf.list.golden
    f73a1288e72c48ce8de95b1af59a9b64e865b0e5296f73fa3d509c71ea8c9102  crlf.run.golden
    fa7423356f837b18f9c73505db5c063445ab466c1750ed2684303a3107e84222  crlf.task.golden
    af8588816d1e01df25661f01a78ce5a074de97daf77c3e0a6938fb7b6f4a1f20  project.audit.golden
    f81c4db753c4233c06b32cb9d96a81b555bbdb92a50521d05d2e8f0e75d2e942  project.doctor.golden
    5ab9d3498c6254932a186a2dd7e66e6ef63fc771291ef76742bae90937b43e30  project.list.golden
    f73a1288e72c48ce8de95b1af59a9b64e865b0e5296f73fa3d509c71ea8c9102  project.run.golden
    fd64a3e65164c4b837184d28903498444faec65e37dffd78504b4ff60473f846  project.task.golden

`crlf.<list|audit|run|doctor>` equal their `project` twins byte for byte: the
unchanged scripts already print the same thing for a CRLF manifest, and that
is what GREEN must keep. **Not yet observed on Linux CI.** The goldens contain
no path, line number or version; the risk is a platform difference in the
unchanged scripts like the one that removed the CRLF listing (C-2 amendment);
if CI disagrees with a golden on the first run, that is a RED question, not a
GREEN one.

### What the tests pin - the shape GREEN must have

Not a module import; the "export shape" is the function definitions the tests
lift out of the scripts with `extract_fn`, which finds `^[[:space:]]*<name>()`
and reads to where the braces balance:

- **`trim`, `from_field`, `rest`, `field` are defined in all three scripts, in
  the `name() { ... }` form, byte-identical** (AC-6 compares the extracted
  text). C-1's definitions satisfy every assertion: checked in a scratch copy
  of the three scripts outside the repository - see the controls table.
- `trim "$x"` prints; `trim "$x" var` assigns (the test presets `var` to
  `<unassigned>` and calls it with stdout discarded). Both are compared with
  the sed form over the same inputs.
- `from_field n s var` = `cut -d'|' -fn-`, `rest n s var` = trimmed `-fn-`,
  `field n s var` = trimmed `-fn`, compared for n = 1..5. The test's target
  variable is `_got`. **Dynamic scoping trap:** a caller that names a helper's
  own local (`_v`, `_t`, `_r`, `_i`) as the target loses the result into the
  helper's local. C-1's helpers are correct; no call site may use those four
  names as a target.
- No `cut -d'|'` (exact text) and no copy of the sed trim body may remain in
  the three scripts, comments included - AC-6 counts with `grep -cF`.
- The tests do NOT constrain: where in each script the helpers sit (C-1 says
  near the top; C-6's line pins are the constraint there), call-site variable
  names other than the four above, the `BOOTSTRAPPED` split (beyond AC-1 having
  no `cut` or `tr` in it and C-1's `gates.sh:74` rule, which `sigpipe.test.sh`
  enforces), and whether the `awk '{print $1}'` in doctor.sh or the task.sh
  listing change (Out of scope; the LF listing is pinned by
  `project.task.golden`).

### Tests that pass on arrival, and the probes that earn them (C-5)

AC-3, AC-4 and AC-5's printing form are green on the shipped code. Each probe
is one `mutate.sh` run of the one suite holding it. Probes 1 and 2 ran
concurrently, as did 3 and 4 with nothing (each pair mutates a file the other
suite does not assert on - doctor.test.sh never runs gates.sh, and
gates.test.sh reads doctor.sh/task.sh only for AC-6's counts and helper
identity, which these mutations do not change). Probe 1 ran before a rename of
one variable in the C-1 block (`_v` -> `_got`, the scoping trap above), which
touches no assertion probe 1 targets.

**Probe 1 - `gates.sh:116`, `-f3-` -> `-f3`**, `-- bash .claude/tests/gates.test.sh`:

    === mutate: scripts/gates.sh (1 line(s) changed by 116s/-f3-)/-f3)/) ===
      116 -   tval=$(trim "$(printf '%s' "$line" | cut -d'|' -f3-)")
      116 +   tval=$(trim "$(printf '%s' "$line" | cut -d'|' -f3)")
    ...
        FAIL AC-3: gates.sh --list over project.conf is byte-identical to the pre-rewrite golden
             4c4
             <                               evidence: Tests +[1-9][0-9]* passed|Checks [0-9]+ ok
        FAIL AC-3: gates.sh --audit over project.conf is byte-identical to the pre-rewrite golden
             > FAIL unit         ci-factor has no source; say which CI run it was measured from
        FAIL AC-3: gates.sh full run over project.conf is byte-identical to the pre-rewrite golden
        FAIL AC-3: gates.sh --list over broken.conf is byte-identical to the pre-rewrite golden
        FAIL AC-3: gates.sh full run over broken.conf is byte-identical to the pre-rewrite golden
        FAIL AC-3: gates.sh --list over crlf.conf is byte-identical to the pre-rewrite golden
        FAIL AC-3: gates.sh --audit over crlf.conf is byte-identical to the pre-rewrite golden
        FAIL AC-3: gates.sh full run over crlf.conf is byte-identical to the pre-rewrite golden
        FAIL AC-4 -f3-: an evidence regex keeps its alternation
        FAIL AC-4 -f3-: a blocked-when regex keeps all three alternations
        FAIL AC-4 -f3-: a slow reason containing | is kept whole
        FAIL AC-4 -f3-: a waiver containing | is kept whole
        FAIL AC-4 -f3-: an ondemand reason containing | is kept whole
        FAIL AC-4 -f3-: a ci-factor whose source contains | is kept whole
        FAIL AC-4 -f3-: a ci-factor with an empty second field is kept whole
        FAIL AC-4 -f5-: and is echoed whole before it runs
        FAIL AC-4 -f5-: and runs whole, so its evidence is observed and floored
        FAIL AC-4 -f3-: a blocked-when regex matched on its THIRD alternation still names the launch failure
        FAIL AC-4 second level: the audit accepts every ci-factor (number -f1, source -f2-), and exits 0
             expected: not-a-number:0 no-source:0 rc=0:1
             actual:   not-a-number:0 no-source:3 rc=0:0
        FAIL AC-4 second level: a source after an empty second field is still a source
    gates: 186 passed, 38 failed
    === mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_gates.sh.20261003T031757Z.241504.bak) ===
      116:   tval=$(trim "$(printf '%s' "$line" | cut -d'|' -f3-)")

(The two `-f5-` lines go red here because a truncated ci-factor fails the
gate before it runs; they are earned for `-f5-` by the C-1 `rest` unit and by
DV-2 in GATES, not by this probe. `audit over broken.conf` stayed green: every
broken line there fails for a reason a truncated value does not change.)

**Probe 2 - `doctor.sh:222`, `-f4-` -> `-f4`**, `-- bash .claude/tests/doctor.test.sh`:

    === mutate: scripts/doctor.sh (1 line(s) changed by 222s/-f4-)/-f4)/) ===
      222 -   cmd=$(trim "$(printf '%s' "$line" | cut -d'|' -f4-)")
      222 +   cmd=$(trim "$(printf '%s' "$line" | cut -d'|' -f4)")
    ...
        FAIL AC-3: doctor.sh's toolchain and discovery sections over project.conf are byte-identical to the pre-rewrite golden
             8,9c8,10
             <   ok       cpu          discovered
             <   MISSING  gpu          nothing discovered by: printf 'CUDA|Dml\n' | { IFS= read -r l; case "$l" in *'|CPU') true ;; *) false ;; esac; }
             ---
             >   MISSING  cpu          nothing discovered by: printf 'CUDA
             >                tests under it would be committed and never run
             >   MISSING  gpu          nothing discovered by: printf 'CUDA
        FAIL AC-3: doctor.sh's toolchain and discovery sections over crlf.conf are byte-identical to the pre-rewrite golden
        FAIL AC-4 -f4-: a discovery command with three embedded pipes runs whole
        FAIL AC-4 -f4-: and a failing one is quoted whole, every pipe intact
        FAIL and doctor.sh reports the padded copy exactly as the plain one
    doctor: 38 passed, 12 failed
    === mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_doctor.sh.20261003T031759Z.241636.bak) ===
      222:   cmd=$(trim "$(printf '%s' "$line" | cut -d'|' -f4-)")

(The other red lines in that run are three pre-existing discovery tests, whose
`| grep -q` commands the mutation also cuts, and the four RED failures.)

**Probe 3 - `task.sh:21`, `-f5-` -> `-f5`**, `-- bash .claude/tests/doctor.test.sh`:

    === mutate: scripts/task.sh (1 line(s) changed by 21s/-f5-)/-f5)/) ===
      21 -   cmd=$(trim  "$(printf '%s' "$line" | cut -d'|' -f5-)")
      21 +   cmd=$(trim  "$(printf '%s' "$line" | cut -d'|' -f5)")
    ...
        FAIL AC-3: task.sh, listing and every task with an extra argument, over project.conf is byte-identical to the pre-rewrite golden
             8,10c8,9
             < [a|b]
             < args:extra
             < rc=0
             ---
             > scripts/task.sh: eval: line 24: unexpected EOF while looking for matching `''
             > rc=2
        FAIL AC-3: task.sh, listing and every task with an extra argument, over crlf.conf is byte-identical to the pre-rewrite golden
        FAIL AC-4 -f5-: a task command with embedded pipes runs whole, extra argument appended
    doctor: 43 passed, 7 failed
    === mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_task.sh.20261003T032438Z.265161.bak) ===
      21:   cmd=$(trim  "$(printf '%s' "$line" | cut -d'|' -f5-)")

**Probe 4 - `gates.sh:92`, `[[:space:]]` -> ` `**, `-- bash .claude/tests/gates.test.sh`:

    === mutate: scripts/gates.sh (1 line(s) changed by 92s/\[\[:space:\]\]/ /g) ===
      92 - trim() { printf '%s' "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'; }
      92 + trim() { printf '%s' "$1" | sed -e 's/^ *//' -e 's/ *$//'; }
    ...
        FAIL AC-5: gates.sh trim, printing form, agrees with the sed form on every input
             expected: 0
             actual:   7
             line 10: expected [# a tab-indented comment] got [	# a tab-indented comment]
             line 12: expected [] got [	]
             line 14: expected [# floor | unit | 900] got [	 # floor | unit | 900]
        FAIL AC-6: trim() is defined in gates.sh, and doctor.sh and task.sh define it byte-identically
             expected: defined same same
             actual:   defined differs differs
    gates: 197 passed, 27 failed
    === mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_gates.sh.20261003T033751Z.303028.bak) ===
      92: trim() { printf '%s' "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'; }

Probe 4 also earns AC-6's `trim()` identity assertion, the one AC-6 assertion
green in RED (the three shipped `trim`s are already identical). The tab-padded
`unit` gate line also fell out of every gates.sh golden under it (AC-3 red
over `project` and `crlf`).

### Negative controls: expected values

These ran in RED (the suites execute; nothing fails at import), and the
helper-dependent ones were also run outside the suite against a scratch copy of
the three scripts with C-1's helpers spliced in (not in the repository).
**GREEN confirms each against the shipped scripts.**

| Control | Threshold | Measured in RED | Against C-1's helpers (scratch) |
|---|---|---|---|
| trace counter over `ctl.sh`: sed / cut / printf / f / TOTAL | exactly 1 / 1 / 0 / 0 / 3 | 1 / 1 / 0 / 0 / 3 (passed) | n/a |
| space-only trim vs sed, tab case (`TRIM_EDGE+4`) | must differ | `[tab-padded value]` vs `[\ttab-padded value\t\t]` (passed) | same |
| space-only trim vs sed, multi-space case (`TRIM_EDGE+3`) | must differ | `[inner  spaces   survive]` vs `[  inner  spaces   survive  ]` (passed); 9 disagreements in all | same |
| AC-2 shipped scripts, plain vs padded TOTAL | must differ (RED) / equal (GREEN) | list 411/611, audit 423/623, run 462/662, doctor 323/523, task 132/230 | not measured - needs GREEN |
| AC-1 `--list` TOTAL | <= 20 | 411 (sed 262, cut 143, 6 others) | expected 5: `dirname grep cksum head mkdir` |
| C-1 helpers vs `cut`, disagreements | 0 | 190 each (helpers absent) | 0 / 0 / 0 |
| DV-2's wrong value (`rest` with field semantics) vs trimmed `-fN-` | must be > 0 | n/a | 110 |
| trim, print and assign forms, three scripts | 0 | print 0; assign 66 (absent) | 0 and 0 for each script |
| AC-6 helper identity | `defined same same` x4 | trim yes; the other three `missing` | `defined same same` x4 |

### Discovered, and worth knowing in GREEN

- **MSYS `awk` and `sed` read in text mode and drop `\r`**; MSYS `bash`'s
  `read` does not. So on this host a CR-handling defect in an `awk`/`sed`
  step is invisible, and only Linux CI sees it. That is why the CRLF listing
  left the task golden (C-2) and why the AC-5 "one input ends in CR" check
  reads with bash.
- `gates.sh` under `bash -x` sends a gate command's own trace into the gate
  log (`2>&1 | tee`), so the traced full run's output is not golden-comparable;
  only the untraced runs are compared. The counts are unaffected.
- The full run keeps one `cut` after GREEN (`untracked_gated` in `lib.sh`,
  out of scope) plus `tee`/`date`/`awk`/`git`/`sort` per run; all constant, so
  AC-2's equality holds - nothing asserts a bound on the full run.
- Deferred verifications: DV-1, DV-2 and DV-3 are GATES', and **RED could not
  run them** - the builtin `trim` and `rest` do not exist yet. The scratch
  measurement of DV-2's wrong value (110 disagreements against the C-1 `rest`
  oracle) is a claim about the instrument, not the DV-2 run itself.

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

    run:    2026-10-03T18:13:19Z
    commit: bbb3102 (working tree had uncommitted changes)
    tree:   03710d2ea725a4f0b6b7eca76ec83786e87475a1
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


**PLANNED, 2026-10-02 (Lead PO).** The decisions numbered in the Contract, in
one place:

1. Each script carries its own copy of the helpers, kept byte-identical by AC-6.
   `doctor.sh` cannot source `lib.sh`, because it is the script that reports
   `lib.sh` missing (C-1).
2. The fixture lives in `.claude/tests/fixtures/manifest/`, not downstream's
   `manifest-parse/` (C-2).
3. The cost is asserted as a trace process count, never as wall clock (C-3).
4. AC-1's bound is 20 externals, derived from the 6 non-parse externals measured
   today. AC-2's invariance under padding is the sharp claim (C-3).
5. The real-manifest before/after comparison is DV-3, not a test (C-2, DV-3).
6. The `gates` and `doctor` floors are raised in RED, in both `floors.conf` and
   the `selftest.test.sh` `COUNTS` block (C-4).

`depends_on` is empty on purpose. This is the first story of the audit's port
order. The orchestrator cuts each later story just-in-time, once this one
closes, because their Contracts depend on the `gates.sh` this story rewrites.
- GATES (2026-10-03): full `bash scripts/selftest.sh` on this machine:
  `assertion floors: all 21 suite(s) met their declared floor (1861 assertions
  executed, 1631 declared)`, `21 harness suite(s) passed`. Wall time ~95 min
  (13:13 start); `gates` 18m -> 6m and `doctor` 8m -> 2m against RED, while
  `plan`, `sigpipe` and `phase-guard` - which do not parse the manifest - are
  unchanged and now dominate.
- GATES: a first DV-1 run was stopped by the tool's 40-min limit mid-mutation.
  `mutate.sh`'s trap restored `scripts/gates.sh` on the kill (log: `exited 143
  restored (verified)`), and `git status` confirmed a clean tree before DV-1 and
  DV-2 were re-run detached. This is the stranded-mutation scenario a0b43a2
  guards against (group 4 of the port audit).

**DONE, 2026-10-03.** Merged in #100 (merge commit 5a4dd53), release 67. The
VERSION bump lands in this DONE commit. `phase.sh set DONE --force` was run on
`main`, overriding the branch check. PR CI: `gates` passed in 1m16s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37149152820) -
down from 1m47s on HARNESS-023 - and `boundaries` in 11s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37149152749).
No epic. Next in the port audit: MT-041 (phase-guard spawns).
