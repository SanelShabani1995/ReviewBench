/**
 * Combining the verdicts of several judges into one.
 *
 * A council profile lists N judge models. Each judge runs the matcher and the
 * classifier on its own; this module folds their answers together per
 * finding so the scorer sees one verdict, exactly as it does with one judge.
 *
 * Rules (the "majority" combination):
 *   - every golden target supported by a strict majority of responding judges
 *     is retained; no retained target means the candidate is novel;
 *   - true/false positive: majority of the judges that answered; a tie goes
 *     to the primary judge (the first in the profile) when it answered, else
 *     to the first judge that did;
 *   - severity and category: not voted; the primary judge's classifier
 *     labels them (the validated label classifier), or the first judge that
 *     answered when the primary did not;
 *   - the true/false justification, scope, difficulty and context are taken
 *     from the judge whose true/false verdict agrees with the outcome,
 *     primary first; the severity and category justifications from the
 *     judge that labelled them.
 * A judge that produced no answer for a finding simply casts no vote. A
 * finding nobody answered has no combined verdict, which the caller treats
 * like a classifier failure.
 */

import type { RawCorrespondence } from "../lib/match-types.js";
import type { ClassifiedFinding } from "./scorer.js";

export type Combination = "majority";

/**
 * One correspondence list per judge, in judge order, → one list where a
 * candidate retains every golden target supported by a strict majority of
 * responding judges. Every candidate index gets an entry.
 */
export function combineCorrespondences(
  perJudge: RawCorrespondence[][],
  candidateCount: number,
): RawCorrespondence[] {
  const out: RawCorrespondence[] = [];
  for (let ci = 0; ci < candidateCount; ci++) {
    const votes = perJudge
      .map((list) => list.find((vote) => vote.candidate_index === ci))
      .filter((vote): vote is RawCorrespondence => vote !== undefined);
    if (votes.length === 0) {
      out.push({ candidate_index: ci, matched_golden_indices: [] });
      continue;
    }

    const targetCounts = new Map<number, number>();
    for (const vote of votes) {
      for (const target of new Set(vote.matched_golden_indices)) {
        targetCounts.set(target, (targetCounts.get(target) ?? 0) + 1);
      }
    }
    const quorum = Math.floor(votes.length / 2) + 1;
    const matchedTargets = [...targetCounts.entries()]
      .filter(([, count]) => count >= quorum)
      .map(([target]) => target)
      .sort((a, b) => a - b);
    out.push({
      candidate_index: ci,
      matched_golden_indices: matchedTargets,
    });
  }
  return out;
}

function plurality<T>(values: T[], tieBreak: T): T {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | undefined;
  let bestCount = 0;
  let tied = false;
  for (const [v, n] of counts) {
    if (n > bestCount) { best = v; bestCount = n; tied = false; }
    else if (n === bestCount) tied = true;
  }
  if (best === undefined) return tieBreak;
  if (tied) {
    // Several answers share the top count; the tie-breaker wins if it is one of them.
    return counts.get(tieBreak) === bestCount ? tieBreak : best;
  }
  return best;
}

/**
 * Per finding position, one classification per judge (or undefined when that
 * judge gave none) → the combined classification. The result stops at the
 * first position nobody answered, so its length tells the caller how many
 * findings have a verdict.
 */
export function combineClassifications(
  perJudge: (ClassifiedFinding | undefined)[][],
): ClassifiedFinding[] {
  const positions = Math.max(0, ...perJudge.map((list) => list.length));
  const out: ClassifiedFinding[] = [];
  for (let i = 0; i < positions; i++) {
    // Voters in judge order; index 0 is the primary judge when it answered.
    const voters = perJudge.map((list) => list[i]).filter((c): c is ClassifiedFinding => !!c);
    if (voters.length === 0) break;
    const primary = voters[0];

    const tp_fp = plurality(voters.map((v) => v.tp_fp), primary.tp_fp);

    // Severity and category are not voted on. They come from the primary
    // judge's classifier, the one validated against human labels, so the
    // council changes tp/fp only and the labels stay comparable with the
    // single-judge leaderboard rows.
    const labeler = primary;
    const severity = labeler.severity;
    const category = labeler.category;

    const spokesperson = voters.find((v) => v.tp_fp === tp_fp) ?? primary;

    out.push({
      file: primary.file,
      start_line: primary.start_line,
      end_line: primary.end_line,
      message: primary.message,
      tp_fp,
      severity,
      category,
      scope: spokesperson.scope,
      difficulty: spokesperson.difficulty,
      context_required: spokesperson.context_required,
      tp_fp_justification: spokesperson.tp_fp_justification,
      severity_justification: labeler.severity_justification,
      category_justification: labeler.category_justification,
    });
  }
  return out;
}

export interface CouncilJudgeFindingResult {
  judge_model: string;
  judge_provider?: string;
  matcher_answered: boolean;
  matched_golden_indices: number[];
  classifier_answered: boolean;
  classification: ClassifiedFinding | null;
}

export interface CouncilFindingAudit {
  combination: Combination;
  tie_breaker: "primary-judge";
  primary_judge: string;
  judge_results: CouncilJudgeFindingResult[];
}

export function buildCouncilFindingAudit(
  candidateIndex: number,
  classificationIndex: number | undefined,
  judges: { modelId?: string; provider?: string }[],
  matchVotes: RawCorrespondence[][],
  classificationVotes: ClassifiedFinding[][],
): CouncilFindingAudit {
  return {
    combination: "majority",
    tie_breaker: "primary-judge",
    primary_judge: judges[0]?.modelId ?? "auto",
    judge_results: judges.map((judge, index) => {
      const matcher = matchVotes[index] ?? [];
      const match = matcher.find((vote) => vote.candidate_index === candidateIndex);
      const classification = classificationIndex === undefined
        ? undefined
        : classificationVotes[index]?.[classificationIndex];
      return {
        judge_model: judge.modelId ?? "auto",
        ...(judge.provider ? { judge_provider: judge.provider } : {}),
        matcher_answered: matcher.length > 0,
        matched_golden_indices: match?.matched_golden_indices ?? [],
        classifier_answered: classification !== undefined,
        classification: classification ?? null,
      };
    }),
  };
}
