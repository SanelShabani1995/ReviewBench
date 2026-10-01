/**
 * Core pipeline shared between golden-ingest and eval.
 *
 * Takes new findings + an existing golden set, deduplicates via the
 * matcher, and classifies the novel findings. Returns everything
 * needed for either merging (golden-ingest) or scoring (eval).
 */

import type { Finding } from "../lib/types.js";
import type { RawCorrespondence } from "../lib/match-types.js";
import type { ClassifiedFinding } from "../eval/scorer.js";
import type { MatcherStats } from "../eval/matcher.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GoldenEntry {
  file: string;
  start_line: number;
  end_line: number;
  message: string;
  tp_fp: "tp" | "fp";
  severity: "high" | "medium" | "low";
  category: string;
  scope?: string;
  difficulty?: string;
  context_required?: string;
  tp_fp_justification?: string;
  severity_justification?: string;
  category_justification?: string;
  producer: string;
  source?: Record<string, unknown>;
}

export interface GoldenSet {
  pr_key: string;
  pr: {
    repo: string;
    pr_number: number;
    base: string;
    head: string;
  };
  findings: GoldenEntry[];
}

export interface PipelineResult {
  pr_key: string;
  existing_golden: GoldenEntry[];
  novel_findings: Finding[];
  correspondences: RawCorrespondence[];
  novel_classifications?: ClassifiedFinding[];
  duplicate_indices: number[];
  novel_indices: number[];
  matcher_stats?: MatcherStats;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export interface PipelineConfig {
  /** Matcher config */
  matcher?: {
    provider?: string;
    modelId?: string;
  };
  /** If true, skip classification (just dedup) */
  skipClassification?: boolean;
}

/**
 * Run the shared dedup pipeline for a single PR.
 *
 * 1. Match new findings against existing golden set
 * 2. Separate into duplicates and novel findings
 *
 * Classification is NOT run here — it's expensive and callers
 * may want to batch it or use different strategies. Callers
 * should classify `result.novel_findings` and attach the
 * classifications to `result.novel_classifications`.
 */
export async function dedup(
  newFindings: Finding[],
  goldenSet: GoldenSet | null,
  config?: PipelineConfig,
): Promise<PipelineResult> {
  const existing = goldenSet?.findings ?? [];
  const pr_key = goldenSet?.pr_key ?? "";

  if (newFindings.length === 0) {
    return {
      pr_key,
      existing_golden: existing,
      novel_findings: [],
      correspondences: [],
      duplicate_indices: [],
      novel_indices: [],
    };
  }

  if (existing.length === 0) {
    // No existing golden — everything is novel
    return {
      pr_key,
      existing_golden: [],
      novel_findings: newFindings,
      correspondences: newFindings.map((_, i) => ({
        candidate_index: i,
        matched_golden_indices: [],
      })),
      duplicate_indices: [],
      novel_indices: newFindings.map((_, i) => i),
    };
  }

  // Convert golden entries to Finding format for the matcher
  const goldenAsFindings: Finding[] = existing.map((g) => ({
    producer: g.producer,
    file: g.file,
    start_line: g.start_line,
    end_line: g.end_line,
    message: g.message,
    source: {
      type: "golden",
      alignment: "golden",
    },
  }));

  // Run the matcher
  const { matchFindings } = await import("../eval/matcher.js");
  const { correspondences, stats: matcherStats } = await matchFindings(
    newFindings,
    goldenAsFindings,
    config?.matcher,
  );

  // Separate duplicates from novel
  const duplicate_indices: number[] = [];
  const novel_indices: number[] = [];

  for (const corr of correspondences) {
    if (corr.matched_golden_indices.length > 0) {
      duplicate_indices.push(corr.candidate_index);
    } else {
      novel_indices.push(corr.candidate_index);
    }
  }

  const novel_findings = novel_indices.map((i) => newFindings[i]);

  return {
    pr_key,
    existing_golden: existing,
    novel_findings,
    correspondences,
    duplicate_indices,
    novel_indices,
    matcher_stats: matcherStats,
  };
}

/**
 * Merge novel findings into the golden set.
 *
 * When classified is true, novelClassifications contains real labels.
 * When classified is false, placeholder labels are used and entries
 * are marked as unclassified for later processing.
 */
export function merge(
  existing: GoldenEntry[],
  novelFindings: Finding[],
  novelClassifications: ClassifiedFinding[] | null,
  pr: GoldenSet["pr"],
  pr_key: string,
): GoldenSet {
  const newEntries: GoldenEntry[] = [];

  for (let i = 0; i < novelFindings.length; i++) {
    const finding = novelFindings[i];
    const cls = novelClassifications?.[i];

    newEntries.push({
      file: finding.file,
      start_line: finding.start_line,
      end_line: finding.end_line,
      message: finding.message,
      tp_fp: cls?.tp_fp ?? "tp",
      severity: cls?.severity ?? "medium",
      category: cls?.category ?? "unclassified",
      scope: cls?.scope,
      difficulty: cls?.difficulty,
      context_required: cls?.context_required,
      tp_fp_justification: cls?.tp_fp_justification,
      severity_justification: cls?.severity_justification,
      category_justification: cls?.category_justification,
      producer: finding.producer,
      source: finding.source as unknown as Record<string, unknown>,
    });
  }

  return {
    pr_key,
    pr,
    findings: [...existing, ...newEntries],
  };
}
