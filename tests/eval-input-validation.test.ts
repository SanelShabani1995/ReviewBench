import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildEvalInputSummary,
  loadCandidateFindings,
  strictInputProblems,
  type CandidateLoadResult,
} from "../scripts/eval/input-validation.js";

function validCandidate(repo = "https://github.com/acme/widgets", prNumber = 12) {
  return {
    pr: {
      repo,
      pr_number: prNumber,
      base: "base-sha",
      head: "abcdef1234567890",
    },
    findings: [
      {
        producer: "agent",
        file: "src/app.ts",
        start_line: 10,
        end_line: 10,
        message: "Review finding",
        source: {
          type: "agent",
          alignment: "generated",
        },
      },
    ],
    usage: {
      time_in_ms: 500,
    },
  };
}

test("loadCandidateFindings reports malformed and invalid files while loading valid candidates", () => {
  const dir = mkdtempSync(join(tmpdir(), "eval-inputs-"));
  try {
    writeFileSync(join(dir, "candidate-a.json"), JSON.stringify(validCandidate()));
    writeFileSync(join(dir, "candidate-b.json"), JSON.stringify(validCandidate()));
    writeFileSync(join(dir, "malformed.json"), "{");
    writeFileSync(
      join(dir, "invalid.json"),
      JSON.stringify({ pr: { repo: "https://github.com/acme/widgets" }, findings: [] }),
    );
    writeFileSync(join(dir, "notes.txt"), "{");

    const result = loadCandidateFindings(dir);

    assert.equal(result.stats.files_seen, 4);
    assert.equal(result.stats.files_loaded, 2);
    assert.equal(result.stats.findings_loaded, 2);
    assert.equal(result.stats.skipped_malformed_files, 1);
    assert.equal(result.stats.skipped_invalid_files, 1);
    assert.equal(result.byPR.size, 1);
    assert.equal(result.byPR.get("acme_widgets_12-abcdef12")?.findings.length, 2);
    assert.equal(result.byPR.get("acme_widgets_12-abcdef12")?.usage?.time_in_ms, 500);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("buildEvalInputSummary counts golden overlaps and missing golden files", () => {
  const load = candidateLoadResult([
    "acme_widgets_12-abcdef12",
    "acme_widgets_13-fedcba98",
  ]);

  const summary = buildEvalInputSummary(
    load,
    new Set(["acme_widgets_12-abcdef12"]),
    Infinity,
  );

  assert.equal(summary.candidate_files_loaded, 2);
  assert.equal(summary.candidate_prs, 2);
  assert.equal(summary.candidate_findings, 2);
  assert.equal(summary.golden_prs, 1);
  assert.equal(summary.golden_overlaps, 1);
  assert.equal(summary.missing_golden, 1);
  assert.deepEqual(summary.missing_golden_keys, ["acme_widgets_13-fedcba98"]);
  assert.deepEqual(summary.evaluation_keys, ["acme_widgets_12-abcdef12"]);
});

test("strictInputProblems fails on malformed input, invalid input, and missing golden files", () => {
  const load = candidateLoadResult(["acme_widgets_12-abcdef12"]);
  load.stats.skipped_malformed_files = 1;
  load.stats.skipped_invalid_files = 1;
  load.stats.skipped_files = [
    { path: "bad.json", reason: "malformed-json", message: "Unexpected end of JSON input" },
    { path: "wrong.json", reason: "invalid-shape", message: "missing or invalid pr object" },
  ];
  const summary = buildEvalInputSummary(load, new Set(), Infinity);

  const problems = strictInputProblems(summary, load.stats, {
    strict: true,
    allowEmpty: false,
  });

  assert.match(problems.join("\n"), /malformed JSON/);
  assert.match(problems.join("\n"), /invalid candidate JSON/);
  assert.match(problems.join("\n"), /have no golden file/);
  assert.match(problems.join("\n"), /0 PRs overlapping/);
});

test("strictInputProblems allows intentional empty runs only with allow-empty", () => {
  const load = candidateLoadResult([]);
  const summary = buildEvalInputSummary(load, new Set(), Infinity);

  assert.ok(
    strictInputProblems(summary, load.stats, {
      strict: true,
      allowEmpty: false,
    }).length > 0,
  );
  assert.deepEqual(
    strictInputProblems(summary, load.stats, {
      strict: true,
      allowEmpty: true,
    }),
    [],
  );
});

test("strictInputProblems catches all overlaps skipped by limit", () => {
  const load = candidateLoadResult(["acme_widgets_12-abcdef12"]);
  const summary = buildEvalInputSummary(
    load,
    new Set(["acme_widgets_12-abcdef12"]),
    0,
  );

  const problems = strictInputProblems(summary, load.stats, {
    strict: true,
    allowEmpty: false,
  });

  assert.match(problems.join("\n"), /all overlapping candidate PRs were skipped/);
});

function candidateLoadResult(keys: string[]): CandidateLoadResult {
  return {
    byPR: new Map(
      keys.map((key, index) => [
        key,
        {
          pr_key: key,
          pr: {
            repo: "https://github.com/acme/widgets",
            pr_number: index + 1,
            base: "base",
            head: key.split("-").at(-1) ?? "abcdef12",
          },
          findings: validCandidate().findings,
        },
      ]),
    ),
    stats: {
      files_seen: keys.length,
      files_loaded: keys.length,
      findings_loaded: keys.length,
      skipped_malformed_files: 0,
      skipped_invalid_files: 0,
      skipped_files: [],
    },
  };
}
