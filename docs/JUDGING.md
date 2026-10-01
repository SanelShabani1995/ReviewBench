# How to judge your findings

Use this pipeline when your reviewer has already produced normalized findings
and you only want to match, classify, and score them. The pipeline accepts one
JSON file or recursively loads every JSON file in a directory.

You choose the LLM judge. The selected model is used for both matching candidate
findings to the golden set and classifying unmatched findings.

## Install

The judging tools require Node.js 20 or newer.

```sh
npm ci
```

## Configure your API key

Set your provider's API key in the environment before running the judge. The
pipeline reads the key through the bundled pi model registry; keys do not belong
in candidate files, command arguments, or the repository.

Common providers include:

| Provider | Environment variable | CLI provider |
|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | `anthropic` |
| OpenAI | `OPENAI_API_KEY` | `openai` |
| Azure OpenAI Responses | `AZURE_OPENAI_API_KEY` | `azure-openai-responses` |
| Google Gemini | `GEMINI_API_KEY` | `google` |
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek` |
| OpenRouter | `OPENROUTER_API_KEY` | `openrouter` |

For example, in bash:

```sh
export OPENAI_API_KEY="<your key>"
```

In PowerShell:

```powershell
$env:OPENAI_API_KEY = "<your key>"
```

You can instead store provider credentials interactively:

```sh
npx pi
# Enter /login and select your provider.
```

See the [pi provider documentation](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/providers.md)
for the full provider list and provider-specific settings.

## Choose a judge model

List the models available with your configured credentials:

```sh
npx pi --list-models
```

Pass the selected provider and model to the ReviewBench pipeline:

```sh
--provider <provider> --model <model-id>
```

The model must support the tool calls used by the matcher and classifier. Judge
choice affects the resulting labels and metrics, so record the exact provider
and model when comparing runs.

## Prepare the input

Candidate files must follow the [judging input format](JUDGING_INPUT.md). PR
identity and commit SHAs must match [`corpus/manifest.json`](../corpus/manifest.json).

Strict validation is enabled by default. It rejects malformed files, candidate
PRs without a golden file, and runs with no overlap with the golden set. Add
`--allow-empty` only for an intentionally empty candidate set.

## Run a smoke test

Start with one PR to verify the API key, model ID, input, and output paths:

```sh
npm run judge -- \
  --candidate ./my-agent-findings \
  --provider openai \
  --model <your-model-id> \
  --output ./scoring/smoke.json \
  --repo-dir ./.reviewbench-repos \
  --limit 1
```

Replace `openai` and `<your-model-id>` with your chosen provider and model.

## Judge the full candidate set

```sh
npm run judge -- \
  --candidate ./my-agent-findings \
  --golden ./golden \
  --manifest ./corpus/manifest.json \
  --provider openai \
  --model <your-model-id> \
  --output ./scoring/results.json \
  --repo-dir ./.reviewbench-repos \
  --concurrency 4
```

Choose concurrency according to your provider's rate limits and budget. Local
judging uses your credentials and incurs your provider's inference cost.

## Resume and inspect results

During a run, `results.checkpoint.json` is updated after each PR. Running the
same command again resumes compatible completed work. A checkpoint created by a
different model or prompt fingerprint is ignored. The checkpoint is removed
after a fully successful run.

The command prints the final summary and writes:

- `scoring/results.json`: aggregate grounded and augmented precision, recall,
  and F1 metrics, plus corpus and evaluator provenance.
- `scoring/results.details.json`: each candidate finding, its judge decision,
  golden matches, and per-PR metrics.
- `scoring/results.checkpoint.json`: resumable intermediate state while a run
  is incomplete.

Grounded metrics compare against the original golden findings. Augmented
metrics also credit unmatched findings that your selected LLM judge classifies
as valid.
