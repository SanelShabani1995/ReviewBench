import type { ClassifiedFinding } from "./scorer.js";

export function buildUnmatchedClassificationMap(
  prKey: string,
  unmatchedCandidateIndices: number[],
  classifications: Array<ClassifiedFinding | undefined>,
): Map<number, ClassifiedFinding> {
  if (classifications.length !== unmatchedCandidateIndices.length) {
    throw new Error(
      `${prKey}: classifier returned ${classifications.length} classifications for ` +
        `${unmatchedCandidateIndices.length} unmatched candidate findings`,
    );
  }

  const result = new Map<number, ClassifiedFinding>();
  for (let i = 0; i < unmatchedCandidateIndices.length; i++) {
    const candidateIndex = unmatchedCandidateIndices[i];
    const classification = classifications[i];
    if (!classification) {
      throw new Error(
        `${prKey}: missing classifier result for unmatched candidate ${candidateIndex}`,
      );
    }
    if (result.has(candidateIndex)) {
      throw new Error(
        `${prKey}: duplicate unmatched candidate index ${candidateIndex}`,
      );
    }
    result.set(candidateIndex, classification);
  }

  return result;
}
