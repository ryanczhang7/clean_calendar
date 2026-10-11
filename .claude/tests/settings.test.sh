#!/usr/bin/env bash
# Do the deny rules in .claude/settings.json still match what the state
# directory actually holds?
#
# `.claude/state/` used to be denied wholesale - `Write(./.claude/state/**)` -
# which was right about the two files that carry evidence and wrong about
# everything else in there. It also covered the two TRACKED documents, so the
# README describing the directory could not be edited by the tools it describes,
# and it covered tool exhaust, so a leftover `mutations/*.bak` - which the
# harness itself treats as a "the restore failed, go and look" signal - could not
# be cleaned up after being acted on.
#
# The rules are now per file, which is more accurate and less durable: a state
# file added later gets no protection until somebody remembers a line, and that
# is a worse failure than the one the narrowing fixed. So it is not left to
# discipline. `.claude/state/README.md` carries a `Hand-editable` column and this
# suite checks the two against each other in BOTH directions.
#
# The checks are a function over a (settings, README) PAIR rather than statements
# about the live files, for one reason: the live files are the only ones a suite
# like this is tempted to assert against, and then every assertion in it passes on
# its first run and forever, whether or not it checks anything. Mutating the real
# settings.json to earn them is not an option either - the runtime reads
# permissions and hooks live, so a suite that edits them mid-run is changing the
# rules it is running under. So `problems` takes a pair, the real pair must produce
# none, and each way of getting it wrong is a fixture that must produce a specific
# one.
#
# Verified separately by probe, since the rules are enforced by the runtime and
# not by anything in this repository: a file-specific `Write(...)`/`Edit(...)`
# deny blocks a Bash append and a Bash `rm` of that exact path, not merely the
# Write and Edit tools. The narrowing gave up nothing on the two files that matter.

. "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

TAB="$(printf '\t')"

# The tools a `no` row must be denied to. Add one here and every `no` row needs a
# matching rule; that is the point, so this list is short and each entry is a
# decision.
#
#   Write, Edit    the two that exist in every build and can write any file.
#   MultiEdit      it edits arbitrary text files, and the phase lock is no
#                  fallback: paths.conf classifies `.claude/state/**` as
#                  `harness` (first matching rule, `.claude/**`) and phases.conf
#                  lets every phase write `harness`, so settings.json is the ONLY
#                  protection these two files have. It does not exist in every
#                  build - it does not exist in the one this was written on, so
#                  the rules could not be probed the way the Write and Edit ones
#                  were - but settings.json's own PreToolUse matcher lists it, so
#                  the harness already expects builds that have it. A rule naming
#                  a tool a build does not have is inert; a missing rule on a
#                  build that has the tool is a hole.
#   NotebookEdit   deliberately absent. It refuses anything that is not a
#                  `.ipynb` before any permission check runs (probed), and
#                  nothing under .claude/state/ is a notebook - phase.sh,
#                  gates.sh, mutate.sh and the guard all write plain text. A rule
#                  for it would be dead weight, and a rule nobody can justify is
#                  one somebody widens back to a glob.
TOOLS="Write Edit MultiEdit"

# rows <readme>   "<path><TAB><yes|no>" per table row.
rows() {
  awk -F'|' '
    /^[[:space:]]*\|/ {
      p = $2; e = $(NF - 1)
      gsub(/^[ \t`]+|[ \t`]+$/, "", p)
      gsub(/^[ \t]+|[ \t]+$/, "", e)
      if (p == "" || p ~ /^-+$/ || tolower(p) == "file") next
      print p "\t" tolower(e)
    }' "$1"
}

