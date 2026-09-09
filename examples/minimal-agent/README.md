# Minimal adapter

A working skeleton. It satisfies the contract and reports no findings, so you
can prove the plumbing before wiring in your agent.

```sh
docker build -t my-reviewer:dev .
```

Then run it against one pull request from the public showcase:

```sh
docker run --rm \
  -v "$PWD/repos/owner_repo:/work/repo" \
  -v "$PWD/pr:/work/pr:ro" \
  -v "$PWD/out:/work/out" \
  -e RB_NWO=owner/repo -e RB_PR_NUMBER=1 \
  -e RB_BASE=<sha> -e RB_HEAD=<sha> \
  -e RB_AGENT=my-reviewer \
  -e RB_DIFF=/work/pr/diff.patch \
  -e RB_OUT=/work/out/findings.json \
  my-reviewer:dev
```

`agent.sh` has one section marked for replacement. Everything else is the
envelope we expect and can stay as it is.
