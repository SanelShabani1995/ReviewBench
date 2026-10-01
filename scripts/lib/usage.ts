/**
 * Shared usage types and display helpers for benchmark run comparison.
 *
 * These types represent aggregated token/cost/tool metrics for a benchmark
 * run. The extraction scripts (llm-review, ccr-review, etc.) are responsible
 * for populating these from their agent-specific output formats.
 */

// ---------------------------------------------------------------------------
// Per-PR usage (agent-agnostic)
// ---------------------------------------------------------------------------

export interface PRUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens: number;
  time_in_ms: number;
  cost_usd: number;
  tool_calls: number;
  calls_by_tool: Record<string, number>;
  errors_by_tool: Record<string, number>;
  duration_by_tool_ms: Record<string, number>;
}

export type CandidateUsageMetric =
  | "prompt_tokens"
  | "completion_tokens"
  | "total_tokens"
  | "cached_tokens"
  | "time_in_ms"
  | "cost_usd";

export type CandidatePRUsage = Partial<Pick<PRUsage, CandidateUsageMetric>>;

export interface CandidateUsageAggregate {
  pr_count: number;
  reported_pr_count: number;
  coverage: Record<CandidateUsageMetric, number>;
  total: Record<CandidateUsageMetric, number | null>;
  per_pr_mean: Record<CandidateUsageMetric, number | null>;
}

const CANDIDATE_USAGE_METRICS: CandidateUsageMetric[] = [
  "prompt_tokens",
  "completion_tokens",
  "total_tokens",
  "cached_tokens",
  "time_in_ms",
  "cost_usd",
];

export function aggregateCandidateUsage(
  usages: Array<CandidatePRUsage | undefined>,
): CandidateUsageAggregate {
  const coverage = Object.fromEntries(
    CANDIDATE_USAGE_METRICS.map((metric) => [metric, 0]),
  ) as Record<CandidateUsageMetric, number>;
  const sums = Object.fromEntries(
    CANDIDATE_USAGE_METRICS.map((metric) => [metric, 0]),
  ) as Record<CandidateUsageMetric, number>;

  let reportedPrCount = 0;
  for (const usage of usages) {
    if (!usage) continue;
    let reported = false;
    for (const metric of CANDIDATE_USAGE_METRICS) {
      const value = usage[metric];
      if (value === undefined) continue;
      coverage[metric]++;
      sums[metric] += value;
      reported = true;
    }
    if (reported) reportedPrCount++;
  }

  const total = {} as Record<CandidateUsageMetric, number | null>;
  const perPrMean = {} as Record<CandidateUsageMetric, number | null>;
  for (const metric of CANDIDATE_USAGE_METRICS) {
    total[metric] = coverage[metric] > 0 ? sums[metric] : null;
    perPrMean[metric] =
      coverage[metric] > 0 ? sums[metric] / coverage[metric] : null;
  }

  return {
    pr_count: usages.length,
    reported_pr_count: reportedPrCount,
    coverage,
    total,
    per_pr_mean: perPrMean,
  };
}

export function emptyPRUsage(): PRUsage {
  return {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    cached_tokens: 0,
    time_in_ms: 0,
    cost_usd: 0,
    tool_calls: 0,
    calls_by_tool: {},
    errors_by_tool: {},
    duration_by_tool_ms: {},
  };
}

// ---------------------------------------------------------------------------
// Run-level aggregate (sum across PRs in one (run, round) iteration)
// ---------------------------------------------------------------------------

export interface RunUsageStats {
  pr_count: number;
  total: PRUsage;
  per_pr_mean: PRUsage;
}

function addInto(
  target: Record<string, number>,
  source: Record<string, number> | undefined,
): void {
  if (!source) return;
  for (const [k, v] of Object.entries(source)) {
    target[k] = (target[k] ?? 0) + (Number.isFinite(v) ? v : 0);
  }
}

export function aggregateRunUsage(prUsages: PRUsage[]): RunUsageStats {
  const total = emptyPRUsage();
  for (const u of prUsages) {
    total.prompt_tokens += u.prompt_tokens;
    total.completion_tokens += u.completion_tokens;
    total.total_tokens += u.total_tokens;
    total.cached_tokens += u.cached_tokens;
    total.time_in_ms += u.time_in_ms;
    total.cost_usd += u.cost_usd;
    total.tool_calls += u.tool_calls;
    addInto(total.calls_by_tool, u.calls_by_tool);
    addInto(total.errors_by_tool, u.errors_by_tool);
    addInto(total.duration_by_tool_ms, u.duration_by_tool_ms);
  }

  const n = Math.max(1, prUsages.length);
  const per_pr_mean: PRUsage = {
    prompt_tokens: total.prompt_tokens / n,
    completion_tokens: total.completion_tokens / n,
    total_tokens: total.total_tokens / n,
    cached_tokens: total.cached_tokens / n,
    time_in_ms: total.time_in_ms / n,
    cost_usd: total.cost_usd / n,
    tool_calls: total.tool_calls / n,
    calls_by_tool: Object.fromEntries(
      Object.entries(total.calls_by_tool).map(([k, v]) => [k, v / n]),
    ),
    errors_by_tool: Object.fromEntries(
      Object.entries(total.errors_by_tool).map(([k, v]) => [k, v / n]),
    ),
    duration_by_tool_ms: Object.fromEntries(
      Object.entries(total.duration_by_tool_ms).map(([k, v]) => [k, v / n]),
    ),
  };

  return { pr_count: prUsages.length, total, per_pr_mean };
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function fmtTokens(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

export function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "\u2014";
  return `$${n.toFixed(2)}`;
}

export function fmtSeconds(ms: number): string {
  if (!Number.isFinite(ms) || ms === 0) return "0s";
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s % 60);
  return `${m}m${rs}s`;
}