# problems <settings> <readme>   One line per disagreement; silence means they
# agree. Every check in this suite is this function on some pair.
problems() {
  local settings="$1" readme="$2" r path editable tool rule has d row denied
  r="$(rows "$readme")"
  [ -n "$r" ] || { printf 'no parseable table in %s\n' "$readme"; return 0; }

  # 1. Every row answers the question. A blank cell is a state file added
  #    without anybody deciding whether hand edits to it are a problem.
  while IFS="$TAB" read -r path editable; do
    [ -n "$path" ] || continue
    case "$editable" in
      yes|no) ;;
      *) printf "%s: hand-editable says '%s'; it must say yes or no\n" "$path" "$editable" ;;
    esac
  done <<< "$r"

  # 2. Forwards: a `no` row is denied for every tool in $TOOLS, a `yes` row for
  #    none of them.
  while IFS="$TAB" read -r path editable; do
    [ -n "$path" ] || continue
    for tool in $TOOLS; do
      rule="\"$tool(./.claude/state/$path)\""
      if grep -qF -- "$rule" "$settings"; then has=1; else has=0; fi
      if [ "$editable" = "no" ] && [ "$has" = 0 ]; then
        printf '%s: not hand-editable, but settings.json has no %s\n' "$path" "$rule"
      elif [ "$editable" = "yes" ] && [ "$has" = 1 ]; then
        printf '%s: hand-editable, but settings.json denies it with %s\n' "$path" "$rule"
      fi
    done
  done <<< "$r"

  # 3. Backwards, and this is the one that catches a re-widened glob: a rule
  #    naming `**`, or a path the README never mentions, is a rule whose reason
  #    has been lost. That is how the directory came to be denied wholesale.
  # The tool alternation is built from $TOOLS rather than written out, so that
  # adding a tool to that list also makes this direction see its rules. Written
  # out, a `MultiEdit(...)` rule for an undocumented path would slip past here
  # while the forwards check was busy demanding it.
  local alt
  alt="$(printf '%s' "$TOOLS" | tr ' ' '|')"
  denied="$(grep -oE "\"($alt)\\(\\./\\.claude/state/[^)]*\\)\"" "$settings" \
    | sed -E 's/^"[A-Za-z]+\(\.\/\.claude\/state\///; s/\)"$//' | sort -u)"
  [ -n "$denied" ] || printf 'settings.json denies nothing under .claude/state/\n'
  while IFS= read -r d; do
    [ -n "$d" ] || continue
    row="$(printf '%s\n' "$r" | awk -F'\t' -v p="$d" '$1 == p { print $2; exit }')"
    case "$row" in
      no) ;;
      yes) printf "denied path '%s' is listed as hand-editable\n" "$d" ;;
      *)   printf "denied path '%s' is not in the README table\n" "$d" ;;
    esac
  done <<< "$denied"
  return 0
}

# HARNESS-047. `git log` and `git diff` are allow-listed as read-only, and both
# take `--output=<file>`, which writes anywhere the user can. The user chose to
# keep the two allows and deny `--output` beside them (deny is evaluated before
# allow). The checker below pins that text, mechanically: which entries, in
# which array, spelled how. It is invisible to `problems` - neither direction
# there sees a `Bash(...)` rule - and `problems` is invisible to it.
#
# The `:*` spelling is wrong mid-pattern: the platform recognises `:*` only at
# the END of a rule, so `Bash(git log:*--output*)` is a rule that looks like a
# deny and matches nothing. That is why every match here is anchored and whole.
GIT_OUTPUT_DENY='Bash(git log *--output*)
Bash(git diff *--output*)'
GIT_OUTPUT_ALLOW='Bash(git diff:*)
Bash(git log:*)'

# array_lines <block> <settings>   Each element of the `"<block>": [` array, one
# per line, trimmed and with its trailing comma removed: the text between the
# line that opens the array and the next line that is only a `]`. No JSON
# parser (rules.md, "Portability"); the file is read as lines, as `problems`
# reads it.
array_lines() {
  awk -v k="\"$1\": [" '
    { sub(/\r$/, "") }
    f && /^[[:space:]]*\]/ { f = 0; next }
    f { s = $0; sub(/^[[:space:]]+/, "", s); sub(/[[:space:]]+$/, "", s)
        sub(/,$/, "", s); print s; next }
    index($0, k) { f = 1 }' "$2"
}

# git_output_rules <settings>   One line per disagreement with HARNESS-047's
# Contract C-1; silence means the deny array carries both `--output` rules and
# the allow array still carries both git prefixes.
git_output_rules() {
  local settings="$1" deny allow rule n
  deny="$(array_lines deny "$settings")"
  allow="$(array_lines allow "$settings")"
  while IFS= read -r rule; do
    n="$(grep -cxF -- "\"$rule\"" <<< "$deny" || true)"
    [ "${n:-0}" -gt 0 ] || printf 'deny has no "%s"\n' "$rule"
  done <<< "$GIT_OUTPUT_DENY"
  while IFS= read -r rule; do
    n="$(grep -cxF -- "\"$rule\"" <<< "$allow" || true)"
    [ "${n:-0}" -gt 0 ] || printf 'allow has no "%s"\n' "$rule"
  done <<< "$GIT_OUTPUT_ALLOW"
  return 0
}

