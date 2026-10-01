/**
 * Fetch PR context (title, body, diff) and review comment context from GitHub.
 *
 * Uses the shared Octokit instance from scripts/extraction/github.ts.
 */

import { getOctokit } from "../extraction/github.js";
import { assertHexRef, checkoutRepo } from "../extraction/git.js";
import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

export interface PRContext {
  url: string;
  nwo: string;
  title: string;
  body: string;
  diff: string;
  head_sha: string;
  /** Map from comment ID → diff hunk context from GitHub */
  commentDiffHunks: Map<string, CommentContext>;
}

export interface CommentContext {
  /** The diff hunk surrounding the comment */
  diffHunk: string;
  /** The file-side line number (new side) */
  line: number | null;
  /** The file-side line number (old side) */
  originalLine: number | null;
  /** Position in the diff */
  position: number | null;
  /** The side of the diff the comment is on */
  side: string;
}

const DEFAULT_REPO_DIR = "/tmp/classifier-repos";

/**
 * Fall back to local git diff when the GitHub API refuses to return
 * a diff (too many lines or files).
 */
function getLocalDiff(nwo: string, baseSha: string, headSha: string): string {
  const repoDir = join(DEFAULT_REPO_DIR, nwo.replace("/", "__"), headSha.slice(0, 8));

  if (!existsSync(join(repoDir, ".git"))) {
    // Try to clone and checkout
    checkoutRepo(nwo, headSha, DEFAULT_REPO_DIR);
  }

  assertHexRef(baseSha);
  assertHexRef(headSha);

  // Fetch the base commit
  try {
    execFileSync("git", ["-C", repoDir, "fetch", "origin", baseSha], {
      stdio: "pipe",
      timeout: 60_000,
    });
  } catch {
    // may already have it
  }

  const result = execFileSync(
    "git",
    ["-C", repoDir, "diff", `${baseSha}..${headSha}`],
    { stdio: "pipe", maxBuffer: 50 * 1024 * 1024 },
  );
  return result.toString("utf-8");
}

/**
 * Fetch PR metadata, diff, and review comment context from GitHub.
 *
 * Caches results in memory so that multiple findings on the same PR
 * don't make redundant API calls.
 */
const prCache = new Map<string, PRContext>();

export async function fetchPRContext(
  nwo: string,
  prUrl: string,
  headSha: string
): Promise<PRContext> {
  const cacheKey = `${nwo}:${prUrl}`;
  if (prCache.has(cacheKey)) {
    return prCache.get(cacheKey)!;
  }

  const octokit = getOctokit();
  const [owner, repo] = nwo.split("/");

  // Extract PR number from URL
  const prNumber = parseInt(prUrl.split("/pull/")[1], 10);
  if (isNaN(prNumber)) {
    throw new Error(`Could not extract PR number from URL: ${prUrl}`);
  }

  // Fetch PR metadata
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  // Fetch the diff — fall back to local git if the API refuses (too large)
  let diff: string;
  try {
    const { data: diffData } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
      mediaType: { format: "diff" },
    });
    diff = diffData as unknown as string;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("too_large") || msg.includes("exceeded")) {
      diff = getLocalDiff(nwo, pr.base.sha, headSha);
    } else {
      throw err;
    }
  }

  // Fetch review comments with diff hunks (paginated)
  const commentDiffHunks = new Map<string, CommentContext>();
  let page = 1;
  while (true) {
    const { data: comments } = await octokit.rest.pulls.listReviewComments({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
      page,
    });

    for (const c of comments) {
      commentDiffHunks.set(String(c.id), {
        diffHunk: c.diff_hunk ?? "",
        line: c.line ?? null,
        originalLine: c.original_line ?? null,
        position: c.position ?? null,
        side: c.side ?? "RIGHT",
      });
    }

    if (comments.length < 100) break;
    page++;
  }

  const ctx: PRContext = {
    url: prUrl,
    nwo,
    title: pr.title,
    body: pr.body ?? "",
    diff: diff as unknown as string,
    head_sha: headSha,
    commentDiffHunks,
  };

  prCache.set(cacheKey, ctx);
  return ctx;
}

/**
 * Fetch commit context (diff, message) when there is no PR — just a repo+sha.
 * Uses the commits API to get the diff for a single commit.
 */
const commitCache = new Map<string, PRContext>();

export async function fetchCommitContext(
  nwo: string,
  sha: string
): Promise<PRContext> {
  const cacheKey = `${nwo}:${sha}`;
  if (commitCache.has(cacheKey)) {
    return commitCache.get(cacheKey)!;
  }

  const octokit = getOctokit();
  const [owner, repo] = nwo.split("/");

  const { data: commit } = await octokit.rest.repos.getCommit({
    owner,
    repo,
    ref: sha,
    mediaType: { format: "diff" },
  });

  // When requesting diff format, data is the raw diff string
  const diff = commit as unknown as string;

  // Fetch commit metadata separately
  const { data: commitMeta } = await octokit.rest.repos.getCommit({
    owner,
    repo,
    ref: sha,
  });

  const ctx: PRContext = {
    url: `https://github.com/${nwo}/commit/${sha}`,
    nwo,
    title: commitMeta.commit.message.split("\n")[0] ?? "",
    body: commitMeta.commit.message.split("\n").slice(1).join("\n").trim(),
    diff,
    head_sha: sha,
    commentDiffHunks: new Map(),
  };

  commitCache.set(cacheKey, ctx);
  return ctx;
}

/**
 * Extract the portion of a diff that's relevant to a specific file.
 * Returns the full diff if the file isn't found (fallback).
 */
export function extractFileDiff(fullDiff: string, filePath: string): string {
  const lines = fullDiff.split("\n");
  const fileHeader = `diff --git a/${filePath} b/${filePath}`;

  let start = -1;
  let end = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(fileHeader)) {
      start = i;
    } else if (
      start >= 0 &&
      i > start &&
      lines[i].startsWith("diff --git ")
    ) {
      end = i;
      break;
    }
  }

  if (start === -1) {
    // File not found in diff — return full diff truncated
    return fullDiff.slice(0, 10000);
  }

  return lines.slice(start, end).join("\n");
}
