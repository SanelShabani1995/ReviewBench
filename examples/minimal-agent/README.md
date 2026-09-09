# Minimal adapter

A working skeleton. It satisfies the contract and reports no findings, so you
can prove the plumbing before wiring in your agent.

```sh
docker build -t my-reviewer:dev .
```

Then run it against one pull request from the public showcase. With
`repos/` and `manifest.json` unpacked as described in the
[root README](../../README.md#test-it-yourself-first), pick an entry and lay
out the two files the adapter reads:

```sh
entry=$(jq -c '.[0]' manifest.json)      # any entry of the showcase manifest
nwo=$(jq -r .nwo <<<"$entry"); base=$(jq -r .base <<<"$entry"); head=$(jq -r .head <<<"$entry")
mkdir -p pr out
git -C "repos/${nwo/\//_}" diff "$base...$head" > pr/diff.patch
jq '{repo, pr_number, base, head, nwo, title, body}' <<<"$entry" > pr/pr.json
```

Then run the adapter against that pull request:

```sh
docker run --rm \
  -v "$PWD/repos/${nwo/\//_}:/work/repo" \
  -v "$PWD/pr:/work/pr:ro" \
  -v "$PWD/out:/work/out" \
  -e RB_NWO="$nwo" -e RB_PR_NUMBER="$(jq -r .pr_number <<<"$entry")" \
  -e RB_BASE="$base" -e RB_HEAD="$head" \
  -e RB_AGENT=my-reviewer \
  -e RB_DIFF=/work/pr/diff.patch -e RB_PR_JSON=/work/pr/pr.json \
  -e RB_OUT=/work/out/findings.json \
  my-reviewer:dev
```

The repository directory is the pull request's owner and repository joined
with an underscore, which is how the runner image stores it.

`agent.sh` has one section marked for replacement. Everything else is the
envelope we expect and can stay as it is.
