---
id: HARNESS-010
title: Reconcile the two write-target parsers into one
slug: reconcile-the-two-write-target-parsers-i
epic: 
type: chore
status: done
phase: DONE
branch: story/HARNESS-010-reconcile-the-two-write-target-parsers-i
depends_on: []      # story ids; phase.sh refuses to start this story until they are DONE
touches: [.claude/hooks/lib.sh, .claude/hooks/phase-guard.sh, .claude/tests/phase-guard.test.sh, .claude/tests/lib.test.sh, .claude/tests/floors.conf]  # files this story expects to write
required_gates: []  # gate ids that are optional for the repo but binding for THIS story
---

## Context

**Two independent rewrites of the same security-critical parser, and neither is
a superset of the other.** Found while porting manga-translator's harness work
back upstream before refreshing it (releases 47 and 48 took the other two
findings; this is the one that could not be ported).

The component is the thing that decides WHICH PATHS a shell command would write
to. The phase lock is only as good as that answer: a target it fails to derive
is a frozen file written unchallenged, and a target it invents is a refusal on a
command that writes nothing. `CLAUDE.md` law 5 says never to route around the
lock, which makes this the one parser in the tree where both error directions
are expensive.

**What upstream has** (`.claude/hooks/phase-guard.sh`, inline `CANDIDATES`):

  * redirect clauses stripped once, so every later rule reads text with no `>`
    in it - the fix for a family of false positives that had survived nine
    enumerated shapes;
  * `sed -i` decided PER WORD: a single-dash word is in-place when the letters
    after its `-` include an `i` (`-i`, `-i.bak`, `-ni`, `-Ei`, `-rin`). The
    substring test it replaced refused `sed -n '1,5p'
    tests/guards/layer-imports.test.ts` - a pure read - because the FILENAME
    contains `-i`, while missing `-ni` entirely, so `sed -ni 's/a/b/'
    src/main.ts` rewrote frozen source unchallenged. Same bug from two ends.
  * `--in-place` as a PREFIX test, because GNU getopt_long honours any
    unambiguous abbreviation and `--i` is unambiguous for GNU sed 4.9.

**What manga-translator has** (`write_candidates`, factored into
`.claude/hooks/lib.sh`, one awk):

  * a named function in `lib.sh` rather than an inline pipeline in the hook, so
    the answer can be asked for rather than re-derived - which is the same rule
    `rules.md` states for `classify.sh`;
  * ROLES. Each candidate carries the part it played, tab-separated, so a
    denial can say `operand: destination` instead of naming a path with no
    account of why it is a write target;
  * `cp`/`mv`/`rm`/`touch` handled by operand position, with `mv -t DIR` /
    `--target-directory` INVERTING the roles - DIR is the destination and every
    positional is a source, whatever its position. Measured there against GNU
    coreutils 8.32;
  * `no_candidate()`: a write command from which NO target could be parsed is
    logged to `.claude/state/phase-guard-declined.log` rather than passing
    silently. Upstream has that log file and writes it from elsewhere, but has
    no equivalent of this specific "a write parsed to nothing" record.

**Neither side can simply take the other.** Upstream's `sed` analysis is
strictly better and downstream lacks it. Downstream's role tracking and `mv -t`
semantics are strictly better and upstream lacks them. They are the same
function, evolved apart for about thirty-five releases, and the role reporting
in denials cannot be lifted out of the parser it rests on.

**Why this is a story and not a port.** The two other findings from the same
round were additive - a new branch test in a hook, a new fingerprint check in
`gates.sh` - and each landed with its downstream tests in an afternoon. This one
replaces the decision procedure of the phase lock. Doing it by copying one side
over the other loses real defences in whichever direction it is done, and doing
it by hand without a corpus drawn from both sides is how a parser that refuses
reads and permits writes gets shipped green.

**The corpus already exists on both sides and is the main asset.** Upstream's
`.claude/tests/phase-guard.test.sh` runs 188 assertions; manga-translator's runs
289. Neither suite's cases were written from the other's failures. The union is
the specification this story is really about, and the first job is to run each
suite's cases against the other's parser and record which fail - because those
are precisely the behaviours one side knows about and the other does not.
## Acceptance criteria

