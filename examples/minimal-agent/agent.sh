#!/usr/bin/env bash
#
# A minimal adapter. Copy this, replace the one marked section with a call to
# your own agent, and you are done.
#
# The contract is small on purpose: read one pull request, write one findings
# file, exit zero. See ../../AGENT_CONTRACT.md.
set -euo pipefail

: "${RB_NWO:?}" "${RB_PR_NUMBER:?}" "${RB_BASE:?}" "${RB_HEAD:?}" "${RB_OUT:?}"

agent="${RB_AGENT:-minimal-agent}"
diff_file="${RB_DIFF:-/work/pr/diff.patch}"
pr_json="${RB_PR_JSON:-/work/pr/pr.json}"
repo_dir="${RB_REPO:-/work/repo}"

title=$(jq -r '.title // ""' "$pr_json")
echo "reviewing $RB_NWO#$RB_PR_NUMBER: $title" >&2
echo "diff is $(wc -l < "$diff_file") lines; repo checked out at ${RB_HEAD:0:8}" >&2

# ---------------------------------------------------------------------------
# REPLACE THIS SECTION.
#
# Call your agent however it likes to be called. You have:
#   $diff_file  the change under review
#   $repo_dir   the whole repository at the head commit, with .git
#   $pr_json    title, body, and the commit SHAs
#
# Your credentials arrive as environment variables or as files at the paths
# you declared during onboarding. Read them the way your agent already does.
#
# Produce a JSON array of findings, each with file, start_line, end_line and
# message. This stub emits an empty array, which is a valid review that found
# nothing.
# ---------------------------------------------------------------------------
raw_findings='[]'

# Example of the shape your agent should produce:
#
#   raw_findings=$(your-agent review \
#       --diff "$diff_file" --repo "$repo_dir" --format json)
#
#   [
#     { "file": "src/pool.ts", "start_line": 42, "end_line": 45,
#       "message": "Race condition: conns is read without holding the mutex." }
#   ]

# ---------------------------------------------------------------------------
# Wrap the findings in the envelope we expect. Nothing below needs changing.
# ---------------------------------------------------------------------------
mkdir -p "$(dirname "$RB_OUT")"

if ! jq -e 'type == "array"' <<<"$raw_findings" >/dev/null 2>&1; then
  echo "agent: findings were not a JSON array; refusing to write a bad result" >&2
  exit 1
fi

jq -n \
  --arg agent "$agent" \
  --arg repo "https://github.com/$RB_NWO" \
  --argjson pr_number "$RB_PR_NUMBER" \
  --arg base "$RB_BASE" \
  --arg head "$RB_HEAD" \
  --argjson findings "$raw_findings" '
  {
    pr: { repo: $repo, pr_number: $pr_number, base: $base, head: $head },
    agent: $agent,
    findings: [
      $findings[]
      | select(.file != null and .message != null)
      | {
          producer: $agent,
          file: (.file | sub("^\\./"; "")),
          start_line: (.start_line // 1),
          end_line: (.end_line // .start_line // 1),
          message: .message
        }
    ]
  }' > "$RB_OUT"

echo "agent: wrote $(jq '.findings | length' "$RB_OUT") findings" >&2
