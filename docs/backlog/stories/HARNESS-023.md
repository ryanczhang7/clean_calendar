---
id: HARNESS-023
title: Reports to the user lead with the outcome and end with one next action
slug: reports-to-the-user-lead-with-the-outcom
epic: 
type: chore
status: done
phase: DONE
branch: story/HARNESS-023-reports-to-the-user-lead-with-the-outcom
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [.claude/harness/rules.md, CLAUDE.md, .claude/commands/advance-story.md, .claude/commands/complete-story.md, .claude/commands/plan-story.md, .claude/commands/status.md, .claude/commands/audit-mutations.md, .claude/commands/create-product.md, .claude/commands/plan-product.md, .claude/commands/setup-environment.md, .claude/agents/lead-po.md, .claude/tests/reporting.test.sh, .claude/tests/floors.conf, .claude/tests/selftest.test.sh]  # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

<!-- Why this story exists. Link the epic and any wiki pages that constrain it.
     Name the REQUIRED gate that would fail if this story's artifact broke. If
     only an optional gate can, put it in required_gates above before RED:
     every required gate once passed over a story none of them exercised. -->

Requested by the user on 2026-10-02. The orchestrator's messages in chat - at
the end of a phase, a story, a plan or a status check - make the user work too
hard. They often have to ask "what's next?" or ask what a reply meant. Replies
also carry the agent's own working notes: caveats about what it did or did not
read, harness jargon, rule cross-references. None of that helps the user decide
anything. The orchestrator is the harness's voice to the user (the main session
running `/advance-story`, `/complete-story`, `/plan-story`, `/status` and the
rest, and `lead-po`), so the fix belongs in the harness and ships to every
consuming project.

