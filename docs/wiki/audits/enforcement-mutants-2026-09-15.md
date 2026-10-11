# Mutation audit: the enforcement surface

## Scope

Audited: the code that makes this harness an enforcement mechanism rather than a
prompt.

| File | Suite used as the oracle | Baseline |
|---|---|---|
| `scripts/check-boundaries.sh` | `.claude/tests/boundaries.test.sh` | 41 assertions |
| `.claude/hooks/phase-guard.sh` | `.claude/tests/phase-guard.test.sh` | 114 assertions |
| `.claude/hooks/lib.sh` | `.claude/tests/lib.test.sh` + `classify.test.sh`, then the consumer suites | 135 + 18 |
| `scripts/gates.sh` | `.claude/tests/gates.test.sh` | 74 assertions |
| `scripts/phase.sh` | `.claude/tests/phase.test.sh` | 24 assertions |

At commit `7b6f6db` ("Find the story by what claims the branch, not by the
branch's name"), harness `VERSION` `2026-09-15`, on Windows 11 / Git Bash. The
mutation runs were executed 2026-09-12T22:54Z to 2026-09-13T01:20Z UTC. The
filename carries the harness version rather than the run date; the run date is
the one above.

Full baseline before any mutation: **566 assertions across 13 suites**, all
passing — lib 135, phase-guard 114, gates 74, boundaries 41, mutate 39, profiles
37, gate-reminder 27, phase 24, new-story 22, settings 20, classify 18, ci-local
8, doctor 7.

Deliberately left out: `scripts/mutate.sh`, `scripts/doctor.sh`,
`scripts/new-story.sh`, `scripts/selftest.sh`, `scripts/ci-local.sh`,
`.claude/hooks/gate-reminder.sh`, `.claude/hooks/inject-state.sh`, the GitHub
workflows, and every agent/command/skill prompt. Also left out: the whole
false-positive direction of the enforcement surface — see *What was not checked*,
which is not a formality in this audit.

There is no mutation tool for bash and the `mutation` gate in `project.conf` is
unconfigured. Every mutant below was applied with `bash scripts/mutate.sh`, which
backs the file up under `.claude/state/mutations/`, applies the expression, runs
the command, restores, and verifies the restore with `cmp`. No `sed -i` was used
on any file.

## Decided

These are conclusions. A story citing this audit follows them without reopening
them. The numbers they rest on are in **Evidence** and are *not* settled — verify
them before depending on them.

**Orchestrator's correction, before you read the rest.** Reproduced
independently, per K2, because "a law of this harness is not enforced" is the
most contract-changing claim an audit here can make. **For almost every survivor
below, the rule works today and only its test is vacuous.** Measured directly,
not by mutation:

- **Section 3a fires.** A fixture PR appending to `src/main.ts` with no test
  change is refused: `FAIL 1 source file(s) changed with no test changes`. Law 1
  is enforced; what is missing is a fixture proving it, so the predicate could be
  broken tomorrow in silence.
- **The lock covers all four tools.** Driven directly in RED, `Write`, `Edit`,
  `MultiEdit` and `NotebookEdit` are each denied on `src/main.ts`. CLAUDE.md's
  claim is true; only the assertions are absent.

So read every survivor below as **regression exposure, not live exposure** — with
one exception, which is live and is the reason to act:

- **An unrecognised phase switches the lock off.** Measured on the real hook with
  a hand-written state file: `PHASE=RED` denies a write to `src/main.ts`;
  `PHASE=GREE`, `PHASE=ZZZ` and an empty phase all **allow** it. `phase.sh`
  validating the phase is therefore the only thing standing between a typo and a
  silent lock, and the audit shows that validation's one control cannot fail. Two
  independent defences, and the second does not exist: the guard has no
  "phase I do not recognise" branch at all. That is a hole today, not a
  regression risk, and it is the one finding here I would fix first.


1. **The gate-record tree stamp is enforced by nothing.** CLAUDE.md law 3 rests
   on a stamp written by `gates.sh` and checked by `check-boundaries.sh`. Both
   ends, and the definition of what the hash covers, can be made vacuous with no
   test failing. This is the most serious finding and is cluster C1
   (HARNESS-001). Rests on measurements E1, E2, E3.
2. **Section 3a of `check-boundaries.sh` is enforced by nothing.** "Production
   code ships with the test that demanded it" and the scaffold-inventory rule
   that backs the bootstrap exception are both untested; the predicate can be
   replaced by `false` and every PR then gets the message a correct PR gets.
   Cluster C2 (HARNESS-002). Rests on E4, E5, E6.
3. **`.claude/tests/boundaries.test.sh` cannot see a rule that stops firing,
   unless a fixture violates that rule.** Its helper discards
   `check-boundaries.sh`'s exit status and asserts only on output substrings.
   Fixing that helper is a precondition for trusting any future work on section
   3, and is the reason five further rules survive. Cluster C3 (HARNESS-003).
   Rests on E7 and E8-E12.
4. **The phase lock's coverage of `MultiEdit` and `NotebookEdit` is claimed in
   CLAUDE.md and asserted nowhere.** Both can be removed from the hook silently.
   Cluster C4 (HARNESS-004). Rests on E13, E14.
5. **`valid_phase` in `phase.sh` has a negative control that cannot fail.** The
   suite tests the exact-vs-regex property with the input `GREEN.`, which does
   not discriminate the two implementations. The documented consequence of
   getting this wrong — the lock silently off — is reachable by a different
   typo. Cluster C5 (HARNESS-005). Rests on E15 and E16.
6. **`gates.sh`'s own liveness machinery is well protected and should be left
   alone.** `evidence`, `floor`, the `covers` required/optional split, the FULL
   stamp, the partial-run recording rule and the BLOCKED exit code all die hard.
   Do not spend story budget there. Rests on E17.
7. **`phase_allows`, `command_cwd`, `path_is_implausible`, the paths.conf
   first-rule-wins order, the quote/heredoc masker and the `story/` branch
   fast-path are well protected.** Same conclusion: no work needed. Rests on E18.
8. **Two survivors are not defects and should not be filed as ones**: the
   `normalize_rel` climb-above-root return value (an equivalent mutant) and the
   `classify` empty-category fallback (no reachable caller). Rests on E19, E20.

## Evidence

Not settled. Each claim names the exact mutation, the exact command, and the
exact outcome.

**How to read "survived" and "died".** A mutant *died* if at least one assertion
in the named suite(s) failed. It *survived* if every assertion in the named
suite(s) passed. "Survived" is therefore a statement about **these** suites at
**this** commit, never a claim that no test could catch it.

Every run took the form:

```
bash scripts/mutate.sh <FILE> '<SED-EXPRESSION>' -- bash <RUNNER>
```

where `<RUNNER>` executed one or more of `.claude/tests/<name>.test.sh` in
sequence and reported each suite's `N passed, M failed` line. The runner scripts
live in this session's scratchpad and are throwaway; they do nothing but loop
over suite names (see *Spike code*).

**Totals, stated plainly.** 48 distinct mutants were **applied and run**. 17
survived, 31 died. Beyond those 48 there were: 1 void run (below), 2 expressions
`mutate.sh` refused because they changed nothing, 7 escalation re-runs of an
already-applied mutant against additional suites, and 5 full-selftest
confirmation re-runs — 63 `mutate.sh` invocations in total, all of them logged in
`.claude/state/mutations/log`. That file is cumulative across sessions: it holds
106 lines, of which 63 are mine (timestamps `20260912T225422Z` onward) and 43 are
from earlier work, including four `check-boundaries.sh` runs made in this same
session by the agent that found the `story/<ID>` branch defect. 61 of my 63 report
`restored (verified)`; the other two are the no-op refusals. How 48 is derived from
those 63: 53 distinct (file, expression) strings, minus the 2 refusals, minus 2
pairs that differ only in how the shell escaped the same expression, minus the 1
void run. I **reasoned about roughly 30 further
mutants without running any of them**; they are listed under *What was not
checked* rather than counted here.

**One void run.** An early attempt at the gate-marker mutant used a replacement
containing a `\n` escape, which GNU sed expanded into real newlines; `mutate.sh`
reported **240 line(s) changed** and the result was discarded as meaningless. It
was re-run as E17f using line-addressed sed (`246s#if ! #if #`) and the
conclusion below comes only from the re-run. Every other run reported exactly
`1 line(s) changed`, except E18f, which reported 2 and is flagged there.

---

### C1 — the gate record's tree stamp

**E1. `check-boundaries.sh` accepts any tree stamp.**

- Claim, falsifiable: replacing the stamp comparison with `true` breaks no test.
- File/line: `scripts/check-boundaries.sh:294`,
  `if [ -n "$rec" ] && [ "$rec" = "$now" ]; then`
- Expression: `s#\[ "$rec" = "$now" \]#true#`
- Run against: all 13 suites (566 assertions).
- Outcome: **survived**, 566 passed / 0 failed.
- Why it survived: no fixture ever produces a stamp/tree mismatch, and
  `boundaries()` (`.claude/tests/boundaries.test.sh:23`) discards the exit
  status, so the extra FAIL line an unmutated script would print is read by no
  assertion. Not dead code — the branch runs on every REVIEW/DONE PR; it is an
  Unprotected: the rule fires today, and nothing would notice if it stopped.
- Test that would kill it: record a real gate run in a fixture story, then modify
  a source file, run `check-boundaries.sh`, and assert both the mismatch text and
  a non-zero exit.
- What would make it unrepresentative: if CI exercises the `PR_HEAD_SHA` branch
  (lines 289-292) differently, the comparison is still this same line and still
  unasserted — but my runs never set `PR_HEAD_SHA`, so I have no measurement of
  that branch at all.

**E2. `gates.sh` can stamp a constant.**

- Claim: the recorded `tree:` value can be a literal and no test notices.
- File/line: `scripts/gates.sh:191`, `tree="$(gate_tree_hash)"`
- Expression: `191s#tree="\$(gate_tree_hash)"#tree=0000000#`
- Run against: `gates` (74), then `boundaries` + `gate-reminder` (41 + 27).
- Outcome: **survived** all three, 142 passed / 0 failed.
- Why it survived: `boundaries.test.sh` does run the real `gates.sh`
  (`story_blocked()`, lines 198-218) and so does produce a real record, but every
  assertion on it is an `assert_contains` for a substring such as
  `recorded gate result: blocked`, `types`, or `pending CI`. A wrong `tree:` adds
  a FAIL that no assertion looks for. Unprotected: the rule fires today, and nothing would notice if it stopped.
- Test that would kill it: assert the `tree:` line `gates.sh` writes equals
  `gate_tree_hash` computed independently for the same fixture tree.
- Unrepresentative if: `gate_tree_hash` is unavailable in the fixture (it prints
  `unavailable` and returns 1 on an empty listing), in which case a constant and
  the real value could coincide in both being "not a real hash". I did not test
  that case.

**E3. The tree hash can stop covering test files.**

- Claim: excluding `test` from the hashed set breaks no test in the hash's own
  consumers.
- File/line: `.claude/hooks/lib.sh:637`, inside `_hash_blob_listing`
- Expression: `s#'{ print "C#'$1 != "test" { print "C#`
- Run against: all 13 suites (566 assertions).
- Outcome: **survived**, 566 passed / 0 failed.
- Contrast that sharpens it: mutating the **shared predicate** instead —
  `gated_stdin` at `lib.sh:615`, expression
  `s#($1 == "source" || $1 == "test"#($1 == "source"#` — **died**, but on
  exactly **one** assertion, `warns: a test touched since the run`, in
  `gate-reminder.test.sh`; `boundaries` (41), `gates` (74), `lib` (135) and
  `classify` (18) all still passed. So the only thing standing behind "the gate
  record covers test files" is one assertion about the Stop hook, and the hash
  path itself has none. Mutating the hash alone, as here, is invisible.
- Test that would kill it: record a gate run, edit only a test file, assert the
  recorded hash no longer matches.
- Unrepresentative if: a project's `paths.conf` classifies its tests as something
  other than `test` — then this mutant is a no-op there and the measurement says
  nothing about that project.

### C2 — production code arrives with tests

**E4. Section 3a's predicate can be `false`.**

- Claim: the commit-level enforcement of CLAUDE.md law 1 has no test.
- File/line: `scripts/check-boundaries.sh:146`
- Expression: `s#\[ "$src" -gt 0 \] && \[ "$tst" -eq 0 \]#false#`
- Run against: all 13 suites (566 assertions).
- Outcome: **survived**, 566 passed / 0 failed.
- Why: the `else` branch then reports
  `ok    source changes accompanied by test changes (N source, 0 test)` — the
  message a compliant PR gets — and `boundaries.test.sh` contains no fixture
  whose diff changes source without changing tests. The string "Production code
  ships with the test that demanded it" appears nowhere in the suite. Unenforced
  rule.
- Test that would kill it: a `feature` fixture story whose diff touches only
  `src/`, asserting the FAIL text and a non-zero exit.

**E5. The empty-inventory check can be inverted.**

- File/line: `scripts/check-boundaries.sh:151`
- Expression: `151s#if ! #if #`
- Run against: `boundaries` (41). Outcome: **survived**, 41 passed / 0 failed.
- Effect: a `bootstrap`/`chore`/`spike` story with an entirely empty
  `## Scaffold inventory` passes; the check now fires only when the inventory
  *has* content. Unprotected: the rule fires today, and nothing would notice if it stopped.

**E6. The per-file inventory check can be short-circuited.**

- File/line: `scripts/check-boundaries.sh:157`
- Expression: `157s#grep -qF -- "$p" ||#true ||#`
- Run against: `boundaries` (41). Outcome: **survived**, 41 passed / 0 failed.
- Effect: `missing` is never populated, so the inventory need not name any
  changed source file — the exact obligation `rules.md` says CI enforces.
  Unprotected: the rule fires today, and nothing would notice if it stopped.

### C3 — the suite that cannot see a rule switch off

**E7. `boundaries()` discards the exit status.**

- Claim, falsifiable: the helper reads only stdout/stderr text.
- Measured by reading `.claude/tests/boundaries.test.sh:23-25`:
  `( cd "$FIX" && GITHUB_HEAD_REF= PR_HEAD_SHA= bash scripts/check-boundaries.sh main 2>&1 )`
  — the subshell's status is swallowed by command substitution, and `$?` is never
  consulted anywhere in the suite.
- This is a code reading, not a measurement, and is the common cause of E1, E2
  and E8-E12.

Each of the following was run as
`bash scripts/mutate.sh scripts/check-boundaries.sh '<EXPR>' -- bash <runner> boundaries`
and **survived with 41 passed / 0 failed**:

| # | Rule | Line | Expression |
|---|---|---|---|
| E8 | frontmatter `id` matches filename | 76 | `s#\[ "$fid" = "$base" \]#[ -n "$fid" ]#` |
| E9 | `.claude/state/current-story.env` must not be tracked | 85 | `s#if git ls-files --error-unmatch#if ! git ls-files --error-unmatch#` |
| E10 | one branch, one story | 135 | `135s#problem "branch#note "branch#` |
| E11 | a story-escalated `required_gates` entry PASSed in the record | 305 | `305s#grep -qE#grep -qvE#` |
| E12 | `## Handoff` is filled in for `feature`/`fix` | 316 | `316s#feature|fix)#nosuchtype)#` |

E11 survives for a second, independent reason worth recording: **no fixture story
in the suite sets `required_gates` at all**, so the `for g in ...` loop body never
executes, inverted or not. E9 has a third defect visible by reading rather than by
mutation: the `ok "harness state not tracked"` on line 88 sits outside the `if`,
so it is printed even when the FAIL fires.

### C4 — the phase lock's tool coverage

**E13. `MultiEdit` and `NotebookEdit` can be dropped from the hook.**

- File/line: `.claude/hooks/phase-guard.sh:61`
- Expression: `61s#Write|Edit|MultiEdit|NotebookEdit)#Write|Edit)#`
- Run against: all 13 suites (566 assertions). Outcome: **survived**, 566 passed.
- Why: `.claude/tests/phase-guard.test.sh` drives the hook with `Write` and
  `Edit` only (lines 86, 88, 406, 432) plus `Bash` via `guard_bash`. The strings
  `MultiEdit` and `NotebookEdit` appear nowhere in the suite. Unprotected (the hook does handle both today), and
  on a routine write path: `MultiEdit` is the ordinary tool for a multi-hunk edit.

**E14. The `notebook_path` check can be deleted.**

- File/line: `.claude/hooks/phase-guard.sh:63`
- Expression: `63s#check_path "\$(json_get_string notebook_path || true)"#true#`
- Run against: `phase-guard` (114). Outcome: **survived**, 114 passed / 0 failed.

### C5 — `phase.sh`

**E15. `valid_phase`'s exactness has a control that cannot fail.**

- File/line: `scripts/phase.sh:33`, `if (t == p)`
- Expression: `s#if (t == p)#if (t ~ p)#`
- Run against: all 13 suites (566 assertions). Outcome: **survived**, 566 passed.
- Why, precisely: the suite's one control is
  `out="$(phase set T-11 'GREEN.')"` at `.claude/tests/phase.test.sh:75`, named
  "a regex-matching phase name is refused". As an awk regex, `GREEN.` requires a
  sixth character, so it fails to match the conf row `GREEN` under `~` exactly as
  it does under `==`. The test passes under both implementations and therefore
  discriminates nothing. The inputs that *do* discriminate are typos that are a
  prefix or substring of a real phase name (`GREE`, `RE`, `D`) or a bare `.`;
  `cmd_set` uppercases its argument first, so `gree` arrives as `GREE`.
- A blunter mutant for contrast: `s#END { exit !found }#END { exit 0 }#`
  (accept every phase name) **died** with 5 failures, including the `GREEN.`
  assertion. So the function is not untested — it is tested with an input that
  misses the one property its own code comment says it exists to defend.

**E16. The consequence is the lock fully off, and this was measured directly.**

- In a throwaway fixture carrying the real `paths.conf` and `phases.conf`, with
  `.claude/state/current-story.env` containing `PHASE=GREE`, the real hook was fed
  `{"tool_name":"Write","tool_input":{"file_path":"src/main.ts"}}` and **allowed
  it** (empty output). The same fixture with `PHASE=RED` **denied** it, with
  `phase: RED / path: src/main.ts` in the reason. `phase_allows`
  (`lib.sh:747-765`) finds no row for an unknown phase and returns 0 by design.
- No mutation was involved in E16: it is the unmutated code's behaviour on an
  out-of-range state value. It establishes the blast radius of E15, not E15
  itself.

**E16b. `phase.sh` need not write `branch:` to the frontmatter.**

- File/line: `scripts/phase.sh:165`
- Expression: `s#set_frontmatter "$file" branch "$branch"#true#`
- Run against: `phase` (24). Outcome: **survived**, 24 passed / 0 failed.
- Qualification, and it matters for how the story is scoped: `new-story.sh:30`
  already writes `branch:` into every generated story, so on the common path this
  line is redundant. It is load-bearing only for a hand-written story file, or one
  whose branch changed — and that is exactly the case where a missing `branch:`
  leaves `check-boundaries.sh` with no claimant and eight checks skipped.

### Mutants that died — the protected surface

**E17. `gates.sh`.** Each run as
`bash scripts/mutate.sh scripts/gates.sh '<EXPR>' -- bash <runner> gates`:

| Rule | Line | Expression | Outcome |
|---|---|---|---|
| evidence regex must match | 432 | `432s# && ! clean_log# \&\& clean_log#` | died, **18** failures |
| floor comparison | 444 | `444s#-lt#-gt#` | died, 7 failures |
| `covers` required/optional split | 593 | `593s#= "required"#!= "required"#` | died, 8 failures |
| FULL stamp excludes `--fast` | 646 | `646s# || \[ "$FAST" = 1 \]##` | died, 1 failure |
| a partial run is not recorded | 677 | `677s# || \[ "$FAST" = 1 \]##` | died, 1 failure |
| BLOCKED exits 3 | 707 | `707s#exit 3#exit 0#` | died, 2 failures |

**E17f.** The gate-marker check (`scripts/check-boundaries.sh:246`, "was this
record written by `gates.sh`"), `246s#if ! #if #`: **died**, 6 failures in
`boundaries`. This is the re-run that replaced the void 240-line attempt.

**E18. `check-boundaries.sh`, `lib.sh`, `phase.sh`, `phase-guard.sh` — died:**

| Rule | File:line | Expression | Outcome |
|---|---|---|---|
| criteria frozen without `## Amendments` | cb:230 | `s#\[ "$before" = "$after" \]#true#` | died, 1 |
| RED-commit manifest check runs on RED | cb:458 | `s#\[ "$ph_at" = "RED" \]#[ "$ph_at" != "RED" ]#` | died, 7 |
| `## Regressions`/`## Gate probes` show output | cb:61 | `s#^has_pasted_output() {.*#has_pasted_output() { return 0; }#` | died, 4 |
| "somebody wrote something" | cb:54 | `s#^has_content() {.*#has_content() { return 0; }#` | died, 4 |
| a PR opens from REVIEW or DONE | cb:212 | `s#  REVIEW|DONE) ok "story#  REVIEW|DONE|*) ok "story#` | died, 4 |
| branch matches frontmatter | cb:218 | `s#\[ -n "$fb" \] && \[ "$fb" != "$br" \]#false#` | died, 1 |
| harness VERSION bump | cb:189 | `189s#" = "#" != "#` | died, 2 |
| `## Deferred verifications` block runs | cb:364 | `364s#if printf#if false \&\& printf#` | died, 4 |
| `story/<ID>` branch fast path | cb:120 | `120s#\^story/#^XXstory/#` | died, 2 |
| `phase_allows` treats `source` as always allowed | lib:749 | `s#= "outside" \]#= "source" ]#` | survived lib+classify; **died** in `phase-guard`, **38** failures |
| paths.conf first rule wins | lib:531 | `s#if (lp ~ rr[i]) { c = rc[i]; break }#if (lp ~ rr[i]) { c = rc[i] }#` | died, 2 |
| heredoc bodies are masked | lib:116 | `s#else out = out maskstr(s)#else out = out s#` | died, 1 |
| harness `.md` excluded from the hash | lib:616 | `s#&& $2 ~ /\.md$/)#)#` | died, 1 |
| `command_cwd` fails open outside the repo | lib:426 | `s#\[ "$cur" = "OUTSIDE" \] && return 1#true#` | survived lib+classify; **died** in `phase-guard`, 7 failures |
| `cd $VAR` is unaccountable | lib:410 | `s#*'$'*)   return 1#*XNOPEX)   return 1#` | survived lib+classify; **died** in `phase-guard`, 1 failure |
| `depends_on` must be DONE | phase:82 | `s#= "DONE"#!= ""#` | died, 3 |
| branch check | phase:96 | `s#-n "$cur"#-z "$cur"#` | died, 2 |
| `guard_transition` runs for RED | phase:76 | `s#PLANNED|DONE) return 0#PLANNED|DONE|RED) return 0#` | died, 5 |
| `valid_phase` rejects anything | phase:34 | `s#END { exit !found }#END { exit 0 }#` | died, 5 |
| frontmatter phase is written | phase:163 | `s#set_frontmatter "$file" phase "$phase"#true#` | died, 4 |
| `--force` must be asked for | phase:136 | `s#\[ "${3:-}" = "--force" \] && force=1#force=1#` | died, 3 |
| declines are logged with the token | pg:56 | `56s#>> "$HARNESS_ROOT/.claude/state/phase-guard-declined.log"#>> /dev/null#` | died, 1 |

**E18f.** One entry above needs its own caveat: `s#^  return 1$#  return 0#` on
`lib.sh` reported **2 line(s) changed** (both `path_is_implausible:345` and
`is_ignored:463`), so it is over-broad by the standard this audit set itself. It
died loudly — 13 failures in `lib`, 8 in `classify` — and I keep it only as weak
evidence that at least one of those two returns is protected. It does not
establish which. Treat both functions as unmeasured individually.

### Survivors that are not defects

**E19. `normalize_rel`'s climb-above-root return is an equivalent mutant.**

- File/line: `.claude/hooks/lib.sh:370`, `[ -z "$out" ] && return 1`
- Expression: `s#\[ -z "$out" \] && return 1#[ -z "$out" ] \&\& return 0#`
- Run against: `lib` + `classify` (153). Outcome: survived, 153 passed.
- Analysis rather than measurement: the only caller is `phase-guard.sh:140`,
  `target="$(normalize_rel ...)" || continue`. With `return 1` the candidate is
  skipped; with `return 0` the caller receives an empty string and `check_path`
  returns immediately on `[ -z "$raw" ]`. The two are observationally identical,
  so **no test can kill this** and none should be written for it. I did not
  attempt to construct a distinguishing input beyond this reasoning.

**E20. `classify`'s empty-category fallback has no reachable caller.**

- File/line: `.claude/hooks/lib.sh:442`, `[ -z "$cat" ] && cat=source`
- Expression: `s#&& cat=source#&& cat=docs#`
- Run against: `lib`, `classify`, `phase-guard`, `boundaries` (308). Outcome:
  survived, 308 passed.
- Reachability measured directly: `classify_stdin` carries its own
  `c = "source"` default, so it prints a category for every non-empty line; the
  only inputs that make it print nothing are those it reduces to the empty
  string. In a fixture, `classify "./"` returns `source` **via this fallback**
  (`classify_stdin` drops the line after `sub(/^\.\//, "", path)`), while
  `classify "."`, `classify " "` and `classify "x"` return `source` from
  `classify_stdin` itself. But `to_rel` strips a leading `./`, `check_path`
  returns early on an empty `rel`, and the other callers are fed paths from
  `git`. So the line is reachable by direct function call and unreachable from
  any real caller. Decide deliberately between deleting it and pinning it with a
  function-level test; do not file it as an enforcement gap.

## What would have to be true for this to be wrong

- The suites named are the whole oracle. If CI runs an assertion these 13 suites
  do not, a "survivor" here may be caught there. `scripts/ci-local.sh` runs
  `selftest.sh`, `gates.sh --list/--audit` and `check-boundaries.sh`; I ran the
  suites directly and did not run `ci-local.sh` under any mutation.
- A mutant's survival implies the *rule* is unenforced only if the mutated line is
  the rule. For E1, E2, E4, E5, E6 and E13 I read the surrounding branch to
  confirm this; for the table entries E8-E12 I confirmed the line is the sole
  guard by reading, not by a second mutant.
- `mutate.sh` restored every file faithfully. It reported
  "restored (verified byte-for-byte)" on all 63 invocations, and
  `.claude/state/mutations/` holds no `.bak` afterwards (only `log`), which is
  the condition the harness defines for a clean restore.
- The baseline was green before and after. Both were observed: 566/566 before, and
  `git status --short` at the end shows only the new audit and story files.
- GNU sed and GNU awk semantics, as shipped with Git Bash on Windows. Several
  expressions depend on BRE escaping (`\\.` to match a literal `\.`); two early
  attempts silently matched nothing and were caught only because `mutate.sh`
  refuses a no-op. On BSD tooling the same expressions may behave differently,
  which would change which mutants got applied — not which rules are tested.
- No concurrency: mutations were strictly serial, because two suites reading the
  same mutated file would invalidate each other. Nothing in the results depends on
  ordering, but nothing verified that either.

## What was not checked

- **The false-positive direction, almost entirely.** I chose mutants that make a
  check *vacuous*, because a silently-open lock is this repository's worst failure
  mode. The opposite failure — a guard that denies a legitimate write, which
  CLAUDE.md warns teaches agents to route around the lock — got only the handful
  of inversions in E18. A clean audit of over-blocking has not been done.
- **`scripts/gates.sh --audit`**: every manifest-validation branch (a `slow`,
  `ci-factor`, `blocked-when` or `covers` line naming no gate; an empty pattern; a
  floor that is not a number; a waiver on a required gate; the
  unconfigured/`BOOTSTRAPPED` interaction) was read and not mutated. Also
  unmutated: `table_lookup`, `work_count`, `clean_log`, `record_in_story`'s awk,
  the individual `BLOCKED_DEFAULT` patterns, and the `--gate <typo>` guard.
- **`check-boundaries.sh`'s manifest parsers**: `manifest_strip_dev` for both
  `*.toml` and `*.json`, `manifest_norm`, the `__UNPARSEABLE__` path and the
  lockfile skip. E18's `ph_at` mutant shows the RED-commit *loop* is exercised; it
  says nothing about whether the dev-block parsers are correct. These are the most
  intricate awk in the file and are unaudited.
- **The CI-only branches.** `GITHUB_HEAD_REF` and `PR_HEAD_SHA` (lines 102 and
  289-292) — `boundaries()` explicitly blanks both. The path CI actually takes to
  identify a story and to recompute the hash at the PR head was not mutated and is
  covered by no measurement here.
- **`section` and `strip_comments`** in `check-boundaries.sh`: the awk that decides
  what every `## Section` check reads. A defect there weakens 3d-3h at once, and I
  mutated none of it.
- **`phase-guard.sh`'s candidate extractors individually**: the five `grep -oE`
  lines (redirect, `tee`, `sed -i`, `cp`/`mv`, `rm`/`touch`), the
  `grep -vE '^\s*$|^-|\*|^/dev/'` filter, the `EXEMPT`/`mutate_targets` exemption,
  and `CWD_KNOWN`. The suite has visibly specific tests for several of these, so I
  expect them protected — I did not measure it.
- **`lib.sh` internals**: most of `mask_shell_quotes` (the `subst` state machine,
  the double-quote backslash rules, line continuations), `to_rel`'s drive-letter
  and case-folding branches, `json_get_string`, `frontmatter_list`, `is_ignored`'s
  trailing-slash retry, `code_changed_since`'s pruning and its `rc > 1`
  fail-closed branch, `gate_tree_hash`'s `read-tree HEAD` seeding (the CRLF fix),
  `_hash_blob_listing`'s `unavailable` branch, `json_escape`.
- **Roughly 30 mutants enumerated and never run**, drawn from the areas above. I
  stopped on wall clock: a `phase-guard` run is 170s, `gates` 115s, `boundaries`
  81s, and a full 13-suite selftest about 430s on this machine.
- **One platform only**: Windows 11, Git Bash, GNU coreutils. The macOS bash 3.2
  and BSD `sed` hazards that `lib.sh` and `phase.sh` carry comments about were not
  exercised; nor was Linux, which is what CI runs.
- **No mutant was applied to two files at once**, so I have no evidence about
  defects that need a coordinated change in two places to become visible.
- **Story-file content checks were exercised only through the existing fixtures.**
  I added no fixture of my own, so every "survived" here is relative to the
  fixtures the suite already builds.

## Spike code

The only throwaway code is five one-screen bash scripts in this session's
scratchpad
(`C:\Users\ryanc\AppData\Local\Temp\claude\C--Users-ryanc-Projects-agentic-dev-harness\ba06e8c8-934f-4885-a64e-d72b304294c7\scratchpad\`):
`run-lib.sh`, `run-sub.sh`, `run-all.sh`, `confirm.sh`, and `fill.sh`, which
inserted the Context and Acceptance criteria blocks into the five story files.
**They are unreviewed, not production code, and a later story should take nothing
from them** — each does no more than `cd` to the repository, loop over suite
names, run `bash .claude/tests/<name>.test.sh` and grep the `FAIL`/`passed,`
lines. They are session-local and will be gone; reproduce any run from the
`mutate.sh` command shown in **Evidence** plus a plain suite invocation instead.
Known to be wrong and harmless here: they treat any non-zero suite exit as
failure without recording which suite failed, which is why every Evidence entry
names the per-suite `N passed, M failed` line rather than an aggregate.

## Stories filed

- **HARNESS-001** — Gate record tree stamp is verified end to end. From C1 (E1, E2, E3).
- **HARNESS-002** — Production code cannot arrive without tests or an inventory. From C2 (E4, E5, E6).
- **HARNESS-003** — check-boundaries asserts its own verdict on the story checks. From C3 (E7, E8-E12).
- **HARNESS-004** — Phase lock covers MultiEdit and NotebookEdit. From C4 (E13, E14).
- **HARNESS-005** — phase.sh refuses an invalid phase and keeps frontmatter in step. From C5 (E15, E16, E16b).

No story was filed for E19 (equivalent mutant) or E20 (no reachable caller); see
*Decided* item 8.