SETTINGS="$REPO_ROOT/.claude/settings.json"
README="$REPO_ROOT/.claude/state/README.md"

# ---------------------------------------------------------------------------
describe "the shipped pair agrees with itself"

assert_eq "no disagreements" "" "$(problems "$SETTINGS" "$README")"

# ---------------------------------------------------------------------------
describe "HARNESS-027 AC-7: the kept failing log has its own row"

# `gate-logs/*.log` already matches `*.failed.log` as a glob, so the check above
# is satisfied without a row. The row says what the file is and who writes it,
# so it is asserted by its own first two cells and its last, as a whole line.
# grep -E rather than downstream's awk reader: no gsub/field-splitting dialect
# to differ between gawk and mawk (HARNESS-025), and no interval expressions.
# failed_row <readme> <path cell>   How many table rows have that path, written
# by scripts/gates.sh, hand-editable yes.
failed_row() {
  local p; p="$(printf '%s' "$2" | sed 's/[.*]/\\&/g')"
  tr -d '\r' < "$1" | grep -cE -- "^\\| \`$p\` +\\| \`scripts/gates\\.sh\` +\\|.*\\| yes +\\|\$"
}
assert_eq "AC-7: README has one gate-logs/*.failed.log row, written by scripts/gates.sh, hand-editable yes" \
  1 "$(failed_row "$README" 'gate-logs/*.failed.log')"
# Control: the same reader finds the row it knows is there, so a miss above is
# the README's and not the reader's.
assert_eq "AC-7 control: the same reader finds the existing gate-logs/*.log row" \
  1 "$(failed_row "$README" 'gate-logs/*.log')"

# ---------------------------------------------------------------------------
describe "the two files that carry evidence stay denied"

# Stated independently of the README, so that widening the column and the rules
# together still fails. current-story.env is written by phase.sh alongside the
# story frontmatter, and the guarantee that those cannot drift holds only while
# nothing else writes it. last-gate-run is what the Stop hook reads to decide
# whether a phase's gate obligation was met, so hand-writing RESULT=pass into it
# forges exactly what law 3 exists to prevent.
for f in current-story.env last-gate-run; do
  for tool in $TOOLS; do
    if grep -qF -- "\"$tool(./.claude/state/$f)\"" "$SETTINGS"; then
      _ok "$tool(./.claude/state/$f) is denied"
    else
      _bad "$tool(./.claude/state/$f) is denied" "it is not in settings.json"
    fi
  done
done

# ---------------------------------------------------------------------------
describe "each way of getting it wrong produces its own complaint"

FIX="$(make_fixture)"
trap 'rm -rf "$FIX"' EXIT

# The baseline pair: small, correct, and the thing each case below breaks by one
# edit. Generated from $TOOLS rather than written out, so that adding a tool to
# that list does not leave every fixture here quietly wrong - which is exactly
# what happened when MultiEdit was added, and is the reason these are functions.
#
# settings_for <tool>...   A deny block protecting both files for exactly these
# tools, and nothing else.
settings_for() {
  { printf '{ "permissions": { "deny": [\n'
    local first=1 f t
    for f in current-story.env last-gate-run; do
      for t in "$@"; do
        [ "$first" = 1 ] || printf ',\n'
        first=0
        printf '  "%s(./.claude/state/%s)"' "$t" "$f"
      done
    done
    printf '\n] } }\n'
  } > "$FIX/settings.json"
}
good_settings() { settings_for $TOOLS; }

