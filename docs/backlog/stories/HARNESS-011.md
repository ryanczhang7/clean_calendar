---
id: HARNESS-011
title: A bare directory name classifies as its category, not as source
slug: a-bare-directory-name-classifies-as-its
epic: 
type: chore
status: done
phase: DONE
branch: story/HARNESS-011-a-bare-directory-name-classifies-as-its
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [.claude/harness/paths.conf, .claude/tests/classify.test.sh, .claude/tests/phase-guard.test.sh, .claude/tests/floors.conf]  # files this story expects to write
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

**In GREEN, deleting one frozen test is refused and deleting all of them is
permitted.** Measured on this checkout at release 48, through the real
`phase-guard.sh`, with a story in GREEN:

    rm -rf tests/a.test.ts   -> BLOCK    one test file: refused, correctly
    echo x > tests/a.test.ts -> BLOCK    writing one: refused, correctly
    rm -rf tests             -> ALLOW    the whole directory: PERMITTED

Law 2 says tests are frozen during GREEN. The lock enforces that per file and
not for the directory that holds them.

**The cause is one missing shape in `paths.conf`, repeated across every category
but one.** A rule is written `docs | docs/**`, and `docs/**` matches paths
UNDER `docs` and never `docs` itself. A bare directory name therefore matches
nothing and falls through to the documented default, `source`:

    docs        -> source      docs/            -> docs
    tests       -> source      tests/           -> test
    test        -> source      tests/a.test.ts  -> test
    spec        -> source
    __tests__   -> source
    .claude     -> source      .claude/hooks    -> harness
    scripts     -> source
    .github     -> source

**Vendor is the exception, and it is the exception because somebody already hit
this.** `paths.conf` carries both forms for every vendor directory, under a
comment that says exactly why:

    # The directories themselves, so that `rm -rf node_modules` and friends are
    # classified as vendor rather than falling through to source.
    vendor | **/node_modules
    vendor | target
    vendor | **/dist

Measured: `node_modules`, `.venv`, `target`, `dist`, `coverage` all classify as
`vendor` correctly. The fix is known, written down, and was applied to one
category out of six.

**Both directions are wrong, and they are wrong in different phases.**

  * *Too permissive* - `source` is writable in GREEN, GATES and SCAFFOLD, so a
    bare `tests`, `test`, `spec` or `__tests__` is writable in exactly the
    phases that freeze tests. That is the measurement above and it is the
    reason this is not cosmetic.
  * *Too restrictive* - `source` is frozen in RED and REVIEW, so a bare `docs`,
    `.claude`, `scripts` or `.github` is refused in phases where those
    categories are writable. Measured: `rm -rf docs` and `rm -rf tests` are
    both BLOCKED in RED, where docs and tests are writable.

**How it was found.** HARNESS-010's RED phase, running manga-translator's
`phase-guard.test.sh` against upstream's parser on CI: twelve of the seventy
failures were not about the parser at all. They were `classify` cases, and
manga-translator had already fixed this downstream. That is the FOURTH finding
from the port-before-refresh round, after assertion floors (release 47), the two
session-safety fixes (release 48) and HARNESS-010's parser reconciliation.

**It is on the refresh's critical path.** `refresh-harness.sh` LEAVES
`paths.conf` for a human to merge - it is one of the two files named "do not
just copy these" - so a refresh will not overwrite the downstream fix the way it
would have overwritten `write_candidates`. But the merge is by hand, and a hand
merge of a rule nobody has written down upstream is a rule that gets dropped.
Landing it here makes the merge mechanical.
## Acceptance criteria

- **AC-1** - Given a bare directory name that a `paths.conf` rule intends to
  cover, when `classify.sh` is asked, then it returns that rule's category and
  not `source`. Covers at least `docs`, `tests`, `test`, `spec`, `__tests__`,
  `.claude`, `scripts`, `.github`. *Control:* `src` still classifies as
  `source`, and an invented `wibble` still classifies as `source` - the fallback
  must survive, because a path about to be authored is source and that is the
  documented default.
- **AC-2** - Given a story in GREEN, when a write to the bare `tests` directory
  is attempted, then the phase lock refuses it. *Control, and it is the point:*
  the same write to `tests/a.test.ts` was already refused, and still is - so the
  criterion is about the DIRECTORY closing a hole the file never had.
- **AC-3** - Given a story in RED, when a write to a bare `docs`, `scripts` or
  `.claude` is attempted, then the lock permits it. *Control:* a write to a bare
  `src` in RED is still refused.
- **AC-4** - `paths.conf` states the rule once, where a reader will meet it.
  The vendor block already carries the explanation; the fix must not leave six
  copies of the same sentence, nor leave the other five categories looking like
  an oversight a future editor will repeat. *Verified by review* - see
  `## Deferred verifications`.
- **AC-5** - `.claude/tests/classify.test.sh` covers every category's bare form,
  and `.claude/tests/floors.conf` records the raised count. *Control:* the floor
  is the executed assertion count, not the number of `assert_` call sites.

