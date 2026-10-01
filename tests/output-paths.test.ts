import assert from "node:assert/strict";
import test from "node:test";

import { outputSidecarPath } from "../scripts/eval/output-paths.js";

test("output sidecars are distinct with or without a json suffix", () => {
  assert.equal(outputSidecarPath("scoring/results.json", "checkpoint"), "scoring/results.checkpoint.json");
  assert.equal(outputSidecarPath("scoring/results.json", "details"), "scoring/results.details.json");
  assert.equal(outputSidecarPath("scoring/results", "checkpoint"), "scoring/results.checkpoint.json");
  assert.equal(outputSidecarPath("scoring/results", "details"), "scoring/results.details.json");
});
