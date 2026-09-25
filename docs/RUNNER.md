# review-bench-runner

A self-contained Docker image that ships the ReviewBench public showcase
corpus (25 PRs) along with the matching/scoring pipeline. Third parties
use it to evaluate their own AI code review agents and produce a
precision/recall report against a vendor-neutral golden set.

> **Status:** draft / iteration.

## End-to-end in three steps

Everything you need to score an agent ships inside one image — the 25-PR
corpus (minimized git repos), the expert golden findings, and the
matching/scoring pipeline. No ReviewBench account, no `api.github.com`
access, no benchmark source checkout.

**1. Pull the benchmark.**

```sh
docker pull ghcr.io/review-bench/review-bench:latest
```

**2. Run your agent.** This is the only part you own: point your code-review
agent at the 25 bundled PRs and save its findings, one file per PR.
[Driving your agent](#driving-your-agent-step-2-in-detail) walks through
unpacking the PRs and the findings format.

**3. Score against the golden set.**

```sh
mkdir -p findings results
docker run --rm \
    -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
    --user "$(id -u):$(id -g)" \
    -v "$(pwd)/findings:/work/candidate:ro" \
    -v "$(pwd)/results:/work/results" \
    ghcr.io/review-bench/review-bench:latest \
    eval --candidate /work/candidate
```

`results/results.json` now holds your precision, recall, and F1 against a
vendor-neutral golden set. Steps 1 and 3 are identical for every agent and
every vendor — that's what makes the scores comparable.

Bring any LLM credential you like for step 3. Anthropic (shown) is verified
end-to-end; OpenAI and GitHub Copilot have pi SDK integration paths — see
[LLM auth](#llm-auth-for-eval) for verification status. Prefer to build the
image from source instead of pulling it? See [Building locally](#building-locally).

## What's in the image

- **25 showcase PRs** — manifest, picks rationale (`picks.md`), and the
  minimized git repos at
  `/opt/review-bench/repos/<owner>_<repo>/`
- **Golden findings** for those 25 PRs at `/opt/review-bench/golden/`
- **Matching + scoring code** (`scripts/eval/`, `scripts/classifier/`,
  `scripts/lib/`) plus the matcher and classifier prompts
- **Schema reference** for candidate findings at
  `/opt/review-bench/EXTRACTION_OUTPUT.md`

The image does **not** include any extraction harness, agent
orchestration, or scripts unrelated to scoring. Third parties decide how
to drive their own agent against the bundled git repos.

## Driving your agent (step 2 in detail)

Step 2 — running your agent — is the only part you own, and the only part
that differs between vendors. The 25 PRs ship as minimized git repos *inside*
the image, so first extract the corpus to the host:

```sh
cid=$(docker create ghcr.io/review-bench/review-bench:latest)
docker cp "$cid:/opt/review-bench/repos" ./repos                    # 25 minimized git repos
docker cp "$cid:/opt/review-bench/corpus/showcase/manifest.json" . # PR list: nwo, pr_number, base, head
docker cp "$cid:/opt/review-bench/EXTRACTION_OUTPUT.md" .          # findings schema
docker rm "$cid" >/dev/null
```

`manifest.json` has one row per PR with its `nwo` (`owner/repo`),
`pr_number`, and `base`/`head` SHAs. The matching git repo is at
`repos/<owner>_<repo>/` (slashes in `nwo` become underscores). For each PR,
reconstruct exactly the change under review:

```sh
cd repos/<owner>_<repo>
git checkout <base>          # pre-PR state
git diff <base>...<head>     # the change under review
```

Run your agent over that change and write one `ExtractionOutput` JSON per PR
into a single `findings/` directory, named
`<owner>_<repo>_<pr_number>-<head[:8]>.json` (where `<head[:8]>` is the first
8 characters of the manifest row's `head` field; schema in
`EXTRACTION_OUTPUT.md`). That directory becomes `/work/candidate` in step 3.

The runner uses only the bundled corpus, git repos, and golden findings — it
makes **no `api.github.com` calls**. `dataset` and corpus inspection run fine
under `--network=none`; only `eval` needs network, and solely to reach your
chosen LLM provider for the matcher and classifier. (Don't add
`--network=none` to the `eval` command — it will block those LLM calls.)

`results/results.json` holds the score report; `results/results.details.json`
holds per-finding detail.

## Subcommands

```
review-bench dataset
review-bench eval --candidate <path> [--output <path>] [eval flags...]
review-bench help
review-bench help-eval
```

### `dataset`

Prints the bundled corpus stats and on-disk paths. No network, no LLM
auth required. Useful as a self-doc entry point and for confirming what
you're scoring against.

### `eval`

Runs the matcher → classifier → scorer pipeline against your candidate
findings.

| Flag | Default | Notes |
|---|---|---|
| `--candidate <path>` | — | **Required.** Directory of ExtractionOutput JSON files, or a single file. See `EXTRACTION_OUTPUT.md`. |
| `--output <path>` | `/work/results` | `results.json` is written inside. |

Other flags are forwarded to `scripts/eval/eval.ts`. Notable ones:

- `--limit <n>` — score against at most N PRs (for iteration)
- `--concurrency <n>` — concurrent PR scoring
- `--provider <name>` — pin LLM provider (e.g. `anthropic`, `openai`,
  `github-copilot`). Optional; pi auto-detects from configured auth.
- `--model <id>` — pin model ID. Optional.
- `--scoring-profile <id>` — score with a **published leaderboard judge**
  (e.g. `official-2026-07`, or `latest`). This pins the matcher/classifier
  model to the exact one used for that snapshot and errors up front if your
  auth can't serve it, instead of quietly scoring with a different model.
  Run `help-eval` (or `eval --list-profiles`) to see the available profiles.
  Note: the bundled corpus is the 25-PR showcase, so absolute numbers won't
  reproduce the full internal leaderboard — a consistent judge is what makes
  scores comparable, not the corpus.
- `--allow-empty` — allow scoring runs where no candidate findings
  overlap the corpus.

Run `docker run --rm <image> help-eval` for the full upstream surface.

## LLM auth (for `eval`)

ReviewBench is intentionally **vendor-neutral**: the runner does not pin
a provider or model. Bring whichever credential is convenient for you.
The pi SDK auto-detects from:

| Provider | How to provide auth | Notes |
|---|---|---|
| Anthropic | `-e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY"` | Verified end-to-end. |
| OpenAI | `-e OPENAI_API_KEY="$OPENAI_API_KEY"` | Pi-supported; provider routing verified against the OpenAI API (full scoring smoke test pending a live key). |
| GitHub Copilot | mount `~/.pi/agent/auth.json` at `/root/.pi/agent/auth.json` | Pi-supported; not yet smoke-tested by us. **Do not combine with `--user`** (mounted auth.json sits under `/root`, which is unreadable to a non-root user). |

Provider / model choice will produce slightly different matcher
verdicts. Numbers are directly comparable within your own runs (same
provider, same model). For cross-vendor comparisons, agree on a fixed
provider and model up front.

## Mounts

| Host path (example) | Container path | Mode | Used by |
|---|---|---|---|
| `findings/` | `/work/candidate` | `ro` | `eval` reads |
| `results/` | `/work/results` | `rw` | `eval` writes |
| `~/.pi/agent/auth.json` | `/root/.pi/agent/auth.json` | `ro` | optional, for pi-managed providers (do not combine with `--user`) |

When you write to a host-mounted volume, files end up owned by `root`
unless you pass `--user "$(id -u):$(id -g)"`. The `--user` flag is
useful for the Anthropic/OpenAI paths above, but breaks the
`/root/.pi/agent/auth.json` mount path. If you need Copilot auth, run
without `--user` and `chown` the results dir after.

> **Concurrency:** run one `eval` process per container at a time. The
> classifier materializes per-SHA git worktrees under
> `/tmp/review-bench-worktrees` by default (override with
> `REVIEW_BENCH_WORKTREES_DIR`). Two concurrent evals sharing the same
> worktrees dir can race on worktree add/remove and corrupt each
> other's runs.

## Output

```
results/
  results.json          top-level scores: precision/recall/F1
                         (grounded + augmented), per-severity,
                         per-category, run fingerprint
  results.details.json  per-finding detail across all PRs
                         (classification, matched golden index,
                         classifier labels for unmatched findings)
```

The `run fingerprint` in `results.json` records the golden hash, the
matcher prompt hash, and the matcher model — so any two runs of the same
image tag with the same provider/model are directly comparable.

## What's *not* in this image

- No agent harness — third parties drive their own agent against the
  bundled clones.
- No `find-prs` / corpus subsetting / extraction scripts — those are
  upstream tooling for building the benchmark, not for using it.
- No GitHub App orchestration — the public benchmark is offline by
  design.

## Reporting issues

For issues with the bundled corpus, the methodology, the matching/scoring
pipeline, or the image itself, file at this repository.
