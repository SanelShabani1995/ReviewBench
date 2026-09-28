# Minimal adapter

A working skeleton. It satisfies the contract and reports no findings, so you
can prove the plumbing before wiring in your agent.

```sh
docker build -t my-reviewer:dev .
```

Then run it on one pull request from the public showcase, the way the
benchmark will, from the root of this repository:

```sh
scripts/try-agent.sh my-reviewer:dev --pr 0
```

Drop `--pr 0` to run all 25. The script prints what failed, if anything, and
leaves each findings file in `./findings/`.

`agent.sh` has one section marked for replacement. Everything else is the
envelope we expect and can stay as it is.
