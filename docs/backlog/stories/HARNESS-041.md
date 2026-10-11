---
id: HARNESS-041
title: Mutation gates need a killed count
slug: mutation-gates-need-a-killed-count
epic: 
type: fix
status: done
phase: DONE
branch: story/HARNESS-041-mutation-gates-need-a-killed-count
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [.claude/skills/stack-profiles/reference/node-typescript.md, .claude/skills/stack-profiles/reference/python-uv.md, .claude/skills/stack-profiles/reference/rust-cargo.md, .claude/skills/stack-profiles/reference/new-profile.md, .claude/skills/stack-profiles/SKILL.md, .claude/skills/quality-gates/SKILL.md, .claude/tests/profiles.test.sh, .claude/tests/floors.conf, .claude/tests/selftest.test.sh]         # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

GitHub issue #104 (ryanczhang7/agentic-dev-harness), **section 2** and the
"related observation" of section 1. Items 1A and 1B of the issue are DONE
(HARNESS-040 delivers missing `docs/` files on refresh; HARNESS-039 makes
`gates.sh --audit` FAIL a `mutation` gate with no `ondemand` line). This story
is the issue's progress comment's items 2 and 3, in one cycle.

The defect, measured by the issue's reporter on a consumer (fantasy-world-
builder) with `@stryker-mutator/core` 10.0.0, `@stryker-mutator/vitest-runner`
10.0.0, typescript 7.0.2, vitest 5.0.0, Node 24.19.0, pnpm 12.3.4, Windows 11
- **not re-measured here; that toolchain is not installed in this repository
and every number below is the reporter's**:

- `node-typescript.md:15` prescribes `pnpm exec stryker run` with no caveat. On
  TS 7 core's `TSConfigPreprocessor` calls `ts.parseConfigFileTextToJson`,
  which TS 7 (the native port) no longer has, whenever `tsconfigFile` names a
  file that exists; `checkers: []` does not avoid it. Separately, the vitest
  runner plugin, built against vitest 4.1.10 with a peer range of `>=2.0.0`,
  **runs no tests under vitest 5.0.0 and still reports a score**: one file
  85.79% (156 static mutants killed, 0 of 22 runtime mutants killed), another
  0 of 19 killed where the same mutant run by hand fails 9 tests. What worked
  was core's built-in command runner.
- The `mutation` gate has **no `evidence` line in any profile**
  (`node-typescript.md:30-33`, `python-uv.md:30-34`, `rust-cargo.md:36-43`),
  so `gates.sh` has nothing to hold such a run to: it exits 0 and is reported
  as a pass. A runner that tests nothing producing a plausible score is the
  exact failure the evidence mechanism exists for (`gates.sh:16-18`), arriving
  through the one gate nobody gave it.
- `node-typescript.md:45` says "Verified against vitest 5 and typescript 5 on
  Windows" directly under an evidence block in which `lint` and `build` are
  marked UNVERIFIED and `mutation` has no line at all. The sentence was written
  for the `unit`/`coverage` lines (commit `4f58e41`) and now reads as a claim
  about the block.
- A Tauri project (TS + Rust) combining two profiles gets two `mutation` gate
  lines with one id, and nothing says how to name the second.

**The gate that fails if this story's artifact breaks** is the harness's own
`selftest` (`.claude/tests/profiles.test.sh`), which CI runs on every PR: the
new rule and the regex controls live there. No `required_gates` entry is
needed; the profiles suite is not optional.

**Decision on HARNESS-039's id rule: unchanged.** HARNESS-039 keyed the audit
on the id `mutation` exactly, and AC-4b pins that `mutants` / `rust-mutation`
are not flagged, "for the combining-profiles story". This story keeps that
limit and documents the convention instead of extending the rule, for three
reasons. (1) Extending it means `scripts/gates.sh`, `gates.test.sh` and
AC-4b's pinned assertion - a second RED->GREEN cycle on a different file set,
and `gates.sh` is not in `touches:` here. (2) The convention has to exist
before a rule can be keyed on it; naming it is this story's job, and the
natural key - ids ending in `mutation` - is written down below so that a later
story can make it mechanical without re-deciding it. (3) The only consumer the
issue describes (the Tauri project) has one mutation gate today; no consumer
needs the second id judged yet. The new `profiles.test.sh` rule added here is
keyed on the same id `mutation`, for the same reason and with the same stated
limit. If a consumer combines two profiles, the follow-up story extends both
rules to the suffix and changes AC-4b on purpose.

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC.
     An AC that names a statistic, a metric or a threshold names a NEGATIVE
     CONTROL too: the deliberately broken input the metric must reject, and
     roughly what it should score. -->

- **AC-1 (a mutation gate carries an evidence line)** — Given a profile
  fixture that configures `gate | mutation | optional | . | x mutants` and
  every other profile rule satisfied (`profiles.test.sh:136-153`'s
  `base_profile`), when `profile_problems` runs over it, then it prints exactly
  one `mutation-evidence` line whose message is C-3's text; with
  `evidence | mutation | -` appended it prints the same line (a `-` is a
  declaration that no output exists, and a mutation tool always prints a
  count); and - the control - with `evidence | mutation | [1-9][0-9]* caught`
  appended it prints nothing for `mutation-evidence`. Given the three shipped
  profiles that configure a `mutation` gate (`node-typescript.md`,
  `python-uv.md`, `rust-cargo.md`), when the per-profile loop runs, then each
  reports nothing for `mutation-evidence`.
