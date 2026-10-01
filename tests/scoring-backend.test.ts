import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test, { beforeEach } from "node:test";

import type { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";

import {
  installScoringBackend,
  scoringBackendFromEnv,
} from "../scripts/lib/scoring-backend.js";

/**
 * Fake credentials for this file. Every credential the recording upstream sees
 * must derive from these; anything else is treated as a real-credential leak.
 */
const MOCK_TOKEN = "mock-ces-token";
const MOCK_HMAC_SECRET = "mock-hmac-secret";

/** True if an auth header is present that did not come from the mock creds. */
function isCredentialLeak(headers: Record<string, string>): boolean {
  const auth = headers["authorization"];
  if (auth && auth !== `Bearer ${MOCK_TOKEN}`) return true;
  const hmac = headers["request-hmac"];
  if (hmac) {
    const [ts, sig] = hmac.split(".");
    const expected = ts ? createHmac("sha256", MOCK_HMAC_SECRET).update(ts).digest("hex") : "";
    if (sig !== expected) return true;
  }
  return false;
}

beforeEach(() => {
  // Security guard: CAPI_DEV_KEY can be a real secret in dev machines/CI, and
  // CAPI_ALWAYS_USE_AUTH_BEARER decides whether it is injected as a raw Bearer
  // token. Clear both before every test to avoid leaks.
  delete process.env.CAPI_DEV_KEY;
  delete process.env.CAPI_ALWAYS_USE_AUTH_BEARER;
});

/** Upstream that records the headers of each forwarded request. */
async function startRecordingUpstream(): Promise<{
  url: string;
  records: Array<{ headers: Record<string, string> }>;
  close: () => Promise<void>;
}> {
  const records: Array<{ headers: Record<string, string> }> = [];

  const server = createServer(async (req, res) => {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined) continue;
      headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
    }
    for await (const chunk of req) void chunk; // drain

    if (isCredentialLeak(headers)) {
      // Refuse and record a redacted marker — never store or echo the value.
      records.push({ headers: { authorization: "<blocked>", "request-hmac": "<blocked>" } });
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "credential-leak guard tripped" }));
      return;
    }

    records.push({ headers });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${addr.port}`,
    records,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

/** Minimal ModelRegistry that records `registerProvider` calls. */
function makeMockRegistry(): {
  registry: ModelRegistry;
  runtime: Pick<AuthStorage, "setRuntimeApiKey">;
  calls: Array<{ name: string; opts: { baseUrl?: string; apiKey?: string } }>;
  runtimeKeys: Array<{ provider: string; apiKey: string }>;
} {
  const calls: Array<{ name: string; opts: { baseUrl?: string; apiKey?: string } }> = [];
  const runtimeKeys: Array<{ provider: string; apiKey: string }> = [];
  const registry = {
    registerProvider(name: string, opts: { baseUrl?: string; apiKey?: string }) {
      calls.push({ name, opts });
    },
  } as unknown as ModelRegistry;
  const runtime = {
    setRuntimeApiKey(provider: string, apiKey: string) {
      runtimeKeys.push({ provider, apiKey });
    },
  };
  return { registry, runtime, calls, runtimeKeys };
}

test("scoringBackendFromEnv: defaults to pi-auth-json when unset", () => {
  delete process.env.SCORING_BACKEND;
  assert.equal(scoringBackendFromEnv(), "pi-auth-json");
});

test("scoringBackendFromEnv: accepts known values, trimmed and case-insensitive", () => {
  process.env.SCORING_BACKEND = "  CAPI-SIDECAR ";
  assert.equal(scoringBackendFromEnv(), "capi-sidecar");
  process.env.SCORING_BACKEND = "pi-auth-json";
  assert.equal(scoringBackendFromEnv(), "pi-auth-json");
});

test("scoringBackendFromEnv: accepts the legacy hmac-sidecar spelling as capi-sidecar", () => {
  process.env.SCORING_BACKEND = "hmac-sidecar";
  assert.equal(scoringBackendFromEnv(), "capi-sidecar");
});

test("scoringBackendFromEnv: throws on an unknown value", () => {
  process.env.SCORING_BACKEND = "bogus";
  assert.throws(() => scoringBackendFromEnv(), /Unknown SCORING_BACKEND "bogus"/);
});

test("installScoringBackend: pi-auth-json registers no provider", async () => {
  process.env.SCORING_BACKEND = "pi-auth-json";
  const { registry, runtime, calls, runtimeKeys } = makeMockRegistry();
  const handle = await installScoringBackend(registry, runtime);
  assert.equal(handle.backend, "pi-auth-json");
  assert.equal(calls.length, 0);
  assert.equal(runtimeKeys.length, 0);
  await handle.close(); // no-op must not throw
});

test("installScoringBackend: capi-sidecar without CAPI_DEV_KEY throws", async () => {
  process.env.SCORING_BACKEND = "capi-sidecar";
  // CAPI_DEV_KEY is unset by beforeEach.
  const { registry, runtime } = makeMockRegistry();
  await assert.rejects(
    installScoringBackend(registry, runtime),
    /requires CAPI_DEV_KEY/,
  );
});

test("installScoringBackend: CAPI_ALWAYS_USE_AUTH_BEARER routes the sidecar to Bearer auth", async () => {
  // Observe the selected auth mode by sending a request through the installed
  // sidecar to a recording upstream and checking the credential it attached.
  const upstream = await startRecordingUpstream();
  try {
    process.env.SCORING_BACKEND = "capi-sidecar";
    process.env.CAPI_ALWAYS_USE_AUTH_BEARER = "true";
    process.env.CAPI_DEV_KEY = MOCK_TOKEN;
    process.env.COPILOT_API_URL = upstream.url;

    const { registry, runtime, calls, runtimeKeys } = makeMockRegistry();
    const handle = await installScoringBackend(registry, runtime);
    try {
      assert.equal(handle.backend, "capi-sidecar");
      assert.deepEqual(runtimeKeys, [
        {
          provider: "github-copilot",
          apiKey: "capi-sidecar-placeholder",
        },
      ]);
      const sidecarUrl = calls[0]?.opts.baseUrl;
      assert.ok(sidecarUrl, "provider should be pointed at the sidecar");
      await fetch(`${sidecarUrl}/chat/completions`, {
        method: "POST",
        headers: { authorization: "Bearer placeholder" },
        body: "{}",
      });
    } finally {
      await handle.close();
    }

    const rec = upstream.records.at(-1);
    assert.ok(rec);
    assert.equal(rec.headers["authorization"], `Bearer ${MOCK_TOKEN}`);
    assert.equal(rec.headers["request-hmac"], undefined);
  } finally {
    await upstream.close();
  }
});

test("installScoringBackend: without the bearer flag the sidecar signs HMAC", async () => {
  const upstream = await startRecordingUpstream();
  try {
    process.env.SCORING_BACKEND = "capi-sidecar";
    // Bearer flag left unset by beforeEach -> HMAC mode.
    process.env.CAPI_DEV_KEY = MOCK_HMAC_SECRET;
    process.env.COPILOT_API_URL = upstream.url;

    const { registry, runtime, calls, runtimeKeys } = makeMockRegistry();
    const handle = await installScoringBackend(registry, runtime);
    try {
      assert.deepEqual(runtimeKeys, [
        {
          provider: "github-copilot",
          apiKey: "capi-sidecar-placeholder",
        },
      ]);
      const sidecarUrl = calls[0]?.opts.baseUrl;
      assert.ok(sidecarUrl, "provider should be pointed at the sidecar");
      await fetch(`${sidecarUrl}/v1/messages`, {
        method: "POST",
        headers: { authorization: "Bearer placeholder" },
        body: "{}",
      });
    } finally {
      await handle.close();
    }

    const rec = upstream.records.at(-1);
    assert.ok(rec);
    // HMAC mode strips Authorization and injects a Request-Hmac token instead.
    assert.equal(rec.headers["authorization"], undefined);
    assert.match(rec.headers["request-hmac"] ?? "", /^\d+\.[0-9a-f]{64}$/);
  } finally {
    await upstream.close();
  }
});
