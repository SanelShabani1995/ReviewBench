/**
 * Types for the AI code review benchmark classifier.
 *
 * These types correspond to the concepts defined in docs/METHODOLOGY.md:
 * - Findings (Section 4)
 * - Labels: TP/FP, severity, category, scope, etc. (Section 5.2)
 * - Classification results (Section 5.4)
 */

// ---------------------------------------------------------------------------
// Input: Dataset comment (as stored in labeled_data_05_04_mit_only.json)
// ---------------------------------------------------------------------------

export interface DatasetComment {
  pull_request_url: string;
  nwo: string; // owner/repo
  head_sha: string;
  comment_id: string;
  body: string; // the review comment text
  file_path: string;
  diff_line: string;
  discussion_url: string;
  repo_url: string;

  // Human labels (ground truth for dev-set evaluation)
  quality: "helpful" | "unhelpful" | "wrong";
  quality_justification?: string;
  severity: "nit" | "moderate" | "critical";
  severity_justification?: string;
  advanced?: "true" | "false" | boolean;
  advanced_justification?: string;
}

// ---------------------------------------------------------------------------
// Input: Finding (from extraction pipeline — see scripts/extraction/types.ts)
// ---------------------------------------------------------------------------

export interface FindingInput {
  id: string;
  file: string;
  start_line: number;
  end_line: number;
  message: string;
  producer: string;
}

/**
 * Unified classifier input. The classifier accepts either format.
 * `toClassifierFinding` normalizes both to the fields the classifier needs.
 */
export type ClassifierInput = DatasetComment | FindingInput;

export function toClassifierFinding(input: ClassifierInput): {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  message: string;
} {
  if ("comment_id" in input) {
    const line = parseInt(input.diff_line, 10) || 0;
    return {
      id: input.comment_id,
      filePath: input.file_path,
      startLine: line,
      endLine: line,
      message: input.body,
    };
  }
  return {
    id: input.id,
    filePath: input.file,
    startLine: input.start_line,
    endLine: input.end_line,
    message: input.message,
  };
}

// ---------------------------------------------------------------------------
// Classifier output labels (per Section 5.2 of METHODOLOGY.md)
// ---------------------------------------------------------------------------

/** Primary TP/FP label */
export type TPFPLabel = "tp" | "fp";

/** Severity on the fixed ordinal scale (Section 5.2) */
export type Severity = "high" | "medium" | "low";

/**
 * Category taxonomy (Section 5.2).
 * Intentionally coarse to keep axes interpretable.
 */
export type Category =
  | "correctness"
  | "security"
  | "reliability"
  | "maintainability"
  | "testing"
  | "documentation"
  | "performance"
  | "api-architecture"
  | "accessibility"
  | "other";

/** Scope: is the issue introduced by the PR? (Section 5.2) */
export type Scope =
  | "introduced-by-pr"
  | "exacerbated-by-pr"
  | "pre-existing"
  | "unrelated";

/** Context required to verify the finding (Section 5.2) */
export type ContextRequired =
  | "diff-only"
  | "diff-plus-related-files"
  | "broader-project-context";

// ---------------------------------------------------------------------------
// Classifier result for a single finding
// ---------------------------------------------------------------------------

export interface ClassificationResult {
  /** The ID of the finding that was classified */
  comment_id: string;

  /** Primary label */
  tp_fp: TPFPLabel;
  tp_fp_justification: string;

  /** Severity on the methodology's scale */
  severity: Severity;
  severity_justification?: string;

  /** Category from the fixed taxonomy */
  category: Category;
  category_justification?: string;

  /** Scope relative to the PR */
  scope: Scope;

  /** Difficulty: would a competent author catch this? */
  difficulty: "easy" | "medium" | "hard";

  /** Context required to verify */
  context_required: ContextRequired;

  /** Is there a concrete actionable change? */
  // actionable field removed in v2.1.0 — was perfectly correlated with tp_fp
}

// ---------------------------------------------------------------------------
// PR context fetched for the classifier
// ---------------------------------------------------------------------------

export interface PRContext {
  /** PR URL */
  url: string;
  /** owner/repo */
  nwo: string;
  /** PR title */
  title: string;
  /** PR body/description */
  body: string;
  /** The diff (or relevant portion) */
  diff: string;
  /** Head SHA used */
  head_sha: string;
}

// ---------------------------------------------------------------------------
// Batch run metadata
// ---------------------------------------------------------------------------

export interface UsageStats {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  estimated_cost_usd: number;
  elapsed_seconds: number;
}

export interface ClassifierRunMetadata {
  /** ISO timestamp of the run */
  timestamp: string;
  /** Model used for classification */
  model: string;
  /** Classifier prompt version (bump on prompt changes) */
  classifier_version: string;
  /** Total findings classified */
  total_findings: number;
  /** Counts */
  tp_count: number;
  fp_count: number;
  /** Token usage and cost */
  usage?: UsageStats;
}

export interface ClassifierRunOutput {
  metadata: ClassifierRunMetadata;
  results: ClassificationResult[];
}
