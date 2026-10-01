import assert from "node:assert/strict";
import test from "node:test";

import { checkpointFingerprint } from "../scripts/eval/checkpoint-fingerprint.js";

const base = {
  provider: "provider-a",
  modelId: "model-a",
  classifierPrompt: "classifier",
  matcherPrompt: "matcher",
  prKeys: ["repo_1-abcdef12"],
  candidates: [{ pr: { head: "abcdef123456" }, findings: [{ message: "candidate" }] }],
  goldenSets: [{ pr: { head: "abcdef123456" }, findings: [{ message: "golden" }] }],
};

test("checkpoint fingerprint is canonical but changes with judge or evaluated inputs", () => {
  const fingerprint = checkpointFingerprint(base);
  assert.equal(
    checkpointFingerprint({
      ...base,
      candidates: [{ findings: [{ message: "candidate" }], pr: { head: "abcdef123456" } }],
    }),
    fingerprint,
  );
  assert.notEqual(
    checkpointFingerprint({
      ...base,
      candidates: [{ pr: { head: "abcdef123456" }, findings: [{ message: "changed" }] }],
    }),
    fingerprint,
  );
  assert.notEqual(
    checkpointFingerprint({
      ...base,
      goldenSets: [{ pr: { head: "abcdef123456" }, findings: [{ message: "changed" }] }],
    }),
    fingerprint,
  );
  assert.notEqual(checkpointFingerprint({ ...base, modelId: "model-b" }), fingerprint);
});