- **AC-2 (the regex requires a killed count, through `gates.sh`)** — Given a
  `make_project_fixture` whose `mutation` gate is `required` and whose command
  `printf`s a canned line, and whose `evidence | mutation` line is copied
  verbatim out of the real profile, when `bash scripts/gates.sh --gate
  mutation` runs there, then for each of the three profiles: the tool's
  **killed-N>0 line** (C-4's positive, N as given) gives `PASS         mutation`
  and the **0-killed line** (C-4's negative) gives `FAIL         mutation (…
  ran but produced no evidence of work: expected /<regex>/)` - the exact
  wording `gates.sh:583-584` prints. *Control:* the negative lines are real
  shapes (C-4 says where each comes from), not garbage; a regex that matched
  any line with digits in it would pass them and go red here.
- **AC-3 (the shape is readable by the suite, not re-derived)** — Given the
  three profiles, when the suite reads each one's `evidence | mutation` regex
  with the same `rest(3)` logic `profile_problems` uses (`profiles.test.sh:33`),
  then the regex it feeds into AC-2's fixture is byte-identical to the one on
  the profile line - the suite holds no second copy of any regex, so loosening
  the real line (DV-1) is what goes red, not a private copy. Observable as:
  the string the suite extracted equals `grep`'s view of the line with
  `evidence | mutation |` and surrounding space removed.
- **AC-4 (node-typescript says how stryker runs on TS 7 / Vitest 5)** — Given
  `node-typescript.md` after GREEN, when read, then (a) within the ten lines
  after its `gate | mutation` line there is a sentence naming TypeScript 7 and
  Vitest 5 and pointing at the new section; (b) a section headed `## The
  mutation gate on TypeScript 7 / Vitest 5` exists and contains, in one
  indented or fenced block, the keys `testRunner`, `commandRunner`,
  `coverageAnalysis`, `timeoutMS`, `tsconfigFile` and `plugins`; (c) that
  section attributes every measurement to issue #104's reporter and contains
  the words `not re-measured`; (d) the line `Verified against vitest 5 and
  typescript 5 on Windows.` no longer exists in that spelling, and the
  sentence that replaces it names `unit` and `coverage` as the verified lines
  and says the `mutation` line was derived from the reporter source and not
  run. Each is a `grep -c` with an exact count (1, or 0 for (d)'s old line);
  the needles are pinned in C-6.
- **AC-5 (combining two profiles' mutation gates is written down)** — Given
  `.claude/skills/stack-profiles/SKILL.md` after GREEN, when read, then its
  "Choosing" section (after the "Mixed-stack projects are normal" sentence,
  `SKILL.md:56-57`) carries a paragraph that names the convention: keep
  `mutation` for one stack and name the other `<stack>-mutation` (the example
  `rust-mutation`), copy the `evidence`, `slow` and `ondemand` lines under
  the new id, tell `/audit-mutations` to run `--gate rust-mutation` too, and
  state that `gates.sh --audit` and `profiles.test.sh` judge the id
  `mutation` only (HARNESS-039 AC-4b). Needles pinned in C-7; `grep -c` of
  each is 1. `node-typescript.md` and `rust-cargo.md` each carry one line
  beside their `ondemand | mutation` line pointing at it.

## Contract

**Writes:** `.claude/skills/stack-profiles/reference/node-typescript.md`, `.claude/skills/stack-profiles/reference/python-uv.md`, `.claude/skills/stack-profiles/reference/rust-cargo.md`, `.claude/skills/stack-profiles/reference/new-profile.md`, `.claude/skills/stack-profiles/SKILL.md`, `.claude/skills/quality-gates/SKILL.md`, `.claude/tests/profiles.test.sh`, `.claude/tests/floors.conf`, `.claude/tests/selftest.test.sh`

Every path classifies as `harness` (`bash scripts/classify.sh` on each at
PLANNED: all nine print `harness`), so the phase lock freezes none of them.
The role boundary is honoured by the agents: RED writes `profiles.test.sh`,
`floors.conf` and `selftest.test.sh` only; GREEN writes the six documents
only. No existing export changes signature; there is no caller list.
`scripts/gates.sh` is **not** written (Context, the id decision).

**RED may amend any block below in place, with a reason; GREEN builds what
the amended block says.**

- **C-1 Where the rule lives (`.claude/tests/profiles.test.sh`, verified at
  PLANNED against release 84).** `profile_problems()` is the awk at `:28-91`;
  evidence lines are parsed at `:43` into `ev[id] = 1`, which records
  presence only. The new rule needs the regex text, so RED changes that line
  to also keep it: `ev[t($2)] = 1; evre[t($2)] = rest(3); next`. The rule
  itself goes in `END`, beside the `mutation-ondemand` rule at `:84-85`:

      if (("mutation" in gates) && (!("mutation" in ev) || evre["mutation"] == "-" || evre["mutation"] == ""))
        print "mutation-evidence\t<message of C-3>"

  `rest(3)` (`:33`) rejoins fields from `$3` with `|` and trims the ends, so
  a regex containing `[|]` or `[^|]` survives it - the same reason
  `gates.sh:157-158` uses `rest 3` ("so that a regex containing `|`
  survives"). The per-profile loop at `:180-205` gains one `check
  mutation-evidence "$name: its mutation gate has an evidence line"` inside
  the existing `if has_mutation_gate "$f"` at `:202-204`. The fixture checks
  follow the `ondemand_probs` pattern at `:126-166` (`base_profile`, append
  one line, compare the one check's output).
- **C-2 Where AC-2 lives.** Also `profiles.test.sh`, after the fixture
  checks: it sources `_lib.sh` already (`:16`), so `make_project_fixture` and
  `write_conf` (`_lib.sh:123-137`) are available. One helper, roughly
  `mutation_gate_verdict <profile> <canned line>`: extracts the regex from the
  profile (AC-3; `awk -F'|'` with the same `rest` logic, or `profile_problems`
  extended to print it under a `mutation-regex` tag - RED's choice, as long as
  there is one extraction and it is asserted equal to the line's text),
  writes a conf of exactly

      gate     | mutation | required | . | printf '%s\n' '<canned line>'
      evidence | mutation | <regex>
      ondemand | mutation | fixture

  and runs `bash scripts/gates.sh --gate mutation` in the fixture, returning
  the `PASS`/`FAIL` line. The gate is `required` in the fixture so that a
  non-match is a `FAIL` line rather than a `WARN` (an optional gate's
  no-evidence outcome is a WARN and the run still prints "All required gates
  passed" - measured at PLANNED, which is why the fixture must say
  `required`). `--gate` is not recorded and runs an `ondemand` gate
  (`gates.sh:7`). Needles: `^PASS +mutation ` and
  `^FAIL +mutation .*ran but produced no evidence of work`, counted with the
  suite's existing `assert_contains`/`assert_eq` on the grep'd line. The
  `printf '%s\n'` with the canned line single-quoted is what keeps `|`, `*`
  and the emoji literal through `eval` (`gates.sh:560`).

  **RED amendment (2026-10-07): the fixture conf has NO `ondemand` line.**
  As written above, every verdict came back `FAIL mutation (an on-request
  gate cannot be required: no full run would ever judge it)` - `gates.sh:388`
  refuses a gate that is both `ondemand` and `required`, before the command
  runs. The PLANNED measurement in `## Notes` used ids `mutation0`/`mm`/`cm`
  with no `ondemand` line, which is why it did not meet this. `--gate`
  runs a gate by name whether or not it is on request, so the conf is the
  first two lines only. Also measured: a failing gate's results line ends in
  ` -> .claude/state/gate-logs/mutation.log`; the suite strips that suffix and
  the duration and compares the rest of the line exactly (`FAIL mutation, ran
  but produced no evidence of work: expected /<regex>/`), which is stricter
  than C-2's floating needle.
- **C-3 Message**, pinned byte for byte so RED's needle and GREEN's print
  cannot drift (as HARNESS-039 C-3 did). The text after the tab:

      configures a `mutation` gate with no `evidence | mutation | <regex>` line, so a runner that tests nothing passes it

  The same sentence shape as the `mutation-ondemand` message at `:85`, which
  `new-profile.md:51-55` paraphrases; GREEN adds "and an `evidence` line whose
  regex requires a killed count" to that list (C-8).
- **C-4 The three regexes and their canned lines.** Each regex is an awk ERE
  matched per line, unanchored, after `clean_log` has stripped ANSI colour and
  trailing CR (`gates.sh:263-266`, `:580`). No `\d`, no `{n}` intervals, no
  `\|`: CI's awk is mawk, and `[|]` / `[^|]` are POSIX bracket expressions
  every awk reads the same way (`\|` in a dynamic regex is engine-dependent).
  All three were run through `gates.sh` itself at PLANNED on a fixture, on
  gawk 5.4.1 / Windows: the positive lines `PASS`, the negatives `FAIL` with
  the C-2 wording.

  **node-typescript** (`evidence | mutation | All files *[|][^|]*[|][^|]*[|] *[1-9][0-9]* [|]`).
  Stryker's clear-text reporter draws a score table whose totals row is
  labelled `All files` (`packages/core/src/reporters/clear-text-score-table.ts`,
  `FILES_ROOT_NAME`, read 2026-10-06 on stryker-js `master`) with the
  columns, in order: `% Mutation score` total, covered, `# killed`,
  `# timeout`, `# survived`, `# no cov`, `# errors`; cells are right-padded
  values joined by `|` with a trailing `|`; the score cells are chalk-coloured
  (stripped by `clean_log`), the count cells are not; the table is written to
  `process.stdout`, not through the logger, so the row has no timestamp
  prefix. The regex walks three `|`-separated cells from `All files` and
  requires the third - `# killed` - to be a number not starting with `0`.
  The semantics: *a Stryker run in which no mutant was killed is not evidence
  that the tests were run.* Canned lines (shape from the source, numbers from
  issue #104):

      positive:  All files         |   85.79 |    85.79 |       156 |         0 |        27 |        0 |        0 |
      negative:  All files         |    0.00 |     0.00 |         0 |         0 |        19 |        0 |        0 |
      negative:  All files | n/a | n/a | 0 | 0 | 0 | 0 | 0 |

  **Honest limit, to be written into the profile:** the reporter's first
  measurement (85.79%, 156 killed) *would pass this line* - those 156 were
  static mutants, killed without the runner, while 0 of 22 runtime mutants
  were. The line catches the second shape (0 of 19) and the pure
  nothing-ran case. Under the configuration the profile now recommends,
  `coverageAnalysis: "off"`, no mutant is classified static (Stryker's
  `docs/configuration.md`: detecting static mutants "needs per test coverage
  analysis"), so every kill is one the command runner actually ran, and the
  line then means what it says. The profile says both halves.
  **No `floor` on this line**: `work_count` (`gates.sh:279-283`) reads the
  first digit run at or after the match, which is the score (`observed 85` on
  the positive row at PLANNED), not the kill count. Say so beside the line.

  **rust-cargo** (`evidence | mutation | [1-9][0-9]* caught`). cargo-mutants
  prints one summary line, `summary_string()` in `src/outcome.rs` (read
  2026-10-06): `<N> mutant(s) tested[ in <t>]: ` then, comma-joined, only the
  non-zero outcomes in the order `missed`, `caught`, `unviable`, `timeouts`,
  `succeeded`. **Measured here at PLANNED with cargo-mutants 27.1.0** on a
  one-function scratch crate: `4 mutants tested in 4s: 4 caught` and
  `4 mutants tested in 3s: 3 missed, 1 caught`. A run with no kills omits
  `caught` altogether, so the regex has nothing to match. Canned lines:

      positive:  4 mutants tested in 4s: 4 caught                      (measured)
      positive:  6 mutants tested in 1m 2s: 2 missed, 3 caught, 1 unviable
      negative:  3 mutants tested in 20s: 3 missed
      negative:  src/a.rs:3:5: replace f -> u8 with 1 ... caught in 0.1s   (a verbose per-mutant line; no digit directly before " caught")

  `work_count` reads `3` from the positive: a `floor` on this line is
  meaningful (the kill count), and the profile may say so.

  **python-uv** (`evidence | mutation | 🎉 [1-9][0-9]*`). mutmut 3's final
  status line is `print_stats()` in `src/mutmut/stats.py:102` (read
  2026-10-06): `{tested}/{total}  🎉 {killed} 🫥 {no_tests}  ⏰ {timeout}  🤔
  {suspicious}  🙁 {survived}  🔇 {skipped}  🧙 {caught_by_type_check}`, printed
  with `force_output=True` when the run ends (`__main__.py:1070`). The killed
  count follows the 🎉 and is the only number that does. The emoji is a
  4-byte UTF-8 literal; at PLANNED it matched byte-for-byte under both the
  UTF-8 and the C locale on gawk, and through `gates.sh` on the fixture.
  **UNVERIFIED against a mutmut run** - mutmut is not installed here - and
  the profile keeps its existing `# UNVERIFIED` comment style for it
  (`python-uv.md:28-29` precedent). Canned lines:

      positive:  1234/1234  🎉 1000 🫥 0  ⏰ 0  🤔 0  🙁 234  🔇 0  🧙 0
      negative:  19/19  🎉 0 🫥 0  ⏰ 0  🤔 0  🙁 19  🔇 0  🧙 0

- **C-5 Oracle partition.** Every criterion is **mechanical**: pin exactly.
  AC-1: one line, C-3's text, count 1 / 0. AC-2: `PASS`/`FAIL` lines through
  the real `gates.sh`, with C-4's lines verbatim - RED does not invent other
  lines, and does not weaken a negative to make it "more realistic". AC-3:
  string equality. AC-4, AC-5: `grep -c` of pinned needles (C-6, C-7). The
  numbers 85.79, 156, 19, 22 and the toolchain versions are **settled**
  (the reporter's, cited); the cargo-mutants lines are **settled** (measured
  at PLANNED, above). Nothing is oracle-free.
- **C-6 node-typescript.md, what GREEN writes (line numbers verified at
  PLANNED, release 84).**
  (a) After `:16` (`ondemand | mutation | …`), one indented comment line in
  the same block or one sentence directly under it: "On TypeScript 7 or
  Vitest 5, `stryker run` as shipped does not work; see *The mutation gate on
  TypeScript 7 / Vitest 5* below." Needle for AC-4(a): `TypeScript 7`
  within `sed -n 15,26p`.
  (b) In the evidence block (`:30-33`) add
  `evidence | mutation | All files *[|][^|]*[|][^|]*[|] *[1-9][0-9]* [|]`
  with two comment lines: the third numeric column of the `All files` row is
  `# killed`, and no `floor` (reads the score). Needle: the regex line,
  `grep -cF`.
  (c) Replace `:45`'s first sentence, "Verified against vitest 5 and
  typescript 5 on Windows." with: "The `unit` and `coverage` lines were
  verified against vitest 5 and typescript 5 on Windows; the `mutation` line
  was not run here - its shape is derived from Stryker's clear-text reporter
  source and checked by `profiles.test.sh` against canned rows, not against a
  Stryker run." Needles for AC-4(d): `grep -c 'Verified against vitest 5 and
  typescript 5 on Windows\.'` is 0; `grep -c 'The .unit. and .coverage. lines
  were verified'` is 1.
  (d) New section `## The mutation gate on TypeScript 7 / Vitest 5`, placed
  after `## What --fast should leave out` (`:56-65`) and before `## The 5,000
  ms default…` (`:67`), containing: the toolchain the reporter measured on
  (Context), the sentence "These are the reporter's measurements (issue #104,
  section 2), not re-measured here: that toolchain is not installed in the
  harness repository."; the two failure modes (`TSConfigPreprocessor` /
  `ts.parseConfigFileTextToJson` whenever `tsconfigFile` names an existing
  file, `checkers: []` not enough; vitest-runner 10.0.0 under vitest 5.0.0
  runs no tests, reports 85.79% and 0 of 19, `--maxTestRunnerReuse 1` and
  `--coverageAnalysis off` do not fix it, `--logLevel debug` crashes it); the
  working configuration in one block:

      // stryker.config.mjs - the shape the reporter measured working
      export default {
        testRunner: "command",
        commandRunner: { command: "pnpm exec vitest related --run <the files named in mutate>" },
        coverageAnalysis: "off",      // no static-mutant bookkeeping; every kill is a real run
        timeoutMS: 60000,             // 5,000 default: 5 of 19 were false timeouts on Windows
        tsconfigFile: "tsconfig.none.json",  // a path that does NOT exist, on TS 7
        plugins: [],                  // the command runner is built in; under pnpm a runner
                                      // plugin, if you use one, must be listed here explicitly
      };

  and the reporter's results with it (19 of 19 killed on the small file; 155
  killed / 22 timeouts / 6 survivors on the 501-line one), the note that
  `tsconfigFile` pointing nowhere loses nothing when `tsconfig.json` has no
  `extends` or `references`, and C-4's honest limit of the evidence line.
  Needles for AC-4(b): `grep -c '^## The mutation gate on TypeScript 7 / Vitest 5$'`
  is 1 and each of `testRunner`, `commandRunner`, `coverageAnalysis`,
  `timeoutMS`, `tsconfigFile`, `plugins` has `grep -c` >= 1 in the file;
  AC-4(c): `grep -c 'not re-measured'` is 1.

  **RED amendment (2026-10-07): the needles are counted per PARAGRAPH, not
  per line.** A paragraph is a run of non-blank lines joined with single
  spaces (a leading `#` on a joined comment line dropped). Reason: a
  per-line `grep -c` counts one wrapped sentence twice, or misses a needle
  split by the wrap, so it would pin GREEN's line breaks rather than its
  words. What the suite asserts, exactly:
  (a) the ten lines after the `gate | mutation` line (located, not assumed to
  be `:15`), joined, contain `The mutation gate on TypeScript 7 / Vitest 5`
  exactly once - so C-6(a)'s pointer must quote the section title in that
  spelling, and the window must hold it once (the `Combining this with` line
  of C-7 does not contain it);
  (b) heading line exact, count 1; the heading's line number is after
  `## What \`--fast\` should leave out` and before `## The 5,000 ms default`;
  and the FIRST indented (4-space) or fenced block in the section that
  contains `testRunner` also contains each of `commandRunner`,
  `coverageAnalysis`, `timeoutMS`, `tsconfigFile`, `plugins` (AC-4(b)'s "in
  one block", not merely somewhere in the file);
  (c) exactly one paragraph of the section contains `not re-measured`, and
  the section contains `issue #104`;
  (d) no paragraph of the file contains `Verified against vitest 5 and
  typescript 5 on Windows.`; exactly one contains ``The `unit` and
  `coverage` lines were verified``; and THAT paragraph also contains
  ``  `mutation` line was not run`` and `reporter source` (AC-4(d)'s "derived
  from the reporter source and not run"; C-6(c)'s replacement text satisfies
  all three).
- **C-7 SKILL.md and the pointers.** After `stack-profiles/SKILL.md:57`
  ("…two sets of gates with distinct ids, and one `paths.conf`.") a paragraph
  whose needles are `rust-mutation`, `--gate rust-mutation`, `HARNESS-039`
  and `judge the id \`mutation\` only` (each `grep -c` 1). In
  `node-typescript.md` and `rust-cargo.md`, one line beside the `ondemand`
  line: "Combining this with another profile's `mutation` gate: see the
  stack-profiles skill, *Choosing*." (needle `Combining this with`, count 1
  in each). The convention, stated once in SKILL.md: a second mutation gate's
  id **ends in `mutation`** (`rust-mutation`, `python-mutation`) so a later
  story can key the audit on the suffix; `mutation` itself stays the one
  `/audit-mutations` runs by default.

  **RED amendment (2026-10-07): counted per paragraph, and in one
  paragraph.** As pinned above, `grep -c rust-mutation` is 1 is
  unsatisfiable by any paragraph that also contains `--gate rust-mutation` on
  a different line (that line contains `rust-mutation` too). The suite takes
  the text from the `Mixed-stack projects are normal` line to the next `## `
  heading, joins it into paragraphs, and asserts that exactly ONE paragraph
  contains each of `rust-mutation`, `--gate rust-mutation`, `HARNESS-039` and
  ``judge the id `mutation` only``; and that the paragraph containing `--gate
  rust-mutation` also contains `evidence`, `slow`, `ondemand`,
  `/audit-mutations`, `gates.sh --audit` and `profiles.test.sh` (AC-5's
  list). So GREEN writes it as ONE paragraph - no blank line, no code block
  inside it. The pointers: `Combining this with` is on exactly one line of
  each of `node-typescript.md` and `rust-cargo.md`, within 4 lines of that
  file's `ondemand | mutation` line.
