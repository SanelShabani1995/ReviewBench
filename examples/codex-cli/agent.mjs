// Example vendor agent: `codex review` (OpenAI Codex CLI) on one pull request,
// per ../../AGENT_CONTRACT.md.
//
// Reads the checkout at /work/repo, points Codex at the review base commit,
// parses the review comments Codex prints, and writes the findings file.
// OPENAI_API_KEY comes from the vendor's credentials; nothing here prints it.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseReview } from "./parse.mjs";

const env = process.env;
for (const name of ["RB_NWO", "RB_PR_NUMBER", "RB_BASE", "RB_HEAD", "RB_OUT"]) {
  if (!env[name]) { console.error(`agent: missing ${name}`); process.exit(2); }
}
if (!env.OPENAI_API_KEY) { console.error("agent: OPENAI_API_KEY is not set; declare it in the manifest secrets and enter it in the portal"); process.exit(2); }
const repo = env.RB_REPO ?? "/work/repo";
const agent = env.RB_AGENT ?? "codex-cli";
const model = env.RB_CONFIG_MODEL ?? "gpt-5.5";
const effort = env.RB_CONFIG_EFFORT ?? "";

let title = `${env.RB_NWO}#${env.RB_PR_NUMBER}`;
try { title = JSON.parse(readFileSync(env.RB_PR_JSON ?? "/work/pr/pr.json", "utf8")).title || title; } catch { /* keep the default */ }

function writeOutput(findings) {
  writeFileSync(env.RB_OUT, JSON.stringify({
    pr: { repo: `https://github.com/${env.RB_NWO}`, pr_number: Number(env.RB_PR_NUMBER), base: env.RB_BASE, head: env.RB_HEAD },
    agent,
    findings,
  }, null, 2));
}

function run(cmd, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => { stdout += d; process.stderr.write(d); });
    child.stderr.on("data", (d) => { stderr += d; process.stderr.write(d); });
    child.on("error", (error) => resolve({ status: -1, stdout, stderr: `${stderr}\n${error.message}` }));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

// Name the provider explicitly, so Codex authenticates with the API key from
// the environment instead of looking for an interactive login.
const codexHome = join(homedir(), ".codex");
mkdirSync(codexHome, { recursive: true });
writeFileSync(join(codexHome, "config.toml"), [
  `model = "${model}"`,
  `model_provider = "openai_api_key"`,
  ``,
  `[model_providers.openai_api_key]`,
  `name = "OpenAI"`,
  `base_url = "https://api.openai.com/v1"`,
  `env_key = "OPENAI_API_KEY"`,
  `wire_api = "responses"`,
  ``,
].join("\n"));

const responsePath = "/tmp/codex-review.txt";
const args = [
  "exec",
  "--cd", repo,
  // The checkout is discarded after the run and the container is the sandbox;
  // Codex's own sandbox needs kernel features a container may not grant.
  "--dangerously-bypass-approvals-and-sandbox",
  "--ephemeral",
  "--ignore-rules",
  "--output-last-message", responsePath,
  "--model", model,
  ...(effort ? ["-c", `model_reasoning_effort="${effort}"`] : []),
  "review",
  // The base commit itself; writing a branch into the checkout's .git would
  // leave files the next run cannot remove.
  "--base", env.RB_BASE,
  "--title", title,
];
console.error(`agent: codex review of ${env.RB_NWO}#${env.RB_PR_NUMBER} with ${model}${effort ? ` (${effort})` : ""}`);
const result = await run("codex", args, { cwd: repo, env });
if (result.status !== 0) {
  console.error(`agent: codex exited with ${result.status}`);
  process.exit(1);
}
let response = "";
try { response = readFileSync(responsePath, "utf8"); } catch { response = result.stdout; }
const findings = parseReview(response, agent, repo);
writeOutput(findings);
console.error(`agent: ${findings.length} finding(s)`);
