/**
 * Types for the matching pipeline.
 */

export interface RawCorrespondence {
  candidate_index: number;
  matched_golden_indices: number[];
}

export interface MatchResult {
  pr: {
    repo: string;
    pr_number: number;
    base: string;
    head: string;
  };
  raw_correspondences: RawCorrespondence[];
  candidate_count: number;
  golden_count: number;
}

export interface ScoringInput {
  matched: Set<number>;
  matchedToGolden: Map<number, number>;
  unmatched: Set<number>;
  coveredGolden: Set<number>;
  raw: RawCorrespondence[];
}

export function resolveForScoring(
  correspondences: RawCorrespondence[],
  goldenCount: number,
): ScoringInput {
  const coveredGolden = new Set<number>();
  const claimedGolden = new Map<number, number>();
  const matched = new Set<number>();
  const matchedToGolden = new Map<number, number>();
  const seenCandidates = new Set<number>();

  for (const corr of correspondences) {
    if (seenCandidates.has(corr.candidate_index)) continue;
    seenCandidates.add(corr.candidate_index);

    const validGoldenIndices = [...new Set(corr.matched_golden_indices)]
      .filter((gi) => Number.isInteger(gi) && gi >= 0 && gi < goldenCount)
      .sort((a, b) => a - b);

    if (validGoldenIndices.length === 0) continue;

    for (const gi of validGoldenIndices) {
      coveredGolden.add(gi);
    }

    for (const gi of validGoldenIndices) {
      if (!claimedGolden.has(gi)) {
        claimedGolden.set(gi, corr.candidate_index);
        matched.add(corr.candidate_index);
        matchedToGolden.set(corr.candidate_index, gi);
        break;
      }
    }
  }

  const allCandidates = new Set(correspondences.map((c) => c.candidate_index));
  const unmatched = new Set([...allCandidates].filter((i) => !matched.has(i)));

  return { matched, matchedToGolden, unmatched, coveredGolden, raw: correspondences };
}
