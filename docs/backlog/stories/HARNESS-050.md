---
id: HARNESS-050
title: Only Edit(path) deny rules protect the state files
slug: only-edit-path-deny-rules-protect-the-st
epic: 
type: fix
status: todo
phase: PLANNED
branch: story/HARNESS-050-only-edit-path-deny-rules-protect-the-st
depends_on: [HARNESS-047]      # story ids; phase.sh refuses to start this story until they are DONE
touches: [.claude/settings.json, .claude/tests/settings.test.sh, .claude/state/README.md, .claude/harness/rules.md, docs/wiki/audits/state-deny-2026-09-10.md]         # files this story expects to write; `plan.sh conflicts` reads it
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

Observed 2026-10-10, Claude Code CLI v2.1.293, started interactively in
`D:\agentic-dev-harness`. At startup the CLI printed, about
`.claude/settings.json`'s `permissions.deny`:

    Permission deny rule "MultiEdit(./.claude/state/current-story.env)" matches no known tool — check for typos.
    Permission deny rule "MultiEdit(./.claude/state/last-gate-run)" matches no known tool — check for typos.
    Permission deny rule (.claude\settings.json): Write(./.claude/state/current-story.env) is not matched by file permission checks — only Edit(path) rules are. Use Edit(./.claude/state/current-story.env) instead (Edit rules cover all file-editing tools).
    Permission deny rule (.claude\settings.json): MultiEdit(./.claude/state/current-story.env) is not matched by file permission checks — only Edit(path) rules are. Use Edit(./.claude/state/current-story.env) instead (Edit rules cover all file-editing tools).
    Permission deny rule (.claude\settings.json): Write(./.claude/state/last-gate-run) is not matched by file permission checks — only Edit(path) rules are. Use Edit(./.claude/state/last-gate-run) instead (Edit rules cover all file-editing tools).
    Permission deny rule (.claude\settings.json): MultiEdit(./.claude/state/last-gate-run) is not matched by file permission checks — only Edit(path) rules are. Use Edit(./.claude/state/last-gate-run) instead (Edit rules cover all file-editing tools).

So, per the runtime, of the six state-file deny rules only the two `Edit(...)`
rules do anything. The `Write(...)` and `MultiEdit(...)` rules are discarded,
and an `Edit(path)` rule is matched against every file-editing tool. The
harness believes the opposite in four places, each confirmed by reading at
PLANNED:

- `.claude/settings.json` lists `Write`, `Edit` and `MultiEdit` deny rules for
  `./.claude/state/current-story.env` and `./.claude/state/last-gate-run`.
- `.claude/state/README.md`, "The `Hand-editable` column is enforced", says
  settings.json denies `Write`, `Edit` and `MultiEdit` on the `no` rows and
  that the suite's `TOOLS` list drives both directions of the check.
