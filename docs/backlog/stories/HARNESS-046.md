---
id: HARNESS-046
title: A story id is one path component
slug: a-story-id-is-one-path-component
epic: 
type: fix
status: done
phase: DONE
branch: story/HARNESS-046-a-story-id-is-one-path-component
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [.claude/hooks/lib.sh, scripts/new-story.sh, scripts/gates.sh, scripts/phase.sh, .claude/tests/lib.test.sh, .claude/tests/new-story.test.sh, .claude/tests/phase.test.sh, .claude/tests/gates.test.sh]         # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

Lead 3 of the first `/security-audit` run, `docs/wiki/audits/security-2026-10-08.md`
(fingerprint `story-id/path-traversal/allowlisted-scripts`; full record at
`C:\Users\ryanc\security-audit-skill\agentic-dev-harness\run-1\findings.json`
and `NEEDS-VALIDATION.md`). Three scripts join a caller-supplied story id
into `docs/backlog/stories/$id.md` with no check on the id:
`scripts/new-story.sh:11` (creates the file; refuses only an existing path;
also expands `title` unquoted into the frontmatter, so a title with a newline
writes arbitrary lines), `scripts/gates.sh:87,332` (`--story`; rewrites the
target's `## Gate results` via tmp+mv), and `scripts/phase.sh:158`
(`set`; rewrites the target's frontmatter and persists the id as `STORY_ID`
in `.claude/state/current-story.env`, which every hook then reads). An id of
`../../X` reaches any `.md` the parent directories hold.

**Why this is fixed now rather than validated first.** The audit left the
lead `needs_validation` on whether Claude Code's allow rules for the three
scripts auto-approve such an argument. The scripts' own contract does not
depend on it: `CLAUDE.md` says stories live in `docs/backlog/stories/`,
`story-authoring` gives the id as the first argument of `new-story.sh` in
the shape `WORLD-014`, and `rules.md` treats `STORY_ID` in the state file as
evidence every hook trusts. An id that names a file outside the stories
directory is a defect in the harness's stated behaviour whichever way the
platform question falls. **No criterion below depends on Claude Code's
permission behaviour**; every one runs in the harness's own suites over
`make_project_fixture` fixtures.

**The accepted grammar, decided from the ids in use.** Every id this
repository, its tests and its two downstream projects use is one run of
letters, digits and hyphens: `HARNESS-001`..`HARNESS-046` here; `T-1`,
`T-A`, `T-B`, `T-M`, `T-9`, `T-10`, `T-11`, `T-12`, `T-40`, `K-1`, `K-2`,
`WORLD-014`, `WORLD-3` in `.claude/tests/*.sh`; `WORLD-NNN` (129 stories) in
fantasy-world-builder and `MT-NNN` in manga-translator; epics `EPIC-03`.
The grammar is wider than that so it never refuses a reasonable id, and
exactly as narrow as "one path component": **the first character is a letter
or digit; every character is a letter, digit, `.`, `_` or `-`.** That admits
every id above and refuses `/`, `\`, every whitespace character (newline,
tab, space, carriage return), the empty string, and a leading `.` or `-` (so
`.`, `..`, `.hidden` and `-flag` are out). Case is not restricted. This is
settled here, not re-derived in RED.

**Decided, from the audit:** one shared check used by all three scripts
(audit `## Decided` 2, third bullet, and the user's instruction). The
*evidence* is not settled - the audit ran nothing - so AC-1 to AC-3
reproduce the defect first and are the permanent regression tests.

**Type `fix`; not split.** One function, three one-line call sites, one
title check, tests in the four suites that already cover those scripts.
**The gate that fails if this breaks** is the harness's own `selftest`:
the `lib`, `new-story`, `phase` and `gates` suites. No `required_gates`
entry is needed.

One of three stories cut from the audit's three cheap leads; the others are
HARNESS-044 (`task.sh` arguments) and HARNESS-045 (the lock sees `git
--output`). HARNESS-045 also writes `.claude/hooks/lib.sh` and
`.claude/tests/lib.test.sh`, so the two **conflict** and run one after the
other, never in parallel worktrees; HARNESS-044 shares nothing with this.

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC. -->

"The fixture" is `make_project_fixture` (it has `scripts/`,
`.claude/hooks/lib.sh` and `docs/backlog/stories/`); "the grammar message"
is Contract C-1's exact text. "Unchanged" is `cmp` against a copy taken
before the run.

- **AC-1 (`new-story.sh` refuses an id that is not one path component)** —
  Given the fixture, when `bash scripts/new-story.sh <id> "x"` runs for each
  of `../OUTSIDE`, `a/b`, `a\b`, `..`, `.x`, `-x`, `a b` and `$'A\nB'`, then
  each exits 2, prints the grammar message naming that id on stderr, and
  creates no file: `docs/backlog/OUTSIDE.md` does not exist afterwards and
  `docs/backlog/stories/` holds exactly the entries it held before.
  *Reproduction today:* `../OUTSIDE` creates `docs/backlog/OUTSIDE.md` and
  exits 0.
- **AC-2 (`phase.sh set` refuses it)** — Given the fixture with a story-shaped
  file at `docs/backlog/EXIST.md` (frontmatter `id: EXIST`, `phase: PLANNED`)
  and no `.claude/state/current-story.env`, when
  `bash scripts/phase.sh set ../EXIST PLANNED` runs, then it exits 1, prints
  the grammar message naming `../EXIST`, `docs/backlog/EXIST.md` is
  unchanged, and `current-story.env` still does not exist.
  *Reproduction today:* exit 0, `EXIST.md` rewritten, `STORY_ID=../EXIST`
  persisted.
- **AC-3 (`gates.sh --story` refuses it before any gate runs)** — Given the
  fixture with the same `docs/backlog/EXIST.md` and a `project.conf` whose
  one required gate is `printf 'ran\n'` with evidence `ran`, when
  `bash scripts/gates.sh --story ../EXIST` runs, then it exits 2, prints the
  grammar message naming `../EXIST`, prints no `ran` (the gate did not run),
  and `docs/backlog/EXIST.md` is unchanged. *Reproduction today:* the gate
  runs and `## Gate results` is appended to `EXIST.md`.
- **AC-4 (every id shape in use still works)** — Given the fixture, when
  `bash scripts/new-story.sh <id> "x"` then `bash scripts/phase.sh set <id>
  PLANNED` run for each of `HARNESS-046`, `WORLD-014`, `T-1`, `T-A`, `K-2`,
  `MT-071`, `a.b_c-1` and `x`, then each creates
  `docs/backlog/stories/<id>.md` and exits 0 both times; and the existing
  `new-story`, `phase`, `gates`, `plan`, `boundaries` and `worktree` suites,
  whose fixtures use the `T-*`/`K-*`/`WORLD-*` ids above, stay green.
- **AC-5 (`valid_story_id` is the one check, and it is a table)** — Given
  `.claude/hooks/lib.sh` sourced, when `valid_story_id <id>` runs, then it
  returns 0 and prints nothing for every id in AC-4's list, and returns 1 and
  prints nothing for every id in AC-1's list plus the empty string,
  `$'a\tb'`, `$'a\rb'`, `a;b` and `a$b`; and the three scripts each call it
  (one `grep -c 'valid_story_id' <script>` of at least 1 per script - a pin
  on *shared*, since AC-1..3 would pass with three private regexes).
- **AC-6 (`new-story.sh` refuses a title with a line break)** — Given the
  fixture, when `bash scripts/new-story.sh T-50 $'probe\n\n# injected'` and
  `bash scripts/new-story.sh T-51 $'a\rb'` run, then each exits 2 with a
  message on stderr saying the title must be one line, and neither
  `docs/backlog/stories/T-50.md` nor `T-51.md` exists. *Reproduction today:*
  `T-50.md` is written with `# injected` as a heading in its frontmatter.

Every criterion is **mechanical** (oracle partition, Contract C-7).

## Contract

<!-- Written by the Lead PO BEFORE RED, and AMENDABLE BY RED IN PLACE with a
     reason - GREEN then builds what the amended block says. -->

**Writes:** `.claude/hooks/lib.sh`, `scripts/new-story.sh`, `scripts/gates.sh`, `scripts/phase.sh`, `.claude/tests/lib.test.sh`, `.claude/tests/new-story.test.sh`, `.claude/tests/phase.test.sh`, `.claude/tests/gates.test.sh`

Every path classifies as `harness` (`bash scripts/classify.sh` at PLANNED),
so the phase lock freezes none of them; the role boundary is honoured by the
agents: RED writes the four test files only, GREEN writes the four scripts
only. No existing export changes signature; `valid_story_id` is new. Its
three call sites are listed in C-3..C-5 so GREEN adds all of them.

**RED may amend any block below in place, with a reason; GREEN builds what
the amended block says.**

- **C-1 `valid_story_id <id>`, in `.claude/hooks/lib.sh`**, beside the
  frontmatter readers (`frontmatter_value`, `:1363`). Returns 0 when `<id>`
  matches the grammar in Context, 1 otherwise; prints nothing; spawns no
  process (lib.sh is the hook's hot path, HARNESS-025) and uses nothing
  bash 3.2 lacks (`rules.md`: macOS ships 3.2 - no `[[ =~ ]]` with an
  inline pattern; parameter expansion and `case` are enough:
  `[ -n "$1" ] && [ -z "${1//[A-Za-z0-9._-]/}" ]` plus a
  `case "$1" in [A-Za-z0-9]*) ;; *) return 1 ;; esac`). The grammar as one
  sentence, which is also the refusal text every script prints to stderr,
  byte for byte with the offending id substituted:

      error: story id '<id>' is not one path component: an id is letters, digits, '.', '_' or '-', and starts with a letter or digit

  Newlines inside `<id>` are printed as-is (the message is for a human).
  *Amended in RED (test-developer, 2026-10-09):* this said "the tests match
  the fixed prefix and the suffix, not the id". They match the **whole
  sentence with the id substituted as-is**, newline included - AC-1..AC-3
  each say the message *names that id*, and a prefix-and-suffix match is
  satisfied by a message naming a different one. `new-story.test.sh` checks
  containment in stderr; `phase.test.sh` containment in stderr;
  `gates.test.sh` an exact whole line of the merged output, once. So: one
  `printf`, `%s` for the id, no quoting or escaping of it.
- **C-2 Exit statuses.** `new-story.sh` exits **2** (its usage status);
  `gates.sh` exits **2** (its unknown-option status, `:89`); `phase.sh`
  exits **1** through `die` (`:25`, the status every other refusal there
  uses). Pinned so the tests pin them.
- **C-3 `scripts/new-story.sh`.** Gains `. "$ROOT/.claude/hooks/lib.sh"`
  after `ROOT` is set (`phase.sh:23` and `gates.sh:69` do the same), the id
  check right after the usage check at `:7`, and the title check beside it:
  `case "$title" in *$'\n'*|*$'\r'*) … exit 2 ;; esac` with the message
  `error: the title must be one line`. **Consequence for RED:**
  `new-story.test.sh:26-27` copies only the script into its fixture, so a
  script that sources `lib.sh` fails there with "No such file"; RED changes
  that fixture to copy `.claude/hooks/lib.sh` too (or to use
  `make_project_fixture`), which keeps every existing assertion in that
  suite meaningful. Sourcing lib.sh is side-effect free beyond
  `set_harness_root "${CLAUDE_PROJECT_DIR:-$PWD}"` (`lib.sh:30`), which
  reads nothing.
- **C-4 `scripts/gates.sh` - line-count neutral above line 580.**
  `.claude/tests/sigpipe.test.sh:567-568` pin `scripts/gates.sh:74` and
  `scripts/gates.sh:580` **by line number** (C-5 freshness: "all twelve
  status-discarded lines are still where this suite says they are"), and
  test files are frozen in GREEN. So both checks are written **on existing
  lines**, adding no line before 580: `:87` becomes
  `--story) shift; STORY="${1:-}"; valid_story_id "$STORY" || { printf … >&2; exit 2; } ;;`
  and `:331` (`if [ -z "$STORY" ]; then load_state; STORY="$STORY_ID"; fi`)
  gains, on the same line, `; [ -z "$STORY" ] || valid_story_id "$STORY" || { printf … >&2; exit 2; }`
  so an id arriving from a hand-edited `current-story.env` is refused too
  (`phase.sh` is the only writer and will now validate, but the state file is
  evidence and is checked where it is read). GATES runs
  `bash scripts/selftest.sh sigpipe` to confirm the pins still hold; a
  refactor that moves line 580 is a return to RED to move the pin, not a
  reason to touch the test in GREEN.
- **C-5 `scripts/phase.sh`.** In `cmd_set`, after the usage check at `:154`
  and before `local file="$STORIES/$id.md"` at `:158`:
  `valid_story_id "$id" || die "story id '$id' is not one path component: …"`
  (`die` prefixes `error: `, so the printed line equals C-1's text). No
  suite pins phase.sh line numbers.
- **C-6 Where the tests go.** AC-5 in `lib.test.sh` (a table loop over the
  two lists, one `assert_eq` per id on the return status, plus the three
  `grep -c` pins). AC-1 and AC-6 in `new-story.test.sh`; AC-2 and AC-4 in
  `phase.test.sh` (it already drives `new_story` and `phase set`); AC-3 in
  `gates.test.sh` beside the existing `--story T-1` case (`:1458-1467`).
  No new suite. *Amended in RED (test-developer, 2026-10-09), as HARNESS-044
  and -045 did:* this said "so `floors.conf` is untouched". A floor below a
  suite's executed count cannot notice assertions disappearing, so
  `floors.conf` and the hand-copied table in `selftest.test.sh` are raised to
  the executed counts: lib 250 -> 281, new-story 43 -> 53, phase 33 -> 58
  (it was 45 on arrival), gates 498 -> 507. Test files, written in RED. Also
  added beyond the AC lists, under C-4 (which asks GREEN for a second
  `gates.sh` call site no AC tests): a `current-story.env` holding
  `STORY_ID=../EXIST` makes `gates.sh` exit 2 with the message and run no
  gate - law 1 wants a failing test in front of that line too. The `..`-shaped ids in AC-1
  to AC-3 resolve **inside** the fixture (`docs/backlog/`), never above
  `mktemp`'s directory, so a red run on today's code writes nothing outside
  the fixture the trap removes.
- **C-7 Oracle partition.** Every criterion is **mechanical**: exact exit
  status, exact message, exact file existence. The grammar is **settled**
  (Context): RED reads it out and does not widen or narrow it; an id it
  believes should be admitted is an amendment to this block with a reason.
- **C-8 Tree-wide guards.** `check-grep-count.sh` refuses a printing
  `grep -c` fallback; AC-5's `grep -c` pins are assignments compared with
  `assert_eq`, the shape the guard accepts. GATES runs
  `bash scripts/ci-local.sh`.
- **C-9 Test-only dependencies.** None.

## Deferred verifications

<!-- One block per entry; the owning phase pastes the result in. -->

- **DV-1 (defect put back - the story's central claim). Owner: GATES.**
  With `valid_story_id` made to accept everything through
  `bash scripts/mutate.sh .claude/hooks/lib.sh '<sed expression inserting
  "return 0" as its first statement>' -- bash scripts/selftest.sh lib`,
  AC-5's refusal rows **must** go red (RED predicts the count: one per id in
  the refused list) and its accepted rows stay green; then, with the same
  mutation and `-- bash scripts/selftest.sh new-story`, AC-1's eight cases go
  red while AC-6 stays green (the title check is independent of the id
  check). Restore verified after each. RED cannot run this: there is no
  function to neuter. Paste both mutate.sh outputs and the red assertion
  names here, as fenced blocks.

  **Result (GATES, 2026-10-10, orchestrator on fable):** both predicted
  sets, exactly. (a) `lib`: the 17 refused rows red, the 11 accepted rows
  and the three call pins green. (b) `new-story`: AC-1's 8 red, AC-6's
  two title checks green (independent of the id check). Each restore
  verified; `--check` clean afterwards.

```
##### (a) lib
=== mutate: .claude/hooks/lib.sh (1 line(s) changed by s/^  \[ -n "\$1" \] || return 1$/  return 0/) ===
=== mutate: running bash scripts/selftest.sh lib ===
    FAIL HARNESS-046 AC-5: valid_story_id refuses ../OUTSIDE, silently
    FAIL HARNESS-046 AC-5: valid_story_id refuses a/b, silently
    FAIL HARNESS-046 AC-5: valid_story_id refuses a\\b, silently
    FAIL HARNESS-046 AC-5: valid_story_id refuses .., silently
    FAIL HARNESS-046 AC-5: valid_story_id refuses .x, silently
    FAIL HARNESS-046 AC-5: valid_story_id refuses -x, silently
    FAIL HARNESS-046 AC-5: valid_story_id refuses a\ b, silently
    FAIL HARNESS-046 AC-5: valid_story_id refuses $'A\nB', silently
    FAIL HARNESS-046 AC-5: valid_story_id refuses '', silently
    FAIL HARNESS-046 AC-5: valid_story_id refuses $'a\tb', silently
    FAIL HARNESS-046 AC-5: valid_story_id refuses $'a\rb', silently
    FAIL HARNESS-046 AC-5: valid_story_id refuses a\;b, silently
    FAIL HARNESS-046 AC-5: valid_story_id refuses a\$b, silently
    FAIL HARNESS-046 AC-5: valid_story_id refuses _x, silently
    FAIL HARNESS-046 AC-5: valid_story_id refuses x/, silently
    FAIL HARNESS-046 AC-5: valid_story_id refuses a:b, silently
    FAIL HARNESS-046 AC-5: valid_story_id refuses a\*b, silently
lib: 264 passed, 17 failed
FAIL lib  did 264 units of work, below the floor of 281 in .claude/tests/floors.conf
1 of 1 harness suite(s) FAILED.
=== mutate: command exited 1; restored (verified byte-for-byte against /d/agentic-dev-harness/.claude/state/mutations/.claude_hooks_lib.sh.20261010T054218Z.1643.bak) ===
##### (b) new-story
=== mutate: .claude/hooks/lib.sh (1 line(s) changed by s/^  \[ -n "\$1" \] || return 1$/  return 0/) ===
=== mutate: running bash scripts/selftest.sh new-story ===
    FAIL HARNESS-046 AC-1: new-story.sh ../OUTSIDE exits 2, prints the grammar message naming it, and writes nothing
    FAIL HARNESS-046 AC-1: new-story.sh a/b exits 2, prints the grammar message naming it, and writes nothing
    FAIL HARNESS-046 AC-1: new-story.sh a\\b exits 2, prints the grammar message naming it, and writes nothing
    FAIL HARNESS-046 AC-1: new-story.sh .. exits 2, prints the grammar message naming it, and writes nothing
    FAIL HARNESS-046 AC-1: new-story.sh .x exits 2, prints the grammar message naming it, and writes nothing
    FAIL HARNESS-046 AC-1: new-story.sh -x exits 2, prints the grammar message naming it, and writes nothing
    FAIL HARNESS-046 AC-1: new-story.sh a\ b exits 2, prints the grammar message naming it, and writes nothing
    FAIL HARNESS-046 AC-1: new-story.sh $'A\nB' exits 2, prints the grammar message naming it, and writes nothing
new-story: 45 passed, 8 failed
FAIL new-story  did 45 units of work, below the floor of 53 in .claude/tests/floors.conf
1 of 1 harness suite(s) FAILED.
=== mutate: command exited 1; restored (verified byte-for-byte against /d/agentic-dev-harness/.claude/state/mutations/.claude_hooks_lib.sh.20261010T054322Z.4686.bak) ===
mutate: no stranded mutation; nothing of a previous run is in the tree.
```

## Out of scope

- Validating `epic` or `type` arguments to `new-story.sh`, or the id inside
  an existing story's frontmatter (`check-boundaries.sh` owns frontmatter).
- `phase.sh set`'s other behaviours the audit noted: `guard_transition`
  skipping PLANNED/DONE, `gates.sh` failing open when `branch:` is absent.
  Both are documented design; neither is a path question.
- Restricting ids to the `PREFIX-NUMBER` shape. `T-A`, `T-M` and `K-2` are
  in the tests today, and the audit's defect is the path, not the style.
- Where the stories directory is (`docs/backlog/stories/` stays fixed).
- `.claude/settings.json` allow rules for the three scripts, and any
  observation of Claude Code's permission matcher.
- The other two leads: HARNESS-044, HARNESS-045.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

<!-- Filled by the Test Developer during RED: which tests, at which level,
     and which AC each one covers. -->

All four are the harness's own bash suites, run by `bash scripts/selftest.sh
<suite>`; every behavioural case runs in a `make_project_fixture` (or, for
`new-story`, the suite's own `$WORK`) temp directory, and every `..`-shaped id
resolves inside it (C-6). Every criterion is mechanical (C-7): exit status,
exact message, file existence / `cmp`.

| Suite | Block | Level | AC | Assertions |
|---|---|---|---|---|
| `lib.test.sh` | `HARNESS-046 AC-5` | unit (function sourced) | AC-5 | 11 accepted ids -> `0\|` ; 17 refused ids -> `1\|` ; 3 call pins |
| `new-story.test.sh` | `HARNESS-046 AC-1` | script, fixture | AC-1 | 8, one compound per id |
| `new-story.test.sh` | `HARNESS-046 AC-6` | script, fixture | AC-6 | 2, one compound per title |
| `phase.test.sh` | `HARNESS-046 AC-2` | script, own fixture `$P46` | AC-2 | precondition + 4 |
| `phase.test.sh` | `HARNESS-046 AC-4` | script, own fixture `$P46` | AC-4 | 8, one compound per id |
| `gates.test.sh` | `HARNESS-046 AC-3` | script, own fixture `$G46` | AC-3 + C-4 | 5 (`--story`) + 4 (state file) |

AC-4's second half ("the existing new-story, phase, gates, plan, boundaries
and worktree suites stay green") is those suites themselves; nothing new.
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

Written by the test-developer (opus, no override), 2026-10-09. Nothing
committed; phase still RED.

### Commands

    bash scripts/selftest.sh lib
    bash scripts/selftest.sh new-story
    bash scripts/selftest.sh phase
    bash scripts/selftest.sh gates        # several minutes; the new block is ~line 1569
    bash scripts/selftest.sh selftest     # the floor table; green now

### Results, before -> after (this tree, scripts and lib.sh untouched, local Windows/Git Bash)

    lib:        250 passed, 0 failed  ->  250 passed, 31 failed   (281 executed)
    new-story:   43 passed, 0 failed  ->   43 passed, 10 failed   (53 executed)
    phase:       45 passed, 0 failed  ->   54 passed,  4 failed   (58 executed)
    gates:      498 passed, 0 failed  ->  498 passed,  9 failed   (507 executed)
    selftest:   268 passed, 0 failed  ->  268 passed,  0 failed
    check-sigpipe: scanned 49 shell file(s), 45 with pipefail, 0 finding(s)
    check-grep-count: scanned 49 shell file(s), 0 finding(s)
    gates.sh --fast: rc=0, "All required gates passed (0 ran, 5 unconfigured, 0 known)"
      (this repo's project.conf is BOOTSTRAPPED=no; its judge is selftest, above)

Every pre-existing assertion in the four suites still passes. `selftest.sh`
also reports each of the four below its new floor ("did 43 units of work,
below the floor of 53"): the floor reads the PASSED count, so a RED suite sits
under it until GREEN lands - the same state HARNESS-045's RED commit left lib in.

### The red, and why it is the right red

lib (AC-5) - `valid_story_id` does not exist; each row captures status and
both streams, so the suite reports every row rather than aborting:

```
    FAIL HARNESS-046 AC-5: valid_story_id accepts 'HARNESS-046', silently
         expected: 0|
         actual:   127|.claude/tests/lib.test.sh: line 971: valid_story_id: command not found
  ... (all 11 accepted rows and all 17 refused rows the same, "1|" expected for refused)
    FAIL HARNESS-046 AC-5: valid_story_id refuses $'a\rb', silently
         expected: 1|
         actual:   127|.claude/tests/lib.test.sh: line 971: valid_story_id: command not found
    FAIL HARNESS-046 AC-5: scripts/new-story.sh calls valid_story_id on a non-comment line
         expected: calls
         actual:   does not call (0 lines)
    FAIL HARNESS-046 AC-5: scripts/gates.sh calls valid_story_id on a non-comment line
    FAIL HARNESS-046 AC-5: scripts/phase.sh calls valid_story_id on a non-comment line
lib: 250 passed, 31 failed
```

new-story (AC-1, AC-6) - the defect itself, reproduced: exit 0, no message,
files written (`../OUTSIDE` into `docs/backlog/`, five others into `stories/`):

```
    FAIL HARNESS-046 AC-1: new-story.sh ../OUTSIDE exits 2, prints the grammar message naming it, and writes nothing
         expected: 2|message|stories/ unchanged|backlog/ unchanged|no OUTSIDE.md
         actual:   0|no grammar message|stories/ unchanged|backlog/ CHANGED|OUTSIDE.md exists
    FAIL ... a/b      actual: 0|no grammar message|stories/ unchanged|backlog/ unchanged|no OUTSIDE.md
    FAIL ... a\\b     actual: 0|no grammar message|stories/ unchanged|backlog/ unchanged|no OUTSIDE.md
    FAIL ... ..       actual: 0|no grammar message|stories/ CHANGED|backlog/ unchanged|no OUTSIDE.md
    FAIL ... .x       actual: 0|no grammar message|stories/ CHANGED|backlog/ unchanged|no OUTSIDE.md
    FAIL ... -x       actual: 0|no grammar message|stories/ CHANGED|backlog/ unchanged|no OUTSIDE.md
    FAIL ... a\ b     actual: 0|no grammar message|stories/ CHANGED|backlog/ unchanged|no OUTSIDE.md
    FAIL ... $'A\nB'  actual: 0|no grammar message|stories/ CHANGED|backlog/ unchanged|no OUTSIDE.md
    FAIL HARNESS-046 AC-6: new-story.sh T-50 $'probe\n\n# injected' exits 2, says the title must be one line, and writes no T-50.md
         expected: 2|one-line|no file
         actual:   0|no one-line message|T-50.md written
    FAIL HARNESS-046 AC-6: new-story.sh T-51 $'a\rb' exits 2, says the title must be one line, and writes no T-51.md
         expected: 2|one-line|no file
         actual:   0|no one-line message|T-51.md written
new-story: 43 passed, 10 failed
```

(`a/b` and `a\b` write nothing today only because `stories/a` does not exist;
the script still exits 0 with two "No such file" lines. On Windows `A\nB`
lands as `A<U+F00A>B.md`.)

phase (AC-2) - exit 0, EXIST.md rewritten, `STORY_ID=../EXIST` persisted:

```
    FAIL HARNESS-046 AC-2: phase.sh set ../EXIST PLANNED exits 1
         expected: 1
         actual:   0
    FAIL HARNESS-046 AC-2: and prints the grammar message naming ../EXIST on stderr
         expected to contain: error: story id '../EXIST' is not one path component: an id is letters, digits, '.', '_' or '-', and starts with a letter or digit
         actual:
    FAIL HARNESS-046 AC-2: docs/backlog/EXIST.md is byte-for-byte unchanged
         expected: unchanged
         actual:   changed
    FAIL HARNESS-046 AC-2: and current-story.env still does not exist
         expected: absent
         actual:   present: STORY_ID=../EXIST
phase: 54 passed, 4 failed
```

gates (AC-3, C-4) - the gate runs and records into EXIST.md, both ways in:

```
    FAIL HARNESS-046 AC-3: gates.sh --story ../EXIST exits 2                         expected 2, actual 0
    FAIL HARNESS-046 AC-3: and prints the grammar message naming ../EXIST, once      expected 1, actual 0
    FAIL HARNESS-046 AC-3: no line is the gate's output 'ran' (the gate did not run) expected 0, actual 1
    FAIL HARNESS-046 AC-3: and no gate header was printed                            expected 0, actual 1
    FAIL HARNESS-046 AC-3: docs/backlog/EXIST.md is byte-for-byte unchanged          expected unchanged, actual changed
    FAIL HARNESS-046 C-4: with STORY_ID=../EXIST in current-story.env, gates.sh exits 2   expected 2, actual 0
    FAIL HARNESS-046 C-4: and prints the grammar message naming ../EXIST, once      expected 1, actual 0
    FAIL HARNESS-046 C-4: and runs no gate                                           expected 0, actual 1
    FAIL HARNESS-046 C-4: and docs/backlog/EXIST.md is byte-for-byte unchanged       expected unchanged, actual changed
gates: 498 passed, 9 failed
```

### Files touched, and what each new assertion covers

- `.claude/tests/lib.test.sh` - block `HARNESS-046 AC-5` before `summary "lib"`.
  `h46_vsid <id>` prints `<status>|<stdout+stderr>`.
  - 11 rows "accepts '<id>', silently" -> `0|`: AC-4's eight (`HARNESS-046
    WORLD-014 T-1 T-A K-2 MT-071 a.b_c-1 x`) plus `9`, `x-`, `a..b`.
  - 17 rows "refuses <%q id>, silently" -> `1|`: AC-1's eight, AC-5's five
    (`''`, tab, CR, `a;b`, `a$b`), plus `_x`, `x/`, `a:b`, `a*b`. The extras
    read the settled grammar out; they do not widen or narrow it (C-7).
  - 3 pins "scripts/<s> calls valid_story_id on a non-comment line":
    `grep -c '^[^#]*valid_story_id'` >= 1, assigned then compared (C-8). A
    mention in a comment does not count.
- `.claude/tests/new-story.test.sh` -
  - **fixture change**: `$WORK/.claude/hooks/` is created and the real
    `.claude/hooks/lib.sh` copied into it beside the script (not
    `make_project_fixture`; the smallest change). All 43 pre-existing
    assertions still pass with it.
  - block `HARNESS-046 AC-1`: 8 rows, one per id, each asserting
    `rc|message|stories/ listing|backlog/ listing|OUTSIDE.md` =
    `2|message|stories/ unchanged|backlog/ unchanged|no OUTSIDE.md`. A
    red `../OUTSIDE` row's file is removed after the row so it cannot leak
    into later rows.
  - block `HARNESS-046 AC-6`: 2 rows, `rc|one-line|file` = `2|one-line|no file`.
- `.claude/tests/phase.test.sh` - a second fixture `$P46` (own trap entry),
  before `summary "phase"`.
  - `HARNESS-046 AC-2`: precondition (no state file), exit 1, message on
    stderr (containment), EXIST.md unchanged (`cmp`), no `current-story.env`.
  - `HARNESS-046 AC-4`: 8 rows, `new-story rc|phase set rc|file` = `0|0|file`.
- `.claude/tests/gates.test.sh` - a third fixture `$G46` after the HARNESS-026
  block (~line 1569), trap extended to it, removed at the block's end.
  - `HARNESS-046 AC-3` (5): `--story ../EXIST` exit 2; the message as one
    exact whole line, once (`count_line`); no whole line `ran`; no
    `^=== gate: ` header; EXIST.md unchanged (`cmp`).
  - `HARNESS-046 C-4` (4): same, with `STORY_ID=../EXIST` in
    `current-story.env` and no `--story`.
- `.claude/tests/floors.conf`, `.claude/tests/selftest.test.sh` - floors (below).
- this story: Contract C-1 and C-6 amended in place; `## Test plan`; this handoff.

### Exactly what GREEN must produce

- **`valid_story_id <id>`** in `.claude/hooks/lib.sh`, a shell function
  callable after `. lib.sh`: returns 0 / 1, prints NOTHING on stdout or
  stderr (the rows capture `2>&1`). The C-1 suggestion
  (`[ -n "$1" ] && [ -z "${1//[A-Za-z0-9._-]/}" ]` plus the `case`) passes all
  28 rows - measured outside the framework, below.
- **The message**, byte for byte, `%s` = the id as given (no `%q`, no escaping):

      error: story id '<id>' is not one path component: an id is letters, digits, '.', '_' or '-', and starts with a letter or digit

  new-story and phase: contained in stderr. gates: an exact whole line of
  stdout+stderr, exactly once - so print it once, on its own line.
- **Statuses**: new-story **2**, gates **2** (both `--story` and the
  state-file path), phase **1**.
- **Title**: stderr contains `the title must be one line` (C-3's
  `error: the title must be one line` satisfies it); exit 2; no file. The
  tests only need a `\n` or `\r` refused; T-50 and T-51 are valid ids, so this
  check must not depend on the id check.
- **Nothing written** on any refusal: no story file, no `docs/backlog/` entry,
  no `current-story.env` (phase), no `## Gate results` and no gate run (gates).
- **Each script calls `valid_story_id` on a line that does not start with or
  sit after a `#`.**

Not constrained: where in lib.sh the function sits, its internals, the order
of the id and title checks in new-story.sh, the exact title message beyond the
substring, anything on stdout for the refusals.

### Passed on arrival, and what earns them

- `phase.test.sh` AC-2 precondition (no state file) - a fixture fact.
- `phase.test.sh` AC-4's eight rows - the over-refusal controls. Earned by a
  probe narrowing new-story.sh to refuse any id with a `.`; exactly the
  `a.b_c-1` row went red, the restore verified:

```
  11 + case "$id" in *.*) exit 2 ;; esac; file="$ROOT/docs/backlog/stories/$id.md"
=== mutate: running bash .claude/tests/phase.test.sh ===
    FAIL HARNESS-046 AC-2: phase.sh set ../EXIST PLANNED exits 1           (the four AC-2 rows, red as in RED)
    ...
    FAIL HARNESS-046 AC-4: new-story.sh a.b_c-1 then phase.sh set a.b_c-1 PLANNED both exit 0 and create docs/backlog/stories/a.b_c-1.md
         expected: 0|0|file
         actual:   2|1|no file
phase: 53 passed, 5 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /d/agentic-dev-harness/.claude/state/mutations/scripts_new-story.sh.20261010T043950Z.3959.bak) ===
  11: file="$ROOT/docs/backlog/stories/$id.md"
```

  AC-5's accepted rows are red today (function undefined, status 127), not
  green; they become controls once the function exists.

### Controls: expected values (measured OUTSIDE the suite, local)

The AC-5 block was run in a scratch script against candidate functions, not
the shipped one - GREEN confirms against lib.sh.

| Candidate `valid_story_id` | accepted rows (11) green | refused rows (17) red | call pins |
|---|---|---|---|
| C-1's suggestion (expansion + `case`) | 11 | 0 red (17 green) | red until the scripts call it |
| `return 0` (DV-1's mutant) | 11 | **17** | - |
| expansion only, no first-char `case` | 11 | **4**: `..`, `.x`, `-x`, `_x` | - |
| first-char `case` only, no expansion | 11 | **11**: `a/b`, `a\b`, `a b`, `A\nB`, tab, CR, `a;b`, `a$b`, `x/`, `a:b`, `a*b` | - |

So each half of the grammar is pinned by its own rows.

### DV-1 predicted red sets (GATES runs them)

- (a) `mutate.sh .claude/hooks/lib.sh '<return 0 first>' -- bash scripts/selftest.sh lib`:
  **17 red**, exactly the 17 "valid_story_id refuses ..." rows; the 11 accepts
  and the 3 call pins green. `lib: 264 passed, 17 failed`.
- (b) same mutation, `-- bash scripts/selftest.sh new-story`: **8 red**,
  exactly the 8 `HARNESS-046 AC-1` rows (each `0|no grammar message|...`, or
  for `a/b` / `a\b` the write fails but the status is not 2); the 2 AC-6 rows
  green. `new-story: 45 passed, 8 failed`.

### Floors (C-6 amended)

lib 250 -> 281, new-story 43 -> 53, phase 33 -> 58, gates 498 -> 507, in
`floors.conf` (with a note at its foot) and in `selftest.test.sh`'s COUNTS
table and its named `lib is floored at its 281` assertion. selftest green.

### Things that change the approach

- **Cygwin bash 5.3 drops the CR from `$'a\rb'` inside a compound array
  assignment** `( ... )`: the AC-5 row arrived as `ab` and would have asserted
  nothing. The table is a `for` list for that reason (comment beside it). Do
  not build id lists as arrays in the scripts either if a CR matters.
- gates.sh: the C-4 line-count constraint (no new line before 580) stands;
  both call sites must be on the existing `:87` and `:331` lines. The test
  for the state-file path exists because C-4 asks for that code.
- `[A-Za-z]` in a bracket expression is locale-dependent on bash 3.2 (no
  `globasciiranges`); not tested (no non-ASCII row - the grammar says
  "letters" and the ids in use are ASCII). An observation, not a demand: no
  test here would notice either way.

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

    run:    2026-10-10T05:43:51Z
    commit: 33ab19f
    tree:   78d83d0102b9e7c684ab0a338d74ba6fd7afe5c7
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

**GATES → REVIEW (2026-10-10, orchestrator on fable).** Full self-test, run
detached while the story was at GATES, alone in this worktree and on the host
(`ps`: no other `selftest.sh` at start or end):

    $ bash scripts/selftest.sh
    assertion floors: all 26 suite(s) met their declared floor (3139 assertions executed, 2930 declared).
    26 harness suite(s) passed.
    exit=0 duration=2477s

41 minutes. `gates.sh` lines 74 and 580 are byte-identical to before the
story (`cmp`), and the `sigpipe` suite that pins them passed within this run.
One behaviour change beyond the criteria, from C-4's prescribed line:
`gates.sh --story ""` is now refused (exit 2) instead of falling back to the
state file; nothing in the tree passes an empty `--story`.


### GREEN (feature-developer, 2026-10-10)

Resolved model: **Opus 5.5** (`claude-opus-5-5`), the `opus` the definition
declares; the dispatch gave no override. Tests untouched; nothing committed;
phase left at GREEN. The four scripts are staged.

`valid_story_id`, in `.claude/hooks/lib.sh` immediately above
`frontmatter_value`:

    valid_story_id() {
      [ -n "$1" ] || return 1
      [ -z "${1//[abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-]/}" ] || return 1
      case "$1" in
        [abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789]*) return 0 ;;
      esac
      return 1
    }

C-1's shape, with the letters and digits listed instead of `A-Za-z0-9`: a
range in a bracket expression follows the locale's collation on bash 3.2 (no
`globasciiranges`), so the explicit list is locale-proof at no cost. Measured
here (bash 5, which defaults `globasciiranges` on, so the range would also
have been fine on this machine): `é`, `aé`, `Ä`, `ß` refused and `x` accepted
under `LC_ALL` = `C`, `en_US.UTF-8` and `C.UTF-8`. No suite row covers it.

Call sites:

- `scripts/new-story.sh`: `. "$ROOT/.claude/hooks/lib.sh"` right after the
  usage check, then the id check (`printf` with `%s`, stderr, exit 2) and
  `case "$title" in *$'\n'*|*$'\r'*) echo 'error: the title must be one line' >&2; exit 2 ;; esac`.
  Both run before `file=` is computed.
- `scripts/phase.sh` `cmd_set`: one line after the `valid_phase` check,
  before `local file=`: `valid_story_id "$id" || die "story id '$id' is not one path component: …"` (exit 1).
- `scripts/gates.sh`: on the existing `--story)` line (`:87`) and appended to
  the existing `if [ -z "$STORY" ]; then load_state; …; fi` line (`:331`), as
  C-4 specifies. `lib.sh` is sourced at `:70`, before option parsing, so the
  `:87` call finds the function. Line count unchanged (1027); lines 74 and 580
  compared with `cmp` against a copy taken before the edit: identical.
  Side effect worth knowing: `--story ""` is now refused (exit 2) where it
  used to fall back to the state file; nothing in the tree passes it.

Controls from the handoff, confirmed against the shipped function (status|output):

    accepted: HARNESS-046=0| WORLD-014=0| T-1=0| T-A=0| K-2=0| MT-071=0| a.b_c-1=0| x=0| 9=0| x-=0| a..b=0|
    refused:  ../OUTSIDE=1| a/b=1| a\\b=1| ..=1| .x=1| -x=1| a\ b=1| $'A\nB'=1| ''=1| $'a\tb'=1| $'a\rb'=1|
              a\;b=1| a\$b=1| _x=1| x/=1| a:b=1| a\*b=1|

11 accepted, 17 refused, silent throughout - matching the handoff's row for
C-1's suggestion. No divergence.

Results (each through `bash scripts/selftest.sh <suite>`, floors checked):

    lib: 281 passed, 0 failed          floor 281 met
    new-story: 53 passed, 0 failed     floor 53 met
    phase: 58 passed, 0 failed         floor 58 met
    gates: 507 passed, 0 failed        floor 507 met
    sigpipe: 82 passed, 0 failed       (gates.sh:74 and :580 pins hold)
    plan: 248 passed, 0 failed
    boundaries: 113 passed, 0 failed
    worktree: 73 passed, 0 failed
    selftest: 268 passed, 0 failed
    check-sigpipe: scanned 49 shell file(s), 45 with pipefail, 0 finding(s)
    check-grep-count: scanned 49 shell file(s), 0 finding(s)
    gates.sh --fast: All required gates passed (0 ran, 5 unconfigured, 0 known).

DV-1 is GATES's and was not run here.


## Model guidance

Planned by `bash scripts/plan.sh write HARNESS-046` from `.claude/harness/models.conf`.
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
- RED: `test-developer` resolved **Opus 5.5** (`claude-opus-5-5`), as declared; no override in the dispatch. Amended C-1 (whole-message match) and C-6 (floors raised) in place. 2026-10-10.
- GREEN: `feature-developer` resolved **Opus 5.5** (`claude-opus-5-5`), as declared; no override in the dispatch. 2026-10-10.
- GATES: orchestrator on **Fable 5.1** ran DV-1 itself; no `feature-developer` dispatch (all gates unconfigured, nothing to fix). 2026-10-10.

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->

**DONE, 2026-10-10.** Merged in #128 (merge commit 2f1b98b), release 92. The
VERSION bump lands in this DONE commit. `phase.sh set DONE --force` was run on
`main`, overriding the branch check, as HARNESS-042 to 045 did. PR CI: `gates`
passed in 2m52s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/38030958962),
`boundaries` in 8s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/38030959062).