# deny_also <rule>   One more deny entry on top of whatever is there, so a case
# says "the baseline, plus this one wrong thing".
deny_also() {
  awk -v r="$1" '
    /^\] \} \}$/ { print ",\n  \"" r "\""; print; next }
    { print }' "$FIX/settings.json" > "$FIX/s.tmp" && mv "$FIX/s.tmp" "$FIX/settings.json"
}
good_readme() {
  cat > "$FIX/README.md" <<'EOF'
| File | Written by | Read by | Hand-editable |
|---|---|---|---|
| `current-story.env` | `scripts/phase.sh` | the phase guard | no |
| `last-gate-run` | `scripts/gates.sh` | the stop hook | no |
| `gate-logs/*.log` | `scripts/gates.sh` | you, when a gate fails | yes |
EOF
}
p() { problems "$FIX/settings.json" "$FIX/README.md"; }

good_settings; good_readme
assert_eq "the baseline pair agrees" "" "$(p)"

# A state file added, with nobody deciding what it is.
good_settings; good_readme
printf -- '| `new-thing` | `scripts/x.sh` | somebody | |\n' >> "$FIX/README.md"
assert_contains "an unanswered column" "new-thing: hand-editable says ''" "$(p)"

# A file declared protected, with no rule behind the declaration. This is the
# drift the per-file rules invite, and the reason this suite exists.
good_settings; good_readme
printf -- '| `secrets.env` | `scripts/x.sh` | the hooks | no |\n' >> "$FIX/README.md"
assert_contains "a no row with no rule" "secrets.env: not hand-editable, but settings.json has no" "$(p)"

# A rule dropped from under a file that still says it is protected.
good_readme
good_settings
awk '!/last-gate-run/ || !/Write/' "$FIX/settings.json" > "$FIX/s.tmp" && mv "$FIX/s.tmp" "$FIX/settings.json"
assert_contains "a dropped rule" 'last-gate-run: not hand-editable, but settings.json has no "Write' "$(p)"

# A rule nobody can explain, on a file the README says is fine to touch.
good_settings; good_readme
deny_also 'Write(./.claude/state/gate-logs/*.log)'
assert_contains "a yes row that is denied anyway" \
  "gate-logs/*.log: hand-editable, but settings.json denies it" "$(p)"

# The glob, back. This is what the narrowing undid, and nothing else in the
# suite would notice it returning: `**` satisfies no row, so it is caught by the
# backwards check rather than the forwards one.
good_settings; good_readme
deny_also 'Write(./.claude/state/**)'
assert_contains "a re-widened glob" "denied path '**' is not in the README table" "$(p)"

# Nothing protected at all.
good_readme
printf '{ "permissions": { "deny": [ "Read(./.env)" ] } }\n' > "$FIX/settings.json"
out="$(p)"
assert_contains "no protection at all" "denies nothing under .claude/state/" "$out"
assert_contains "and it says which files wanted it" "current-story.env: not hand-editable" "$out"

# A table that is not a table.
good_settings
printf 'There used to be a table here.\n' > "$FIX/README.md"
assert_contains "an unparseable README" "no parseable table" "$(p)"

# $TOOLS is load-bearing in both directions, not decoration, and this pair of
# cases is what made adding MultiEdit a one-line change once its rules existed:
# a tool IN the list demands rules for it, a tool absent from the list demands
# nothing. Stated without naming the shipped list, so it stays true whatever that
# list becomes - the earlier version asserted "the shipped list does not demand
# MultiEdit yet" and went stale the moment the rules landed.
good_readme
settings_for Write Edit
out="$(TOOLS="Write Edit MultiEdit" p)"
assert_contains "a tool in the list demands rules for it" \
  'current-story.env: not hand-editable, but settings.json has no "MultiEdit' "$out"
assert_contains "for every protected file" \
  'last-gate-run: not hand-editable, but settings.json has no "MultiEdit' "$out"
assert_eq "a tool absent from the list demands nothing" "" "$(TOOLS="Write Edit" p)"

# And the backwards direction sees those tools too, which is why the alternation
# is built from the list. Hardcoded to Write|Edit, a MultiEdit rule for an
# undocumented path would slip past this direction while the forwards one was
# busy demanding MultiEdit rules elsewhere.
good_settings; good_readme
deny_also 'MultiEdit(./.claude/state/mystery)'
assert_contains "an undocumented path under a later tool" \
  "denied path 'mystery' is not in the README table" "$(p)"

# ---------------------------------------------------------------------------
describe "HARNESS-029 AC-6: a surviving mutations/*.new has a row, and the paragraph says what it means"

