/**
 * Bounds the judge calls made while scoring one pull request.
 *
 * A model call that never returns must not stall the run, so every judge
 * call (one matcher pass, one classifier pass) runs under a time budget.
 */

/** Base budget for one judge call. */
export const JUDGE_CALL_TIMEOUT_MS = Number(process.env.REVIEW_BENCH_JUDGE_TIMEOUT_MS ?? 10 * 60 * 1000);

/** Extra classifier budget per finding the judge has to classify. */
export const JUDGE_CALL_PER_FINDING_MS = 2 * 60 * 1000;

export class JudgeTimeout extends Error {
  constructor(what: string, ms: number) {
    super(`${what} did not answer within ${Math.round(ms / 1000)}s`);
    this.name = "JudgeTimeout";
  }
}

export function withTimeout<T>(promise: Promise<T>, what: string, ms = JUDGE_CALL_TIMEOUT_MS): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const clock = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new JudgeTimeout(what, ms)), ms);
    timer.unref();
  });
  return Promise.race([promise, clock]).finally(() => clearTimeout(timer));
}

export interface AskJudgeOptions {
  /** Names the call in messages, e.g. "owner/repo#12: classifier gpt-5". */
  what: string;
  timeoutMs?: number;
}

export function askJudge<T>(attempt: () => Promise<T>, opts: AskJudgeOptions): Promise<T> {
  return withTimeout(attempt(), opts.what, opts.timeoutMs);
}