- **C-8 Two one-line document edits.** `new-profile.md:51-55`: the rule list
  gains "a `mutation` gate has an `ondemand` line and an `evidence` line
  whose regex requires a non-zero killed count". `quality-gates/SKILL.md:326`:
  the waiver example's reason, "stryker needs a TS compiler API TS 7 lacks;
  stack.md s4", is now contradicted by the profile; GREEN changes it to a
  reason that is still true, e.g. "stryker's vitest runner tests nothing
  under vitest 5; command runner not wired yet - node-typescript.md", keeping
  the line's shape. No test pins either edit; review does.
- **C-9 Floors.** `floors.conf` has `floor | profiles | 50` and
  `selftest.test.sh:545` has `profiles 50` in its hand-copied `COUNTS` table.
  RED measures the new executed count with `bash scripts/selftest.sh
  profiles` (the `N passed, M failed` sum) and raises **both** in the RED
  commit, with the usual comment block in `floors.conf` (its HARNESS-039 and
  HARNESS-040 blocks are the shape). Estimate, not a floor: AC-1 fixtures 3
  + per-profile 3, AC-2 three profiles x (one positive + one or two
  negatives) 7-9, AC-3 3, AC-4 ~10, AC-5 ~6 - roughly 32-35 new, so about
  82-85. The number RED records is the measured one.

  **RED amendment (2026-10-07): there is a third copy.**
  `selftest.test.sh:563-564` names the profiles floor in an assertion of its
  own ("profiles is floored at its 50 executed assertions"); `bash
  scripts/selftest.sh selftest` failed on it after the first two were raised.
  RED raised all three to the measured 102.