- **AC-1** - Given the union corpus (every case from upstream's
  `phase-guard.test.sh` and every case from manga-translator's), when the
  reconciled parser is asked for each command's write targets, then every case
  from BOTH suites passes. *Control:* the corpus is recorded BEFORE the parser
  is written, with each side's current pass/fail against the other's parser
  named per case - a case no existing parser fails is a case that proves
  nothing about the reconciliation.
- **AC-2** - Given `sed` invoked with `-n`, `-i`, `-i.bak`, `-ni`, `-Ei`,
  `-rin`, `--i`, `--in-pl` and `--in-place`, when targets are derived, then the
  in-place forms yield the file as a write target and the read-only forms yield
  none. *Control:* a filename containing `-i` (the real
  `tests/guards/layer-imports.test.ts` case) under `sed -n` yields NO target.
- **AC-3** - Given `mv a b DEST`, `mv X d/`, `mv -t DIR a b` and
  `mv --target-directory DIR a b`, when targets are derived, then each operand
  carries the role it actually plays, and `-t`/`--target-directory` inverts
  which operand is the destination. *Control:* the same token is reported as a
  source in one form and a destination in the other.
- **AC-4** - Given a command the parser classifies as a write but from which no
  target can be derived, when the guard runs, then the attempt is recorded in
  `.claude/state/phase-guard-declined.log` and the command is not silently
  permitted. *Control:* a command from which targets ARE derived writes nothing
  to that log.
- **AC-5** - Given a denial, when the guard reports it, then the message names
  the operand's role alongside the path. *Control:* a denial for a path with no
  meaningful role does not invent one.
- **AC-6** - The parser lives in one place, and every caller asks it rather than
  re-deriving. *Verified by review* - see `## Deferred verifications`.
- **AC-7** - `.claude/tests/phase-guard.test.sh` executes at least as many
  assertions as the two suites did separately for the behaviours both covered,
  and `.claude/tests/floors.conf` records the new count. *Control:* the floor is
  the executed count, not the call-site count.

## Out of scope

- **Any new shell construct.** This reconciles two parsers over the constructs
  they already handle between them. A twelfth false-positive shape discovered
  during the work is a finding to record, not a criterion to add.
- **`classify.sh` and the category rules.** What a path IS remains
  `paths.conf`'s answer; this story is only about which paths a command WRITES.
- **manga-translator's refresh.** That is what this unblocks, not what it does.
## Contract

RED MAY AMEND ANY BLOCK BELOW IN PLACE, with a reason recorded in the block
itself, and GREEN builds what the amended block says. What RED may not do is
leave a block contradicted by the tests and say nothing.

### C-1. The measured disagreement table. SETTLED — read it out, do not re-derive

Taken by the orchestrator at PLANNED, against upstream release 48 and
manga-translator's parser as it stands, both driven through the REAL
`phase-guard.sh` with a fixture whose story is in RED (so `src/` is frozen and
`docs/` is writable). Verdicts are the hook's own: BLOCK = `permissionDecision:
deny`, ALLOW = anything else.

**The instrument was checked before it was believed.** A first version of the
probe had a broken JSON escaper and reported ALLOW for everything, including
`echo x > src/main.ts`. The table below was taken only after the probe was shown
to BLOCK a frozen-source write and ALLOW a docs write on both parsers.

    COMMAND (RED: src/ frozen, docs/ writable)              UP-48   MT      VERDICT
    sed -i 's/a/b/' src/main.ts                             BLOCK   BLOCK   agree
    sed -i.bak 's/a/b/' src/main.ts                         BLOCK   BLOCK   agree
    sed -ni 's/a/b/' src/main.ts                            BLOCK   BLOCK   agree
    sed -Ei 's/a/b/' src/main.ts                            BLOCK   BLOCK   agree
    sed --in-place 's/a/b/' src/main.ts                     BLOCK   BLOCK   agree
    sed --i 's/a/b/' src/main.ts                            BLOCK   ALLOW   ** DIFFER **
    sed -n 1,5p tests/guards/layer-imports.test.ts          ALLOW   ALLOW   agree
    sed -n 1,5p src/main.ts                                 ALLOW   ALLOW   agree
    mv docs/n.md src/main.ts                                BLOCK   BLOCK   agree
    mv src/main.ts docs/n.md                                ALLOW   BLOCK   ** DIFFER **
    mv -t src docs/n.md                                     ALLOW   BLOCK   ** DIFFER **
    mv --target-directory=src docs/n.md                     ALLOW   BLOCK   ** DIFFER **
    mv -t docs src/main.ts                                  BLOCK   BLOCK   agree
    cp docs/n.md src/main.ts                                BLOCK   BLOCK   agree
    cp -t src docs/n.md                                     ALLOW   ALLOW   agree (BOTH WRONG)
    rm src/main.ts                                          BLOCK   BLOCK   agree
    rm -f src/a src/b                                       BLOCK   BLOCK   agree
    touch src/main.ts                                       BLOCK   BLOCK   agree
    tee src/main.ts < docs/n.md                             BLOCK   BLOCK   agree
    tee -a src/main.ts < docs/n.md                          BLOCK   BLOCK   agree
    truncate -s 0 src/main.ts                               ALLOW   ALLOW   agree (BOTH WRONG)
    install -m 644 docs/n.md src/main.ts                    ALLOW   ALLOW   agree (BOTH WRONG)

**RED re-ran all twenty-two rows on CI before depending on any of them, and
reproduced the table exactly** — same instrument check first (both parsers BLOCK
`echo x > src/main.ts` and ALLOW `echo x > docs/notes.md`), fixture held
constant, only `.claude/hooks/**` swapped between the two columns. All four
DIFFER rows and all three BOTH WRONG rows reproduce. No row of C-1 is in doubt.
Run 35892904034, step `Cross-comparison`, STEP 2. This is a verification, not a
re-derivation: nothing below was re-tuned.

### C-2. What the reconciliation must do, derived from C-1

**The union rule: the reconciled parser BLOCKS every command either parser
blocks today.** Each disagreement below is a hole in one side, not a taste
difference, and each has a direction:

  * **`sed --i` — upstream is right, downstream has a HOLE.** GNU getopt_long
    honours any unambiguous abbreviation, and `--in-place` is the only long
    option of GNU sed 4.9 beginning `--i`, so `sed --i` genuinely writes in
    place. Downstream permits it: frozen source rewritten unchallenged. Keep
    upstream's PREFIX test, never a literal `--in-place` match.
  * **`mv src/... docs/...` — downstream is right, upstream has a HOLE.** `mv`
    REMOVES its source. Moving a frozen file away is a write to the frozen path,
    and upstream permits it.
  * **`mv -t DIR` and `mv --target-directory=DIR` — downstream is right,
    upstream has a HOLE.** The option INVERTS which operand is the destination,
    and upstream reads position only, so it permits a move INTO a frozen
    directory. Note `mv -t docs src/main.ts` agrees at BLOCK, but for the wrong
    reason upstream: it blocks on the positional, not on understanding `-t`.

### C-3. Three shapes NEITHER parser catches — recorded, NOT criteria

`cp -t src docs/n.md`, `truncate -s 0 src/main.ts` and
`install -m 644 docs/n.md src/main.ts` are all writes into frozen source that
BOTH parsers permit today. `cp -t` is the sharper one: downstream handles `-t`
for `mv` and not for `cp`, so the asymmetry is in one parser's own treatment.

`## Out of scope` says a new shape found during the work is **a finding to
record, not a criterion to add**, and that holds: this story is the
reconciliation, and widening the rule set at the same time makes it impossible
to tell which change caused which behaviour. Record them; file them after.

### C-4. Where the code goes

  * **`write_candidates()` moves into `.claude/hooks/lib.sh`**, as downstream
    has it — a named function the hook asks, not an inline pipeline. This is the
    same rule `rules.md` states for `classify.sh`: a test that needs this answer
    asks for it rather than reimplementing it.
  * **`phase-guard.sh` calls it** and keeps `no_candidate()` logging to
    `.claude/state/phase-guard-declined.log` for a write command that parsed to
    no target.
  * **Roles are carried tab-separated on the candidate line**, target first, so
    the existing candidate filter keeps anchoring on the path.

**AMENDED AT RED — C-4 did not state the one thing AC-4 rests on.** The block
above describes the candidate lines and says nothing about how the caller is
meant to tell *"this command was never a write"* from *"this command was a write
and no target could be parsed from it"*. AC-4 is exactly that distinction, and
it cannot be derived from an empty candidate list: an empty list means both
things. So the output of `write_candidates()` is:

    <verdict>\n            `W` or `-`, ALWAYS present, always the first line
    <target>[\t<role>]\n   zero or more, in whatever order the parser emits

`W` when the command names a write-capable tool — `sed cp mv rm touch tee` — at a
REAL token boundary, `-` when it does not. A redirect operator alone does not set
it: `git diff > /dev/null` is `-` with a candidate, because `cmd > /dev/null` is
ubiquitous and tracing it would drown the log AC-4 exists to make readable.
`phase-guard.sh` calls `no_candidate()` when, and only when, the verdict is `W`
and the filtered candidate list is empty.

Reason for the amendment: RED wrote the AC-4 assertions and found no clause that
fixes the mechanism they depend on. This is downstream's existing shape, not an
invention — it is `write_candidates`'s current contract in manga-translator's
`lib.sh` — and the tests now pin it, so GREEN must build it. `.claude/tests/
lib.test.sh` asserts the verdict on 11 commands; the rendering helper there keeps
the verdict in the string precisely so that a "yields no target" control cannot
pass vacuously against a function that does not exist.

The tests do **not** pin candidate ORDER: `wcand()` sorts under `LC_ALL=C` before
comparing, because no clause of C-4 fixes an order and `phase-guard.sh` sorts
anyway. Emit in whatever order is natural.

### C-5. Callers of every changed signature

Checked against the tree at PLANNED. `write_candidates` does not exist upstream
today, so it has no callers to break; what changes is the INLINE block in
`phase-guard.sh` that currently produces `CANDIDATES`.

    $ grep -rn "CANDIDATES" .claude/ scripts/
    .claude/hooks/phase-guard.sh:103   CANDIDATES="$(
    .claude/hooks/phase-guard.sh:215   done <<< "$CANDIDATES"

Two lines, one file, no other reader. `lib.sh` gains a function; nothing that
sources `lib.sh` breaks by addition.

RED's handoff must state that this list was re-checked against the tree.

**Re-checked at RED, 2026-09-23. It still holds, unchanged:**

    $ grep -rn "CANDIDATES" .claude/ scripts/
    .claude/hooks/phase-guard.sh:103:    CANDIDATES="$(
    .claude/hooks/phase-guard.sh:215:    done <<< "$CANDIDATES"

Two lines, one file, no other reader in source. (`grep` now also matches four
comment lines in `.claude/tests/*.test.sh` that RED wrote; none of them reads the
variable.) `write_candidates` still does not exist upstream, so it has no callers
to break.

### C-6. The union corpus, and why it is RED's first task not PLANNED's

C-1 is a TARGETED probe of the forms the two parsers were read to differ on. It
is not the union of the two suites — upstream's `phase-guard.test.sh` executes
188 assertions and downstream's 289, and running each suite against the other's
parser is the exhaustive form of this measurement.

**That was attempted at PLANNED and abandoned for a machine reason, not a
design one.** Both cross-fixtures were built (`/tmp/xA`, `/tmp/xB`); the run
wedged after ~600 s with the authoring machine at 47 live `bash` processes,
which is the process-leak this machine shows on any suite that spawns the hook
a few hundred times. RED should run the cross-comparison **on CI**, where the
whole self-test is ~70 s, and paste the disagreement list into the handoff.

Expect it to find more than C-1's four. C-1 is a floor on the disagreements,
not a ceiling.
## Deferred verifications

**The union-corpus cross-comparison. Owner: RED.**

C-6 says why this is not in C-1: the authoring machine wedged running it. RED
runs upstream's `phase-guard.test.sh` against downstream's parser and
downstream's against upstream's — the fixtures are described in C-6 — **on CI**,
and pastes the full disagreement list into `## Handoff`. Falsifiable: if the
cross-run produces no disagreements beyond C-1's four, then C-1 was already the
whole story and AC-1's union corpus is smaller than this story assumes. Either
result is informative; silence is not.

**Result: DONE at RED. 81 disagreements, against C-1's four.** C-1 was a floor,
as C-6 predicted, and it under-counted by a factor of twenty.

Run `35892904034`, branch `xcompare/HARNESS-010` (throwaway, deleted after the
list was read; the runner is reproduced under `## Handoff` so it can be rebuilt).
68 s on `ubuntu-latest` for four suite runs plus two probe passes — against the
authoring machine, where upstream's `phase-guard.test.sh` alone did not finish in
600 s.

**Four trees, not two.** Each corpus was run against its OWN parser as well, so
the reported failures are a delta rather than a raw count:

    A0  upstream corpus  + upstream parser     188 passed,  0 failed   baseline
    xA  upstream corpus  + MT parser           177 passed, 11 failed
    B0  MT corpus        + MT parser           289 passed,  0 failed   baseline
    xB  MT corpus        + upstream parser     219 passed, 70 failed

Both baselines are clean, so no failure below is fixture drift. "Parser" means
`.claude/hooks/{lib.sh,phase-guard.sh}` as a UNIT — the extractor rests on that
file's masker, classifier and plausibility test, and upstream has no separable
`write_candidates()` to transplant. Each tree kept its own `paths.conf`.

**The instrument was checked before any of it was believed** (PO-4). All four
trees BLOCK `echo x > src/main.ts` and ALLOW `echo x > docs/notes.md`; the runner
aborts if any does not.

**xA — 11 failures. Upstream catches these; manga-translator does not.**

| # | Failure | Cause | In scope |
|---|---|---|---|
| 1 | `blocks: a redirect on the line after a here-string` | MT's `mask_shell_quotes` reads the 2nd `<` of `<<<` as a heredoc opener and goes blind to end of input. Upstream fixed it at release 47 | masker, not the parser — preserved free, since GREEN builds on upstream's `lib.sh` |
| 2-6 | `touch -t` / `-d` / `-r`, two of them also on the wrong path | MT's `allops()` emits EVERY non-option token, so the TIMESTAMP and the `-r` REFERENCE FILE became candidates. A wrong denial naming a real file the command never writes | **yes** — pinned by 5 assertions in `lib.test.sh` and 5 in `phase-guard.test.sh` |
| 7-10 | `PHASE=GREE` / `ZZZ` / `GREEN.` / empty `refuses a source write` — *"the lock is off on a typo"* | MT's `lib.sh` has no unknown-phase refusal | not the parser — preserved free, same reason as row 1 |
| 11 | `blocks: sed --i` | C-1 r6. MT matches the literal `--in-place` | **yes** — C-1's DIFFER row |

**xB — 70 failures. Manga-translator catches these; upstream does not.** By
section of MT's suite:

    19  MT-033 AC-1/AC-6, PO-8  mv -t inverts the operands, so it inverts the roles
    11  MT-033 AC-1             mv removes its source, so the source is judged
     7  MT-033 AC-6, C-5        the denial says WHICH operand was refused
     6  MT-031 AC-8             a zero-candidate write leaves a trace
     6  MT-034 AC-1             a directory-shaped path in a permitted category
     4  MT-034 AC-3/AC-3b       GREEN freezes the test tree however it is spelled
     4  MT-033 AC-1             a frozen TEST leaving its path during GREEN
     4  MT-031 AC-3             a metacharacter in the expression changes nothing
     2  MT-034 AC-2             mv into a permitted directory
     2  MT-033 AC-4             git mv is judged by the mv rule
     2  MT-031 AC-5             the expression is scanned, not the operand
     2  MT-031 AC-2/C-3         a real in-place edit is blocked on its operand
     1  MT-031 C-3              cp and mv judge the destination, not every operand

Four causes, all upstream's `awk '{print $NF}'` or an absent mechanism:

  * **the last word of a match is not an operand** — `sed -i EXPR frozen.ts
    permitted.md` judges only the second file; `(` in a sed script truncates the
    match and returns a FRAGMENT of the program (`s`, or
    `s|        if a.ndim == 4 and min`) as the path, which is a denial on a
    nonsense path, and with `!` in front of it the command is allowed outright;
  * **`mv` REMOVES its source** and upstream judges only what it creates;
  * **`-t` / `--target-directory` invert the destination**, in six spellings,
    three of which glue or attach the argument;
  * **roles and `no_candidate()` do not exist upstream at all.**

**12 of the 70 are NOT this story's, and they are the finding worth escalating.**
Every `MT-034` row is `classify`, not the write-target parser: bare `docs` and
bare `tests` classify as **source** in this repository, because only `docs/` and
`tests/` with the trailing slash match their rules. manga-translator has a
directory-shaped-path rule upstream lacks. `## Out of scope` puts `classify.sh`
and the category rules outside this story, so those 12 are recorded and not
ported — **a FOURTH finding from the port round, needing its own story.** It has
one visible consequence inside this story, handled explicitly: C-1's row 13
(`mv -t docs src/main.ts`) is asserted with `assert_blocked_on_either`, because
which of its two operands the denial names turns on that gap, and pinning either
spelling would freeze an out-of-scope behaviour into a test. The sharp form of
the same command, `mv -t docs/ src/main.ts`, is asserted on the path AND the role
one line below it.

**So the in-scope disagreement set is 69 of the 81**, and every one of them is
now an assertion in this tree.

**AC-5, the role in a denial. Owner: GATES.**

The orchestrator's PLANNED probe measured BLOCK/ALLOW only — the instrument
extracted the verdict, not the message body, and three attempts at parsing
`path:` and `operand:` out of the JSON-escaped reason failed on shell quoting
before the attempt was abandoned as gold-plating. So no PLANNED measurement
exists of what a denial SAYS, only of whether it denies.

GATES mutates the reconciled parser so that one operand reports the wrong role -
a destination reported as a source - and confirms that an AC-5 assertion goes
red and that the BLOCK/ALLOW verdict does NOT change. That pairing is the point:
a role assertion that fails only when the verdict also flips is not testing the
role, it is testing the verdict a second time.

**Result (GATES, 2026-09-23): PASSED.**

The pair differs only in operand order, so the verdict cannot distinguish it.
Baseline through the real hook, story in RED:

    mv src/main.ts docs/n.md       BLOCK  path: src/main.ts  operand: source of mv (removed by the move)
    mv docs/n.md src/main.ts       BLOCK  path: src/main.ts  operand: destination of mv

Same verdict, same path, opposite role - which is the metric RED designed.

**The mutation**, through `scripts/mutate.sh` so the restore is verified:

    === mutate: .claude/hooks/lib.sh (1 line(s) changed by 498s/destination of mv/WRONG ROLE STRING/) ===
      mv src/main.ts docs/n.md     BLOCK  path: src/main.ts  operand: source of mv (removed by the move)
      mv docs/n.md src/main.ts     BLOCK  path: src/main.ts  operand: WRONG ROLE STRING
    === mutate: command exited 0; restored (verified byte-for-byte against .../lib.sh.20260923T191318Z.602988.bak) ===

**The verdict did not move and the path did not move; only the role did.** That
is the whole point of this entry: a role assertion that fails only when the
verdict also flips is testing the verdict twice.

The other half - that an AC-5 assertion actually goes red - was measured
separately under the same mutation against `lib.test.sh`: **6 assertions red**,
every one of them role-reading, including `AC-3 control: the same token is a
SOURCE when it comes first`. Restored and verified; `lib` back to
`197 passed, 0 failed`.


**That the union rule did not LOSE a case. Owner: GATES.**

C-2 says the reconciled parser must block everything either parser blocks today.
The risk in a merge is silent narrowing: a case upstream caught that the
downstream-shaped rewrite drops. GATES re-runs C-1's twenty-two commands against
the SHIPPED parser and pastes the table, with every previously-BLOCK row still
BLOCK and the four DIFFER rows now BLOCK.

The three rows marked BOTH WRONG in C-1 (`cp -t`, `truncate`, `install`) must
still be ALLOW - they are out of scope per C-3, and a run that quietly fixes
them has changed the rule set as well as reconciling it, which is the one thing
this story must not do without saying so.

**Result (GATES, 2026-09-23): PASSED. Nothing was lost, nothing was widened.**

C-1's twenty-two commands re-run against the SHIPPED parser, same fixture
shape, story in RED:

    C-1 COMMAND                                          C-1 UP  NOW     VERDICT
    sed -i 's/a/b/' src/main.ts                          BLOCK   BLOCK   as C-1
    sed -i.bak 's/a/b/' src/main.ts                      BLOCK   BLOCK   as C-1
    sed -ni 's/a/b/' src/main.ts                         BLOCK   BLOCK   as C-1
    sed -Ei 's/a/b/' src/main.ts                         BLOCK   BLOCK   as C-1
    sed --in-place 's/a/b/' src/main.ts                  BLOCK   BLOCK   as C-1
    sed --i 's/a/b/' src/main.ts                         ALLOW   BLOCK   ** CHANGED **
    sed -n 1,5p tests/guards/layer-imports.test.ts       ALLOW   ALLOW   as C-1
    sed -n 1,5p src/main.ts                              ALLOW   ALLOW   as C-1
    mv docs/n.md src/main.ts                             BLOCK   BLOCK   as C-1
    mv src/main.ts docs/n.md                             ALLOW   BLOCK   ** CHANGED **
    mv -t src docs/n.md                                  ALLOW   BLOCK   ** CHANGED **
    mv --target-directory=src docs/n.md                  ALLOW   BLOCK   ** CHANGED **
    mv -t docs src/main.ts                               BLOCK   BLOCK   as C-1
    cp docs/n.md src/main.ts                             BLOCK   BLOCK   as C-1
    cp -t src docs/n.md                                  ALLOW   ALLOW   as C-1
    rm src/main.ts                                       BLOCK   BLOCK   as C-1
    rm -f src/a src/b                                    BLOCK   BLOCK   as C-1
    touch src/main.ts                                    BLOCK   BLOCK   as C-1
    tee src/main.ts < docs/n.md                          BLOCK   BLOCK   as C-1
    tee -a src/main.ts < docs/n.md                       BLOCK   BLOCK   as C-1
    truncate -s 0 src/main.ts                            ALLOW   ALLOW   as C-1
    install -m 644 docs/n.md src/main.ts                 ALLOW   ALLOW   as C-1

Three things, and the third is the one that could have gone wrong quietly:

  * **Every row that BLOCKED under upstream still BLOCKS.** Thirteen of them.
    The union rule did not narrow.
  * **All four DIFFER rows now BLOCK.** `sed --i` was the hole downstream had;
    the three `mv` rows were the holes upstream had. Both directions closed.
  * **The three BOTH WRONG rows are still ALLOW.** `cp -t`, `truncate -s 0` and
    `install -m 644` remain permitted, exactly as C-3 and PO-5 require. A run
    that "improved" them would have changed the rule set inside a
    reconciliation, and no later reader could tell which change caused which
    behaviour. They are HARNESS-011's neighbours, not this story's.
**AC-6, one parser in one place. Owner: REVIEW.**

ADDED AT THE END OF RED, and it is the orchestrator's omission rather than
a change of scope: AC-6 has always read `*Verified by review* - see
`## Deferred verifications``, and PLANNED then wrote three entries, none of
them AC-6's. RED found the dangling reference and correctly declined to
amend the criterion over it. The criterion is unchanged, so no `## Amendments`
entry is owed; what was missing is this block.

REVIEW confirms that `write_candidates()` is defined once, in
`.claude/hooks/lib.sh`, and that `phase-guard.sh` ASKS it rather than
carrying a second copy of the rules - the same property `rules.md` states
for `classify.sh`. The mechanical half is already pinned by four assertions
RED wrote; what review adds is the judgement those cannot make, which is
whether a future reader would be tempted to re-derive the answer locally
instead of calling it.

**Result (REVIEW, 2026-09-23): PASSED.** Read against `main` at the merge
commit `d65efcf`, release 49.

**Defined once.** `grep -rn "^write_candidates()" .claude/ scripts/` returns
a single line, `.claude/hooks/lib.sh:617`. There is no second definition and
no per-caller variant.

**Asked, not re-derived.** `phase-guard.sh` has exactly one call site,
line 105, `ANSWER="$(write_candidates "$MASKED")"`. The inline
`grep -oE 'sed…'` chain that used to carry the rules is gone from the
tree - searched for and absent - so the hook cannot disagree with `lib.sh`
about what a write is, because it no longer holds an opinion.

**The judgement a test cannot make**, which is what this entry is for: would
a future reader be tempted to re-derive the answer locally? The comment at
`phase-guard.sh:100` says `rules live in lib.sh's write_candidates - one
parser, one place`, sited exactly where someone would reach for a private
regex. That is the same defence `rules.md` describes for `classify.sh`, where
four private copies in one project drifted apart and spent six stories
returning probe artifacts as production source. Adequate.

One limit worth stating: nothing MECHANICALLY refuses a second parser. A
future guard could assert that no file outside `lib.sh` matches the shapes
`write_candidates` owns. Not filed - this story has already grown two
neighbours, and the comment plus the single call site is proportionate today.

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

Planned by `bash scripts/plan.sh write HARNESS-010` from `.claude/harness/models.conf`.
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

**DEPARTURE FROM THE PLAN, for this story only.** The plan puts RED on
`fable` because a partitioned contract exists, and one does (C-1..C-6).
RED is dispatched on **Opus 5** anyway, and the reason is specific to this
phase rather than to the model in general: this RED's first task is not
writing assertions, it is driving a CI round trip - push a cross-comparison,
dispatch the workflow, wait, read the disagreement list back - because the
authoring machine wedges on it (C-6).

That is precisely where the one measured `fable` dispatch fell down.
HARNESS-008's R-1 return produced a correct two-line change and then
RETURNED WHILE ITS OWN PROBE WAS STILL RUNNING, leaving `scripts/doctor.sh`
mutated and no output recorded. The code was right; seeing a long-running
job through was not.

**Success condition, and it can come out either way.** If this dispatch
completes the CI cross-comparison and pastes the disagreement list into the
handoff without the orchestrator intervening, the departure was justified
and the plan should grow a rule about phases that own a remote round trip.
If it ALSO returns mid-run, then the HARNESS-008 failure was not about the
model at all, the departure bought nothing, and the plan's row stands
unamended. Record the verdict here when RED ends.

**Resolved:**

| RED | `test-developer` | **Opus 5** | the declared departure above; `model:` in the agent file says `opus` and no override was reported to the agent |

**Verdict on the departure, recorded by RED as the section asks.** The dispatch
drove the remote round trip to completion: two CI runs (`35892904034`, the
cross-comparison; `35895157454`, the RED gate run), each polled to `completed`
before anything was written down, and the disagreement list is pasted above. It
did not return mid-run.

**But that is weak evidence for the departure, and saying so is the point.** The
success condition was written as a two-way test, and only one of its two branches
was actually exercised: nothing here shows that `fable` *would* have returned
early, because `fable` was not run. The honest reading is that this dispatch is
ONE observation consistent with the hypothesis and not a comparison — the same
defect `rules.md` records about "the default model" being compared against
itself. If the plan grows a rule about phases that own a remote round trip, it
should grow it from a controlled pair, not from this.

<!-- One line per dispatch, as it happened: phase, agent, the model that
     actually ran, and — if a phase was planned for one model and ran on
     another — what that changed. A choice with no verdict is folklore. -->
## Design notes

<!-- Filled by the Lead Designer for user-facing stories: layout, states,
     tokens, accessibility requirements. Omit for non-UI stories. -->

## Test plan

**Two levels, and the split is not stylistic.** The hook can only ever report the
role of the ONE candidate it denies first, so a criterion about *every operand
carrying its role* is not falsifiable through the hook. It is falsifiable one
layer down, where the parser's whole answer is visible.

| Level | File | Assertions | What only this level can falsify |
|---|---|---|---|
| unit | `.claude/tests/lib.test.sh` | **+58** | the role of every operand, the verdict line, the candidate SET |
| integration | `.claude/tests/phase-guard.test.sh` | **+100** | the verdict, the path named, the role line in the message, the decline log |

No end-to-end level: the phase lock has no user-facing path beyond the hook, and
the hook IS the integration point.

### Coverage by criterion

| AC | Where | Assertions | Oracle |
|---|---|---|---|
| AC-1 union corpus | `phase-guard` §"C-1's twenty-two commands under the union rule" | 23 | **settled** — C-1's table read out, verdicts = the max of the two measured columns, the three BOTH WRONG rows held at ALLOW |
| AC-2 `sed` forms | `lib` §AC-2 (24), `phase-guard` §AC-2 (12) | 36 | **mechanical** — 9 named forms pinned exactly, plus the multi-operand and metacharacter shapes the cross-run reddened |
| AC-3 `mv` roles | `lib` §AC-3 (13) + §C-3/PO-5 (3), `phase-guard` §AC-3 (12+9) | 37 | **mechanical** — 6 `-t` spellings, roles asserted per operand |
| AC-4 decline log | `phase-guard` §AC-4 (14), `lib` §AC-4 verdict (11) | 25 | **mechanical** — the marker, the story, the phase, the command, one line; 6 negative controls |
| AC-5 role in a denial | `phase-guard` §AC-5 | 14 | **oracle-free** — see the metric below |
| AC-6 one place | `lib` §AC-6 (1), `phase-guard` §AC-6 (3) | 4 | mechanical half of a criterion the story marks "verified by review" |
| AC-7 floor | `.claude/tests/floors.conf`, `.claude/tests/selftest.test.sh` | — | the executed count, not the call-site count |
| C-6 no new false positives | `phase-guard` §C-6 | 13 | the xA half of the cross-run, turned into must-permit cases |

### AC-5's metric, and why it is independent of the verdict

`## Deferred verifications` names the trap: *a role assertion that fails only
when the verdict ALSO flips is not testing the role, it is testing the verdict a
second time.* No PLANNED measurement of a denial's BODY exists — the probe read
`permissionDecision` and nothing else — so the metric is invented here.

The metric is a **pair of commands that differ only in operand order**:

    mv src/main.ts docs/notes.md   ->  BLOCK  path: src/main.ts  role: source of mv (removed by the move)
    mv docs/notes.md src/main.ts   ->  BLOCK  path: src/main.ts  role: destination of mv

Same verdict. Same path. Different role. Nothing about the verdict can
distinguish them, so an assertion that does distinguish them is reading the
message body and only the message body. The same pair is repeated through `-t`,
where position is no guide at all (`mv -t docs/ src/main.ts` makes the LATE
operand the source).

**The control that fires hard** is AC-5's own: five `assert_no_role` cases — a
redirect, an `rm`, a `touch`, a `sed -i`, a `tee`, each denied on `src/main.ts`
and each required to carry NO `operand:` line. Without them, *"put an operand
line on every denial"* satisfies every positive assertion above. A sixth
assertion pins the role line AFTER `path:`, because 99 existing assertions anchor
on `path:     <p>` and a role inserted in front of it would silently stop them
matching what they believe they match.

### The BOTH WRONG rows are pinned OPEN, deliberately

`cp -t`, `truncate` and `install` each have an assertion demanding they stay
ALLOWED, and `lib.test.sh` pins `cp -t src/ docs/notes.md` to the exact wrong
answer the parser gives today. C-3 and PO-5 make them findings, not criteria;
these assertions are what makes closing one a deliberate act with a story behind
it rather than a side effect of the reconciliation. They go red if GREEN fixes
them.

## Handoff: RED -> GREEN

### Run them

    bash .claude/tests/lib.test.sh            # the parser, asked directly
    bash .claude/tests/phase-guard.test.sh    # the parser, through the hook
    bash scripts/selftest.sh                  # both, plus the floors

**Do not run the full self-test on the authoring machine.** It leaks a `bash`
process per hook spawn; `phase-guard.test.sh` alone did not finish in 600 s here,
and `lib.test.sh` takes 2m06s. Every number in this section was measured on
`ubuntu-latest`, run `35896945945` (`gh workflow run gates.yml --ref <branch>`),
where all nineteen suites run in ~45 s.

**Which timings are local and which are CI.** The two suite RESULTS are CI's.
One local timing exists and is reported for calibration only: a foreground run of
the new `phase-guard.test.sh` on the authoring machine (Windows, Git Bash)
finished in **53m08s** and returned `241 passed, 47 failed` — byte-identical to
CI's counts. So the numbers are not a runner artefact, and the 70x gap is process
spawn, exactly as `gates.yml` documents for `windows-latest`.

`bash scripts/gates.sh --fast` was run and reports all five gates
`UNCONFIGURED` with `BOOTSTRAPPED=no`, which is PO-1: this repository is the
harness template, not a project with a stack, and the instrument that judges this
story is `scripts/selftest.sh` as a step of `gates.yml`. So `--fast` says nothing
here, in either direction, and the CI run above is the evidence.

### The failure, and why it is the right one

    lib:         139 passed, 58 failed
    phase-guard: 241 passed, 47 failed
    2 of 19 harness suite(s) FAILED.

**All 188 pre-existing `phase-guard` assertions and all 139 pre-existing `lib`
assertions still pass** — 241 = 188 + 53 and 139 = 139 + 0, so no failure below
is a regression this RED introduced.

Every one of the 58 new `lib` assertions fails, and they fail on the absence of
the function rather than on an error:

    FAIL write_candidates is a function, not an inline pipeline
         expected: function
         actual:

    FAIL -i
         expected: W | src/main.ts
         actual:   <no output>

    FAIL -n is a read
         expected: -
         actual:   <no output>

    FAIL AC-3 control: the same token is a SOURCE when it comes first
         expected: W | docs/notes.md :: destination of mv | src/main.ts :: source of mv (removed by the move)
         actual:   <no output>

    FAIL a bare redirect emits a candidate but is not a write-capable command
         expected: - | /dev/null
         actual:   <no output>

`<no output>` is `write_candidates` returning 127. Note the second and third: a
"yields no target" control renders `-`, not the empty string, so it is red too.
**No assertion in this suite passes vacuously against a function that is not
there** — which is unusual for a RED, and is the reason the negative-control
table below carries measured numbers rather than claims.

The 47 new `phase-guard` failures are the disagreements, through the hook:

    FAIL blocks: C-1 r10 DIFFER: mv a frozen source away, which upstream permits
         not blocked at all
    FAIL blocks: -t DIR separate
         not blocked at all
    FAIL role: src/main.ts moved AWAY is a source, removed by the move
         not blocked at all, so there is no denial to read a role line from
    FAIL a write command with no visible operand is traced
         expected to contain: no-candidate
         actual:
    FAIL lib.sh defines write_candidates
         expected to contain: write_candidates()
         actual:               #!/usr/bin/env bash
    FAIL the hook no longer carries its own extractor pipeline
         expected NOT to contain: grep -oE '\bsed\b
         actual:                   #!/usr/bin/env bash

### The export shape the tests already pin

This is fact, not suggestion: a test already calls it.

**`.claude/hooks/lib.sh` gains one function.**

    write_candidates <masked-command>

* **Input**: `mask_shell_quotes` output. One argument. `lib.test.sh` masks
  before calling, exactly as `phase-guard.sh` does.
* **Output, on stdout**: a verdict line, then zero or more candidate lines.
  * verdict: `W` or `-`, **always present, always first** (C-4, amended at RED).
    `W` iff the command is WRITE-CAPABLE AS INVOKED. For `tee`, `cp`, `mv`,
    `rm` and `touch` that is the name at a real token boundary. For `sed` it
    is the name AND an in-place option: a read-only `sed` is `-`, not `W`.
    A redirect operator alone does not set it.

    CORRECTED BY THE ORCHESTRATOR AT GREEN. This block previously read `W`
    iff the command NAMES one of the six, which contradicts two assertions
    RED had already frozen - `lib.test.sh:523-524` pin `sed -n '1,5p'
    src/main.ts` and `sed 's/a/b/' src/main.ts` at `-`, under a comment
    saying the verdict means "never write-capable rather than
    write-capable-with-nothing-found". The feature-developer implemented
    the TESTS and flagged the prose, which is the right order.

    Reproduced by the orchestrator before accepting it: both commands name
    `sed`, so the old wording makes them `W`, and the frozen assertions say
    `-`. The two cannot both hold. This is a defect in the prose of an
    amendment RED made to this block, NOT a change to a criterion - AC-4
    speaks of a command "the parser classifies as a write", and a read-only
    `sed` simply is not one. No `## Amendments` entry is owed.
  * candidate: `TARGET` or `TARGET<TAB>ROLE`. **Target first** — `phase-guard.sh`
    filters with `grep -vE '^\s*$|^-|\*|^/dev/'` and every one of those anchors
    assumes the line starts with the path.
* **The three role strings, verbatim.** They appear in assertions character for
  character; they are not free text:

      source of mv (removed by the move)
      destination of mv
      destination of cp

  `sed -i`, `tee`, `rm`, `touch` and redirect candidates carry **no** role, and
  five `assert_no_role` assertions fail if one is invented for them.
* **Order is NOT pinned.** `wcand()` sorts under `LC_ALL=C` before comparing.
* **Nothing consults the filesystem**: `sed -i -f script.sed src/main.ts` must
  judge `src/main.ts` whether or not `script.sed` exists, and `src/a.ts` in
  `rm -f src/a.ts src/b.ts` does not exist in the fixture.

**`.claude/hooks/phase-guard.sh`.**

* Calls `write_candidates`; `assert_not_contains` fails if the inline
  `grep -oE '\bsed\b…` chain survives.
* Splits `TARGET<TAB>ROLE` **before** `resolve_vars`, before the `$EXEMPT`
  membership test and before `path_is_implausible` — `$EXEMPT` is an exact string
  compare against the resolved `scripts/mutate.sh` FILE argument, and a role left
  on the string would silently un-exempt the one diagnostic the harness itself
  requires in RED.
* `check_path <path> [role]` emits the role as **one line immediately after
  `path:`**, never before and never inside it:

      path:     src/main.ts
      operand:  source of mv (removed by the move)
      category: source

  `path:` keeps its exact spelling, indent and position. 99 assertions match
  `path:     <p>` followed by a space or end of string, and `assert_role` fails
  explicitly if `operand:` appears before `path:`.
* `no_candidate <command>` appends **one** line to
  `.claude/state/phase-guard-declined.log` when the verdict is `W` and the
  filtered candidate list is empty. It must contain the marker `no-candidate`,
  the story id, the phase, and enough of the command to act on. It must be
  distinguishable from `decline()`'s `implausible target` line, and the two must
  never both fire for one event.

**What the tests do NOT constrain, so it stays yours:** the internal structure
(one awk or several), the emission order, the exact wording of the
`no-candidate` line beyond the four substrings above, the truncation length, and
whether `write_candidates` keeps a separate scanner or shares one with an
existing helper.

### Build on UPSTREAM's `lib.sh`, not downstream's

The cross-run makes this non-negotiable, and it is the single most load-bearing
sentence here. Six xA failures are things **upstream's `lib.sh` has and
manga-translator's does not**, none of them the parser:

* the here-string masker fix (release 47) — MT reads the 2nd `<` of `<<<` as a
  heredoc opener and goes blind to end of input;
* the unknown-phase refusal — under MT's `lib.sh`, `PHASE=GREE`, `PHASE=ZZZ`,
  `PHASE=GREEN.` and an empty phase all **allow a source write**. "The lock is
  off on a typo."

Port `write_candidates()` INTO upstream's `lib.sh`. Copying downstream's `lib.sh`
over it silently reopens all six.

### Passed on arrival: 53 of the 100 new `phase-guard` assertions

`lib.test.sh` has none. Grouped, with what earns each group:

| Group | n | What earns it |
|---|---|---|
| C-1's 12 agreed-BLOCK rows, 2 agreed-ALLOW rows, r6 (`sed --i`), r13, r13-sharpened | 17 | **the cross-run is the probe.** These pin what the union rule must not LOSE, and xB shows a real alternative implementation failing that set: 219/289 against upstream's own corpus is a live counter-example, not a fixture |
| §C-6, the must-not-refuse set (5 `touch` option-argument rows + 8 others) | 13 | **xA failed exactly these five `touch` rows** — `allows: touch -t, timestamp is not a path`, blocked with `path: 202601010000`. A real parser was watched failing them |
| §AC-3, 3 `-t` rows whose frozen operand is also `$NF` | 3 | paired with the 6 `-t` rows that FAIL; the pair is red |
| §AC-2, 4 redirect rows | 4 | upstream already strips redirects; paired with the 8 AC-2 rows that fail |
| §AC-4, 6 negative controls (log stays empty) | 6 | **vacuous today** — see the table below |
| §AC-4, `implausible target` pair | 2 | `decline()` already exists; the `no-candidate` half of the pair fails |
| §AC-5, 5 `assert_no_role` | 5 | **vacuous today** — no denial carries `operand:` at all |
| §AC-1, 3 BOTH WRONG rows held at ALLOW | 3 | **cannot be probed in RED** — there is nothing to mutate. GATES owns it, third entry under `## Deferred verifications` |

### Negative controls: expected values, and which ones actually ran

The usual RED caveat is inverted here. `lib.test.sh` does **not** fail at import
— a missing function is exit 127, not a dead file — so every `lib` control
EXECUTED and the "measured in RED" column below is a real measurement, taken by
the CI run against the shipped-today tree. The `phase-guard` controls executed
too. What GREEN must confirm is that they still hold once the mechanism exists,
because six of them are green today only because the mechanism is absent.

| Control | AC | Expected once GREEN lands | Measured in RED | Vacuous today? |
|---|---|---|---|---|
| `sed -n '1,5p' tests/guards/layer-imports.test.ts` | AC-2 | `-` | `<no output>` | no — red |
| `sed -n '1,5p' notes-inline.txt` | AC-2 | `-` | `<no output>` | no — red |
| `sed --silent '1,5p' src/main.ts` | AC-2 | `-` | `<no output>` | no — red |
| `sed -i … src/lib/layer-imports.ts` (the hole from the other end) | AC-2 | `W \| src/lib/layer-imports.ts` | `<no output>` | no — red |
| `mv src/main.ts docs/notes.md` vs `mv docs/notes.md src/main.ts` | AC-3/AC-5 | roles swap, verdict does not | `<no output>` both | no — red |
| `cp -t src/ docs/notes.md` | C-3 | `W \| docs/notes.md :: destination of cp` | `<no output>` | no — red |
| `cat src/main.ts` / `grep -rn export src/` / `git diff -- src/main.ts` | AC-4 | `-` | `<no output>` | no — red |
| `git diff > /dev/null` | AC-4 | `- \| /dev/null` | `<no output>` | no — red |
| `touch -t 202601010000 src/main.ts` (skip one word too many) | C-6 | `W \| src/main.ts` | `<no output>` | no — red |
| log after `echo x > docs/notes.md` | AC-4 | empty | empty | **YES** |
| log after `echo x > src/main.ts` | AC-4 | empty | empty | **YES** |
| log after `cat` / `grep` / `git diff` | AC-4 | empty | empty | **YES** (×3) |
| log after `git diff > /dev/null` | AC-4 | empty | empty | **YES** |
| `assert_no_role` ×5 (redirect, rm, touch, sed -i, tee) | AC-5 | denial with no `operand:` line | denial with no `operand:` line | **YES** |
| `truncate` / `install` / `cp -t` stay ALLOW | C-3 | ALLOW | ALLOW | **YES** (×3) |

**The twelve marked YES are claims, not measurements.** They are green because
`no_candidate()` and the role line do not exist, so they would be green against
an implementation that never writes the log and never emits a role. Their
positive halves all fail in RED, so each PAIR is red — but GREEN must re-read
this table after the mechanism lands, because that is the only run in which those
twelve mean anything. Confirming them is GREEN's job; nothing earlier can do it.

### Every file touched

| File | Change |
|---|---|
| `.claude/tests/lib.test.sh` | +58 assertions: `write_candidates()` directly, and the `wcand()` rendering helper |
| `.claude/tests/phase-guard.test.sh` | +100 assertions and three helpers (`assert_role`, `assert_no_role`, `assert_blocked_on_either`, taken from MT's suite) |
| `.claude/tests/floors.conf` | `lib` 139 -> 197, `phase-guard` 188 -> 288, with the reason |
| `.claude/tests/selftest.test.sh` | the floor manifest hard-codes both values in three places; updated to match |
| `docs/backlog/stories/HARNESS-010.md` | this section, `## Test plan`, the C-1/C-4/C-5 notes, the deferred-verification result |

**No production file was touched.** `.claude/hooks/lib.sh` and
`.claude/hooks/phase-guard.sh` are byte-identical to `main`.

### Two floors are deliberately unmet until GREEN

`selftest.sh` will report `lib` and `phase-guard` below their floors. AC-7 asks
for the floor to be RECORDED, and a floor written after the fact is one fitted to
whatever shipped. Expect that failure; it clears when the 105 red assertions go
green. Do not lower them.

### Things found that change the approach

1. **`cp -t` is worse than C-3 says.** C-3 calls it a hole both parsers share.
   `lib.test.sh` pins what the parser actually answers today —
   `W | docs/notes.md :: destination of cp` — so it does not merely MISS the
   destination, it **names the wrong operand and labels it "destination of cp"**.
   The role machinery will make an existing wrong answer legible for the first
   time. Still out of scope; still wants its own story; now with a sharper
   description for it.
2. **A fourth port finding, escalated rather than resolved.** 12 of the 70 xB
   failures are `classify`, not the parser: bare `docs` and bare `tests`
   classify as **source** here because only the trailing-slash forms match.
   manga-translator has a directory-shaped-path rule (its MT-034) that upstream
   lacks, and `refresh-harness.sh` will overwrite it the same way it would have
   overwritten `write_candidates`. **This story does not close it** — `## Out of
   scope` forbids that — but the refresh it unblocks is still not lossless until
   someone does. It needs a story.
3. **AC-6 names a `## Deferred verifications` entry that does not exist.** The
   criterion says "*Verified by review* — see `## Deferred verifications`", and
   that section has three entries, none of them AC-6's. RED did not amend the
   criterion; it pinned the mechanical half in tests (4 assertions) so review
   reads the design question — "does every caller ASK it" — rather than checking
   whether a function exists. Flagging it so the orchestrator can decide whether
   the missing entry matters at REVIEW.
4. **The two BOTH WRONG `sed` rows are not symmetric with the other three.**
   `truncate` and `install` are simply not write-capable names, so they are one
   line of the `isname()` list away from being fixed. `cp -t` needs the same
   argument-reading scan `mv -t` needs. Whoever files the follow-up story should
   know they are two different sizes of change, not three of a kind.

### Rebuilding the cross-comparison, if it is ever wanted again

The branch was throwaway and is deleted. It was a worktree off `main` plus four
files, and the whole thing is reconstructible:

    xcompare/mt/{hooks,tests,harness}/   copies of manga-translator's
                                         lib.sh, phase-guard.sh, _lib.sh,
                                         phase-guard.test.sh, paths.conf,
                                         phases.conf, VERSION
    xcompare/run.sh                      builds A0/xA/B0/xB under mktemp -d by
                                         copying {tests,hooks,harness} from the
                                         chosen side into .claude/, runs
                                         probe-discriminate.sh on all four and
                                         ABORTS unless each reports
                                         `discriminate: 2 passed, 0 failed`,
                                         then runs each phase-guard.test.sh and
                                         prints the FAIL lines
    .github/workflows/xcompare.yml       `on: push`, one ubuntu-latest job

`on: push` rather than `workflow_dispatch`, because a dispatchable workflow must
exist on the DEFAULT branch and this one never should. The counts are read with
one anchored awk, `^<name>: ([0-9]+) passed, ([0-9]+) failed$`, for the reason
`rules.md` gives about `grep '^ci-local:'`.

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

    run:    2026-09-23T19:26:50Z
    commit: 451bc1e
    tree:   a9a1a376735ad103cb2792c8e9ceed72e3a4ece7
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


Filed 2026-09-23, out of the port-before-refresh round that produced releases
47 and 48. That round found three things manga-translator had and upstream did
not; two were additive and shipped the same day. This is the third, and it was
deliberately NOT attempted there.

**Why it was not just done.** The other two were a new branch test in a hook and
a new fingerprint check in `gates.sh` - each landed with its downstream tests
and neither changed a decision procedure. This one replaces the phase lock's
own. Copying either side over the other loses real defences in whichever
direction it is done: upstream's per-word `sed -i` analysis closed a hole that
let `sed -ni` rewrite frozen source, and downstream's role tracking is what lets
a denial say which operand it is talking about. Attempting the merge inside a
port round, with no corpus reconciling the two, is how a parser that refuses
reads and permits writes gets shipped green.

**It blocks a refresh.** `manga-translator` is on a bare-date stamp
(`2026-09-11`, pre-numbering) and cannot be refreshed losslessly until this
lands: `refresh-harness.sh` REPLACES `.claude/hooks/**` and `scripts/*.sh`, so a
refresh today overwrites `write_candidates`, the role machinery and
`no_candidate` with upstream's versions, and takes the downstream suite that
pins them at the same time. That is the H26 shape, and it is the third time this
round has had to be stopped for it.

**The first task is measurement, not design.** Run each suite's cases against
the other's parser and record which fail. Upstream's suite is 188 executed
assertions, downstream's 289, and neither was written from the other's failures
- so that table IS the specification, and it is cheap to produce before anyone
argues about implementation. AC-1's control exists because a case both parsers
already pass proves nothing about the reconciliation.

**Where the two parsers are**, for whoever picks this up:

  * upstream: `.claude/hooks/phase-guard.sh`, the inline `CANDIDATES` block
    (search for `NOREDIR=`), plus its long comment on the nine/eleven shapes;
  * downstream: `manga-translator/.claude/hooks/lib.sh`, `write_candidates()`,
    one awk with `emit`/`emitr`/`allops`/`lastop`, and `no_candidate()` in that
    project's `phase-guard.sh`.

Do not read either as authoritative. They disagree, and the disagreement is the
story.

### PO decisions at PLANNED (2026-09-23)

**PO-1. `required_gates: []`, and the verifier is the self-test.** As for
HARNESS-008: `bash scripts/gates.sh --list` reports every gate `<unconfigured>`
with `BOOTSTRAPPED=no`, because this repository is the harness template rather
than a project with a stack. Naming an unconfigured gate would bind a gate that
runs no command. What fails if this story's artifact breaks is
`bash scripts/selftest.sh`, which `.github/workflows/gates.yml` runs as a step
of the `gates` job, so a red suite fails a required PR check.

Since release 47 that is a sharper instrument than it was: `phase-guard` carries
an assertion floor of 188 in `.claude/tests/floors.conf`, so a reconciliation
that quietly drops assertions fails the run instead of passing faster. This
story will raise that floor deliberately.

**PO-2. No epic, so no done-when to close.** `epic:` is empty.

**PO-3. The PLANNED measurement was taken, and it is a floor rather than the
whole table.** C-1 is a targeted probe of twenty-two commands across both
parsers. The exhaustive form - each suite run against the other's parser - was
attempted and abandoned on a machine limit, not a design one, and is assigned to
RED against CI in `## Deferred verifications`. Recorded as a decision because
the difference matters to whoever reads C-1: it is evidence about the forms it
names, and silent about every form it does not.

**PO-4. The instrument was checked before its output was believed.** The first
probe reported ALLOW for all twenty-two commands, including
`echo x > src/main.ts`, because its JSON escaper was broken - an instrument that
cannot deny anything agreeing perfectly with an instrument that cannot deny
anything. The table in C-1 was taken only after the probe was shown to BLOCK a
frozen-source write and ALLOW a docs write on BOTH parsers. Recorded because
`rules.md` names this exact shape - the instrument is the side with no
discipline pointed at it - and because the broken version's output looked
entirely plausible: twenty-two rows, all agreeing.

**PO-5. Three shapes neither parser catches are findings, not criteria.**
`cp -t`, `truncate` and `install` all write into frozen source and both parsers
permit them. `## Out of scope` already says a shape found during the work is
recorded rather than added, and that is followed here: widening the rule set
inside the reconciliation makes it impossible to attribute a behaviour change to
either cause. They want their own story once this lands.
