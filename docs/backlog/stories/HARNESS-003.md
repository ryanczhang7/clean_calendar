---
id: HARNESS-003
title: check-boundaries asserts its own verdict on the story checks
slug: check-boundaries-asserts-its-own-verdict
epic: 
type: chore
status: done
phase: DONE
branch: story/HARNESS-003-check-boundaries-asserts-its-own-verdict
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [.claude/tests/boundaries.test.sh, scripts/check-boundaries.sh]  # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

<!-- Why this story exists. Link the epic and any wiki pages that constrain it.
     Name the REQUIRED gate that would fail if this story's artifact broke. If
     only an optional gate can, put it in required_gates above before RED:
     every required gate once passed over a story none of them exercised. -->

Filed from `docs/wiki/audits/enforcement-mutants-2026-09-15.md`, cluster C3.

Five further `check-boundaries.sh` rules survive mutation, for one shared reason:
`boundaries()` at `.claude/tests/boundaries.test.sh:23` runs the script, captures
`2>&1`, and never looks at the exit status; every assertion is an
`assert_contains` on a substring of the output. A rule therefore has a test only
where some fixture deliberately violates it. These five have no such fixture, so
deleting them changes no output any assertion reads. Each was run against
`bash .claude/tests/boundaries.test.sh` (41 assertions) and survived:

1. `:76` — `[ "$fid" = "$base" ]` → `[ -n "$fid" ]`. A story whose frontmatter
   `id` disagrees with its filename is accepted. `phase.sh`, `gates.sh` and this
   script all locate a story by filename, so a mismatch silently points three
   tools at different things.
2. `:85` — `if git ls-files --error-unmatch ...` inverted. A committed
   `.claude/state/current-story.env` is accepted; the check fires only when the
   file is *absent*. `rules.md` says this must never be committed — it carries
   the phase the guard reads.
3. `:135` — the "claimed by more than one story" `problem` downgraded to `note`.
   Two stories may name the same branch, which is what makes `sid` ambiguous in
   the first place.
4. `:305` — the `required_gates` PASS check inverted (`grep -qE` → `grep -qvE`).
   No fixture story sets `required_gates`, so the loop body never runs. The
   escalation a story makes for itself is unverified against the record.
