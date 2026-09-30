# ReviewBench
[![License: MIT](https://img.shields.io/badge/License-MIT-000000?style=for-the-badge)](LICENSE)

ReviewBench is an open, reproducible benchmark for evaluating AI code review systems on real-world pull requests.

For each pull request, the benchmark provides a human-reviewed golden set of code review findings that serves as the ground truth. ReviewBench compares an agent's findings with this reference set to measure how reliably it identifies useful issues while avoiding false positives. Results can also be explored by dimensions such as severity and category.

## What is in the Repository?

- **[The test set: 25 tasks](corpus/test/).** The selected pull
  requests come from 25 repositories and span a broad range of languages,
  repository sizes, change sizes, finding categories, and severities.
- **[The full set: 219 tasks](corpus/manifest.json).** Every pull request the
  leaderboard runs on, with its corresponding findings in [`golden/`](golden/).
- **[Benchmark documentation](docs/METHODOLOGY.md).** How the corpus was
  built, how findings are labeled, and how agents are judged and scored.
- **[Everything a reviewer vendor needs](#run-your-code-review-agent-on-reviewbench).**
  The [agent contract](AGENT_CONTRACT.md), the [Codex CLI example](examples/codex-cli/), a
  [local test script](scripts/try-agent.sh) and the
  [onboarding guide](docs/ONBOARDING.md).
- **[The classifier prompt and supporting script](scripts/classifier/prompts.ts).**
  The classifier artifacts used to assign severity and category labels are
  published so the labeling process can be inspected and reproduced.

The full corpus manifest and all golden findings are public.

### Test Set Distribution

The 25 test set tasks were selected as a representative sample of the full
set. They preserve its mix of major languages, change sizes, and
repository diversity while also covering every finding category and severity
level.

#### Languages

| Language | Test set PRs | Test set share | Full set PRs | Full set share |
|---|---:|---:|---:|---:|
| TypeScript | 5 | 20.0% | 68 | 31.1% |
| Python | 4 | 16.0% | 41 | 18.7% |
| C# | 3 | 12.0% | 25 | 11.4% |
| Go | 3 | 12.0% | 19 | 8.7% |
| JavaScript | 1 | 4.0% | 15 | 6.8% |
| Other languages | 9 | 36.0% | 51 | 23.3% |
| **Total** | **25** | **100%** | **219** | **100%** |

The test set's other languages are Rust, Java, Jupyter Notebook, Kotlin,
PHP, Ruby, Shell, and Swift.

#### PR Change Size

| Added and removed lines | Test set PRs | Test set share | Full set PRs | Full set share |
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

### Full Set Distribution

The full set contains 219 PRs from 187 distinct repositories. No single
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

The [onboarding guide](docs/ONBOARDING.md) is the step-by-step walkthrough.
This section is the overview.

### What you need before you start

| You need | Used for |
|---|---|
| A GitHub account or organisation to own the image on `ghcr.io` | Pushing the image, signing in to the portal |
| A model API key, ideally dedicated and spend-capped | Your agent's inference (you pay for it) |
| Your model API URL, for example `https://api.openai.com/v1` | Registration; its host is allowed through the network proxy |
| A classic GitHub token with only `read:packages`, **if your package is private** | Letting the benchmark pull your image |
| `docker`, `git`, `jq` and `bash` (WSL on Windows) | Trying your image locally |
| A display name, configuration labels (for example `model`, `effort`), secret names and a contact | The registration form |

The full checklist, including decisions to make up front, is in
[step 0 of the guide](docs/ONBOARDING.md#0-prepare).

### The path, end to end

| # | Step | Where | Done when |
|---|---|---|---|
| 1 | [Wrap your agent](docs/ONBOARDING.md#1-wrap-your-agent) in a container that satisfies [the contract](AGENT_CONTRACT.md). Start from [`examples/codex-cli`](examples/codex-cli/). | Your repository | Your adapter writes a findings file and exits 0 |
| 2 | [Build and push](docs/ONBOARDING.md#2-build-and-push-your-image) to GitHub Container Registry | GitHub Actions or your machine | You have `ghcr.io/<you>/<name>@sha256:…` |
| 3 | [Try it locally](docs/ONBOARDING.md#3-try-it-locally) on the 25 test pull requests | Your machine | `passed 25, failed 0` |
| 4 | [Register](docs/ONBOARDING.md#4-register-in-the-portal) on the [website](https://review-bench.ai/submit) | Portal | An onboarding pull request appears in this repository |
| 5 | [Enter credentials](docs/ONBOARDING.md#5-enter-your-credentials) | Portal | Every declared secret is set |
| 6 | [Approval](docs/ONBOARDING.md#6-wait-for-approval): a maintainer merges your onboarding pull request | This repository | Merged, usually within a business day |
| 7 | [Test run](docs/ONBOARDING.md#7-test-run) on the 25 test pull requests, scored by the judge | Portal | Per-PR results you can iterate on |
| 8 | [Tune](docs/ONBOARDING.md#8-tune-on-your-side) on the full set of 219 with the public judge | Your machine | You are happy with a configuration |
| 9 | [Final run](docs/ONBOARDING.md#9-final-run): three rounds over all 219 | Portal | A maintainer publishes your leaderboard row |

Steps 4 and 5 can happen before your onboarding pull request is merged; only
runs wait for approval. There is no monthly cap on runs.

### Try it locally first

[`scripts/try-agent.sh`](scripts/try-agent.sh) runs your image on the test
set the way the benchmark does: one fresh container per pull request, the
same mounts and variables, and the same checks on the findings file. It
fetches each pull request from GitHub.

```sh
git clone https://github.com/review-bench/ReviewBench && cd ReviewBench
export OPENAI_API_KEY=...                                    # the name your agent reads
scripts/try-agent.sh my-reviewer:dev --pr 0 -e OPENAI_API_KEY      # one pull request
scripts/try-agent.sh my-reviewer:dev -e OPENAI_API_KEY             # all 25
scripts/try-agent.sh my-reviewer:dev --set full -e OPENAI_API_KEY  # the full set, all 219
```

- `-e NAME` passes that variable from your shell into the container; the
  value never appears on a command line or in the findings files.
- If your endpoint is not OpenAI, add `-e RB_MODEL_BASE_URL=https://…`.
- A private package needs `docker login ghcr.io` on your machine first.

The script checks format; it does not score. Scores come from a **test run**
in the portal. **Test set scores are not leaderboard scores:** 25 pull
requests show that your adapter works, not how good your agent is. The
leaderboard runs on the full set of 219, which you can score yourself.

### Costs

- **Your agent's inference is yours.** It runs with your credentials, inside
  your container. We never see them, and the model you use is part of what
  the benchmark measures, so we cannot supply it.
- **The judge's cost is covered by us for test and final runs.** Every
  reviewer's results are evaluated with the same judge panel models, at our
  cost. Tuning on the full set on your side uses your own judge calls.

### Credentials

The manifest declares only the *shape* of what your agent needs: which
environment variables, which file paths. Values never go in a pull request or
an issue. You enter them on the website and they are stored in Azure Key
Vault. They travel from the vault straight into your container, are scrubbed
after every run, and are never printed or logged. The runner is destroyed
when the job ends.

- **Use a dedicated key** with a spend cap that you can revoke at any time.
- **Never bake a key into your image.** Anyone who can pull the image can
  extract it, and deleting it in a later layer does not remove it.

If your agent needs no key at all, leave the secrets empty.

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