- `.claude/tests/settings.test.sh` has `TOOLS="Write Edit MultiEdit"`, which
  makes every `no` row **demand** a rule per tool. The suite therefore
  requires the dead rules and goes red if they are removed. It was green
  while requiring rules the runtime discards: a rule probed only against
  fixtures its author wrote, which `rules.md` ("A rule is probed against the
  tree it judges") names as the failure.
- `.claude/harness/rules.md`, Non-negotiables, the `.claude/state/**` bullet,
  says the two files are "denied to `Write`, `Edit` and `MultiEdit` in
  `settings.json`".

`docs/wiki/audits/state-deny-2026-09-10.md` records why the `MultiEdit` rules
went in ("a missing rule on a build that has the tool is a hole") and says
twice that whether a `MultiEdit(...)` deny is enforced was never probed. The
warning answers that: it is not, because the runtime never matches it. The
audit stays as the dated record it is; this story adds one dated update to it.

**What this is not.** It is not a known protection gap. The two `Edit` rules
are in place and, per the warning text, cover `Write` and `MultiEdit` too.
Nobody has confirmed that by observation, and the claim comes from the CLI's
own message rather than from anything this repository has run, so the story
does not assert it: DV-2 (Owner: REVIEW) observes it in a throwaway session
and records what happened. The harm the story removes is that the suite
enforces rules the runtime discards, and the docs teach a wrong model of how
permissions work, which a consumer copying the pattern would carry into its
own `settings.json`.

**Why after HARNESS-047.** HARNESS-047 edits the same `deny` array (appending
`Bash(git log *--output*)` and `Bash(git diff *--output*)`) and the same suite
(`git_output_rules`), and its Contract C-1 places its two lines "after the
last `MultiEdit(...)` entry, as the last two elements". That position **is**
asserted: besides `git_output_rules`, which matches each line anchored
wherever it is, 047's RED added `C-1: settings.json is the live file with
exactly the two lines appended to deny`, which `cmp`s the live file against
a copy built from it with the two lines removed and re-appended after the
last deny element. Deleting earlier deny rules leaves it green, since both
sides derive from the live file; appending any deny entry after the two git
lines, or moving them off the end, turns it red. Two stories editing one
array in two worktrees would also collide on every line.
`depends_on: [HARNESS-047]`; this story starts once 047 is DONE and keeps
047's two lines as the last two elements, or changes that assertion in its
own RED and says why.

Required gate that fails if this story's artifact broke: `selftest`, through
`.claude/tests/settings.test.sh` (`bash scripts/selftest.sh settings`).

## Acceptance criteria

<!-- Each AC is independently testable and phrased as observable behaviour.
     The Test Developer writes at least one failing test per AC. -->

- **AC-1 (settings.json carries Edit rules only)** - Given the live
  `.claude/settings.json`, when its `deny` array is read, then for each of
  `current-story.env` and `last-gate-run` it holds exactly one rule naming
  that path, `Edit(./.claude/state/<file>)`; no `Write(...)`, `MultiEdit(...)`
  or `NotebookEdit(...)` rule names any path under `./.claude/state/`; the
  three `Read(...)` denies and HARNESS-047's two `Bash(git … *--output*)`
  denies are unchanged, the Bash pair still the last two elements; and the
  file is valid JSON.
- **AC-2 (a `no` row demands its Edit rule, and only that)** - Given a
  settings/README pair in which the README lists `last-gate-run` as
  hand-editable `no` and the settings file has no
  `Edit(./.claude/state/last-gate-run)` rule, when `problems` runs, then it
  prints exactly one line,
  `last-gate-run: not hand-editable, but settings.json has no "Edit(./.claude/state/last-gate-run)"`,
  and nothing else; and given the baseline pair with both `Edit` rules and no
  other state rule, it prints nothing.
- **AC-3 (a dead rule is a complaint)** - Given the baseline pair plus one
  rule `Write(./.claude/state/last-gate-run)`, when `problems` runs, then it
  prints exactly one line,
  `"Write(./.claude/state/last-gate-run)" is dead: only Edit(path) rules are matched by file permission checks`,
  and nothing else. The same holds for `MultiEdit(./.claude/state/current-story.env)`
  and for `NotebookEdit(./.claude/state/current-story.env)`, each with its own
  rule text in the line. A dead rule complains whether or not the README lists
  its path (a dead rule on `gate-logs/*.log`, a `yes` row, prints the dead-rule
  line and nothing about the row), so removing a dead rule is never reported
  as dropping protection.
- **AC-4 (the backwards check reads Edit rules)** - Given the baseline pair
  plus `Edit(./.claude/state/**)`, when `problems` runs, then it prints
  `denied path '**' is not in the README table`; plus
  `Edit(./.claude/state/gate-logs/*.log)` it prints
  `gate-logs/*.log: hand-editable, but settings.json denies it with "Edit(./.claude/state/gate-logs/*.log)"`;
  plus `Edit(./.claude/state/mystery)` it prints
  `denied path 'mystery' is not in the README table`; and a settings file
  with no `Edit(./.claude/state/…)` rule at all prints
  `settings.json denies nothing under .claude/state/` and one
  `not hand-editable, but settings.json has no "Edit(…)"` line per `no` row.
- **AC-5 (the documents say Edit, and name no tool list)** - Given
  `.claude/state/README.md` and `.claude/harness/rules.md`, when the suite
  reads them, then the README's section headed
  `## The \`Hand-editable\` column is enforced` contains the sentence
  `An \`Edit(path)\` rule is the only file deny rule the runtime matches, and it covers every file-editing tool.`
  on one line, and neither that section nor the `.claude/state/**` bullet of
  `rules.md` (the Non-negotiables bullet beginning `Do not commit
  \`.claude/state/**\``) contains the string `TOOLS`, `Write(`, `MultiEdit(`
  or `Write, Edit`.
- **AC-6 (the suite has no tool list)** - Given `.claude/tests/settings.test.sh`,
  when it is read, then it defines no variable named `TOOLS`, and
  `bash scripts/selftest.sh settings` passes on the live pair with at least
  27 assertions executed (the declared floor; never lowered).

Oracle partition: every criterion is **mechanical** (Contract C-6).

## Contract

<!-- Written by the Lead PO BEFORE RED, and AMENDABLE BY RED IN PLACE with a
     reason - GREEN then builds what the amended block says. -->

**Writes:** `.claude/settings.json`, `.claude/tests/settings.test.sh`, `.claude/state/README.md`, `.claude/harness/rules.md`, `docs/wiki/audits/state-deny-2026-09-10.md`

All five classify as `harness` or `docs` (`bash scripts/classify.sh` at
PLANNED), so the phase lock freezes none of them; the role boundary is
honoured by the agents. RED writes `settings.test.sh` only. GREEN writes
`settings.json`, `.claude/state/README.md` and `.claude/harness/rules.md`.
The audit update is the orchestrator's, written at GATES. No existing export
changes signature; `problems <settings> <readme>` keeps its name, arguments
and "one line per disagreement, silence means agreement" shape, so there is
no caller list.

**RED may amend any block below in place, with a reason; GREEN builds what
the amended block says.**

- **C-1 The deny array (settled - read out, never re-derived).** After GREEN,
  `.claude/settings.json`'s `deny` array is, in order and byte for byte:

      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./**/secrets/**)",
      "Edit(./.claude/state/current-story.env)",
      "Edit(./.claude/state/last-gate-run)",
      "Bash(git log *--output*)",
      "Bash(git diff *--output*)"

  The four removed lines are `Write(./.claude/state/current-story.env)`,
  `MultiEdit(./.claude/state/current-story.env)`,
  `Write(./.claude/state/last-gate-run)` and
  `MultiEdit(./.claude/state/last-gate-run)`. Nothing else in the file
  changes. HARNESS-047's `git_output_rules` keeps passing because it matches
  each of its lines anchored, not by position; its position assertion
  (`C-1: settings.json is the live file with exactly the two lines appended
  to deny`) keeps passing because the two git lines stay last and the
  removed lines all precede them.
- **C-2 `problems` in `settings.test.sh`.** Same signature. Three checks
  survive and one is new; `TOOLS` is deleted, together with the comment
  block that justified each tool and the `settings_for <tool>...` fixture
  generator's tool parameter (`settings_for` becomes `good_settings`, which
  writes exactly the two `Edit` rules).
  1. *Row answers yes/no* - unchanged, same complaint text.
  2. *Forwards* - for each row, `rule="\"Edit(./.claude/state/$path)\""`;
     a `no` row without it prints
     `<path>: not hand-editable, but settings.json has no "Edit(./.claude/state/<path>)"`,
     a `yes` row with it prints
     `<path>: hand-editable, but settings.json denies it with "Edit(./.claude/state/<path>)"`.
     The texts are the existing ones with the tool fixed to `Edit`; the
     fixtures assert whole output with `assert_eq`, not `assert_contains`,
     where AC-2 and AC-3 say "exactly one line".
  3. *Dead rules* (new) - every line of the settings file matching
     `"(Write|MultiEdit|NotebookEdit)\(\./\.claude/state/[^)]*\)"` prints
     `<rule> is dead: only Edit(path) rules are matched by file permission checks`,
     where `<rule>` is the matched text in its double quotes, e.g.
     `"Write(./.claude/state/last-gate-run)" is dead: …`. Exactly these three
     tool names: `Read(...)` and `Bash(...)` rules are matched by the runtime
     and are not the suite's business. This check runs before the backwards
     one and does not consult the README.
  4. *Backwards* - alternation is `Edit` only; complaint texts unchanged
     (`denied path '<p>' is not in the README table`,
     `denied path '<p>' is listed as hand-editable`,
     `settings.json denies nothing under .claude/state/`).
  The `describe "the two files that carry evidence stay denied"` block keeps
  its independence from the README and asserts the two `Edit` rules only.
  The three `TOOLS`-override cases and `an undocumented path under a later
  tool` are deleted; AC-3's cases replace them. The suite's header comment
  (the two paragraphs about `MultiEdit` and the "Verified separately by probe"
  paragraph) is rewritten to say what the runtime does: `Edit(path)` is the
  only file deny rule matched, it covers every file-editing tool, and the
  observation that backs that is DV-2 of this story.
- **C-3 The documents.** `.claude/state/README.md`, section "The
  `Hand-editable` column is enforced": the first paragraph says settings.json
  denies `Edit` on exactly the `no` rows and that the suite checks the two
  directions; the `TOOLS` paragraph is replaced by one that contains, on one
  line, the sentence AC-5 pins, followed by: the runtime prints a startup
  warning for a `Write(path)` or `MultiEdit(path)` rule and discards it, so
  the suite reports such a rule as dead rather than demanding it; and
  `NotebookEdit` needs no mention beyond "covered by the Edit rule". The
  "Verified by probe" paragraph (Bash append and `rm` refused) stands; it was
  observed, and this story does not contradict it. `rules.md`'s
  `.claude/state/**` bullet: "denied to `Write`, `Edit` and `MultiEdit`"
  becomes "denied to `Edit` in `settings.json` - the one file deny rule the
  runtime matches, and it covers `Write` and `MultiEdit` too"; the rest of
  the bullet is unchanged. `docs/wiki/audits/state-deny-2026-09-10.md` gains
  a dated section `## Update, 2026-10-10: the MultiEdit and Write rules were never matched`
  of a few lines: the warning text, that HARNESS-050 removed them, and that
  the probe the audit said it could not run is answered by DV-2 of this
  story. Nothing above it is edited.
- **C-4 The floor.** `.claude/tests/floors.conf` declares `settings | 27`
  (recorded again in `.claude/tests/selftest.test.sh`). This story removes
  assertions (`stay denied` 6 to 2, the three `TOOLS` cases, the later-tool
  case) and adds AC-3's, AC-4's and AC-5's. RED keeps the executed count at
  27 or above - each AC-3 case gets a control that the same fixture with the
  rule written as `Edit(...)` prints nothing - so the floor is **not
  lowered**. If the count rises, raising the floor is optional and goes in
  both files in the same commit, or in neither.
- **C-5 Why no mutation touches the live `settings.json`.** The runtime reads
  `settings.json` live (`state-deny-2026-09-10.md`; HARNESS-047 C-3), so a
  mutation of the real file mid-session changes the rules the session runs
  under. DV-1 therefore runs `problems` over a **copy** of the live file with
  one line put back, taken with `cp` into the gitignored `.claude/state/`
  directory, and reaches it by mutating the suite's `SETTINGS=` line through
  `scripts/mutate.sh`. The copy is the real tree plus one line, not a
  hand-written fixture, which is what `rules.md` asks of a rule's probe.
- **C-6 Oracle partition.** Every criterion is **mechanical**: exact rule
  text, exact complaint lines, exact sentences. Nothing is invented or
  calibrated. The deny array (C-1), the complaint texts (C-2) and the README
  sentence (AC-5) are **settled**; RED reads them out.
- **C-7 Test-only dependencies.** None. Bash, awk, grep, sed only
  (`rules.md`, "Portability"); no JSON parser.

## Deferred verifications

- **DV-1 - defect put back (the story's central claim). Owner: GATES.**
  Condition: with `"Write(./.claude/state/last-gate-run)",` re-added to a
  copy of the committed `.claude/settings.json`, the suite **must** fail
  `the shipped pair agrees with itself` with the dead-rule line for that rule
  and nothing else; and with `"Edit(./.claude/state/last-gate-run)",`
  removed from a second copy, it **must** fail the same assertion with
  `last-gate-run: not hand-editable, but settings.json has no "Edit(./.claude/state/last-gate-run)"`
  and fail `Edit(./.claude/state/last-gate-run) is denied`. RED cannot run
  this: the dead-rule check does not exist yet, and the live file still holds
  the rule. Run each as
  `bash scripts/mutate.sh .claude/tests/settings.test.sh 's|^SETTINGS=.*|SETTINGS="$REPO_ROOT/.claude/state/dv1-<a|b>.json"|' -- bash scripts/selftest.sh settings`
  after writing the two copies, confirm the suite is green again on the
  restored file, and paste the output here.
- **DV-2 - the runtime claim behind the fix. Owner: REVIEW.** Condition: in
  a throwaway, logged-in, interactive Claude Code session started in a
  checkout of this story's branch at the PR head (so `.claude/settings.json`
  holds the two `Edit` rules only), (a) the startup output contains no line
  beginning `Permission deny rule`; (b) asked to use the `Write` tool to
  write one line to `.claude/state/last-gate-run`, the agent's attempt is
  refused by the permission system; (c) if the build offers `MultiEdit`,
  the same for it; if it does not, say so. Record the exact refusal text, or
  that the write went through, and `git status` afterwards. If (b) is NOT
  refused, the warning text was wrong, the `Write` rule was doing work, and
  the story stops at REVIEW rather than merging: put it to the user with the
  observation. Nothing in this repository can run this, which is why it is
  REVIEW's.

## Amendments

<!-- Acceptance criteria are frozen once the story leaves PLANNED. Omit the
     section if unused. -->

## Model guidance

Planned by `bash scripts/plan.sh write HARNESS-050` from `.claude/harness/models.conf`.
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
## Out of scope

- Any change to what is protected: the two state files stay the only `no`
  rows, and no new row, rule or glob is added. The three `Read(...)` denies
  and HARNESS-047's two `Bash(...)` denies are untouched.
- Probing whether an `Edit` rule blocks a Bash append or `rm` of the path.
  The audit observed that it does; this story neither repeats nor rewrites
  that observation.
- Rewriting the audit's body. It is a dated record of what was believed on
  2026-09-10 and stays as written; the story adds one dated update below it.
- `NotebookEdit` beyond the dead-rule check: no rule for it is added, as
  before, and no probe of it is run.
- The `PreToolUse` hook matcher `Write|Edit|MultiEdit|NotebookEdit|Bash` in
  `settings.json`. Hook matchers are a different mechanism from permission
  rules; the warning says nothing about them, and the phase guard must keep
  seeing every editing tool.
- Consumers' own `settings.json` files. A consumer that copied the six-rule
  pattern gets the fix with its next refresh of `.claude/settings.json`; this
  story does not go looking.
- The `selftest`/`floors.conf` mechanism itself. C-4 says the floor is not
  lowered; nothing about how floors work changes.

## Design notes

<!-- Omitted: headless work. -->

## Test plan

<!-- Filled by the Test Developer during RED. -->

## Handoff: RED -> GREEN

<!-- Filled by the Test Developer at the end of RED. -->

## Regressions

<!-- REQUIRED if this story ever returned to RED after GREEN or GATES; omit
     otherwise. -->

## Gate results

<!-- Written by scripts/gates.sh itself on every full run. -->

## Gate probes

<!-- Omitted: this story adds or changes no gate. -->

## Notes

- Filed 2026-10-10 from the user's startup-warning report. `docs/backlog/epics/`
  is empty and HARNESS-047 has no epic, so `epic:` is blank.
- `bash scripts/plan.sh conflicts` at PLANNED: output recorded in the PR body.
  HARNESS-047 shares `.claude/settings.json` and
  `.claude/tests/settings.test.sh`; resolved by `depends_on`, not by running
  the two side by side.