# mutate.sh builds the mutated text in a `.new` beside the backup. After
# HARNESS-029 it removes it on every path it can run code on, so one that
# survives means the run was killed outright - and it arrives with its `.bak`.
# The row is matched whole, like AC-7's above: path, writer, a read-by cell
# that says nothing reads it, hand-editable yes. grep -E, no interval
# expressions (HARNESS-025: CI's awk and grep dialects differ from this host's).
# new_row <readme>   How many table rows say that.
new_row() {
  tr -d '\r' < "$1" | grep -cE -- '^\| `mutations/\*\.new` +\| `scripts/mutate\.sh` +\| nothing[^|]*\| yes +\|$'
}
assert_eq "AC-6: README has one mutations/*.new row, written by scripts/mutate.sh, read by nothing, hand-editable yes" \
  1 "$(new_row "$README")"
# Control: the reader finds the row it is looking for in a table that has it,
# so a miss above is the README's and not a mis-escaped pattern.
printf -- '| File | Written by | Read by | Hand-editable |\n|---|---|---|---|\n| `mutations/*.new` | `scripts/mutate.sh` | nothing | yes |\n' > "$FIX/new-row.md"
assert_eq "AC-6 control: the same reader finds a row written to the AC" 1 "$(new_row "$FIX/new-row.md")"

# mutations_para <readme>   The paragraph that opens "`mutations/` is", joined
# onto one line. No `exit` in the awk: it reads to the end rather than leave a
# writer behind it.
mutations_para() {
  awk '{ sub(/\r$/, "") }
       f == 1 && /^$/ { f = 2 }
       f == 0 && /^`mutations\/` is/ { f = 1 }
       f == 1 { printf "%s ", $0 }' "$1"
}
para="$(mutations_para "$README")"
assert_contains "AC-6: the mutations/ paragraph is found" '`mutations/` is' "$para"
assert_contains "AC-6: the mutations/ paragraph names a surviving .new" ".new" "$para"
assert_contains "AC-6: and says it means the run was killed outright" "killed outright" "$para"

# ---------------------------------------------------------------------------
describe "HARNESS-047: git log and git diff stay allowed, and their --output is denied"

# AC-1 and AC-2 on the live file. Red until GREEN appends the two C-1 lines to
# the deny array: today it prints the two `deny has no` lines.
assert_eq "AC-1/AC-2: the live settings.json denies git log/diff --output and still allows git log/diff" \
  "" "$(git_output_rules "$SETTINGS")"

# AC-3: fixture copies OF THE LIVE FILE, never hand-written, so that every
# other line in them is the shipped one. Before GREEN the live file lacks the
# C-1 lines, so a compliant copy is built by inserting them; after GREEN it
# already has them. `edit_array` therefore first DROPS both and then ADDS what
# a case wants, which yields the same text either side of GREEN.
#
# edit_array <file> <block> add|drop <rule>   In place. `add` appends "<rule>"
# as the last element of that array, giving the element before it a comma;
# `drop` removes the element that is exactly "<rule>", and the element left
# last loses its comma. Indented six spaces, as the live file's elements are.
edit_array() {
  awk -v k="\"$2\": [" -v op="$3" -v r="\"$4\"" '
    { sub(/\r$/, "") }
    f && /^[[:space:]]*\]/ {
      if (op == "add") {
        if (last != "") { if (last !~ /,$/) last = last ","; print last }
        print "      " r
      } else if (last != "") { sub(/,$/, "", last); print last }
      last = ""; f = 0; print; next
    }
    f {
      t = $0; sub(/^[[:space:]]+/, "", t); sub(/[[:space:]]+$/, "", t); sub(/,$/, "", t)
      if (op == "drop" && t == r) next
      if (last != "") { if (last !~ /,$/) last = last ","; print last }
      last = $0; next
    }
    index($0, k) { f = 1 }
    { print }' "$1" > "$1.tmp" && mv "$1.tmp" "$1"
}
# without_c1   $FIX/live.json: the live file with neither C-1 line.
without_c1() {
  tr -d '\r' < "$SETTINGS" > "$FIX/live.json"
  edit_array "$FIX/live.json" deny drop 'Bash(git log *--output*)'
  edit_array "$FIX/live.json" deny drop 'Bash(git diff *--output*)'
}
# compliant   $FIX/live.json: the live file as C-1 says it must end up.
compliant() {
  without_c1
  edit_array "$FIX/live.json" deny add 'Bash(git log *--output*)'
  edit_array "$FIX/live.json" deny add 'Bash(git diff *--output*)'
}
g() { git_output_rules "$FIX/live.json"; }

