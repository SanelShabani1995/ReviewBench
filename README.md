# ReviewBench
[![License: MIT](https://img.shields.io/badge/License-MIT-000000?style=for-the-badge)](LICENSE)

ReviewBench is an open, reproducible benchmark for evaluating AI code review systems on real-world pull requests.

For each pull request, the benchmark provides a human-reviewed golden set of code review findings that serves as the ground truth. ReviewBench compares an agent's findings with this reference set to measure how reliably it identifies useful issues while avoiding false positives. Results can also be explored by dimensions such as severity and category.

## What is in the Repository?

- **[A public corpus of 25 tasks](corpus/showcase/).** The selected pull
  requests come from 25 repositories and span a broad range of languages,
  repository sizes, change sizes, finding categories, and severities.
- **[Benchmark documentation](docs/METHODOLOGY.md).** This includes the
  [methodology](docs/METHODOLOGY.md), [corpus extraction process](docs/EXTRACTION.md),
  and [evaluation harness](docs/HARNESS.md).
- **[The classifier prompt and supporting script](scripts/classifier/prompts.ts).**
  The classifier artifacts used to assign severity and category labels are
  published so the labeling process can be inspected and reproduced.

### Public Corpus Distribution

The 25 public tasks were selected as a representative sample of the full
corpus. They preserve its mix of major languages, change sizes, and
repository diversity while also covering every finding category and severity
level.

#### Languages

| Language | Public tasks | Public share | Full corpus PRs | Full corpus share |
|---|---:|---:|---:|---:|
| TypeScript | 5 | 20.0% | 68 | 31.1% |
| Python | 4 | 16.0% | 41 | 18.7% |
| C# | 3 | 12.0% | 25 | 11.4% |
| Go | 3 | 12.0% | 19 | 8.7% |
| JavaScript | 1 | 4.0% | 15 | 6.8% |
| Other languages | 9 | 36.0% | 51 | 23.3% |
| **Total** | **25** | **100%** | **219** | **100%** |

The public set's other languages are Rust, Java, Jupyter Notebook, Kotlin,
PHP, Ruby, Shell, and Swift.

#### PR Change Size

| Added and removed lines | Public tasks | Public share | Full corpus PRs | Full corpus share |
|---|---:|---:|---:|---:|
| 50 or fewer | 3 | 12.0% | 17 | 7.8% |
| 51-200 | 5 | 20.0% | 40 | 18.3% |
| 201-500 | 5 | 20.0% | 44 | 20.1% |
| 501-1,000 | 5 | 20.0% | 40 | 18.3% |
| More than 1,000 | 7 | 28.0% | 78 | 35.6% |
| **Total** | **25** | **100%** | **219** | **100%** |

#### Finding Severities

| Severity | Findings | Share |
|---|---:|---:|
| High | 37 | 10.3% |
| Medium | 135 | 37.5% |
| Low | 188 | 52.2% |
| **Total** | **360** | **100%** |

#### Finding Categories

| Category | Findings | Category | Findings |
|---|---:|---|---:|
| Correctness | 138 | Reliability | 59 |
| Maintainability | 45 | Testing | 35 |
| Security | 27 | Documentation | 21 |
| Performance | 13 | API architecture | 12 |
| Accessibility | 10 |  |  |

### Full Corpus Distribution

The full corpus contains 219 PRs from 187 distinct repositories. No single
repository dominates the benchmark. The most represented repository contributes
10 PRs, or only 4.6% of the corpus. The corpus covers both common and
long-tail languages as well as changes ranging from small patches to
large-scale updates.

#### Primary PR Types

PR types are inferred from titles and descriptions for coverage analysis;
they are not formal human labels.

| Primary PR type | PRs | Share |
|---|---:|---:|
| Feature | 79 | 36.1% |
| Bug fix | 59 | 26.9% |
| Documentation | 15 | 6.8% |
| Performance | 14 | 6.4% |
| Refactor | 12 | 5.5% |
| Other | 40 | 18.3% |
| **Total** | **219** | **100%** |

## Run your Code Review Agent on ReviewBench

Evaluate your code review agent on the same pull requests, against the same
expert findings, and with the same judge used for every agent on the
[leaderboard](https://review-bench.ai). To participate, you only need a thin
adapter that lets ReviewBench run your existing agent: it reads one pull
request and writes one findings file. One open-source reviewer needed about
90 lines of adapter code, mostly to map field names.

Three steps:

1. **Wrap your agent** in a container that satisfies
   [the contract](AGENT_CONTRACT.md). Start from
   [`examples/minimal-agent`](examples/minimal-agent/).
2. **Test it yourself** against the 25 public pull requests, below.
3. **Register it** on the "Onboard your agent" page of the
   [website](https://review-bench.ai). Everything after that happens there.

### Test it yourself first

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

### Onboarding

Sign in to the [website](https://review-bench.ai) with GitHub and open
"Onboard your agent". You fill in a display name, the image pinned by digest,
the hosts your agent talks to, the names of the secrets it needs, the
configuration labels you want shown, and a contact.

The website opens an onboarding pull request in this repository for you. It
adds a manifest under [`agents/`](agents/) that follows
[the schema](schema/agent-manifest.schema.json); CI validates it with
[`schema/validate-manifest.mjs`](schema/validate-manifest.mjs). A maintainer
merges it. You do not write the manifest or open the pull request yourself.

Credentials are entered on the website, never in the pull request. They are
stored in Azure Key Vault and travel from there straight into your container.
No person reads the values.

### Running

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

### Costs

- **Your agent's inference is yours.** It runs with your credentials, inside
  your container. We never see them, and the model you use is part of what
  the benchmark measures, so we cannot supply it.
- **The judge is ours.** Every reviewer is scored with the same pinned model,
  at our cost.

### Credentials

The manifest declares only the *shape* of what your agent needs: which
environment variables, which file paths. Values never go in a pull request or
an issue. You enter them on the website and they are stored in Azure Key Vault.

They travel from the vault straight into your container, are scrubbed after
every run, and are never printed or logged. The runner is destroyed when the
job ends.

Two things we strongly recommend:

- **Use a dedicated key** with a spend cap that you can revoke at any time.
- **Never bake a key into your image.** Anyone who can pull the image can
  extract it, and deleting it in a later layer does not remove it.

If your agent needs no key at all, leave the secrets empty and skip this
entirely.

### Questions

Open an issue. The
[Onboard an agent](https://github.com/review-bench/ReviewBench/issues/new?template=onboard-agent.yml)
form is a good place to ask about your setup before you register, but it is
not the onboarding path; the website is. For how the benchmark works, see the
[methodology](docs/METHODOLOGY.md).

## Contribution
ReviewBench welcomes contributions, suggestions, and feedback. See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution requirements, the process for disputing golden-set labels, and information about becoming a maintainer.
The benchmark corpus is not currently accepting new pull-request submissions. Instructions will be published in the contribution guide when submissions open.

## Governance
ReviewBench follows a consensus-based governance model:
- [Governance policy](GOVERNANCE.md) — project roles, decisions, appeals, and amendments
- [Maintainers](MAINTAINERS.md) — current project maintainers

## License
The repository is licensed under the [MIT License](LICENSE). The project documents copied from the MVG proposal retain the notices included in those files.
