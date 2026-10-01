/**
 * Local auth sidecar for CAPI.
 *
 * Starts a tiny HTTP server on 127.0.0.1 that, for every inbound request:
 *   1. Strips client `Authorization` (we don't want a stale OAuth token from
 *      pi to take precedence over the credential this sidecar injects).
 *   2. Injects an auth credential - either a fresh `Request-Hmac` token minted
 *      from an HMAC secret, or an `Authorization: Bearer` token (e.g. the CES
 *      CAPI proxy with a managed-identity token).
 *   3. Injects the integration ID + standard CAPI internal-auth headers.
 *   4. Forwards the request to `targetApiUrl` (defaults to api.githubcopilot.com),
 *      preserving any base path on that URL.
 *   5. Returns the upstream response with hop-by-hop / compression headers
 *      stripped so downstream clients don't double-decompress.
 *
 * Behaviour mirrors `codeml-detector/ts/src/capiSidecarProxy.ts`, but is
 * self-contained (no codeml-detector / hmacProvider dependency) and assumes
 * the secret is available as a raw string (the format used by
 * `${{ secrets.CAPI_DEV_KEY }}` in our workflow).
 *
 * Token format (verified against github.com/github/go-auth/hmac):
 *   `<unix_ts_decimal>.<hex(HMAC-SHA256(secret_bytes, decimal_ascii(unix_ts)))>`
 */

import { createHmac } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
} from "node:http";
import type { AddressInfo } from "node:net";

export interface CapiSidecarOptions {
  /**
   * The credential. In "hmac" mode this is the raw HMAC secret (the 64-char
   * string from `${{ secrets.CAPI_DEV_KEY }}`) used to mint `Request-Hmac`
   * tokens. In "bearer" mode it is the token injected verbatim as
   * `Authorization: Bearer <secret>`.
   */
  secret: string;
  /**
   * How `secret` is presented to CAPI. Defaults to "hmac".
   */
  authMode?: "hmac" | "bearer";
  /** CAPI integration ID. Defaults to "code-scanning-ai-dev". */
  integrationId?: string;
  /** Upstream CAPI host. Defaults to "https://api.githubcopilot.com". */
  targetApiUrl?: string;
  /** X-Interaction-Type header value. Defaults to "code-review". */
  interactionType?: string;
  /**
   * Stable request ID for the lifetime of the sidecar (correlates upstream
   * log entries across all forwarded requests).
   */
  requestId?: string;
}

export interface CapiSidecar {
  /** http://127.0.0.1:<port> — point Anthropic SDK / pi `model.baseUrl` here. */
  url: string;
  /** Stop accepting connections and release the port. */
  close: () => Promise<void>;
}

/** Mint a single Request-Hmac token from `secret`. */
export function mintHmacToken(secret: string, now: Date = new Date()): string {
  const ts = Math.floor(now.getTime() / 1000).toString();
  const sig = createHmac("sha256", secret).update(ts).digest("hex");
  return `${ts}.${sig}`;
}

/**
 * Join a path onto a base URL, preserving the base's pathname prefix.
 */
export function joinUrlPath(base: URL, append: string): URL {
  const normalized =
    base.pathname.replace(/\/+$/, "") + "/" + append.replace(/^\/+/, "");
  return new URL(normalized, base);
}

/**
 * Checks if `url` stays within `base`'s origin and path prefix. A request path
 * with `..` segments can resolve out of a configured base (e.g. `/../../admin`
 * escaping `/api/copilot`); such a request must be rejected so the sidecar's
 * credential is never attached to a path outside the intended prefix.
 */
export function isUnderBasePath(url: URL, base: URL): boolean {
  if (url.origin !== base.origin) return false;
  const prefix = base.pathname.replace(/\/+$/, ""); // strip trailing slash
  return prefix === "" || url.pathname === prefix || url.pathname.startsWith(prefix + "/");
}

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length === 0 ? undefined : Buffer.concat(chunks);
}

export async function startCapiSidecar(
  opts: CapiSidecarOptions,
): Promise<CapiSidecar> {
  const secret = opts.secret;
  const authMode = opts.authMode ?? "hmac";
  if (!secret || secret.length === 0) {
    throw new Error("startCapiSidecar: secret is required");
  }

  const targetBase = new URL(opts.targetApiUrl ?? "https://api.githubcopilot.com");
  const integrationId = opts.integrationId ?? "code-scanning-ai-dev";
  const interactionType = opts.interactionType ?? "code-review";
  const requestId = opts.requestId ?? `review-bench-${Date.now()}`;

  const server = createServer(async (req, res) => {
    try {
      if (!req.method || !req.url) {
        res.writeHead(400);
        res.end("Missing method or URL");
        return;
      }

      const targetUrl = joinUrlPath(targetBase, req.url);

      if (!isUnderBasePath(targetUrl, targetBase)) {
        res.writeHead(400);
        res.end("Path escapes the configured base path");
        return;
      }

      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        const lower = name.toLowerCase();
        // Skip hop-by-hop / host headers and strip any caller-supplied auth
        // (Authorization or Request-Hmac) so only the credential this sidecar
        // injects reaches CAPI.
        if (lower === "host" || lower === "authorization" || lower === "request-hmac") continue;
        headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      }

      // Bearer mode (e.g. CES CAPI proxy with a managed-identity token) injects
      // Authorization and skips HMAC; otherwise mint a fresh Request-Hmac.
      if (authMode === "bearer") {
        headers.set("Authorization", `Bearer ${secret}`);
      } else {
        headers.set("Request-Hmac", mintHmacToken(secret));
      }
      headers.set("Copilot-Integration-Id", integrationId);
      headers.set("X-Initiator", "agent");
      headers.set("X-Interaction-Type", interactionType);
      headers.set("X-GitHub-Request-Id", requestId);
      headers.set("X-GLB-Via", "true");

      // Per-user CAPI allowlist (mirrors capiSidecarProxy.ts): forward
      // GITHUB_USER_ID so user-FF-gated stealth models resolve in offline-eval
      // mode. Gated on CODEML_DETECTOR_OFFLINE_EVAL=1 so this can't fire in
      // any non-offline deployment.
      if (
        process.env.CODEML_DETECTOR_OFFLINE_EVAL === "1" &&
        process.env.GITHUB_USER_ID
      ) {
        headers.set("X-GitHub-User", process.env.GITHUB_USER_ID);
      }

      const body = await readBody(req);
      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: body as unknown as BodyInit | undefined,
        redirect: "error", // avoid sending the credential to unexpected paths on redirect
      });

      const responseBody = Buffer.from(await upstream.arrayBuffer());

      // Node's fetch auto-decompresses; forwarding the upstream
      // content-encoding/transfer-encoding would make the downstream client
      // try to decompress again. Drop content-length since the body length
      // may differ from what upstream declared.
      const responseHeaders = new Headers(upstream.headers);
      responseHeaders.delete("content-encoding");
      responseHeaders.delete("transfer-encoding");
      responseHeaders.delete("content-length");

      res.writeHead(
        upstream.status,
        Object.fromEntries(responseHeaders.entries()),
      );
      res.end(responseBody);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown proxy failure";
      try {
        res.writeHead(502, { "content-type": "text/plain" });
        res.end(`capi-sidecar: ${message}`);
      } catch {
        // headers already sent; nothing we can do
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo | null;
  if (!address) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("startCapiSidecar: failed to resolve listening address");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
