---
id: HARNESS-031
title: A bare directory name takes the category its rule gives
slug: a-bare-directory-name-takes-the-category
epic: 
type: fix
status: done
phase: DONE
branch: story/HARNESS-031-a-bare-directory-name-takes-the-category
depends_on: [HARNESS-011, HARNESS-025]      # story ids; phase.sh refuses to start this story until they are DONE
touches: [.claude/hooks/lib.sh, .claude/harness/paths.conf, .claude/tests/classify.test.sh, .claude/tests/phase-guard.test.sh, .claude/tests/spawns.test.sh, .claude/tests/floors.conf, .claude/tests/selftest.test.sh]         # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

This story is group 5, "phase lock", of
`docs/wiki/audits/manga-translator-port-2026-10-02.md` (issue #97). It ports
manga-translator's MT-034, downstream commit `f10d7e0`. The audit's `## Decided`
item 5 is settled: **a bare path that matches no rule is judged again with one
trailing `/`, so any rule `X/**` covers bare `X`.** This story implements that
and does not reopen it. Downstream's `lib.sh` is **not** copied (Decided, "Do not
port" MT-031/MT-033): it would reopen HARNESS-010's here-string and
unknown-phase fixes, and downstream's needles expect `tests` where upstream's
guard prints `tests/`.

**The hole.** Every directory rule in `paths.conf` is a glob ending in `/**`,
which matches paths *under* a directory and never the directory itself.
HARNESS-011 closed that for the built-in directories by writing every rule twice
(`docs/**` and `docs`). A **project's own** rule gets no twin unless its author
remembers to write one, and manga-translator's own `paths.conf:107` is exactly
that case: `test | fixtures/**`.

Reproduced at PLANNED on this tree (`16c42a1`, release 73), through the real
`phase-guard.sh`, in a `make_fixture` tree whose `paths.conf` has `test |
fixtures/**` appended:

    GREEN  rm -rf fixtures              ALLOW   <- the hole: the frozen test dir is deletable
    GREEN  rm -rf fixtures/             DENY    the slashed form was always right (HARNESS-010)
    RED    rm -rf fixtures              DENY    category: source   <- the false positive
    RED    cp docs/notes.md fixtures    DENY    category: source   <- the false positive
    RED    rm -rf .pytest_cache         DENY    category: source   <- a BUILT-IN rule with no twin

The last line matters: even upstream's own twins are incomplete. `**/.pytest_cache/**`,
`.mypy_cache`, `.ruff_cache`, `.tox`, `.next`, `.svelte-kit` and `.turbo` have no
bare form, so a bare one that is not gitignored classifies `source`.

**What is already right and must stay right.** `cp docs/notes.md docs/` is
allowed in REVIEW today, because HARNESS-010 keeps a directory operand's
trailing slash (`phase-guard.sh:166-177`) and HARNESS-011 added `docs | docs`.
Downstream's version of this false positive does not reproduce upstream. It is
kept as a criterion (AC-2) because the retry must not break it.

**Required gate that would fail if this broke:** `unit`, through `bash
scripts/selftest.sh`, which runs the `classify`, `phase-guard` and `spawns`
suites. Every gate in this repository is UNCONFIGURED (it is the harness
template), so in practice CI's `selftest.sh` step judges it.

## Acceptance criteria

"The fixture" below is `make_fixture` (or `make_project_fixture`) with the line
`test | fixtures/**` appended to its `paths.conf`, and **no** `fixtures` twin.
It is a separate fixture tree from any a suite shares, so no later block sees the
extra rule.

- **AC-1 — the hole, through the guard.** In the fixture, in GREEN,
  `rm -rf fixtures` is refused, on `path:     fixtures` with `category: test`.
  In RED, `rm -rf fixtures` is allowed.
  *Controls in the same block:* in GREEN `rm -rf fixtures/` is still refused
  (on `fixtures/`), and `rm -rf src` is still allowed; in RED `rm -rf src` is
  still refused (on `src`).
- **AC-2 — no false positive.** In REVIEW, `cp docs/notes.md docs/` is allowed
  (passes on arrival; DV-3 earns it). In the fixture, in RED,
  `cp docs/notes.md fixtures` is allowed (refused today).
  *Paired control:* in REVIEW, `cp docs/notes.md src/` is refused on `src/`, so
  an allow cannot come from the guard failing to see a `cp` target.
- **AC-3 — rule-driven, never child-driven.** Through `scripts/classify.sh`, in
  the fixture:
  - `fixtures` gives `test	fixtures`;
  - `src` gives `source	src` and `wibble` gives `source	wibble`;
  - `lib/fixtures` gives `source	lib/fixtures`, because `fixtures/**` is
    root-anchored and the retry keeps each rule's anchoring;
  - with `test | **/golden/**` also appended, `pkg/golden` gives
    `test	pkg/golden`;
  - with the **real** `paths.conf` (no extra rule), `.pytest_cache` and `.tox`
    give `vendor` (neither is gitignored in the fixture). In RED,
    `rm -rf .pytest_cache` is allowed through the guard.
- **AC-4 — an explicit rule for the bare form always wins.**
  - With `source | gen` and then `test | gen/**` appended, `gen` gives
    `source	gen`. The retry fires only when **no rule** matched the bare form,
    not when the bare answer happens to be `source` (passes on arrival; DV-2
    earns it).
  - The order is rules on the bare form, then rules on the slashed form, then
    `.gitignore`, then `source`. With `.next/` added to the fixture's
    `.gitignore`, `.next` gives `vendor`, not `ignored` (the rule
    `**/.next/**` beats `.gitignore`, as `dist` already does).
- **AC-5 — one implementation.** `classify_stdin`, sourced from `lib.sh` against
  the fixture, given the four lines `fixtures`, `src`, `fixtures/a.json` and
  `.pytest_cache` on stdin, prints exactly four lines, in input order, each path
  **as given** (no `/` appended): `test	fixtures`, `source	src`,
  `test	fixtures/a.json`, `vendor	.pytest_cache`. `fixtures/` (already
  slashed) gives `test	fixtures/`, one line.
- **AC-6 — no extra process.** In the fixture, in GREEN, the traced guard run of
  `rm -rf fixtures` (HARNESS-025's `spawn_trace`) spawns **0**
  `git check-ignore` (1 today) and **at most 26** processes in total (26
  today). *Instrument control:* the trace reaches `classify` exactly once.
  HARNESS-025's existing bound for `echo hi > src/main.ts` (at most 27; measured
  27 at PLANNED) and its `classify.golden` byte-identity both still pass
  unchanged.
- **AC-7 — the whole tree does not move.** Measured at GATES (DV-4), the old
  `lib.sh` (`origin/main`) against the new one, each classifying the same lists:
  - every tracked file of this repository: **zero** changes; every tracked
    directory prefix: **zero** changes;
  - manga-translator's tracked tree, with its own `paths.conf`: **zero** files
    change; of its directory prefixes **exactly six** change, `.claude`,
    `.github`, `docs`, `fixtures`, `scripts` and `tests`, each from `source` to
    its slashed form's category, and **none** changes any other way;
  - `gate_tree_hash_of HEAD` is identical under the old and the new `lib.sh`, in
    both repositories.

## Contract

**RED may amend any block below in place, with a reason stated in the block.
GREEN builds what the amended block says.**

**Writes:** `.claude/hooks/lib.sh`, `.claude/harness/paths.conf`, `.claude/tests/classify.test.sh`, `.claude/tests/phase-guard.test.sh`, `.claude/tests/spawns.test.sh`, `.claude/tests/floors.conf`, `.claude/tests/selftest.test.sh`

### C-1 `.claude/hooks/lib.sh`, at `16c42a1`

Line numbers verified at `16c42a1`: `normalize_rel` `:765`, `classify` `:844-851`,
`is_ignored` `:874-877`, `classify_stdin` `:924-946`, its per-record block
`:940-945`; `classify_stdin` callers inside `lib.sh` at `:1008`
(`code_changed_since`), `:1054` (`_hash_blob_listing`, under `gate_tree_hash`
and `gate_tree_hash_of`) and `:1116` (`untracked_gated`).

**The retry goes in `classify_stdin`'s awk, not in `classify()`.** The
per-record block becomes, in substance:

```awk
{
  path = $0; sub(/\r$/, "", path); sub(/^\.\//, "", path)
  if (path == "") next
  lp = tolower(path); c = "source"; m = 0
  for (i = 1; i <= n; i++) if (lp ~ rr[i]) { c = rc[i]; m = 1; break }
  if (!m && substr(lp, length(lp), 1) != "/")
    for (i = 1; i <= n; i++) if ((lp "/") ~ rr[i]) { c = rc[i]; break }
  print c "\t" path
}
```

- **`m`, a matched flag, decides the retry, not `c == "source"`.** Downstream
  read "no rule matched" off the `source` answer, which is sound only while no
  rule's category is `source`. Neither repository has one, but a project may add
  `source | gen`, and then downstream's form would let `gen/**` override it.
  AC-4 pins this. DV-2 puts downstream's form back.
- **One output line per input line, and the path as given.** Every caller pipes
  this into `gated_stdin` or an `awk '$1 == …'` keyed on the path.
- **`classify()` is unchanged.** It still feeds one line into one
  `classify_stdin` process, then asks `is_ignored` only for a `source` answer.
  So the order is: rules on the bare form, rules on the slashed form,
  `.gitignore`, `source` (AC-4). The spawn count cannot change (AC-6); a path
  the retry now classifies skips `is_ignored`'s `git` process.
- **Which rules the retry can reach.** `g2r` turns `*` and `?` into `[^/]` and
  `**` into `.*`, so a slashed path can only match a glob that ends in `**`, or
  one written ending in `/`. `LICENSE.*`, `**/*.test.*` and every literal rule
  cannot match `x/`.
- **Nothing consults the filesystem.** Bare `fixtures` classifies the same
  whether or not the directory exists (paths.conf's existing "string, not an
  inode" trade).
- **Comments.** Rewrite the `classify_stdin` header (`:879-891`, ending at "processes backslashes.") to say it does
  the retry, why, and the three points above. Change `classify`'s comment
  (`:837-843`) by one sentence saying the retry lives in `classify_stdin`.
  Credit manga-translator MT-034 / upstream HARNESS-031, as HARNESS-025 did.

**PO decision 1: every `classify_stdin` caller gets the retry, not only
`classify()`.** Downstream put the retry in `classify()` and fed it two lines.
Here it goes one level down, for three reasons:

1. **One answer.** `classify()` delegates to `classify_stdin` "so that the rules
   have exactly one implementation" (`:839-840`). `gated_stdin`'s comment makes
   the same argument for the gate set: three readers of one predicate cannot
   disagree. With the retry in `classify()` only, a file named exactly like a
   directory rule's prefix (a file `fixtures` under `fixtures/**`) would be
   `test` to the guard, `classify.sh`, and `plan.sh`, and `source` to
   `check-boundaries.sh:174`, `gates.sh:779` and the gate hash.
2. **The callers it reaches only ever pass files.** Diff names
   (`check-boundaries.sh:174`, `gates.sh:779`), `ls-files` / `ls-tree` blobs
   (`:1054`, `:1116`) and `find -type f` (`:1008`). The retry can change one of
   them only when a FILE's whole path equals the prefix of a `/**` rule with no
   twin. AC-7 measures zero such files in both repositories, and
   `gate_tree_hash_of HEAD` unchanged, so no recorded gate stamp moves.
3. **No cost in processes.** It is one more pass over the rules, inside the
   awk already running, for an input no rule matched.

What it gives up: a project with such a file sees its gate hash change once, on
upgrade. Its next gate run re-records it.

`scripts/classify.sh` already calls `classify()` per path (`:111`, `:117`,
`:121`), so it gets the retry through `classify()` either way.

### C-2 `.claude/harness/paths.conf`

**PO decision 2: the existing twins stay. Only the comment changes.** With the
retry, every bare twin is redundant: each of them is covered by its `/**`
partner, with the same anchoring. They stay because:

- removing them is not this story's behaviour, and keeping them makes this story
  add rules and remove none, so no path can lose a category;
- `paths.conf` is hand-merged downstream (`refresh-harness.sh:419` names it), so
  deleting 26 lines is churn every project has to reconcile.

Removing them is a possible later story (Out of scope).

The `BOTH FORMS, ALWAYS` paragraph (`:19-32`) becomes true again. Rewrite it to
say:

- the classifier retries a bare path with a trailing `/` when no rule matches
  it, so `x/**` covers `x`, and a new rule, a project's especially, needs no
  bare twin;
- the twins below predate that (HARNESS-011) and are kept;
- a bare rule still wins over the retry, so write one only to give the
  directory a **different** category from its contents.

Keep the "a FILE of that name" paragraph (`:30-32`), which applies to the retry
too. The four "see BOTH FORMS" pointers (`:62`, `:81`, `:100`, `:123`) stay
valid as long as the paragraph keeps that heading.

No rule line changes. `make_fixture` copies this file into every fixture, so a
changed rule would move every suite. A comment cannot.

### C-3 Tests

**Where.**

| Suite | Blocks | Why there |
|---|---|---|
| `classify.test.sh` | AC-3, AC-4, AC-5 | where the answer is decided, and fast (1m24s measured at PLANNED) |
| `phase-guard.test.sh` | AC-1, AC-2, and AC-3's `rm -rf .pytest_cache` | the end-to-end half, as HARNESS-011 put it. A new `describe "HARNESS-031 …"` block before `summary "phase-guard"` (`:1255`) |
| `spawns.test.sh` | AC-6 | the instrument lives there. A new block before `summary "spawns"` (`:397`) |

**Fixtures.**

- Build each extra-rule fixture with its own `make_fixture` /
  `make_project_fixture` call, append the rules with `printf '%s\n' … >>`, and add
  it to the suite's cleanup trap.
- **Never** append to a suite's shared `FIX`: every later block would inherit
  the rule.
- AC-4's `.gitignore` line: `git -C "$d" add -A` after appending, as
  `spawns.test.sh`'s `ignore_fixture` does.
- AC-5 sources `lib.sh` in a subshell with `CLAUDE_PROJECT_DIR` set to the
  fixture, as `spawns.test.sh:61-71` does.

**Needles.**

- Whole classifier lines with `assert_eq` (`"test	fixtures"`, a literal tab).
- Guard denials with `assert_blocked` on the exact path, plus one
  `assert_contains "category: test"`, as HARNESS-011's block does
  (`phase-guard.test.sh:1214-1215`).
- AC-6 reuses `at_most`'s shape: the classify-count control first, then the
  bound.

**Platform.** Arguments must be platform-independent. A Linux-only awk
difference once failed CI on a test that passed every local run (HARNESS-025,
`## Notes`).

- No `\r` in any input, no `printf` of a lone trailing `\r`.
- No awk intervals, `\d` or backreferences in any needle (HARNESS-028).
- Paths with forward slashes only.

**Floors.** Raise `classify` (42), `phase-guard` (300) and `spawns` (66) to the
executed counts RED measures, in both `.claude/tests/floors.conf` and the
`selftest.test.sh` `COUNTS` block (`:519-542`). No new suite, so no new floor
row.

**Passes on arrival, and what earns each** (RED states them in the handoff):

- AC-2's `cp docs/notes.md docs/`: DV-3.
- AC-4's `source | gen`: DV-2.
- AC-1's and AC-3's controls (`src`, `wibble`, `fixtures/`, `lib/fixtures`):
  they assert behaviour that does not change, and each is paired with a
  red-on-arrival positive in the same block. Not earned one by one (rules.md,
  "Mutation work per story": that is `/audit-mutations`' job).
- AC-6's "at most 26" and the existing 27 bound: no mutation. The
  `git check-ignore` = 0 half is red on arrival.

### C-4 Line pins and guards

- `sigpipe.test.sh` pins `scripts/gates.sh:74` and `:563` only. This story does
  not touch `gates.sh`, so no pin moves.
- After GREEN, run `bash scripts/check-sigpipe.sh` and
  `bash scripts/check-grep-count.sh` over the tree and paste both summary lines.
  The change is inside an awk program, with no new pipeline and no `grep -c`.

### C-5 Commands

| When | Commands |
|---|---|
| RED and GREEN | `bash .claude/tests/classify.test.sh` (about 1.5 min), `bash .claude/tests/spawns.test.sh` |
| RED and GREEN, in the background | `bash .claude/tests/phase-guard.test.sh` (30-37 min per HARNESS-030). Run it detached (`nohup … &`) and read the log |
| After GREEN | `bash .claude/tests/lib.test.sh`, `bash .claude/tests/boundaries.test.sh`, `bash .claude/tests/gates.test.sh` (they consume `classify_stdin`), `bash .claude/tests/selftest.test.sh`, both guards (C-4) |
| GATES | DV-1 to DV-4 and the probe P-1, **one at a time** and detached: they mutate files the same suites read. Then `bash scripts/gates.sh` from the story branch |
| Once, before REVIEW | the full `bash scripts/selftest.sh`, in the background. CI runs all 22 suites |

### C-6 Oracle partition

| Kind | Criteria | Instruction to RED |
|---|---|---|
| **Settled** | The retry itself (audit Decided 5), PO decisions 1 and 2, the order rules→slashed→ignored→source, AC-6's measured 26 / 1 / 27, AC-7's expected six directories | Read them out. Do not re-derive. AC-7's numbers are **evidence**, measured by simulation at PLANNED (Notes), and DV-4 verifies them on the real code |
| **Mechanical** | AC-1 to AC-6 | Pin each exactly, with whole lines and exact paths |
| **Oracle-free** | none | — |

## Deferred verifications

RED cannot run DV-1, DV-2 or DV-4: the retry does not exist yet. DV-3 and P-1
can run at any time; they are placed at GATES so that one phase owns the
mutations. Each uses **one** `sed` expression through `scripts/mutate.sh`, adapted
to the committed line, against the narrowest suite holding the assertion. Run
each detached (`nohup`), one at a time, so a tool time limit cannot kill a
mutation mid-run (HARNESS-024).

- **DV-1: the defect put back. Owner: GATES.** Disable the retry:
  `bash scripts/mutate.sh .claude/hooks/lib.sh 's/if (!m && substr(lp, length(lp), 1) != "\/")/if (0)/' -- bash .claude/tests/classify.test.sh`.
  AC-3's `fixtures`, `pkg/golden` and `.pytest_cache` assertions, AC-4's `.next`
  and AC-5's `fixtures` / `.pytest_cache` lines **must** go red. AC-3's controls
  stay green.
- **DV-2: downstream's heuristic in place of the matched flag. Owner: GATES.**
  `bash scripts/mutate.sh .claude/hooks/lib.sh 's/if (!m && /if (c == "source" \&\& /' -- bash .claude/tests/classify.test.sh`.
  AC-4's `gen` assertion **must** go red, and every other assertion stay green.
  This earns the AC-4 assertion that passes on arrival.
- **DV-3: earns AC-2's `cp docs/notes.md docs/`. Owner: GATES.** Remove the
  docs rule the slashed operand matches:
  `bash scripts/mutate.sh .claude/harness/paths.conf '/^docs | docs\/\*\*$/d' -- bash .claude/tests/phase-guard.test.sh`.
  AC-2's REVIEW `cp docs/notes.md docs/` **must** go red. The run is 30-37
  min.
- **DV-4: AC-7's whole-tree measurement. Owner: GATES.** `git show
  origin/main:.claude/hooks/lib.sh` into a `mktemp -d`, then, with
  `CLAUDE_PROJECT_DIR` set to each repository in turn, source the old and then
  the new `lib.sh` and run `classify` over the same lists:
  - every `git ls-files` path;
  - every proper directory prefix of those paths;
  - `gate_tree_hash_of HEAD`.

  `diff` the two outputs. Paste the counts, the diff, and the two hashes per
  repository. manga-translator is read in place, read-only, at the commit that
  is recorded.
- **P-1: a probe against a real line of the tree** (rules.md: this story changes
  a rule over the tree). **Owner: GATES.** Delete the real twin
  `test | **/tests` (`paths.conf:124`):
  `bash scripts/mutate.sh .claude/harness/paths.conf '/^test | \*\*\/tests$/d' -- bash .claude/tests/classify.test.sh`.
  After GREEN, `bare tests is test` and `a nested bare tests directory is still
  test` **must stay green**: the retry, not the twin, now covers the real
  `tests` rule.

  *Control, run at PLANNED (2026-10-05) against `16c42a1`, before the
  retry exists.* The same command goes red on exactly those two:

  ```
  === mutate: .claude/harness/paths.conf (1 line(s) changed by /^test | \*\*\/tests$/d) ===
    124 - test | **/tests
  === mutate: running bash .claude/tests/classify.test.sh ===
      FAIL bare tests is test
      FAIL a nested bare tests directory is still test
  classify: 40 passed, 2 failed
  === mutate: command exited 1; restored (verified byte-for-byte against /d/agentic-dev-harness/.claude/worktrees/nostalgic-williams-fcf700/.claude/state/mutations/.claude_harness_paths.conf.20261005T030551Z.10127.bak) ===
    124: test | **/tests
  ```

### Results, run at GATES (2026-10-05) by the orchestrator

Each through `scripts/mutate.sh` with one expression, detached (`nohup`), one at a time, against the GREEN commit. DV-4 ran in a separate detached worktree at that commit so that no mutation was in the tree it read.

**DV-1, the defect put back: red as required** (the six AC-3/4/5 positives; every control green).

```
=== mutate: .claude/hooks/lib.sh (1 line(s) changed by s/if (!m && substr(lp, length(lp), 1) != "\/")/if (0)/) ===
  968 -       if (!m && substr(lp, length(lp), 1) != "/")
  968 +       if (0)

=== mutate: running bash .claude/tests/classify.test.sh ===

  paths as arguments

  paths on stdin

  --only filters to one category

  --list enumerates the tree the way the lock sees it

  a probe artifact is not a source module

  the category list cannot drift from paths.conf

  it refuses what it cannot answer

  HARNESS-011: a bare directory name classifies as its own category

  HARNESS-031: a bare path no rule matches takes its slashed form's category
    FAIL AC-3: bare fixtures takes the category of its fixtures/** rule
         expected: test	fixtures
         actual:   source	fixtures
    FAIL AC-3: a nested bare pkg/golden takes the category of **/golden/**
         expected: test	pkg/golden
         actual:   source	pkg/golden
    FAIL AC-3: bare .pytest_cache is vendor under the real paths.conf, with no twin
         expected: vendor	.pytest_cache
         actual:   source	.pytest_cache
    FAIL AC-3: bare .tox is vendor under the real paths.conf, with no twin
         expected: vendor	.tox
         actual:   source	.tox
    FAIL AC-4: a slashed-form rule beats .gitignore - bare .next is vendor, not ignored
         expected: vendor	.next
         actual:   ignored	.next
    FAIL AC-5: classify_stdin retries per line, in order, printing each path as given
         expected: test	fixtures
         source	src
         test	fixtures/a.json
         vendor	.pytest_cache
         actual:   source	fixtures
         source	src
         test	fixtures/a.json
         source	.pytest_cache

classify: 49 passed, 6 failed

=== mutate: command exited 1; restored (verified byte-for-byte against /d/agentic-dev-harness/.claude/worktrees/nostalgic-williams-fcf700/.claude/state/mutations/.claude_hooks_lib.sh.20261005T044050Z.183453.bak) ===
  968:       if (!m && substr(lp, length(lp), 1) != "/")
```

**DV-2, downstream's `c == "source"` in place of the matched flag: red as required** (exactly AC-4's `gen` assertion).

```
=== mutate: .claude/hooks/lib.sh (1 line(s) changed by s/if (!m && /if (c == "source" \&\& /) ===
  968 -       if (!m && substr(lp, length(lp), 1) != "/")
  968 +       if (c == "source" && substr(lp, length(lp), 1) != "/")

=== mutate: running bash .claude/tests/classify.test.sh ===

  paths as arguments

  paths on stdin

  --only filters to one category

  --list enumerates the tree the way the lock sees it

  a probe artifact is not a source module

  the category list cannot drift from paths.conf

  it refuses what it cannot answer

  HARNESS-011: a bare directory name classifies as its own category

  HARNESS-031: a bare path no rule matches takes its slashed form's category
    FAIL AC-4: an explicit source rule for bare gen beats the retry onto gen/**
         expected: source	gen
         actual:   test	gen

classify: 54 passed, 1 failed

=== mutate: command exited 1; restored (verified byte-for-byte against /d/agentic-dev-harness/.claude/worktrees/nostalgic-williams-fcf700/.claude/state/mutations/.claude_hooks_lib.sh.20261005T044123Z.186392.bak) ===
  968:       if (!m && substr(lp, length(lp), 1) != "/")
```

**P-1, the real `test | **/tests` twin deleted: green as required.** The retry, not the twin, now covers bare `tests` (the PLANNED control above went 40/2 red on the same expression).

```
=== mutate: .claude/harness/paths.conf (1 line(s) changed by /^test | \*\*\/tests$/d) ===
  130 - test | **/tests

=== mutate: running bash .claude/tests/classify.test.sh ===

  paths as arguments

  paths on stdin

  --only filters to one category

  --list enumerates the tree the way the lock sees it

  a probe artifact is not a source module

  the category list cannot drift from paths.conf

  it refuses what it cannot answer

  HARNESS-011: a bare directory name classifies as its own category

  HARNESS-031: a bare path no rule matches takes its slashed form's category

classify: 55 passed, 0 failed

=== mutate: command exited 0; restored (verified byte-for-byte against /d/agentic-dev-harness/.claude/worktrees/nostalgic-williams-fcf700/.claude/state/mutations/.claude_harness_paths.conf.20261005T044201Z.189222.bak) ===
  130: test | **/tests
```

**DV-4, AC-7 whole-tree measurement: matches the plan.** Old = `origin/main:.claude/hooks/lib.sh` (16c42a1), new = the GREEN commit's. This repo has 167 files rather than 166 because the story file itself is now tracked.

```
=== <this repo, detached worktree> at 9821b8e: 167 files, 31 dir prefixes
--- files diff:
(files changed: 0)
--- dirs diff:
(dirs changed: 0)
--- gate_tree_hash_of HEAD: old 0b9e42e11b06710a2d298360a915beab1d318dd5  new 0b9e42e11b06710a2d298360a915beab1d318dd5
=== /d/manga-translator at ce5edaf: 425 files, 52 dir prefixes
--- files diff:
(files changed: 0)
--- dirs diff:
1c1
< source	.claude
---
> harness	.claude
21c21
< source	.github
---
> harness	.github
23c23
< source	docs
---
> docs	docs
30c30
< source	fixtures
---
> test	fixtures
35c35
< source	scripts
---
> harness	scripts
49c49
< source	tests
---
> test	tests
(dirs changed: 6)
--- gate_tree_hash_of HEAD: old 3ef9048a35ca7d7615cc88de7ad5f933eacea16d  new 3ef9048a35ca7d7615cc88de7ad5f933eacea16d
DV4-DONE
```

**DV-3, the real `docs | docs/**` rule deleted: red as required.** AC-2's `allows: AC-2: cp into docs/ in REVIEW` is among the ten failures; the other nine are older assertions that also depend on that rule (HARNESS-010/011 operand tests), which is expected. Passing lines elided.

```
=== mutate: .claude/harness/paths.conf (1 line(s) changed by /^docs | docs\/\*\*$/d) ===
  105 - docs | docs/**
=== mutate: running bash .claude/tests/phase-guard.test.sh ===
    FAIL blocks: C-1 r13 sharpened: with the slash, docs/ is writable and the SOURCE is refused
    FAIL blocks: a trailing redirect to a permitted path does not hide it either
    FAIL blocks: -t: the positional is still a source
    FAIL blocks: -tDIR glued: the positional is still a source
    FAIL blocks: --target-directory=: the positional is still a source
    FAIL blocks: a redirect to a permitted path does not hide it either
    FAIL role: -t: the positional is a source however late it appears
    FAIL allows: mv -t into a permitted directory
    FAIL allows: the attached form, permitted
    FAIL allows: AC-2: cp into docs/ in REVIEW
phase-guard: 300 passed, 10 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /d/agentic-dev-harness/.claude/worktrees/nostalgic-williams-fcf700/.claude/state/mutations/.claude_harness_paths.conf.20261005T044253Z.192303.bak) ===
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

Planned by `bash scripts/plan.sh write HARNESS-031` from `.claude/harness/models.conf`.
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

- PLANNED: `lead-po` ran on `claude-opus-5-5` (Opus 5.5), as planned; no override given in the dispatch.
- RED: `test-developer` ran on `claude-opus-5-5` (Opus 5.5), as planned; no override. Orchestrator re-ran classify (49/6), spawns (67/2), selftest (100/0) and read the detached phase-guard log (305/5): all match the handoff.
- GREEN: `feature-developer` ran on `claude-opus-5-5` (Opus 5.5), as planned; no override. Orchestrator re-ran classify (55/0), spawns (69/0) and read the detached phase-guard log (310/0).
- GATES: no dispatch. The orchestrator (`claude-opus-5-5`) ran DV-1..DV-4 and P-1, `gates.sh`, and the full selftest itself; nothing in GATES needed a source change.

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Out of scope

- **Removing the bare twins from `paths.conf`** (PO decision 2). With the retry
  they are redundant. Removing them is its own story, with its own whole-tree
  measurement, if anyone wants it.
- **`normalize_rel` keeping a typed slash.** Downstream rejected it (its output
  feeds `phase-guard.sh`'s `$EXEMPT` exact-string test, and a stray slash would
  un-exempt `mutate.sh`). Upstream's guard already keeps a directory operand's
  slash separately (`phase-guard.sh:166-177`). Neither is touched.
- **A child-driven retry**, one that classifies `x` by what is inside it on
  disk. The retry reads rules, never the filesystem.
- **`phase-guard.sh`, `scripts/classify.sh`, `check-boundaries.sh`, `gates.sh`,
  `plan.sh`.** They get the retry through `classify` / `classify_stdin` and need
  no edit. A change to any of them is a contract amendment.
- **manga-translator's own `paths.conf`, and its refresh.** The audit's
  `## Progress` owns that, after group 6.
- **Downstream's `lib.test.sh` and `phase-guard.test.sh` blocks.** Their needles
  expect `tests` where upstream prints `tests/`. Write upstream's tests from this
  story's criteria; read downstream's for ideas only.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

Three suites, at the levels C-3 assigns: the classifier where the answer is
decided (`classify.test.sh`), the real hook end to end (`phase-guard.test.sh`),
and the spawn instrument (`spawns.test.sh`). Every extra-rule fixture is its own
`make_fixture` / `make_project_fixture` tree, added to that suite's cleanup
trap; no rule is appended to a shared `FIX`. No `\r`, no awk intervals, `\d` or
backreferences, forward slashes only (C-3 Platform).

Legend: **R** = red on arrival (pins the new behaviour), **G** = green on
arrival (control, or passes-on-arrival named in C-3).

### `classify.test.sh` - block "HARNESS-031: a bare path no rule matches takes its slashed form's category"

Fixtures: `H031A` (`test | fixtures/**`, later `test | **/golden/**` and a
`.gitignore` line `.next/`), `H031R` (the real `paths.conf`, nothing added),
`H031G` (`source | gen` then `test | gen/**`).

| # | Assertion (label) | Expected whole line | AC | R/G |
|---|---|---|---|---|
| 1 | AC-3: bare fixtures takes the category of its fixtures/** rule | `test	fixtures` | AC-3 | R |
| 2 | AC-3 control: bare src is still source | `source	src` | AC-3 | G |
| 3 | AC-3 control: an invented bare name is still source | `source	wibble` | AC-3 | G |
| 4 | AC-3 control: a nested lib/fixtures is not reached by a root-anchored rule | `source	lib/fixtures` | AC-3 | G |
| 5 | AC-3: a nested bare pkg/golden takes the category of **/golden/** | `test	pkg/golden` | AC-3 | R |
| 6 | AC-3: bare .pytest_cache is vendor under the real paths.conf, with no twin | `vendor	.pytest_cache` | AC-3 | R |
| 7 | AC-3: bare .tox is vendor under the real paths.conf, with no twin | `vendor	.tox` | AC-3 | R |
| 8 | AC-4: an explicit source rule for bare gen beats the retry onto gen/** | `source	gen` | AC-4 | G (DV-2) |
| 9 | AC-4 control: the gen/** rule is live (gen/x.ts is test) | `test	gen/x.ts` | AC-4 | G |
| 10 | AC-4 control: .next/ is gitignored in the fixture (precondition) | `git check-ignore -q .next/` exits 0 | AC-4 | G |
| 11 | AC-4: a slashed-form rule beats .gitignore - bare .next is vendor, not ignored | `vendor	.next` | AC-4 | R |
| 12 | AC-5: classify_stdin retries per line, in order, printing each path as given | the four lines `test	fixtures` / `source	src` / `test	fixtures/a.json` / `vendor	.pytest_cache`, whole output | AC-5 | R |
| 13 | AC-5 control: an already-slashed fixtures/ is one line, unchanged | `test	fixtures/` | AC-5 | G |

#9 and #10 were added beyond the AC text as the controls that make #8 and #11
mean something: #8 would pass vacuously if `gen/**` were not a live rule, and
#11 separates `vendor` from `ignored` only if `.next/` really is ignored.

### `phase-guard.test.sh` - block "HARNESS-031: a project rule X/** covers bare X, through the guard"

Fixture: `H031` (`make_fixture` + `test | fixtures/**`); the AC-3 and REVIEW
assertions use the suite's shared `FIX` (real `paths.conf`, no extra rule).

| # | Assertion (label) | Phase | AC | R/G |
|---|---|---|---|---|
| 1 | blocks: AC-1: the bare fixtures directory in GREEN... (on `fixtures`) | GREEN | AC-1 | R |
| 2 | AC-1: and refused because it is test, not incidentally (`category: test`) | GREEN | AC-1 | R |
| 3 | blocks: AC-1 control: the trailing-slash fixtures/ is still refused in GREEN (on `fixtures/`) | GREEN | AC-1 | G |
| 4 | allows: AC-1 control: bare src is still writable in GREEN | GREEN | AC-1 | G |
| 5 | allows: AC-1: the bare fixtures directory in RED | RED | AC-1 | R |
| 6 | blocks: AC-1 control: bare src is still frozen in RED (on `src`) | RED | AC-1 | G |
| 7 | allows: AC-2: cp into a bare project test directory in RED (`cp docs/notes.md fixtures`) | RED | AC-2 | R |
| 8 | allows: AC-3: the bare .pytest_cache in RED... (`rm -rf .pytest_cache`, FIX) | RED | AC-3 | R |
| 9 | allows: AC-2: cp into docs/ in REVIEW (`cp docs/notes.md docs/`, FIX) | REVIEW | AC-2 | G (DV-3) |
| 10 | blocks: AC-2 control: cp into src/ in REVIEW is refused, on src/ | REVIEW | AC-2 | G |

### `spawns.test.sh` - block "HARNESS-031 AC-6  the bare-path retry costs no process"

Fixture: `FIXF` (`make_fixture` + `test | fixtures/**`), GREEN, traced
`rm -rf fixtures`.

| # | Assertion (label) | AC | R/G |
|---|---|---|---|
| 1 | AC-6: the traced rm -rf fixtures is refused in GREEN (instrument control) | AC-6 (and AC-1's verdict) | R |
| 2 | AC-6: rm -rf fixtures spawns no git check-ignore (`at_most`, classify == 1 then bound 0) | AC-6 | R |
| 3 | AC-6: rm -rf fixtures spawns at most 26 external processes (classify == 1 then bound 26) | AC-6 | G |

HARNESS-025's existing "at most 27" for `echo hi > src/main.ts` and the
`classify.golden` byte-identity are AC-6's other two clauses; they are existing
assertions, unchanged, and pass today.

### AC-7

No test. It is a whole-tree measurement owned by GATES (DV-4).

### Floors

`classify` 42 -> 55, `phase-guard` 300 -> 310, `spawns` 66 -> 69, in both
`.claude/tests/floors.conf` (with a dated note at its foot) and the
`selftest.test.sh` `COUNTS` block. `selftest.test.sh` itself runs
`100 passed, 0 failed` with the new table.

## Handoff: RED -> GREEN

**RED, test-developer, 2026-10-04.** Ran on `claude-opus-5-5` (Opus 5.5); no
model override in the dispatch. No Contract block amended: C-1..C-6 match what
was measured. Nothing committed (the dispatch said not to).

### Commands

```bash
bash .claude/tests/classify.test.sh      # ~1.5 min
bash .claude/tests/spawns.test.sh        # ~2.3 min
nohup bash .claude/tests/phase-guard.test.sh > <log> 2>&1 &   # 30-40 min; read the log
bash .claude/tests/selftest.test.sh      # floors table (passes now)
```

### Files touched

- `.claude/tests/classify.test.sh` - `H031_FIXES` added to the cleanup trap; new
  block before `summary "classify"`.
- `.claude/tests/phase-guard.test.sh` - `H031_FIXES` added to the cleanup trap;
  new block before `summary "phase-guard"`.
- `.claude/tests/spawns.test.sh` - new block before `summary "spawns"` (fixture
  added to the existing `FIXTURES_MADE` trap list).
- `.claude/tests/floors.conf` - classify 42 -> 55, phase-guard 300 -> 310,
  spawns 66 -> 69, plus a dated HARNESS-031 note at the foot.
- `.claude/tests/selftest.test.sh` - the same three numbers in `COUNTS`.
- this story: `## Test plan`, this section.

`.claude/hooks/lib.sh` and `.claude/harness/paths.conf` were NOT touched.

### Expected counts per suite

| Suite | Before (executed) | RED now | After GREEN |
|---|---|---|---|
| classify | 42 (42 passed) | 49 passed, 6 failed (55) | 55 passed, 0 failed |
| spawns | 66 (66 passed) | 67 passed, 2 failed (69) | 69 passed, 0 failed |
| phase-guard | 300 (300 passed) | 305 passed, 5 failed (310), 1330 s | 310 passed, 0 failed |
| selftest | 100 | 100 passed, 0 failed | 100 passed, 0 failed |

### Verbatim failure output

`bash .claude/tests/classify.test.sh` (only the new block reports):

```
  HARNESS-031: a bare path no rule matches takes its slashed form's category
    FAIL AC-3: bare fixtures takes the category of its fixtures/** rule
         expected: test	fixtures
         actual:   source	fixtures
    FAIL AC-3: a nested bare pkg/golden takes the category of **/golden/**
         expected: test	pkg/golden
         actual:   source	pkg/golden
    FAIL AC-3: bare .pytest_cache is vendor under the real paths.conf, with no twin
         expected: vendor	.pytest_cache
         actual:   source	.pytest_cache
    FAIL AC-3: bare .tox is vendor under the real paths.conf, with no twin
         expected: vendor	.tox
         actual:   source	.tox
    FAIL AC-4: a slashed-form rule beats .gitignore - bare .next is vendor, not ignored
         expected: vendor	.next
         actual:   ignored	.next
    FAIL AC-5: classify_stdin retries per line, in order, printing each path as given
         expected: test	fixtures
         source	src
         test	fixtures/a.json
         vendor	.pytest_cache
         actual:   source	fixtures
         source	src
         test	fixtures/a.json
         source	.pytest_cache

classify: 49 passed, 6 failed
```

`bash .claude/tests/spawns.test.sh`:

```
  HARNESS-031 AC-6  the bare-path retry costs no process
    FAIL AC-6: the traced rm -rf fixtures is refused in GREEN (instrument control)
         expected to contain: "permissionDecision":"deny"
         actual:               
    FAIL AC-6: rm -rf fixtures spawns no git check-ignore
         spawned 1 git check-ignore for 1 classified candidates
         measured, one line per tool (count, key):
         7	awk
         1	cat
         1	cut
         1	dirname
         1	git check-ignore
         6	grep
         3	sed
         2	sort
         3	tr:lower
         1	tr:other '\001\002\003\004\005\006\007\010' '|&;>< \t\n'
         26	TOTAL

spawns: 67 passed, 2 failed
```

`bash .claude/tests/phase-guard.test.sh` (full run, detached):

```
  HARNESS-031: a project rule X/** covers bare X, through the guard
    FAIL blocks: AC-1: the bare fixtures directory in GREEN, under a project rule with no twin
         not blocked at all
    FAIL AC-1: and refused because it is test, not incidentally
         expected to contain: category: test
         actual:               
    FAIL allows: AC-1: the bare fixtures directory in RED
         blocked with: BLOCKED by the harness phase lock.    story:    T-1   phase:    RED   path:     fixtures   category: source  Story is in RED. Production code is frozen: write the failing test first, and let it fail for the right reason. Move to GREEN with: bash scripts/phase.sh set <id> GREEN  If this write is genuinely correct, change the phase deliberately rather than working around the lock:  bash scripts/phase.sh set T-1 <PHASE>
    FAIL allows: AC-2: cp into a bare project test directory in RED
         blocked with: BLOCKED by the harness phase lock.    story:    T-1   phase:    RED   path:     fixtures   operand:  destination of cp   category: source  Story is in RED. Production code is frozen: write the failing test first, and let it fail for the right reason. Move to GREEN with: bash scripts/phase.sh set <id> GREEN  If this write is genuinely correct, change the phase deliberately rather than working around the lock:  bash scripts/phase.sh set T-1 <PHASE>
    FAIL allows: AC-3: the bare .pytest_cache in RED, a built-in vendor rule with no twin
         blocked with: BLOCKED by the harness phase lock.    story:    T-1   phase:    RED   path:     .pytest_cache   category: source  Story is in RED. Production code is frozen: write the failing test first, and let it fail for the right reason. Move to GREEN with: bash scripts/phase.sh set <id> GREEN  If this write is genuinely correct, change the phase deliberately rather than working around the lock:  bash scripts/phase.sh set T-1 <PHASE>

phase-guard: 305 passed, 5 failed
```

No other block in the suite failed: the 300 pre-existing assertions all
passed, so the 310 is 300 + the 10 new ones (local run, 1330 s wall).

**Why these are the right failures.** Every red line is the bare form falling
to `source` (or, for `.next`, to `ignored` via `.gitignore`) because no rule
matches it and no retry exists; the guard ones are the same answer seen as a
verdict (`category: source` in RED, allowed in GREEN). No failure is a fixture,
setup or import error: the controls in the same blocks (src, wibble,
lib/fixtures, fixtures/, gen, gen/x.ts, the .next precondition, REVIEW
cp into docs/ and src/) all ran and passed.

### Export shape the tests pin

No new function. The tests reach existing names only:

- `classify_stdin` (sourced from `.claude/hooks/lib.sh` with
  `CLAUDE_PROJECT_DIR` set to the fixture): stdin one path per line, stdout
  exactly one `<category>\t<path>` line per non-empty input line, in input
  order, the path **as given** (no `/` appended, no `./` re-added). Pinned
  whole by AC-5 #12.
- `classify <relpath>` via `scripts/classify.sh` (prints `<category>\t<path>`)
  and via the hook. Unchanged signature.
- The hook's denial text: `path:     fixtures` (the bare operand, not
  `fixtures/`) and `category: test`.
- `spawn_trace` / `spawn_tally` / `at_most` from HARNESS-025, unchanged.

Not constrained: the awk variable names (`m` is the Contract's, DV-1/DV-2's
`sed` expressions match C-1's spelling - see below), where in the awk the
retry loop sits, and the comment wording (C-1/C-2 say what it must say).

**DV-1 and DV-2 depend on C-1's exact spelling.** Their `sed` expressions
target `if (!m && substr(lp, length(lp), 1) != "/")` and `if (!m && `. I
applied C-1's block to a scratch copy of `lib.sh` (outside the tree) and both
expressions match it once each. If GREEN spells the line differently, GATES
must adapt the expressions (the Deferred verifications already say "adapted to
the committed line").

### Passed on arrival, and what earns each

| Assertion | Earned by | Owner |
|---|---|---|
| classify #8 `source	gen` | DV-2 (downstream's `c == "source"` heuristic) | GATES |
| phase-guard #9 REVIEW `cp docs/notes.md docs/` | DV-3 (delete `docs | docs/**`) | GATES |
| classify #2,#3,#4,#13; phase-guard #3,#4,#6,#10 | controls of behaviour that does not change, each beside a red positive in its block (C-3) | none per story |
| classify #9 `gen/x.ts`, #10 `.next/` ignored | preconditions of #8 and #11 | none per story |
| spawns #3 at most 26 | read-out bound, no mutation (C-3); its classify==1 half is shared with #2 | none |

### Negative controls and expected values (claims until GREEN confirms)

These are the values the tests expect, measured two ways in RED: the current
`lib.sh` (the suite runs) and C-1's block applied to a **scratch copy** of
`lib.sh` sourced against a scratch fixture (`real paths.conf` + the extra
rules), outside the tree. GREEN confirms them against the shipped `lib.sh`.

| Input (fixture) | Today (measured) | With C-1 (scratch copy, measured) | Test expects |
|---|---|---|---|
| `fixtures` (+`fixtures/**`) | `source` | `test` | `test` |
| `src` | `source` | `source` | `source` |
| `wibble` | `source` | `source` | `source` |
| `lib/fixtures` | `source` | `source` | `source` |
| `pkg/golden` (+`**/golden/**`) | `source` | `test` | `test` |
| `.pytest_cache` (real) | `source` | `vendor` | `vendor` |
| `.tox` (real) | `source` | `vendor` | `vendor` |
| `.next` (`.next/` gitignored) | `ignored` | `vendor` | `vendor` |
| `fixtures/` | `test` | `test` | `test` |
| `gen` (`source | gen`, `test | gen/**`) | `source` | `source` | `source` |
| `gen` under DV-2's mutation | n/a | `test` | (DV-2 must see red) |
| `gen/x.ts` | `test` | `test` | `test` |
| AC-5 stdin, 4 lines | `source/source/test/source` | `test/source/test/vendor` | `test/source/test/vendor` |

| Spawn measure (GREEN, `rm -rf fixtures`) | Bound | Measured today | Expected after |
|---|---|---|---|
| `classify` calls (instrument control) | == 1 | 1 | 1 |
| `git check-ignore` | <= 0 | 1 | 0 |
| total external processes | <= 26 | 26 | 25 or 26 (PLANNED measured `rm -rf fixtures/`, the same verdict with 0 check-ignore, at 26) |
| verdict | deny | allow | deny |

All timings above are local (Windows, Git Bash); none comes from CI. No test
here carries a timeout.

### Deferred verifications

DV-1, DV-2 and DV-4 cannot be run in RED: they mutate or measure the retry,
which does not exist yet. I declined them; they stay with GATES. DV-3 and P-1
could run now but the story places them at GATES so one phase owns the
mutations; I did not run them. The two `sed` expressions were only checked to
match a scratch copy of C-1's block, which is not running them.

### `gates.sh --fast` and the tree guards

`bash scripts/gates.sh --fast`: every gate UNCONFIGURED (harness template,
`BOOTSTRAPPED=no`), `All required gates passed (0 ran, 5 unconfigured, 0
known)`. As the Context says, `selftest.sh` in CI is what actually judges
these suites. `bash scripts/check-sigpipe.sh`: `scanned 44 shell file(s), 41
with pipefail, 0 finding(s)`. `bash scripts/check-grep-count.sh`: `scanned 44
shell file(s), 0 finding(s)`.

### For GREEN

- C-1 as written turns every red line green in the scratch simulation; nothing
  found that changes the approach.
- `classify.test.sh` copies `lib.sh` into each fixture at suite start
  (`make_project_fixture`), so rerun the suite after editing; nothing caches.
- Run `phase-guard.test.sh` detached; the new block alone takes about 50 s
  if you slice it out to check quickly.

## GREEN (feature-developer, 2026-10-04)

Ran on `claude-opus-5-5` (Opus 5.5); no model override in the dispatch. No test
file touched. Nothing committed (the dispatch said not to).

### What changed

- `.claude/hooks/lib.sh` - `classify_stdin`'s per-record block is C-1's block
  verbatim: `m = 0`, `m = 1` on a bare match, and the retry line spelled
  exactly `if (!m && substr(lp, length(lp), 1) != "/")`, so DV-1's and DV-2's
  `sed` expressions apply unadapted. `classify_stdin`'s header gains a
  "THE BARE-PATH RETRY" paragraph (why, matched flag not `source`, one line per
  input with the path as given, only `**`/`/`-ending globs reachable with their
  anchoring kept, no filesystem, reaches every caller, credit MT-034 /
  HARNESS-031). `classify()`'s comment gains one sentence: the retry lives in
  `classify_stdin`, and the order is bare rules, slashed rules, `.gitignore`,
  `source`. `classify()`'s code is unchanged.
- `.claude/harness/paths.conf` - comment only: the `BOTH FORMS, ALWAYS`
  paragraph rewritten per C-2 (retry; twins predate it and are kept; a bare
  rule wins, so write one only for a different category). Heading kept, so the
  four "see BOTH FORMS" pointers stay valid; the "a FILE of that name"
  paragraph kept. No rule line changed.

### Per-suite results (local, Windows / Git Bash)

| Suite | RED | GREEN (measured) | Expected |
|---|---|---|---|
| classify | 49 / 6 | **55 passed, 0 failed** | 55 / 0 |
| spawns | 67 / 2 | **69 passed, 0 failed** | 69 / 0 |
| phase-guard (detached) | 305 / 5 | **310 passed, 0 failed** | 310 / 0 |
| lib | - | **217 passed, 0 failed** | consumer of classify_stdin |
| selftest | 100 / 0 | **100 passed, 0 failed** | 100 / 0 |
| sigpipe | - | **82 passed, 0 failed** | no pin moved (C-4) |
| boundaries | - | **82 passed, 0 failed** | consumer (C-5) |
| gates | - | **470 passed, 0 failed** | consumer (C-5) |

Guards (C-4): `check-sigpipe: scanned 44 shell file(s), 41 with pipefail, 0
finding(s)`; `check-grep-count: scanned 44 shell file(s), 0 finding(s)`.

`bash scripts/gates.sh --fast`: `All required gates passed (0 ran, 5
unconfigured, 0 known)` - every gate UNCONFIGURED (template,
`BOOTSTRAPPED=no`), so this judges nothing; `selftest.sh` in CI is the real
judge, as the Context says.

### Negative controls: RED's expected values against the shipped lib.sh

Measured outside the test framework: `lib.sh` from this worktree sourced with
`CLAUDE_PROJECT_DIR` pointed at fresh `make_fixture` trees built the way the
suites build them, and `spawn_trace` / `spawn_tally` from `_spawns.sh` for the
cost row. Every value matches RED's table; no divergence.

| Input (fixture) | RED expected | GREEN measured |
|---|---|---|
| `fixtures` (+`fixtures/**`) | test | test |
| `src` | source | source |
| `wibble` | source | source |
| `lib/fixtures` | source | source |
| `pkg/golden` (+`**/golden/**`) | test | test |
| `.pytest_cache` (real conf) | vendor | vendor |
| `.tox` (real conf) | vendor | vendor |
| `.next` (`.next/` gitignored, added) | vendor | vendor |
| `fixtures/` | test | test |
| `gen` (`source | gen`, `test | gen/**`) | source | source |
| `gen/x.ts` | test | test |
| AC-5 stdin (4 lines) | test/source/test/vendor | `test	fixtures` / `source	src` / `test	fixtures/a.json` / `vendor	.pytest_cache` |

| Spawn measure (GREEN, `rm -rf fixtures`) | Bound | RED expected | GREEN measured |
|---|---|---|---|
| `classify` calls (instrument control) | == 1 | 1 | **1** |
| `git check-ignore` | <= 0 | 0 | **0** |
| total external processes | <= 26 | 25 or 26 | **26** |
| verdict | deny | deny | **deny** |

The total stays at 26 rather than dropping to 25: `git check-ignore` went from
1 to 0 and `awk` from 7 to 8 (tally: 8 awk, 1 cat, 1 cut, 1 dirname, 6 grep,
3 sed, 2 sort, 3 tr:lower, 1 tr:other). This matches PLANNED's
`rm -rf fixtures/` row (deny, 26, 0 check-ignore). RED's run was an allow and
this one is a deny, and `classify` was reached once in both, so the extra
`awk` coincides with the verdict changing; which call it is was not traced.
It is within the bound and equals the measured slashed-form deny.

### Not run (GATES owns them)

DV-1..DV-4 and P-1, and `scripts/mutate.sh` in any form. The full
`bash scripts/gates.sh` run also belongs to GATES.

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

    run:    2026-10-05T04:52:07Z
    commit: 9821b8e
    tree:   0b9e42e11b06710a2d298360a915beab1d318dd5
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


**PLANNED (2026-10-05), lead-po.** What was measured, and what the plan rests on:

- **The repro** (Context) was run through the real `phase-guard.sh` with
  `make_fixture` plus `test | fixtures/**`, at `16c42a1`.
- **AC-6's baselines** came from `.claude/tests/_spawns.sh`'s `spawn_trace` on
  that fixture:

  | Phase | Command | Verdict | Spawns | `git check-ignore` |
  |---|---|---|---|---|
  | RED | `echo hi > src/main.ts` | deny | 27 | 1 |
  | RED | `rm -rf fixtures` | deny | 27 | 1 |
  | RED | `rm -rf fixtures/` | allow | 25 | 0 |
  | GREEN | `rm -rf fixtures` | allow | 26 | 1 |
  | GREEN | `rm -rf fixtures/` | deny | 26 | 0 |
  | GREEN | `rm -rf src` | allow | 26 | 1 |

  HARNESS-025's AC-1 bound is 27 and the measurement is 27. **There is no
  headroom: a retry that added one process would fail an existing test.** That
  is part of why the retry goes inside the awk already running (C-1).
- **AC-7's expected values** came from simulating the retry with the current
  `classify_stdin` (bare form, then `<path>/`, keeping the slashed answer only
  when the bare one was `source`):
  - this repository at `16c42a1`: 166 tracked files and 31 directory prefixes,
    0 changes. The built-in twins already cover every tracked directory;
  - manga-translator at `ce5edaf`, with its own `paths.conf`: 425 files, 0
    changes; 52 directory prefixes, 6 changes: `.claude`, `.github` and
    `scripts` become harness, `docs` becomes docs, `fixtures` and `tests`
    become test. manga-translator's `paths.conf` carries no twins at all.

  This is **evidence, not a decision**. DV-4 re-measures it against the real
  code.
- **Neither `paths.conf` has a `source |` rule** (grep, both repositories). So
  downstream's `c == "source"` heuristic would behave the same on both today.
  The matched flag is for the project that adds one (AC-4).
- **Lessons carried from HARNESS-024..030:**
  - platform-independent arguments (C-3);
  - `mutate.sh` takes one expression (Deferred verifications);
  - detached runs for every deferred verification and for `phase-guard.test.sh`;
  - floors and `COUNTS` raised together;
  - `sigpipe.test.sh`'s pins are `gates.sh`-only and untouched here (C-4);
  - the full selftest before REVIEW (C-5).
- **Not committed, phase not set:** the orchestrator creates the branch.

**GATES (2026-10-05), orchestrator.** Every deferred verification came out as
planned (results under `## Deferred verifications`). `bash scripts/gates.sh`:
all required gates passed (0 ran, 7 unconfigured), recorded. Full
`bash scripts/selftest.sh`, detached, once: exit 0 in 1,518 s, 22 suites,
2,351 assertions executed against 2,121 declared; classify 55/0, spawns 69/0,
phase-guard 310/0, lib 217/0, selftest 100/0, sigpipe 82/0. The extra `awk`
GREEN noted in the `rm -rf fixtures` trace (26 total, not 25) was not traced
further: it is within AC-6's bound and matches PLANNED's measured
`rm -rf fixtures/` deny row.

**DONE, 2026-10-05.** Merged in #108 (merge commit e6b3953), release 74. The
VERSION bump lands in this DONE commit. `phase.sh set DONE --force` was run on
`main` (a detached checkout of `origin/main` in the worktree), overriding the
branch check. PR CI: `gates` passed in 1m44s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37267220749),
`boundaries` in 11s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37267220800).
No epic. Group 5 (phase lock) of the port audit is complete; next is group 6,
process.