## Out of scope

- **Trailing-slash forms.** `docs/` and `tests/` already classify correctly;
  measured. This story is about the bare name.
- **Any change to what the categories MEAN**, or to which phase may write which
  category. `phases.conf` is untouched: this makes the classifier agree with
  rules that already exist.
- **The glob engine.** If the fix turns out to need `**` to match an empty
  segment, that is a change to matching semantics affecting every rule in the
  file, and it is a different story - say so rather than making it here.
- **manga-translator's own copy.** Landing this upstream makes that merge
  mechanical; performing it is the refresh, not this.
## Contract

RED MAY AMEND ANY BLOCK BELOW IN PLACE, with a reason recorded in the block
itself, and GREEN builds what the amended block says.

### C-1. The measured behaviour AT RELEASE 49. SETTLED — read it out

**Re-measured by the orchestrator at PLANNED, against the parser HARNESS-010
shipped.** The numbers in `## Notes` were taken at release 48 and one of them
has since changed; these supersede them.

    bash scripts/classify.sh:
      docs  tests  test  spec  __tests__  .claude  scripts  .github   -> source
      src                                                              -> source  (correct)
      tests/                                                           -> test    (correct)
      docs/                                                            -> docs    (correct)

    through the real phase-guard.sh:
                                RED     GREEN
      rm -rf tests/a.test.ts    ALLOW   BLOCK    correct
      rm -rf tests/             ALLOW   BLOCK    correct
      rm -rf tests              BLOCK   ALLOW    WRONG IN BOTH PHASES
      rm -rf docs               BLOCK   ALLOW    wrong in RED
      rm -rf .claude            BLOCK   ALLOW    wrong in RED

### C-2. HARNESS-010 already fixed the half this story was warned about

`## Notes` cautions that a classify-only fix might not close AC-2, because at
release 48 `rm -rf tests/` was ALLOWED in GREEN even though `tests/` classifies
as `test`. **That is no longer true.** HARNESS-010's parser keeps a directory
operand's trailing slash through `normalize_rel`, and `rm -rf tests/` now
BLOCKS in GREEN and ALLOWS in RED, both correct.

So the remaining defect is purely the BARE name, and a `paths.conf` fix closes
it. The caution stands as history, not as a live risk - but RED verifies it
rather than trusting this paragraph, because it is the difference between a
one-file story and a two-file one.

### C-3. The fix: eight rules, mirroring what vendor already does

`paths.conf` already carries bare forms for every vendor directory, under a
comment that states the reason. The same treatment, for the three categories
that lack it. The rules that need a partner, by line at release 49:

    harness | .claude/**      (64)   ->  harness | .claude
    harness | scripts/**      (65)   ->  harness | scripts
    harness | .github/**      (66)   ->  harness | .github
    docs    | docs/**         (81)   ->  docs    | docs
    test    | **/tests/**     (99)   ->  test    | **/tests
    test    | **/test/**     (100)   ->  test    | **/test
    test    | **/__tests__/** (101)   ->  test    | **/__tests__
    test    | **/spec/**     (102)   ->  test    | **/spec

**Placement matters and is not free.** A path is classified by the FIRST
matching rule, so each bare form must sit where its own category already sits -
harness bare rules inside the harness block, test bare rules inside the test
block - and NOT collected into one block at the end, which would let a bare
`test` win over a more specific rule above it. Vendor's own bare block sits
immediately after its `/**` rules, which is the pattern to copy.

**A known consequence, stated rather than discovered later.** `test | **/test`
matches a FILE named `test` as well as a directory named `test`; likewise
`harness | scripts` for a file called `scripts`. Vendor has carried exactly this
property since the bare forms were added for it (`**/node_modules` matches a
file of that name). It is the accepted trade: the classifier sees a string, not
an inode, and `classify.sh` is asked about paths that may not exist yet. Do not
try to fix it here - and do not let RED write an assertion that depends on the
opposite.

### C-4. What must NOT change

  * `src` stays `source`. It is a real source directory and there is no rule
    that should make it anything else.
  * A path matching nothing stays `source`. That fallback is documented in
    `paths.conf`'s own header as the right default for a file about to be
    authored, and it is what makes the phase lock fail closed.
  * Nothing in `phases.conf`. This story makes the classifier agree with rules
    that already exist; it does not change which phase may write which category.
  * `classify.sh` and `lib.sh` are not touched. `paths.conf` is DATA that both
    read - see C-5.

### C-5. Callers of every changed signature

**None: this story changes data, not an interface.** Checked at PLANNED.
`paths.conf` is read by `classify.sh` and by `lib.sh`'s classifier, both of
which parse `<category> | <glob>` lines generically. Adding eight lines of an
existing shape changes no function, no argument and no output format.

The consumers that will SEE different answers are every caller of
`classify.sh` and of the phase lock - which is the point of the story, not a
breakage. RED's handoff states that this was re-checked against the tree.
## Deferred verifications

**AC-4, how the rule is stated. Owner: REVIEW.**

