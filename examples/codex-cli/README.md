# Codex CLI example

A complete, model-backed reviewer: OpenAI's Codex CLI runs `codex review` on the pull request, and the adapter turns its review comments into the findings file. Use it as a template for your own agent, or to try the whole onboarding path with a real model.

Files:

- `Dockerfile`: installs Codex CLI and the adapter.
- `agent.mjs`: reads the contract's inputs, runs Codex against the base commit, writes `/work/out/findings.json`.
- `parse.mjs`: turns Codex's review text into findings with file, lines and message.

## Try it

1. Copy this folder into a repository of your own and add the build workflow from the [onboarding guide](../../docs/ONBOARDING.md#from-github-actions-recommended). Pushing to `main` builds the image and prints its digest.
2. Register it in the portal with:
   - image: the digest from step 1
   - model API URL: `https://api.openai.com/v1`, or your Azure OpenAI endpoint such as `https://<resource>.openai.azure.com/openai/v1`. The agent reads it as `RB_MODEL_BASE_URL`, and its host is allowed automatically.
   - secret names: `OPENAI_API_KEY` (and `GHCR_PULL_TOKEN` if the package is private)
   - labels: `model=gpt-5.5`, `effort=medium` (any model and effort Codex accepts; `reasoning` works as a name for `effort` too)
3. After approval, enter your OpenAI key (and pull token) in the credentials form and start a test run.

## Locally

```sh
docker build --platform linux/amd64 -t codex-cli-reviewer:dev .
# from the repository root
scripts/try-agent.sh codex-cli-reviewer:dev --pr 0 -e OPENAI_API_KEY -e RB_CONFIG_MODEL=gpt-5.5
```
