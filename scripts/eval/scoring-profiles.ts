/**
 * Named scoring profiles — pin the exact judge used for a published snapshot.
 *
 * The leaderboard scores every reviewer with one consistent third-party judge
 * (matcher + classifier) so the numbers are comparable and free of model
 * self-preference bias. A profile captures that judge for a given snapshot so a
 * consumer can score their own agent *the same way we did* — via
 * `eval.ts --scoring-profile <id>` — without needing to know the model string,
 * and with a loud error if their auth can't provide that model rather than a
 * silent fall-through to whatever model their credentials happen to expose.
 *
 * Profiles are append-only and immutable: every snapshot gets its own dated
 * entry, and existing entries are never edited. Reproducibility depends on it.
 *
 * What a profile pins, and why only these fields:
 *   - `judge.model`      — enforced. The single model that drives both the
 *                          matcher and the classifier in this harness.
 *   - `promptHashes`     — enforced. SHA-256 of the matcher/classifier system
 *                          prompts at snapshot time. Reproducible on any host,
 *                          so a drifted harness is caught before it produces
 *                          non-comparable numbers.
 *   - `snapshot.prCount` — advisory only. The public showcase is a 25-PR subset
 *                          and, even internally, each reviewer covers a slightly
 *                          different PR set, so corpus-derived fingerprints
 *                          (golden_hash / evaluated_prs_hash) are per-run and
 *                          deliberately NOT pinned here — pinning them would
 *                          raise false "drift" alarms on every legitimate run.
 *
 * `judge.provider` is documentation, not a constraint: the same model can be
 * reached through different providers (a direct `ANTHROPIC_API_KEY`, GitHub
 * Copilot via `pi /login`, Bedrock, …) and they resolve to the same weights.
 * We enforce the model and let the provider be whatever the user's auth uses.
 */

export interface JudgeSpec {
  /** Enforced, matched provider-agnostically via `sameModel()`. */
  model: string;
  /** Preferred provider; any provider that serves the model is accepted. */
  provider?: string;
  /** Shown when no configured credential can serve the model. */
  authHint: string;
}

export interface ScoringProfile {
  /** Stable, dated identifier, e.g. "official-2026-07". Immutable once shipped. */
  id: string;
  /** Human-readable description. */
  description: string;
  /**
   * A council: several judges whose verdicts are combined per finding
   * (see scripts/eval/council.ts). The first is the primary judge, which
   * breaks ties. When absent, `judge` alone is the judge.
   */
  judges?: JudgeSpec[];
  /** How a council's verdicts combine. Only "majority" exists. */
  combination?: "majority";
  judge: {
    /**
     * Enforced: the matcher + classifier model. Matched provider-agnostically —
     * pi spells the same Anthropic model differently per provider (github-copilot
     * `claude-sonnet-4.6`, anthropic `claude-sonnet-4-6`, bedrock
     * `anthropic.claude-sonnet-4-6`, …) — via `sameModel()`.
     */
    model: string;
    /**
     * The provider we actually reached the model through for this snapshot.
     * Preferred on tiebreak when several configured providers serve an
     * equivalent model, but NOT required — any provider that serves the model
     * is accepted.
     */
    provider?: string;
    /** Shown when no configured credential can serve the model. */
    authHint: string;
  };
  /** Enforced: SHA-256 of the harness system prompts at snapshot time. */
  promptHashes: {
    classifier: string;
    matcher: string;
  };
  /** Advisory metadata about the internal snapshot (not enforced). */
  snapshot: {
    prCount: number;
    note: string;
  };
}

export const OFFICIAL_2026_07: ScoringProfile = {
  id: "official-2026-07",
  description:
    "Published ReviewBench leaderboard, July 2026 snapshot (219-PR internal corpus). " +
    "Vendor-neutral third-party judge, held constant across every reviewer to " +
    "avoid model self-preference bias.",
  judge: {
    model: "claude-sonnet-4.6",
    provider: "github-copilot",
    authHint:
      "a direct ANTHROPIC_API_KEY, GitHub Copilot via `pi /login`, or any pi " +
      "provider that serves Claude Sonnet 4.6 (Bedrock, etc.)",
  },
  promptHashes: {
    classifier: "127dee68d37e39b5197bd56fee816a18098531df994561c32bcbe9744eb5e8b1",
    matcher: "7a48bc77e92f7af7c91ee8642eb019feccc8b5f296dfa30bab53dc176c0e84c1",
  },
  snapshot: {
    prCount: 219,
    note:
      "The public showcase is a 25-PR subset, so absolute precision/recall will " +
      "not reproduce the full internal leaderboard. What makes scores comparable " +
      "is using one consistent judge across all reviewers, not matching the corpus.",
  },
};

/**
 * September 2026: Claude Sonnet 4.6 stopped being served by Copilot seats
 * and by CAPI, so the judge moved to Claude Sonnet 5, reached through the
 * CAPI sidecar (`SCORING_BACKEND=capi-sidecar`). Prompts are unchanged, so
 * the hashes carry over. Rows judged under official-2026-07 are not
 * comparable with rows judged here and need re-scoring.
 *
 * Claude Sonnet 5 is the sole official judge.
 */
export const OFFICIAL_2026_09: ScoringProfile = {
  id: "official-2026-09",
  description:
    "ReviewBench leaderboard, September 2026 snapshot (219-PR internal corpus). " +
    "Judge: Claude Sonnet 5 through CAPI, held constant across every reviewer.",
  judge: {
    model: "claude-sonnet-5",
    provider: "github-copilot",
    authHint:
      "SCORING_BACKEND=capi-sidecar with CAPI_DEV_KEY (the CAPI integration), " +
      "or any pi provider that serves Claude Sonnet 5",
  },
  promptHashes: {
    classifier: "366ed8de84035d233cc741e751e80bbf7a9cf1e5462200f1d570bd2fcd2dbcd4",
    matcher: "b47f849fa616125245c610f6456f918b016cff404e90ed648777ecfd083b77bb",
  },
  snapshot: {
    prCount: 219,
    note: "The official September 2026 scoring configuration.",
  },
};