# Controls first: the checker is silent on the copy C-1 describes, and so on
# the shape GREEN must produce. Passes today, as a fixture.
compliant
assert_eq "AC-3 control: a copy with both C-1 lines appended to deny produces nothing" "" "$(g)"
# The same copy with CRLF line endings: a checkout that converts them must not
# turn every anchored match into a miss.
sed 's/$/\r/' "$FIX/live.json" > "$FIX/crlf.json"
assert_eq "AC-3 control: the same copy with CRLF endings produces nothing" \
  "" "$(git_output_rules "$FIX/crlf.json")"
# The copy with neither line is what the live file is today: both complaints,
# deny log first, and nothing about allow.
without_c1
assert_eq "AC-1 control: a copy with neither C-1 line names both, and nothing else" \
  'deny has no "Bash(git log *--output*)"
deny has no "Bash(git diff *--output*)"' "$(g)"

# (a) one deny line removed, each way round.
compliant
edit_array "$FIX/live.json" deny drop 'Bash(git diff *--output*)'
assert_eq "AC-3a: a copy missing the git diff deny names exactly that rule" \
  'deny has no "Bash(git diff *--output*)"' "$(g)"
compliant
edit_array "$FIX/live.json" deny drop 'Bash(git log *--output*)'
assert_eq "AC-3a: a copy missing the git log deny names exactly that rule" \
  'deny has no "Bash(git log *--output*)"' "$(g)"

# (b) the `:*` spelling, which the docs recognise only at the end of a rule.
without_c1
edit_array "$FIX/live.json" deny add 'Bash(git log:*--output*)'
edit_array "$FIX/live.json" deny add 'Bash(git diff *--output*)'
assert_eq "AC-3b: a deny spelled Bash(git log:*--output*) is a miss, named once" \
  'deny has no "Bash(git log *--output*)"' "$(g)"

# (c) the right strings in the wrong array: an allow is not a deny.
without_c1
edit_array "$FIX/live.json" allow add 'Bash(git log *--output*)'
edit_array "$FIX/live.json" allow add 'Bash(git diff *--output*)'
assert_eq "AC-3c: both deny strings moved into allow name both, and nothing else" \
  'deny has no "Bash(git log *--output*)"
deny has no "Bash(git diff *--output*)"' "$(g)"

# AC-2's half: option B keeps the allows. Removing either is option A, and the
# checker names it - so a checker that never read the allow array fails here.
compliant
edit_array "$FIX/live.json" allow drop 'Bash(git diff:*)'
assert_eq "AC-2: a copy without the git diff allow names exactly that rule" \
  'allow has no "Bash(git diff:*)"' "$(g)"
compliant
edit_array "$FIX/live.json" allow drop 'Bash(git log:*)'
assert_eq "AC-2: a copy without the git log allow names exactly that rule" \
  'allow has no "Bash(git log:*)"' "$(g)"
# ...and an allow moved into deny is still missing from allow.
compliant
edit_array "$FIX/live.json" allow drop 'Bash(git log:*)'
edit_array "$FIX/live.json" deny add 'Bash(git log:*)'
assert_eq "AC-2: the git log allow moved into deny is still named as missing from allow" \
  'allow has no "Bash(git log:*)"' "$(g)"

# C-1's placement, byte for byte: the two lines are the LAST two elements of
# deny, after the MultiEdit entries, six-space indent, comma on the line before
# and none after - which is also what keeps the JSON valid, and nothing else
# here could tell. Red until GREEN.
compliant
if tr -d '\r' < "$SETTINGS" | cmp -s - "$FIX/live.json"; then
  _ok "C-1: settings.json is the live file with exactly the two lines appended to deny"
else
  _bad "C-1: settings.json is the live file with exactly the two lines appended to deny" \
    "$(tr -d '\r' < "$SETTINGS" | diff - "$FIX/live.json")"
fi

summary "settings"
