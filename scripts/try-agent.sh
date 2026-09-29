#!/usr/bin/env bash
#
# Runs your agent image on the test set (or the full set) exactly the way the
# benchmark does: one fresh container per pull request, the same mounts and
# variables, and the same checks on the findings file. It does not score; a
# test run in the portal does that.
#
#   scripts/try-agent.sh <image> [--set test|full] [--pr <index>] [-e NAME[=VALUE] ...]
#
#   scripts/try-agent.sh my-reviewer:dev --pr 0
#   scripts/try-agent.sh my-reviewer:dev -e OPENAI_API_KEY -e RB_CONFIG_MODEL=gpt-5.5
#   scripts/try-agent.sh my-reviewer:dev --set full -e OPENAI_API_KEY
#
# --set test (the default) runs the 25 pull requests in corpus/showcase.
# --set full runs the full set of 219 in corpus/manifest.json, which exists
# from launch.
#
# Needs docker, git and jq. Findings land in ./findings/<pr key>.json.
set -euo pipefail

usage() { sed -n '8,17p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
[ $# -ge 1 ] || usage
image="$1"; shift
only=""
set_name=test
env_args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --set) set_name="$2"; shift 2 ;;
    --pr) only="$2"; shift 2 ;;
    -e) env_args+=(-e "$2"); shift 2 ;;
    *) usage ;;
  esac
done

here="$(cd "$(dirname "$0")/.." && pwd)"
case "$set_name" in
  test) manifest="$here/corpus/showcase/manifest.json" ;;
  full) manifest="$here/corpus/manifest.json"
    [ -f "$manifest" ] || { echo "no full set at corpus/manifest.json; it is published there at launch" >&2; exit 2; } ;;
  *) usage ;;
esac
work="${TRY_AGENT_WORK:-$PWD/.try-agent}"
out_dir="$PWD/findings"
mkdir -p "$work/repos" "$out_dir"

count=$(jq length "$manifest")
indices=$(if [ -n "$only" ]; then echo "$only"; else seq 0 $((count - 1)); fi)
passed=0; failed=0

for i in $indices; do
  entry=$(jq -c ".[$i]" "$manifest")
  nwo=$(jq -r .nwo <<<"$entry"); pr=$(jq -r .pr_number <<<"$entry")
  base=$(jq -r .base <<<"$entry"); head=$(jq -r .head <<<"$entry")
  key="${nwo/\//_}_${pr}-${head:0:8}"
  repo="$work/repos/${nwo/\//_}"
  echo "== [$i] $nwo#$pr ($key)" >&2

  # A checkout at head with base reachable, like the one the benchmark mounts.
  if [ ! -d "$repo/.git" ]; then
    git init -q "$repo"
    git -C "$repo" remote add origin "https://github.com/$nwo.git"
  fi
  GIT_LFS_SKIP_SMUDGE=1 git -C "$repo" fetch -q --filter=blob:none origin "$base" "pull/$pr/head" \
    || GIT_LFS_SKIP_SMUDGE=1 git -C "$repo" fetch -q --filter=blob:none origin "$base" "$head"
  GIT_LFS_SKIP_SMUDGE=1 git -C "$repo" checkout -q --force --detach "$head"
  git -C "$repo" clean -qfdx

  pr_dir="$work/pr/$key"; out="$work/out/$key"
  rm -rf "$pr_dir" "$out"; mkdir -p "$pr_dir" "$out"
  git -C "$repo" diff "$base...$head" > "$pr_dir/diff.patch"
  jq '{repo, pr_number: (.pr_number | tonumber), base, head, nwo, title, body}' <<<"$entry" > "$pr_dir/pr.json"

  status=0
  docker run --rm --platform linux/amd64 \
    -v "$repo:/work/repo" -v "$pr_dir:/work/pr:ro" -v "$out:/work/out" \
    -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0='*' \
    -e RB_NWO="$nwo" -e RB_PR_NUMBER="$pr" -e RB_BASE="$base" -e RB_HEAD="$head" \
    -e RB_AGENT=try-agent -e RB_REPO=/work/repo \
    -e RB_DIFF=/work/pr/diff.patch -e RB_PR_JSON=/work/pr/pr.json -e RB_OUT=/work/out/findings.json \
    -e RB_ATTEMPT=1 \
    "${env_args[@]}" "$image" || status=$?

  file="$out/findings.json"
  if [ "$status" -ne 0 ]; then
    echo "   FAIL: exit code $status" >&2; failed=$((failed + 1)); continue
  fi
  if ! jq -e . "$file" >/dev/null 2>&1; then
    echo "   FAIL: no valid JSON at RB_OUT" >&2; failed=$((failed + 1)); continue
  fi
  problem=$(jq -r --arg head "$head" --argjson pr "$pr" '
    if .pr.head != $head then "pr.head is not RB_HEAD"
    elif (.pr.pr_number | tonumber? // null) != $pr then "pr.pr_number is not RB_PR_NUMBER"
    elif (.findings | type) != "array" then "findings is not an array"
    else ([.findings[] | select((.file | type) != "string" or (.start_line | type) != "number" or (.end_line | type) != "number" or (.message | type) != "string" or (.file | startswith("./") or startswith("/")))] | length) as $bad
      | if $bad > 0 then "\($bad) finding(s) miss file, start_line, end_line or message, or use a ./ or / path" else "" end
    end' "$file")
  if [ -n "$problem" ]; then
    echo "   FAIL: $problem" >&2; failed=$((failed + 1)); continue
  fi
  cp "$file" "$out_dir/$key.json"
  echo "   ok: $(jq '.findings | length' "$file") finding(s)" >&2
  passed=$((passed + 1))
done

echo "passed $passed, failed $failed; findings in $out_dir" >&2
[ "$failed" -eq 0 ]
