#!/usr/bin/env bash
#
# Pin the alerting branch of uptime.yml and heartbeat.yml.
#
# WHY THIS EXISTS. On 2026-08-07 outage alerting was found to have been disabled
# for 17 days. Both workflows said "if an open issue with this label exists, do
# nothing" — a rule with no sense of TIME, so one unclosed issue (#2, opened
# automatically 2026-07-21) muted every subsequent alert. The workflow still went
# red in the Actions tab; nothing ever notified anybody.
#
# The rewrite comments on the open issue instead of staying silent. That branch is
# ONLY EVER EXERCISED WHEN SOMETHING IS ALREADY BROKEN, which is the worst possible
# time to discover a typo in it — so it is tested here rather than trusted.
#
# WHY IT PARSES YAML instead of testing a shared script. The obvious refactor —
# move the shell into scripts/alert-issue.sh and have both workflows call it —
# does not work here, and the reason is worth recording so nobody re-attempts it:
#
#   * heartbeat.yml checks out NOTHING on purpose (see the header of that file);
#     a script on disk would not exist for it to run.
#   * uptime.yml skips checkout on the `workflow_dispatch` + `target` path, which
#     is the documented way to test the alert path with a bogus URL. Extracting
#     the script would break exactly the manoeuvre this code is verified with.
#
# So the shell stays inline in the YAML, and this reads it back out. Extraction is
# fail-loud: if the step or its `run:` block cannot be found the script exits
# non-zero rather than silently testing nothing — a test that cannot fail is the
# thing this repo keeps writing about.
#
# No dependencies beyond bash, awk and jq (jq is preinstalled on ubuntu runners
# and is already required by the workflows themselves).
#
# Run: bash scripts/test-alert-shell.sh
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
FAILED=0

command -v jq >/dev/null || { echo "jq is required"; exit 1; }

# ---------------------------------------------------------------------------
# Pull the `run:` block out of the step whose name starts with "Alert".
# ---------------------------------------------------------------------------
extract_alert_shell() { # $1 = workflow file
  awk '
    # A step header at 6 spaces ends any block we were capturing.
    /^      - name: / { instep = ($0 ~ /^      - name: Alert/); capturing = 0; next }
    instep && /^        run: \|/ { capturing = 1; next }
    capturing {
      if ($0 ~ /^[[:space:]]*$/) { print ""; next }        # keep blank lines
      if ($0 !~ /^          /)   { capturing = 0; instep = 0; next }  # dedented: block over
      sub(/^          /, "")
      print
    }
  ' "$1"
}

# ---------------------------------------------------------------------------
# A stub `gh` that reports which branch was taken. It applies the workflow's OWN
# --jq filter to the fake issue list, because that filter is where the sharpest
# bug lived: without `// empty`, jq's `last` on an empty array yields the literal
# string "null null", which is not empty — so the no-issue-yet path would try to
# comment on issue #null and the FIRST outage would raise nothing at all.
# ---------------------------------------------------------------------------
make_stub() {
  STUB=$(mktemp -d)
  cat >"$STUB/gh" <<'STUBEOF'
#!/usr/bin/env bash
case "$1 $2" in
  "label create")
      # The normal path: the label already exists. Must not abort the alert.
      echo "GraphQL: Name has already been taken (createLabel)"; exit 1 ;;
  "issue list")
      filter=""
      while [ $# -gt 0 ]; do [ "$1" = "--jq" ] && { filter="$2"; break; }; shift; done
      [ -z "$filter" ] && { echo "stub: no --jq passed" >&2; exit 2; }
      printf '%s' "$FAKE_ISSUES" | jq -r "$filter" ;;
  "issue create")
      echo "ACTION=create"
      while [ $# -gt 0 ]; do [ "$1" = "--body" ] && { printf 'BODY:%s\n' "$2"; break; }; shift; done ;;
  "issue comment")
      echo "ACTION=comment num=$3"
      while [ $# -gt 0 ]; do [ "$1" = "--body" ] && { printf 'BODY:%s\n' "$2"; break; }; shift; done ;;
  *) echo "stub: unexpected gh $*" >&2; exit 2 ;;
esac
STUBEOF
  chmod +x "$STUB/gh"
  export PATH="$STUB:$PATH"
}

run_case() { # $1 desc  $2 issues-json  $3 expected  $4 shell
  local desc="$1" expect="$3" out got
  export FAKE_ISSUES="$2"
  out=$(bash -c "$4" 2>&1)
  got=$(grep -oE 'ACTION=(create|comment num=[A-Za-z0-9]+)' <<<"$out" | head -1)
  [ -z "$got" ] && got="ACTION=none"
  if [ "$got" = "$expect" ]; then
    printf '  ok    %-44s %s\n' "$desc" "$got"
  else
    printf '  FAIL  %-44s %s (expected %s)\n' "$desc" "$got" "$expect"
    sed 's/^/          /' <<<"$out"
    FAILED=1
  fi
}

