# Onboarding a reviewer, step by step

What a vendor does to get a row on the leaderboard. Everything below happens in your own accounts and in the portal; nothing of ours needs to be installed.

## 1. Build and push your image

Your image follows the [agent contract](../AGENT_CONTRACT.md); the [minimal example](../examples/minimal-agent) is a complete, tiny one to start from. It lives in GitHub Container Registry under your own user or organisation, and we reference it by digest, never by tag.

### From your machine

```bash
# once: log in with a classic token that has write:packages
echo "$GHCR_TOKEN" | docker login ghcr.io -u <your-github-user> --password-stdin

docker build --platform linux/amd64 -t ghcr.io/<you>/<name>:v1 .
docker push ghcr.io/<you>/<name>:v1

# the digest to register
docker inspect --format '{{index .RepoDigests 0}}' ghcr.io/<you>/<name>:v1
# ghcr.io/<you>/<name>@sha256:<64 hex characters>
```

### From GitHub Actions (recommended)

Put this in your image's repository as `.github/workflows/build.yml`. It needs no token of yours: the job pushes with its own.

```yaml
name: Build and push
on:
  push:
    branches: [main]
  workflow_dispatch: {}
permissions:
  contents: read
  packages: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/setup-buildx-action@v3
      - id: build
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ghcr.io/${{ github.repository_owner }}/<name>:${{ github.sha }}
      - run: echo "ghcr.io/${{ github.repository_owner }}/<name>@${{ steps.build.outputs.digest }}" >> "$GITHUB_STEP_SUMMARY"
```

The run summary shows the digest to register.

### Try it before you register

```sh
scripts/try-agent.sh ghcr.io/<you>/<name>@sha256:<digest> --pr 0
```

It runs your image on public pull requests exactly as the benchmark does and
checks the findings file. See [Try it locally](../README.md#try-it-locally-first).

### Public or private

- **Public** package: nothing else to do; we pull it anonymously.
- **Private** package (the default for a new package): create a GitHub **classic** personal access token with the single scope `read:packages` (Settings, Developer settings, Personal access tokens, Tokens (classic); fine-grained tokens cannot read packages). Declare the name `GHCR_PULL_TOKEN` in step 2 and enter the token in step 3.

## 2. Register it in the portal

- Sign in with GitHub at the portal and fill the form: display name, provider, image digest, the configuration labels shown on your row (for example `model`, `effort`), your **model API URL** (its host is allowed automatically; add other hosts only if your agent needs them), and the **names** of the secrets it needs.
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

If the first pull request fails because a host was refused, the run stops there and names the host, so a wrong endpoint costs minutes, not a whole run.

## 5. Change something

- New image: add a configuration in the portal with the new digest and labels. No approval needed; each run records which configuration it used.
- New secret value: the credentials form.
- New contact: edit the manifest in a pull request.

## What you cannot do

- Point at an image outside `ghcr.io`, or at a tag.
- Reach hosts you did not declare; the run reports every refused host.
- See the held-back pull requests or their expert findings.
