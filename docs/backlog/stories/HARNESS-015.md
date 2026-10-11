---
id: HARNESS-015
title: Mutation work per story is one targeted probe; exhaustive earning moves to audit-mutations
slug: mutation-work-per-story-is-one-targeted
epic: 
type: chore
status: done
phase: DONE
branch: story/HARNESS-015-mutation-work-per-story-is-one-targeted
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [.claude/harness/rules.md, .claude/commands/advance-story.md, .claude/commands/complete-story.md, .claude/commands/audit-mutations.md, .claude/skills/story-authoring/SKILL.md, .claude/skills/story-authoring/reference/sections.md, .claude/skills/tdd-cycle/SKILL.md, scripts/new-story.sh, scripts/gates.sh, .claude/skills/stack-profiles/reference/*.md, .claude/harness/project.conf, .claude/tests/gates.test.sh, .claude/tests/profiles.test.sh, .claude/tests/new-story.test.sh, .claude/tests/policy.test.sh, .claude/tests/floors.conf, .claude/tests/selftest.test.sh, .claude/harness/VERSION]  # files this story expects to write
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

<!-- Why this story exists. Link the epic and any wiki pages that constrain it.
     Name the REQUIRED gate that would fail if this story's artifact broke. If
     only an optional gate can, put it in required_gates above before RED:
     every required gate once passed over a story none of them exercised. -->

**Filed 2026-09-25 at the user's request.** The user asked that mutation
checking run **only when they request it, or possibly once per epic**, and not
as part of every story and PR. Today it runs on every story through two
channels, and neither involves the optional `mutation-tester` agent:

1. **The `mutation` gate.** Every stack profile configures it
   (`node-typescript.md:15` `stryker run`, `python-uv.md:13` `mutmut run`,
   `rust-cargo.md:14` `cargo mutants`) as `optional`, with a `slow` line.
   `slow` only keeps a gate out of `--fast`. So in a downstream project the
   mutation tool runs on **every full `gates.sh` run**: every story's GATES,
   and every PR's CI `gates` job. `project.conf:187-195` already carries a
   waiver for one such tool that could not even run. In this repository the
   gate is unconfigured, so nothing runs here.
2. **Per-story mutation duties written as prose.** Three instructions stack:
   * **"Do three mutations"**, in `/advance-story` GREEN → GATES (`:132`),
     `story-authoring/SKILL.md:271`, `reference/sections.md:61`, the story
     template (`scripts/new-story.sh:109`) and `tdd-cycle/SKILL.md:279`.
   * **"Two mutations, one run each"** to verify a handoff's mutation table
     (`/advance-story:301`, `/complete-story:48`).
   * **Each PO's own `## Deferred verifications`**, which nothing bounds.
     HARNESS-014's DV-3 asked for every assertion that passed on arrival to be
     earned. `rules.md` does not require that: it asks for a mutation only for
     a test written or corrected **against code that already exists**, and has
     GREEN confirm the measured values of controls instead.

**What it cost, measured on HARNESS-014** (commit timestamps, Git Bash on
Windows 11; Notes M-1): about 7.5h from PLANNED to REVIEW, of which **about
2h20 was GATES mutation work**: 18 mutations and about 27 full-suite runs.
**None of the 18 found a defect in the code.** Each one confirmed a test that
was already right. The one real defect in that story, two unpassable frozen
assertions, was found by GREEN simply running the suite. The same suites take
76s on CI's Linux runner and 20-30 min locally, so every local mutation run
costs roughly 15-40x what it would cost there.

**Required gate.** `BOOTSTRAPPED=no`, so every `gates.sh` gate is
UNCONFIGURED here. The check that fails if this story's artifact breaks is
`bash scripts/selftest.sh`, specifically the `gates`, `profiles`, `new-story`
suites and a new policy guard. CI runs them as a required step, so
`required_gates: []` is the honest value.

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC.
     An AC that names a statistic, a metric or a threshold names a NEGATIVE
     CONTROL too: the deliberately broken input the metric must reject, and
     roughly what it should score. A criterion can be perfectly testable and
     still be blind to the defect it exists to catch, and that is more
     dangerous than a vague one - it survives review and goes green. -->

- **AC-1: a gate can be marked on-request, and a full run then leaves it
  out.** Given a `project.conf` that configures a `mutation` gate and marks it
  on-request (the line's exact form is the Contract's), a full `gates.sh` run
  and a `--fast` run both leave the gate's command unexecuted: a marker that
  the command writes is absent afterwards. Each run's summary carries one line
  naming the gate as not run on request, and saying how to run it. The
  recorded `## Gate results` carries that line, and the overall result is
  unaffected. *Control:* `gates.sh --gate mutation` executes the command, and
  the marker appears. So does a full run for a story whose `required_gates`
  names the gate: the story asked for it.
- **AC-2: an on-request gate cannot be required.** `gates.sh --audit` exits
  non-zero, naming the gate, when an on-request line names a gate whose
  requirement is `required`. *Control:* the same line on an `optional` gate
  passes the audit.
- **AC-3: every stack profile marks its mutation gate on-request.** For every
  profile under `.claude/skills/stack-profiles/reference/` that configures a
  `mutation` gate, the profile also carries the on-request line for it, and the
  `profiles` suite asserts this for each profile it finds. *Control:* with one
  profile's on-request line removed through `scripts/mutate.sh`, that
  assertion fails for that profile by name.
- **AC-4: the per-story mutation budget is stated once, in `rules.md`, and
  every other site defers to it.**
  * **Where it lives:** `rules.md` gains one section, headed `# Mutation work
    per story`, stating the budget:
    - **Required per story:** a mutation that earns each test written or
      corrected against code that already exists (unchanged law); for a story
      that changes a rule over the tree, one probe against a real line of that
      tree (unchanged law); and for the story's central claim, one
      "defect put back" mutation. A format or codec story may add one
      wrong-value mutation.
    - **How a mutation runs:** against the one suite, or the narrowest test
      command, that holds the assertion it targets.
    - **Not per story:** exhaustively earning every assertion that passed on
      arrival, full mutation tables, and the `mutation` gate. Those belong to
      `/audit-mutations`.
  * **The other sites:** `/advance-story`, `/complete-story`,
    `story-authoring/SKILL.md`, `story-authoring/reference/sections.md`,
    `tdd-cycle/SKILL.md` and the story template in `scripts/new-story.sh` each
    name that section. None of them still instructs "three mutations" or "two
    mutations" per story.
  * **How it is checked:** a policy guard suite, with whole-line or anchored
    needles only (`rules.md`, "an assertion's needle is part of the
    assertion"). *Control:* restoring the old `Do three mutations` sentence in
    any one site, through `mutate.sh`, fails the guard for that file by name.
- **AC-5: a new story is born with the budget, not the old rule.** A story
  created by `scripts/new-story.sh` has a `## Deferred verifications` comment
  that names the `rules.md` section. It says that by default a story carries
  one "defect put back" entry for its central claim, and that exhaustive
  earning goes to `/audit-mutations`. The word `THREE` is absent from it.
  *Control:* the `new-story` suite fails when the template still says
  `Do THREE mutations`.
- **AC-6: `/audit-mutations` is where the exhaustive work lives.**
  * Its command file says it runs **on request**. Under Option S (the
    user's decision, 2026-09-25) `/advance-story` REVIEW → DONE also
    *recommends* `/audit-mutations <epic>` in its report when the story it
    closes was the last open story of its epic. It never runs it. A story with
    an empty `epic:` gets no recommendation.
  * Where a `mutation` gate is configured, it runs `bash scripts/gates.sh
    --gate mutation`. It also takes over earning assertions that passed on
    arrival, and verifying handoff mutation tables, for the stories in its
    scope.
  * Neither `/advance-story` nor `/complete-story` dispatches
    `mutation-tester` or runs the `mutation` gate itself.
  * The policy guard of AC-4 checks all three.
- **AC-7: what already holds still holds.** `check-boundaries.sh`'s
  Deferred-verifications checks (an owner named; a pasted result or `WAIVED`)
  and its pasted-output checks for `## Regressions` and `## Gate probes` are
  unchanged, and their existing assertions pass unchanged. `mutate.sh` is
  unchanged.
- **AC-8: floors raised in both places.** Every suite that gains assertions
  (expected: `gates`, `profiles`, `new-story` and the new policy suite) has the
  same new executed count in `.claude/tests/floors.conf` and in
  `selftest.test.sh`'s `COUNTS`, read from `bash scripts/selftest.sh <suite>`.
  `bash scripts/selftest.sh selftest` passes.

## Contract

<!-- Written by the Lead PO BEFORE RED, and AMENDABLE BY RED IN PLACE with a
     reason - GREEN then builds what the amended block says. This is where "RED
     tested one shape and GREEN built another" is prevented, and it is not the
     acceptance criteria: the criteria are frozen and change only through
     ## Amendments; this is a working agreement RED is expected to sharpen.
     One block per thing the story touches:
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

Pinned at PLANNED → RED, 2026-09-25, against `698b1ae`. **RED may amend any
block below in place, with a one-line reason beside the change; GREEN builds
what the amended block says.** The criteria are not amendable here.

**A correction to M-3, found while pinning this block:** the three profiles do
**not** mark `mutation` as `slow`. Only this repository's
`project.conf:242` does. So a consuming project that copied a profile runs its
mutation tool even on `--fast`, which means in every RED and GREEN as well.
C-5 closes that.

> **RED amendment (2026-09-25): the correction above is itself wrong; M-3 was
> right.** All three profiles DO carry a `slow | mutation | …` line, in their
> `## What --fast should leave out` block: `node-typescript.md:59`,
> `python-uv.md:62`, `rust-cargo.md:73` (`grep -n 'slow | mutation'` over
> `stack-profiles/reference/`). So a consuming project's `--fast` already
> leaves the mutation tool out; what runs it is every FULL run, exactly as M-3
> says. C-5 is unchanged - the `ondemand` line is still the fix - but GREEN
> should not remove or "restore" a `slow` line on the strength of the paragraph
> above, and `new-profile.md`'s new sentence should say a mutation gate carries
> BOTH lines.

### C-1. The `ondemand` line — `project.conf` syntax

    ondemand | <gate-id> | <why it is not run per story>

It is parsed in the same loop as `slow` (`gates.sh:108-119`) into a new
`ONDEMANDS` table of `<id>\t<why>` lines, and documented in `project.conf`'s
header beside `slow`. This repository's `project.conf` gains
`ondemand | mutation | per-story cost the user declined (HARNESS-015); run it with /audit-mutations`.

### C-2. `gates.sh` — what a run does with an on-request gate (AC-1)

* In the gate loop, **after** the `--gate` / `--required` filters and
  **before** the `--fast` `slow` check (`:281`): if the gate has an `ondemand`
  line, `$ONLY` is not that gate, and the story did not escalate it through
  `required_gates`, the gate is not run. Its command is never executed. One
  line is appended to the summary:

      ON REQUEST   <id> (not run: <why>; bash scripts/gates.sh --gate <id>)

  `ON REQUEST` is followed by three spaces, which keeps the 13-column status
  field that `PASS`, `UNCONFIGURED` and the others use. This applies to a full
  run and to `--fast` alike. The gate is **not** added to `--fast`'s
  `skipped:` list; it is reported once, as on-request.
* Checked before configured-ness: an on-request gate with no command is also
  `ON REQUEST`, not `UNCONFIGURED`.
* **`--gate <id>`** runs it exactly as today. **A story escalation**
  (`required_gates: [mutation]`) runs it too, with the existing
  `(required by story <id>)` suffix.

  > **RED amendment (2026-09-25), sharpening:** today that suffix appears on
  > the gate HEADER (`=== gate: mutation (required (required by story T-1)) ===`)
  > and on FAIL/BLOCKED lines, not on a PASS line, and the test pins the header
  > as it is. GREEN changes nothing about the suffix. The test also pins that
  > the story-escalated run counts the gate as ran (`3 ran` with unit, build
  > and mutation), that `--gate mutation` reports
  > `PASS         mutation (Ns, observed 12)`, and that the `ON REQUEST` line
  > is reported once and the gate never appears in `--fast skipped:`.
* **`--required`** reaches the gate only if it is required, and the audit
  (C-3) forbids that.
* **Unchanged:** the result string (`pass (N ran, M unconfigured, K known)`),
  the stamp (`FULL=yes` on a full run: the on-request gate is not part of what
  a story's full run judges), the recording, and exit statuses. An on-request
  gate is counted in none of `ran`, `unconfigured` or `known`.

### C-3. `gates.sh --audit` (AC-2)

Each of these prints one `FAIL <id> …` line and counts as a manifest problem,
so the audit exits 1:

* an `ondemand` line naming no configured gate:
  `` an `ondemand` line names no configured gate ``;
* an `ondemand` line with an empty reason:
  `marked on-request with no reason; say why it is not run per story`;
* an `ondemand` line naming a gate whose requirement **in `project.conf`**,
  not after any story escalation, is `required`:
  `an on-request gate cannot be required: no full run would ever judge it`.

### C-4. `gates.sh --list`

Beside the existing `slow:` row it prints
`on-request: <why> (run with --gate <id>)`.

### C-5. Stack profiles (AC-3)

`node-typescript.md`, `python-uv.md` and `rust-cargo.md` each gain
`ondemand | mutation | <why>` in the same block as their `gate | mutation`
line. `profiles.test.sh`:

* the profile checker recognises the `ondemand` kind, and its orphan check
  (`:118`) covers it: no `ondemand` line may name an unconfigured gate;
* it asserts, for each profile file that configures a `mutation` gate,
  `<profile>: its mutation gate is on request`.

`new-profile.md` gains one sentence telling authors to do the same.

> **RED amendment (2026-09-25), sharpening only:** "configures a `mutation`
> gate" is read as *declares* one - a line matching
> `^[[:space:]]*gate[[:space:]]*\|[[:space:]]*mutation[[:space:]]*\|`, with or
> without a command - because C-2 decides on-request before configured-ness and
> this repository's own conf declares the gate empty. Identical for the three
> profiles today. The checker also applies `slow`'s two rules to `ondemand`
> (must name a configured gate; must carry a reason), under check ids `orphan`
> and `ondemand`. Reason: the suite needs one definition, and the wider one
> cannot be satisfied by deleting a command.

### C-6. `rules.md` — the budget (AC-4)

A new top-level section, headed exactly `# Mutation work per story`, placed
after `# Non-negotiables`. It states AC-4's three parts: what is required per
story, how a mutation runs (one suite), and what is not per story (which goes
to `/audit-mutations`). It also says the budget is a default the PO writes and
the orchestrator runs, not a cap that `check-boundaries.sh` enforces (PO-B).

### C-7. The sites, and the policy guard (AC-4, AC-6)

**New suite `.claude/tests/policy.test.sh`** (suite name `policy`). It
defines `policy_problems <root>`, which prints one line
`<relative-path>: <reason>` per violation, and runs it twice:

* over `REPO_ROOT`, where it must print nothing: the real tree;
* over a fixture copy with one site regressed, where it must print exactly one
  line, naming that file. This is AC-4's control. DV-1 is the same check
  against the real tree.

**The rules `policy_problems` applies:**

| Files | Must | Must not |
|---|---|---|
| the six sites: `.claude/commands/advance-story.md`, `.claude/commands/complete-story.md`, `.claude/skills/story-authoring/SKILL.md`, `.claude/skills/story-authoring/reference/sections.md`, `.claude/skills/tdd-cycle/SKILL.md`, `scripts/new-story.sh` | contain the fixed string `Mutation work per story` | match `grep -Eiw '(three\|two) mutations'` |
| `.claude/harness/rules.md` | have a line exactly `# Mutation work per story` | match `grep -Eiw '(three\|two) mutations'` |
| `.claude/commands/audit-mutations.md` | contain `on request` and `bash scripts/gates.sh --gate mutation` | - |
| `.claude/commands/advance-story.md` and `.claude/commands/complete-story.md` | - | contain `mutation-tester` or `--gate mutation` |
| `.claude/commands/advance-story.md` | contain `/audit-mutations` in its REVIEW → DONE section (Option S) | - |

Wording of the sites is GREEN's, under these rules:

* **The codec lesson survives.** `tdd-cycle`'s anecdote and the "wrong value,
  not a missing field" advice are kept as *the one extra mutation a format or
  codec story may add*, reworded so that neither says "three".
* **`/advance-story`'s mutation-table bullet (`:294-302`)** becomes one
  mutation, the one whose predicted catch is a single assertion, run against
  that assertion's suite.
* **`/advance-story` GREEN → GATES (`:128-138`)** runs the story's deferred
  verifications, each against the one suite that holds its assertion.
* **`/advance-story` REVIEW → DONE, Option S:** when the closed story's
  `epic:` is non-empty and no other story in that epic is short of DONE, the
  report recommends `/audit-mutations <epic>`. It never runs it.

> **RED amendment (2026-09-25), pinning what the guard actually reads.** The
> suite is written; these are facts about it, not proposals.
> * **"REVIEW → DONE section"** = the lines from the one that *begins*
>   `**REVIEW → DONE.**` (the paragraph opener the file uses today at `:206`)
>   up to, not including, the next line that begins `**`. `/audit-mutations`
>   must appear inside that span; a mention elsewhere in the file does not
>   count (a fixture pins this). A file with no such opener is a violation in
>   its own right, so GREEN must keep the opener's exact spelling, arrow
>   included.
> * **The needles, as applied:** sites - `grep -qF 'Mutation work per story'`
>   and `grep -qEiw '(three|two) mutations'`; rules.md - `grep -qxF '# Mutation
>   work per story'` (whole line, so `##` does not satisfy it) and the same
>   count regex; audit-mutations - `grep -qF 'on request'` and `grep -qF 'bash
>   scripts/gates.sh --gate mutation'`; advance/complete - `grep -qF
>   'mutation-tester'` and `grep -qF -- '--gate mutation'` must NOT match.
>   `-w` is pinned by fixture: `twentythree mutations` and `Three mutation
>   runs` do not trip it; `Three mutations beat one` and `Two mutations, one
>   run each` do, whatever the case. Note the last two are the exact sentences
>   at `sections.md:61` and `advance-story.md:301` today, and the `tdd-cycle`
>   anecdote at `:279` ("Three mutations of one codec") trips it too - all
>   three need rewording, not only the "Do three" instructions.
> * **Output lines** are `<relative-path>: <reason>`; the reasons are fixed in
>   `policy.test.sh` and GREEN does not need them, since GREEN edits the sites
>   and never the guard.
> * **audit-mutations.md is not one of the six sites**, so it may say
>   "three" if it wants to; only the six and rules.md are bound by the count
>   rule.

### C-8. The story template — `scripts/new-story.sh` (AC-5)

The `## Deferred verifications` comment's closing sentences (`:107-111`) are
replaced. The new text names `Mutation work per story`, says the default is
one "defect put back" entry for the story's central claim, and sends
exhaustive earning to `/audit-mutations`. `new-story.test.sh` generates a story
and asserts on its text: `Mutation work per story` present, `THREE` absent.
The existing assertions in that suite hold.

> **RED amendment (2026-09-25), pinning:** the four assertions read the
> `## Deferred verifications` section of the generated story only (from that
> heading to the next `## `), and require the literal substrings `Mutation
> work per story`, `defect put back` and `/audit-mutations` there, and
> `grep -cw THREE` = 0 over the whole story (whole word, case-sensitive - a
> lower-case "three" elsewhere in the template is not this assertion's
> business, though the policy guard's count rule still applies to
> `new-story.sh` as a site). Backticks around any of those phrases are fine:
> the existing "every backtick span survives" assertion covers them.

### C-9. `/audit-mutations` (AC-6)

The command file says that it runs on request, and when the loop recommends
it (Option S). It says it runs `bash scripts/gates.sh --gate mutation` where
the gate is configured, and reasons by hand otherwise, as today. It also says
it owns earning assertions that passed on arrival, and verifying mutation
tables, for the stories in its scope.

### C-10. Callers, readers and release

* **No function signature changes.**
* **What reads the gate summary:** a grep for `UNCONFIGURED` / `unconfigured`
  outside `gates.sh`, across `scripts`, `.claude/hooks`, `.claude/tests` and
  `.github`, finds only `profiles.test.sh:118`, a label.
  `check-boundaries.sh` reads `## Gate results` only for its `result:` and
  `tree:` lines, whose form does not change. So adding `ondemand` to this
  repository's `project.conf` changes the recorded summary from
  `UNCONFIGURED mutation` to `ON REQUEST   mutation …`, and no reader breaks.
  `gates.test.sh` builds its own `project.conf` per block and is indifferent.
* **Release:** `.claude/harness/VERSION` 53 → 54, in GATES.

> **RED amendment (2026-09-25):** the grep was re-run at RED. It finds TWO
> hits, not one: `profiles.test.sh:118` (now `:151`, the orphan label, still
> a label) and `scripts/task.sh:12`, which prints `<unconfigured>` for a
> `task |` line with no command - a different table, not a reader of the gate
> summary. The conclusion stands: no reader breaks.

### C-11. Oracle partition

* **Settled, read out:** AC-8's floors. Baselines from `floors.conf` at
  `698b1ae`: `gates 134`, `profiles 37`, `new-story 25`; `policy` is new.
* **Oracle-free:** none.
* **Mechanical, pin exactly:** everything else. That means the exact
  `ON REQUEST` line and a marker file that the gate command writes (AC-1);
  audit exit status and `FAIL` lines (AC-2); per-profile assertion names
  (AC-3); `policy_problems` output lines (AC-4, AC-6); and generated-template
  text (AC-5).

### C-12. Test-only dependencies

None. Bash, git, awk and coreutils.

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
     assertions earned by the same mutation, for free. Do THREE mutations rather
     than one, and make one of them a wrong VALUE rather than a missing field: a
     suite that catches an omission can be blind to a corruption, and a codec
     that is uniformly wrong round-trips through itself perfectly. -->

### DV-1. The policy guard, probed against the real tree

*Condition.* With the GREEN tree checked out, restoring the old sentence at a
**real** site (for example `/advance-story`'s `Do three mutations rather than
one`) through `scripts/mutate.sh` **must** fail the policy guard, naming that
file. The control of AC-4 does the same against fixtures; this does it against
the tree the guard judges (`rules.md`, "a rule is probed against the tree it
judges"). **This is the story's only deferred verification, by its own
budget.**

*Why not RED.* The guard fails in RED anyway, because the sites still say
"three mutations". A probe run there proves nothing.

**Owner: GATES**

**Result (GATES, 2026-09-25, orchestrator, at the GREEN commit).** One mutation
against the one suite that holds the assertion, which is this story's own
budget:

    === mutate: .claude/commands/advance-story.md (1 line(s) changed by s/^verifies its own restore, and run each entry against the one suite that holds$/verifies its own restore. Do three mutations rather than one, and run each entry against the one suite that holds/) ===
      132 - verifies its own restore, and run each entry against the one suite that holds
      132 + verifies its own restore. Do three mutations rather than one, and run each entry against the one suite that holds
    === mutate: running bash scripts/selftest.sh policy ===
        FAIL policy_problems over the real tree prints nothing: one budget, in rules.md, and every site defers to it
             actual:   .claude/commands/advance-story.md: still prescribes a per-story mutation count (matches `(three|two) mutations`)
    policy: 16 passed, 1 failed
    === mutate: command exited 1; restored (verified byte-for-byte …) ===

With the old sentence put back on a real line, the guard fires and names
exactly that file, in one line. **DV-1 passes.** It took seconds, where
HARNESS-014's DV-2 and DV-3 took about 2h20.

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

Planned by `bash scripts/plan.sh write HARNESS-015` from `.claude/harness/models.conf`.
A PLAN, not a record: a session setting or an explicit override can beat both
this and the agent's own `model:` field, and nothing here can see which won.
The orchestrator still writes down the model each dispatch **resolved** to, by
name, below the table.

| Phase | Agent | Planned | Why |
|---|---|---|---|
| PLANNED | `lead-po` | `opus` | planning is the judgement phase: decomposition, the oracle partition, and what goes in the contract |
| RED | `test-developer` | `fable` | the measured case. With a partitioned contract to work from, the brief carries the judgement and the weaker model writes sharper negative controls than the stronger one did without it |
| GREEN | `feature-developer` | `opus` | the failure mode of a weaker model here is reaching green by weakening a test, which is the one thing this harness exists to prevent |
| GATES | `feature-developer` | `opus` | same risk as GREEN, and a gate failure is where "make it stop complaining" is most tempting |
| REVIEW | `lead-po` | `opus` | reading review feedback against the contract is judgement, and a wrong call here ships |
| SCAFFOLD | `lead-po` | `opus` | source, tests and config in one indivisible derivation, with no failing test in front of any of it |

**Resolved:**

- PLANNED → RED, `lead-po` (orchestrator): `claude-opus-5-5`, as planned.
- RED, `test-developer`: explicit `model: fable` → **fable** (`claude-fable-5-1`), as planned. It corrected the orchestrator's own wrong M-3 "correction", which the orchestrator verified: the `slow | mutation` lines are at `node-typescript.md:59`, `python-uv.md:62` and `rust-cargo.md:73`.
- GREEN, `feature-developer`: explicit `model: opus` → **opus** (`claude-opus-5-5`), as planned. It confirmed every control value RED recorded, ran the one AC-3 mutation the budget allows (`profiles: 49 passed, 1 failed`, restored), and weakened nothing.
- GATES: no dispatch. The orchestrator ran DV-1 (one mutation, one suite) and the full gates on `claude-opus-5-5`.

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Out of scope

<!-- Explicit non-goals. Prevents the Feature Developer from over-building. -->

- **Weakening "watched to fail".** Law 1 and the non-negotiables stand as
  written: a test written or corrected against existing code is still earned
  by a mutation, and a rule over the tree is still probed against a real line.
  This story bounds everything *beyond* those.
- **`check-boundaries.sh`.** It keeps checking that each deferred verification
  names an owner and carries a result or `WAIVED`. A story that deliberately
  writes more entries than the budget may still do so. The budget is a default
  for the PO, not a cap that the script enforces.
- **Local suite speed on Windows.** Suites run 15-40x slower here than on CI
  because Git Bash is slow at starting processes. That is real, but it is a
  separate problem: fewer runs is this story, faster runs is not.
- **Re-running or retro-waiving past stories' deferred verifications.**
  HARNESS-014's DV-2 and DV-3 stay as recorded.
- **`mutate.sh` and the `mutation-tester` agent definition.** They are
  unchanged, apart from the command file for `/audit-mutations` (AC-6).
- **Downstream `project.conf` files.** Profiles gain the on-request line, and
  a consuming project picks it up through `refresh-harness.sh` or by adding the
  line by hand. This story does not edit any other repository.

## Open question - DECIDED: Option S (the user, 2026-09-25)

**Is `/audit-mutations` tied to epics, and if so, how?** The user said "only
when I request, or potentially for each epic". The answer changes AC-6's
wording and whether `/advance-story` REVIEW → DONE changes at all.

* **Option Q: on request only.** `/audit-mutations` runs when the user types
  it, and nothing in the story loop mentions it. *For:* the smallest change,
  and nothing runs by surprise. *Against:* nothing reminds anyone, so the
  exhaustive audit may never happen.
* **Option S: suggested at epic close.** When REVIEW → DONE closes the last
  open story of an epic, the orchestrator's report recommends
  `/audit-mutations <epic>`, with the epic's touched paths as scope. It never
  runs it. *For:* the audit arrives at a natural checkpoint and the user
  decides. *Against:* one more line in `/advance-story`, and harness stories
  have no epic, so this repository would behave as under Q.
* **Option A: run automatically at epic close.** *For:* it always happens.
  *Against:* it is the cost the user asked to stop paying on a timer the user
  did not choose, at epic scale instead of story scale.

**PO recommendation: S.** It matches "potentially for each epic" without
spending anything the user has not approved.

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

<!-- Filled by the Test Developer during RED: which tests, at which level,
     and which AC each one covers. -->

Written in RED, 2026-09-25, against `d771ab1`. Every test is a harness
self-test (bash, git, awk, coreutils) run through `scripts/selftest.sh`; no
gate in `project.conf` is configured here, so the selftest step in CI is the
required check. Level per criterion:

| AC | Suite | Level | What falsifies it |
|---|---|---|---|
| AC-1 | `gates` | integration: the real `gates.sh` against a fixture `project.conf` whose `mutation` gate command writes a marker file | marker present after a full run or `--fast`; the exact `ON REQUEST   mutation (…)` line missing from the summary or from the recorded `## Gate results`; the gate counted in `ran`; `--fast skipped:` naming it; a no-command on-request gate reported `UNCONFIGURED`; `--list` lacking the `on-request:` row. Controls: `--gate mutation` and a story escalation must leave the marker present |
| AC-2 | `gates` | integration: `gates.sh --audit` | required + ondemand not refused with C-3's exact `FAIL` line and exit 1; typo'd id or empty reason not refused; control: the same line on an optional gate must pass, including with a story escalation active |
| AC-3 | `profiles` | unit over the real profile files, through the suite's `profile_problems` checker | for each of `node-typescript.md`, `python-uv.md`, `rust-cargo.md`, `<profile>: its mutation gate is on request` is red until the `ondemand` line exists. The checker's `ondemand` rules are themselves pinned against a fixture profile first, and a premise asserts the three profiles really do declare a mutation gate, so the per-profile loop cannot pass by finding nothing |
| AC-4, AC-6 | `policy` (new) | static guard over the real tree, plus fixtures | `policy_problems REPO_ROOT` prints anything. Each of the C-7 rules is fired singly against a fixture built compliant by construction, so the real-tree assertion cannot be satisfied by a guard that never fires; the `-w` word boundary of the count regex is pinned four ways |
| AC-5 | `new-story` | integration: run the real `new-story.sh` into a throwaway root, read the generated story | the `## Deferred verifications` comment lacks `Mutation work per story`, `defect put back` or `/audit-mutations`, or the story contains the word `THREE` |
| AC-7 | `boundaries` | untouched | nothing new: the existing DV / Regressions / Gate probes assertions are the test, and they were not edited |
| AC-8 | `selftest` | the real `floors.conf` against the `COUNTS` table | floors and COUNTS disagree, or a suite has no floor |

Edges covered where cheap: an on-request gate with **no command** (C-2);
`ondemand` naming **no gate**, and with an **empty reason** (C-3); a story
escalation is **not** a manifest fault (C-3, "in project.conf, not after any
story escalation"); `/audit-mutations` mentioned **outside** the REVIEW → DONE
paragraph, and the paragraph **missing** altogether (C-7); `twentythree
mutations` and the singular `three mutation` do **not** trip the count rule,
while `Three mutations beat one` and `Two mutations, one run each` do. Out of
scope pinned: nothing about `check-boundaries.sh` or `mutate.sh` was touched or
asserted.

Budget, applied to this story (`rules.md` as it stands; the new section is
GREEN's): three assertions passed on arrival and each is earned by ONE mutation
run against ONE suite, recorded in the handoff. No mutation tables; DV-1 is
declined here and left to GATES.

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

Written 2026-09-25 by the Test Developer (dispatched as `fable`, the planned
model; no override was reported to me). Tree: `d771ab1` plus this RED work,
uncommitted. Git Bash on Windows 11; every timing below is local.

### Commands

    bash scripts/selftest.sh policy       # ~3 s
    bash scripts/selftest.sh profiles     # ~12 s
    bash scripts/selftest.sh new-story    # ~3 s
    bash scripts/selftest.sh gates        # slow here: see the timing below
    bash scripts/selftest.sh selftest     # floors vs COUNTS
    bash scripts/selftest.sh              # the full run CI performs

### Files touched

* `.claude/tests/policy.test.sh` - NEW suite `policy` (AC-4, AC-6)
* `.claude/tests/gates.test.sh` - two blocks appended before `summary` (AC-1, AC-2)
* `.claude/tests/profiles.test.sh` - `ondemand` in the checker, fixture checks, premise, per-profile AC-3 assertion
* `.claude/tests/new-story.test.sh` - one block appended (AC-5)
* `.claude/tests/floors.conf` - gates 134→169, profiles 37→50, new-story 25→29, policy 17 (new), plus the HARNESS-015 note
* `.claude/tests/selftest.test.sh` - `COUNTS` to match; the `profiles` line now 50
* this story: `## Contract` amendments (six, each marked "RED amendment"), `## Test plan`, this section

Nothing else. `scripts/gates.sh`, `scripts/new-story.sh`, `rules.md`,
`project.conf`, every command file and skill are untouched and are GREEN's.

### Failure output, and why each is the right failure

**`policy`** - `policy: 16 passed, 1 failed`. The one red assertion is the
real-tree check, and its output is the whole to-do list for AC-4/AC-6:

    FAIL policy_problems over the real tree prints nothing: one budget, in rules.md, and every site defers to it
         expected:
         actual:   .claude/commands/advance-story.md: does not name the `Mutation work per story` section of rules.md
         .claude/commands/advance-story.md: still prescribes a per-story mutation count (matches `(three|two) mutations`)
         .claude/commands/complete-story.md: does not name the `Mutation work per story` section of rules.md
         .claude/skills/story-authoring/SKILL.md: does not name the `Mutation work per story` section of rules.md
         .claude/skills/story-authoring/SKILL.md: still prescribes a per-story mutation count (matches `(three|two) mutations`)
         .claude/skills/story-authoring/reference/sections.md: does not name the `Mutation work per story` section of rules.md
         .claude/skills/story-authoring/reference/sections.md: still prescribes a per-story mutation count (matches `(three|two) mutations`)
         .claude/skills/tdd-cycle/SKILL.md: does not name the `Mutation work per story` section of rules.md
         .claude/skills/tdd-cycle/SKILL.md: still prescribes a per-story mutation count (matches `(three|two) mutations`)
         scripts/new-story.sh: does not name the `Mutation work per story` section of rules.md
         scripts/new-story.sh: still prescribes a per-story mutation count (matches `(three|two) mutations`)
         .claude/harness/rules.md: has no line exactly `# Mutation work per story`
         .claude/commands/audit-mutations.md: does not say it runs `on request`
         .claude/commands/audit-mutations.md: does not run `bash scripts/gates.sh --gate mutation`
         .claude/commands/advance-story.md: its REVIEW → DONE paragraph does not recommend `/audit-mutations`

Right failure: every line is a C-7 rule unmet by the tree as it stands, and
nothing else is red - the 16 fixture assertions show each rule firing on its
own file and staying silent on a compliant one. Note `complete-story.md` has no
count violation today (its `:48` sentence does not match the regex) and
neither command file mentions `mutation-tester` or `--gate mutation`, so those
two "must not" rules pass on arrival; they are kept honest by their fixture
cases, not by a mutation.

**`profiles`** - `profiles: 47 passed, 3 failed`:

    FAIL node-typescript.md: its mutation gate is on request
         expected:
         actual:   - configures a `mutation` gate with no `ondemand | mutation | <why>` line, so every full run executes it
    FAIL python-uv.md: its mutation gate is on request
         (same)
    FAIL rust-cargo.md: its mutation gate is on request
         (same)

Right failure: one per profile that declares a mutation gate, named by file,
which is AC-3's control shape exactly. `godot.md` and `web-static.md` declare
none and get no such assertion.

**`new-story`** - `new-story: 25 passed, 4 failed`:

    FAIL names the rules.md section
    FAIL says the default is one "defect put back" entry for the central claim
    FAIL and sends exhaustive earning to /audit-mutations
    FAIL the word THREE is absent from the generated story
         expected: 0
         actual:   1

Right failure: the generated story's DV comment is today's text ("Do THREE
mutations rather than one…"), which the fourth assertion quotes back. The 25
existing assertions still pass, as C-8 requires.

**`gates`** - `gates: 152 passed, 17 failed` (169 executed; `real 11m54s`
locally through `selftest.sh`, so budget 12-20 min per run on this machine and
about 1.5 min on CI, by HARNESS-014's M-1 ratio). The 17 red, verbatim from
the run's FAIL lines, all in the two new blocks:

    FAIL a full run does not execute the on-request gate's command
    FAIL and reports it once, whole line: ON REQUEST, the reason, and the command that runs it
    FAIL and it is counted in none of ran, unconfigured or known
    FAIL and the recorded ## Gate results carries the ON REQUEST line
    FAIL --fast does not execute it either
    FAIL --fast reports the same ON REQUEST line, once
    FAIL an on-request gate with no command is ON REQUEST, not UNCONFIGURED
    FAIL and UNCONFIGURED does not name it
    FAIL and the result counts it in nothing
    FAIL --list shows the on-request row with the reason and the command
    FAIL ondemand on a required gate fails the audit, naming the gate and why
    FAIL and the audit exits 1
    FAIL and counts it as a manifest problem
    FAIL ondemand naming no configured gate fails the audit
    FAIL and exits 1
    FAIL ondemand with no reason fails the audit
    FAIL and exits 1

Right failure: `gates.sh:112` drops any `kind` it does not know, so today the
`ondemand` line is ignored, the optional `mutation` gate runs (marker present:
the first FAIL's `expected: absent / actual: present`), the summary says
`PASS mutation`, the result counts `3 ran`, and the audit passes everything.
The 18 green-on-arrival assertions in these blocks are the ones that hold
whether or not `ondemand` exists - `exit 0`, `FULL=yes`, `--fast skipped:
build`, `it is not reported UNCONFIGURED` (the gate has a command), and the
controls earned below. The 134 pre-existing assertions all still pass.

**`selftest`** - `selftest: 54 passed, 0 failed` with the new floors and
COUNTS in place (it is green in RED by design: AC-8 is about the two tables
agreeing, and they do).

### The shape the tests pin (facts, not suggestions)

**`project.conf` grammar (C-1):** `ondemand | <id> | <why>`; parsed like
`slow`; `<why>` may contain `;` and `/` (one fixture uses
`no tool chosen yet; run it with /audit-mutations`).

**Summary line (C-2), exact, whole-line matched with `grep -cxF`:**

    ON REQUEST   mutation (not run: <why>; bash scripts/gates.sh --gate mutation)

`ON REQUEST` + three spaces, then the id, one space, the parenthesis. Printed
once on a full run and once on `--fast`; recorded into `## Gate results`
indented four spaces like every other summary line; **never** in
`--fast skipped:` (the test pins `--fast skipped: build` exactly, with `build`
the only slow gate); no `UNCONFIGURED mutation` beside it, including when the
gate has no command; not counted in `ran`/`unconfigured`/`known` (`2 ran, 0
unconfigured, 0 known` with unit+build+ondemand-mutation; `1 ran, …` for
unit+empty-ondemand-mutation); exit 0; `FULL=yes` in the stamp on the full
run. `--gate mutation` runs it and prints `PASS         mutation (Ns, observed
12)`; a story with `required_gates: [mutation]` runs it on a full run with the
header `=== gate: mutation (required (required by story T-1)) ===` and `3 ran`.

**`--list` (C-4):** a row containing
`on-request: <why> (run with --gate mutation)` (matched by containment).

**Audit (C-3), each matched as a whole line by regex, `%-12s` padding allowed
by `+`:**

    ^FAIL +mutation +an on-request gate cannot be required: no full run would ever judge it$
    ^FAIL +mutatoin +an `ondemand` line names no configured gate$
    ^FAIL +mutation +marked on-request with no reason; say why it is not run per story$

plus `^1 manifest problem\(s\)\.$` and exit 1 for the first; `^Manifest audit
passed\.$` and exit 0 for the optional-gate control, also with a story
escalation active (the audit judges `project.conf`'s own requirement).

**Profiles (C-5):** a line matching
`^[[:space:]]*ondemand[[:space:]]*\|[[:space:]]*mutation[[:space:]]*\|` with a
non-empty third field, in each of the three profiles; it must name a gate the
profile declares.

**Policy (C-7):** see the RED amendment under C-7 - the needles and the
REVIEW → DONE paragraph definition are there. **Wording GREEN must avoid** in
the six sites and `rules.md`: any whole-word `three mutations` / `two
mutations`, any case. Today's offenders: `advance-story.md:132` and `:301`,
`story-authoring/SKILL.md:271`, `sections.md:61`, `tdd-cycle/SKILL.md:279`
("Three mutations of one codec"), `new-story.sh:109`.

**Template (C-8):** literal `Mutation work per story`, `defect put back` and
`/audit-mutations` inside the `## Deferred verifications` comment; no
whole-word `THREE` anywhere in the generated story.

**Not constrained:** the reason strings in this repository's `project.conf`
and in the profiles (any non-empty text; the fixture's are illustrative); the
wording of `rules.md`'s section body, of every site, of `new-profile.md`'s
sentence and of `/audit-mutations`, beyond the needles above; where in
`gates.sh` the `ONDEMANDS` table lives or what it is called; the `--list`
row's column layout; the order of `FAIL` lines in the audit; anything about
`check-boundaries.sh` or `mutate.sh`.

### Assertions that passed on arrival, and the one mutation each that earns them

All three were written against behaviour `gates.sh` or the profiles already
have. Each was earned by ONE `mutate.sh` run against ONE suite, per the budget
this story introduces; nothing else green-on-arrival was mutated (the
`--fast skipped: build`, `PASS unit`-style pins ride on the same blocks and are
not independently earned - listed so nobody mistakes them for forgotten).

**(1) `profiles`: "node-typescript, python-uv and rust-cargo each configure a
mutation gate"** - the premise that stops the per-profile loop passing on an
empty list.

    $ bash scripts/mutate.sh .claude/skills/stack-profiles/reference/rust-cargo.md \
        's/gate | mutation  | optional/gate | mutatoin  | optional/' -- bash scripts/selftest.sh profiles
    === mutate: .claude/skills/stack-profiles/reference/rust-cargo.md (1 line(s) changed by s/gate | mutation  | optional/gate | mutatoin  | optional/) ===
    === mutate: running bash scripts/selftest.sh profiles ===
        FAIL node-typescript, python-uv and rust-cargo each configure a mutation gate
        FAIL node-typescript.md: its mutation gate is on request
        FAIL python-uv.md: its mutation gate is on request
        FAIL no evidence, floor, slow or ondemand line names an unconfigured gate
    profiles: 45 passed, 4 failed
    FAIL profiles  did 45 units of work, below the floor of 50 in .claude/tests/floors.conf
    1 of 1 harness suite(s) FAILED.
    === mutate: command exited 1; restored (verified byte-for-byte against …/.claude/state/mutations/.claude_skills_stack-profiles_reference_rust-cargo.md.20260925T045526Z.37477.bak) ===

The premise went red by name; rust-cargo's own AC-3 assertion vanished (45
executed, under the floor - the floor doing its job); the orphan FAIL is
rust-cargo's `slow | mutation` line now pointing at nothing. Restored, verified.

**(2) `gates`: AC-1 controls (i) `--gate mutation executes the command` and
(ii) `a story with required_gates: [mutation] gets it run on a full run`** -
one mutation, making the gate loop skip any gate named `mutation`:

    $ bash scripts/mutate.sh scripts/gates.sh \
        's/^  \[ -z "\$cwd" \] && cwd="\."$/  [ -z "$cwd" ] \&\& cwd="."; [ "$id" = mutation ] \&\& continue/' \
        -- bash scripts/selftest.sh gates
    === mutate: scripts/gates.sh (1 line(s) changed by s/^  \[ -z "\$cwd" \] && cwd="\."$/  [ -z "$cwd" ] \&\& cwd="."; [ "$id" = mutation ] \&\& continue/) ===
    === mutate: running bash scripts/selftest.sh gates ===
        FAIL and reports it once, whole line: ON REQUEST, the reason, and the command that runs it
        FAIL and the recorded ## Gate results carries the ON REQUEST line
        FAIL --fast reports the same ON REQUEST line, once
        FAIL AC-1 control: --gate mutation executes the command
        FAIL and reports it as PASS, with its observed count
        FAIL AC-1 control: a story with required_gates: [mutation] gets it run on a full run
        FAIL with the existing escalation suffix in the gate header
        FAIL and the run passes with the gate counted as ran
        FAIL an on-request gate with no command is ON REQUEST, not UNCONFIGURED
        FAIL --list shows the on-request row with the reason and the command
        FAIL ondemand on a required gate fails the audit, naming the gate and why
        FAIL and the audit exits 1
        FAIL and counts it as a manifest problem
        FAIL ondemand naming no configured gate fails the audit
        FAIL and exits 1
        FAIL ondemand with no reason fails the audit
        FAIL and exits 1
    gates: 152 passed, 17 failed
    === mutate: command exited 1; restored (verified byte-for-byte against …/.claude/state/mutations/scripts_gates.sh.20260925T050651Z.68420.bak) ===

Read against the RED baseline: the two controls and their three companions
(`reports it as PASS`, `escalation suffix`, `3 ran`) went from ok to FAIL, by
name; and, as a skip-everything mutation should, the marker-absent and
count assertions went from FAIL to ok - skipping the gate is half of AC-1,
and the summary line is the other half, still red. Same 17 total, a different
17. `gates.sh` restored, verified with `cmp`.

**(3) `gates`: AC-2 control `the same line on an optional gate passes the
audit` and C-3's `a story escalation does not make the audit fail`** - one
mutation, turning the audit's pass exit into exit 1:

    $ bash scripts/mutate.sh scripts/gates.sh '/Manifest audit passed/{n;s/exit 0/exit 1/}' \
        -- bash scripts/selftest.sh gates
    === mutate: scripts/gates.sh (1 line(s) changed by /Manifest audit passed/{n;s/exit 0/exit 1/}) ===
    === mutate: running bash scripts/selftest.sh gates ===
        FAIL a full run does not execute the on-request gate's command
        FAIL and reports it once, whole line: ON REQUEST, the reason, and the command that runs it
        FAIL and it is counted in none of ran, unconfigured or known
        FAIL and the recorded ## Gate results carries the ON REQUEST line
        FAIL --fast does not execute it either
        FAIL --fast reports the same ON REQUEST line, once
        FAIL an on-request gate with no command is ON REQUEST, not UNCONFIGURED
        FAIL and UNCONFIGURED does not name it
        FAIL and the result counts it in nothing
        FAIL --list shows the on-request row with the reason and the command
        FAIL ondemand on a required gate fails the audit, naming the gate and why
        FAIL and counts it as a manifest problem
        FAIL ondemand naming no configured gate fails the audit
        FAIL ondemand with no reason fails the audit
        FAIL AC-2 control: the same line on an optional gate passes the audit
        FAIL a story escalation does not make the audit fail: the manifest itself is fine
    gates: 153 passed, 16 failed
    === mutate: command exited 1; restored (verified byte-for-byte against …/.claude/state/mutations/scripts_gates.sh.20260925T052112Z.92996.bak) ===

Read against the baseline: the two audit controls went from ok to FAIL, by
name (they are the only assertions that require the audit to exit 0); the three
`and exits 1` assertions went from FAIL to ok, because every audit now exits 1,
which is exactly what says those three observe the exit status and not the
message. `gates.sh` restored, verified with `cmp`.

Timings for all three earning runs are local (Git Bash, Windows 11): profiles
~12 s, each gates run ~12 min. No CI timing exists for this branch yet.

### Negative controls: expected values

This story has no metric or threshold, so its controls are boolean. Unlike an
import-failing suite, every control here RAN in RED - the suites are bash and
load fine - so these are measured values, not claims. GREEN's job is to confirm
each stays as recorded once the real behaviour exists.

| Control | Threshold | Expected | Measured in RED |
|---|---|---|---|
| marker after `--gate mutation` | present | present | present (`PASS mutation (0s, observed 12)`) |
| marker after full run with `required_gates: [mutation]` | present | present | present, header `=== gate: mutation (required (required by story T-1)) ===` |
| `--audit`, ondemand on OPTIONAL gate | exit 0, `Manifest audit passed.` | 0 | 0 |
| `--audit`, same, with story escalation active | exit 0 | 0 | 0 |
| `policy_problems` over the compliant fixture | 0 lines | 0 | 0 |
| `policy_problems` with one site regressed | exactly 1 line naming `advance-story.md` | 1 | 1 |
| `twentythree mutations` / `Three mutation runs` | not a count | 0 lines | 0 |
| `Three mutations beat one` / `Two mutations, one run each` | a count | 1 line | 1 |
| `profile_problems` fixture with `ondemand \| mutation \| <why>` | silent on `mutation-ondemand`, `ondemand`, `orphan` | "" | "" |

**Controls RED could not run, declined in writing:**
* **AC-3's control** ("with one profile's on-request line removed through
  `mutate.sh`, that assertion fails for that profile by name"): the line does
  not exist yet, so there is nothing to remove. GREEN runs it once the three
  lines are in, against `bash scripts/selftest.sh profiles`. Expected: exactly
  one `FAIL <profile>: its mutation gate is on request`.
* **DV-1** (the policy guard against a REAL line of the tree): owned by GATES;
  the guard fails in RED anyway, as the DV says, so a probe here proves
  nothing. Not run. Expected in GATES: `bash scripts/mutate.sh
  .claude/commands/advance-story.md 's/<GREEN's new sentence>/Do three
  mutations rather than one/' -- bash scripts/selftest.sh policy` → `policy: 16
  passed, 1 failed`, the real-tree assertion, output exactly
  `.claude/commands/advance-story.md: still prescribes a per-story mutation
  count (matches \`(three|two) mutations\`)`.

### Checks re-run at RED

* C-10's reader grep, `grep -rn "UNCONFIGURED\|unconfigured" scripts
  .claude/hooks .claude/tests .github`, excluding `gates.sh`: hits are
  `scripts/task.sh:12` (a `task |` label, not a gate reader),
  `profiles.test.sh:194` (the orphan label) and my own new assertions in
  `gates.test.sh`. No reader of the summary breaks; the amendment under C-10
  records the `task.sh` hit the contract missed.
* `bash scripts/check-sigpipe.sh` and `bash scripts/check-grep-count.sh` over
  the five test files: `0 finding(s)` each.
* `bash scripts/gates.sh --fast`: every gate `UNCONFIGURED` (BOOTSTRAPPED=no),
  `All required gates passed (0 ran, 5 unconfigured, 0 known)`, exit 0, with
  `UNTRACKED  .claude/tests/policy.test.sh` named - correct, the file is new and
  unstaged; `git add` it with the RED commit. The recorded summary's
  `UNCONFIGURED mutation` line will become the `ON REQUEST` line once GREEN
  adds C-1's `ondemand` line to this repository's `project.conf`.
* AC-7: `boundaries.test.sh` was not opened; its DV / `## Regressions` /
  `## Gate probes` assertions are untouched, and `boundaries` keeps its floor of
  79.

### For the implementer

* **The Contract's "correction to M-3" is wrong** - see the amendment at the
  head of `## Contract`. The profiles already mark `mutation` slow; do not touch
  those lines. Add `ondemand | mutation | <why>` beside them.
* **GREEN edits sites; RED owns the guard.** `policy_problems` lives in the
  test file and is frozen in GREEN. If a rule in it turns out to be wrong,
  that is a return to RED, not an edit.
* **The `tdd-cycle` anecdote at `:279` trips the count rule** ("Three mutations
  of one codec"). C-7 says keep the lesson and reword; "Mutating one codec
  three ways" or a numeral would do - the regex is word-anchored on the two
  spelled-out words followed by `mutations`.
* **`check-boundaries.sh`'s AC frozen check:** I did not touch a criterion.
  The `## Contract` amendments are in-place blockquotes marked "RED amendment".
* **Floors are the executed counts on this tree** (`policy 17`, `profiles 50`,
  `new-story 29`, `gates 169`); with everything red they read as N passed + M
  failed. GREEN should see `169 passed, 0 failed` etc. and change nothing in
  `floors.conf`.

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

### R-1. REVIEW → RED, 2026-09-26: CI's `gates` job failed on a line-number pin that GREEN moved

**How it was found.** PR #84's first CI run: `gates` failed in 1m21s, and every
suite passed except `sigpipe`:

    FAIL C-5 freshness: all twelve status-discarded lines are still where this suite says they are
    sigpipe: 81 passed, 1 failed

Reproduced locally, with the same result:

    scripts/gates.sh:68 no longer holds [BOOTSTRAPPED="$(grep] - it holds: export CLAUDE_PROJECT_DIR="$ROOT"
    scripts/gates.sh:445 no longer holds [why="could not launch: $(] - it holds:     [ "$is_slow" = 0 ] && printf '     %-12s slow:   %s\n' "" "$slowwhy"

**What is wrong, and what is not.** The assertion is right. It is a freshness
pin, written to fail loudly when a pinned line moves, and it did. GREEN's
changes to `gates.sh` (the `ondemand` parsing and reporting) moved the two
pinned lines, to `:74` and `:485` (`grep -n` at the GREEN commit). What is
stale is two numbers in `DISCARDED` (`.claude/tests/sigpipe.test.sh:567-568`),
a frozen test file. So this is a return to RED under `rules.md`'s "a gate
failure whose only legal fix is a write the current phase forbids".

**Why it was not caught before REVIEW.** The orchestrator ran the suites the
story names, and never the full `bash scripts/selftest.sh`, which is what CI
runs. `sigpipe` pins real line numbers in `gates.sh`, so any story that edits
`gates.sh` is exposed to it. The lesson for the orchestrator: before REVIEW,
run the full selftest, or at least every suite that reads a changed file.

**What it asserts now.** The same thing, with the pins at `gates.sh:74` and
`gates.sh:485`.

#### Corrected and earned (RED re-entry)

Re-entry 2026-09-26, Test Developer, source frozen. Verified the destination
first: `grep -n 'BOOTSTRAPPED="$(grep\|why="could not launch: $(' scripts/gates.sh`
prints `74:` and `485:` on this tree. The whole change to
`.claude/tests/sigpipe.test.sh` (`DISCARDED`, lines 567-568):

    -scripts/gates.sh:68:BOOTSTRAPPED="$(grep
    -scripts/gates.sh:445:why="could not launch: $(
    +scripts/gates.sh:74:BOOTSTRAPPED="$(grep
    +scripts/gates.sh:485:why="could not launch: $(

No other pin, assertion text or count changed. The corrected pin passes on
arrival, so it is earned by the one mutation the budget allows: insert a
line above `gates.sh:74`, which moves both pinned lines by one. Through
`mutate.sh`, against the one suite that holds the assertion (trimmed; the
`sed` line-insert makes the diff display every following line as shifted,
only the first pair is shown):

    $ bash scripts/mutate.sh scripts/gates.sh '74s/^/# probe\n/' -- bash scripts/selftest.sh sigpipe
    === mutate: scripts/gates.sh (765 line(s) changed by 74s/^/# probe\n/) ===
      74 - BOOTSTRAPPED="$(grep -E '^BOOTSTRAPPED=' "$CONF" | head -1 | cut -d= -f2- | tr -d '[:space:]')"
      74 + # probe
    === mutate: running bash scripts/selftest.sh sigpipe ===
      C-5: the twelve status-discarded lines in this tree are excluded by the rule, not by markers
        FAIL C-5 freshness: all twelve status-discarded lines are still where this suite says they are
             expected: 12 lines, none stale
             actual:   12 lines,
               scripts/gates.sh:74 no longer holds [BOOTSTRAPPED="$(grep] - it holds: # probe
               scripts/gates.sh:485 no longer holds [why="could not launch: $(] - it holds:       outcome=blocked
    sigpipe: 81 passed, 1 failed
    FAIL sigpipe  did 81 units of work, below the floor of 82 in .claude/tests/floors.conf
    1 of 1 harness suite(s) FAILED.
    === mutate: command exited 1; restored (verified byte-for-byte against /c/Users/ryanc/Projects/agentic-dev-harness/.claude/state/mutations/scripts_gates.sh.20260926T152104Z.12379.bak) ===

Exactly the corrected assertion went red, naming both moved pins by their new
numbers. Unmutated, straight after:

    $ bash scripts/selftest.sh sigpipe
    sigpipe: 82 passed, 0 failed

Restore confirmed: no `.bak` under `.claude/state/mutations/` (only `log`),
and `git status --short scripts/gates.sh` prints nothing. **GREEN is a no-op
on this return**: `scripts/gates.sh` is untouched and the suite passes
against it as committed at `eee7ef1`. Timings are from a local run (Git Bash,
Windows 11); CI's `gates` job for this same suite took 1m21s on PR #84.

## Gate results

<!-- gates.sh: written by bash scripts/gates.sh; do not edit or paste by hand -->

    run:    2026-09-26T15:48:43Z
    commit: a57ce14 (working tree had uncommitted changes)
    tree:   59845ba7b454bf1da6a9d730862a8fab1f89a39c
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


Filed 2026-09-25 by the orchestrator, at the user's request, straight after
HARNESS-014 closed (release 53, `fda194a`). **The `## Contract` is left for
PLANNED.** Line numbers are at `fda194a`.

### Measurements

**M-1. Where HARNESS-014's time went.** Commit timestamps, local time, on
2026-09-24, Git Bash on Windows 11:

| Commit | Time | Phase closed | Duration |
|---|---|---|---|
| `7543732` | 13:03 | PLANNED | - |
| `dcf6f35` | 14:02 | RED | 1h |
| `4a1dd44` | 16:18 | GREEN | 2h15 |
| `9c95a78` | 17:51 | RED re-entry (R-1) | 1h30 |
| `613c56e` | 20:26 | GATES → REVIEW | 2h35, of which about 2h20 was DV-2 and DV-3 mutations |

The mutation work was 18 mutations and about 27 full-suite runs. They ran
four at a time in detached worktrees, and only the logs from 18:12 to 20:25
survive. **None of the 18 found a defect.** CI for the same PR (#83) took
1m29s for `gates`, whose self-test step was 1m16s, and 4s for `boundaries`.
Locally, `boundaries` alone takes about 15 min and `gates` 7-20 min.

**M-2. Every site that currently prescribes per-story mutation work**
(`grep -rn -i "three mutations\|two mutations"` over `.claude`, `scripts` and
`CLAUDE.md`, story files excluded, plus a read of each command):

| Site | What it says today |
|---|---|
| `.claude/commands/advance-story.md:132` | GREEN → GATES: "Do three mutations rather than one where the entry is about a format or a codec" |
| `.claude/commands/advance-story.md:301` | verifying a mutation table: "Two mutations, one run each, is enough" |
| `.claude/commands/complete-story.md:48` | "A mutation table in the handoff is a claim until you run one" |
| `.claude/skills/story-authoring/SKILL.md:271` | "Do three mutations, and make one a wrong value" |
| `.claude/skills/story-authoring/reference/sections.md:61` | "Three mutations beat one" |
| `.claude/skills/tdd-cycle/SKILL.md:279` | the codec anecdote behind the three-mutation rule |
| `scripts/new-story.sh:109` | template: "Do THREE mutations rather than one" |
| `.claude/harness/rules.md` | the non-negotiables. These are the law that stays; they set no per-story count |

**M-3. The `mutation` gate in every profile.** `stack-profiles/reference/`:
`node-typescript.md:15` (`pnpm exec stryker run`), `python-uv.md:13`
(`uv run mutmut run`) and `rust-cargo.md:14` (`cargo mutants`), each
`optional`. This repository's `project.conf:234` declares the gate with no
command, and `:242` marks it `slow`. `slow` is read only by `--fast`
(`gates.sh:281`), so a full run in a consuming project executes the mutation
tool, and so does CI's `gates` job, which runs a full `gates.sh`.

### PO notes

**PO-A. One story, not two.** Moving the gate onto request (AC-1 to AC-3) and
rewriting the prose budget (AC-4 to AC-6) are the two channels of one
behaviour. The user asked for mutation checking to stop being per-story, and
shipping either half alone leaves the other channel still running it on every
story.

**PO-B. The budget is a default, not a cap.** `check-boundaries.sh` is not
changed to count deferred verifications. A story with a real reason for more,
such as a codec, still writes them. What changes is what the PO writes by
default and what the orchestrator runs by default.

**PO-C. The rule this story keeps.** "A test that has never been observed to
fail is not a test" is untouched. The HARNESS-014 evidence argues for fewer
probes, not for none: X-A, the defect put back, is the one mutation whose
result would have mattered had it gone the other way. It is also the one the
budget keeps.

**PO-D. The Open question is decided: Option S.** The user answered "S" on
2026-09-25. `/audit-mutations` runs on request, and REVIEW → DONE only
*suggests* it when an epic's last open story closes. AC-6 was rewritten to
that form on `main` before the story left PLANNED, so the base branch carries
the final criterion and no `## Amendments` entry is needed (the HARNESS-014
precedent, PO-E).

**PO-E. PLANNED → RED checks (2026-09-25, against `698b1ae`).**
* *Epic done-when:* `epic:` is empty, so there is no epic promise to fall
  short of.
* *Required gate:* every `gates.sh` gate is unconfigured
  (`project.conf:227-234`). The binding check is `selftest.sh`, a required CI
  step, through its `gates`, `profiles`, `new-story` and `policy` suites.
  `required_gates: []` stays.
* *Callers:* C-10. No signature changes, and no reader of the summary line
  breaks.
* *Deferred verifications:* DV-1 alone, owned by GATES. That is the budget
  this story introduces, applied to itself.
* *Correction to M-3:* recorded at the head of `## Contract`.

**PO-F. After R-1, the whole selftest (2026-09-26).** Before returning to
REVIEW, the orchestrator ran the whole `bash scripts/selftest.sh` rather than
the story's suites, which is R-1's lesson. Result: `20 harness suite(s)
passed`, `assertion floors: all 20 suite(s) met their declared floor (1482
assertions executed, 1482 declared)`. GREEN on re-entry was a no-op, since
`gates.sh` was untouched since `eee7ef1`. The RED re-entry dispatch was
`test-developer` with explicit `model: fable`, which resolved to **fable**.

**PO-G. Merged, and CI read (REVIEW → DONE, 2026-09-27).** PR #84 was merged
at 2026-09-27T21:59:59Z as `20c39fe`.

* **First CI run, on `811e60c`:** `gates` **failed** in 1m21s on `sigpipe`'s
  C-5 freshness pin. That is R-1 above.
* **Run on `3e20af9`:** `gates` passed in 1m34s
  (https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/36253258008)
  and `boundaries` passed in 6s
  (https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/36253258047).

Neither workflow sets `timeout-minutes`, so both runs are far from a limit.
No gate went through the *pending CI* path. `epic:` is empty, so under
Option S there is no `/audit-mutations` recommendation.
