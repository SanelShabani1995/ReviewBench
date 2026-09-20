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
3. **Register it** on the "Onboard your agent" page of the
   [website](https://review-bench.ai). Everything after that happens there.

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

## Onboarding

Sign in to the [website](https://review-bench.ai) with GitHub and open
"Onboard your agent". You fill in a display name, the image pinned by digest,
the hosts your agent talks to, the names of the secrets it needs, the
configuration labels you want shown, and a contact.

The website opens an onboarding pull request in this repository for you. It
adds a manifest under `agents/` that follows
[the schema](schema/agent-manifest.schema.json); CI validates it with
[`schema/validate-manifest.mjs`](schema/validate-manifest.mjs). A maintainer
merges it. You do not write the manifest or open the pull request yourself.

Credentials are entered on the website, never in the pull request. They are
stored in Azure Key Vault and travel from there straight into your container.
No person reads the values.

## Running

Once the manifest is merged, everything runs from the website:

1. **Test run.** Your image runs on the 25 public showcase pull requests. You
   get a result for each pull request, so you can see exactly what your
   adapter produced and fix it.
2. **Hill climbs.** Runs on the held-back set, as many as you like. You see
   aggregate numbers only, never per-PR results, so the held-back set stays
   held back.
3. **Final.** Three rounds on the held-back set with the configuration you
   pick. The final opens a review pull request in this repository. When a
   maintainer merges it, your leaderboard row is published.

There is no monthly cap on runs. You choose which configuration goes to the
final; you do not choose which run, because the final is measured fresh. Your
row shows how many configurations you tested.

## Costs

- **Your agent's inference is yours.** It runs with your credentials, inside
  your container. We never see them, and the model you use is part of what
  the benchmark measures, so we cannot supply it.
- **The judge is ours.** Every reviewer is scored with the same pinned model,
  at our cost.

## Credentials

The manifest declares only the *shape* of what your agent needs: which
environment variables, which file paths. Values never go in a pull request or
an issue. You enter them on the website and they are stored in Azure Key
Vault.

They travel from the vault straight into your container, are scrubbed after
every run, and are never printed or logged. The runner is destroyed when the
job ends.

Two things we strongly recommend:

- **Use a dedicated key** with a spend cap that you can revoke at any time.
- **Never bake a key into your image.** Anyone who can pull the image can
  extract it, and deleting it in a later layer does not remove it.

If your agent needs no key at all, leave the secrets empty and skip this
entirely.

## Questions

Open an issue. The
[Onboard an agent](../../issues/new?template=onboard-agent.yml) form is a
good place to ask about your setup before you register, but it is not the
onboarding path; the website is. For how the benchmark works, see the
[methodology](https://review-bench.ai/#methodology).
