import assert from "node:assert/strict";
import test from "node:test";

import { parseMatcherResponse } from "../scripts/eval/matcher.js";

test("matcher rejects unparsable responses instead of fabricating no matches", () => {
  assert.throws(
    () => parseMatcherResponse("I could not produce JSON.", 1, 1),
    /invalid JSON response/,
  );
});

test("matcher rejects incomplete responses", () => {
  assert.throws(
    () => parseMatcherResponse(
      JSON.stringify({
        candidateFindings: [{ index: 0, matchedGoldenIndices: [] }],
      }),
      2,
      1,
    ),
    /omitted candidate findings/,
  );
});

test("matcher accepts one valid entry per candidate", () => {
  assert.deepEqual(
    parseMatcherResponse(
      JSON.stringify({
        candidateFindings: [
          { index: 1, matchedGoldenIndices: [] },
          { index: 0, matchedGoldenIndices: [0] },
        ],
      }),
      2,
      1,
    ),
    [
      { candidate_index: 0, matched_golden_indices: [0] },
      { candidate_index: 1, matched_golden_indices: [] },
    ],
  );
});
