import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCouncilFindingAudit,
  combineClassifications,
  combineCorrespondences,
} from "../scripts/eval/council.js";
import { askJudge, JudgeTimeout } from "../scripts/eval/judge-call.js";
import { COUNCIL_2026_09, judgesOf, OFFICIAL_2026_09, resolveProfile, SCORING_PROFILES } from "../scripts/eval/scoring-profiles.js";
import type { ClassifiedFinding } from "../scripts/eval/scorer.js";

const finding = (over: Partial<ClassifiedFinding>): ClassifiedFinding => ({
  file: "a.ts", start_line: 1, end_line: 2, message: "m", tp_fp: "tp", severity: "medium", category: "correctness", ...over,
});

test("combineCorrespondences: retains every target with majority support", () => {
  const judges = [
    [{ candidate_index: 0, matched_golden_indices: [3] }, { candidate_index: 1, matched_golden_indices: [] }],
    [{ candidate_index: 0, matched_golden_indices: [3, 4] }, { candidate_index: 1, matched_golden_indices: [7] }],
    [{ candidate_index: 0, matched_golden_indices: [4] }, { candidate_index: 1, matched_golden_indices: [] }],
  ];
  assert.deepEqual(combineCorrespondences(judges, 3), [
    { candidate_index: 0, matched_golden_indices: [3, 4] }, // each target has two of three votes
    { candidate_index: 1, matched_golden_indices: [] },     // target 7 has only one vote
    { candidate_index: 2, matched_golden_indices: [] },     // nobody answered
  ]);
  assert.deepEqual(combineCorrespondences([judges[1]], 2), [
    { candidate_index: 0, matched_golden_indices: [3, 4] },
    { candidate_index: 1, matched_golden_indices: [7] },
  ]);
  const splitTargets = [
    [{ candidate_index: 0, matched_golden_indices: [] }],
    [{ candidate_index: 0, matched_golden_indices: [8] }],
    [{ candidate_index: 0, matched_golden_indices: [7] }],
  ];
  assert.deepEqual(combineCorrespondences(splitTargets, 1), [
    { candidate_index: 0, matched_golden_indices: [] },
  ]);
  const unanimousTargets = Array.from({ length: 3 }, () => [
    { candidate_index: 0, matched_golden_indices: [3, 4] },
  ]);
  assert.deepEqual(combineCorrespondences(unanimousTargets, 1), [
    { candidate_index: 0, matched_golden_indices: [3, 4] },
  ]);
});

test("combineClassifications: majority on tp/fp; severity and category from the primary classifier, not voted", () => {
  const a = finding({ tp_fp: "tp", severity: "high", category: "security", tp_fp_justification: "a says tp", severity_justification: "a on severity" });
  const b = finding({ tp_fp: "fp", severity: "low", category: "correctness", tp_fp_justification: "b says fp", severity_justification: "b on severity" });
  const c = finding({ tp_fp: "tp", severity: "medium", category: "correctness", tp_fp_justification: "c says tp", severity_justification: "c on severity" });
  const [out] = combineClassifications([[a], [b], [c]]);
  assert.equal(out.tp_fp, "tp");                 // 2 of 3
  assert.equal(out.severity, "high");            // the primary's label, even though c would make "correctness" the majority category
  assert.equal(out.category, "security");
  assert.equal(out.severity_justification, "a on severity");
  assert.equal(out.tp_fp_justification, "a says tp");  // the primary agrees with the outcome, so it speaks

  // The primary is outvoted on tp/fp: tp/fp follows the majority, labels still come from the primary.
  const d = finding({ tp_fp: "tp", severity: "high", category: "security", tp_fp_justification: "d says tp" });
  const e = finding({ tp_fp: "fp", severity: "medium", category: "correctness", tp_fp_justification: "e says fp" });
  const f = finding({ tp_fp: "fp", severity: "low", category: "correctness" });
  const [lost] = combineClassifications([[d], [e], [f]]);
  assert.equal(lost.tp_fp, "fp");
  assert.equal(lost.severity, "high");
  assert.equal(lost.category, "security");
  assert.equal(lost.tp_fp_justification, "e says fp");  // the tp/fp justification comes from the winning side

  // Two voters that disagree: the primary decides tp/fp, severity and category.
  const [two] = combineClassifications([[a], [b], []]);
  assert.deepEqual([two.tp_fp, two.severity, two.category], ["tp", "high", "security"]);

  // Primary abstained: the first judge that answered breaks the tie.
  const [noPrimary] = combineClassifications([[], [b], [c]]);
  assert.deepEqual([noPrimary.tp_fp, noPrimary.severity, noPrimary.tp_fp_justification], ["fp", "low", "b says fp"]);

  // The outcome's spokesperson is the first judge on the winning side.
  const [spoken] = combineClassifications([[b], [a], [c]]);
  assert.equal(spoken.tp_fp, "tp");
  assert.equal(spoken.tp_fp_justification, "a says tp");
});

