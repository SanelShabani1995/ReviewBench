# ReviewBench

Score your code review agent on the same pull requests, against the same
expert findings, judged by the same model as every other reviewer on the
[leaderboard](https://review-bench.ai).

## What this asks of you

You already have a code review agent. You are not building one. You are
writing a thin adapter so we can run yours: read one pull request, write one
findings file. For a real open-source reviewer that adapter came to about 90
lines, nearly all of it renaming fields.

Three steps:

1. **Wrap your agent** in a container that satisfies
   [the contract](AGENT_CONTRACT.md). Start from
   [`examples/minimal-agent`](examples/minimal-agent).
2. **Test it yourself** against the 25 public pull requests, below.
3. **Open an onboarding request** using the
   [Onboard an agent](../../issues/new?template=onboard-agent.yml) form.

## Test it yourself first

The public runner bundles 25 pull requests, their frozen repositories, and
the expert findings for them. Nothing is hidden, so you can iterate freely.

```sh
docker pull ghcr.io/review-bench/review-bench:latest

# Unpack the corpus so you can drive your agent over it.
cid=$(docker create ghcr.io/review-bench/review-bench:latest)
docker cp "$cid:/opt/review-bench/repos" ./repos
docker cp "$cid:/opt/review-bench/corpus/showcase/manifest.json" .
docker rm "$cid"

# Score the findings your agent produced.
docker run --rm \
  -e ANTHROPIC_API_KEY \
  -v "$PWD/findings:/work/candidate:ro" \
  -v "$PWD/results:/work/results" \
  ghcr.io/review-bench/review-bench:latest \
  eval --candidate /work/candidate --scoring-profile official-2026-09
```

**Showcase scores are not leaderboard scores.** These 25 pull requests are
public, so a score on them says your adapter works, not how good your agent
is. The leaderboard runs on pull requests you never see.

## What happens after you submit

| Step | Who | What |
|---|---|---|
| 1 | Us | We run your image against one public pull request to confirm the contract holds |
| 2 | Us | A maintainer approves you. This is the only approval needed before you can run |
| 3 | You | Trigger a run whenever you like, up to 10 a month |
| 4 | Us | Your container runs once per pull request across the held-back corpus |
| 5 | Us | Our judge scores every finding, and you get a private report |
| 6 | You | Iterate, then ask to publish a configuration |
| 7 | Us | We measure that configuration fresh over three rounds, and the row appears |

You choose which configuration to publish. You do not choose which run: we
measure it fresh, so a lucky run cannot become a leaderboard row. Your row
shows how many configurations you tested.

## Costs

- **Your agent's inference is yours.** It runs with your credentials, inside
  your container. We never see them, and the model you use is part of what
  the benchmark measures, so we cannot supply it.
- **The judge is ours.** Every reviewer is scored with the same pinned model,
  at our cost.

## Credentials

If your agent needs a key, you declare only its *shape* in the onboarding
form: which environment variables, which file paths. Values never go in a
pull request or an issue; they are collected separately and stored in a
write-only secret store.

They travel from that store straight into your container, are scrubbed after
every run, and are never printed or logged. The runner is destroyed when the
job ends.

Two things we strongly recommend:

- **Use a dedicated key** with a spend cap that you can revoke at any time.
- **Never bake a key into your image.** Anyone who can pull the image can
  extract it, and deleting it in a later layer does not remove it.

If your agent needs no key at all, say so and skip this entirely.

## Questions

Open an issue. For how the benchmark works, see the
[methodology](https://review-bench.ai/#methodology).
