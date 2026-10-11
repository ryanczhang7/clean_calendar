---
id: HARNESS-032
title: The full self-test runs before a story reaches REVIEW
slug: the-full-self-test-runs-before-a-story-r
epic: 
type: fix
status: done
phase: DONE
branch: story/HARNESS-032-the-full-self-test-runs-before-a-story-r
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [.claude/commands/advance-story.md, .claude/commands/complete-story.md, .claude/tests/procedure.test.sh, .claude/tests/floors.conf, .claude/tests/selftest.test.sh]         # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

<!-- Why this story exists. Link the epic and any wiki pages that constrain it.
     Name the REQUIRED gate that would fail if this story's artifact broke. If
     only an optional gate can, put it in required_gates above before RED:
     every required gate once passed over a story none of them exercised. -->

This story is finding A of group 6, "Process", in
`docs/wiki/audits/manga-translator-port-2026-10-02.md` (GitHub issue #97). The
audit's `## Decided` item 6 A is settled and is not reopened here: **GATES ->
REVIEW runs `bash scripts/ci-local.sh` (or at least the full selftest), and the
commands' `allowed-tools` permit it.** This story implements it.

**The field evidence (issue #97, finding A).** In manga-translator, MT-019
raised a gate floor in GATES, which `project.conf` allows. An upstream-owned
suite pinned the old value. Every local gate passed, the PR opened, and CI's
`gates` job failed in the self-test (`gates: 353 passed, 1 failed`). The
`/advance-story` GATES -> REVIEW steps run `gates.sh` and `check-boundaries.sh`
and never the self-test. **Still true at release 74**, checked at PLANNED:

- `.claude/commands/advance-story.md:185-204`, the GATES -> REVIEW paragraph,
  lists four steps: `phase.sh set $1 REVIEW`, commit, `check-boundaries.sh`,
  push. Neither `selftest` nor `ci-local` appears anywhere in the file.
- `.claude/commands/complete-story.md:27-31` restates the same order and also
  never names either script.
- Line 4 of **both** files is the `allowed-tools:` line. It lists `phase.sh`,
  `gates.sh`, `check-boundaries.sh`, `task.sh` and `git`. It does not list
  `selftest.sh` or `ci-local.sh`.
- `.claude/agents/lead-po.md:110-114` says the order of the steps at GATES ->
  REVIEW "lives in `/advance-story` and is not repeated here". It defers, so it
  agrees with whatever advance-story says and is not changed.
- `CLAUDE.md:180` and `.claude/skills/quality-gates/SKILL.md:28` say to run
  `check-boundaries.sh` "after committing and before opening the PR".
  `CLAUDE.md:183-191` describes `ci-local.sh`. Neither states a GATES -> REVIEW
  step list, so neither contradicts the new one. Neither is changed.
- `.claude/settings.json`'s allow list has no `selftest.sh` or `ci-local.sh`
  either. Decided names the commands' `allowed-tools`, not settings, so
  settings are out of scope.

This repository has already paid for the same gap once. HARNESS-015 reached
REVIEW with every suite it named green. CI then failed on `sigpipe`, which pins
real line numbers in `scripts/gates.sh` that GREEN had moved. Since then the
orchestrator has run the full self-test before every GATES -> REVIEW commit, by
hand, from memory. That habit is written down nowhere a fresh agent or a
consuming project would read it. **This story turns that habit into the written
procedure, and puts a test behind it.**

**Which of Decided's two options, and where in the order (PO decision 1).** The
step that becomes mandatory is the full `bash scripts/selftest.sh`. It runs as
**step 1, before `bash scripts/phase.sh set $1 REVIEW`**, while the story is
still at GATES. `ci-local.sh` is permitted and recommended but is not the
mandatory step. The reasons, each checked at PLANNED:

- **`ci-local.sh` cannot run before the commit.** Its last step is
  `check-boundaries.sh`, which judges the *committed* frontmatter. Check 3b,
  `scripts/check-boundaries.sh:287-290`, refuses any phase other than REVIEW or
  DONE. So before the REVIEW commit, `ci-local.sh` always fails at its last
  step. After that commit, any failure it finds means leaving REVIEW again.
- **The self-test is better placed in GATES.** Source is writable there, and a
  failure takes GATES' existing routes: dispatch the feature-developer, or return
  to RED if a test is wrong. Nothing new has to be written for that case.
- **Cost.** `ci-local.sh --dry-run` lists the self-test **twice**: once plain,
  once with colour forced. CI runs the colour run only on schedule or manual
  dispatch (`.github/workflows/gates.yml`, the `if:` on that step), but
  `ci-local.sh` reads every `run:` step and ignores `if:`. It also runs
  `gates.sh` again. On this Windows host, one full self-test took 1,518 s
  (HARNESS-031, GATES, 22 suites), so a `ci-local.sh` run is roughly twice
  that. CI's whole `gates` job took 1m44s (HARNESS-031's PR run).
- **It is the defect.** What failed in the field, and in HARNESS-015, was a
  suite the story never named. The full self-test is exactly what catches that.

The new step tells the orchestrator to run the self-test **detached**, because
a tool timeout must not kill a 25-minute run. It also says what to do on a slow
Windows host, using only what has been measured: run nothing else in that
worktree at the same time, and suspect an orphaned run before blaming
slowness. The audit's finding C saw a run stall past 60 minutes next to an
orphaned self-test, then pass when run alone. Concurrent runs also hung
`phase-guard.test.sh` and ran out of memory (issue #97, C). The run lock
between `selftest.sh` and `gates.sh` is item 6 C, a later story.

**What the guard can and cannot prove.** A bash suite can pin that both
commands permit the scripts, that advance-story's numbered steps put the full
self-test before the phase change, and that complete-story's summary names
it. It cannot pin that an orchestrator *follows* the steps. Recording evidence
that the run happened, so that `check-boundaries.sh` could refuse a REVIEW
story without it, is a separate story (`## Out of scope`). This story's step
asks for the result in `## Notes`, and nothing checks that it is there.

**Required check that would fail if this story's artifact broke:** the full
`bash scripts/selftest.sh` run, which is CI's `gates` job, harness self-test
step. It runs the new `procedure` suite and checks its floor. Every
`project.conf` gate in this repository is UNCONFIGURED, so `required_gates`
stays `[]`.

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC.
     An AC that names a statistic, a metric or a threshold names a NEGATIVE
     CONTROL too: the deliberately broken input the metric must reject, and
     roughly what it should score. A criterion can be perfectly testable and
     still be blind to the defect it exists to catch, and that is more
     dangerous than a vague one - it survives review and goes green. -->

One guard checks all five: `procedure_problems <root>` in the new
`.claude/tests/procedure.test.sh`. Run over the real tree, it must print
nothing. Run over a fixture that is compliant by construction except for one
regression, it must print **exactly one** line, and that line must name the
regressed file. The second run is each criterion's negative control: a guard
that never fires is satisfied by the real tree whatever the tree says. Every
fault line is pinned byte for byte in the Contract. On today's tree the guard
prints six lines (Contract, "The RED failure"), and each one reproduces the bug.

- **AC-1** — **Both** `.claude/commands/advance-story.md` and
  `.claude/commands/complete-story.md` carry `Bash(bash scripts/selftest.sh:*)`
  and `Bash(bash scripts/ci-local.sh:*)` as whole entries of the
  `allowed-tools:` line in their frontmatter. *Controls:*
  - an entry missing gives one line naming the file and the entry;
  - an entry spelled without `:*` gives the same line;
  - an entry that appears only in the body of the file gives the same line.
- **AC-2** — In advance-story.md's `**GATES → REVIEW.**` paragraph, three
  numbered steps name, **in increasing step order**:
  1. `` `bash scripts/selftest.sh` ``, the full run with no suite argument;
  2. `` `bash scripts/phase.sh set $1 REVIEW` ``;
  3. `` `bash scripts/check-boundaries.sh` ``.

  *Controls:*
  - the self-test step placed after the phase step gives one out-of-order line;
  - the self-test named only in the paragraph's prose, not in a numbered step,
    gives one "do not name" line;
  - a targeted `` `bash scripts/selftest.sh reporting` `` gives the same line;
  - the self-test step present only in another paragraph (REVIEW → DONE) gives
    the same line;
  - the check-boundaries step moved before the phase step gives one
    out-of-order line.
- **AC-3** — In advance-story.md, the numbered step that names
  `` `bash scripts/selftest.sh` `` also contains `detached`, `Windows` and
  `## Notes`. The step is its numbered line plus its indented continuation
  lines. *Control:* each of the three words missing from the step but present
  elsewhere in the file gives one line naming that word.
- **AC-4** — complete-story.md's `- **GATES → REVIEW` bullet names
  `` `bash scripts/selftest.sh` ``. *Control:* the needle present elsewhere in
  the file but not in that bullet gives one line.
- **AC-5** — A full `bash scripts/selftest.sh` passes. `floors.conf` floors
  `procedure` at the count it executes on this tree, and the `COUNTS` table in
  `selftest.test.sh` has a matching `procedure` row. `policy.test.sh` and
  `reporting.test.sh`, which also read advance-story.md and complete-story.md,
  stay green.

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

**Writes:** `.claude/commands/advance-story.md`, `.claude/commands/complete-story.md`, `.claude/tests/procedure.test.sh`, `.claude/tests/floors.conf`, `.claude/tests/selftest.test.sh`

**RED may amend any block below in place, with a reason. GREEN builds what the
amended block says.**

**The phase lock enforces nothing here.** At PLANNED, `bash scripts/classify.sh`
returned `harness` for `.claude/commands/advance-story.md`,
`.claude/tests/procedure.test.sh` and `.claude/tests/floors.conf`, and the other
two paths are in the same directories. So the split is held by discipline, as
in HARNESS-015 and HARNESS-023:

- RED writes only `procedure.test.sh` and the two floor lines.
- GREEN writes only the two command files.

### C-1 The guard: `.claude/tests/procedure.test.sh`

- Sources `_lib.sh`, as every suite does, and ends with `summary "procedure"`.
  Uses bash, awk and coreutils only.
- **Pure bash for matching**: `mapfile`, `case "$line" in *"$needle"*`, and
  `[ "$a" = "$b" ]` for whole-line and whole-entry equality. Do not fork a
  `grep` or `awk` per needle. In HARNESS-023, `reporting.test.sh` took 109 s
  with a fork per region and 10.6 s in pure bash on this host, with identical
  output. Needles hold no newline, so a match is always inside one line.
- `procedure_problems <root>` prints one line per violation in the form
  `<relative-path>: <reason>`. It prints nothing when compliant and always
  returns 0, the same shape as `policy_problems` (`policy.test.sh:62`) and
  `reporting_problems`.
- **Real tree:** `assert_eq` that `procedure_problems "$REPO_ROOT"` is empty.
  This is the assertion that fails in RED. Paste the six lines into the
  handoff; they are the right failure.
- **Fixtures** are built **by construction** in a `mktemp -d` root, and are
  never copied from the real tree, because in RED the real tree is not compliant
  yet. Precedent: `compliant_fixture` / `fresh_case` in `policy.test.sh:122-143`.
  - One fully compliant fixture must print nothing.
  - One fixture per control named in AC-1 to AC-4. Each asserts the **whole
    output** with `assert_eq`, so "exactly one line, naming the file" is a
    single comparison.
- `$1` in the needles is literal: the two characters `$` and `1`, as in the
  command files. Use quoted heredoc delimiters (`<<'EOF'`) and single quotes.
- Must stay clean under `bash scripts/check-sigpipe.sh` and
  `bash scripts/check-grep-count.sh`. CI runs both over the whole tree.

### C-2 The sites, and the regions the guard reads (the semantics it implements)

The guard reads exactly two files: `ADVANCE=.claude/commands/advance-story.md`
and `COMPLETE=.claude/commands/complete-story.md`. They are the commands that
reach REVIEW. The list is fixed in the suite. A future command that also reaches
REVIEW gets added to the list (`## Out of scope`).

- **Frontmatter:** line 1 is exactly `---`. The frontmatter runs to the next
  line that is exactly `---`. The `allowed-tools:` line is the frontmatter line
  that begins `allowed-tools:`.
- **Entries:** the text after `allowed-tools:`, split on `,`, with leading and
  trailing spaces trimmed from each piece. An entry matches only if it is
  **equal** to the needle; containing the needle is not enough.
- **advance-story's region:** starts at the line that begins with
  `**GATES → REVIEW.**`. It ends just before the next line that begins with
  `**`, or at end of file. Today that is `:185` to `:204`, and the next such
  line is `:206`, `**REVIEW → DONE.**`. The same rule as
  `review_done_section` in `policy.test.sh:51`. **GREEN must not start any line
  inside this paragraph with `**`**, because that line would end the region
  early.
- **Steps:** inside the region, a line that matches `^[0-9]+\. ` starts a
  step. The step's number is that integer. The step continues over the
  following lines that start with whitespace and are not blank. It ends at a
  blank line, a line that does not start with whitespace, or the next step.
  Today `:192-197` is steps 1 to 4. Step 3's continuation line, `:195`, is
  indented three spaces.
- **A needle is in step k** if it appears as a fixed string on any line of step
  k. A needle in the region's prose but in no step does not count.
- **complete-story's bullet:** starts at the line that begins with
  `- **GATES → REVIEW`. It ends just before the next line that begins with
  `- `, or at a blank line. Today that is `:27-31`.

### C-3 The needles (settled: read them out, do not re-derive)

| Name | Fixed string |
|---|---|
| `TOOL_SELFTEST` | `Bash(bash scripts/selftest.sh:*)` |
| `TOOL_CILOCAL` | `Bash(bash scripts/ci-local.sh:*)` |
| `STEP_SELFTEST` | `` `bash scripts/selftest.sh` `` (backticks included) |
| `STEP_PHASE` | `` `bash scripts/phase.sh set $1 REVIEW` `` (backticks included) |
| `STEP_BOUNDARIES` | `` `bash scripts/check-boundaries.sh` `` (backticks included) |
| `STEP_WORDS` | `detached`, `Windows`, `## Notes` |

The closing backtick in `STEP_SELFTEST` is load-bearing. It is what makes a
targeted run, `` `bash scripts/selftest.sh reporting` ``, fail to match, and a
targeted run is the field defect itself. The allowed-tools entries contain no
backtick, so `STEP_SELFTEST` never matches line 4.

### C-4 Fault lines (mechanical: pinned byte for byte)

`<F>` is the relative path. `<N>`, `<N1>` and `<N2>` are step needles printed
exactly as in C-3, backticks included. `<TOOL>` and `<WORD>` are printed
wrapped in one pair of backticks added by the message. `<a>` and `<b>` are step
numbers. One template per line:

```
<F>: file is missing
<F>: has no `allowed-tools:` line in its frontmatter
<F>: its allowed-tools do not permit `<TOOL>`
<F>: has no `**GATES → REVIEW.**` paragraph
<F>: its GATES → REVIEW steps do not name <N>
<F>: its GATES → REVIEW steps are out of order: <N1> is step <a>, <N2> is step <b>
<F>: its `bash scripts/selftest.sh` step does not say `<WORD>`
<F>: has no `- **GATES → REVIEW` bullet
<F>: its GATES → REVIEW bullet does not name `bash scripts/selftest.sh`
```

A frontmatter with no `allowed-tools:` line, or no frontmatter at all, gives
the second line only, never the two "do not permit" lines. **RED pins these
strings in the suite and copies them into the handoff.** Where RED's wording
differs from a template above, RED amends the template in place.

**Order of checks and suppression.** One root cause gives one line:

- A missing file gives only `file is missing`.
- Tool entries are checked independently: there are two needles, so up to two
  lines.
- Each step needle missing from every step gives its own "do not name" line.
- **The order check runs only when all three step needles were found.** It
  compares adjacent pairs, `STEP_SELFTEST` with `STEP_PHASE` and `STEP_PHASE`
  with `STEP_BOUNDARIES`. Each pair needs a strictly smaller step number first.
  Two needles in the same step count as out of order. When a needle appears in
  more than one step, its first step is used.
- **The `STEP_WORDS` check runs only when `STEP_SELFTEST` was found in a step**,
  and only reads that step.
- Output order: the files in the order `ADVANCE`, `COMPLETE`. Within a file:
  tools, then step needles in C-3 order, then order, then words, then the
  bullet.

### C-5 The RED failure (predicted, from the tree at `f9ab433`)

Over the real tree the guard prints these six lines, and nothing else:

```
.claude/commands/advance-story.md: its allowed-tools do not permit `Bash(bash scripts/selftest.sh:*)`
.claude/commands/advance-story.md: its allowed-tools do not permit `Bash(bash scripts/ci-local.sh:*)`
.claude/commands/advance-story.md: its GATES → REVIEW steps do not name `bash scripts/selftest.sh`
.claude/commands/complete-story.md: its allowed-tools do not permit `Bash(bash scripts/selftest.sh:*)`
.claude/commands/complete-story.md: its allowed-tools do not permit `Bash(bash scripts/ci-local.sh:*)`
.claude/commands/complete-story.md: its GATES → REVIEW bullet does not name `bash scripts/selftest.sh`
```

Why only six:

- `STEP_PHASE` is on `:192`, step 1.
- `STEP_BOUNDARIES` is on `:194`, step 3.
- With `STEP_SELFTEST` absent, the order and word checks are suppressed.

If RED sees any other line, the region or step definitions are wrong. Fix them
in RED and say so.

### C-6 The prose GREEN writes (settled in substance; GREEN may tighten wording)

**`allowed-tools:` in both command files.** Line 4 becomes exactly this, with
the two entries inserted after `check-boundaries.sh`:

```
allowed-tools: Bash(bash scripts/phase.sh:*), Bash(bash scripts/gates.sh:*), Bash(bash scripts/check-boundaries.sh:*), Bash(bash scripts/selftest.sh:*), Bash(bash scripts/ci-local.sh:*), Bash(bash scripts/task.sh:*), Bash(git:*), Read, Grep, Glob, Edit, Write, Task
```

DV-2's `sed` expression depends on this placement: the ci-local entry follows
`, `.

**advance-story.md, GATES → REVIEW.** Keep `:185-188` as they are. In the list
after `Then, **in this order**:`, insert a new step 1 and renumber the existing
four as 2 to 5. Draft:

> 1. `bash scripts/selftest.sh` — the whole harness self-test, every suite,
>    once, while the story is still at GATES. CI runs every suite, and one the
>    story never touched can still fail on its change: a line number another
>    suite pins, a floor, a value an upstream suite asserts. Run it detached
>    (the Bash tool's `run_in_background` with its longest timeout, or `nohup`
>    from a shell), so that a tool timeout cannot kill it, and run nothing else
>    in this worktree until it exits: not `gates.sh`, not a second self-test.
>    CI's whole job takes about 2 minutes; on a Windows host the self-test
>    alone has taken about 25. That is slow, not wrong. Do not swap in named
>    suites because the host is slow. If a run goes far past the last duration
>    a story recorded, look for an orphaned self-test or gate run before
>    blaming the host; one run stalled past an hour beside an orphan and passed
>    alone. Judge it by its exit status and its last line, `N harness suite(s)
>    passed.`, and paste both, with the duration, into `## Notes`. A failure
>    takes GATES' own routes: the feature-developer, or RED if a test is
>    wrong. A fix changes the tree, so `bash scripts/gates.sh` runs again and
>    these steps start over.

Then, after the list (after the "The phase is set **before** the commit"
paragraph, or inside it), add one paragraph about `ci-local.sh`. Draft:

> `bash scripts/ci-local.sh` runs that self-test and every other step CI runs,
> read from the workflow files, and ends with step 4's check. It judges the
> commit, so it can only run after step 3. It runs the self-test twice and the
> gates again, so it is the better check where it is fast and never a
> substitute for step 1 where it is not.

These words are needles: `` `bash scripts/selftest.sh` `` on one line, plus
`detached`, `Windows` and `## Notes`, all inside step 1. **No line inside the
paragraph may begin with `**`** (C-2). Existing text that must survive
unchanged:

- `` `bash scripts/phase.sh set $1 REVIEW` ``, now step 2;
- `` `bash scripts/check-boundaries.sh` ``, now step 4;
- the `**REVIEW → DONE.**` paragraph, which `policy.test.sh` reads;
- the file's last paragraph, which `reporting.test.sh` reads.

None of the new text may match `policy.test.sh`'s `COUNT_RE`, which is
`(three|two) mutations`.

**complete-story.md, the GATES → REVIEW bullet (`:27-31`).** It must begin with
`- **GATES → REVIEW` and name `` `bash scripts/selftest.sh` `` on one line.
Draft:

> - **GATES → REVIEW runs the full `bash scripts/selftest.sh` first**, detached
>   and alone, while the story is still at GATES. Then it sets the phase before
>   committing, runs `bash scripts/check-boundaries.sh`, and pushes and opens
>   the PR. A suite the story never touched can fail on its change, and CI runs
>   them all. `check-boundaries.sh` reads the phase out of the *committed*
>   frontmatter, so a commit made while the story still says `phase: GATES` is
>   one CI rejects — intermittently, depending on when that job runs, which is
>   worse than always.

**No other file changes.** In particular:

- `lead-po.md` defers to `/advance-story`;
- `CLAUDE.md` is never overwritten by `refresh-harness.sh`;
- `.claude/settings.json`'s allow list stays as it is.

### C-7 Floors (AC-5)

Every assertion in the suite runs in RED and in GREEN alike. Only the real-tree
assertion changes outcome. So the total in RED's summary line,
N = passed + failed, is the executed count GREEN will show as
`N passed, 0 failed`. RED adds:

- `floor | procedure     | N` to `.claude/tests/floors.conf`, between `policy`
  (`:52`) and `profiles` (`:53`);
- `procedure N` to the `COUNTS` heredoc in `.claude/tests/selftest.test.sh`,
  between `policy 17` (`:533`) and `profiles 50` (`:534`).

Then `selftest.test.sh` must pass in RED.

In RED, `bash scripts/selftest.sh procedure` also fails its floor (N-1
passed). That is part of the right failure; say so in the handoff. GREEN
confirms `procedure: N passed, 0 failed`. If N differs at GREEN, RED's count
was wrong: return to RED, and do not edit the floor in GREEN.

`ci-local.test.sh` derives its steps from the workflow files. No workflow
changes here, so it is unaffected. `sigpipe.test.sh` pins `gates.sh` line
numbers. `gates.sh` is not touched, so they do not move.

### C-8 Oracle partition

- **Settled:** the two tool entries, the three step needles and their order,
  and the three words. Decided item 6 A and C-3 fix all of them. Read them out;
  do not re-derive them.
- **Mechanical:** everything else: frontmatter and region extraction, step
  numbering, fault lines, suppression. Pin it exactly.
- **Oracle-free:** none in the gates. Whether an orchestrator follows the step
  is not testable here (Context).

### C-9 Callers of changed exports

None. No script or function signature changes. The command files are read by
`policy.test.sh` (`:32-41`, `:51`), `reporting.test.sh` (`:404`, `:541`,
`:557`), `phase.test.sh` (`:198`) and `refresh.test.sh` (fixtures only). Each
reads a region C-6 leaves intact, and AC-5 holds GREEN to that.

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

**DV-1 (defect put back, and the probe of the step rule against a real line of
the tree).** Use `scripts/mutate.sh` to turn the real advance-story.md's
self-test step back into a targeted run, which is the field defect itself. Then
run the one suite that holds the assertion:

```
bash scripts/mutate.sh .claude/commands/advance-story.md 's|`bash scripts/selftest.sh`|`bash scripts/selftest.sh procedure`|g' -- bash scripts/selftest.sh procedure
```

The real-tree assertion **must** fail with exactly this one problem line, and
no other assertion may fail:

```
.claude/commands/advance-story.md: its GATES → REVIEW steps do not name `bash scripts/selftest.sh`
```

The order and word checks are suppressed (C-4), so there is no second line.
`mutate.sh` must report that it restored the file and verified the restore.

RED cannot run this: in RED the real step does not exist yet, so there is
nothing to put the defect back into. The expression was checked at PLANNED
against C-6's draft line in a scratch file. **Owner: GATES.**

The result is recorded here, not in `## Gate probes`. The guard is a test suite,
not a `project.conf` gate.

**DV-2 (probe of the frontmatter rule against a real line of the tree).** This
is a second entry, beyond the default budget in `rules.md`, "Mutation work per
story". The reason: the `allowed-tools` rule has its own parser (frontmatter,
then entries split on commas), which DV-1 never exercises, and the missing
permission is half of the Decided item. One run of one short suite:

```
bash scripts/mutate.sh .claude/commands/complete-story.md 's|, Bash(bash scripts/ci-local.sh:\*)||' -- bash scripts/selftest.sh procedure
```

The real-tree assertion **must** fail with exactly this one line:

```
.claude/commands/complete-story.md: its allowed-tools do not permit `Bash(bash scripts/ci-local.sh:*)`
```

The file must be restored, and the restore verified. The expression depends on
C-6's placement of the entry after `, `, and was checked at PLANNED against
that line in a scratch file. If GREEN placed the entry elsewhere, adjust the
expression to delete that one entry, and say so here. RED cannot run this: the
entry does not exist until GREEN. **Owner: GATES.**

### Results, run at GATES (2026-10-05) by the orchestrator

Each through `scripts/mutate.sh` with the one expression written above, detached, one at a time, against the GREEN commit. Both went red with exactly the one line their entry demands, and both files were restored and verified. Fixture-block `ok` lines elided.

**DV-1, the defect put back (targeted run in place of the full self-test): red as required.**

```
=== mutate: .claude/commands/advance-story.md (1 line(s) changed by s|`bash scripts/selftest.sh`|`bash scripts/selftest.sh procedure`|g) ===
  192 - 1. `bash scripts/selftest.sh` — the whole harness self-test, every suite,
  192 + 1. `bash scripts/selftest.sh procedure` — the whole harness self-test, every suite,
=== mutate: running bash scripts/selftest.sh procedure ===
=== procedure ===
  the real tree (AC-1 to AC-4)
    FAIL procedure_problems over the real tree prints nothing: both commands permit selftest.sh and ci-local.sh, and the full self-test is a GATES → REVIEW step before the phase change
         expected: 
         actual:   .claude/commands/advance-story.md: its GATES → REVIEW steps do not name `bash scripts/selftest.sh`
  the fixture: compliant by construction
  AC-1: both commands permit both scripts in allowed-tools
  AC-2: the full self-test is a numbered step before the phase change, and check-boundaries after it
  AC-3: the self-test step says detached, Windows and ## Notes
  AC-4: complete-story's GATES → REVIEW bullet names the full self-test
procedure: 36 passed, 1 failed
FAIL procedure  did 36 units of work, below the floor of 37 in .claude/tests/floors.conf
assertion floors: 0 of 1 suite(s) met their declared floor.
1 of 1 harness suite(s) FAILED.
=== mutate: command exited 1; restored (verified byte-for-byte against /d/agentic-dev-harness/.claude/worktrees/nostalgic-williams-fcf700/.claude/state/mutations/.claude_commands_advance-story.md.20261005T150135Z.63056.bak) ===
  192: 1. `bash scripts/selftest.sh` — the whole harness self-test, every suite,
```

**DV-2, the ci-local entry deleted from complete-story: red as required.**

```
=== mutate: .claude/commands/complete-story.md (1 line(s) changed by s|, Bash(bash scripts/ci-local.sh:\*)||) ===
  4 - allowed-tools: Bash(bash scripts/phase.sh:*), Bash(bash scripts/gates.sh:*), Bash(bash scripts/check-boundaries.sh:*), Bash(bash scripts/selftest.sh:*), Bash(bash scripts/ci-local.sh:*), Bash(bash scripts/task.sh:*), Bash(git:*), Read, Grep, Glob, Edit, Write, Task
  4 + allowed-tools: Bash(bash scripts/phase.sh:*), Bash(bash scripts/gates.sh:*), Bash(bash scripts/check-boundaries.sh:*), Bash(bash scripts/selftest.sh:*), Bash(bash scripts/task.sh:*), Bash(git:*), Read, Grep, Glob, Edit, Write, Task
=== mutate: running bash scripts/selftest.sh procedure ===
=== procedure ===
  the real tree (AC-1 to AC-4)
    FAIL procedure_problems over the real tree prints nothing: both commands permit selftest.sh and ci-local.sh, and the full self-test is a GATES → REVIEW step before the phase change
         expected: 
         actual:   .claude/commands/complete-story.md: its allowed-tools do not permit `Bash(bash scripts/ci-local.sh:*)`
  the fixture: compliant by construction
  AC-1: both commands permit both scripts in allowed-tools
  AC-2: the full self-test is a numbered step before the phase change, and check-boundaries after it
  AC-3: the self-test step says detached, Windows and ## Notes
  AC-4: complete-story's GATES → REVIEW bullet names the full self-test
procedure: 36 passed, 1 failed
FAIL procedure  did 36 units of work, below the floor of 37 in .claude/tests/floors.conf
assertion floors: 0 of 1 suite(s) met their declared floor.
1 of 1 harness suite(s) FAILED.
=== mutate: command exited 1; restored (verified byte-for-byte against /d/agentic-dev-harness/.claude/worktrees/nostalgic-williams-fcf700/.claude/state/mutations/.claude_commands_complete-story.md.20261005T150150Z.64550.bak) ===
  4: allowed-tools: Bash(bash scripts/phase.sh:*), Bash(bash scripts/gates.sh:*), Bash(bash scripts/check-boundaries.sh:*), Bash(bash scripts/selftest.sh:*), Bash(bash scripts/ci-local.sh:*), Bash(bash scripts/task.sh:*), Bash(git:*), Read, Grep, Glob, Edit, Write, Task
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

Planned by `bash scripts/plan.sh write HARNESS-032` from `.claude/harness/models.conf`.
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

- PLANNED: `lead-po`, dispatched by the main session, ran on `claude-opus-5-5` (Opus 5.5). No override was reported.
- RED: `test-developer` ran on `claude-opus-5-5` (Opus 5.5), as planned; no override. Orchestrator re-ran procedure (36/1, the real-tree assertion) and selftest (100/0): both match the handoff.
- GREEN: `feature-developer` ran on `claude-opus-5-5` (Opus 5.5), as planned; no override. Orchestrator read the diff and re-ran procedure (37/0).
- GATES: no dispatch. The orchestrator (`claude-opus-5-5`) ran DV-1, DV-2, `gates.sh` and the full selftest itself.

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Out of scope

<!-- Explicit non-goals. Prevents the Feature Developer from over-building. -->

- **Evidence that the run happened.** No `check-boundaries.sh` check refuses a
  REVIEW story whose `## Notes` lacks a `N harness suite(s) passed.` line, and
  `gates.sh` does not record the self-test. Either is a change to a large
  script with its own suite (`boundaries` 79, `gates` 470 assertions), plus a
  rule for consuming projects whose self-test differs. That is a separate
  story. A pasted line could be fabricated anyway; this story makes the step
  written and tested, not enforced.
- **Changing `ci-local.sh`.** It runs the colour-forced self-test that CI
  skips on pull requests, because it ignores `if:`. That doubles its local
  cost. Teaching it to skip `if:`-gated steps, or adding a mode that stops
  before `check-boundaries.sh` so it could run in GATES, would change what
  `ci-local.test.sh` derives. That is a separate story.
- **The run lock and concurrent suites** (`SELFTEST_JOBS`). Those are audit
  item 6 C. This story only says, in prose, not to run two things at once.
- **Every script a command names being in its `allowed-tools`.** Counted at
  PLANNED: advance-story.md and complete-story.md also tell the orchestrator to
  run `bash scripts/mutate.sh` and `bash scripts/plan.sh`, and neither is
  permitted. setup-environment.md names `bash scripts/plan.sh` without
  permitting it. A general rule would pre-approve `mutate.sh`, a script that
  edits source, and that is a permission decision Decided did not take. It
  should be offered to the user as its own story.
- **`.claude/settings.json`'s allow list, `CLAUDE.md`, `lead-po.md`,
  `rules.md` and the `quality-gates` / `tdd-cycle` skills.** None of them
  states a GATES -> REVIEW step list (Context). `CLAUDE.md` is also never
  refreshed downstream.
- **Commands other than the two that reach REVIEW.** A future command that
  reaches REVIEW is added to the guard's fixed list (C-2) by the story that
  writes it.
- **Audit items 6 B and 6 D.** B is the 3d baseline, D is the 3h/3g messages.
  Both change `check-boundaries.sh`, which this story does not touch.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

<!-- Filled by the Test Developer during RED: which tests, at which level,
     and which AC each one covers. -->

One new suite, `.claude/tests/procedure.test.sh`, 37 assertions, all static
checks over prose (the `tdd-cycle` "grep for the shape" case: nothing executes
the command files, so a fixed-string check is the correct instrument, not a
substitute). Level: one guard function, `procedure_problems <root>`, run over
the real tree and in 35 fixture assertions, each over a fixture built compliant by construction in a
`mktemp -d` root (never copied from the real tree). Every fixture assertion
compares the guard's **whole output** with `assert_eq`, so "exactly one line,
naming the file" is one comparison.

| # | Assertion (as named in the suite) | AC |
|---|---|---|
| 1 | both commands that reach REVIEW exist in this repository | premise |
| 2 | procedure_problems over the real tree prints nothing | AC-1..AC-4 (the RED assertion) |
| 3 | the compliant fixture is silent | all (baseline) |
| 4 | entries are trimmed: extra spaces around a comma, none after the colon, still permit | AC-1 (mechanical) |
| 5 | advance-story without the selftest.sh entry gives one line | AC-1 control "missing" |
| 6 | complete-story spelling ci-local.sh without `:*` gives the same line | AC-1 control "no `:*`" |
| 7 | an entry only in the body gives the same line | AC-1 control "body only" |
| 8 | an entry on another frontmatter key does not count | AC-1 (mechanical) |
| 9 | an entry that only CONTAINS a needle is not equal: missing comma loses both | AC-1 (equality, not containment) |
| 10 | both entries missing from both files gives four lines, advance-story first | AC-1 + C-4 output order |
| 11 | no allowed-tools line in frontmatter gives that line only | C-4 suppression |
| 12 | allowed-tools line with no frontmatter is not in a frontmatter | C-2 frontmatter |
| 13 | allowed-tools line after the frontmatter closes does not count | C-2 frontmatter |
| 14 | missing advance-story gives only `file is missing` | C-4 suppression |
| 15 | missing complete-story gives only `file is missing` | C-4 suppression |
| 16 | self-test step after the phase step: one out-of-order line | AC-2 control 1 |
| 17 | self-test only in the paragraph's prose: one "do not name" line | AC-2 control 2 |
| 18 | targeted `bash scripts/selftest.sh reporting`: one "do not name" line | AC-2 control 3 |
| 19 | self-test step only in REVIEW → DONE: one "do not name" line | AC-2 control 4 |
| 20 | check-boundaries before phase: one out-of-order line | AC-2 control 5 |
| 21 | two needles in the same step count as out of order | C-4 order rule |
| 22 | a needle in more than one step is judged by its first step | C-4 order rule |
| 23 | phase step missing: its own line, order check suppressed | AC-2 + C-4 suppression |
| 24 | check-boundaries step missing: its own line | AC-2 |
| 25 | a needle on an indented continuation line is in that step | C-2 steps (positive) |
| 26 | an indented line after a blank line has left the step | C-2 steps (negative) |
| 27 | a line beginning `**` inside the paragraph ends it early | C-2 region (GREEN's warning, pinned) |
| 28 | no `**GATES → REVIEW.**` paragraph gives that line only | C-4 |
| 29-31 | `detached` / `Windows` / `## Notes` missing from the step but elsewhere: one line each | AC-3 controls |
| 32 | the three words in a DIFFERENT step do not satisfy the self-test step | AC-3 (step-scoped) |
| 33 | needle elsewhere in complete-story but not in the bullet: one line | AC-4 control |
| 34 | a targeted run in the bullet is not the full self-test | AC-4 |
| 35 | the bullet ends at a blank line | C-2 bullet |
| 36 | the bullet ends at the next `- ` line | C-2 bullet |
| 37 | no `- **GATES → REVIEW` bullet gives that line only | C-4 |

AC-5 is covered by the floor (`floors.conf`: `procedure 37`), the matching
`COUNTS` row in `selftest.test.sh`, and the full `bash scripts/selftest.sh` at
GATES (which also keeps `policy` and `reporting` honest over the edited files).

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

**RED (2026-10-05), test-developer, ran on `claude-opus-5-5` (Opus 5.5); no
override was given in the dispatch.**

**Commands.**

```
bash .claude/tests/procedure.test.sh        # the suite, ~9 s locally
bash scripts/selftest.sh procedure          # the suite under its floor
bash .claude/tests/selftest.test.sh         # floors.conf <-> COUNTS agree
```

**The failure, verbatim** (`bash .claude/tests/procedure.test.sh`, exit 1,
real 8.9 s on this Windows host):

```
  the real tree (AC-1 to AC-4)
    FAIL procedure_problems over the real tree prints nothing: both commands permit selftest.sh and ci-local.sh, and the full self-test is a GATES → REVIEW step before the phase change
         expected: 
         actual:   .claude/commands/advance-story.md: its allowed-tools do not permit `Bash(bash scripts/selftest.sh:*)`
         .claude/commands/advance-story.md: its allowed-tools do not permit `Bash(bash scripts/ci-local.sh:*)`
         .claude/commands/advance-story.md: its GATES → REVIEW steps do not name `bash scripts/selftest.sh`
         .claude/commands/complete-story.md: its allowed-tools do not permit `Bash(bash scripts/selftest.sh:*)`
         .claude/commands/complete-story.md: its allowed-tools do not permit `Bash(bash scripts/ci-local.sh:*)`
         .claude/commands/complete-story.md: its GATES → REVIEW bullet does not name `bash scripts/selftest.sh`

  the fixture: compliant by construction

  AC-1: both commands permit both scripts in allowed-tools

  AC-2: the full self-test is a numbered step before the phase change, and check-boundaries after it

  AC-3: the self-test step says detached, Windows and ## Notes

  AC-4: complete-story's GATES → REVIEW bullet names the full self-test

procedure: 36 passed, 1 failed
```

**Why it is the right failure.** Exactly one assertion fails, the real-tree
one, and the six problem lines it prints were compared byte for byte with C-5's
code block (`cmp`: identical, 6 lines each). Each is the bug: the two missing
permissions in each file, the missing step in advance-story, the missing
needle in complete-story's bullet. No order or word line appears, because
`STEP_SELFTEST` is absent and C-4 suppresses both. Every one of the 35 fixture
assertions passes now, i.e. every negative control has **executed and fired**
in RED (this suite has no missing import; the guard lives in the suite itself).

`bash scripts/selftest.sh procedure` in RED:

```
procedure: 36 passed, 1 failed
FAIL procedure  did 36 units of work, below the floor of 37 in .claude/tests/floors.conf

assertion floors: 0 of 1 suite(s) met their declared floor.
1 of 1 harness suite(s) FAILED.
```

That floor failure is part of the right failure (C-7). **Expected after GREEN:
`procedure: 37 passed, 0 failed`, floor met.** If GREEN sees any other total,
RED's count is wrong: return to RED, do not touch the floor.

Other runs in RED:

- `bash .claude/tests/selftest.test.sh` -> `selftest: 100 passed, 0 failed`
  (15 s). Its COUNTS-vs-floors assertion agrees with the new row.
- `bash scripts/check-sigpipe.sh` -> `scanned 45 shell file(s), 42 with
  pipefail, 0 finding(s)`, exit 0.
- `bash scripts/check-grep-count.sh` -> `scanned 45 shell file(s), 0
  finding(s)`, exit 0.
- `bash scripts/gates.sh --fast` -> exit 0, `All required gates passed (0 ran,
  5 unconfigured, 0 known)`: every project.conf gate is UNCONFIGURED in this
  repository, so `--fast` judges nothing here; it printed `UNTRACKED
  .claude/tests/procedure.test.sh` (not committed, as instructed). Not recorded,
  by design.
- The full `bash scripts/selftest.sh` was **not** run in RED (about 25 min on
  this host); it would fail on `procedure` only, by construction. It is GATES'
  step.

**Forward check of the region rules against C-6 (scratch, not the tree).** I
copied both real command files to the scratchpad, applied C-6's line 4, its
step 1 draft (renumbering 1-4 to 2-5) and its bullet draft there, and ran the
guard over that copy: **silent**. Then, on two further scratch copies, the DV-1
and DV-2 `sed` expressions exactly as written in `## Deferred verifications`:

```
--- dv1
.claude/commands/advance-story.md: its GATES → REVIEW steps do not name `bash scripts/selftest.sh`
--- dv2
.claude/commands/complete-story.md: its allowed-tools do not permit `Bash(bash scripts/ci-local.sh:*)`
```

Each is exactly the one line its DV entry demands. This is **not** DV-1 or
DV-2: those are owned by GATES and must run through `scripts/mutate.sh` against
the real files GREEN writes. RED cannot run them, because the real step and the
real entries do not exist yet; I decline both, as the entries say.

**Files touched.**

- `.claude/tests/procedure.test.sh` (new)
- `.claude/tests/floors.conf` (`floor | procedure     | 37`, between policy and
  profiles)
- `.claude/tests/selftest.test.sh` (`procedure 37` in COUNTS, between policy
  and profiles)
- this story: `## Test plan`, `## Handoff: RED -> GREEN`

Not touched: either command file (GREEN's), and nothing else.

**What the tests pin (the "export shape" for prose).** GREEN writes only
`.claude/commands/advance-story.md` and `.claude/commands/complete-story.md`.
Pinned, as fact:

- Line 4 of each (any frontmatter line beginning `allowed-tools:`, inside a
  frontmatter that opens on line 1 with `---` and closes with `---`) has, after
  splitting on `,` and trimming, entries **equal** to
  `Bash(bash scripts/selftest.sh:*)` and `Bash(bash scripts/ci-local.sh:*)`.
- advance-story: in the paragraph from the line beginning `**GATES → REVIEW.**`
  to just before the next line beginning `**`, numbered steps (`^[0-9]+\. `,
  continuing over non-blank indented lines) in which the first step holding
  `` `bash scripts/selftest.sh` `` (closing backtick included) has a strictly
  smaller number than the first step holding
  `` `bash scripts/phase.sh set $1 REVIEW` ``, which is strictly smaller than
  the first holding `` `bash scripts/check-boundaries.sh` ``. The self-test
  step also contains `detached`, `Windows` and `## Notes`, each on a line of
  that step (a needle must sit within one line).
- complete-story: the bullet from the first line beginning
  `- **GATES → REVIEW` to the next line beginning `- ` or a blank line contains
  `` `bash scripts/selftest.sh` `` on one line.
- **No line inside advance-story's GATES → REVIEW paragraph may begin with
  `**`** - assertion 27 pins that such a line ends the region.
- Do not put a blank line inside step 1: an indented line after a blank line
  is no longer in the step (assertion 26).

Not constrained: the wording, the step count beyond the three ordered needles,
where the ci-local paragraph goes (C-6 suggests after the list), the order of
the other allowed-tools entries (but DV-2's `sed` expects the ci-local entry
to follow `, `), and anything outside the two regions - subject to `policy`
and `reporting` staying green (AC-5) and `COUNT_RE` `(three|two) mutations`
not matching new text.

**Negative controls: expected and measured values.** Unlike a suite with a
missing import, every control here **executed in RED** against the guard as
shipped in the suite; the measured value is the output each produced.

| Control (fixture) | Threshold / expectation | Measured in RED |
|---|---|---|
| compliant | 0 lines | 0 lines |
| tool missing / no `:*` / body only / other key | exactly 1 line, file + entry | 1 line each, as pinned |
| entry merged (missing comma) | 2 lines (both needles unequal) | 2 lines |
| both entries, both files | 4 lines, ADVANCE first | 4 lines, in order |
| no allowed-tools / no frontmatter / after frontmatter | 1 line `has no allowed-tools` | 1 line each |
| file missing (each file) | 1 line `file is missing` | 1 line each |
| AC-2 controls 1-5 | 1 line each (out-of-order or "do not name") | 1 line each, step numbers 2/1 and 3/2 as pinned |
| same step / first step wins | 1 out-of-order line, `1,1` / `2,1` | as pinned |
| `**` line in region | 3 "do not name" lines | 3 lines |
| AC-3 words (x3) | 1 line naming the word | 1 line each |
| words in another step | 3 lines | 3 lines |
| AC-4 elsewhere / targeted / after blank / next bullet | 1 line | 1 line each |
| real tree (RED) | 6 lines (C-5) | 6 lines, `cmp`-identical to C-5 |
| C-6 draft (scratch) | 0 lines | 0 lines |
| DV-1 / DV-2 expressions on C-6 draft (scratch) | 1 line each | 1 line each |

GREEN's job is to confirm the real-tree line goes to 0 and the total stays 37.

**Discovered, for the implementation.**

- `load` strips a trailing CR from each line, so a CRLF checkout
  (`core.autocrlf=true` is set on this host; the files are LF today) reads the
  same. Not in the Contract; it changes no outcome on an LF tree.
- The Contract needed no amendment: every template in C-4 is printed as
  written, and the region and step definitions in C-2 produced C-5 exactly.
- Timing: ~9 s locally for the suite (local run, Windows; no CI measurement
  yet). The suite has no timeouts to budget.

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

    run:    2026-10-05T15:02:20Z
    commit: 1e13357
    tree:   eccc60bd2c1cf285920bd8ff7e547d07ecd5a526
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


**PLANNED (2026-10-05), lead-po.** What the plan rests on:

- **PO decision 1: the full self-test as step 1, before the phase change, with
  `ci-local.sh` permitted and recommended but not mandatory.** The reasoning
  is in the Context. Decided allows either ("or at least the full selftest"),
  so choosing between them does not reopen it. The orchestrator should put this
  choice to the user if they read Decided as requiring `ci-local.sh` on every
  host.
- **PO decision 2: the guard also pins the existing order,**
  `phase.sh set $1 REVIEW` before `check-boundaries.sh`. Today nothing tests
  that order, although `advance-story.md:199-204` calls it "not cosmetic". It
  costs one pair comparison.
- **PO decision 3: DV-2 is over the default mutation budget,** for the reason
  given in its entry.
- **Measured or checked at PLANNED, at `f9ab433`:**
  - `bash scripts/ci-local.sh --dry-run`: 8 steps, with the self-test twice;
  - `check-boundaries.sh:287-290`: 3b refuses phases other than REVIEW and DONE;
  - `gates.sh:885-888`, `:951-962`: with an active story, `ci-local.sh`'s
    `gates.sh` step re-records into the story. This is one more reason
    `ci-local.sh` is not the mandatory step;
  - `classify.sh` returns `harness` for the paths written;
  - no existing suite reads any command's `allowed-tools`
    (`grep -n allowed-tools .claude/tests/*.sh scripts/*.sh .claude/hooks/*.sh`
    found nothing);
  - the line numbers in C-2, C-5 and C-7;
  - the DV-1 and DV-2 `sed` expressions, on a scratch file.
- **Precedent for the suite's shape:** `policy.test.sh` (HARNESS-015) and
  `reporting.test.sh` (HARNESS-023) are each one guard per story, over prose,
  with a compliant-by-construction fixture. Neither fits this story's subject,
  so this is a new suite, and a new suite needs a floor and a `COUNTS` row
  (C-7).
- **Lessons carried from HARNESS-024..031:**
  - platform-independent arguments only. The suite matches in pure bash, and
    the DV expressions are plain BRE with `|` delimiters;
  - `mutate.sh` takes one expression;
  - run the deferred verifications and the full self-test detached;
  - raise floors and `COUNTS` together;
  - `sigpipe.test.sh`'s pins are `gates.sh`-only and untouched here;
  - `ci-local.test.sh` derives from the workflow files, which are unchanged.
- **After DONE:** the orchestrator's memory note "Full selftest before REVIEW"
  is now the written procedure. It can point at advance-story.md rather than
  restating it.
- **`depends_on: []`.** Nothing this story builds on is still in flight.
  HARNESS-031 is DONE, and no group 6 story exists yet.
- **Not committed, and the phase was not set.** The orchestrator creates the
  branch.

**GREEN (2026-10-05), feature-developer, ran on `claude-opus-5-5` (Opus 5.5);
no override was given in the dispatch.**

- **Started from the failure.** `bash .claude/tests/procedure.test.sh` before
  any edit: `procedure: 36 passed, 1 failed`, the real-tree assertion, printing
  the six C-5 lines. Same as the handoff.
- **What changed** (only the two command files, as C-6 says):
  - line 4 of `.claude/commands/advance-story.md` and
    `.claude/commands/complete-story.md` is now exactly C-6's `allowed-tools:`
    line, with `Bash(bash scripts/selftest.sh:*)`, `Bash(bash scripts/ci-local.sh:*)`
    inserted after the check-boundaries entry (so DV-2's expression, which
    expects `, ` before the ci-local entry, applies as written);
  - advance-story.md, GATES → REVIEW: C-6's step 1 draft inserted verbatim,
    the old steps 1-4 renumbered 2-5 with their text unchanged, and C-6's
    `ci-local.sh` paragraph added after the "The phase is set **before**"
    paragraph. Step 1 has no blank line; no line in the region begins with
    `**`. The ci-local paragraph's "step 4's check" and "after step 3" were
    checked against the new numbering (step 3 is the commit, step 4 is
    `check-boundaries.sh`);
  - complete-story.md: the GATES → REVIEW bullet replaced by C-6's draft
    verbatim.
  No wording was tightened. `grep -nE '[Ss]tep [0-9]'` over both command
  files and `lead-po.md` finds only the three references in the new ci-local
  paragraph, so no other step-number reference went stale. No new text
  matches `COUNT_RE` `(three|two) mutations`.
- **Results after the edit:**
  - `bash .claude/tests/procedure.test.sh` -> `procedure: 37 passed, 0 failed`;
  - `bash scripts/selftest.sh procedure` -> `procedure: 37 passed, 0 failed`,
    `assertion floors: all 1 suite(s) met their declared floor (37 assertions
    executed, 37 declared).`, `1 harness suite(s) passed.` The total is 37 as
    RED predicted, so the floor stands;
  - `policy: 17 passed, 0 failed`; `reporting: 27 passed, 0 failed`;
    `selftest: 100 passed, 0 failed`; `settings: 27 passed, 0 failed`;
    `phase: 45 passed, 0 failed` (it reads advance-story.md, C-9);
  - `bash scripts/check-sigpipe.sh` -> 45 files, 0 findings;
    `bash scripts/check-grep-count.sh` -> 45 files, 0 findings;
  - `bash scripts/gates.sh --fast` -> `All required gates passed (0 ran, 5
    unconfigured, 0 known).` Every project.conf gate is UNCONFIGURED here, so
    this judges nothing; not recorded, by design.
- **Negative controls.** Every control here executed in RED (the guard lives
  in the suite, no import can fail), and each fixture assertion compares the
  guard's whole output with `assert_eq`. All 35 fixture assertions pass in
  GREEN with the guard unchanged, so each measured value equals the handoff's
  table row exactly. The one value that moved is the one meant to: the real
  tree went from 6 lines (C-5) to 0 lines. No divergence to report.
- **Not run in GREEN, by instruction:** the full `bash scripts/selftest.sh`,
  DV-1, DV-2 (all GATES), and no commit.

**GATES (2026-10-05), orchestrator.** DV-1 and DV-2 came out as required
(results under `## Deferred verifications`). `bash scripts/gates.sh`: all
required gates passed (0 ran, 7 unconfigured), recorded. The full
`bash scripts/selftest.sh`, detached and alone, run once as this story's own new
step 1 requires: exit 0 in 3,611 s, last line `23 harness suite(s) passed.`
(2,388 assertions executed, 2,158 declared). That is about 2.4 times
HARNESS-031's 1,518 s on the same host the same day. No second self-test or
gate run was going in this worktree. Whether another process on the machine
was competing for it was not checked, so the cause is not known.

**DONE, 2026-10-05.** Merged in #109 (merge commit 522332f), release 75. The
VERSION bump lands in this DONE commit. `phase.sh set DONE --force` was run on
`main` (a detached checkout of `origin/main` in the worktree), overriding the
branch check. PR CI: `gates` passed in 2m00s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37337877428),
`boundaries` in 9s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37337877695).
No epic. Group 6 finding A of the port audit is complete; next is finding B.
