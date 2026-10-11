---
id: HARNESS-037
title: check-boundaries 3g/3h refusals name the block rule a result must take
slug: boundaries-refusals-name-the-block-rule
epic: 
type: fix
status: done
phase: DONE
branch: story/HARNESS-037-boundaries-refusals-name-the-block-rule
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [scripts/check-boundaries.sh, .claude/tests/boundaries.test.sh, scripts/new-story.sh, .claude/tests/new-story.test.sh, .claude/harness/rules.md, .claude/skills/story-authoring/reference/sections.md, .claude/tests/floors.conf, .claude/tests/selftest.test.sh, .claude/tests/sigpipe.test.sh, .claude/harness/VERSION, docs/wiki/audits/manga-translator-port-2026-10-02.md]         # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

<!-- Why this story exists. Link the epic and any wiki pages that constrain it.
     Name the REQUIRED gate that would fail if this story's artifact broke. If
     only an optional gate can, put it in required_gates above before RED:
     every required gate once passed over a story none of them exercised. -->

This story is finding **D** of group 6 ("Process") in
`docs/wiki/audits/manga-translator-port-2026-10-02.md` (GitHub issue #97), the
last port of that audit. The audit's `## Decided` item 6 D is settled and is not
reopened here: **"the 3h/3g messages say a result counts only as a fenced or
four-space-indented block."** What is settled is that the *messages* change
and the *detection* does not; the issue itself calls the refusal "defensible".

**The field evidence (issue #97, finding D).** manga-translator wrote a
`## Deferred verifications` result as prose with the restore lines in inline
backticks - a complete account of what was mutated, what failed and that the
file was restored - and `check-boundaries.sh` refused it with `has no result
and no waiver`. The message says "Run it and paste the output"; the agent had
pasted it, in the one shape the check cannot see. Nothing in the message, the
story template, `rules.md` or the `story-authoring` skill says what shape
counts, so the agent could only learn the rule by reading `has_pasted_output`.
The same message gap exists in 3g (`## Regressions`, `## Gate probes`), which
uses the same predicate.

**What the check actually does (verified at PLANNED, release 80, `d572c97`):**

- `scripts/check-boundaries.sh:82-85` is the comment on `has_pasted_output`;
  `:121-134` is the function. It strips every `<!-- ... -->` comment (an
  unclosed one truncates the rest of the section), splits on newlines, and
  exits 0 at the first line matching either `^[[:space:]]*(```|~~~)` (a fence
  marker, any indentation, opening or closing - nothing checks that it closes
  or what it contains) or `^    [^[:space:]]` (exactly four spaces then a
  non-blank character). That is the whole rule. A tab-indented line does not
  count, nor three or five spaces, nor inline code, nor prose of any length.
  Line `:131` is the one `if`.
- `:470-491` is **3g**: for `Regressions` and `Gate probes`, a section with
  content that lacks such a line is refused at `:489` with `describes something
  without showing it. Paste the output - ...`. The `ok` line at `:487` is
  `## <sec> carries pasted output`.
- `:494-529` is **3h**: `## Deferred verifications` with content must declare
  an owner (`has_owner`, `:516-520`) and carry either such a line (`:521-522`,
  `ok ... carries its result`) or the word `waived` outside a comment
  (`has_waiver`, `:523-524`); otherwise `:526` refuses with `has no result and
  no waiver. ... Run it and paste the output - ...`. The audit's label "3h/3g"
  matches: 3h is Deferred verifications, 3g is Regressions and Gate probes.
- `.claude/tests/boundaries.test.sh` tests 3g at `:85-153` (prose refused
  `:90-96`, a ``` fence accepted `:98-113`, a four-space measurement accepted
  `:115-126`, absent section `:128-137`, untouched template comment `:139-153`)
  and `:194-202` (Gate probes prose refused); 3h at `:577-620` (owned and
  never run refused `:577-583`, fenced result accepted `:585-603`, waiver
  accepted `:605-615`, absent section `:617-626`). The `refused` helper (`:41`)
  matches a **substring** of `$out`, so no test today pins either message as a
  whole line.
- `.claude/tests/sigpipe.test.sh` C-5 pins `scripts/check-boundaries.sh:394`,
  `:433` and `:608` by line number and fails as stale if they move. 3g's message
  (`:489`) and 3h's (`:526`) lie between `:433` and `:608`, so GREEN moving a
  line count there moves `:608`.
- Where agents are told to paste: `scripts/new-story.sh` template comments for
  Regressions (`:222-227`, "PASTE THE OUTPUT ... describes a failure without
  showing one"), Gate probes (`:243`, "paste the failure, revert") and Deferred
  verifications (`:116-118`, "the RESULT, pasted"); `rules.md:257-260`
  ("demands pasted output from either"); `story-authoring/reference/sections.md`
  `:54`, `:140-142`, `:163-164`; `test-developer.md:176`;
  `feature-developer.md:75`; `tdd-cycle/SKILL.md:19,84`. None says what shape
  a pasted result must take.

**The required gate.** `scripts/check-boundaries.sh` and both test files
classify as `harness`; the gate that fails if this story's artifact breaks is
the self-test (`bash scripts/selftest.sh boundaries`, `... new-story`), which CI
runs on every PR and which GATES -> REVIEW runs in full (HARNESS-032).

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC.
     An AC that names a statistic, a metric or a threshold names a NEGATIVE
     CONTROL too: the deliberately broken input the metric must reject, and
     roughly what it should score. A criterion can be perfectly testable and
     still be blind to the defect it exists to catch, and that is more
     dangerous than a vague one - it survives review and goes green. -->

AC-1 to AC-3 are observed in `boundaries.test.sh`'s two-branch fixture through
`story_on_branch` and `run_boundaries`, beside the 3g and 3h tests named in
`## Context`. AC-4 is observed in `new-story.test.sh` on the story the real
script generates. "Refused" means both halves the `refused` helper checks: the
message is printed and the exit status is non-zero. A "whole line" is pinned
with an anchored fixed-string count (`grep -cxF`), never a substring.

- **AC-1 (3g says what counts)** — Given a story on its branch whose
  `## Regressions` (and, in a second case, whose `## Gate probes`) describes a
  reverted mutation in prose with no fence and no four-space line, when
  `check-boundaries.sh main` runs, then it is refused and its output contains,
  as one whole line, exactly C-1's 3g line for that section - stating that a
  result counts only as a line beginning with three backticks or three tildes
  or a line indented by exactly four spaces, and that a tab, inline code in
  backticks and anything inside an HTML comment do not count. The `ok` line for
  an accepted section is unchanged: `ok    ## Regressions carries pasted output`.
- **AC-2 (3h says what counts)** — Given a story whose `## Deferred
  verifications` declares `Owner: GATES` and reports its result as prose with
  the restore lines in inline backticks and no `WAIVED` - the issue #97 shape,
  reproduced verbatim in spirit: "Ran it at GATES; `mutate.sh` reported the
  failure and `cmp` confirmed the restore" - when `check-boundaries.sh main`
  runs, then it is refused and its output contains, as one whole line, exactly
  C-1's 3h line, stating the same rule in the same words as AC-1's. The `ok`
  lines `## Deferred verifications carries its result` and `... carries an
  explicit waiver` are unchanged.
- **AC-3 (the detection is unchanged, and the message does not over- or
  under-claim)** — The three shipped cases stay green: a ``` fence is accepted,
  a four-space-indented measurement is accepted, bare prose is refused. And
  four controls pin that the rule the message states is the rule the check
  applies: (a) a `## Regressions` whose only block is opened with `~~~` is
  accepted (`carries pasted output`); (b) one whose only indented line is led
  by a tab is refused with AC-1's line; (c) one whose only fence lies inside an
  `<!-- -->` comment, followed by prose, is refused with AC-1's line; (d) a
  `## Deferred verifications` whose output is quoted in inline backticks within
  a prose sentence, with `Owner: GATES` and no waiver, is refused with AC-2's
  line. *Control for the controls:* DV-2 and DV-3 below each flip at least one
  of (a)-(d) red and are run at GATES; a control none of them flips is
  reported in `## Notes` as unearned.
- **AC-4 (the template says it before anyone writes)** — Given a story
  generated by `bash scripts/new-story.sh`, then the comment inside each of
  `## Regressions`, `## Gate probes` and `## Deferred verifications` - scoped
  to that section's own text, as `new-story.test.sh:123` scopes the
  deferred-verifications comment - contains C-3's rule sentence naming "three
  backticks", "exactly four spaces" and "inline code", and the suite's existing
  assertions (every backtick span survives, nothing on stderr, no `THREE`)
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

**Writes:** `scripts/check-boundaries.sh`, `.claude/tests/boundaries.test.sh`, `scripts/new-story.sh`, `.claude/tests/new-story.test.sh`, `.claude/harness/rules.md`, `.claude/skills/story-authoring/reference/sections.md`, `.claude/tests/floors.conf`, `.claude/tests/selftest.test.sh`, `.claude/tests/sigpipe.test.sh`, `.claude/harness/VERSION`, `docs/wiki/audits/manga-translator-port-2026-10-02.md`

**RED may amend any block below in place, with a reason. GREEN builds what the
amended block says.**

**The phase lock enforces nothing here.** Every path above classifies as
`harness` (or `docs`), which every phase may write. The split is held by
discipline, as in HARNESS-033:

- **RED** writes `boundaries.test.sh`, `new-story.test.sh`, and the
  `boundaries` and `new-story` floor lines in `floors.conf` and
  `selftest.test.sh`'s `COUNTS` heredoc, raised to the executed counts at the
  end of RED (RED pastes both suites' summary lines into the handoff).
- **GREEN** writes `check-boundaries.sh`, `new-story.sh`, `rules.md`,
  `sections.md`, and - only if a line count changed between `:433` and `:608`
  of `check-boundaries.sh` - the `:608` pin in `sigpipe.test.sh` C-5 (a
  fixture tracking where a line sits, not an assertion; HARNESS-030 and
  HARNESS-033 gave the same update to GREEN). `.claude/harness/VERSION` goes to
  **81** with today's date in GREEN; `check-boundaries.sh` refuses an upstream
  harness change without a bump.
- **DONE** (orchestrator) marks the audit's `## Progress` row for finding D
  done and clears the "To resume" paragraph, since this is the last port before
  the refresh.

### C-1 The two refusal lines, exactly

Both stay a single `problem "..."` call on one physical line, in double quotes,
with no backtick and no `$(` in the text (a literal ``` inside double quotes is
command substitution; "three backticks" is spelled out for that reason). The
shared rule clause is byte-identical in both, so one `sed` expression (DV-1)
hits both lines and nothing else.

The shared clause, verbatim:

    a line beginning with three backticks or three tildes (a fence), or a line indented by exactly four spaces - a tab does not count, nor does inline code in backticks, nor anything inside an HTML comment.

**3g** (`check-boundaries.sh:489`, inside the `for sec in Regressions "Gate
probes"` loop), the `problem` argument:

    story $sid: ## $sec describes something without showing it. What counts as showing it is the shape, not the words: a line beginning with three backticks or three tildes (a fence), or a line indented by exactly four spaces - a tab does not count, nor does inline code in backticks, nor anything inside an HTML comment. Paste the output as such a block - the failure a reverted mutation produced, or the before/after measurement taken under the gate command. A test corrected while the implementation exists has never been observed to fail, and a description of red is not red.

So for the fixture story `T-1`, the whole output line AC-1 pins is
`FAIL  story T-1: ## Regressions describes something without showing it. What
counts ...` (two spaces after `FAIL`, as `problem()` at `:28` prints), and the
Gate probes case pins the same line with `## Gate probes`.

**3h** (`check-boundaries.sh:526`), the `problem` argument:

    story $sid: ## Deferred verifications has no result and no waiver. The phase that owned it has passed and nothing says what happened. What counts as a result is the shape, not the words: a line beginning with three backticks or three tildes (a fence), or a line indented by exactly four spaces - a tab does not count, nor does inline code in backticks, nor anything inside an HTML comment. Paste the output as such a block - what was mutated and what failed - or write WAIVED with the reason. This is the control that makes a threshold or a round trip mean anything; skipping it silently is the failure it was filed against.

The whole output line AC-2 pins is `FAIL  story T-1: ## Deferred verifications
has no result and no waiver. The phase ...`.

The leading clauses (`describes something without showing it`, `has no result
and no waiver`) are kept so that every existing `refused` needle in
`boundaries.test.sh` (`:96`, `:202`, `:583`) still matches. The `ok` lines at
`:487` and `:522` are not touched: four shipped assertions pin them.

### C-2 The detection, frozen

`has_pasted_output` (`:121-134`) does not change, byte for byte; `:131` stays
`if (lines[k] ~ /^[[:space:]]*(```|~~~)/ || lines[k] ~ /^    [^[:space:]]/) exit 0`.
Its header comment (`:82-85`) may gain one sentence saying the two refusal
lines quote this rule, so the next edit to either keeps them in step. GREEN
confirms with `git diff -U0 scripts/check-boundaries.sh` that the diff touches
only `:489`, `:526` and, if at all, `:82-85`; and pastes the two
`has_pasted_output` lines of `bash scripts/check-sigpipe.sh` / C-5's freshness
verdict in `## Notes` if `:608` moved.

### C-3 The rule where agents read it first

One sentence, the same in every place, with "three backticks", "exactly four
spaces" and "inline code" in it (AC-4's needles):

    A result counts only as a block: a line beginning with three backticks or three tildes (a fence), or a line indented by exactly four spaces. Prose does not count, nor inline code in backticks, nor a tab, nor anything inside an HTML comment.

- `scripts/new-story.sh`: inside the template's **quoted** heredoc, in the
  `## Regressions` comment after "PASTE THE OUTPUT." (`:226`), in the
  `## Gate probes` comment after "paste the failure, revert." (`:243`), and in
  the `## Deferred verifications` comment after "the RESULT, pasted, ..."
  (`:116-118`). Wrapped to the comment's width; no backtick characters added,
  so `new-story.test.sh`'s span check is unaffected.
- `.claude/harness/rules.md`, the non-negotiable at `:257-260` ("demands
  pasted output from either"): add the sentence there, once.
- `.claude/skills/story-authoring/reference/sections.md`: after `:140-142`
  (Regressions) and `:163-164` (Gate probes), and in the Deferred
  verifications paragraph at `:54`. One sentence each or one shared sentence
  with a cross-reference; GREEN's choice.
- `test-developer.md`, `feature-developer.md`, `tdd-cycle` are **not** edited
  (Out of scope); they say "paste" and point at the sections, which now say
  the shape.

### C-4 New assertions, and how they are pinned

In `boundaries.test.sh`, placed in the existing `describe` blocks for 3g
(`:85-153`, `:194-202`) and 3h (`:577-620`), using `story_on_branch`,
`run_boundaries` and `refused`, plus one whole-line check per new message:

    assert_eq "AC-1: the 3g refusal is exactly the line the contract gives" 1 \
      "$(grep -cxF -- "FAIL  story T-1: ## Regressions describes something without showing it. What counts ..." <<< "$out")"

(the full C-1 line as the needle; `-x` anchors both ends, `-F` makes the dots
and parentheses literal, and `grep -c` on a here-string is a count, never a
pipeline, so `check-grep-count.sh` has nothing to say). Expected new
assertions: AC-1 two (Regressions, Gate probes), AC-2 one, AC-3 four
(a)-(d) - each `refused` or `assert_contains` plus the whole-line pin where
the AC says "with AC-1's/AC-2's line". RED records the executed `boundaries`
count; the floor rises from **101** to that number.

In `new-story.test.sh`, a new `describe` after the HARNESS-015 block
(`:114-131`): extract each of the three sections with the same `awk` shape as
`:123` and `assert_contains` the three needles in each, scoped. Expected:
three to nine assertions; the `new-story` floor rises from **29** to the
executed count.

### C-5 Oracle partition

- **Settled** (read out, do not re-derive): the detection rule (C-2, from
  `:131`), the audit's decision 6 D, the two message texts (C-1), the rule
  sentence (C-3), the floor baselines 101 and 29.
- **Mechanical** (pin exactly): AC-1, AC-2 whole lines; AC-3's four controls;
  AC-4's three scoped needles.
- **Oracle-free**: none. Nothing here is a metric or a threshold.

### C-6 Baselines, measured at PLANNED on this tree (`d572c97`)

- `bash scripts/selftest.sh boundaries`: floor 101 (`floors.conf:39`,
  `selftest.test.sh:530`). `new-story`: 29 (`floors.conf:48`).
- The two candidate mutation expressions were dry-run with `sed` to stdout
  (no file written) and each changes exactly line `:131` of
  `check-boundaries.sh`, as DV-2 and DV-3 state.
- No test dependency is added; the suites are bash and git only.

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

Budget per `rules.md`, "Mutation work per story": one "defect put back" for the
central claim (DV-1), plus what the law owes for tests written against code
that already exists - AC-3's four controls pin today's detection and pass on
arrival, so DV-2 and DV-3 earn them. Each runs the one suite that holds the
assertions, `bash scripts/selftest.sh boundaries`, through `scripts/mutate.sh`
with ONE sed expression, detached (`nohup`) so a tool limit cannot kill it
mid-run (HARNESS-024). **No probe against a real story file is owed:** the
rule's reading of the tree is byte-unchanged (C-2, AC-3), and the mutation that
would prove otherwise is DV-2. The orchestrator does run
`bash scripts/check-boundaries.sh main` on this branch at GATES as a matter of
course; this story's own `## Deferred verifications` carries fenced results and
must pass 3h, and that run is recorded in `## Notes`, not here.

**DV-1 (defect put back).** The story's claim is that the refusal states the
rule *exactly*, as a whole line. Put back a message that says less, by one
word, in both lines at once:

```
bash scripts/mutate.sh scripts/check-boundaries.sh 's/exactly four spaces/four spaces/' -- bash scripts/selftest.sh boundaries
```

**Must** fail: AC-1's two whole-line pins (Regressions, Gate probes), AC-2's
whole-line pin, and every AC-3 control that pins "with AC-1's/AC-2's line"
((b), (c), (d)). **Must** still pass: every `refused` substring needle
(`describes something without showing it`, `has no result and no waiver`),
because a substring pin would survive this mutation - that is the point of
pinning the whole line. Green again after the restore (`cmp` clean). RED
cannot run this: the lines it edits do not exist until GREEN. **Owner: GATES.**

**DV-2 (earns AC-3 (b), (c), (d) - the "does not count" half).** Make any
non-blank line count as output:

```
bash scripts/mutate.sh scripts/check-boundaries.sh 's|/\^    \[\^\[:space:\]\]/|/[^[:space:]]/|' -- bash scripts/selftest.sh boundaries
```

Dry-run at PLANNED: changes `:131` only, to `... || lines[k] ~ /[^[:space:]]/`.
**Must** fail: AC-3 (b) tab-led line accepted, (c) comment-fenced prose
accepted, (d) inline-code prose accepted, and the three shipped prose refusals
(`boundaries.test.sh:96`, `:202`, `:583`). **Must** still pass: (a) and every
accepted-fence case. Green again after the restore. RED could run this - the
detection exists - but GATES owns it so one run earns the controls against the
tree GREEN ships. **Owner: GATES.**

**DV-3 (earns AC-3 (a) - the "counts" half).** Stop a tilde fence counting:

```
bash scripts/mutate.sh scripts/check-boundaries.sh 's/(```|~~~)/(```)/' -- bash scripts/selftest.sh boundaries
```

Dry-run at PLANNED: changes `:131` only, to `/^[[:space:]]*(```)/`. **Must**
fail: AC-3 (a) alone (`~~~` refused with the 3g line). **Must** still pass:
everything else. Green again after the restore. **Owner: GATES.**

### Results, run at GATES (2026-10-06) by the orchestrator

Each through `scripts/mutate.sh` with the one expression written above, detached, one at a time, against the GREEN commit; each restore verified. Passing lines elided; long diff lines cut at 200 characters.

**DV-1, the defect put back: red as required** - exactly the six whole-line pins (AC-1 x2, AC-2, AC-3 (b)(c)(d)); every `refused` substring needle stayed green.

```
=== mutate: scripts/check-boundaries.sh (2 line(s) changed by s/exactly four spaces/four spaces/) ===
=== mutate: running bash scripts/selftest.sh boundaries ===
    FAIL AC-1: the 3g refusal for ## Regressions is exactly the line the contract gives, naming what counts
    FAIL AC-3 (b): and the refusal is AC-1's whole line
    FAIL AC-3 (c): and the refusal is AC-1's whole line
    FAIL AC-1: the 3g refusal for ## Gate probes is exactly the line the contract gives, naming what counts
    FAIL AC-2: the 3h refusal is exactly the line the contract gives, naming what counts
    FAIL AC-3 (d): and the refusal is AC-2's whole line
boundaries: 107 passed, 6 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /d/agentic-dev-harness/.claude/worktrees/nostalgic-williams-fcf700/.claude/state/mutations/scripts_check-boundaries.sh.20261006T1
```

**DV-2, any non-blank line counts: red as required** - AC-3 (b), (c), (d) and the shipped prose cases; AC-3 (a) stayed green.

```
=== mutate: scripts/check-boundaries.sh (1 line(s) changed by s|/\^    \[\^\[:space:\]\]/|/[^[:space:]]/|) ===
  131 -            if (lines[k] ~ /^[[:space:]]*(```|~~~)/ || lines[k] ~ /^    [^[:space:]]/) exit 0
  131 +            if (lines[k] ~ /^[[:space:]]*(```|~~~)/ || lines[k] ~ /[^[:space:]]/) exit 0
=== mutate: running bash scripts/selftest.sh boundaries ===
    FAIL described but not shown
    FAIL AC-1: a reverted mutation in prose is refused
    FAIL AC-1: the 3g refusal for ## Regressions is exactly the line the contract gives, naming what counts
    FAIL AC-3 (b): a result indented by a tab is refused
    FAIL AC-3 (b): and the refusal is AC-1's whole line
    FAIL AC-3 (c): a fence inside an HTML comment, then prose, is refused
    FAIL AC-3 (c): and the refusal is AC-1's whole line
    FAIL a gate probe described but not shown
    FAIL AC-1: the 3g refusal for ## Gate probes is exactly the line the contract gives, naming what counts
    FAIL named, owned, and never run
    FAIL waived in writing
    FAIL AC-2: a result reported in prose with inline backticks is refused
    FAIL AC-2: the 3h refusal is exactly the line the contract gives, naming what counts
    FAIL AC-3 (d): output quoted in inline backticks within prose is refused
    FAIL AC-3 (d): and the refusal is AC-2's whole line
boundaries: 98 passed, 15 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /d/agentic-dev-harness/.claude/worktrees/nostalgic-williams-fcf700/.claude/state/mutations/scripts_check-boundaries.sh.20261006T1
```

**DV-3, a tilde fence stops counting: red as required** - AC-3 (a) alone.

```
=== mutate: scripts/check-boundaries.sh (1 line(s) changed by s/(```|~~~)/(```)/) ===
  131 -            if (lines[k] ~ /^[[:space:]]*(```|~~~)/ || lines[k] ~ /^    [^[:space:]]/) exit 0
  131 +            if (lines[k] ~ /^[[:space:]]*(```)/ || lines[k] ~ /^    [^[:space:]]/) exit 0
=== mutate: running bash scripts/selftest.sh boundaries ===
    FAIL AC-3 (a): a block fenced with three tildes counts as pasted output
boundaries: 112 passed, 1 failed
=== mutate: command exited 1; restored (verified byte-for-byte against /d/agentic-dev-harness/.claude/worktrees/nostalgic-williams-fcf700/.claude/state/mutations/scripts_check-boundaries.sh.20261006T1
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

Planned by `bash scripts/plan.sh write HARNESS-037` from `.claude/harness/models.conf`.
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

- PLANNED, `lead-po`, resolved to Fable 5.1 (`claude-fable-5-1`), as planned;
  dispatched by the orchestrator with no model override stated.
- RED, `test-developer`, resolved to Opus 5.5 (`claude-opus-5-5`), as planned; no override. Orchestrator re-ran new-story (34/9) and boundaries (107/6), matching the handoff; ## Acceptance criteria unchanged since the PLANNED commit.
- GREEN, `feature-developer`, resolved to Opus 5.5 (`claude-opus-5-5`), as planned; no override. Orchestrator read the two message hunks and re-ran new-story (43/0).
- GATES: no dispatch. The orchestrator (`claude-opus-5-5`) ran DV-1..DV-3, `gates.sh` and the full selftest itself.

## Out of scope

<!-- Explicit non-goals. Prevents the Feature Developer from over-building. -->

- **Changing what `has_pasted_output` accepts.** Accepting inline code, tabs,
  or prose with a "looks like output" heuristic is the opposite of the audit's
  decision; the predicate separates "here is what happened" from "trust me",
  and only the shape can do that mechanically. A story that wants a different
  rule is a new story with its own field evidence.
- **The `ok` lines, `has_owner`, `has_waiver`, 3f, 3i**, and every other
  check-boundaries message. Only `:489` and `:526` change.
- **`test-developer.md`, `feature-developer.md`, `tdd-cycle`,
  `advance-story.md`.** They say "paste the output" and point at the sections;
  the sections and the template now say the shape. Editing five more files for
  one sentence is a second cycle's worth of drift to review.
- **A probe against a real story file.** Owed only when a rule's reading of
  the tree changes (`rules.md`); it does not, and AC-3 pins that.
- **Refreshing manga-translator.** The audit's last row; the user does it from
  the release that carries this story.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

<!-- Filled by the Test Developer during RED: which tests, at which level,
     and which AC each one covers. -->

Level: integration throughout - the real `scripts/check-boundaries.sh` in the
suite's two-branch fixture (`story_on_branch` + `run_boundaries`), and the real
`scripts/new-story.sh` run into a temp root. Nothing here has a unit below it.

`.claude/tests/boundaries.test.sh` (12 new assertions; helpers `BLOCK_RULE`,
`want_3g <section>`, `WANT_3H`, `whole_line <what> <line>` defined after
`story_on_branch`):

| Assertion | AC | Now |
|---|---|---|
| `AC-1: a reverted mutation in prose is refused` (new Regressions fixture; `refused`, substring + rc) | AC-1 | pass (leading clause kept) |
| `AC-1: the 3g refusal for ## Regressions is exactly the line the contract gives, naming what counts` (`grep -cxF` = 1) | AC-1 | **FAIL** |
| `AC-1: the 3g refusal for ## Gate probes is exactly ...` (on the existing prose probe at "the same rule covers gate probes") | AC-1 | **FAIL** |
| `AC-2: a result reported in prose with inline backticks is refused` (issue #97 shape, `Owner: GATES`) | AC-2 | pass |
| `AC-2: the 3h refusal is exactly the line the contract gives, naming what counts` | AC-2 | **FAIL** |
| `AC-3 (a): a block fenced with three tildes counts as pasted output` (`ok    ## Regressions carries pasted output`) | AC-3 | pass on arrival - earned by DV-3 |
| `AC-3 (b): a result indented by a tab is refused` (tab written with `printf '\t'`) | AC-3 | pass on arrival - earned by DV-2 |
| `AC-3 (b): and the refusal is AC-1's whole line` | AC-3 | **FAIL** |
| `AC-3 (c): a fence inside an HTML comment, then prose, is refused` | AC-3 | pass on arrival - earned by DV-2 |
| `AC-3 (c): and the refusal is AC-1's whole line` | AC-3 | **FAIL** |
| `AC-3 (d): output quoted in inline backticks within prose is refused` | AC-3 | pass on arrival - earned by DV-2 |
| `AC-3 (d): and the refusal is AC-2's whole line` | AC-3 | **FAIL** |

AC-3's three shipped cases (``` fence accepted, four-space measurement accepted,
bare prose refused) and AC-1/AC-2's unchanged `ok` lines are the existing
assertions `shown in a fence`, `shown as an indented measurement`, `described but
not shown`, `a gate probe described but not shown`, `run, with the failure
shown`, `waived in writing` - untouched, all green.

`.claude/tests/new-story.test.sh` (9 new, one fixed loop over `Regressions`,
`Gate probes`, `Deferred verifications`, in a new `describe` after the
HARNESS-015 block): each section's own text, extracted with the `:123` awk
shape (`index($0, "## <sec>") == 1` to `^## `), whitespace runs collapsed to one
space, must contain `three backticks`, `exactly four spaces` and `inline code`
(`## <sec> carries the rule sentence: "<needle>"`). AC-4. All 9 **FAIL** now.
The existing span / stderr / `THREE` assertions are untouched and green.

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

RED by `test-developer`, 2026-10-06, on Opus 5.5 (`claude-opus-5-5`), no
override stated in the dispatch. Nothing committed by RED.

**Commands** (sequential; selftest takes a run lock):

    bash scripts/selftest.sh boundaries     # ~5 min
    bash scripts/selftest.sh new-story
    bash scripts/selftest.sh selftest       # floors table

**Failure output, verbatim** (`check-boundaries.sh`, `new-story.sh` unchanged):

    === boundaries ===

      a return to RED has to show the red
        FAIL AC-1: the 3g refusal for ## Regressions is exactly the line the contract gives, naming what counts
             expected: 1
             actual:   0
        FAIL AC-3 (b): and the refusal is AC-1's whole line
             expected: 1
             actual:   0
        FAIL AC-3 (c): and the refusal is AC-1's whole line
             expected: 1
             actual:   0
      the same rule covers gate probes
        FAIL AC-1: the 3g refusal for ## Gate probes is exactly the line the contract gives, naming what counts
             expected: 1
             actual:   0
      a deferred verification is discharged or waived, never just filed
        FAIL AC-2: the 3h refusal is exactly the line the contract gives, naming what counts
             expected: 1
             actual:   0
        FAIL AC-3 (d): and the refusal is AC-2's whole line
             expected: 1
             actual:   0
    boundaries: 107 passed, 6 failed

    new-story: 34 passed, 9 failed
      (each of the 9: "FAIL ## <sec> carries the rule sentence: \"<needle>\"",
       expected to contain three backticks / exactly four spaces / inline code,
       actual = that section's current comment, which says none of them)

    selftest: 268 passed, 0 failed

**Why this is the right failure.** In every refused fixture the `refused`
assertion beside the pin PASSES - the old message is printed, exit non-zero -
so the pins fail on the one thing they measure: today's line lacks C-1's rule
clause, so the anchored fixed-string count is 0, not an error. No suite fails to
load; the other 101 boundaries and 34 new-story assertions are green.

**Counts.** boundaries 101 floor (101 executed) -> **113** executed (107 + 6);
new-story 29 floor (34 executed) -> **43** executed (34 + 9). Floors raised in
`floors.conf` (with a dated comment) and `selftest.test.sh` `COUNTS` together.
Selftest's floor check reads the PASSED count, so in RED both suites also report
below floor (107 < 113, 34 < 43), as HARNESS-033's RED did. **Expected after
GREEN: `boundaries: 113 passed, 0 failed`, `new-story: 43 passed, 0 failed`,
`selftest: 268 passed, 0 failed`.**

**What the tests pin, as fact** (no code module; the "export shape" is text):

- `check-boundaries.sh` 3g prints, for fixture story `T-1`, exactly the line
  `FAIL  story T-1: ## <sec> describes something ... a description of red is not red.`
  with C-1's 3g text and `<sec>` = `Regressions` / `Gate probes`; 3h prints
  exactly C-1's 3h line. The test needles were checked byte-equal to story
  lines 220 and 229 (with `$sid`/`$sec` substituted) by evaluating the test's
  own `BLOCK_RULE`/`want_3g`/`WANT_3H` against `sed -n 220p/229p` of this file:
  `3g Regressions MATCH`, `3g Gate probes MATCH`, `3h MATCH`. Each line must
  appear exactly once in the output (count = 1).
- The leading clauses stay, since eight `refused` needles depend on them (three shipped, five new).
- `ok    ## Regressions carries pasted output` unchanged.
- `new-story.sh`: each of the three section comments contains the three
  needles after whitespace collapse. **Not constrained:** where in the comment
  the sentence goes, how it wraps (a needle may straddle a line break - the
  whitespace collapse makes that safe), or C-3's exact wording beyond the three
  needles. Do not add backticks (the span check would still pass, but C-3 says
  none).
- **Not constrained by any test here:** `rules.md`, `sections.md` (C-3 asks for
  them; nothing asserts them), the header comment at `:82-85`, VERSION (the
  bump is enforced by check-boundaries on the PR, not by these suites).

**Passed on arrival** (they pin unchanged detection, C-2): the five `refused`
assertions (AC-1 Regressions, AC-2, AC-3 (b), (c), (d)) and AC-3 (a). Earned by
DV-2 ((b), (c), (d), and with them the refusal halves) and DV-3 ((a)) at GATES;
RED did not run either (the Contract assigns both to GATES so one run earns them
against the shipped tree). DV-1 cannot run in RED: the lines it mutates do not
exist yet.

**Expected value of each control** (no threshold - mechanical; these are
claims until GATES runs the DVs against the shipped script):

| Control | Today (measured, RED) | After GREEN | Under DV-1 | Under DV-2 | Under DV-3 |
|---|---|---|---|---|---|
| (a) `~~~` accepted | pass | pass | pass | pass | **fail** |
| (b) tab refused + pin | refused pass, pin 0 | both pass | pin **fail** | refused **fail**, pin **fail** | pass |
| (c) comment fence refused + pin | refused pass, pin 0 | both pass | pin **fail** | refused **fail**, pin **fail** | pass |
| (d) inline code refused + pin | refused pass, pin 0 | both pass | pin **fail** | refused **fail**, pin **fail** | pass |
| AC-1/AC-2 pins | 0 | 1 | **0** (all three) | 0 for the fixtures DV-2 accepts | 1 |

**Discovered.** `refused` tests at `:96`, `:202`, `:583` keep matching only if
the leading clauses stay byte-identical. The sigpipe `:608` pin: the new lines
are each still one physical line, so if GREEN changes only `:489`/`:526` in
place, `:608` does not move; a header sentence at `:82-85` WOULD move it.
`check-sigpipe.sh` and `check-grep-count.sh` are clean over the new test code
(47 files, 0 findings each). `gates.sh --fast` exits 0 with every code gate
UNCONFIGURED (this repo's gate is the self-test).

**Files touched:** `.claude/tests/boundaries.test.sh`,
`.claude/tests/new-story.test.sh`, `.claude/tests/floors.conf`,
`.claude/tests/selftest.test.sh`, this story (`## Test plan`, this handoff).

## GREEN

GREEN by `feature-developer`, 2026-10-06, on Opus 5.5 (`claude-opus-5-5`), no
override stated in the dispatch. Nothing committed. No test file touched.

**What changed.**

- `scripts/check-boundaries.sh`: lines `:489` (3g) and `:526` (3h) edited in
  place to C-1's text, each still one physical `problem "..."` line. Checked
  byte-equal to story lines 220 and 229 (`3g MATCH`, `3h MATCH`). The optional
  header sentence at `:82-85` was **not** added, so no line moved and the
  sigpipe C-5 `:608` pin is untouched. `git diff -U0` hunks, the whole diff:

      @@ -489 +489 @@ for sec in Regressions "Gate probes"; do
      @@ -526 +526 @@ if printf '%s\n' "$dv" | has_content; then

  `has_pasted_output` is byte-unchanged (C-2).
- `scripts/new-story.sh`: C-3's sentence in the Deferred verifications,
  Regressions and Gate probes template comments, wrapped, no backticks added.
- `.claude/harness/rules.md`: the sentence once, in the "probed against the tree"
  non-negotiable after "demands pasted output from either".
- `.claude/skills/story-authoring/reference/sections.md`: the sentence in the
  Deferred verifications paragraph and after the Regressions "Paste the output"
  paragraph; Gate probes gets a cross-reference ("the same shape counts: a fence
  or a four-space-indented line, as that section says").

**Deviation from the Contract (orchestrator's decision).** `.claude/harness/VERSION`
is NOT bumped to 81 and the audit doc is NOT edited in GREEN: in this repository
both happen in the DONE commit on main after merge, as in HARNESS-031..036. Both
paths stay in `touches:`/`**Writes:**` for that commit.

**Runs (sequential):**

    new-story: 43 passed, 0 failed
    boundaries: 113 passed, 0 failed
    sigpipe: 82 assertions executed, 82 declared - passed
    selftest: 268 assertions executed, 268 declared - passed
    check-sigpipe: scanned 47 shell file(s), 43 with pipefail, 0 finding(s)
    check-grep-count: scanned 47 shell file(s), 0 finding(s)
    gates.sh --fast: All required gates passed (0 ran, 5 unconfigured, 0 known).

Also run, because they read `rules.md`/`sections.md`: policy 17/0, reporting
27/0, mutate 189/0.

**Controls against the handoff's "After GREEN" column.** All confirmed by the
113/0 run: (a) `~~~` accepted - pass; (b), (c), (d) refused - pass, and each
whole-line pin - count 1 (pass); AC-1 (Regressions, Gate probes) and AC-2 pins -
1. No divergence from RED's table. The "Under DV-1/2/3" columns are GATES' to
confirm; not run here, per the dispatch.

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

    run:    2026-10-06T16:24:55Z
    commit: 77aa5fb
    tree:   de6e799c29c4ecfa597106b17e85b4a21000c1ef
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

- `depends_on` is empty on purpose: HARNESS-033 (the last story to edit these
  lines) and HARNESS-036 are DONE, and nothing here needs a decision another
  open story makes. `touches:` carries the collision information instead.
- GATES -> REVIEW runs the full selftest as step 1 (HARNESS-032);
  `SELFTEST_JOBS=4` is available (HARNESS-036) and took about 6 minutes on this
  machine against about 19 serial.
- Floors: when a suite's count rises, both `floors.conf` and
  `selftest.test.sh`'s `COUNTS` heredoc move together (HARNESS-033 lesson).

**GATES (2026-10-06), orchestrator.** DV-1..DV-3 came out as required
(results under `## Deferred verifications`). `bash scripts/gates.sh`: all
required gates passed (0 ran, 7 unconfigured), recorded. GATES -> REVIEW step
1's full self-test, run with `SELFTEST_JOBS=4` (HARNESS-036): exit 0 in 444 s,
`24 harness suite(s) passed.` (2,814 assertions executed, 2,514 declared).

**DONE, 2026-10-06.** Merged in #117 (merge commit 9b31fae), release 81. The
VERSION bump lands in this DONE commit, along with the audit's progress row,
as GREEN's recorded deviation said. `phase.sh set DONE --force` was run on
`main` (a detached checkout of `origin/main` in the worktree), overriding the
branch check. PR CI: `gates` passed in 2m55s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37496644107),
`boundaries` in 9s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37496644049).
No epic. Group 6 is complete, and with it every port the audit decided on; next
is refreshing manga-translator from release 81.
