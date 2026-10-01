/**
 * Scoring-backend selector.
 *
 * Picks between two ways to reach the judge through the pi `github-copilot`
 * provider:
 *
 *   - "pi-auth-json" (default): pi loads its OAuth credentials from
 *     `~/.pi/agent/auth.json`, the same as a local user who ran `pi /login`.
 *     Usage bills to that seat.
 *
 *   - "capi-sidecar": start a local CAPI proxy backed by `CAPI_DEV_KEY`, then
 *     register the judge models on the `github-copilot` provider with the
 *     proxy as their base URL. No auth.json and no Copilot seat; usage bills
 *     to the CAPI integration. The proxy signs HMAC against CAPI by default,
 *     or forwards `CAPI_DEV_KEY` as a Bearer token when
 *     `CAPI_ALWAYS_USE_AUTH_BEARER=true`.
 *
 * Selected via the `SCORING_BACKEND` env var. Defaults to "pi-auth-json" so
 * existing local and CI runs keep working unchanged.
 */

import { startCapiSidecar, type CapiSidecar } from "./capi-sidecar.js";

import type { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";

export type ScoringBackend = "pi-auth-json" | "capi-sidecar";

export interface ScoringBackendHandle {
  /** Backend that was selected. */
  backend: ScoringBackend;
  /** Release any resources held by this backend (e.g. stop the sidecar). */
  close: () => Promise<void>;
}

/**
 * The judge models the sidecar exposes. pi's bundled catalog predates these,
 * so they are registered by hand; registering a model list replaces the
 * provider's catalog, which also means only judges are reachable this way.
 * The API kind follows how Copilot serves each family.
 */
export const CAPI_JUDGE_MODELS = [
  { id: "claude-sonnet-5", name: "Claude Sonnet 5", api: "anthropic-messages", contextWindow: 1_000_000, maxTokens: 64_000 },
  { id: "gpt-5.6-sol", name: "GPT-5.6 Sol", api: "openai-responses", contextWindow: 400_000, maxTokens: 128_000 },
  { id: "gemini-3.7-flash", name: "Gemini 3.7 Flash", api: "openai-completions", contextWindow: 1_000_000, maxTokens: 64_000 },
  { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", api: "openai-completions", contextWindow: 1_000_000, maxTokens: 64_000 },
] as const;

/** Read SCORING_BACKEND, defaulting to "pi-auth-json". */
export function scoringBackendFromEnv(): ScoringBackend {
  const raw = process.env.SCORING_BACKEND?.trim().toLowerCase();
  // "hmac-sidecar" is the legacy value from when HMAC was the sidecar's only
  // auth mode.
  if (raw === "capi-sidecar" || raw === "hmac-sidecar") return "capi-sidecar";
  if (raw === "pi-auth-json") return "pi-auth-json";
  if (raw && raw.length > 0) {
    throw new Error(
      `Unknown SCORING_BACKEND "${process.env.SCORING_BACKEND}". Expected "pi-auth-json" or "capi-sidecar".`,
    );
  }
  return "pi-auth-json";
}

/**
 * Set up the chosen backend on a pi `ModelRegistry`.
 *
 * For "capi-sidecar": starts the proxy and registers the judge models on
 * `github-copilot` with the proxy URL, plus a runtime placeholder key so
 * stored OAuth cannot replace the proxy URL during request authentication.
 * The placeholder makes `hasConfiguredAuth` true, so `getAvailable()` lists
 * the models. It ends up as `Authorization: Bearer ...` on requests to the
 * sidecar, which strips it and substitutes the real credential.
 *
 * For "pi-auth-json": no-op; the caller's auth.json provides credentials.
 */
export async function installScoringBackend(
  modelRegistry: Pick<ModelRegistry, "registerProvider">,
  authStorage: Pick<AuthStorage, "setRuntimeApiKey">,
): Promise<ScoringBackendHandle> {
  const backend = scoringBackendFromEnv();
  if (backend === "pi-auth-json") {
    return { backend, close: async () => {} };
  }

  const useBearer = process.env.CAPI_ALWAYS_USE_AUTH_BEARER === "true";
  const credential = process.env.CAPI_DEV_KEY;
  if (!credential || credential.length === 0) {
    throw new Error("SCORING_BACKEND=capi-sidecar requires CAPI_DEV_KEY to be set");
  }

  const sidecar: CapiSidecar = await startCapiSidecar({
    secret: credential,
    authMode: useBearer ? "bearer" : "hmac",
    integrationId: process.env.GITHUB_COPILOT_INTEGRATION_ID || "code-scanning-ai-dev",
    targetApiUrl: process.env.COPILOT_API_URL || "https://api.githubcopilot.com",
  });

  try {
    // Runtime credentials take precedence over stored OAuth credentials, so
    // auth.json cannot replace the sidecar URL during request auth.
    authStorage.setRuntimeApiKey("github-copilot", "capi-sidecar-placeholder");
    modelRegistry.registerProvider("github-copilot", {
      baseUrl: sidecar.url,
      apiKey: "capi-sidecar-placeholder",
      // Same client headers pi's own Copilot entries carry; the sidecar sets
      // the integration and auth headers on top.
      headers: {
        "User-Agent": "GitHubCopilotChat/0.35.0",
        "Editor-Version": "vscode/1.107.0",
        "Editor-Plugin-Version": "copilot-chat/0.35.0",
        "Copilot-Integration-Id": "vscode-chat",
      },
      models: CAPI_JUDGE_MODELS.map((m) => ({
        id: m.id,
        name: m.name,
        api: m.api,
        // No extended thinking: this pi version sends the older
        // `thinking.type: enabled` form, which the current Anthropic models
        // reject in favour of adaptive thinking. Judging runs without it
        // until pi is upgraded; the same setting applies to every judge.
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: m.contextWindow,
        maxTokens: m.maxTokens,
      })),
    });
  } catch (err) {
    await sidecar.close();
    throw err;
  }

  return {
    backend,
    close: () => sidecar.close(),
  };
}
