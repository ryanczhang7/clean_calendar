# Model policy: fable plans, opus builds and tests

## Scope

The per-phase model plan (`.claude/harness/models.conf`), the `model:` each
agent in `.claude/agents/` declares, and the orchestrating commands in
`.claude/commands/`. Written on branch `harness/fable-plans-opus-builds` in its
own worktree, from `main` at `4d4ea68` (release 76), while two HARNESS-034
sessions were active in `D:/adh-HARNESS-034` and
`.claude/worktrees/nostalgic-williams-fcf700`. One of them merged as release 77
(`c9260a7`, the run lock) during this round; the branch was rebased onto it and
takes release 78. Neither HARNESS-034 branch touches any file changed here
except `.claude/harness/VERSION`, which every harness change bumps.

Left out on purpose: `scripts/plan.sh` (the exception mechanism is unchanged and
still tested), past stories' `## Model guidance` sections (they record what was
planned and resolved at the time, and rewriting them would falsify the record),
and `story-authoring`'s account of the brief-vs-model measurement (it is history,
and still true as history).

## Decided

- **Split by kind of work, not by strength.** The user's call (2026-10-05):
  Opus 5.5 is now the better model for development and testing, Fable for
  system planning, architecture and running a multi-stage workflow.
  - `fable`: PLANNED and REVIEW rows; agents `lead-po`, `lead-designer`;
    commands `/create-product`, `/plan-product`, `/plan-story`,
    `/advance-story`, `/complete-story`.
  - `opus`: RED, GREEN, GATES, SCAFFOLD rows; agents `test-developer`,
    `feature-developer`, `mutation-tester`.
- **The three RED exceptions are retired, not inverted.** They existed to send
  RED back to the stronger model when the measured condition (a partitioned
  brief) was absent. With RED already on the model judged stronger at the work,
  each would map `opus` to `opus`. The mechanism stays in `plan.sh`.
- **GREEN and GATES do not move.** They were on `opus` and stay there; the
  asymmetry `rules.md` rests on is unchanged.
- **The orchestrating commands carry `model: fable` in their own frontmatter.**
  They run in the user's session, where no agent's `model:` applies, so the
  command file is the only place the harness can say it.
- **lead-po passes the plan's model explicitly on every dispatch**, since its
  own declaration (`fable`) differs from its SCAFFOLD row (`opus`).

## Evidence

- *Claim:* with the shipped policy, every story gets the same plan:
  PLANNED/REVIEW on `fable`, the other four on `opus`. *Inputs:* four fixture
  stories in `plan.test.sh`'s "the shipped policy" block: ordinary, no contract,
  harness-only `**Writes:**`, bootstrap. *Tool:*
  `bash .claude/tests/plan.test.sh`. *How it could be wrong:* a story type or
  condition not in those four, which matters only if an exception row is
  added back.
- *Claim:* the exception mechanism is still exercised. The mechanism blocks now
  run against `MECHANISM_POLICY`, a fixture keeping the pre-78 shape, so their
  `fable` vs `opus` needles still tell an exception that fired from one that did
  not. Against the shipped file they would have passed with nothing to show.
- *Claim:* the new assertions fail without the change. Watched red against the
  release-76 files before the policy was edited (output in the PR description).
- **Not evidence:** that Opus 5.5 is in fact better than Fable at RED, or Fable
  better at PLANNED. That is the user's judgement, recorded as a decision. The
  harness has no controlled measurement of it yet.

## What would have to be true for this to be wrong

- `opus` and `fable` resolve to Opus 5.5 and Fable 5.1 in the sessions that run
  this harness. The aliases are what is written; what they resolve to is
  recorded per dispatch, by name, in each story.
- A command's `model:` frontmatter is honoured when the command is invoked. If
  a session setting beats it, the orchestrator runs on whatever the session is,
  and only the per-dispatch record shows it.
- The measurement behind the old RED row (weaker model + brief beat stronger model without
  one) does not mean "RED should be on whichever model is cheaper". If later
  RED stories on `opus` produce weaker negative controls than the `fable` RED
  stories before them, this split is wrong for RED and `models.conf` says to
  record that.

## What was not checked

- No story has run under the new plan yet. The first few stories' resolved
  models and RED handoffs are the verdict.
- Whether `/advance-story` running on `fable` affects a single-phase RED or
  GREEN dispatched from it. It should not: the specialist subagent gets the
  plan's model, not the orchestrator's.
- Consuming projects pick this up only on `refresh-harness.sh`; a vendored copy
  on release 77 or earlier keeps the old ladder.

## Stories filed

None.
