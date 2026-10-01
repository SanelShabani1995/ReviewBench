/**
 * Bounding and retrying the judge calls made while scoring one pull request.
 *
 * A model call that never returns must not stall the run, so every judge
 * call (one matcher pass, one classifier pass) runs under a time budget.
 * In a council a judge that fails is given one more attempt from a fresh
 * session and then abstains for that pull request, so a single bad answer
 * does not fail the run. With one judge every error propagates, as before.
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
  /** Whether other judges can cover for this one. */
  council: boolean;
  timeoutMs?: number;
  log?: (message: string) => void;
}

/**
 * Run one judge call. `attempt` starts a fresh session each time it is called.
 *
 * Returns the answer, or undefined when the judge abstains. A council judge
 * abstains after a timeout, or after an error that repeats on a second
 * attempt. A lone judge never abstains: its error is thrown.
 */
export async function askJudge<T>(attempt: () => Promise<T>, opts: AskJudgeOptions): Promise<T | undefined> {
  const { what, council, timeoutMs = JUDGE_CALL_TIMEOUT_MS, log = () => {} } = opts;
  try {
    return await withTimeout(attempt(), what, timeoutMs);
  } catch (err) {
    if (!council) throw err;
    if (err instanceof JudgeTimeout) {
      log(`${err.message}; abstains`);
      return undefined;
    }
    log(`${what} failed: ${describe(err)}; retrying once from a fresh session`);
  }
  try {
    return await withTimeout(attempt(), what, timeoutMs);
  } catch (err) {
    log(`${what} failed again: ${describe(err)}; abstains`);
    return undefined;
  }
}

function describe(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.split("\n")[0].slice(0, 300);
}