The mechanical half - that the bare forms exist and classify correctly - is
covered by AC-1's tests. What a test cannot judge is whether `paths.conf` now
reads as ONE rule or as eight coincidences. The vendor block already carries the
explanation; if the fix leaves that sentence in one place and eight silent
partners elsewhere, the next person adding a category will repeat the omission
exactly as it was repeated for five categories here.

REVIEW reads the file and records whether someone adding a new category would
be led to add both forms. Falsifiable: if the answer is "only if they happen to
read the vendor block", the fix is incomplete however green the suite is.

**Result (REVIEW, 2026-09-23): PASSED, with one limit recorded.**

The question this entry asks is whether `paths.conf` now reads as ONE rule or as
eight coincidences - whether someone adding a category would be led to add both
forms, or only if they happened to read the vendor block.

**The rule is stated once, before any rule, under `BOTH FORMS, ALWAYS`.** It
gives the mechanism (`x/**` matches under x and never x itself), both concrete
failures (`rm -rf tests` writable in the phases that freeze tests; `rm -rf docs`
refused in RED), the anchoring requirement (`**/tests` beside `**/tests/**`;
`docs` beside `docs/**`, root-anchored and staying so), the placement rule and
why (first match wins), and the file-of-that-name consequence as accepted rather
than overlooked. It ends with the sentence this entry was written to look for:
*"A new category needs both forms."*

**Each of the four blocks carries a pointer** - `# The directories themselves -
see BOTH FORMS at the top of this file.` - sited exactly where an editor adding
rules is working. GREEN rewrote vendor's own two-line explanation into the same
pointer so the reason lives in one place rather than two, and flagged that as a
line outside its brief. Correct call: leaving vendor's copy would have left two
statements of one rule, free to drift.

So a future editor meets the rule in the header before reaching any block, and
meets a pointer again inside whichever block they are editing. That is the
judgement AC-4 asked for, and it is adequate.

**The limit, stated rather than left for someone to discover.** Nothing
MECHANICALLY refuses a `/**` rule with no bare partner. A guard could: assert
that every rule whose glob ends `/**` has a sibling with the same category and
the same anchoring minus the suffix - it is a few lines over a file the harness
already parses, and `classify.test.sh` is where it would live. Not filed here,
because this story has already produced one neighbour and the header plus four
pointers is proportionate to a defect that took five categories and several
releases to be noticed once. Filing it is a reasonable next move for anyone who
disagrees.

**That the fallback still fails closed. Owner: GATES.**

C-4 says a path matching nothing stays `source`, and that is what makes the
phase lock fail closed on a file nobody has classified. The risk in adding eight
broad rules - three of them `**/`-prefixed - is that one accidentally swallows
paths it was never meant to reach, and the failure would be SILENT: a path
wrongly classified as `test` is writable in RED, where source is frozen.

GATES mutates one bare rule to something deliberately over-broad (`test | **`
is the sharpest) and confirms that assertions go red rather than the suite
quietly continuing to pass, then restores. That is the control proving the new
rules are load-bearing and narrow, rather than merely present.

**Result (GATES, 2026-09-23): PASSED. The control fires on over-reach.**