test("buildCouncilFindingAudit preserves every judge result for database raw_result", () => {
  const judges = [
    { modelId: "claude-sonnet-5", provider: "github-copilot" },
    { modelId: "gpt-5.6-sol", provider: "github-copilot" },
    { modelId: "gemini-3.8-flash", provider: "github-copilot" },
  ];
  const classification = finding({ severity: "high", category: "security" });
  const audit = buildCouncilFindingAudit(
    0,
    0,
    judges,
    [
      [{ candidate_index: 0, matched_golden_indices: [] }],
      [{ candidate_index: 0, matched_golden_indices: [2] }],
      [],
    ],
    [[classification], [], []],
  );

  assert.equal(audit.primary_judge, "claude-sonnet-5");
  assert.equal(audit.tie_breaker, "primary-judge");
  assert.equal(audit.judge_results.length, 3);
  assert.equal(audit.judge_results[0].classification?.severity, "high");
  assert.equal(audit.judge_results[1].classification, null);
  assert.equal(audit.judge_results[2].matcher_answered, false);
});

test("combineClassifications: stops at the first finding nobody answered", () => {
  const x = finding({});
  const out = combineClassifications([[x, x], [x], [x, x, x]]);
  assert.equal(out.length, 3);                      // position 2 has one voter
  const gap = combineClassifications([[x, undefined, x], [x], []]);
  assert.equal(gap.length, 1);                      // position 1 has no voter
  assert.deepEqual(combineClassifications([[], [], []]), []);
});

test("profiles: the council lists three vendors with Sonnet 5 primary; single-judge profiles report one judge", () => {
  assert.deepEqual(judgesOf(COUNCIL_2026_09).map((j) => j.model), ["claude-sonnet-5", "gpt-5.6-sol", "gemini-3.8-flash"]);
  assert.equal(COUNCIL_2026_09.combination, "majority");
  assert.deepEqual(judgesOf(OFFICIAL_2026_09).map((j) => j.model), ["claude-sonnet-5"]);
  assert.equal(COUNCIL_2026_09.promptHashes, OFFICIAL_2026_09.promptHashes);
  assert.equal(resolveProfile("council-2026-09").profile, COUNCIL_2026_09);
  assert.ok(SCORING_PROFILES["council-2026-09"]);
});

test("askJudge: a council judge gets one fresh attempt after an error, then abstains", async () => {
  const log: string[] = [];
  const failThenAnswer = () => {
    let calls = 0;
    return { calls: () => calls, attempt: async () => { calls++; if (calls === 1) throw new Error("Model error: finish_reason: error"); return "ok"; } };
  };
  const once = failThenAnswer();
  assert.equal(await askJudge(once.attempt, { what: "pr#1: classifier a", council: true, log: (m) => log.push(m) }), "ok");
  assert.equal(once.calls(), 2);
  assert.match(log[0], /failed: Model error: finish_reason: error; retrying once/);

  let always = 0;
  const abstained = await askJudge(async () => { always++; throw new Error("Failed to parse"); }, { what: "pr#1: classifier a", council: true, log: (m) => log.push(m) });
  assert.equal(abstained, undefined);
  assert.equal(always, 2);
  assert.match(log[2], /failed again: Failed to parse; abstains/);

  // A lone judge is not retried; its error propagates as before.
  const alone = failThenAnswer();
  await assert.rejects(askJudge(alone.attempt, { what: "pr#1: classifier a", council: false }), /finish_reason/);
  assert.equal(alone.calls(), 1);
});

test("askJudge: a timeout abstains without a retry in a council and throws alone", async () => {
  const never = () => new Promise<string>(() => {});
  let calls = 0;
  const log: string[] = [];
  const out = await askJudge(() => { calls++; return never(); }, { what: "pr#1: matcher a", council: true, timeoutMs: 5, log: (m) => log.push(m) });
  assert.equal(out, undefined);
  assert.equal(calls, 1);
  assert.match(log[0], /did not answer within 0s; abstains/);
  await assert.rejects(askJudge(never, { what: "pr#1: matcher a", council: false, timeoutMs: 5 }), JudgeTimeout);
});