- **C-10 Test-only dependencies.** None. The suite is bash + awk + the
  existing `_lib.sh`.

## Deferred verifications

Budget per `rules.md`, "Mutation work per story": one "defect put back"
(DV-1) and, because the story adds a rule over the tree, one probe against a
REAL line of it (DV-2). `## Gate probes` is omitted, as HARNESS-039 did: this
repository's own gates are unchanged, and the evidence line this story adds is
a profile's, exercised permanently by AC-2 through the real `gates.sh` and
once more by DV-1 here. Each runs against the one suite that holds its
assertion, `profiles`, through `scripts/mutate.sh`, which restores the file and
proves it.

- **DV-1 (defect put back: a regex that accepts a kill-less run).** Owner:
  GATES. With the real `node-typescript.md` evidence regex loosened so that a
  `0` in the killed column matches, AC-2's node-typescript negative assertion
  **must** go red (RED predicts the exact count in `## Handoff`; it should be
  the one or two negative-line assertions for that profile and nothing else -
  the positive stays green, which is the point) while rust-cargo's and
  python-uv's stay green. RED cannot run it: the line does not exist in RED.
  One `sed` expression:

      bash scripts/mutate.sh .claude/skills/stack-profiles/reference/node-typescript.md 's/\[1-9\]\[0-9\]\* \[|\]/[0-9]* [|]/' -- bash scripts/selftest.sh profiles

  (`[1-9][0-9]* [|]` occurs once in the file after GREEN - the `unit`/`coverage`
  lines end in `passed`, not `[|]`; GREEN keeps it so, and GATES checks
  `grep -cF '[1-9][0-9]* [|]'` prints `1` before mutating.) GATES pastes the
  mutated run's `profiles: N passed, M failed` with the failing names, the
  `mutate.sh` restore line, and a clean re-run. If the negative stays green
  under this mutation, the assertion is not reading the real line (AC-3) and
  that is a return to RED, not a note.
