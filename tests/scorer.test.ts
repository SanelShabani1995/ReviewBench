import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregate,
  scorePR,
  type ClassifiedFinding,
  type PRScoringInput,
  type PRScoreResult,
} from "../scripts/eval/scorer.js";

function finding(
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

function approx(actual: number | null, expected: number, message?: string): void {
  if (actual === null) {
    assert.fail(`${message ?? "value"}: expected ${expected}, got null`);
  }
  assert.ok(Math.abs(actual - expected) < 1e-12, `${message ?? "value"}: expected ${expected}, got ${actual}`);
}

function score(input: Partial<PRScoringInput> & Pick<PRScoringInput, "pr_key" | "golden" | "candidate_count">): PRScoreResult {
  return scorePR({
    matched: new Map(),
    unmatched: new Set(),
    covered_golden: new Set(),
    unmatched_classifications: new Map(),
    ...input,
  });
}

test("scorePR counts matched findings and unmatched TP/FP classifications", () => {
  const result = score({
    pr_key: "repo_1-aaaa",
    golden: [
      finding("tp", "high", "security"),
      finding("fp", "low", "documentation"),
    ],
    candidate_count: 4,
    matched: new Map([
      [0, 0],
      [1, 1],
    ]),
    unmatched: new Set([2, 3]),
    covered_golden: new Set([0, 1]),
    unmatched_classifications: new Map([
      [2, finding("tp", "medium", "reliability")],
      [3, finding("fp", "low", "testing")],
    ]),
  });

  const overall = result.metrics.overall;
  assert.equal(overall.candidate_count, 4);
  assert.equal(overall.golden_tp_count, 1);
  assert.equal(overall.matched_count, 2);
  assert.equal(overall.matched_tp_count, 1);
  assert.equal(overall.unmatched_count, 2);
  assert.equal(overall.unmatched_tp_count, 1);
  assert.equal(overall.unmatched_fp_count, 1);
  assert.equal(overall.golden_covered_count, 1);
  approx(overall.grounded_precision, 1 / 2, "grounded precision");
  approx(overall.grounded_recall, 1, "grounded recall");
  approx(overall.augmented_precision, 1 / 2, "augmented precision");
  approx(overall.augmented_recall, 1, "augmented recall");
  approx(overall.novel_tp_yield, 1 / 4, "novel TP yield");
});

test("scorePR reports null precision and recall when denominators are empty", () => {
  const result = score({
    pr_key: "repo_2-bbbb",
    golden: [],
    candidate_count: 0,
  });

  const overall = result.metrics.overall;
  assert.equal(overall.grounded_precision, null);
  assert.equal(overall.grounded_recall, null);
  assert.equal(overall.augmented_precision, null);
  assert.equal(overall.augmented_recall, null);
  assert.equal(overall.novel_tp_yield, null);
  assert.equal(overall.candidate_count, 0);
  assert.equal(overall.golden_tp_count, 0);
});

test("scorePR reports null precision but zero recall when an agent emits no findings", () => {
  const result = score({
    pr_key: "repo_2b-bbbb",
    golden: [finding("tp", "high", "security")],
    candidate_count: 0,
  });

  const overall = result.metrics.overall;
  assert.equal(overall.grounded_precision, null);
  assert.equal(overall.augmented_precision, null);
  assert.equal(overall.novel_tp_yield, null);
  assert.equal(overall.golden_tp_count, 1);
  assert.equal(overall.golden_covered_count, 0);
  assert.equal(overall.grounded_recall, 0);
  assert.equal(overall.augmented_recall, 0);
});

test("scorePR does not let matched golden FPs inflate recall", () => {
  const result = score({
    pr_key: "repo_2c-bbbb",
    golden: [
      finding("tp", "high", "security"),
      finding("fp", "low", "documentation"),
    ],
    candidate_count: 1,
    matched: new Map([[0, 1]]),
    covered_golden: new Set([1]),
  });

  const overall = result.metrics.overall;
  assert.equal(overall.matched_count, 1);
  assert.equal(overall.matched_tp_count, 0);
  assert.equal(overall.golden_covered_count, 0);
  assert.equal(overall.grounded_precision, 0);
  assert.equal(overall.grounded_recall, 0);
  assert.equal(overall.augmented_precision, 0);
  assert.equal(overall.augmented_recall, 0);
});

test("scorePR credits novel TPs only in augmented metrics", () => {
  const result = score({
    pr_key: "repo_2d-bbbb",
    golden: [finding("tp", "high", "security")],
    candidate_count: 1,
    unmatched: new Set([0]),
    unmatched_classifications: new Map([
      [0, finding("tp", "medium", "reliability")],
    ]),
  });

  const overall = result.metrics.overall;
  assert.equal(overall.grounded_precision, null);
  assert.equal(overall.grounded_recall, 0);
  assert.equal(overall.matched_tp_count, 0);
  assert.equal(overall.unmatched_tp_count, 1);
  approx(overall.augmented_precision, 1, "novel TP augmented precision");
  approx(overall.augmented_recall, 1 / 2, "novel TP augmented recall");
  approx(overall.novel_tp_yield, 1, "novel TP yield");
});

test("scorePR treats unclassified unmatched candidates as explicit FP strata", () => {
  const result = score({
    pr_key: "repo_2e-bbbb",
    golden: [finding("tp", "high", "security")],
    candidate_count: 2,
    unmatched: new Set([0, 1]),
    unmatched_classifications: new Map([
      [0, finding("tp", "medium", "reliability")],
    ]),
  });

  const overall = result.metrics.overall;
  assert.equal(overall.unmatched_tp_count, 1);
  assert.equal(overall.unmatched_fp_count, 1);
  assert.equal(overall.unmatched_count, 2);
  approx(overall.augmented_precision, 1 / 2, "missing classification augmented precision");

  const unclassifiedSeverity = result.metrics.by_severity.unclassified;
  assert.equal(unclassifiedSeverity.candidate_count, 1);
  assert.equal(unclassifiedSeverity.unmatched_fp_count, 1);
  assert.equal(unclassifiedSeverity.augmented_precision, 0);

  const unclassifiedCategory = result.metrics.by_category.unclassified;
  assert.equal(unclassifiedCategory.candidate_count, 1);
  assert.equal(unclassifiedCategory.unmatched_fp_count, 1);
  assert.equal(unclassifiedCategory.augmented_precision, 0);
});

test("scorePR computes severity and category strata from matched and unmatched findings", () => {
  const result = score({
    pr_key: "repo_3-cccc",
    golden: [
      finding("tp", "high", "security"),
      finding("fp", "low", "documentation"),
    ],
    candidate_count: 4,
    matched: new Map([
      [0, 0],
      [1, 1],
    ]),
    unmatched: new Set([2, 3]),
    covered_golden: new Set([0, 1]),
    unmatched_classifications: new Map([
      [2, finding("tp", "medium", "reliability")],
      [3, finding("fp", "low", "testing")],
    ]),
  });

  const high = result.metrics.by_severity.high;
  assert.equal(high.candidate_count, 1);
  approx(high.grounded_precision, 1, "high grounded precision");
  approx(high.grounded_recall, 1, "high grounded recall");

  const low = result.metrics.by_severity.low;
  assert.equal(low.candidate_count, 2);
  assert.equal(low.golden_tp_count, 0);
  assert.equal(low.grounded_precision, 0);
  assert.equal(low.grounded_recall, null);
  assert.equal(low.augmented_precision, 0);

  const medium = result.metrics.by_severity.medium;
  assert.equal(medium.matched_count, 0);
  assert.equal(medium.unmatched_tp_count, 1);
  approx(medium.augmented_precision, 1, "medium augmented precision");
  approx(medium.augmented_recall, 1, "medium augmented recall");

  assert.equal(result.metrics.by_category.security.golden_covered_count, 1);
  assert.equal(result.metrics.by_category.documentation.grounded_precision, 0);
  assert.equal(result.metrics.by_category.reliability.unmatched_tp_count, 1);
  assert.equal(result.metrics.by_category.testing.unmatched_fp_count, 1);
});

test("aggregate distinguishes macro averages from micro pooled metrics", () => {
  const oneOfOne = score({
    pr_key: "repo_4-dddd",
    golden: [finding("tp", "high", "security")],
    candidate_count: 1,
    matched: new Map([[0, 0]]),
    covered_golden: new Set([0]),
  });

  const oneOfThree = score({
    pr_key: "repo_5-eeee",
    golden: [finding("tp", "high", "security")],
    candidate_count: 3,
    matched: new Map([[0, 0]]),
    unmatched: new Set([1, 2]),
    covered_golden: new Set([0]),
    unmatched_classifications: new Map([
      [1, finding("fp", "low", "testing")],
      [2, finding("fp", "low", "testing")],
    ]),
  });

  const result = aggregate([oneOfOne, oneOfThree]);

  approx(result.macro.overall.augmented_precision, (1 + 1 / 3) / 2, "macro augmented precision");
  approx(result.micro.overall.augmented_precision, 2 / 4, "micro augmented precision");
  assert.equal(result.macro.overall.candidate_count, 4);
  assert.equal(result.micro.overall.candidate_count, 4);
  assert.equal(result.pr_count, 2);
  assert.equal(result.per_pr.length, 2);
});

test("aggregate handles an empty benchmark slice", () => {
  const result = aggregate([]);

  assert.equal(result.pr_count, 0);
  assert.equal(result.per_pr.length, 0);
  assert.equal(result.macro.overall.grounded_precision, null);
  assert.equal(result.macro.overall.augmented_precision, null);
  assert.equal(result.micro.overall.grounded_precision, null);
  assert.equal(result.micro.overall.augmented_precision, null);
  assert.equal(result.micro.overall.candidate_count, 0);
  assert.equal(result.micro.overall.golden_tp_count, 0);
});
