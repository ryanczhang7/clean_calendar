# Mutation audit 2: what audit 1 could not reach - the new enforcement code, and the false-positive direction

## Scope

The second enforcement audit. The first is
`docs/wiki/audits/enforcement-mutants-2026-09-15.md`; this one takes its method
unchanged and covers the two things it could not: the code written **after** it
ran, and the direction it says plainly it skipped — mutants that make a check
**refuse something legitimate** rather than mutants that make it vacuous.

At commit `a30e0aa` ("Merge pull request #33 from
ryanczhang7/harness/discovery-sigpipe"), harness release **11 (2026-09-13)**, on
Windows 11 / Git Bash / GNU coreutils. Mutation runs executed 2026-09-13T17:23Z
to 2026-09-13T18:47Z UTC.

| File audited | Suite used as the oracle | Baseline |
|---|---|---|
| `scripts/refresh-harness.sh` (entirely new) | `.claude/tests/refresh.test.sh` | 28 |
| `.claude/hooks/phase-guard.sh` (the `NOREDIR` strip + five extractors) | `.claude/tests/phase-guard.test.sh` | 128 |
| `scripts/check-boundaries.sh` (story-claim lookup, 3h, 3i) | `.claude/tests/boundaries.test.sh` | 41 |
| `scripts/classify.sh` (new) | `.claude/tests/classify.test.sh` | 18 |
| `scripts/ci-local.sh` (workflow parsing, `${{ }}` handling) | `.claude/tests/ci-local.test.sh` | 15 |
| `scripts/doctor.sh` (CI block, discovery `set +o pipefail`) | `.claude/tests/doctor.test.sh` | 21 |

Full baseline, observed immediately before and again immediately after the
mutation work, both times by `bash scripts/selftest.sh`: **14 suites, 629
assertions, 0 failures** — lib 135, phase-guard 128, gates 74, boundaries 41,
mutate 39, profiles 37, refresh 28, gate-reminder 27, phase 24, new-story 22,
doctor 21, settings 20, classify 18, ci-local 15. The brief for this audit said
627; the measured figure is 629 and that is what every "N passed" below is
relative to.

Deliberately left out: `scripts/gates.sh`, `scripts/phase.sh`,
`.claude/hooks/lib.sh` and `scripts/mutate.sh` (audit 1's territory, unchanged in
substance), `scripts/new-story.sh`, `.claude/hooks/gate-reminder.sh`, the
workflows, and every agent/command/skill prompt. `.claude/harness/paths.conf`'s
new rules were checked by reading the suites that pin them rather than by
mutation — see *What was not checked*.

There is still no mutation tool for bash and the `mutation` gate in
`project.conf` is unconfigured. Every mutant below was applied with
`bash scripts/mutate.sh`, which backs the file up under
`.claude/state/mutations/`, applies the expression, runs the command, restores,
and verifies with `cmp`. **No `sed -i` was used on any file.**

## Decided

These are conclusions. A story citing this audit follows them without reopening
them. The numbers they rest on are in **Evidence** and are *not* settled —
verify them before depending on them.

**Read the live/regression distinction before anything else.** A surviving
mutant means the *test* did not notice a change; by itself it says nothing about
whether today's code is wrong. Audit 1's summary blurred this and had to be
corrected. Here the two are separated explicitly, and three findings are live:
the code is wrong now, measured on the unmutated hook or script.

### Live today

1. **`touch` with a separated option argument is refused by the phase lock.**
   Measured on the real, unmutated hook in RED: `touch -t 202601010000
   docs/notes.md` is denied on path `202601010000`, `touch -d 2026-01-01
   docs/notes.md` on `2026-01-01`, and `touch -r src/main.ts docs/a.md` on
   `src/main.ts` — the last being a pure *read* of the reference file. This is
   the tenth shape of the H1 family the `NOREDIR` work was written to close: the
   `rm|touch` extractor filters option *flags* (`grep -vE '^(rm|touch|-.*)$'`)
   and not option *arguments*, and a bare timestamp classifies as `source`.
   Live, unenforced rule. Rests on E-L1.
2. **`classify.sh` refuses the `manifest` category its own classifier returns.**
   `bash scripts/classify.sh Cargo.toml` prints `manifest`, but
   `--only manifest` and `--list manifest` both exit 2 with
   `classify: unknown category "manifest"`. The whitelist at `classify.sh:69`
   was not updated when `paths.conf` gained `manifest`, and it lists `outside`,
   which no phase permits and which the lock never reaches. The script's stated
   purpose is to be the one place a project's own guards ask "what is this
   file"; a project asking about its manifests gets a usage error. Live,
   unenforced rule. Rests on E-L2.
3. **3h's "names the phase that owns each entry" is satisfied by any mention of
   any phase word.** The predicate is one `grep -qE '\b(RED|GREEN|GATES|REVIEW|DONE)\b'`
   over the whole block, so the sentence the story template itself asks for —
   "why the phase that wants it cannot run it", e.g. "RED cannot run this" —
   discharges the obligation without naming an owner. The same shape applies to
   the waiver half (`\bwaived\b` anywhere, case-insensitively, including inside
   "not waived yet"). Live, but a weak rule rather than a broken one. Rests on
   E-L3.

### Regression exposure, ranked by what the un-noticed change would cost

4. **The phase lock's redirect strip is pinned against ONE redirect clause, not
   two.** Dropping the `g` flag from the `NOREDIR` `sed` leaves all 128
   phase-guard assertions green, and turns `rm f >/dev/null 2>&1`,
   `cp a b >/dev/null 2>&1`, `mv a b >/dev/null 2>&1`, `touch f >/dev/null 2>&1`
   and `rm -rf d 1>/dev/null 2>/dev/null` into denials on paths `2` and `2>`.
   Every redirect fixture in the suite uses exactly one clause; `>/dev/null 2>&1`
   is the commonest two-clause idiom in shell. This is the single most valuable
   test to add in this audit. Unprotected rule. Rests on E-P1.
5. **`refresh-harness.sh`'s report and its work are two independent lists, and
   nothing compares them.** Shortening the *replace* loop's directory list
   (line 118) so that `.claude/hooks` and `.claude/commands` are never copied
   leaves all 28 refresh assertions green — and the report still prints
   `REPLACED  .claude/hooks/`, because that line comes from a different loop
   (132-134). Measured directly: under the mutant the project's hook still holds
   `OLD HOOK` while the script says it replaced it. A refresh that silently does
   not update the phase-lock hook, and says it did, is the worst failure this
   script can have. Unprotected rule. Rests on E-R7 and E-R7b.
6. **`--dry-run` is not pinned as read-only.** `act()` can be made to `eval`
   unconditionally with every assertion green: the dry-run block asserts only
   that `.claude/agents/lead-po.md` is untouched, and that file is protected by
   a *different* guard (`if [ "$DRY" = 0 ]` at line 106). Under the mutant a dry
   run overwrites `.claude/settings.json`, `.claude/state/README.md`, the three
   `.claude/harness` files and every `scripts/*.sh`. Unprotected rule. Rests on
   E-R1.
7. **Three of `refresh-harness.sh`'s four refusals are untested in the direction
   that matters.** That a `DONE` story does **not** block a refresh (the normal
   state — `phase.sh set <id> DONE` leaves `PHASE=DONE` in the state file and
   only `phase.sh clear` removes it) is unasserted; that `--dry-run` works on a
   dirty tree is unasserted; that both `.claude/hooks` and `scripts` are
   required of an upstream checkout is unasserted. All three mutants survive.
   This is the false-positive direction on a script whose refusals are its
   entire safety story. Unprotected rules. Rests on E-R2, E-R3, E-R4.
8. **3i's manifest parsers are pinned by exactly two ecosystems' happy paths.**
   Four independent narrowings of `manifest_strip_dev` survive all 41 boundaries
   assertions: Cargo's target-specific `[target.'cfg(…)'.dev-dependencies]`, PEP
   735 `[dependency-groups]`, poetry's `[tool.poetry.group.*.dependencies]`, and
   the JSON brace-depth exit condition. Each narrowing turns a legitimate RED
   dev-dependency change into `changed '<file>' outside the test-dependency
   block` — a refusal of correct work, in the phase least able to argue with it.
   The suite's fixtures are one plain `[dev-dependencies]` and one flat
   `devDependencies`. Unprotected rules. Rests on E-B1 through E-B4.
9. **`manifest_norm`'s two normalisations are both deletable in silence.**
   Removing the trailing-comma rule and removing the blank-line rule each leave
   41/41 green, though the code comment says in terms what they are for:
   "Punctuation is not a dependency… a check that calls that a production change
   is a check people route around." Unprotected rules. Rests on E-B5, E-B6.
10. **Three assertions in the suites are theatre and should be named as such.**
    `boundaries.test.sh`'s "a lockfile is permitted unchecked" asserts the
    *absence* of one message, so a lockfile refused with a **different** message
    passes it — proved, not guessed, by E-B7. `ci-local.test.sh`'s "the base ref
    expression is resolved" is satisfied by the text of the *skip note*, because
    the fixture captures stderr — proved by E-C1. And `boundaries()` still
    discards `check-boundaries.sh`'s exit status, exactly as audit 1's C3
    described; HARNESS-003 has not landed, and every boundaries survivor here
    inherits that cause. Rests on E-B7, E-C1, E-X1.
11. **`doctor.sh`'s new CI block does not affect doctor's own verdict, and its
    required-command list is unpinned.** Deleting `missing=$((missing+ci_missing))`
    and dropping `gates.sh` from the want-list each leave 21/21 green; so does
    weakening the match from `scripts/<name>` to `<name>` anywhere in the
    workflow text. The block prints a complaint that changes nothing a caller
    can test. Unprotected rules. Rests on E-D1, E-D2, E-D3.
12. **`ci-local.sh`'s honest-skip branch, its folded-scalar handling and its
    gates-first ordering are unpinned**, and `classify.sh`'s
    `--exclude-standard` is unpinned — the last meaning `--list` could start
    handing callers `node_modules` with no test failing. Unprotected rules.
    Rests on E-C2, E-C3, E-C4, E-C5.
13. **Two survivors are probably not defects and should not be filed as ones**:
    the `tee` extractor reading `$MASKED` instead of `$NOREDIR` (its own
    character class already excludes `>` and `<`), and the `^/dev/` entry in the
    candidate filter (`to_rel` already drops paths outside the repository). Both
    were probed, neither was proved equivalent. Rests on E-P2, E-P3.
14. **The protected surface, which needs no story budget**: the `sed -i`, `cp`/`mv`
    and `rm`/`touch` extractors' use of `$NOREDIR`; the redirect extractor's use
    of `$MASKED`; `path_is_implausible`'s decline path; the whole 3i RED-manifest
    comparison and its `manifest` classification gate; 3h's optionality and its
    case-insensitive waiver; the story-claim lookup's existence check;
    `classify.sh`'s `--only` filter, `--others` and its usage errors;
    `ci-local.sh`'s `${{ }}` substitution, block-scalar indent rule and
    gates-first ordering *when gates.yml is dropped entirely*; `doctor.sh`'s
    discovery `set +o pipefail` and its `-gt 0` threshold; and
    `refresh-harness.sh`'s preservation copy, restore copy, KEPT report,
    `scripts/*.sh` copy and single-file list. Rests on E-Z.

## Evidence

Not settled. Each claim names the exact mutation, the exact command, and the
exact outcome.

**How to read "survived" and "died".** A mutant *died* if at least one assertion
in the named suite failed. It *survived* if every assertion passed. "Survived" is
a statement about **that** suite at **this** commit, never a claim that no test
could catch it.

Every mutation run took the form:

```
bash scripts/mutate.sh <FILE> '<SED-EXPRESSION>' -- bash .claude/tests/<name>.test.sh
```

except the four marked "probe", which substituted a throwaway probe script for
the suite (see *Spike code*).

**Totals, stated plainly.** **52 distinct mutants were applied and run. 29
survived, 23 died.** Beyond those 52: 3 re-runs of an already-applied mutant
against a probe instead of a suite, 5 expressions `mutate.sh` refused because
they changed nothing, and 1 malformed expression `sed` rejected outright —
**61 `mutate.sh` invocations**, of which 60 are in `.claude/state/mutations/log`
(timestamps `20260913T172353Z` onward; the malformed one died before logging).
That log is cumulative across sessions and holds 177 lines, 60 of them mine. All
55 applied-and-run lines report `restored (verified)`. In addition, **3 live
defects were found by reading and by probing the unmutated code, not by
mutation** (Decided 1-3), and **roughly 15 further mutants were enumerated and
never run** — listed under *What was not checked*.

**Two warnings about the tooling, learned the hard way here.** First, four of my
expressions matched nothing and `mutate.sh` correctly refused them; three were
escaping errors in a BRE (`^` mid-pattern is still an anchor to GNU sed, and a
literal `\.` in the source text needs `\\.` in the pattern, which in turn needs
`\\\.` as typed through this session's shell layer). A refusal means the
expression is wrong, not that the code is. Second, **a mutation is live while it
runs**: my first phase-guard probe was executed while the `PE` mutant was applied
and its results were discarded. Every "unmutated" measurement below was re-taken
with `git status --short` clean.

---

### Live defects (measured on unmutated code)

**E-L1. `touch` with a separated option argument is denied.**

- Claim, falsifiable: the real hook, in RED, denies commands that write nothing
  a phase forbids.
- Tool and command: a probe script (`probe2.sh`, `probe3.sh`) that sources
  `.claude/tests/_lib.sh`, builds `make_fixture`, sets `set_phase RED`, and
  drives the real hook through `guard_bash` — the suite's own driver. Run with a
  clean tree (`git status --short` showed only the untracked
  `agentic-dev-harness-brief.md`).
- Inputs, named exactly, and outcomes:

  | command | verdict | reported path |
  |---|---|---|
  | `touch -t 202601010000 docs/notes.md` | BLOCKED | `202601010000` |
  | `touch -d 2026-01-01 docs/notes.md` | BLOCKED | `2026-01-01` |
  | `touch -m -t 202601010000 docs/notes.md` | BLOCKED | `202601010000` |
  | `touch -r src/main.ts docs/a.md` | BLOCKED | `src/main.ts` |
  | `touch --date=2026-01-01 docs/a.md` | ALLOWED | — |
  | `touch -c docs/a.md` | ALLOWED | — |
  | `rm -f 2>/dev/null docs/a.md` | ALLOWED | — |

- Mechanism, confirmed separately: `bash scripts/classify.sh 202601010000
  2026-01-01` prints `source` for both, and `source` is forbidden in RED. The
  filter at `phase-guard.sh:110` is `grep -vE '^\s*$|^-|\*|^/dev/'`, which drops
  `-t` and `--date=…` but never the word after `-t`.
- Unrepresentative if: a project's `paths.conf` gives bare tokens a different
  category. On this repository's `paths.conf` they are `source`. The `--date=`
  form is safe only because the value is glued to the flag; `-d`, `-t` and `-r`
  are the separated forms and are the ones GNU `touch` documents first.

**E-L2. `classify.sh` rejects `manifest`.**

- Claim, falsifiable: every category `classify` can return is a category
  `classify.sh` will filter on.
- Commands and outcomes, exactly:
  - `bash scripts/classify.sh Cargo.toml package.json src/main.ts` →
    `manifest\tCargo.toml`, `manifest\tpackage.json`, `source\tsrc/main.ts`,
    exit 0.
  - `bash scripts/classify.sh --only manifest Cargo.toml` → `classify: unknown
    category "manifest"` + usage, **exit 2**.
  - `bash scripts/classify.sh --list manifest` → same, **exit 2**.
- The whitelist is `classify.sh:69`,
  `vendor|harness|docs|test|config|ignored|source|outside`. The usage text
  (line 41) lists seven categories and omits both `manifest` and `outside`.
- Corroboration by mutation (E-Z): removing `outside` from that whitelist leaves
  classify 18/18 green, so the list's completeness is pinned by nothing.
- Unrepresentative if: no caller ever asks for `manifest`. Nothing today does —
  which is why it went unnoticed — but the script's own header says a project's
  tree-scanning guards should ask this question rather than answer it, and
  `paths.conf` spends 20 lines on why `manifest` is its own category.

**E-L3. 3h's phase-owner check accepts any phase word anywhere in the block.**

- Claim, falsifiable: `## Deferred verifications` must name the phase that *owns*
  each entry.
- The predicate, whole, at `check-boundaries.sh:365`:
  `printf '%s\n' "$dv" | strip_comments | grep -qE '\b(RED|GREEN|GATES|REVIEW|DONE)\b'`.
- This is a code reading plus a one-line check of the predicate, not a fixture
  run: `printf 'RED cannot run this.\n' | grep -qE '\b(RED|GREEN|GATES|REVIEW|DONE)\b'`
  succeeds. The story template (`new-story.sh:90-111`) explicitly asks the author
  to write "why the phase that wants it cannot run it", so the commonest correct
  sentence in the block already discharges the obligation the next line claims to
  impose. The waiver half (line 372, `grep -qiE '\bwaived\b'`) has the same shape.
- Corroborated by mutation: narrowing the alternation to `(GATES)` alone leaves
  41/41 green (E-B8), because all three fixtures that reach this branch mention
  `GATES`; narrowing it to `(RED)` alone would also pass, because two of them
  mention `RED` in prose.
- What would make it unrepresentative: if `strip_comments` removed prose as well
  as HTML comments. It does not — it removes `<!-- … -->` only, which I confirmed
  by reading `check-boundaries.sh:38-52`.
- I did **not** construct a full fixture story that passes 3h while naming no
  owner. The predicate is one line and its behaviour is not in doubt, but the
  end-to-end case is unmeasured.

### `.claude/hooks/phase-guard.sh` — the `NOREDIR` strip

Baseline 128. Each run: `bash scripts/mutate.sh .claude/hooks/phase-guard.sh
'<EXPR>' -- bash .claude/tests/phase-guard.test.sh`.

**E-P1. The redirect strip can stop being global. SURVIVED.**

- File/line: `phase-guard.sh:102`,
  `NOREDIR="$(printf '%s' "$MASKED" | sed -E 's/[0-9]*>>?[[:space:]]*[^|&;()[:space:]]*//g')"`
- Expression: `102s@//g@//@`
- Outcome: **survived**, 128 passed / 0 failed.
- Why it survived: every redirect fixture in the suite carries exactly one
  redirect clause. Lines 149-156 (`cp … 2>/dev/null`, `cp … >/dev/null`,
  `mv … 2>/dev/null`, `rm … 2>/dev/null`, `touch … 2>/dev/null`,
  `tee … > /dev/null`, `sed -i … 2>/dev/null`) and 162-167 (the same shapes on
  real targets) are all single-clause. `>/dev/null 2>&1` appears nowhere.
- Blast radius, measured under the mutant with the probe
  (`bash scripts/mutate.sh … -- bash probe2.sh`):

  | command | unmutated | under `//g` → `//` |
  |---|---|---|
  | `rm docs/notes.md >/dev/null 2>&1` | ALLOWED | BLOCKED on `2` |
  | `cp docs/notes.md docs/copy.md >/dev/null 2>&1` | ALLOWED | BLOCKED on `2>` |
  | `mv docs/notes.md docs/copy.md >/dev/null 2>&1` | ALLOWED | BLOCKED on `2>` |
  | `touch docs/a.md >/dev/null 2>&1` | ALLOWED | BLOCKED on `2` |
  | `rm -rf docs/tmp 1>/dev/null 2>/dev/null` | ALLOWED | BLOCKED on `2` |
  | `cd docs && rm notes.md >/dev/null 2>&1` | ALLOWED | ALLOWED |

  The last row is worth keeping: `command_cwd` prefixes `docs/`, so the junk
  candidate becomes `docs/2`, which classifies as `docs` and is allowed in RED.
  A fixture that only ever tests the `cd`-prefixed form would not discriminate.
- Test that would kill it: any one of the five rows above, as
  `assert_allowed "$FIX" 'rm docs/notes.md >/dev/null 2>&1'`.
- Unrepresentative if: a project's `paths.conf` classifies a bare `2` as
  something RED may write. Here it is `source`.

**E-P2. The `tee` extractor may read `$MASKED`. SURVIVED — probably equivalent.**

- File/line: `phase-guard.sh:106`. Expression: `106s@NOREDIR@MASKED@`.
- Outcome: **survived**, 128 passed / 0 failed.
- Analysis rather than measurement: the `tee` rule's own character class is
  `[^|&;><()[:space:]]+`, which already excludes `>` and `<`, so a trailing
  redirect cannot be captured as the operand whether or not it was stripped
  first. The two differ only for a redirect placed *between* `tee` and its
  operand (`tee 2>/dev/null out.txt`), which I did not construct. Do not file
  this as a gap without first showing a distinguishing input.

**E-P3. The `^/dev/` candidate filter can be removed. SURVIVED — probably
equivalent.**

- File/line: `phase-guard.sh:110`. Expression: `110s@\^/dev/@^__nope__/@`.
- Outcome: **survived**, 128 passed / 0 failed.
- Probed under the mutant on two inputs, `echo x > /dev/null` and
  `cat src/main.ts > /dev/null`: both ALLOWED with and without the filter. The
  plausible reason is that `to_rel` returns empty for an absolute path outside
  the repository and `check_path` returns immediately on an empty `rel`, making
  the filter belt-and-braces. **Two inputs is not a proof of equivalence**, and I
  did not test `/dev/stdout`, `/dev/fd/3`, or a machine where the repository sits
  under `/dev`.

**Died — the protected half of the extractor work.**

| # | Rule | Line | Expression | Outcome |
|---|---|---|---|---|
| E-P4 | `cp`/`mv` extractor reads the stripped text | 108 | `108s@NOREDIR@MASKED@` | died, **6** (`allows: cp with stderr redirected`, `… stdout redirected`, `… an explicit fd`, `allows: mv with stderr redirected`, `blocks: a real cp, stderr redirected`, `blocks: a real mv, stderr redirected`) |
| E-P5 | `rm`/`touch` extractor reads the stripped text | 109 | `109s@NOREDIR@MASKED@` | died, 4 |
| E-P6 | `sed -i` extractor reads the stripped text | 107 | `107s@NOREDIR@MASKED@` | died, 1 |
| E-P7 | the redirect extractor reads the UNstripped text | 105 | `105s@MASKED@NOREDIR@` | died, **24** |
| E-P8 | an implausible candidate is declined, not judged | 147 | `147s@if path_is_implausible "$target"; then decline "$target"; continue; fi@true@` | died, 3 |

**E-P9. The newline fail-open can be deleted. SURVIVED.**

- File/line: `phase-guard.sh:151`,
  `case "$target" in *$'\n'*) continue ;; esac`. Expression:
  `151s@continue ;;@true ;;@`.
- Outcome: **survived**, 128 passed / 0 failed. A candidate that spans a newline
  would then be classified rather than skipped. I did not construct a command
  that produces one, so I cannot say what the resulting verdict would be — only
  that the branch is unasserted.

### `scripts/refresh-harness.sh`

Baseline 28. Each run: `bash scripts/mutate.sh scripts/refresh-harness.sh
'<EXPR>' -- bash .claude/tests/refresh.test.sh`.

**E-R1. `--dry-run` can be made to write. SURVIVED.**

- File/line: 76, `act() { [ "$DRY" = 1 ] || eval "$1"; }`
- Expression: `76s#\[ "$DRY" = 1 \] || ##`
- Outcome: **survived**, 28 passed / 0 failed.
- Why: `act` is used only for the single-file copies (line 140) and
  `scripts/*.sh` (line 149). The directory replacement is guarded independently
  by `if [ "$DRY" = 0 ]` at line 106, and the dry-run block's only
  changed-nothing assertion (`refresh.test.sh:131`) reads
  `.claude/agents/lead-po.md`, which that other guard protects. Under the mutant
  a dry run overwrites `.claude/settings.json`, `.claude/state/README.md`,
  `phases.conf`, `rules.md`, `VERSION` and every `scripts/*.sh` — none of which
  the dry-run block asserts on.
- Test that would kill it: after `--dry-run`, assert `settings.json` still reads
  `OLD settings` and `scripts/brand-new.sh` does not exist.

**E-R2. A `DONE` story can be made to block a refresh. SURVIVED.**

- File/line: 68, `""|DONE) ;;`. Expression: `68s#""|DONE)#"")#`
- Outcome: **survived**, 28 passed / 0 failed.
- Why it matters: the suite tests only that `PHASE=GATES` refuses
  (`refresh.test.sh:81-84`). `DONE` is the state a project is normally in
  between stories — `phase.sh` writes `PHASE=DONE` into
  `.claude/state/current-story.env` and only `phase.sh clear` removes the file
  — so this is the path a correct refresh takes, and it is unasserted. The
  script's own error message tells the user to "refresh between stories".
- Unprotected, in the false-positive direction.

**E-R3. `--dry-run` can be made to refuse on a dirty tree. SURVIVED.**

- File/line: 54, `if [ "$DRY" = 0 ] && git -C "$PROJ" rev-parse …`
- Expression: `54s#\[ "$DRY" = 0 \] && ##`. Outcome: **survived**, 28/0.
- The suite's dirty-tree case (line 71) is a real run, and its dry-run case
  (line 129) is on a clean tree, so no fixture exercises the combination. The
  commonest reason to run `--dry-run` is to look before committing.

**E-R4. The upstream-checkout validation can be made an `or`. SURVIVED.**

- File/line: 48, `[ -d "$UP/.claude/hooks" ] && [ -d "$UP/scripts" ]`
- Expression: `48s#\] && \[#] || [#`. Outcome: **survived**, 28/0.
- The only negative fixture is `/nowhere/at/all` (line 87), which fails both
  tests and so is refused under `&&` and `||` alike. Under the mutant a sibling
  repository that merely has a `scripts/` directory is accepted as a harness,
  and its `scripts/*.sh` are copied over the project's.

**E-R5. The `$KEEP` scratch directory need not be cleaned up. SURVIVED.**

- File/line: 129, `rm -rf "$KEEP"`. Expression: `129s#rm -rf "$KEEP"#true#`.
  Outcome: **survived**, 28/0. Leaves `.claude/.refresh-keep.<pid>` behind in the
  project. Cosmetic; listed for completeness, not for a story.

**E-R6. The "read the KEPT lines" closing warning can be switched off.
SURVIVED.**

- File/line: 178, `[ "$kept_any" = 1 ] && say …`. Expression:
  `178s#\[ "$kept_any" = 1 \]#false#`. Outcome: **survived**, 28/0. The suite
  asserts the per-file `KEPT` line (line 108) and never the summary.

**E-R7. Directories can be dropped from the replace loop. SURVIVED.**

- File/line: 118, `for d in agents commands skills hooks tests; do` (the loop
  that does `rm -rf` + `cp -r`).
- Expression: `118s#for d in agents commands skills hooks tests#for d in agents skills tests#`
- Outcome: **survived**, 28 passed / 0 failed.
- Why: `new_project` (`refresh.test.sh:44-63`) creates no `.claude/hooks` and no
  `.claude/commands` in the project, and the suite asserts post-refresh content
  for `agents`, `skills` and `tests` only. The strings `.claude/hooks` and
  `.claude/commands` appear in the suite as *upstream* fixture setup (line 29)
  and never as a project-side assertion.
- The same shortening applied to the **preserve** loop at line 108
  (`108s#for d in agents commands skills hooks tests#for d in agents skills tests#`)
  also survived, 28/0, for the same fixture reason.

**E-R7b. The report claims a replacement that did not happen. Measured.**

- Probe: a bespoke two-tree fixture (`r10check.sh`) whose upstream hook reads
  `UPSTREAM HOOK` and whose project hook reads `OLD HOOK`, run as
  `bash scripts/mutate.sh scripts/refresh-harness.sh '118s#…#…#' -- bash r10check.sh`.
- Unmutated: report line `  REPLACED  .claude/hooks/`; hook afterwards
  `UPSTREAM HOOK`; agent afterwards `UPSTREAM AGENT`.
- Under the mutant: report line **still** `  REPLACED  .claude/hooks/`; hook
  afterwards **`OLD HOOK`**; agent afterwards `UPSTREAM AGENT`.
- Cause, by reading: lines 132-134 are a second, independent loop over the same
  literal list, printing `REPLACED` for every directory upstream ships,
  regardless of what the copy loop did.
- Test that would kill both: assert the project's `.claude/hooks/phase-guard.sh`
  holds the upstream content after a refresh, and assert the report's
  `REPLACED` lines against the directories actually copied.

**Died — the protected half of `refresh-harness.sh`.**

| # | Rule | Line | Expression | Outcome |
|---|---|---|---|---|
| E-R8 | untracked files do not count as a dirty tree | 55 | `55s#\| grep -v '\^??'##` | died, 1 — and *incidentally*: the failing assertion is `and names the phase`, because writing the state file makes the tree untracked-dirty and the earlier refusal preempts. The property "an untracked file does not block a refresh" has no assertion of its own. |
| E-R9 | a project-owned file is preserved | 115 | `115s@cp "$dst/$rel" "$KEEP/$d/$rel"@true@` | died, 1 (`the project's own profile survives`) |
| E-R10 | the KEPT report names only unshipped files | 96 | `96s@\[ -e "$src/$rel" \] && continue@[ ! -e "$src/$rel" ] \&\& continue@` | died, 2 |
| E-R11 | `scripts/*.sh` are copied | 149 | `149s@act "cp@act "# cp@` | died, 1 |
| E-R12 | `.claude/settings.json` is in the single-file list | 138 | `138s@\.claude/settings\.json @@` | died, 1 |

### `scripts/check-boundaries.sh` — 3h, 3i and the story-claim lookup

Baseline 41. Each run: `bash scripts/mutate.sh scripts/check-boundaries.sh
'<EXPR>' -- bash .claude/tests/boundaries.test.sh`.

**E-B1. Cargo target-specific dev-dependencies. SURVIVED.**

- File/line: 416, `indev = (h ~ /(^|\.)dev-dependencies$/) ||`
- Expression: `416s@h ~ /(\^|\\\.)dev-dependencies$/@h == "dev-dependencies"@`
  (as typed through this session's shell; `mutate.sh` logged it as
  `416s@h ~ /(\^|\.)dev-dependencies$/@h == "dev-dependencies"@`)
- Outcome: **survived**, 41 passed / 0 failed.
- Why: every Cargo fixture in the suite (`boundaries.test.sh:475-551`) uses a
  plain `[dev-dependencies]`. Under the mutant a RED commit adding a
  `[target.'cfg(unix)'.dev-dependencies]` entry is refused with
  `changed 'Cargo.toml' outside the test-dependency block`.

**E-B2. PEP 735 dependency groups. SURVIVED.**

- File/line: 417. Expression: `417s@dependency-groups@__nope__@g`.
- Outcome: **survived**, 41/0. Under the mutant a `uv`/PEP 735 project's
  `[dependency-groups]` block is production, and every RED test-dependency there
  is refused. There is no `pyproject.toml` fixture in the suite at all.

**E-B3. Poetry dev/test groups. SURVIVED.**

- File/line: 418. Expression: `418s@poetry@__nope__@g`. Outcome: **survived**,
  41/0. Same consequence for `[tool.poetry.group.dev.dependencies]`.

**E-B4. The JSON brace-depth exit condition. SURVIVED.**

- File/line: 437, `if (depth <= 0) skip = 0`. Expression:
  `437s@depth <= 0@depth < 0@`. Outcome: **survived**, 41/0.
- Under the mutant the parser never leaves the `devDependencies` block, so
  **everything after it in the file is invisible to the comparison**. The suite's
  `package.json` fixture puts `devDependencies` last
  (`boundaries.test.sh:485-494`), so both sides lose the same trailing `}` and
  the comparison still matches. A real `package.json` with `scripts`, `pnpm` or
  `resolutions` after `devDependencies` would let a RED commit change them
  unchecked. This one is a *vacuity*, not a false positive.

**E-B5. The trailing-comma normalisation. SURVIVED.**

- File/line: 452, `manifest_norm() { sed -e 's/[[:space:]]*$//' -e 's/,$//' | grep -v '^[[:space:]]*$' || true; }`
- Expression: `452s@ -e 's/,$//'@@`. Outcome: **survived**, 41/0.
- Why: in the suite's fixtures, adding a devDependency never changes a comma on a
  line outside the stripped block. In a real `package.json` where `devDependencies`
  is appended after `dependencies`, the `}` closing `dependencies` gains a comma
  on one side only — the exact case the code comment names.

**E-B6. The blank-line normalisation. SURVIVED.**

- File/line: 452. Expression: `452s@ | grep -v .\^\[\[:space:\]\]\*\$.@@`.
  Outcome: **survived**, 41/0. Same class as E-B5, for the blank line a new TOML
  section introduces.

**E-B7. The lockfile assertion is theatre. Proved by a survivor.**

- File/line: 466, `*.lock|*-lock.json|*lock.yaml|*lock.yml) continue ;;`
- Expression: `466s@\*.lock|@@`. Outcome: **survived**, 41 passed / 0 failed.
- What the mutant does: `Cargo.lock` no longer matches the skip, falls through to
  `manifest_strip_dev`, matches neither `*.toml` nor `*.json`, and is reported
  with `does not know how to find the test-dependency block in that format`.
- Why nothing noticed: the assertion at `boundaries.test.sh:593-597` is
  `case "$out" in *"outside the test-dependency block"*) _bad … ;; *) _ok … ;;`
  — it checks for the *absence of one particular message*, so a lockfile refused
  with a **different** message passes "a lockfile is permitted unchecked".
- Test that would kill it: assert the `ok    RED touched only test dependencies`
  line, or assert the absence of any `FAIL` naming the lockfile.

**E-B8. 3h's phase alternation can be narrowed to one phase. SURVIVED.**

- File/line: 365. Expression: `365s@(RED|GREEN|GATES|REVIEW|DONE)@(GATES)@`.
  Outcome: **survived**, 41/0.
- Why: all three fixtures that reach this branch (`boundaries.test.sh:293`, `305`,
  `325`) write `Owner: GATES`. A story naming `GREEN` or `REVIEW` as the owner
  would, under the mutant, be refused with "names no phase". The same survival
  is what makes E-L3 visible: the alternation is doing no discriminating work.

**Died — the protected half.**

| # | Rule | Line | Expression | Outcome |
|---|---|---|---|---|
| E-B9 | only `manifest`-classified files are parsed | 460 | `460s@= "manifest"@!= "manifest"@` | died, **6** — and instructively: the story file itself is then parsed and reported `__UNPARSEABLE__` |
| E-B10 | the waiver match is case-insensitive | 372 | `372s@grep -qiE@grep -qE@` | died, 1 (the fixture writes `WAIVED`) |
| E-B11 | a `story/<ID>` branch whose story file is missing falls through to the lookup | 121 | `121s@\[ ! -f @[ -f @` | died, 2 |
| E-B12 | the before/after manifest comparison fires | 476 | `476s@\[ "$before" != "$after" \]@true@` | died, 2 |
| E-B13 | `## Deferred verifications` is optional | 364 | `364s@has_content@has_content \|\| true@` | died, 1 |

**E-X1. `boundaries()` still discards the exit status.** A code reading, not a
measurement: `.claude/tests/boundaries.test.sh:23-25` is
`( cd "$FIX" && GITHUB_HEAD_REF= PR_HEAD_SHA= bash scripts/check-boundaries.sh main 2>&1 )`
inside a command substitution, and `$?` is consulted nowhere in the suite. This
is audit 1's cluster C3 (HARNESS-003) unchanged at this commit, and it is the
common cause of E-B1 through E-B8: a rule that stops firing adds no text the
suite reads, and removes none it does.

### `scripts/ci-local.sh`

Baseline 15. **E-C1. The base-ref assertion is theatre. Proved by a died mutant.**

- Expression: `125s@cmd="${cmd//@cmd="${cmd//__nope__@` (breaks the
  `${{ github.base_ref }}` substitution). Outcome: **died, 1 failure** — and the
  one that failed is `no unresolved workflow expression survives`
  (`ci-local.test.sh:90-93`), **not** `the base ref expression is resolved`
  (line 89). That assertion passed under the mutant, because the fixture captures
  stderr (`2>&1`) and the skip note quotes the unresolved command back:
  `note: skipping a boundaries step this cannot resolve locally: bash
  scripts/check-boundaries.sh origin/${{ github.base_ref }}` contains the
  substring `bash scripts/check-boundaries.sh origin/` the assertion looks for.
  The assertion cannot distinguish "resolved" from "skipped and reported".

**E-C2. The honest-skip branch. SURVIVED.**

- File/line: 130, `*'${{'*) printf 'note: skipping …' ; continue ;;`
- Expression: `130s@\*'${{'\*)@*'__nope__'*)@`. Outcome: **survived**, 15/0.
- Under the mutant a step containing any *other* Actions expression
  (`${{ matrix.os }}`, `${{ secrets.X }}`) is no longer skipped but `eval`ed
  literally, which bash rejects as a bad substitution — so a local run reports a
  CI-step failure that CI does not have. The fixture's only expression is
  `github.base_ref`, which the line above resolves, so nothing reaches this
  branch.

**E-C3. Folded block scalars. SURVIVED.**

- File/line: 99, `/^[[:space:]]*run:[[:space:]]*[|>]/`. Expression:
  `99s@\[|>\]@[|]@`. Outcome: **survived**, 15/0. The suite only ever writes
  `run: |`. Under the mutant a `run: >` step is dropped entirely and silently —
  a CI step the local run claims to be reproducing and is not.

**E-C4. gates.yml-first is pinned only one way round. SURVIVED.**

- File/line: 88, `[ "$f" = "$first" ] && continue`. Expression:
  `88s@\[ "$f" = "$first" \] && continue@true@`. Outcome: **survived**, 15/0 —
  gates.yml is then emitted twice and every step in it runs twice.
- The other half **died**: `85s@printf '%s.n' "$first"@true@` (so gates.yml is
  emitted only by the glob loop, after the `continue` skips it) → died with **9**
  failures. So "gates.yml is in the list" is well protected; "gates.yml is in the
  list exactly once, first" is not.

**E-C5. The no-steps guard. SURVIVED.** `136s@-eq 0@-lt 0@`, 15/0. A workflow
directory with no `run:` steps would produce a silent success instead of
`ci-local: no run: steps found`.

**Died.** `104s@this < ind@this <= ind@` (block-scalar indent rule) → died, 2.

### `scripts/classify.sh`

Baseline 18.

| # | Rule | Line | Expression | Outcome |
|---|---|---|---|---|
| E-C6 | the category whitelist is complete | 69 | `69s@\|outside@@` | **survived**, 18/0 — the whitelist's contents are pinned by nothing, which is how E-L2 happened |
| E-C7 | `--list` excludes what git ignores | 88 | `88s@--exclude-standard @@` | **survived**, 18/0 — `--list` would return `node_modules`, `dist` and every build artefact to a caller the header promises to protect from exactly that |
| E-C8 | `--list` includes untracked files | 88 | `88s@--others @@` | died, 1 |
| E-C9 | `--only` filters | 77 | `77s@= "$WANT"@!= "$WANT"@` | died, 7 |
| E-C10 | an option in place of a category is a usage error | 54 | `54s@''\|-\*)@''XX)@` | died, 1 |

### `scripts/doctor.sh`

Baseline 21.

| # | Rule | Line | Expression | Outcome |
|---|---|---|---|---|
| E-D1 | CI must run `gates.sh` | 100 | `100s@for want in selftest.sh gates.sh check-boundaries.sh@for want in selftest.sh check-boundaries.sh@` | **survived**, 21/0 — the suite asserts `selftest.sh` and `check-boundaries.sh` by name and never `gates.sh` |
| E-D2 | a CI gap counts towards doctor's verdict | 112 | `112s@missing=$((missing+ci_missing))@true@` | **survived**, 21/0 — the suite reads doctor's stdout and never its exit status |
| E-D3 | the match is anchored to `scripts/<name>` | 102 | `102s@\*"scripts/$want"\*@*"$want"*@` | **survived**, 21/0 — a workflow merely mentioning the words would satisfy it |
| E-D4 | the block complains only when something is missing | 108 | `108s@-gt 0@-ge 0@` | died, 2 |
| E-D5 | discovery runs without `pipefail` | 187 | `187s@set +o pipefail; @@` | died, 1 (`a large producer piped into grep -q still counts as discovered`) |

### E-Z. Bookkeeping

- 52 distinct mutants applied and run; 29 survived, 23 died. Per file:
  refresh 13 (8 survived), check-boundaries 13 (8), phase-guard 9 (4), ci-local
  7 (4), doctor 5 (3), classify 5 (2).
- 3 probe re-runs of already-applied mutants (E-P1, E-P3, E-R7b).
- 5 no-op refusals, all logged with `CHANGED NOTHING - command not run`:
  `137s@.claude/settings.json @@` twice (wrong line — settings.json is on 138),
  two mis-escaped attempts at E-B1, and one at E-B3.
- 1 malformed expression (`77s@… && ##`, missing the closing delimiter) that
  `sed` rejected before `mutate.sh` could log it.
- Every applied run reported `restored (verified byte-for-byte)`.
  `ls .claude/state/mutations/*.bak` is empty afterwards, which is the harness's
  own definition of a clean restore.

## What would have to be true for this to be wrong

- The named suite is the whole oracle. `scripts/ci-local.sh` also runs
  `gates.sh --list/--audit` and `check-boundaries.sh` on this repository, and I
  ran no mutant under `ci-local.sh`; a survivor here could in principle be caught
  there.
- A mutant's survival implies the *rule* is unenforced only if the mutated line
  is the rule. For E-P1, E-R1, E-R7, E-B1..E-B8 and E-C6/E-C7 I read the
  surrounding branch to confirm this. For the table entries I confirmed by
  reading the single line, not by a second mutant.
- `mutate.sh` restored every file faithfully: 55 `restored (verified)` lines, no
  `.bak` left, and a clean `git status --short` at the end.
- The baseline was green before and after — 629/629 both times, by the same
  command.
- GNU sed and GNU awk as shipped with Git Bash on Windows. Four expressions
  matched nothing and were caught only because `mutate.sh` refuses a no-op; on
  BSD tooling the escaping would differ, which changes which mutants get applied,
  not which rules are tested.
- **Concurrency, and this is new since audit 1.** I ran up to four mutation
  streams at once, on **different files**, because the wall-clock cost per
  boundaries run rose to 2-7 minutes under load. Each stream mutated one file and
  no two streams ever mutated the same file, and every suite creates its fixture
  by copying `scripts/` and `.claude/hooks/` at fixture-creation time — so a
  mutation applied to file A is invisible to a suite that does not execute file
  A. Nothing in the results depends on ordering, but nothing verified that
  either, and one probe run *was* contaminated this way before I noticed (see
  *Evidence*, "two warnings about the tooling").
- `paths.conf` classifies bare tokens like `202601010000` as `source`. E-L1's
  severity depends on that; the *mechanism* does not.

## What was not checked

- **`.claude/harness/paths.conf` was not mutated at all.** The `manifest`
  category, the `__probe_` convention and the metadata rules
  (`LICENSE`, `LICENSE.*`, `.gitattributes`, `CODEOWNERS`, `CHANGELOG.md`) were
  checked by reading `.claude/tests/lib.test.sh:37-48` and
  `classify.test.sh:76-95`, which pin each of them with a direct
  `path=category` assertion. That is table-driven coverage and looks solid, but
  it is a reading, not a measurement: I ran no mutant against a `paths.conf`
  rule, and in particular nothing tests **rule order** between `manifest` and
  `config` for a path both could match.
- **`check-boundaries.sh`'s story-claim lookup, in the false-positive
  direction.** I mutated the fast-path existence check (E-B11, died) and read the
  ambiguity branch, but I did not construct a project with many DONE stories, a
  reused branch name, or a story whose `branch:` is empty, and I ran no mutant on
  the `problem`/`note` split at line 135 or on `story_field`'s parsing.
- **`manifest_strip_dev`'s `__UNPARSEABLE__` path for `before`.** The `case`
  inspects `$after` only. A file whose format changed between the two sides is
  unmeasured.
- **3i on a merge commit or a root commit.** `git show "$c^:$f"` takes the first
  parent; I tested only linear two-commit branches built by `manifest_story`.
- **The CI-only branches**, again: `GITHUB_HEAD_REF` and `PR_HEAD_SHA` are
  blanked by `boundaries()`. Audit 1 flagged this and it is still true.
- **`refresh-harness.sh`'s failure modes mid-run.** Line 120 `rm -rf`s a project
  directory before line 121 copies the upstream one; if the copy fails the
  project keeps only what `$KEEP` holds. No test covers a failed copy, and I
  wrote none. I also did not test: running it against **itself** (`UP == PROJ`),
  symlinks, empty directories, a script upstream has *deleted* (it is never
  removed from the project), or a project whose `.claude` sits behind a
  case-insensitive filesystem quirk.
- **`doctor.sh`'s exit status** was never asserted by me either — I inferred from
  E-D2's survival that the suite does not read it, and did not separately confirm
  what `missing` does at the end of the script.
- **`ci-local.sh` was never run for real** under any mutant, only `--dry-run` via
  its suite plus the suite's own fail-fast fixture.
- **Roughly 15 mutants enumerated and never run**, chiefly: the remaining
  `refresh-harness.sh` option parsing (`-h`, unknown option, `${DRY:+}` which is
  dead), `classify.sh`'s `--` handling and stdin loop, `ci-local.sh`'s dirty-tree
  note and its `PR_HEAD_SHA` export, `doctor.sh`'s dependency checks, and the
  individual alternatives inside `phase-guard.sh`'s candidate filter.
- **One platform only**: Windows 11, Git Bash, GNU coreutils. CI runs Linux.
- **No mutant was applied to two files at once**, so coordinated two-place
  defects are invisible here — the same limitation audit 1 recorded.
- **Every "survived" is relative to the fixtures the suites already build.** I
  added no fixture of my own to any suite; the four probe scripts run *outside*
  the suites and assert nothing.

## Spike code

Four throwaway bash scripts in this session's scratchpad
(`C:\Users\ryanc\AppData\Local\Temp\claude\C--Users-ryanc-Projects-agentic-dev-harness\ba06e8c8-934f-4885-a64e-d72b304294c7\scratchpad\`):
`probe2.sh` and `probe3.sh` (drive the real phase-guard hook over a list of
commands and print ALLOWED/BLOCKED plus the reported path), `r10check.sh` (builds
a two-tree upstream/project pair and runs `refresh-harness.sh` against it), and
four `run-*.sh` batch loops that do nothing but call `mutate.sh` in sequence and
grep the result lines. **They are unreviewed, not production code, and a later
story should take nothing from them as code.** What a later story may take is the
*shape*: `probe2.sh`/`probe3.sh` reuse `.claude/tests/_lib.sh`'s own
`make_fixture`, `set_phase` and `guard_bash`, and the list of commands in them is
the raw material for the assertions Decided 1 and Decided 4 ask for — re-derive
the assertions, do not copy the script. Known to be wrong and harmless here: the
probes parse the denial reason with a `sed` that assumes the path is followed by
whitespace, so a path at the very end of the reason prints empty; and the batch
loops report only `N passed, M failed`, which is why every entry above names the
failing assertions from the suite's own output rather than an aggregate. They are
session-local and will be gone; reproduce any run from the `mutate.sh` command in
**Evidence** plus a plain suite invocation instead.

## Stories filed

None. This repository ships `docs/backlog/stories/` empty on purpose — it is a
template, and its own chores would land in every project made from it — so the
findings above go to the issue tracker instead. The clusters an issue should be
cut along, in the order Decided ranks them:

1. Live: `touch` option arguments are denied by the lock (Decided 1, E-L1).
2. Live: `classify.sh` refuses the `manifest` category (Decided 2, E-L2).
3. Live: 3h accepts any phase word as an owner (Decided 3, E-L3).
4. The redirect strip is pinned against one clause, not two (Decided 4, E-P1).
5. `refresh-harness.sh`: the report and the work are unconnected, and `--dry-run`
   is not pinned read-only (Decided 5-7, E-R1..E-R7b).
6. 3i's manifest parsers cover two ecosystems' happy paths (Decided 8-9,
   E-B1..E-B6).
7. Three theatre assertions, and `boundaries()`'s discarded exit status
   (Decided 10, E-B7, E-C1, E-X1 — the last is audit 1's HARNESS-003, still open).
8. `doctor.sh`'s CI block changes no verdict (Decided 11, E-D1..E-D3).
9. `ci-local.sh` and `classify.sh` leftovers (Decided 12, E-C2..E-C7).
