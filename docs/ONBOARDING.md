# Onboarding a reviewer, step by step

What a vendor does to get a row on the leaderboard. Everything below happens in your own accounts and in the portal; nothing of ours needs to be installed.

## 1. Build your image

- Package your reviewer as a container that follows the [agent contract](../AGENT_CONTRACT.md). The [minimal example](../examples/minimal-agent) is a complete, tiny one.
- Push it to GitHub Container Registry under your own user or organisation: `ghcr.io/<you>/<name>`. Any other registry is not accepted.
- Note the digest (`sha256:…`). The manifest pins the digest, never a tag, so a row can always be traced to the exact bytes it ran.
- Public or private package, your choice. Private is fine; see step 3.

## 2. Register it in the portal

- Sign in with GitHub at the portal and fill the form: display name, provider, image digest, the configuration labels shown on your row (for example `model`, `effort`), the hosts your container needs to reach, and the **names** of the secrets it needs.
- The portal opens a pull request with your manifest in this repository. A maintainer reviews and merges it; that merge is the approval. You can watch it here.

## 3. Enter your credentials

After approval, the portal shows a credentials form for your reviewer. Enter the **values** for the names you declared. They go straight to our Key Vault; we never read them, and they are handed to your container only for the duration of a run.

- `GHCR_PULL_TOKEN`, if your image is private: a GitHub **classic** personal access token with the single scope `read:packages` (fine-grained tokens cannot read packages). Expire it and rotate it as you like; enter the new value in the same form.
- Your model provider's key, under the name your container reads (for example `OPENAI_API_KEY`).
- Credential files, if you declared any, are entered as file contents and mounted at the path you gave.

## 4. Run

- **Test run**: the 25 public pull requests, with per-PR detail, misses and judge votes. Use it to iterate; it is not on the leaderboard.
- **Hill climb**: one pass over all 219 pull requests, totals only.
- **Final run**: three fresh rounds over all 219; the mean becomes your row after a maintainer merges the publication.

Every run pulls your image by digest with your token, runs it with your secrets and your host allowlist, and judges the findings with the same judge as every other row.

## 5. Change something

- New image: add a configuration in the portal with the new digest and labels. No approval needed; each run records which configuration it used.
- New secret value: the credentials form.
- New contact: edit the manifest in a pull request.

## What you cannot do

- Point at an image outside `ghcr.io`, or at a tag.
- Reach hosts you did not declare; the run reports every refused host.
- See the held-back pull requests or their expert findings.
