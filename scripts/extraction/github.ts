/**
 * GitHub API helpers for extraction.
 *
 * Note: scripts/classifier/github.ts has a separate Octokit wrapper
 * for fetching PR context (diff, title, body, comment diff hunks).
 * The classify-adapter imports from that module directly.
 * This module handles review comment fetching for extraction.
 */

import { Octokit } from "octokit";

let _octokit: Octokit | undefined;

export function getOctokit(): Octokit {
  if (!_octokit) {
    const token = process.env.GH_TOKEN;
    if (!token) {
      throw new Error("GH_TOKEN environment variable is required");
    }
    _octokit = new Octokit({ auth: token });
  }
  return _octokit;
}

export interface ReviewComment {
  id: number;
  body: string;
  path: string;
  line: number | null;
  startLine: number | null;
  originalLine: number | null;
  originalStartLine: number | null;
  side: string;
  commitId: string;
  inReplyToId: number | null;
  createdAt: string;
  htmlUrl: string;
  user: {
    login: string;
    type: string;
  };
}

export interface PRMetadata {
  title: string;
  body: string;
  baseSha: string;
  headSha: string;
  state: string;
}

export async function fetchPRMetadata(
  nwo: string,
  prNumber: number,
): Promise<PRMetadata | null> {
  const octokit = getOctokit();
  const [owner, repo] = nwo.split("/");

  try {
    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    return {
      title: pr.title,
      body: pr.body ?? "",
      baseSha: pr.base.sha,
      headSha: pr.head.sha,
      state: pr.state,
    };
  } catch {
    return null;
  }
}

export async function fetchReviewComments(
  nwo: string,
  prNumber: number,
): Promise<ReviewComment[] | null> {
  const octokit = getOctokit();
  const [owner, repo] = nwo.split("/");

  try {
    const comments: ReviewComment[] = [];
    let page = 1;

    while (true) {
      const { data } = await octokit.rest.pulls.listReviewComments({
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
        page,
      });

      for (const c of data) {
        comments.push({
          id: c.id,
          body: c.body,
          path: c.path,
          line: c.line ?? null,
          startLine: c.start_line ?? null,
          originalLine: c.original_line ?? null,
          originalStartLine: c.original_start_line ?? null,
          side: c.side ?? "RIGHT",
          commitId: c.commit_id,
          inReplyToId: c.in_reply_to_id ?? null,
          createdAt: c.created_at,
          htmlUrl: c.html_url,
          user: {
            login: c.user?.login ?? "",
            type: c.user?.type ?? "User",
          },
        });
      }

      if (data.length < 100) break;
      page++;
    }

    return comments;
  } catch {
    return null;
  }
}
