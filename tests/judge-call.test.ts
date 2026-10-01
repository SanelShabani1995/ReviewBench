import assert from "node:assert/strict";
import test from "node:test";

import { JudgeTimeout, withTimeout } from "../scripts/eval/judge-call.js";

test("withTimeout aborts and waits for judge cleanup before rejecting", async () => {
  let cleanedUp = false;

  await assert.rejects(
    withTimeout(
      (signal) => new Promise<void>((_, reject) => {
        signal.addEventListener("abort", () => {
          cleanedUp = true;
          reject(new Error("aborted"));
        }, { once: true });
      }),
      "test judge",
      5,
    ),
    JudgeTimeout,
  );

  assert.equal(cleanedUp, true);
});