5. `:316` — `case "$story_type" in feature|fix)` → `nosuchtype)`. The
   `## Handoff` requirement ("the only channel to the next agent; RED is not
   finished without it") never runs.

Required gate that would fail if this story's artifact broke: `unit`
(`bash scripts/selftest.sh`).

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC.
     An AC that names a statistic, a metric or a threshold names a NEGATIVE
     CONTROL too: the deliberately broken input the metric must reject, and
     roughly what it should score. A criterion can be perfectly testable and
     still be blind to the defect it exists to catch, and that is more
     dangerous than a vague one - it survives review and goes green. -->

- **AC-1** — Given a story file whose frontmatter `id` differs from its
  filename, when `check-boundaries.sh` runs, then it FAILs naming both. Kills:
  `scripts/check-boundaries.sh:76` `s#\[ "$fid" = "$base" \]#[ -n "$fid" ]#`.
- **AC-2** — Given a repository in which `.claude/state/current-story.env` is
  tracked by git, when `check-boundaries.sh` runs, then it FAILs saying the file
  is machine-local. Kills: `scripts/check-boundaries.sh:85`
  `s#if git ls-files --error-unmatch#if ! git ls-files --error-unmatch#`.
- **AC-3** — Given two story files whose frontmatter `branch` is the same branch,
  when `check-boundaries.sh` runs on that branch, then it FAILs naming both story
  ids and exits non-zero. Kills: `scripts/check-boundaries.sh:135`
  `135s#problem "branch#note "branch#`.
- **AC-4** — Given a story at REVIEW whose frontmatter sets
  `required_gates: [integration]` and whose recorded gate run contains no
  `PASS integration` line, when `check-boundaries.sh` runs, then it FAILs naming
  that gate; and given a record that does contain it, then it reports the gate
  passed. Kills: `scripts/check-boundaries.sh:305` `305s#grep -qE#grep -qvE#`.
- **AC-5** — Given a `feature` story at REVIEW whose `## Handoff` section is
  empty or template-only, when `check-boundaries.sh` runs, then it FAILs saying
  the handoff is empty. Kills: `scripts/check-boundaries.sh:316`
  `316s#feature|fix)#nosuchtype)#`.
- **AC-6** — Given any `check-boundaries.sh` invocation in
  `.claude/tests/boundaries.test.sh` that is expected to refuse, when the suite
  runs, then it asserts the script's exit status is non-zero as well as its text;
  and for every invocation expected to pass, that it is zero.

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

**Scope, as of 2026-09-30.** AC-1 to AC-5 and the refusal half of AC-6 were
delivered before this story started, by commits `9fbd39d` and the earlier
exit-status work it builds on. The orchestrator verified that by putting each
mutant back with `scripts/mutate.sh` against `bash .claude/tests/boundaries.test.sh`
(the output is in ## Notes). The `boundaries()` helper the Context blames no
longer exists: `run_boundaries` (`boundaries.test.sh:32`) sets `$out` and `$rc`,
and `refused` (`:41`) fails any refusal that exits 0. **What remains is the pass
half of AC-6**, and that is all RED writes.

**Writes:** `.claude/tests/boundaries.test.sh`

**Which invocations count as "expected to pass".** A whole run can exit 0 only
when the fixture story carries a real `## Gate results` written by `gates.sh`.
That means `story_blocked` (`:236`) or anything else that runs `gates.sh` into
the fixture. Every other fixture (`story_on_branch`, `scaffold_story`,
`manifest_story`, `story_claiming`, `harness_branch`) has no gate record and is
refused by the gate-record rule *by design*, as the comment above
`accepts_manifest` (`:52`) says. Those invocations assert that one rule accepts,
not that the run does, and AC-6 does not reach them. Asserting rc there is out
of scope.

Of the gate-recorded invocations whose assertions are acceptances, four already
assert `0 "$rc"`: "and it is not refused" (`:274`), "and the run is clean"
(`:1045`), and the two AC-2 assertions (`:1245`, `:1249`). Two do not:

| Line | Assertion | Owed |
|---|---|---|
| `:293` | "DONE with the CI run quoted is accepted" | `assert_eq "<name>" 0 "$rc"` |
| `:1191` | "a record made against this tree matches it" | `assert_eq "<name>" 0 "$rc"` |

RED **checks this enumeration against the tree** (every `story_blocked` use, and
any other fixture that runs `gates.sh`) and amends this table in place with a
reason if it finds another, or finds one of these is not actually expected clean.

**If either run does not exit 0 today, that is a finding, not a test to
soften.** Report what refused it. Do not change the fixture to make it pass
without saying so in the handoff.

**Earning (tests written against code that already exists).** Each new
assertion passes on arrival, so it is earned by one mutation of the production
behaviour it pins, via `scripts/mutate.sh`, with the output pasted into the
handoff. The mutation must keep the message the existing `assert_contains`
reads, so that **only** the new rc assertion goes red:

- `:293`: in `check-boundaries.sh`, `ok "blocked gate '$g' was verified on CI"`
  becomes `problem "blocked gate ...`. The output still contains "verified on
  CI", and the run exits 1.
- `:1191`: `ok "gate record matches $where (tree $rec)"` becomes
  `problem "gate record matches ...`. The existing `assert_contains` anchors on
  `ok    `, so it goes red too, as do the rc assertions at `:1245`/`:1249`.
  That is expected; what must be shown is that the NEW rc assertion is among
  the failures.

**Oracle partition.** Everything here is mechanical: the exact value is 0.

**No production code changes.** GREEN is expected to be a no-op, verified by the
orchestrator (`rules.md`, the return-to-RED paragraph, applies by analogy: do
not dispatch a feature developer with nothing to do).

**RED amendment, 2026-09-30 (test-developer): the `:293` run does NOT exit 0,
so GREEN is not a no-op.** The enumeration above is right: only `story_blocked`
writes a gate record, and of its acceptance invocations exactly these two lacked
an rc assertion. The table stands. What is wrong is the expectation that both
pass on arrival. The DONE fixture at `:289` exits 1, with:

```
FAIL  story T-1: gate 'types' was BLOCKED locally and has not been verified on CI, so this story is not DONE. ...
```

The existing `assert_contains "DONE with the CI run quoted is accepted" "verified on CI"`
has passed all along **because its needle is a substring of the refusal**
("has not been **verified on CI**"). That is the `rules.md` needle case.

Cause: `scripts/check-boundaries.sh:356`,
`grep -qiE "$g[^\n]*https?://|https?://[^\n]*$g"`. In POSIX ERE, `[^\n]` is a
bracket expression meaning "neither `\` nor `n`", not "not a newline". So the
rule accepts a CI quote only when no letter `n` sits between the gate id and the
URL. The fixture line `types passed on CI: https://...` has the `n` of "on" in
between. Measured directly:

```
fixture line 'types passed on CI: https://...'  -> NO match
'types: https://x/runs/412'                     -> match
'types on https://x/runs/412'                   -> NO match
same fixture line with .* in place of [^\n]*    -> match
```

**GREEN writes:** `scripts/check-boundaries.sh`. Make the DONE CI-quote check
accept a line that carries the gate id and an `http(s)://` URL in either order,
whatever characters lie between them. grep is line-based, so `.*` already stops
at the end of the line. That is all the change. Do not touch the REVIEW-branch
`pending CI` grep at `:350`. It has no bracket expression, and no test here
covers a change to it. The fixture is unchanged and is not to be changed. The
`touches:` frontmatter should gain `scripts/check-boundaries.sh`, which is the
Lead PO's call.

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
       * THE PHASE THAT OWNS IT, by name. check-boundaries.sh refuses a PR
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

Planned by `bash scripts/plan.sh write HARNESS-003` from `.claude/harness/models.conf`.
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

- RED: `test-developer` resolved to `opus` (the agent definition's `model:`; no session override passed). Verdict: it found a production defect the contract had not predicted, and the orchestrator reproduced it on different inputs.
- GREEN: `feature-developer` resolved to `opus` (agent definition; no override). Verdict: a one-line fix, no test touched, line count unchanged.

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Out of scope

<!-- Explicit non-goals. Prevents the Feature Developer from over-building. -->

- Asserting an exit status on fixtures that have no gate record. Their whole
  run is refused by design; see ## Contract.
- Re-earning AC-1 to AC-5. Their mutants were re-run on 2026-09-30 and all were
  caught (## Notes).

## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

<!-- Filled by the Test Developer during RED: which tests, at which level,
     and which AC each one covers. -->

Level: integration. The suite already runs `check-boundaries.sh` end to end
against a real two-branch fixture with a gate record that `gates.sh` writes.
That is the only level where the script's exit status exists to assert.

Line numbers are as of this RED edit. The invocations that are expected to pass were enumerated against the tree. `story_blocked` (`:236`) is
the only fixture that writes a `## Gate results`, and the one inline `gates.sh`
re-run (`:307`) feeds a refusal. Its acceptance invocations are listed below:

| `story_blocked` call | Assertion kind | rc asserted |
|---|---|---|
| `:261` REVIEW, blocked + pending CI | acceptance | yes, `:274` (already there) |
| `:276` REVIEW, nothing written | refusal via `refused` | non-zero |
| `:282` DONE, no CI run | refusal via `refused` | non-zero |
| `:289` DONE, CI run quoted | acceptance | **added, `:295`** |
| `:298` REVIEW, ordinary failure | refusal via `refused` | non-zero |
| `:1027` required `[types]` | refusal via `refused` | non-zero |
| `:1038` required `[unit]` | acceptance | yes, `:1046` (already there) |
| `:1191` record matches tree | acceptance | **added, `:1195`** |
| `:1220` test changed after run | refusal via `refused` | non-zero |
| `:1241` untracked file (AC-2) | acceptance | yes, `:1247`/`:1251` (already there) |

New tests (AC-6, pass half):

- `and DONE with the CI run quoted exits 0, so CI would merge it`: a DONE
  story whose blocked gate is quoted with its CI run URL is accepted by the
  *exit status*, not only by a substring. It is **red today** because of a
  production defect (see ## Contract, RED amendment).
- `and a record matching this tree leaves the run clean`: a REVIEW story
  whose gate record was made against the committed tree exits 0. It passes on
  arrival and is earned by mutation (## Handoff).

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

**GREEN is NOT a no-op.** One of the two new assertions is red against today's
code because of a real defect in `scripts/check-boundaries.sh:356`. See
## Contract, "RED amendment", for the cause and the measurements.

**Command:** `bash .claude/tests/boundaries.test.sh` (about 5 min locally). The
whole harness suite is `bash scripts/selftest.sh`.

**Run output (local, Windows, Git Bash, 2026-09-30), unmutated source:**

```
  a BLOCKED gate can reach REVIEW, but only with the decision written down
    FAIL and DONE with the CI run quoted exits 0, so CI would merge it
         expected: 0
         actual:   1
...
boundaries: 81 passed, 1 failed
```

Why this is the RIGHT failure: running that fixture's `check-boundaries.sh`
directly prints every check `ok` except one:

```
ok    recorded gate result: blocked (1 required gate(s) could not run; 2 ran, 0 unconfigured, 0 known)
FAIL  story T-1: gate 'types' was BLOCKED locally and has not been verified on CI, so this story is not DONE. Quote the PR's CI run for it in the story - one line carrying the gate id and the run URL - or re-run the gates somewhere they are not blocked.
ok    gate record matches the working tree (tree 103b26d9b50e75484f2986d2ed7de7a89c449cc6)
```

The story quotes `types passed on CI: https://github.com/o/r/actions/runs/412`
and is refused anyway. So the rule refuses exactly the input it was written to
accept. The only refusal is that rule, and nothing else is wrong with the
fixture.

**Tests, one line each (both AC-6, the pass half):**

- `:295` `and DONE with the CI run quoted exits 0, so CI would merge it`:
  `$rc` is 0 for a DONE story whose BLOCKED gate is quoted with a CI run URL.
  Red now; GREEN makes it green.
- `:1195` `and a record matching this tree leaves the run clean`: `$rc` is 0
  for a REVIEW story whose gate record matches the committed tree. Passed on
  arrival; earned below.

**Files touched:** `.claude/tests/boundaries.test.sh` (two lines added, and the `:294` needle sharpened) and
this story (## Contract amendment, ## Test plan, ## Handoff).

**Export shape:** none. A bash suite runs the script as a process and reads
`$out` and `$rc` from `run_boundaries`. What is pinned: the run exits 0, and it
prints `ok    blocked gate 'types' was verified on CI` (`:294`, sharpened). What is NOT pinned: the
exact regex. Any match that accepts the gate id and an `http(s)://` URL on one
line, in either order, with arbitrary text between them, satisfies it. The
refusal at `:282` (DONE with no URL) must stay red, and it guards over-acceptance.

**Pass on arrival, and what earns it.**

- `:1195` passed on arrival. It is earned by turning the matching `ok` into
  `problem`. The new assertion is among the failures (the others are expected,
  because they read the same line or the same status). Restore verified:

```
=== mutate: scripts/check-boundaries.sh (1 line(s) changed by s#ok "gate record matches \$where#problem "gate record matches $where#) ===
=== mutate: running bash .claude/tests/boundaries.test.sh ===
    FAIL and it is not refused
    FAIL and DONE with the CI run quoted exits 0, so CI would merge it
    FAIL and the run is clean
    FAIL a record made against this tree matches it
         FAIL  gate record matches the working tree (tree d1a079fe5d0f3f6f8bbd00b0a5107f435ecbeb23)
    FAIL and a record matching this tree leaves the run clean
    FAIL AC-2: an untracked gated file does not spoil the local verdict
         FAIL  gate record matches the working tree (tree d1a079fe5d0f3f6f8bbd00b0a5107f435ecbeb23)
    FAIL AC-2: and the local run exits 0
    FAIL AC-2: CI's verdict on the same commit is the same
         FAIL  gate record matches commit 3b54163 (tree d1a079fe5d0f3f6f8bbd00b0a5107f435ecbeb23)
    FAIL AC-2: and CI's run exits 0
boundaries: 73 passed, 9 failed
=== mutate: command exited 1; restored (verified byte-for-byte against .../.claude/state/mutations/scripts_check-boundaries.sh.20261001T001518Z.1296148.bak) ===
```

- `:295` did not pass on arrival. It was watched to fail against unmutated code,
  for the reason above, so it needs no probe. The Contract's suggested mutation
  for it (line 357 `ok` -> `problem`) was run before the defect was known. It
  proves nothing, because the baseline is already red with the same single
  failure. It is recorded here so nobody re-reads it as evidence:

```
=== mutate: scripts/check-boundaries.sh (1 line(s) changed by s#ok "blocked gate '$g' was verified on CI"#problem "blocked gate '$g' was verified on CI"#) ===
  357 -                 ok "blocked gate '$g' was verified on CI"
  357 +                 problem "blocked gate '$g' was verified on CI"
    FAIL and DONE with the CI run quoted exits 0, so CI would merge it
boundaries: 81 passed, 1 failed
=== mutate: command exited 1; restored (verified byte-for-byte against .../scripts_check-boundaries.sh.20261001T001111Z.1284242.bak) ===
```

  After GREEN, the "defect put back" check for this story's central claim is to
  restore `[^\n]*` in the line-356 grep with `scripts/mutate.sh` and watch
  `:295` go red alone.

**Negative controls:** none are numeric. The control against over-acceptance is
the existing refusal `DONE needs more than pending: it needs the CI run` (`:282`),
which is green today and must stay green after GREEN.

**gates.sh --fast:** every gate is `UNCONFIGURED` in this repository's
`project.conf` (`BOOTSTRAPPED=no`), so it ran nothing and says "All required
gates passed (0 ran, 5 unconfigured)". It is admissible but carries no
information. The suite that actually judges this story is `scripts/selftest.sh`.

**Timings:** local only (Windows). No timeouts were added or changed.

**Discovered, then fixed in RED:** the old `:294` needle, `verified on CI`, was
satisfied by its own refusal ("has not been verified on CI"). On the
orchestrator's instruction it is now sharpened to
`ok    blocked gate 'types' was verified on CI` and keeps its name. The `ok    `
prefix means the refusal text can no longer satisfy it. It is red today for the
same `[^\n]` defect as `:295`, and the same GREEN fix turns both green. The
whole suite was re-run once after the change:

```
    FAIL DONE with the CI run quoted is accepted
         FAIL  story T-1: gate 'types' was BLOCKED locally and has not been verified on CI, so this story is not DONE. Quote the PR's CI run for it in the story - one line carrying the gate id and the run URL - or re-run the gates somewhere they are not blocked.
    FAIL and DONE with the CI run quoted exits 0, so CI would merge it
boundaries: 80 passed, 2 failed
```

The **Run output** block above dates from before this change, when the result
was 81 passed, 1 failed. This 80/2 result is the current RED state GREEN starts from.

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

    run:    2026-10-01T00:55:51Z
    commit: dcbf0a5 (working tree had uncommitted changes)
    tree:   a00a0b4abe2a89ce89ecf1080f0fd0cb7c575a99
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


### AC-1 to AC-5 already covered (orchestrator, 2026-09-30)

Each mutant was put back with `scripts/mutate.sh` against
`bash .claude/tests/boundaries.test.sh`, anchored on today's code because the
Context's line numbers have drifted. All five were caught and all restores were
verified byte for byte.

```
=== mutate: scripts/check-boundaries.sh (1 line(s) changed by s#\[ "$fid" = "$base" \]#[ -n "$fid" ]#) ===
    FAIL an id that disagrees with the filename
boundaries: 79 passed, 1 failed
=== mutate: scripts/check-boundaries.sh (1 line(s) changed by s#^if git ls-files --error-unmatch#if ! git ls-files --error-unmatch#) ===
    FAIL and it is not refused
    FAIL and the run is clean
    FAIL a committed current-story.env is refused
    FAIL and does not also report it clean
    FAIL AC-2: and the local run exits 0
    FAIL AC-2: and CI's run exits 0
boundaries: 74 passed, 6 failed
=== mutate: scripts/check-boundaries.sh (1 line(s) changed by s#problem "branch '$br' is claimed#note "branch '$br' is claimed#) ===
    FAIL two claimants is a problem, not a coin flip
boundaries: 79 passed, 1 failed
=== mutate: scripts/check-boundaries.sh (1 line(s) changed by /PASS\[\[:space:\]\]+\$g/s#if awk#if ! awk#) ===
    FAIL a required gate the record has no PASS for
    FAIL one that did pass is reported as passing
    FAIL and the run is clean
boundaries: 77 passed, 3 failed
=== mutate: scripts/check-boundaries.sh (1 line(s) changed by s#^  feature|fix)#  nosuchtype)#) ===
    FAIL a feature story with a template-only handoff
    FAIL while a template-only one still is
boundaries: 78 passed, 2 failed
```

| AC | Test (`boundaries.test.sh`) |
|---|---|
| AC-1 | "an id that disagrees with the filename" |
| AC-2 | "a committed current-story.env is refused" |
| AC-3 | "two claimants is a problem, not a coin flip" |
| AC-4 | "a required gate the record has no PASS for", "one that did pass is reported as passing" |
| AC-5 | "a feature story with a template-only handoff" |
| AC-6 (refusals) | every refusal goes through `refused`, which fails on exit 0 |

### GREEN and GATES verification (orchestrator, 2026-09-30)

GREEN changed one line, `scripts/check-boundaries.sh:356`, from
`$g[^\n]*https?://|https?://[^\n]*$g` to `$g.*https?://|https?://.*$g`.
grep is line-based, so `.*` still stops at the end of the line. Suite after
GREEN: `boundaries: 82 passed, 0 failed`. The negative control
"DONE needs more than pending: it needs the CI run" (a DONE story with no URL)
is still refused, so the wider pattern does not accept a story with no URL.
`check-sigpipe`: 41 files, 0 findings. `check-grep-count`: 41 files, 0 findings.

**Defect put back** (the story's central claim, `rules.md` "Mutation work per
story"), in GATES with `scripts/mutate.sh`:

```
=== mutate: scripts/check-boundaries.sh (1 line(s) changed by s#"\$g\.\*https#"$g[^\n]*https#) ===
  356 -               if grep -qiE "$g.*https?://|https?://.*$g" "$sfile"; then
  356 +               if grep -qiE "$g[^\n]*https?://|https?://.*$g" "$sfile"; then
=== mutate: running bash .claude/tests/boundaries.test.sh ===
    FAIL DONE with the CI run quoted is accepted
    FAIL and DONE with the CI run quoted exits 0, so CI would merge it
boundaries: 80 passed, 2 failed
=== mutate: command exited 1; restored (verified byte-for-byte ...) ===
```

A first attempt with a single `\n` in the replacement split line 356 in two,
because sed read `\n` as a newline (mutate.sh reported 213 lines changed). It
failed the same two assertions, but it was not the original defect, so it was
discarded and the run above, which changed one line, is the record.

Handoff mutation table, one entry checked: `:1195` was earned in RED by turning
`ok "gate record matches` into `problem`. RED's output is in ## Handoff, and the
new assertion was among the 9 failures.

**DONE, 2026-10-01.** Merged in #91 (merge commit 8599da7), release 60. The
VERSION bump lands in this DONE commit, as HARNESS-009's did, because the PR
changed `scripts/check-boundaries.sh` without one. `phase.sh set DONE --force`
was run on `main`, overriding the branch check, as for every post-merge close.
PR CI: the `gates` job passed in 1m20s. Its harness self-test step took 72s,
with no `timeout-minutes` set (GitHub's 6h default), against 89s on #90
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/36800799813).
`boundaries` passed in 5s
(https://github.com/ryanczhang7/agentic-dev-harness/actions/runs/36800799757).
No epic, so no `/audit-mutations` recommendation.