The rules are adapted from the `i-have-adhd` skill
(https://github.com/ayghri/i-have-adhd): lead with the next action, number
multi-step work, end with one concrete next action, move tangents into a
separate offer, restate state, make wins visible, cap visible lists at about
five, and drop preamble, recaps and closers. **That skill's own eval found one
regression, and this story must not copy it.** Making every error report follow
"cause, then fix" led the model to state a definite cause it had no evidence
for. Here the rule is the reverse: on a failure, say what the evidence shows and
point at it, and never invent a cause.

**Agent-to-agent artefacts are exempt.** Story files (`## Handoff`,
`## Regressions`, `## Notes`, `## Gate probes`), audit documents and a
subagent's report to the orchestrator need to be complete, not brief. The
user-facing message can be short *because* those are complete.

**Where the rule lives, and why that matters for shipping.**
`scripts/refresh-harness.sh` replaces `.claude/harness/rules.md` and
`.claude/commands/*.md` in a consuming project, but it **never overwrites
`CLAUDE.md`** (`refresh.test.sh`: "CLAUDE.md is NOT overwritten"). So the full
rule goes in `rules.md`, which `CLAUDE.md` already includes with
`@.claude/harness/rules.md` and so is in context every turn, and which reaches
existing projects on their next refresh. `CLAUDE.md` gets a short section that
points to it. That section reaches new projects only, and existing ones when
they merge `CLAUDE.md` by hand. The release note at DONE says so.

**What the guard can and cannot prove.** A bash test can pin that every
reporting site carries the instruction and names where the next action comes
from. It cannot pin that a model *follows* the instruction. Whether replies
actually improve is judged by the user in use, not by this story's gates.

Required check that would fail if this story's artifact broke: the full
`bash scripts/selftest.sh` run (CI `gates` job, harness self-test step), which
runs the new `reporting` suite and audits its floor. It is the same check
HARNESS-022 named.

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC.
     An AC that names a statistic, a metric or a threshold names a NEGATIVE
     CONTROL too: the deliberately broken input the metric must reject, and
     roughly what it should score. A criterion can be perfectly testable and
     still be blind to the defect it exists to catch, and that is more
     dangerous than a vague one - it survives review and goes green. -->

All six are checked by one guard, `reporting_problems <root>` in the new
`.claude/tests/reporting.test.sh`. Run over the real tree it must print nothing.
Run over a fixture that complies by construction except for one regression, it
must print **exactly one** line, naming the regressed file. That second run is
each criterion's negative control: a guard that never fires is satisfied by the
real tree whatever the tree says.

- **AC-1** — `.claude/harness/rules.md` has exactly one `# Reporting to the user`
  heading. Inside that section, each of the seven rule labels in the Contract
  begins exactly one bullet line. *Control:* a fixture whose label is deleted,
  or appears only outside the section, gives one line naming `rules.md` and the
  label.
- **AC-2** — Inside that section, the `**One next action, last.**` bullet names
  both `bash scripts/plan.sh after <id>` and `bash scripts/plan.sh <id>`. The
  `**Agent-to-agent artefacts are exempt.**` bullet names `## Handoff`,
  `## Regressions` and `docs/wiki/audits/`. *Control:* a fixture missing any one
  of those needles from its bullet (present elsewhere in the file) gives one line
  naming the needle.
- **AC-3** — `CLAUDE.md` has exactly one `## Reporting to the user` heading. Its
  body, up to the next `## ` heading, has **at most 6 non-blank lines** and
  carries the reference `` `rules.md`, "Reporting to the user" ``. *Control:* a
  7-line body gives one line naming the count; a body without the reference
  gives one line.
- **AC-4** — The **last paragraph** of every `.claude/commands/*.md` carries the
  reference `` `rules.md`, "Reporting to the user" `` and every next-action
  needle its row in the Contract's table names. The set of commands is read
  from the directory, not from the table. *Controls:* a needle only in an
  earlier paragraph gives one line. A command file with no table row gives one
  line naming it. A table row with no command file gives one line naming it.
- **AC-5** — `.claude/agents/lead-po.md`'s `## Orchestrating` section carries the
  reference `` `rules.md`, "Reporting to the user" ``. *Control:* the reference
  only in another section of the fixture gives one line.
- **AC-6** — A full `bash scripts/selftest.sh` passes. `floors.conf` floors
  `reporting` at the count it executes on this tree, and the `COUNTS` table in
  `selftest.test.sh` has a matching `reporting` row.

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

**Writes:** `.claude/harness/rules.md`, `CLAUDE.md`, `.claude/commands/advance-story.md`, `.claude/commands/complete-story.md`, `.claude/commands/plan-story.md`, `.claude/commands/status.md`, `.claude/commands/audit-mutations.md`, `.claude/commands/create-product.md`, `.claude/commands/plan-product.md`, `.claude/commands/setup-environment.md`, `.claude/agents/lead-po.md`, `.claude/tests/reporting.test.sh`, `.claude/tests/floors.conf`, `.claude/tests/selftest.test.sh`

**RED may amend any block below in place, with a reason; GREEN builds what the
amended block says.**

**The phase lock enforces nothing here.** Every path this story writes
classifies as `harness` (`bash scripts/classify.sh` checked each one at
PLANNED), so RED could write the prose and GREEN could write the test. The
split is held by discipline, as in HARNESS-015 and HARNESS-022. RED writes
`reporting.test.sh` and the two floor lines only. GREEN writes the prose only.

### The guard: `.claude/tests/reporting.test.sh`

- Sources `_lib.sh`, as every suite does. bash, awk and coreutils only.
- `reporting_problems <root>` prints one line per violation,
  `<relative-path>: <reason>`. It prints nothing when compliant and always
  returns 0, the same shape as `policy_problems` in `policy.test.sh`. Each
  `<reason>` quotes the missing label or needle verbatim. RED pins the exact
  reason strings and records them in the handoff.
- **Real tree:** `assert_eq` that `reporting_problems "$REPO_ROOT"` is empty. In
  RED this is the assertion that fails, listing every site GREEN must fix. That
  listing is the right failure, so paste it.
- **Fixtures** live in a `mktemp -d` root and are **built by construction**,
  not copied from the real tree, because in RED the real tree is what is not
  compliant yet. Build one fixture per control named in AC-1 to AC-5. Each one
  asserts that the guard prints exactly one line (`grep -c ''` on the output
  equals 1, or the equivalent) **and** that the line names the regressed file.
  Plus one fully compliant fixture that must print nothing.
- Needles are matched with fixed strings (`grep -F`) against **extracted
  regions**: a section, a bullet or a paragraph, never the whole file. That is
  the point of each "present elsewhere" control: a whole-file grep passes them
  all. A heading count uses `grep -cxF` on the whole line.
- Must stay clean under `bash scripts/check-sigpipe.sh` and
  `bash scripts/check-grep-count.sh`. CI runs both tree-wide, so a printing
  `grep -c … || echo 0` fallback in the new suite fails CI.
- **Amended in RED (test-developer, 2026-10-02): the matching is done in pure
  bash, not with `grep -F` / `grep -cxF` / awk.** Reason: measured. The first
  version used awk for each region and `grep -F` per needle; on this Windows
  machine the suite took **109 s** (`time bash .claude/tests/reporting.test.sh`,
  real 1m49s), almost all of it fork cost (sys 49 s). The pure-bash version
  (`mapfile`, `case "$region" in *"$needle"*`, a whole-line `[ "$l" = "$h" ]`
  count) takes **10.6 s** and printed byte-identical output on the same tree.
  The semantics are unchanged: a needle is a fixed string (quoted in the
  pattern, so no glob), it holds no newline so a match is always inside one
  line of the extracted region, and a heading count is a whole-line exact
  match. Two details the Region definitions left open are now pinned: a fence
  line is one whose first non-blank characters are ```` ``` ```` (indented
  fences toggle too), and the CLAUDE.md body is the section minus its heading
  line.

### Region definitions (the semantics the guard implements)

- **rules.md section:** from the line that is exactly `# Reporting to the user`
  up to, not including, the next column-0 line starting `# ` *outside a
  ```` ``` ```` fence*, or EOF. rules.md has bash fences, and inside them `# `
  is a comment, not a heading.
- **Bullet:** a line in that section starting `- **<label>**`, plus the lines
  after it up to the next line starting `- ` or the next blank line.
- **CLAUDE.md section:** from the line exactly `## Reporting to the user` up
  to, not including, the next line starting `## `. Its body is everything
  after the heading line. "Non-blank" means not empty and not only whitespace.
  **6** is the cap: the draft below is 4 lines, leaving room for one sentence
  more and no paragraph more. The section stays a pointer, not a second copy of
  the rule.
- **Last paragraph** of a command file: drop trailing blank lines, then take
  the lines after the last blank line. Each needle must sit on one line within
  it. Do not wrap a needle across a line break, because the match is per line.
- **lead-po.md `## Orchestrating` section:** from `## Orchestrating` to the
  next line starting `## `.

### The reference needle

Fixed string, on one line: `` `rules.md`, "Reporting to the user" `` (backtick,
`rules.md`, backtick, comma, space, the quoted heading). This mirrors the
existing `` `rules.md`, "Mutation work per story" `` style.

### The next-action table (AC-4), held in the test as a heredoc

| Command | Needle(s) its last paragraph must carry |
|---|---|
| `advance-story` | `bash scripts/plan.sh $1` **and** `bash scripts/plan.sh after $1` |
| `complete-story` | `bash scripts/plan.sh after $1` |
| `plan-story` | `bash scripts/plan.sh <id>` |
| `status` | `bash scripts/phase.sh board` |
| `audit-mutations` | `bash scripts/plan.sh after` |
| `create-product` | `/plan-product` |
| `plan-product` | `/setup-environment` |
| `setup-environment` | `bash scripts/plan.sh after` |

Why each source: `plan.sh <id>` says what drives a story still in flight.
`plan.sh after` (with or without an id) says what to start once nothing is in
flight. `phase.sh board` carries the recommended command for every story. The
three planning commands hand on to the next step of the loop in `CLAUDE.md`.
`bash scripts/plan.sh $1` is not a substring of `bash scripts/plan.sh after $1`,
so advance-story's two needles are independent.

### The prose GREEN writes (the settled text: read it out, do not re-derive)

**rules.md: a new final section `# Reporting to the user`**, after
`# Mutation work per story`. Draft wording follows. GREEN may tighten wording,
but the seven labels and the AC-2 needles are fixed:

> # Reporting to the user
>
> This is about the messages the orchestrator writes to the person in chat: at
> the end of a phase, a story, a plan or a status check. The user reads them to
> decide what to do next, often between other things, so build them for that.
>
> - **Lead with the outcome.** The first line says what is now true: the phase
>   the story reached, the PR that is open, the gate that failed. No preamble,
>   no recap of the request, no closing pleasantries.
> - **One next action, last.** End with exactly one concrete thing to do, a
>   command to type or a decision to make, taken from the script that knows:
>   `bash scripts/plan.sh after <id>` once a story closes,
>   `bash scripts/plan.sh <id>` while it is in flight. Do not end by asking
>   the user what they want to do; if the script's answer is wrong, say why and
>   give yours. Steps the user must take themselves are a numbered list, in
>   order.
> - **Plain words.** Say things the way the user would: "the new tests fail the
>   way they should", not "RED complete, handoff written". Phase names, law
>   numbers, section names and rule cross-references appear only when the user
>   needs one to make a decision, and then with half a line saying what it
>   means.
> - **Working notes stay in the story.** What you read or skipped, which rule
>   you followed, and caveats about your own process belong in the story file,
>   where the next agent needs them. The user gets the result and whatever they
>   must act on or know in order to trust it.
> - **Evidence, not a diagnosis.** When something fails, say what failed and
>   point at the evidence: the failing assertion, the command, its output or
>   the log path. State a cause only when the evidence shows it. "Cause not yet
>   known" is a finding. A cause made up to fit a "cause, then fix" template is
>   the failure this rule exists to prevent.
> - **Five items, then offer the rest.** Keep any visible list to about five
>   items. Anything beyond that, and any tangent you noticed, goes in one line
>   offering it, placed before the next action rather than after it.
> - **Agent-to-agent artefacts are exempt.** Story files (`## Handoff`,
>   `## Regressions`, `## Notes`, `## Gate probes`), audits under
>   `docs/wiki/audits/`, and a subagent's report to the orchestrator need to be
>   complete, not short. Nothing here shortens them. The message to the user
>   can be short *because* they are complete.

**CLAUDE.md: a new `## Reporting to the user` section**, placed directly after
`## Context discipline` (the file's last section, which is about the other
audience). Draft, 4 non-blank lines:

> Lead with what is now true and end with the one next action `plan.sh` gives.
> Keep your working notes in the story file, not in chat. On a failure, point at
> the evidence, and never state a cause it does not show. The full rule, and
> what is exempt, is `rules.md`, "Reporting to the user".

**Each command's last paragraph** is its reporting instruction. It must carry
the reference and its table needles. Where the current last paragraph is not
the reporting instruction (`audit-mutations.md` ends on the audit template;
`plan-product.md` ends on the `/setup-environment` hand-on, which can absorb
it), GREEN moves or extends the reporting instruction so it comes last.
Rewrite as little as possible: append the reference sentence
(`Report as `rules.md`, "Reporting to the user" says.` or similar) to the
existing final paragraph wherever that paragraph already names the next action.
For `advance-story.md`, the final "Finish by reporting" paragraph replaces "the
exact command to run next" with the source: `bash scripts/plan.sh $1` while the
story is still in flight, or the `bash scripts/plan.sh after $1` report once it
closed.

**lead-po.md:** one sentence in `## Orchestrating`, next to the existing
`plan.sh after` paragraph, saying the orchestrator's messages to the user follow
`rules.md`, "Reporting to the user", and that story files do not.

**No other file changes.** In particular, `advance-story.md`'s
`**REVIEW → DONE.**` paragraph is not touched: `policy.test.sh` reads it.

### Floors (AC-6)

Every assertion in the suite runs in RED and in GREEN alike; only the real-tree
one changes outcome. So the total, N = passed + failed in RED's summary line, is
already the executed count GREEN will show as `N passed, 0 failed`. RED adds
`floor | reporting | N` to `floors.conf`, and `reporting N` to the `COUNTS`
heredoc in `selftest.test.sh` in alphabetical position (between `refresh` and
`selftest`). The `selftest` suite's twin check must then pass. In RED,
`bash scripts/selftest.sh reporting` will also fail its floor (N-1 passed), and
that is part of the right failure: say so in the handoff. GREEN confirms
`reporting: N passed, 0 failed` and a passing full `bash scripts/selftest.sh`.
If N differs at GREEN, RED's count was wrong: return to RED, do not edit the
floor in GREEN.

### Oracle partition

- **Settled:** the seven labels, the AC-2 needles, the reference needle, the
  next-action table and the cap of 6. All are fixed above. Read them out; do
  not re-derive them.
- **Mechanical:** everything else, meaning region extraction, fault lines and
  counts. Pin it exactly and leave nothing open.
- **Oracle-free:** none in the gates. Whether replies actually get better is
  the user's judgement in use (Context).

### Callers of changed exports

None. No script, function or exported interface changes. `plan.sh` output is
read as it is today.

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

**DV-1: the guard fires on a real line of the tree (defect put back, and the
rules.md probe for a new rule over the tree).** With `scripts/mutate.sh`, break
the reference needle in the **real** `.claude/commands/status.md`
(`'s/"Reporting to the user"/"Reporting"/'`). Then run
`bash scripts/selftest.sh reporting`. The real-tree assertion **must** fail,
with exactly one problem line naming `.claude/commands/status.md`. The script
restores the file and verifies the restore. RED cannot run this: in RED
`status.md` does not carry the needle yet, so there is nothing to break.
**Owner: GATES.** Record it here, not in `## Gate probes`. The guard is a test
suite, not a `project.conf` gate, so this section owns the result.

**DV-1 result (GATES, 2026-10-02).** Ran as written:

```
$ bash scripts/mutate.sh .claude/commands/status.md 's/"Reporting to the user"/"Reporting"/' -- bash scripts/selftest.sh reporting
=== mutate: .claude/commands/status.md (1 line(s) changed by s/"Reporting to the user"/"Reporting"/) ===
  16 - Report as `rules.md`, "Reporting to the user" says.
  16 + Report as `rules.md`, "Reporting" says.
  the real tree
    FAIL reporting_problems over the real tree prints nothing: every site that speaks to the user carries the reporting rule
         expected: 
         actual:   .claude/commands/status.md: its last paragraph does not carry the reference: `rules.md`, "Reporting to the user"
reporting: 26 passed, 1 failed
=== mutate: command exited 1; restored (verified byte-for-byte against .claude/state/mutations/.claude_commands_status.md.20261002T193606Z.1253995.bak) ===
  16: Report as `rules.md`, "Reporting to the user" says.
```

Exactly one problem line, naming `.claude/commands/status.md`; the other 26
assertions held; the file was restored and the restore verified.

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

Planned by `bash scripts/plan.sh write HARNESS-023` from `.claude/harness/models.conf`.
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
- RED: `test-developer`, dispatched by the main session, ran on `claude-opus-5-5` (Opus 5.5), as planned. No override.
- GREEN: `feature-developer`, dispatched by the main session, ran on `claude-opus-5-5` (Opus 5.5), as planned. No override.

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Out of scope

<!-- Explicit non-goals. Prevents the Feature Developer from over-building. -->

- **No change to what agents write for each other.** That covers the story
  template, `## Handoff`, `## Regressions`, `## Notes`, `## Gate probes`, audit
  documents, and the reports the test-developer, feature-developer,
  lead-designer and mutation-tester agents return. Those agent files are not
  touched.
- **No new hook.** Nothing inspects the orchestrator's chat output, and no
  Stop-hook check is added.
- **Not installing or vendoring the external `i-have-adhd` plugin.** Only its
  ideas are adapted, minus its "cause, then fix" shape.
- **No change to `plan.sh` or `phase.sh` output.** The reports are relayed as
  printed. Rewording them is a separate story if the user wants it.
- **No time-estimate rule.** The source skill asks for concrete time
  estimates. This harness has no measured basis for them, and an invented one
  is the same defect as an invented cause.
- **No change to `refresh-harness.sh`'s handling of `CLAUDE.md`.** Existing
  consuming projects get the rule through `rules.md`. The `CLAUDE.md` section
  reaches them only through a hand merge, and the DONE release note says so.
- **Not policing `## Model guidance` or `/plan-story`'s report to *its*
  caller.** A dispatching session relays it. The rule governs the relay.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

<!-- Filled by the Test Developer during RED: which tests, at which level,
     and which AC each one covers. -->

One suite, `.claude/tests/reporting.test.sh`, one guard,
`reporting_problems <root>`. The level is a static check over prose: what is
under test is text no machine executes (`tdd-cycle`, "grep for the shape"). It
pins that the instruction is present where the orchestrator reads it, not that
a model follows it (story, Context).

- **Real tree (all ACs):** one premise (the files the guard reads exist) and
  one `assert_eq "" "$(reporting_problems "$REPO_ROOT")"`. The second is the
  RED failure.
- **Fixtures (each AC's negative control):** a fixture is built compliant by
  construction in `mktemp -d` (never copied from the tree), then ONE regression
  is applied, and the guard's whole output is compared with `assert_eq` against
  the exact one line expected. Exact equality is stronger than the Contract's
  "count is 1 and names the file": it pins the count, the path and the reason
  string in one assertion. Every "present elsewhere" control MOVES its needle
  rather than deleting it, so a whole-file grep would pass it.
- Compliant fixture: silent. It deliberately contains a ```` ``` ```` fence
  holding a `# ` comment inside the rules.md section, a following `# ` section,
  a CLAUDE.md body at exactly the cap with one whitespace-only line and a
  following `## ` section, and command files ending in trailing blank lines.
- AC-1: label deleted; label only in the next `# ` section; label beginning two
  bullets; fence markers removed (the comment becomes a heading, so the last
  bullet falls out); heading missing (`##` instead of `#`); heading twice.
- AC-2: each of the five needles moved out of its bullet (to another bullet, to
  the intro, to the preceding or the following `# ` section); and a needle
  after a blank line inside the bullet's indentation (a bullet ends at a blank).
- AC-3: 7-line body; reference only in the following section; heading missing
  (`###`); heading twice. The 6-line boundary is the compliant fixture.
- AC-4: a needle only in an earlier paragraph; the reference only in an earlier
  paragraph; advance-story with `plan.sh after $1` but not `plan.sh $1`
  (independence); a command file with no row; a row with no file; a file with
  no trailing newline whose needle sits in the paragraph above.
- AC-5: the reference only in another `## ` section; no `## Orchestrating`.
- AC-6: `floor | reporting | 27` in `floors.conf`, `reporting 27` in
  `selftest.test.sh`'s `COUNTS`. The `selftest` suite passes with both.

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

**Run:** `bash scripts/selftest.sh reporting` (the suite, plus its floor).
Also `bash scripts/selftest.sh selftest` (the COUNTS twin), and before REVIEW a
full `bash scripts/selftest.sh`, `bash scripts/check-sigpipe.sh`,
`bash scripts/check-grep-count.sh`. Timing: 10.6 s locally on Windows (Git
Bash). No CI timing yet; the suite has no timeout of its own.

**RED output, verbatim** (`bash scripts/selftest.sh reporting`, this tree):

```
  the real tree
    FAIL reporting_problems over the real tree prints nothing: every site that speaks to the user carries the reporting rule
         expected: 
         actual:   .claude/harness/rules.md: has 0 lines exactly `# Reporting to the user`, wants exactly 1
         CLAUDE.md: has 0 lines exactly `## Reporting to the user`, wants exactly 1
         .claude/commands/advance-story.md: its last paragraph does not carry the reference: `rules.md`, "Reporting to the user"
         .claude/commands/advance-story.md: its last paragraph does not name `bash scripts/plan.sh $1`
         .claude/commands/advance-story.md: its last paragraph does not name `bash scripts/plan.sh after $1`
         .claude/commands/audit-mutations.md: its last paragraph does not carry the reference: `rules.md`, "Reporting to the user"
         .claude/commands/audit-mutations.md: its last paragraph does not name `bash scripts/plan.sh after`
         .claude/commands/complete-story.md: its last paragraph does not carry the reference: `rules.md`, "Reporting to the user"
         .claude/commands/create-product.md: its last paragraph does not carry the reference: `rules.md`, "Reporting to the user"
         .claude/commands/plan-product.md: its last paragraph does not carry the reference: `rules.md`, "Reporting to the user"
         .claude/commands/plan-story.md: its last paragraph does not carry the reference: `rules.md`, "Reporting to the user"
         .claude/commands/setup-environment.md: its last paragraph does not carry the reference: `rules.md`, "Reporting to the user"
         .claude/commands/setup-environment.md: its last paragraph does not name `bash scripts/plan.sh after`
         .claude/commands/status.md: its last paragraph does not carry the reference: `rules.md`, "Reporting to the user"
         .claude/commands/status.md: its last paragraph does not name `bash scripts/phase.sh board`
         .claude/agents/lead-po.md: its `## Orchestrating` section does not carry the reference: `rules.md`, "Reporting to the user"
  ...
reporting: 26 passed, 1 failed
FAIL reporting  did 26 units of work, below the floor of 27 in .claude/tests/floors.conf
```

**Why it is the right failure.** The only red assertion is the real-tree one,
and its 16 lines are exactly the 11 sites the Contract's `**Writes:**` names
for prose (rules.md, CLAUDE.md, all 8 commands, lead-po.md). Once rules.md has
its heading, the per-label and per-needle lines will appear for whatever is
missing in its section; they are hidden now behind the one heading line, by
design (one line per broken file, not eight). Needles already present today
and therefore NOT listed: complete-story's `plan.sh after $1`, plan-story's
`plan.sh <id>`, create-product's `/plan-product`, plan-product's
`/setup-environment`. The floor failure (26 of 27) is the same fact counted
again, and is expected in RED. Every fixture assertion passes in RED, because
the guard lives in the test file and runs; that is what makes the controls
observable now rather than claims (see the table below).

**Assertions (27):**

| # | Assertion | AC |
|---|---|---|
| 1 | every file the guard reads exists (rules.md, CLAUDE.md, lead-po.md, advance-story.md) | premise |
| 2 | real tree prints nothing | all |
| 3 | compliant fixture is silent | all |
| 4-9 | label deleted / only in next `#` section / twice / fence removed / heading missing / heading twice | AC-1 |
| 10-15 | `after <id>` moved / `<id>` moved / `<id>` after a blank / `## Handoff` moved / `## Regressions` moved / `docs/wiki/audits/` moved | AC-2 |
| 16-19 | 7-line body / reference only in next section / heading missing / heading twice | AC-3 |
| 20-25 | needle earlier / reference earlier / advance-story independence / file with no row / row with no file / no trailing newline | AC-4 |
| 26-27 | reference in another section / no `## Orchestrating` | AC-5 |

AC-6 is `floors.conf` + `selftest.test.sh` COUNTS, checked by the `selftest`
suite (`selftest: 100 passed, 0 failed` with the new row in place) and by the
reporting floor itself.

**The exact reason strings GREEN's prose is judged against** (`<…>` is filled
in; every other character is literal, backticks included):

- `.claude/harness/rules.md: file is missing` (likewise `CLAUDE.md`, `.claude/agents/lead-po.md`)
- `.claude/harness/rules.md: has <n> lines exactly `# Reporting to the user`, wants exactly 1`
- `.claude/harness/rules.md: `# Reporting to the user` has <n> bullets beginning `- **<label>**`, wants exactly 1`
- `.claude/harness/rules.md: the `- **<label>**` bullet does not name `<needle>``
- `CLAUDE.md: has <n> lines exactly `## Reporting to the user`, wants exactly 1`
- `CLAUDE.md: `## Reporting to the user` has <n> non-blank lines, wants at most 6`
- `CLAUDE.md: `## Reporting to the user` does not carry the reference: `rules.md`, "Reporting to the user"`
- `.claude/commands/<name>.md: has no row in the next-action table`
- `.claude/commands/<name>.md: is in the next-action table but does not exist`
- `.claude/commands/<name>.md: its last paragraph does not carry the reference: `rules.md`, "Reporting to the user"`
- `.claude/commands/<name>.md: its last paragraph does not name `<needle>``
- `.claude/agents/lead-po.md: has no line exactly `## Orchestrating``
- `.claude/agents/lead-po.md: its `## Orchestrating` section does not carry the reference: `rules.md`, "Reporting to the user"`

**What GREEN must write, and what the tests pin.** Nothing is imported: the
guard is self-contained in the test file, so there is no export shape. The
pinned facts are textual:

- rules.md: exactly one line `# Reporting to the user`. Its section runs to the
  next column-0 `# ` line outside a fence, or EOF. Each of the seven labels
  begins exactly one line of the section as `- **<label>**` (label text with
  its trailing full stop, inside the `**`, then anything). Labels, verbatim:
  `Lead with the outcome.`, `One next action, last.`, `Plain words.`,
  `Working notes stay in the story.`, `Evidence, not a diagnosis.`,
  `Five items, then offer the rest.`, `Agent-to-agent artefacts are exempt.`
- A bullet is its label line plus following lines up to the next line starting
  `- ` or the first blank line. Continuation lines are fine indented. The
  next-action bullet must contain, each on one line, `bash scripts/plan.sh after <id>`
  and `bash scripts/plan.sh <id>`; the exemption bullet `## Handoff`,
  `## Regressions` and `docs/wiki/audits/`. The Contract's draft satisfies all
  of this as written (each needle sits on one line of it).
- CLAUDE.md: exactly one line `## Reporting to the user`; its body (to the next
  `## ` line) at most 6 non-blank lines, and `` `rules.md`, "Reporting to the user" ``
  on one line of it. The draft's line break falls between "is" and the
  reference, which keeps the needle whole; do not rewrap it across the break.
- Every `.claude/commands/*.md`: its last paragraph (after dropping trailing
  blank lines, the lines after the last blank line) carries the reference and
  the needles of its row, each on one line. A NEW command file with no row in
  the test's table would fail: adding one needs a RED change to the table.
- lead-po.md: the reference on one line between `## Orchestrating` and the next
  `## ` line.

**Not constrained (implementer's choice):** the wording around every needle;
the order of the seven bullets and whether rules.md's section is last; where in
the section's body the CLAUDE.md reference sits; extra lines inside a bullet as
long as no blank line splits the needle off; the position of the lead-po
sentence within `## Orchestrating`. The guard does NOT read meaning: a sentence
saying "do not follow `rules.md`, "Reporting to the user"" would satisfy it.
That is the limit of a fixed-string guard over prose, stated rather than hidden.

**Negative controls, measured.** Unlike an import-failing RED, the guard runs
now: every control below EXECUTED in RED against the compliant-by-construction
fixture, and these are measured values, not claims. What GREEN confirms is the
real-tree line going silent and `reporting: 27 passed, 0 failed`.

| Control | Threshold | Expected output | Measured in RED |
|---|---|---|---|
| compliant fixture | 0 lines | empty | empty (pass) |
| each AC-1..AC-5 regression (25) | exactly 1 line | the exact line in the suite | exactly that line, all 25 pass |
| CLAUDE.md body at 6 non-blank (+1 whitespace-only) | <= 6 | silent | silent |
| CLAUDE.md body at 7 | > 6 | `has 7 non-blank lines, wants at most 6` | that line |

**Do the controls discriminate? Mutations of the guard itself** (all through
`scripts/mutate.sh` on `reporting.test.sh`, restored and verified by `cmp`):

```
=== mutate: .claude/tests/reporting.test.sh (1 line(s) changed by s/^  s=\$n$/  s=0/) ===
    FAIL reporting_problems over the real tree prints nothing: ...
    FAIL a needle only in an earlier paragraph is reported
    FAIL the reference only in an earlier paragraph is reported
    FAIL with no trailing newline the last paragraph is still the last one, and the needle above it does not count
reporting: 23 passed, 4 failed
=== mutate: command exited 1; restored (verified byte-for-byte against .../.claude_tests_reporting.test.sh.20261002T172033Z.1066036.bak) ===
  171:   s=$n

=== mutate: .claude/tests/reporting.test.sh (1 line(s) changed by s/    \[ "\${l:0:2}" = "- " \] \&\& break/    false \&\& break/) ===
    FAIL reporting_problems over the real tree prints nothing: ...
    FAIL `bash scripts/plan.sh after <id>` in another bullet, not the next-action one, is reported
reporting: 25 passed, 2 failed
=== mutate: command exited 1; restored (verified byte-for-byte against .../.claude_tests_reporting.test.sh.20261002T172055Z.1066737.bak) ===
  140:     [ "${l:0:2}" = "- " ] && break
```

The first turns "last paragraph" into "whole file", and exactly the three
earlier-paragraph controls go red. The second stops a bullet ending at the next
`- `, and exactly the control that moves a needle into the NEXT bullet goes red.
A third, removing the fence condition from the section's end
(`if [ "$fence" = 0 ] && [` -> `if [`), took the compliant fixture red (23 of
27 failed, every fixture now also reporting the exempt bullet as missing),
which is the fence semantics being exercised by the compliant fixture.

**DV-1** (break the reference in the real `status.md`, watch the real-tree
assertion fail with one line): **I cannot run it in RED**, because the real
`status.md` does not carry the reference yet, so there is nothing to break. It
stays with GATES, as the story says.

**Files touched:** `.claude/tests/reporting.test.sh` (new),
`.claude/tests/floors.conf` (`floor | reporting | 27` and a dated note at the
foot), `.claude/tests/selftest.test.sh` (`reporting 27` in `COUNTS`), this
story (`## Contract` amendment in the guard block, `## Test plan`, this
handoff). Nothing committed.

**Discovered, changes the approach:** the Contract's `grep -F`-per-needle shape
costs 109 s on Windows; the guard is pure bash instead (amended in the
Contract, with the measurement). GREEN changes no test code, so this only
matters if a later story extends the guard: keep it fork-free.

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

    run:    2026-10-02T19:41:34Z
    commit: bd843e4 (working tree had uncommitted changes)
    tree:   1446873398de00e73d14dad5f9d761fbc2fcf111
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

- GATES (2026-10-02): full `bash scripts/selftest.sh` passed on this machine —
  `assertion floors: all 21 suite(s) met their declared floor (1785 assertions
  executed, 1555 declared)`, `reporting: 27 passed, 0 failed`. It took 6135 s
  (~102 min), far above the ~15 min previously seen here. A first attempt was
  killed at its 60-min limit while `phase-guard` ran alongside an orphaned
  selftest left by GREEN's killed background batch; the 6135 s run had nothing
  competing. The new `reporting` suite is ~11 s of that, so the slowdown is the
  machine, not this story — but read the CI timings at REVIEW.

**DONE, 2026-10-02.** Merged in #98 (merge commit 660f746), release 66. The
VERSION bump lands in this DONE commit. `phase.sh set DONE --force` was run on
`main`, overriding the branch check. PR CI: `gates` passed in 1m47s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37072655978),
`boundaries` in 9s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/37072655966).
CI timing is in line with HARNESS-022's 1m56s, so the 102-min local selftest
was this machine, not the suite. No epic.

**Release note.** Existing consuming projects get the reporting rule through
`rules.md` and the command files on their next `refresh-harness.sh`. The short
`## Reporting to the user` section in `CLAUDE.md` reaches only new projects:
refresh never overwrites `CLAUDE.md`, so an existing project merges it by hand.
