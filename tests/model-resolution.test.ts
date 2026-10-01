import assert from "node:assert/strict";
import test from "node:test";

import { resolveModel as resolveClassifierModel } from "../scripts/classifier/classify.js";
import { resolveModel as resolveMatcherModel } from "../scripts/eval/matcher.js";

const models = [
  { provider: "provider-a", id: "shared-model" },
  { provider: "provider-b", id: "shared-model" },
  { provider: "provider-b", id: "shared-model-versioned" },
];
const registry = {
  getAvailable: () => models,
} as never;

test("matcher and classifier resolve only the exact requested provider/model", () => {
  assert.equal(resolveMatcherModel(registry, "provider-a", "shared-model"), models[0]);
  assert.equal(resolveMatcherModel(registry, "provider-a", "shared"), null);
  assert.equal(resolveMatcherModel(registry, "provider-c", "shared-model"), null);

  const config = { provider: "provider-b", modelId: "shared-model" };
  assert.equal(resolveClassifierModel(registry, config), models[1]);
  assert.equal(resolveClassifierModel(registry, { ...config, modelId: "shared" }), null);
  assert.equal(resolveClassifierModel(registry, { ...config, provider: "provider-c" }), null);
});