A NEW bare rule - one this story added, against the SHIPPED `paths.conf` - was
made to steal a path it has no business claiming, through `scripts/mutate.sh`:

    === mutate: .claude/harness/paths.conf (1 line(s) changed by 124s#^test | \*\*/tests$#test | src#) ===
      124 - test | **/tests
      124 + test | src

    bash scripts/classify.sh src tests
      test    src        <- stolen
      source  tests      <- the rule no longer reaches what it was for

    bash scripts/selftest.sh classify
        FAIL bare tests is test
        FAIL a nested bare tests directory is still test
        FAIL the control: bare src is still source
    classify: 39 passed, 3 failed
    === restored (verified byte-for-byte against .../paths.conf.20260923T222207Z.289430.bak) ===

**The third FAIL is the one this entry exists for.** The two positives going red
only says the rule is load-bearing; `the control: bare src is still source` going
red says the fallback is guarded - a rule that swallows a path it should not
reach is caught, rather than the suite continuing quietly green. That is C-4's
failure mode, and the silent one: a path wrongly classified as `test` is writable
in RED, where source is frozen.

**THE FIRST TWO ATTEMPTS AT THIS PROBE WERE BROKEN, AND ALMOST PASSED AS
EVIDENCE.** Both used `test \| \*\*/tests` as the sed pattern. In BRE, `\|` is
GNU **alternation**, not a literal pipe, so the expression matched something else
entirely and rewrote line 124 to `test | src| **/tests` - a rule with a
nonsense glob. That still reddened two assertions, because the rule stopped
reaching `tests`, and it would have read as a successful probe. It was caught
only by printing what the line actually became: `mutate.sh` echoes the
before/after, and the after was not what had been asked for.

Recorded because it is the same shape as HARNESS-010's PO-4 - a broken
instrument producing plausible output - and because the lesson is narrower and
more reusable than "check your instrument": **in a `sed` BRE, a literal `|`
is written `|`, and `\|` means alternation.** The harness's own rules are
`|`-separated, so every future mutation of `paths.conf`, `project.conf` or
`floors.conf` meets this.
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

Planned by `bash scripts/plan.sh write HARNESS-011` from `.claude/harness/models.conf`.
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

- **PLANNED** — `lead-po`, **Opus 5**, the session's own model. Matches the plan.
- **RED** — `test-developer`, **Opus 5**. The plan says `fable`. The
  orchestrator passed NO model override, so `.claude/agents/test-developer.md`'s
  `model: opus` won, and the plan's row was never exercised.

**THE PLAN IS NOT SELF-EXECUTING, and this is the third story to show it.**
`models.conf` renders a row saying RED runs on `fable`; every agent definition
in `.claude/agents/` says `opus`; and the definition wins unless the dispatch
passes an explicit override. So the measured claim behind that row - that a
weaker model with a partitioned brief writes sharper negative controls - has
been tested exactly once in this backlog (HARNESS-008's R-1, where the
override WAS passed), and not at all in HARNESS-010 or here.

That is precisely the confusion `rules.md` created this field to end: "an
agent definition's `model:` field, or the session's setting, or an override:
the orchestrator cannot see which won unless it records it." It is recorded
now, and the honest reading is that the plan's RED row is an untested
recommendation rather than a measured default.

The test-developer flagged the discrepancy itself and correctly declined to
write this line, which belongs to the Lead PO.

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

Two suites, both of them the harness's own bash tests. No new file: the
behaviour belongs to suites that already exist, and a third file would be a
third place to look.

**`.claude/tests/classify.test.sh`** - the UNIT level, because `paths.conf` is
where the answer is decided. A classifier assertion says WHICH RULE was wrong;
the hook can only say that something was refused. One new block, 15 assertions.

**`.claude/tests/phase-guard.test.sh`** - the INTEGRATION level, because the
criteria are phrased about the lock and not about the classifier. Driven
through the real `.claude/hooks/phase-guard.sh` with a JSON payload, via the
existing `assert_allowed` / `assert_blocked` helpers. Two new blocks, 12
assertions.

`.claude/tests/floors.conf` - classify 27 -> 42, phase-guard 288 -> 300, in the
same commit as the assertions.

| Level | Assertion | AC |
|---|---|---|
| unit | eight bare names classify as docs / harness / test | AC-1, AC-5 |
| unit | `packages/app/tests` is test; `src/docs` is not docs | AC-1 (rule anchoring, C-3) |
| unit | `node_modules` and `target` are still vendor | AC-5 (the precedent) |
| unit | `src` and `wibble` are still `source` | AC-1 control, C-4 |
| unit | a FILE named `test` classifies as test | C-3's accepted trade |
| integration | GREEN refuses bare `tests`, and names `category: test` | AC-2 |
| integration | GREEN still refuses `tests/main.test.ts` and `tests/` | AC-2 control |
| integration | GREEN still permits bare `src` | AC-2 counter-control, C-4 |
| integration | RED permits bare `docs`, `scripts`, `.claude`, `.github`, `tests` | AC-3 |
| integration | RED still refuses bare `src` and bare `wibble` | AC-3 control, C-4 |

**What is NOT asserted, deliberately.**

* **Nothing about WHERE the rules sit in the file.** C-3 requires each bare form
  inside its own category's block, and an assertion on line numbers or ordering
  would freeze a layout rather than a behaviour. The nearest thing to a
  placement assertion is the anchoring pair (`packages/app/tests` is test,
  `src/docs` is not docs), which pins the rule TEXT C-3 specifies without
  pinning its position.
* **Nothing that requires a bare name to be a directory.** C-3 records that
  `test | **/test` will match a FILE named `test`. The suite asserts that
  behaviour POSITIVELY, with a real file present, so it is a recorded decision
  rather than something discovered later - and so that no assertion here can be
  read as demanding the opposite.
* **AC-4** - whether `paths.conf` reads as one rule or as eight coincidences.
  A test cannot judge prose; it is REVIEW's deferred verification.
* **Trailing-slash forms** - out of scope, and verified still correct anyway
  (see the handoff's C-2 check) rather than asserted here.

## Handoff: RED -> GREEN

### The one-line job

Add **eight lines** to `.claude/harness/paths.conf`, exactly as C-3 lists them,
each inside its own category's block. Touch nothing else. `classify.sh`,
`lib.sh` and `phases.conf` stay as they are (C-4); C-5 was re-checked against
the tree and holds - this is data, not an interface, and no signature changes.

    harness | .claude          in the harness block, beside .claude/**
    harness | scripts          in the harness block, beside scripts/**
    harness | .github          in the harness block, beside .github/**
    docs    | docs             in the docs block, beside docs/**
    test    | **/tests         in the test block, beside **/tests/**
    test    | **/test          in the test block, beside **/test/**
    test    | **/__tests__     in the test block, beside **/__tests__/**
    test    | **/spec          in the test block, beside **/spec/**

The `**/` prefixes are load-bearing and asymmetric: the four test rules carry
one because `**/tests/**` does, the harness and docs rules do NOT because their
partners are root-anchored. Two assertions pin exactly that
(`packages/app/tests` -> test, `src/docs` -> source), so a uniform prefix is a
test failure and not a style choice.

Vendor's bare block sits immediately after its `/**` rules under a comment
saying why; that is the pattern to copy, and AC-4 (REVIEW's deferred
verification) is about whether the result reads as ONE rule rather than eight
coincidences. State it once, where a reader will meet it.

### The exact commands

    bash scripts/selftest.sh classify        # runs locally in about 40s
    bash scripts/selftest.sh phase-guard     # DO NOT run this locally

**`phase-guard` is a CI-only suite on this machine.** Every assertion spawns the
real hook; the suite took 53 minutes in a previous story and leaked `bash`
processes. Read it off the `gates` job instead:

    GH="/c/Program Files/GitHub CLI/gh.exe"
    "$GH" workflow run gates.yml --ref story/HARNESS-011-a-bare-directory-name-classifies-as-its

During GREEN the fast loop is a slice runner: source `_lib.sh`, call
`make_fixture`, paste in just the two new `describe` blocks, end with
`summary`. That is how the numbers below were measured and it costs about two
minutes.

### The failure output, verbatim

`bash scripts/selftest.sh classify`, on this tree, with `paths.conf` untouched:

      HARNESS-011: a bare directory name classifies as its own category
        FAIL bare docs is docs
             expected: docs	docs
             actual:   source	docs
        FAIL bare scripts is harness
             expected: harness	scripts
             actual:   source	scripts
        FAIL bare .claude is harness
             expected: harness	.claude
             actual:   source	.claude
        FAIL bare .github is harness
             expected: harness	.github
             actual:   source	.github
        FAIL bare tests is test
             expected: test	tests
             actual:   source	tests
        FAIL bare test is test
             expected: test	test
             actual:   source	test
        FAIL bare spec is test
             expected: test	spec
             actual:   source	spec
        FAIL bare __tests__ is test
             expected: test	__tests__
             actual:   source	__tests__
        FAIL a nested bare tests directory is still test
             expected: test	packages/app/tests
             actual:   source	packages/app/tests
        FAIL a FILE named test classifies as test: the accepted trade
             expected: test	test
             actual:   source	test

    classify: 32 passed, 10 failed

    assertion floors: all 1 suite(s) met their declared floor (32 assertions executed, 27 declared).
    1 of 1 harness suite(s) FAILED.

That floor line reads 27 because the run predates the `floors.conf` edit in this
same commit. With the floor at 42 the suite is also BELOW its floor until GREEN
lands, which is deliberate and written into `floors.conf`.

The new phase-guard block, run as a slice against the real hook (denial reasons
elided at `...`; each is the full lock message):

      HARNESS-011 AC-2: GREEN freezes the tests DIRECTORY, not only the files
        FAIL blocks: the bare tests directory in GREEN
             not blocked at all
        FAIL and refused because it is test, not incidentally
             expected to contain: category: test
             actual:

      HARNESS-011 AC-3: RED may write the bare directories RED owns
        FAIL allows: the bare docs directory in RED
             blocked with: BLOCKED by the harness phase lock. story: T-1 phase: RED path:     docs   category: source ...
        FAIL allows: the bare scripts directory in RED
             blocked with: ... path:     scripts   category: source ...
        FAIL allows: the bare .claude directory in RED
             blocked with: ... path:     .claude   category: source ...
        FAIL allows: the bare .github directory in RED
             blocked with: ... path:     .github   category: source ...
        FAIL allows: the bare tests directory in RED
             blocked with: ... path:     tests   category: source ...

    phase-guard-HARNESS-011-slice: 5 passed, 7 failed

**And the same thing on CI**, which is the run that judges it. `gates` workflow
run 35921367719 on this branch, Linux, the whole `bash scripts/selftest.sh`:

    classify: 32 passed, 10 failed
    FAIL classify  did 32 units of work, below the floor of 42 in .claude/tests/floors.conf
    ...
        FAIL blocks: the bare tests directory in GREEN
        FAIL and refused because it is test, not incidentally
        FAIL allows: the bare docs directory in RED
        FAIL allows: the bare scripts directory in RED
        FAIL allows: the bare .claude directory in RED
        FAIL allows: the bare .github directory in RED
        FAIL allows: the bare tests directory in RED
    phase-guard: 293 passed, 7 failed
    FAIL phase-guard  did 293 units of work, below the floor of 300 in .claude/tests/floors.conf
    ...
    3 of 19 harness suite(s) FAILED.

Identical failure set to the local run, on a different OS, and it confirms the
floor arithmetic: 293 + 7 = 300. The third failing suite was `selftest`, and it
was RIGHT to fail - see "A floor is recorded TWICE" below.

**The shape after that was fixed**, run 35922131131, which is the state GREEN
inherits:

    classify: 32 passed, 10 failed
    FAIL classify  did 32 units of work, below the floor of 42 in .claude/tests/floors.conf
    phase-guard: 293 passed, 7 failed
    FAIL phase-guard  did 293 units of work, below the floor of 300 in .claude/tests/floors.conf
    selftest: 54 passed, 0 failed
    2 of 19 harness suite(s) FAILED.

Exactly two suites red, both of them this story's, 17 failing assertions, every
other suite green. **That is the shape GREEN must turn into 19 of 19**, with
classify at 42 and phase-guard at 300. Nothing else in the tree should move.

**Why it is the RIGHT failure.** Every message names `category: source` on a
bare directory name - the defect exactly as C-1 describes it, not an import
error, not a fixture fault, not a timeout. Nothing is missing: `classify.sh`
runs, the hook runs, the fixture builds. The suites fail because eight rules are
absent from `paths.conf` and for no other reason.

### Files touched

    .claude/tests/classify.test.sh       +15 assertions, one new describe block
    .claude/tests/phase-guard.test.sh    +12 assertions, two new describe blocks
    .claude/tests/floors.conf            classify 27 -> 42, phase-guard 288 -> 300
    .claude/tests/selftest.test.sh       the SAME two numbers, second copy
    docs/backlog/stories/HARNESS-011.md  ## Test plan, ## Handoff

**A floor is recorded TWICE, and the second place is a test.**
`.claude/tests/selftest.test.sh` carries a hand-copied table of every floor and
asserts `floors.conf` matches it - which is what stops a floor being quietly
lowered to make a run pass. Raising a floor in one file and not the other fails
the `selftest` suite with `and each records the executed count measured on this
tree`. Found on CI, at the cost of a round trip; a pointer comment now sits at
the top of `floors.conf` so the next person does not pay it again.

`.claude/harness/paths.conf` was NOT touched. It is this story's production
artifact and GREEN owns it.

### The shape the tests already pin

There is no module to import - this is a data file read by two existing
consumers - so the "export shape" is the OUTPUT CONTRACT the assertions
destructure, and it is fact rather than suggestion:

* `bash scripts/classify.sh PATH...` prints one line per path,
  `<category>` TAB `<path>`, in the order given. Every new assertion compares
  the whole line, so a changed separator or a dropped column is a failure.
  Unchanged by this story; stated because the assertions depend on it.
* The categories the new assertions expect are exactly `docs`, `harness`,
  `test`, `vendor`, `source`, spelled as `paths.conf` spells them in column 1.
* The hook's denial reason contains the literal substrings `path:     <path>`
  (five spaces) and `category: <category>`. `assert_blocked` matches the first,
  `assert_contains` matches the second. Unchanged; do not reflow that message
  while implementing.
* **Not constrained, and left to the implementer:** where within each block the
  new line sits, what comment introduces it, whether the eight arrive under one
  comment or three, and the order of the four test rules among themselves. The
  only ordering property asserted is the one C-3 requires - each bare form after
  its own category's `/**` rules and before any broader rule that would claim
  the same path.

### Tests that passed on arrival, and what earns each

Ten of the 27 new assertions are green before GREEN lands, because they are
controls and regression guards. Every one was earned with a reverted
`scripts/mutate.sh` probe against `paths.conf`. Four probe runs, all restored
and verified byte-for-byte by `mutate.sh` itself.

**Probe 1 - the vendor precedent.** Expression
`s#^vendor | \*\*/node_modules$#vendor | zzz_node_modules#`, command
`bash scripts/selftest.sh classify`:

        FAIL vendor already had bare forms, and keeps them
             expected: vendor	node_modules
             actual:   ignored	node_modules

    classify: 31 passed, 11 failed
    === mutate: command exited 1; restored (verified byte-for-byte ...) ===

Note the near-miss it caught: with the rule gone the answer is `ignored`, not
`source`, because the fixture's `.gitignore` covers `node_modules/`. An
assertion phrased as "not source" would have passed with the rule deleted.

**Probe 2 - the source fallback, classifier side.** Expression
`s#^config | justfile$#docs | **#`, command `bash scripts/selftest.sh classify`:

        FAIL but a nested 'docs' is not docs, as its rule is root-anchored
             expected: source	src/docs
             actual:   docs	src/docs
        FAIL the control: bare src is still source
             expected: source	src
             actual:   docs	src
        FAIL the control: an invented name is still source
             expected: source	wibble
             actual:   docs	wibble

    classify: 19 passed, 23 failed
    FAIL classify  did 19 units of work, below the floor of 27 in .claude/tests/floors.conf
    === mutate: command exited 1; restored (verified byte-for-byte ...) ===

**Probe 3 - the GREEN test-file controls, hook side.** Expression
`s#^test | \*\*/tests/\*\*$#vendor | **/tests/**#`, command: the slice runner.

        FAIL blocks: the control: one test file was always refused
             not blocked at all
        FAIL blocks: the control: a trailing-slash directory, closed by HARNESS-010
             not blocked at all

    phase-guard-HARNESS-011-slice: 3 passed, 9 failed
    === mutate: command exited 1; restored (verified byte-for-byte ...) ===

**Probe 4 - the `src` and `wibble` controls, hook side.** Expression
`s#^config | justfile$#test | **#`, command: the slice runner.

        FAIL allows: the control: bare src is still writable in GREEN
             blocked with: ... phase: GREEN path:     src   category: test ...
        FAIL blocks: the control: bare src is still frozen in RED
             not blocked at all
        FAIL blocks: the control: an unclassified bare name still falls through to source
             not blocked at all

    phase-guard-HARNESS-011-slice: 9 passed, 3 failed
    === mutate: command exited 1; restored (verified byte-for-byte ...) ===

**Probe 4 is the one to read twice.** Under a deliberately over-broad
`test | **`, the slice went from 5 passed to 9 passed: every AC-3 positive
assertion - bare `docs`, `scripts`, `.claude`, `.github` and `tests` permitted
in RED - was SATISFIED by a rule that swallows the whole tree. Only the three
controls noticed. That is the precise failure mode C-4 describes, demonstrated
rather than asserted.

**It is NOT the deferred verification GATES owns.** That one mutates a bare rule
that does not exist yet, against the shipped `paths.conf`, and confirms the FULL
suites go red rather than quietly continuing to pass. Probe 4 mutates a
different line against today's tree in order to earn three assertions. GATES
still owes its own run, and this handoff does not discharge it.

### Negative controls: expected values

These suites do NOT fail at import - bash has no import step, and every
assertion in both new blocks executed. So the numbers below are MEASURED, not
claimed. GREEN confirms the right-hand column against the shipped rules.

| Control | Asserts | Measured in RED | Expected after GREEN |
|---|---|---|---|
| `classify src` | `source` + TAB + `src` | `source	src` | unchanged |
| `classify wibble` | `source` + TAB + `wibble` | `source	wibble` | unchanged |
| `classify src/docs` | `source` + TAB + `src/docs` | `source	src/docs` | unchanged |
| `classify node_modules` | `vendor` + TAB + `node_modules` | `vendor	node_modules` | unchanged |
| `classify target` | `vendor` + TAB + `target` | `vendor	target` | unchanged |
| GREEN `rm -rf tests/main.test.ts` | BLOCK on `tests/main.test.ts` | BLOCK, `category: test` | unchanged |
| GREEN `rm -rf tests/` | BLOCK on `tests/` | BLOCK, `category: test` | unchanged |
| GREEN `rm -rf src` | ALLOW | ALLOW | unchanged |
| RED `rm -rf src` | BLOCK on `src` | BLOCK, `category: source` | unchanged |
| RED `rm -rf wibble` | BLOCK on `wibble` | BLOCK, `category: source` | unchanged |

All ten must read the same after the eight rules land. A control that MOVES is
this story's failure mode, not a curiosity: it means a new rule reached further
than C-3 describes.

### The two claims RED was told to check

**C-1 HELD, every row.** Re-measured on this checkout through
`bash scripts/classify.sh` and through the real `phase-guard.sh`:

    docs tests test spec __tests__ .claude scripts .github  -> source   as stated
    src                                                     -> source   as stated
    tests/ -> test     docs/ -> docs                                    as stated

                              RED     GREEN
      rm -rf tests/a.test.ts  ALLOW   BLOCK      as stated
      rm -rf tests/           ALLOW   BLOCK      as stated
      rm -rf tests            BLOCK   ALLOW      as stated
      rm -rf docs             BLOCK   ALLOW      as stated
      rm -rf .claude          BLOCK   ALLOW      as stated

Four paths the contract does not list, measured because the new tests need
them: `rm -rf scripts`, `rm -rf .github`, `rm -rf spec` and `rm -rf wibble` all
BLOCK in RED as `category: source`; `rm -rf src` and `rm -rf wibble` both ALLOW
in GREEN.

**C-2 HELD.** `rm -rf tests/` BLOCKS in GREEN with `category: test` and ALLOWS
in RED. HARNESS-010's parser does keep a directory operand's trailing slash, so
the remaining defect is purely the bare name and **a `paths.conf`-only fix
closes AC-2**. This is a one-file story. The caution in `## Notes` is history,
as PO-3 says.

### Anything that changes the approach

* **`gates.sh --fast` is vacuous in this repository and its output is not
  evidence for this story.** Run on this tree it reports five UNCONFIGURED gates
  and `0 ran`, exactly as PO-1 predicts: `BOOTSTRAPPED=no`, because this is the
  harness template. The verifier is `bash scripts/selftest.sh` in the `gates`
  job of `.github/workflows/gates.yml`. Read that, not the gate summary.
* **`bash scripts/check-sigpipe.sh` -> 0 findings over 40 shell files;
  `bash scripts/check-grep-count.sh` -> 0 findings over 40.** Both run after the
  test edits.
* **The phase-guard floor of 300 was arithmetic and is now a reading.** The
  `gates` job on this branch reports `phase-guard: 293 passed, 7 failed` - 300
  executed, exactly the 288 + 12 predicted. No correction needed in GREEN.
* **`packages/app/tests` and `src/docs` do not exist in the fixture**, on
  purpose. The classifier answers about paths that may not exist yet, which is
  the same property C-3 records for a file named `test`.

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

    run:    2026-09-23T22:35:07Z
    commit: 348aa19 (working tree had uncommitted changes)
    tree:   213a8225fed3745225e887a7ad4789b47df7021d
    result: pass (0 ran, 8 unconfigured, 0 known)

    UNCONFIGURED format
    UNCONFIGURED lint
    UNCONFIGURED typecheck
    UNCONFIGURED unit
    UNCONFIGURED coverage
    UNCONFIGURED integration
    UNCONFIGURED build
    UNCONFIGURED mutation

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


Filed 2026-09-23 from HARNESS-010's RED phase. The `## Contract` is deliberately
left for PLANNED to pin when this story is started; what follows is the evidence
so that PLANNED reads numbers rather than re-deriving them.

**The measurements, taken by the orchestrator on this checkout at release 48.**
Both through `bash scripts/classify.sh` and through the real `phase-guard.sh`
driven with a JSON payload, against a fixture carrying this repository's own
`paths.conf` and `phases.conf`.

    $ bash scripts/classify.sh tests tests/ tests/a.test.ts docs docs/ .claude .claude/hooks
    source  tests
    test    tests/
    test    tests/a.test.ts
    source  docs
    docs    docs/
    source  .claude
    harness .claude/hooks

    story in GREEN:
      rm -rf tests/a.test.ts   -> BLOCK
      echo x > tests/a.test.ts -> BLOCK
      rm -rf tests             -> ALLOW      <- the hole
    story in RED:
      rm -rf tests             -> BLOCK      <- the false positive
      rm -rf docs              -> BLOCK      <- the false positive

**A caution for whoever writes the fix.** `tests/` (trailing slash) classifies
as `test` correctly, but the guard still ALLOWED `rm -rf tests/` in GREEN in one
probe - the write-target parser appears to hand the classifier the name with the
slash stripped. That is HARNESS-010's territory, not this story's, and it means
**a classify-only fix may not close AC-2 on its own**. Check it end to end
through the hook rather than through `classify.sh` alone, and if the parser is
the remaining cause, say so and let HARNESS-010 carry it.

**Why it is `chore` and not `fix`.** The harness's own types put a defect in
shipped behaviour under `fix`, and this is one. It is filed as `chore` because
the change is to a configuration table and its tests rather than to a project's
product code, which is how the other HARNESS-* stories are typed. If that reads
wrong at PLANNED, retype it then - nothing downstream depends on it.

**Provenance.** The fourth finding of the port-before-refresh round, after
assertion floors (release 47), the two session-safety fixes (release 48) and the
parser reconciliation (HARNESS-010). Found by running manga-translator's
`phase-guard.test.sh` against upstream's parser on CI: twelve of the seventy
failures were `classify` cases rather than parser cases, and manga-translator
had already fixed this downstream.

**Not urgent for the refresh, unlike the other three.** `refresh-harness.sh`
LEAVES `paths.conf` for a human to merge - it is one of the two files the script
names "do not just copy these" - so no refresh will silently overwrite the
downstream fix. The risk is a hand merge dropping a rule nobody wrote down
upstream. Landing this makes that merge mechanical rather than a judgement.

### PO decisions at PLANNED (2026-09-23)

**PO-1. `required_gates: []`; the verifier is the self-test.** As for HARNESS-008
and HARNESS-010: every gate is `<unconfigured>` with `BOOTSTRAPPED=no`, because
this repository is the harness template. What fails if this artifact breaks is
`bash scripts/selftest.sh`, run by `.github/workflows/gates.yml` in the `gates`
job, and since release 47 that carries assertion floors - so a suite that
quietly shrinks fails rather than passing faster.

**PO-2. No epic, so no done-when to close.**

**PO-3. The story's own caution is RESOLVED, and the measurements in `## Notes`
are superseded by C-1.** `## Notes` warns that a classify-only fix might not
close AC-2, because at release 48 `rm -rf tests/` was permitted in GREEN. The
orchestrator re-measured at PLANNED against release 49 and it now blocks in
GREEN and allows in RED, both correct - HARNESS-010's parser keeps a directory
operand's trailing slash. The remaining defect is purely the bare name.

Recorded rather than silently corrected because the `## Notes` block was written
three hours earlier and a reader would otherwise trust it. C-1 supersedes it;
the Notes stay as the history of what was true at release 48.

**PO-4. The story stays typed `chore`.** `## Notes` flagged that a defect in
shipped behaviour is arguably a `fix`. Left as `chore` for consistency with
every other HARNESS-* story, all of which change the harness's own configuration
and tests rather than a product's code. Nothing downstream reads the type.
