import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { MATCHER_SYSTEM_PROMPT } from "../scripts/eval/matcher.js";
import { CLASSIFIER_SYSTEM_PROMPT } from "../scripts/classifier/prompts.js";
import { renderJudgeSystemPrompt } from "../scripts/eval/prompt-format.js";
import {
  LATEST_OFFICIAL_PROFILE_ID,
  OFFICIAL_2026_07,
  OFFICIAL_2026_09,
  resolveProfile,
  sameModel,
  SCORING_PROFILES,
} from "../scripts/eval/scoring-profiles.js";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * A scoring profile enforces that the harness prompts still hash to the values
 * captured at snapshot time (eval.ts refuses a profiled run otherwise). If the
 * LATEST profile's prompts are edited without minting a new dated profile, the
 * pinned hashes and the source drift apart and reproducers break — so this test
 * fails loudly at that moment, pointing at the fix (add a new profile, don't
 * mutate one). Only the latest profile is checked: older profiles are frozen
 * snapshots and are *expected* to diverge from current source once prompts move.
 */
test("the latest official profile's prompt hashes match the current harness prompts", () => {
  const latest = SCORING_PROFILES[LATEST_OFFICIAL_PROFILE_ID];
  assert.equal(
    sha256(renderJudgeSystemPrompt(CLASSIFIER_SYSTEM_PROMPT)),
    latest.promptHashes.classifier,
    "classifier prompt changed without minting a new scoring profile",
  );
  assert.equal(
    sha256(renderJudgeSystemPrompt(MATCHER_SYSTEM_PROMPT)),
    latest.promptHashes.matcher,
    "matcher prompt changed without minting a new scoring profile",
  );
});

test("official-2026-09 uses only Claude Sonnet 5", () => {
  assert.equal(OFFICIAL_2026_09.judge.model, "claude-sonnet-5");
  assert.equal(OFFICIAL_2026_09.judges, undefined);
  assert.equal(OFFICIAL_2026_09.combination, undefined);
});

test("resolveProfile resolves a dated id and floating aliases", () => {
  assert.equal(resolveProfile(OFFICIAL_2026_07.id).profile.id, OFFICIAL_2026_07.id);
  assert.equal(resolveProfile(OFFICIAL_2026_07.id).viaAlias, false);

  for (const alias of ["latest", "leaderboard", "official"]) {
    const r = resolveProfile(alias);
    assert.equal(r.profile.id, LATEST_OFFICIAL_PROFILE_ID);
    assert.equal(r.viaAlias, true);
  }
});

test("resolveProfile throws on an unknown id", () => {
  assert.throws(() => resolveProfile("official-1999-01"), /Unknown scoring profile/);
});

test("the latest alias points at a registered profile", () => {
  assert.ok(SCORING_PROFILES[LATEST_OFFICIAL_PROFILE_ID]);
});

test("sameModel matches Claude Sonnet 4.6 across provider id spellings", () => {
  const pinned = OFFICIAL_2026_07.judge.model; // "claude-sonnet-4.6"
  // Same underlying model, different provider spellings — must all match.
  for (const id of [
    "claude-sonnet-4.6", // github-copilot
    "claude-sonnet-4-6", // anthropic
    "anthropic.claude-sonnet-4-6", // amazon-bedrock (no region)
    "us.anthropic.claude-sonnet-4-6", // bedrock, us
    "eu.anthropic.claude-sonnet-4-6", // bedrock, eu
    "jp.anthropic.claude-sonnet-4-6", // bedrock, a region pi may add later
    "us-east-1.anthropic.claude-sonnet-4-6", // bedrock, AWS-shaped region id
    "anthropic/claude-sonnet-4-6", // openrouter
  ]) {
    assert.equal(sameModel(id, pinned), true, `expected ${id} to match ${pinned}`);
  }
  // Different models must NOT collide with 4.6.
  for (const id of ["claude-sonnet-4-5", "claude-sonnet-4-5-20250929", "claude-sonnet-4-0"]) {
    assert.equal(sameModel(id, pinned), false, `expected ${id} not to match ${pinned}`);
  }
});