- **DV-2 (the presence rule against a real line of the tree).** Owner: GATES.
  With the real `rust-cargo.md` `evidence | mutation` line deleted, AC-1's
  per-profile assertion for `rust-cargo.md` **must** print C-3's message and go
  red, and AC-2's rust-cargo assertions go red with it (no regex to extract);
  the other two profiles stay green. RED cannot run it: the rule does not
  exist in RED. One `sed` expression:

      bash scripts/mutate.sh .claude/skills/stack-profiles/reference/rust-cargo.md '/^ *evidence *| *mutation *|/d' -- bash scripts/selftest.sh profiles

  GATES pastes the mutated run's failing names, the restore line, and a clean
  re-run. This is the probe `rules.md` ("A rule is probed against the tree it
  judges") owes: AC-1's fixtures were written from the same reading of the
  line shape as the rule, and only a real profile line says the rule can see
  the spelling the tree uses.

### Results, run at GATES (2026-10-06) by the orchestrator

Both through `scripts/mutate.sh` with the one expression written above, detached, one at a time, against the GREEN commit; each restore verified. Both match the handoff exactly (DV-2 at 7 because GREEN added no `floor | mutation` to rust-cargo.md).

**DV-1, the defect put back (0 killed matches): `profiles: 100 passed, 2 failed`, the two node-typescript negatives only.**

```
=== mutate: .claude/skills/stack-profiles/reference/node-typescript.md (1 line(s) changed by s/\[1-9\]\[0-9\]\* \[|\]/[0-9]* [|]/) ===
  42 -     evidence | mutation    | All files *[|][^|]*[|][^|]*[|] *[1-9][0-9]* [|]
  42 +     evidence | mutation    | All files *[|][^|]*[|][^|]*[|] *[0-9]* [|]
=== mutate: running bash scripts/selftest.sh profiles ===
    FAIL AC-2: node-typescript.md: the All files row with 0 killed (0 of 19, issue #104) fails the mutation gate as no evidence of work
    FAIL AC-2: node-typescript.md: the All files row of a run with nothing in it fails the mutation gate as no evidence of work
profiles: 100 passed, 2 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /d/agentic-dev-harness/.claude/worktrees/nostalgic-williams-fcf700/.claude/state/mutations/.claude_skills_stack-profiles_referenc
```

**DV-2, the real-tree probe (rust-cargo.md's real evidence line deleted): `profiles: 95 passed, 7 failed`, including the presence rule's message.**

```
=== mutate: .claude/skills/stack-profiles/reference/rust-cargo.md (1 line(s) changed by /^ *evidence *| *mutation *|/d) ===
  49 -     evidence | mutation | [1-9][0-9]* caught
=== mutate: running bash scripts/selftest.sh profiles ===
    FAIL AC-3: rust-cargo.md has exactly one evidence | mutation line
    FAIL AC-3: the regex the suite extracts from rust-cargo.md is byte-identical to the line
    FAIL AC-2: rust-cargo.md: 4 caught (measured, cargo-mutants 27.1.0) passes the mutation gate
    FAIL AC-2: rust-cargo.md: 3 caught among missed and unviable passes the mutation gate
    FAIL AC-2: rust-cargo.md: a summary with no caught outcome fails the mutation gate as no evidence of work
    FAIL AC-2: rust-cargo.md: a verbose per-mutant 'caught in' line fails the mutation gate as no evidence of work
    FAIL rust-cargo.md: its mutation gate has an evidence line
profiles: 95 passed, 7 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /d/agentic-dev-harness/.claude/worktrees/nostalgic-williams-fcf700/.claude/state/mutations/.claude_skills_stack-profiles_referenc
```

## Amendments

<!-- Acceptance criteria are frozen once the story leaves PLANNED. If one turns
     out to be wrong or unsatisfiable, stop, put it to the product owner, and
     record the change here: which AC, what it said, what it says now, who
     approved it and why. check-boundaries.sh fails a PR whose criteria differ
     from their last committed PLANNED state (else the base branch) without an
     entry here. Omit the section if unused.
     Where the change came from a subagent's claim that the criterion was
     wrong, record the ORCHESTRATOR'S OWN reproduction of it - different
     inputs, not the subagent's code. That claim is also what an agent says
     when it wants to stop failing. -->

## Model guidance

Planned by `bash scripts/plan.sh write HARNESS-041` from `.claude/harness/models.conf`.
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

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->

- PLANNED, `lead-po`, resolved to **Fable 5.1** (`claude-fable-5-1`), as
  planned; no override was reported to the dispatcher.
- RED, `test-developer`, resolved to Opus 5.5 (`claude-opus-5-5`), as planned; no override. Orchestrator re-ran profiles (55/47) and selftest (268/0), matching the handoff; ## Acceptance criteria unchanged since the PLANNED commit.
- GREEN, `feature-developer`, resolved to Opus 5.5 (`claude-opus-5-5`), as planned; no override. Orchestrator re-ran profiles (102/0). The orchestrator also corrected the matching out-of-date waiver example in `.claude/harness/project.conf:219` (a comment, the Lead PO's file), which GREEN found but correctly left, since it was outside `touches:`.
- GATES: no dispatch. The orchestrator (`claude-opus-5-5`) ran DV-1, DV-2, `gates.sh` and the full selftest.

## Out of scope

- **Re-measuring anything on TS 7 / Vitest 5.** That toolchain is not
  installed here; every number in the new section is the reporter's and is
  attributed as such. A consumer that runs the configuration and finds a
  number wrong files it against the profile, not against the harness's
  measurements, because the harness made none.
- **Extending `gates.sh --audit` or `profiles.test.sh` to ids other than
  `mutation`** (`rust-mutation`, `mutants`). HARNESS-039 AC-4b's limit stands
  (Context, the id decision). The convention is named here so that the
  follow-up can key on the suffix; it is cut only when a consumer combines two
  profiles. `scripts/gates.sh` and `gates.test.sh` are not written.
- **An `evidence` line in this repository's own `project.conf`**, whose
  `mutation` gate has no command (`project.conf:272`) and whose evidence block
  is empty by design ("filled in by the bootstrap story").
- **Verifying the mutmut regex against a mutmut run**, or the Stryker regex
  against a Stryker run. Both are derived from the tools' source at a named
  date and marked so; the cargo-mutants one is measured. A consumer's
  bootstrap story corrects a profile line against real output, as the
  profiles already say for `lint` and `build`.
- **The `Ran N tests per mutant on average.` line** Stryker's reporter also
  prints (`clear-text-reporter.ts:150`), which would read `0.00` in the
  broken-runner case and catch the 85.79% shape this story's line cannot.
  Its presence depends on `clearTextReporter.reportMutants` and could not be
  confirmed here; the profile may mention it as a second, unverified needle
  for a consumer to confirm, but no `evidence` line is built on it.
- Changing the `ondemand`, `slow` or gate-command lines of any profile.
- Fixing any consumer's `project.conf` or `stryker.config`.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

<!-- Filled by the Test Developer during RED: which tests, at which level,
     and which AC each one covers. -->

All in `.claude/tests/profiles.test.sh`; level is the suite's own: awk over
fixtures and real profile files, and the real `scripts/gates.sh` run in a
`make_project_fixture` for AC-2. 52 new executed assertions (50 -> 102).

| Block (describe) | Assertions | AC |
|---|---|---|
| the checker requires a mutation gate's evidence line | 5: no evidence line -> C-3 message; `-` -> same; empty regex -> same; control `[1-9][0-9]* caught` -> silent; control: no mutation gate -> silent | AC-1 |
| per-profile loop, `check mutation-evidence` | 3: node-typescript, python-uv, rust-cargo each report nothing | AC-1 (DV-2's target) |
| each profile's mutation evidence regex is read off the line, once | 6: per profile, exactly one `evidence \| mutation` line; `mutation_regex` (the shared `rest(3)`) equals the grep view of the line | AC-3 |
| each profile's mutation regex requires a killed count, judged by the real gates.sh | 9: node positive PASS, two negatives FAIL; rust two positives PASS, two negatives FAIL; python positive PASS, negative FAIL - C-4's lines verbatim, regex fed from `mutation_regex` | AC-2 (DV-1's target) |
| node-typescript says how stryker runs on TypeScript 7 / Vitest 5 | 15: (a) pointer in the window, once; (b) heading once, placement, six keys in one block; (c) `not re-measured` once, `issue #104`; (d) old sentence gone, new one present once, names the `mutation` line as not run, names the reporter source | AC-4 |
| combining two profiles' mutation gates is written down | 14: four C-7 needles each in exactly one paragraph after "Mixed-stack"; that paragraph names `evidence`, `slow`, `ondemand`, `/audit-mutations`, `gates.sh --audit`, `profiles.test.sh`; per pointer file, `Combining this with` once and within 4 lines of `ondemand \| mutation` | AC-5 |

Not covered by a test, by the Contract's design: C-8's two one-line edits
(`new-profile.md`, `quality-gates/SKILL.md`) - review pins them.

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

RED by `test-developer`, resolved model **Opus 5.5** (`claude-opus-5-5`), as
planned; no override reported.

**Command:** `bash scripts/selftest.sh profiles` (or `bash
.claude/tests/profiles.test.sh` for the suite alone). About 11 s here, most of
it the nine `gates.sh` runs.

**Files touched in RED:** `.claude/tests/profiles.test.sh`,
`.claude/tests/floors.conf` (profiles 50 -> 102, comment block),
`.claude/tests/selftest.test.sh` (COUNTS row `profiles 102`, and the
`profiles is floored at its 102 executed assertions` assertion at :563-564 -
see C-9's amendment), and this story (Contract amendments to C-2, C-6, C-7,
C-9; Test plan; this handoff). Nothing under `.claude/skills/`.

**Failure output on this tree (2026-10-07, the six documents unchanged):**

    profiles: 55 passed, 47 failed

    FAIL AC-3: node-typescript.md has exactly one evidence | mutation line          (expected 1, actual 0)
    FAIL AC-3: the regex the suite extracts from node-typescript.md is byte-identical to the line
    FAIL AC-3: python-uv.md has exactly one evidence | mutation line
    FAIL AC-3: the regex the suite extracts from python-uv.md is byte-identical to the line
    FAIL AC-3: rust-cargo.md has exactly one evidence | mutation line
    FAIL AC-3: the regex the suite extracts from rust-cargo.md is byte-identical to the line
    FAIL AC-2: node-typescript.md: the All files row with 156 killed passes the mutation gate
    FAIL AC-2: node-typescript.md: the All files row with 0 killed (0 of 19, issue #104) fails the mutation gate as no evidence of work
             expected: FAIL mutation, ran but produced no evidence of work: expected /<no regex>/
             actual:   <no evidence | mutation regex in node-typescript.md>
    FAIL AC-2: node-typescript.md: the All files row of a run with nothing in it fails the mutation gate as no evidence of work
    FAIL AC-2: rust-cargo.md: 4 caught (measured, cargo-mutants 27.1.0) passes the mutation gate
    FAIL AC-2: rust-cargo.md: 3 caught among missed and unviable passes the mutation gate
    FAIL AC-2: rust-cargo.md: a summary with no caught outcome fails the mutation gate as no evidence of work
    FAIL AC-2: rust-cargo.md: a verbose per-mutant 'caught in' line fails the mutation gate as no evidence of work
    FAIL AC-2: python-uv.md: 1000 killed of 1234 passes the mutation gate
    FAIL AC-2: python-uv.md: 0 killed of 19 fails the mutation gate as no evidence of work
    FAIL node-typescript.md: its mutation gate has an evidence line
             actual:   - configures a `mutation` gate with no `evidence | mutation | <regex>` line, so a runner that tests nothing passes it
    FAIL python-uv.md: its mutation gate has an evidence line
    FAIL rust-cargo.md: its mutation gate has an evidence line
    FAIL AC-4(a): within ten lines of its mutation gate, node-typescript points at the TypeScript 7 / Vitest 5 section, once
    FAIL AC-4(b): node-typescript has the heading '## The mutation gate on TypeScript 7 / Vitest 5', once
    FAIL AC-4(b): the section sits after 'What --fast should leave out' and before 'The 5,000 ms default'
    FAIL AC-4(b): the section's configuration block sets testRunner   (and commandRunner, coverageAnalysis, timeoutMS, tsconfigFile, plugins)
    FAIL AC-4(c): the section says 'not re-measured', once
    FAIL AC-4(c): the section attributes its measurements to issue #104
    FAIL AC-4(d): 'Verified against vitest 5 and typescript 5 on Windows.' no longer appears in that spelling   (expected 0, actual 1)
    FAIL AC-4(d): one paragraph says the `unit` and `coverage` lines were verified
    FAIL AC-4(d): and that the `mutation` line was not run
    FAIL AC-4(d): and that its shape is derived from the reporter source
    FAIL AC-5: one paragraph after 'Mixed-stack projects are normal' in Choosing names 'rust-mutation'   (and '--gate rust-mutation', 'HARNESS-039', 'judge the id `mutation` only')
    FAIL AC-5: the combining paragraph names evidence   (and slow, ondemand, /audit-mutations, gates.sh --audit, profiles.test.sh)
    FAIL AC-5: node-typescript.md says 'Combining this with', once
    FAIL AC-5: node-typescript.md's pointer sits beside its ondemand | mutation line
    FAIL AC-5: rust-cargo.md says 'Combining this with', once
    FAIL AC-5: rust-cargo.md's pointer sits beside its ondemand | mutation line

(Abridged: one line per failing name, grouped where marked; the run prints
all 47 with expected/actual.) **Why it is the right failure:** every red is
an absence in one of the documents GREEN writes - no `evidence | mutation`
line in the three profiles, no section/sentence/paragraph/pointer. None is a
harness error: the suite loads, the `gates.sh` fixture builds, and AC-2's
verdicts report the missing regex by name rather than reaching `gates.sh`
with an empty one.

`selftest.sh`'s floor line reads `55 assertions executed, 50 declared` on a
single-suite run with the old floor; with the new floor of 102 the suite sits
below its floor until GREEN turns the 47 green - the HARNESS-015/-040
precedent ("the count is the floor, the failures are the story").

**What GREEN writes, as the tests pin it** (the "export shape" of a docs
story - the lines the suite reads):

- One `evidence | mutation | <regex>` line in each of the three profiles,
  4-space indented like its neighbours, **no trailing comment on the same
  line** (`rest(3)` - in the suite AND in `gates.sh` - would make the comment
  part of the regex; put comments on the lines above). The regex is C-4's,
  verbatim. In node-typescript.md, `[1-9][0-9]* [|]` must occur exactly once
  (DV-1's `sed` target).
- node-typescript.md: per C-6 and its RED amendment - the pointer quoting
  `The mutation gate on TypeScript 7 / Vitest 5` once within ten lines after
  the gate line; the heading between the two named sections; the config as
  one indented or fenced block containing all six keys; `not re-measured` in
  exactly one paragraph of the section, `issue #104` in it; C-6(c)'s
  replacement sentence (its wording satisfies all three (d) needles - keep
  ``The `unit` and `coverage` lines were verified``, ``the `mutation` line
  was not run`` and `reporter source` in that one paragraph).
- stack-profiles/SKILL.md: ONE paragraph (no blank line, no code block
  inside) after the "Mixed-stack" paragraph and before `## Guards that scan
  the source tree`, per C-7's RED amendment.
- `Combining this with` on one line in each of node-typescript.md and
  rust-cargo.md, within 4 lines of the `ondemand | mutation` line.

Not constrained: wording beyond the needles; where in the evidence block the
new line sits; whether rust-cargo.md adds `floor | mutation` (allowed by C-4,
but it changes DV-2's count - below); C-8's two edits.

**The rule itself is RED's and is written** (C-1): `evre[t($2)] = rest(3)` at
the evidence parse, and the `mutation-evidence` rule in `END` with C-3's
message. The awk helpers `t()`/`rest()` were lifted into one shell variable,
`PROFILE_FIELDS`, prepended to both `profile_problems` and the new
`mutation_regex`, so AC-3's "one extraction" is structural.

**Passed on arrival, and what earns each:**

- AC-1's five fixture checks. The three that expect C-3's message were
  watched fail before the `END` rule existed (parse change in, rule not yet
  written):

      the checker requires a mutation gate's evidence line (HARNESS-041, AC-1)
        FAIL AC-1: a mutation gate with no evidence line is reported, once, in C-3's words
             expected: configures a `mutation` gate with no `evidence | mutation | <regex>` line, so a runner that tests nothing passes it
             actual:
        FAIL AC-1: an evidence line of '-' for the mutation gate is reported the same way
        FAIL AC-1: an evidence line with an empty regex for the mutation gate is reported the same way
      profiles: 52 passed, 3 failed

  The two silent controls pass with or without the rule; they are earned by
  those three firing on the same `base_profile`, and by the candidate run
  below where `-` on a real profile line fires the per-profile check.
- Everything else new is red now.

**Negative controls - expected values.** No assertion against a real
mutation line has run, because no such line exists. I measured them on a
**candidate GREEN** outside the tree: copies of the six documents in the
scratchpad with C-4's three lines and minimal prose added, the suite copied
with `PROFILE_DIR`/`STACK_SKILL` pointed at them (`_lib.sh` and `gates.sh`
the real ones). Clean candidate: `profiles: 102 passed, 0 failed`, identical
under `LC_ALL` unset, `C`, `C.UTF-8` and `en_US.UTF-8` (MSYS bash, gawk
5.4.1). Then one change each:

| Candidate change | Threshold the suite holds | Expected failing | Measured |
|---|---|---|---|
| none | - | 0 | `102 passed, 0 failed` |
| DV-1: node `[1-9][0-9]* [|]` -> `[0-9]* [|]` | killed column must start 1-9 | exactly the 2 node negatives (0-killed row, n/a row) | `100 passed, 2 failed`, those two |
| node regex -> `[0-9]` (matches any digit) | negatives are real shapes | the same 2 node negatives | `100 passed, 2 failed` |
| node regex -> `-` | `-` is not an evidence regex | 2 node negatives + node per-profile `mutation-evidence` | `99 passed, 3 failed` |
| python `🎉 [1-9][0-9]*` -> `🎉 [0-9]*` | killed count after the emoji must start 1-9 | python 0-of-19 negative | `101 passed, 1 failed` |
| rust `[1-9][0-9]* caught` -> `[0-9]* caught` | a digit run directly before ` caught` | rust verbose `caught in` negative (the `3 missed` line has no `caught`, so it stays FAIL either way) | `101 passed, 1 failed` |
| DV-2: rust `evidence \| mutation` line deleted | presence rule on a real line | AC-3 rust x2, AC-2 rust x4, per-profile rust `mutation-evidence` = 7 (8 if GREEN adds `floor \| mutation` to rust-cargo.md: the `floor` check fires too) | `95 passed, 7 failed` |

These are claims about the candidate, not the shipped documents: GREEN
confirms the clean `102 passed, 0 failed` on the real tree, and GATES runs
DV-1 and DV-2 through `scripts/mutate.sh` against the real files and checks
the counts above (DV-1: `100 passed, 2 failed`, the two node negatives only;
DV-2: 7, or 8 with a rust floor).

**Deferred verifications:** DV-1 and DV-2 are owned by GATES and I did not
run them: in RED the lines they mutate do not exist. The table above is the
prediction, measured on a candidate, not the verification.

**Discovered, changes the approach:**

- C-2 as planned could not work (`ondemand` + `required` is refused); amended.
- MSYS `sed` under `LC_ALL=C.UTF-8` does not match `.` across a 4-byte emoji
  (16-bit `wchar_t`), so the verdict normaliser touches only ASCII prefixes
  and suffixes. Relevant if anyone "simplifies" it to `(.*)`.
- `awk -v re=...` processes escapes, so the suite's line-locating regexes use
  `[|]`, never `\|` - the same reason C-4 gives for the profile regexes.
- A failing gate's results line ends in ` -> .claude/state/gate-logs/<id>.log`;
  the suite strips it.
- `bash scripts/gates.sh --fast` in this repo configures no gate (`0 ran, 5
  unconfigured`, exit 0); the gate that judges this story is the `selftest`
  CI job. `check-sigpipe.sh` (48 files, 0 findings) and
  `check-grep-count.sh` (48 files, 0 findings) are clean;
  `bash scripts/selftest.sh selftest` is `268 passed` with the raised
  floors.

## GREEN

GREEN by `feature-developer`, resolved model **Opus 5.5** (`claude-opus-5-5`),
as planned; no override reported. Tests untouched: nothing under
`.claude/tests/` is in the diff.

**Files written (the six the Contract assigns, nothing else):**

- `node-typescript.md`: two comment lines after `ondemand | mutation` (the
  `Combining this with` pointer, then the C-6(a) pointer quoting *The mutation
  gate on TypeScript 7 / Vitest 5*); `evidence | mutation | All files
  *[|][^|]*[|][^|]*[|] *[1-9][0-9]* [|]` with its comment above it (no
  trailing comment; `# killed` column; no `floor`, it would read the score);
  C-6(c)'s replacement sentence verbatim in place of "Verified against…"; the
  new section between `What --fast should leave out` and `The 5,000 ms
  default` with the reporter's toolchain, the `not re-measured` sentence, both
  failure modes, the config in one indented block, the reporter's results,
  the `extends`/`references` caveat, C-4's honest limit, and the `Ran N tests
  per mutant` line as an unverified second needle (Out of scope permits the
  mention; no evidence line built on it). `grep -cF '[1-9][0-9]* [|]'` is `1`
  (DV-1's precondition).
- `rust-cargo.md`: the pointer beside `ondemand | mutation`;
  `evidence | mutation | [1-9][0-9]* caught` with a comment above it; prose
  naming the measured cargo-mutants 27.1.0 lines.
- `python-uv.md`: `evidence | mutation | 🎉 [1-9][0-9]*` under an
  `# UNVERIFIED against a mutmut run` comment (the file is now UTF-8).
- `stack-profiles/SKILL.md`: one paragraph (no blank line, no block) after
  "Mixed-stack projects are normal", with the convention (`<stack>-mutation`,
  ids end in `mutation`, `mutation` stays `/audit-mutations`' default), copy
  `evidence`/`slow`/`ondemand`, `--gate rust-mutation`, and the limit
  (`gates.sh --audit` and `profiles.test.sh` judge the id `mutation` only,
  HARNESS-039 AC-4b).
- `new-profile.md` (C-8): the enforced-rules list gains "and an `evidence`
  line whose regex requires a non-zero killed count".
- `quality-gates/SKILL.md` (C-8): the waiver example reason is now
  "stryker's vitest runner tests nothing under vitest 5; command runner not
  wired yet - node-typescript.md".

**Rust floor decision: no `floor | mutation` in rust-cargo.md.** The floor
would be meaningful (the number before `caught` is the kill count, and the
prose says so), but a profile cannot know how many mutants a consumer's crate
has; the profile says to add one in the story that gives it a number. So
**DV-2's expected count is 7, not 8.**

**Found, not fixed (outside the Contract's writes):**
`.claude/harness/project.conf:219` carries the same stale waiver example as a
comment (`#   waiver | mutation | stryker needs a TS compiler API TS 7 lacks;
stack.md s4`). It is the Lead PO's file and not in `touches:`; C-8's reason
for changing the quality-gates copy applies to it too.

**Runs (sequential, this tree):**

    profiles: 102 passed, 0 failed     (LC_ALL unset; also LC_ALL=C and LC_ALL=C.UTF-8: 102 / 0)
    assertion floors: all 1 suite(s) met their declared floor (102 assertions executed, 102 declared).
    selftest: 268 passed, 0 failed
    reporting: 27 passed, 0 failed
    procedure: 37 passed, 0 failed
    shipped-docs: 14 passed, 0 failed
    check-sigpipe: scanned 48 shell file(s), 44 with pipefail, 0 finding(s)
    check-grep-count: scanned 48 shell file(s), 0 finding(s)
    gates.sh --fast: All required gates passed (0 ran, 5 unconfigured, 0 known).

`gates.sh --fast` configures no gate in this repository, as RED reported; the
judging gate is the `selftest` CI job. No full `gates.sh` run yet - that is
GATES'.

**Negative controls, confirmed against the shipped documents.** Not through
`mutate.sh` and not in the tree (the DVs remain GATES'): the six shipped
documents were copied to the scratchpad, the suite copied with `PROFILE_DIR`
pointed at the copy and the real `_lib.sh` sourced by absolute path (so
`REPO_ROOT`, `gates.sh` and `stack-profiles/SKILL.md` are the real ones), and
one `sed` applied to the copy per row. Every row matches RED's candidate
measurement exactly, failing names included:

| Change (on the copy) | RED measured | GREEN measured | Failing |
|---|---|---|---|
| none | 102 / 0 | `102 passed, 0 failed` | - |
| DV-1 `sed` (node `[0-9]* [|]`) | 100 / 2 | `100 passed, 2 failed` | node 0-killed row; node n/a row |
| node regex -> `[0-9]` | 100 / 2 | `100 passed, 2 failed` | the same two |
| node regex -> `-` | 99 / 3 | `99 passed, 3 failed` | the same two + `node-typescript.md: its mutation gate has an evidence line` |
| python `🎉 [0-9]*` | 101 / 1 | `101 passed, 1 failed` | `0 killed of 19` |
| rust `[0-9]* caught` | 101 / 1 | `101 passed, 1 failed` | verbose `caught in` line |
| DV-2 `sed` (rust line deleted) | 7 (8 with a floor) | `95 passed, 7 failed` | AC-3 rust x2, AC-2 rust x4, rust `mutation-evidence` |

No divergence to explain. GATES still owes DV-1 and DV-2 against the real
files through `scripts/mutate.sh`; expected 100/2 and 95/7.

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

    run:    2026-10-07T01:53:45Z
    commit: 517f072
    tree:   8ca8902e2193b7ee4d8005014027d3e217c5e126
    result: pass (0 ran, 7 unconfigured, 0 known)

    UNCONFIGURED format
    UNCONFIGURED lint
    UNCONFIGURED typecheck
    UNCONFIGURED unit
    UNCONFIGURED coverage
    UNCONFIGURED integration
    UNCONFIGURED build
    ON REQUEST   mutation (not run: per-story cost the user declined (HARNESS-015); run it with /audit-mutations; bash scripts/gates.sh --gate mutation)

## Notes

- **PLANNED measurements (2026-10-06, release 84, gawk 5.4.1 on Windows).**
  All three C-4 regexes were run through the real `gates.sh` on a
  `make_project_fixture` with the gates `required`:

      PASS         mutation (1s, observed 85)        <- Stryker positive row; "85" is the score, hence no floor
      FAIL         mutation0 (0s, ran but produced no evidence of work: expected /All files *[|][^|]*[|][^|]*[|] *[1-9][0-9]* [|]/)
      PASS         mm (0s, observed 7)               <- mutmut positive
      FAIL         mm0 (0s, ran but produced no evidence of work: expected /🎉 [1-9][0-9]*/)
      PASS         cm (0s, observed 3)               <- cargo-mutants positive
      FAIL         cm0 (0s, ran but produced no evidence of work: expected /[1-9][0-9]* caught/)

  With the gates `optional` the same fixture printed `All required gates
  passed` three times and nothing a test could anchor on - which is why C-2
  says `required`.
- **cargo-mutants 27.1.0, measured at PLANNED** on a scratch crate
  (`pub fn add(a: u32, b: u32) -> u32 { a + b }` with one test):
  `4 mutants tested in 4s: 4 caught`; with the test's assertion removed,
  `4 mutants tested in 3s: 3 missed, 1 caught` (the `+ -> -` mutant still
  panics on underflow in debug, so a genuinely zero-kill line was not produced;
  its shape, `N mutants tested in T: N missed`, follows from `summary_string`
  omitting zero outcomes).
- Line numbers cited in the Contract were re-verified at PLANNED against this
  tree: `node-typescript.md:15-16` (gate + ondemand), `:30-33` (evidence
  block), `:45` (the "Verified against" sentence), `:56-65` (`--fast`
  section), `:60` (`slow | mutation`); `rust-cargo.md:14-15`, `:36-43`;
  `python-uv.md:13-14`, `:28-34`; `profiles.test.sh:33` (`rest`), `:43`
  (evidence parse), `:84-85` (the `mutation-ondemand` rule), `:123`
  (`has_mutation_gate`), `:136-153` (`base_profile`), `:174` (the three
  profiles), `:202-204` (per-profile mutation check); `stack-profiles/
  SKILL.md:56-57`; `new-profile.md:51-55`; `quality-gates/SKILL.md:325-326`;
  `gates.sh:157-158`, `:263-266`, `:279-283`, `:560`, `:580-584`;
  `selftest.test.sh:545`; `floors.conf` `floor | profiles | 50`.

**GATES (2026-10-06), orchestrator.** DV-1 and DV-2 came out as required
(results under `## Deferred verifications`). `bash scripts/gates.sh`: all
required gates passed (0 ran, 7 unconfigured), recorded. GATES -> REVIEW step
1's full self-test with `SELFTEST_JOBS=4`: exit 0 in 958 s, `25 harness
suite(s) passed.` (2,941 assertions executed, 2,651 declared).

**DONE, 2026-10-06.** Merged in #121 (merge commit 567e0b9), release 85. The
VERSION bump lands in this DONE commit. `phase.sh set DONE --force` was run on
`main` (a detached checkout of `origin/main` in the worktree), overriding the
branch check. PR CI: `gates` passed in 2m56s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37560755411),
`boundaries` in 10s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37560755378).
This closes the last open item of issue #104.