/**
 * The three-vendor council: each judge matches and classifies on its own and
 * the verdicts combine by majority, so no agent is judged only by its own
 * model family. Claude Sonnet 5 is the primary judge (tie-breaks), which
 * keeps this profile continuous with official-2026-09. All three are served
 * by CAPI. Numbers here are not comparable with single-judge profiles.
 */
export const COUNCIL_2026_09: ScoringProfile = {
  id: "council-2026-09",
  description:
    "ReviewBench leaderboard, September 2026, three-judge council: Claude Sonnet 5, " +
    "GPT-5.6 Sol and Gemini 3.8 Flash through CAPI, combined by majority per finding.",
  judge: OFFICIAL_2026_09.judge,
  judges: [
    OFFICIAL_2026_09.judge,
    {
      model: "gpt-5.6-sol",
      provider: "github-copilot",
      authHint: "SCORING_BACKEND=capi-sidecar with CAPI_DEV_KEY (the CAPI integration)",
    },
    {
      model: "gemini-3.8-flash",
      provider: "github-copilot",
      authHint: "SCORING_BACKEND=capi-sidecar with CAPI_DEV_KEY (the CAPI integration)",
    },
  ],
  combination: "majority",
  promptHashes: OFFICIAL_2026_09.promptHashes,
  snapshot: {
    prCount: 219,
    note:
      "Same corpus and prompts as official-2026-09; three judges instead of one, " +
      "so numbers from the two profiles must not be compared directly.",
  },
};

/** The judges a profile runs, primary first. */
export function judgesOf(profile: ScoringProfile): JudgeSpec[] {
  return profile.judges && profile.judges.length > 0 ? profile.judges : [profile.judge];
}

/** Registry of all published profiles, keyed by id. Append new snapshots here. */
export const SCORING_PROFILES: Record<string, ScoringProfile> = {
  [OFFICIAL_2026_07.id]: OFFICIAL_2026_07,
  [OFFICIAL_2026_09.id]: OFFICIAL_2026_09,
  [COUNCIL_2026_09.id]: COUNCIL_2026_09,
};

/** The newest official snapshot — what the convenience aliases resolve to. */
export const LATEST_OFFICIAL_PROFILE_ID = OFFICIAL_2026_09.id;

/**
 * Normalize a pi model id to a provider-agnostic key, so the same underlying
 * model matches regardless of how a provider spells it:
 *   github-copilot   claude-sonnet-4.6
 *   anthropic        claude-sonnet-4-6
 *   amazon-bedrock   anthropic.claude-sonnet-4-6 / us.anthropic.claude-sonnet-4-6
 *   openrouter       anthropic/claude-sonnet-4-6
 * all normalize to `claude-sonnet-4-6`. We take the last "/"-delimited segment
 * (drops provider-path prefixes), then strip an optional Bedrock region prefix
 * plus the `anthropic.` vendor prefix. The region prefix is matched generically
 * (`<token>.anthropic.`) rather than an enumerated list, so any AWS region
 * (us/eu/au/global/apac/… and future ones) is handled without false rejects.
 * Only a `.anthropic.`-anchored prefix is stripped, so distinct models like
 * `claude-sonnet-4-5-20250929` don't collide.
 */
export function normalizeModelId(id: string): string {
  let s = id.toLowerCase();
  if (s.includes("/")) s = s.slice(s.lastIndexOf("/") + 1);
  s = s.replace(/^[a-z0-9-]+\.anthropic\./, ""); // <region>.anthropic. (Bedrock)
  s = s.replace(/^anthropic\./, ""); // bare anthropic. (Bedrock, no region)
  return s.replace(/\./g, "-");
}

/** True when two model ids refer to the same underlying model across providers. */
export function sameModel(a: string, b: string): boolean {
  return normalizeModelId(a) === normalizeModelId(b);
}

/** Convenience aliases that float to the newest official snapshot. */
const PROFILE_ALIASES = new Set(["latest", "leaderboard", "official"]);

export interface ProfileResolution {
  profile: ScoringProfile;
  /** True when the caller used a floating alias rather than the dated id. */
  viaAlias: boolean;
}

/**
 * Resolve a profile id (or a floating alias) to a concrete profile.
 * Throws with the list of known ids if the id is unknown.
 */
export function resolveProfile(id: string): ProfileResolution {
  const viaAlias = PROFILE_ALIASES.has(id);
  const key = viaAlias ? LATEST_OFFICIAL_PROFILE_ID : id;
  const profile = SCORING_PROFILES[key];
  if (!profile) {
    const known = Object.keys(SCORING_PROFILES).join(", ");
    throw new Error(
      `Unknown scoring profile "${id}". Known profiles: ${known}. ` +
        `Use a dated id (e.g. "${LATEST_OFFICIAL_PROFILE_ID}") for reproducible runs, ` +
        `or "latest"/"leaderboard" for the newest snapshot.`,
    );
  }
  return { profile, viaAlias };
}

/** One-line summaries of every profile, for `--list-profiles`. */
export function describeProfiles(): string {
  const lines = Object.values(SCORING_PROFILES).map(
    (p) => `  ${p.id}  →  judge ${p.judge.model} (${p.snapshot.prCount} PRs)\n      ${p.description}`,
  );
  return `Available scoring profiles:\n${lines.join("\n")}\n` +
    `\nAliases: "latest" / "leaderboard" → ${LATEST_OFFICIAL_PROFILE_ID}`;
}