NOW=$(date -u +%s)
iso() { date -u -r "$1" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ; }
RECENT=$(iso $((NOW - 600)))    # 10 minutes ago
STALE_TS=$(iso $((NOW - 86400))) # 24 hours ago

make_stub
export HEALTH_URL="https://example.test/api/health"
export VIEWER_URL="https://example.test/n001/wine"
# Backticked filenames on purpose — see the heartbeat body check below. This is
# the exact shape the check step emits, and the shape that issue #17 lost.
export STALE='- `diagnostics-digest.yml` — **no successful run on record at all** (expected weekly on Mondays)\n'

for wf in uptime heartbeat; do
  file="$ROOT/.github/workflows/$wf.yml"
  sh=$(extract_alert_shell "$file")

  # Fail loud rather than pass vacuously.
  if [ -z "$sh" ] || ! grep -q 'gh issue' <<<"$sh"; then
    echo "FAIL  could not extract the Alert step's run: block from $wf.yml"
    echo "      (renamed step, changed indentation, or the shell moved out of the YAML)"
    FAILED=1
    continue
  fi

  echo "$wf.yml — Alert step"
  # Quiet window: below both workflows' real values, so RECENT is inside it and
  # STALE_TS is outside, whatever those values are set to.
  export ALERT_QUIET_MINUTES=60

  run_case "no open issue -> create the first one" '[]'                                              "ACTION=create"       "$sh"
  run_case "stale open issue -> comment (the #2 bug)" "[{\"number\":2,\"updatedAt\":\"$STALE_TS\"}]" "ACTION=comment num=2" "$sh"
  run_case "recent open issue -> stay quiet"        "[{\"number\":2,\"updatedAt\":\"$RECENT\"}]"     "ACTION=none"         "$sh"
  run_case "several open -> comments on the newest" \
      "[{\"number\":2,\"updatedAt\":\"$STALE_TS\"},{\"number\":5,\"updatedAt\":\"$(iso $((NOW - 43200)))\"}]" \
      "ACTION=comment num=5" "$sh"

  # The stale list is full of `backticked` workflow filenames, and heartbeat's
  # body must still contain them. It did NOT until 2026-08-07: the value was
  # interpolated by Actions with ${{ }} straight into a double-quoted shell
  # string, where backticks are COMMAND SUBSTITUTION — bash ran
  # `diagnostics-digest.yml` as a command, it failed, and the filename was
  # replaced with nothing. Issue #17 shows the damage verbatim:
  #
  #     -  — **no successful run on record at all** (expected weekly on Mondays)
  #
  # i.e. an alert that does not say WHICH check stopped. Passing it through the
  # environment instead fixes it, because parameter expansion of a value never
  # re-runs command substitution on its contents.
  if [ "$wf" = "heartbeat" ]; then
    export FAKE_ISSUES='[]'
    body_out=$(bash -c "$sh" 2>/dev/null)
    if grep -q 'diagnostics-digest\.yml' <<<"$body_out"; then
      printf '  ok    %-44s %s\n' "stale list keeps its \`filenames\`" "backticks not executed"
    else
      printf '  FAIL  %-44s %s\n' "stale list keeps its \`filenames\`" "filename eaten — see issue #17"
      sed 's/^/          /' <<<"$body_out"
      FAILED=1
    fi
  fi

  # NEGATIVE CONTROL. Strip `// empty` and the create path must break. Without
  # this, every assertion above would still pass with the guard deleted, and the
  # test would be describing the fix rather than holding it.
  broken=${sh//last \/\/ empty/last}
  if [ "$broken" = "$sh" ]; then
    echo "  FAIL  negative control: '// empty' guard not found in $wf.yml"
    FAILED=1
  else
    export FAKE_ISSUES='[]'
    if bash -c "$broken" 2>&1 | grep -q "ACTION=create"; then
      echo "  FAIL  negative control: create still happened without '// empty'"
      FAILED=1
    else
      printf '  ok    %-44s %s\n' "negative control: '// empty' is load-bearing" "guard removed -> no issue created"
    fi
  fi
  echo
done

rm -rf "$STUB"
if [ "$FAILED" = "0" ]; then
  echo "alert-shell: all checks passed"
else
  echo "alert-shell: FAILURES — outage alerting is not safe to ship"
  exit 1
fi
