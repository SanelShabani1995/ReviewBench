import assert from "node:assert/strict";
import test from "node:test";

import { buildUnmatchedClassificationMap } from "../scripts/eval/unmatched-classifications.js";
import { resolveForScoring } from "../scripts/lib/match-types.js";
import type { ClassifiedFinding } from "../scripts/eval/scorer.js";

function classification(
  tp_fp: "tp" | "fp",
  severity: "high" | "medium" | "low",
  category: string,
): ClassifiedFinding {
  return {
    file: "src/app.ts",
    start_line: 1,
    end_line: 1,
    message: `${tp_fp} ${severity} ${category}`,
    tp_fp,
    severity,
    category,
  };
}

test("buildUnmatchedClassificationMap preserves classifier labels by candidate index", () => {
  const map = buildUnmatchedClassificationMap(
    "repo_1-aaaa",
    [2, 5],
    [
      classification("tp", "high", "security"),
      classification("fp", "low", "documentation"),
    ],
  );

  assert.equal(map.get(2)?.tp_fp, "tp");
  assert.equal(map.get(2)?.severity, "high");
  assert.equal(map.get(5)?.tp_fp, "fp");
  assert.equal(map.get(5)?.category, "documentation");
});

test("full eval classification coverage includes duplicate matches recast as unmatched", () => {
  const scoring = resolveForScoring(
    [
      { candidate_index: 0, matched_golden_indices: [0] },
      { candidate_index: 1, matched_golden_indices: [0] },
      { candidate_index: 2, matched_golden_indices: [] },
    ],
    1,
  );
  const unmatchedIndices = [...scoring.unmatched].sort((a, b) => a - b);

  assert.deepEqual(unmatchedIndices, [1, 2]);
  assert.throws(
    () =>
      buildUnmatchedClassificationMap("repo_2-bbbb", unmatchedIndices, [
        classification("tp", "medium", "reliability"),
      ]),
    /classifier returned 1 classifications for 2 unmatched candidate findings/,
  );
});

test("buildUnmatchedClassificationMap fails on missing classifier entries", () => {
  assert.throws(
    () =>
      buildUnmatchedClassificationMap("repo_3-cccc", [4], [
        undefined,
      ]),
    /missing classifier result for unmatched candidate 4/,
  );
});
