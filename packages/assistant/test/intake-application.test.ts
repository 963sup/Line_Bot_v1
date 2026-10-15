import assert from "node:assert/strict";
import { test } from "node:test";
import { draftAssistantIssue } from "../src/application/use-cases/draft-issue.js";
import type { IntakeModel } from "../src/contracts/output/intake-model.js";

const draft = {
  title: "檢查設備",
  dueDate: "2026-09-06",
  timeHint: "下午",
  checklist: ["確認設備清單"],
  questions: [],
};

test("intake policy requests time before reading the clock and validating a draft without an SDK", async () => {
  const order: string[] = [];
  let firstSignal: AbortSignal | undefined;
  const model: IntakeModel = {
    requestTime: async (signal) => {
      order.push("time-request");
      firstSignal = signal;
    },
    draftIssue: async (time, signal) => {
      order.push("draft");
      assert.equal(signal, firstSignal);
      assert.deepEqual(time, {
        timezone: "Asia/Taipei",
        local: "2026-09-05 22:00:00",
        weekday: "星期六",
      });
      return draft;
    },
  };
  const now = () => {
    order.push("clock");
    return new Date("2026-09-05T14:00:00Z");
  };
  assert.deepEqual(await draftAssistantIssue({ input: "明天下午檢查設備", model, now }), draft);
  assert.deepEqual(order, ["time-request", "clock", "draft"]);
  for (const input of [" ", "x".repeat(501)])
    await assert.rejects(draftAssistantIssue({ input, model, now }), /Invalid agent input/);
  assert.deepEqual(order, ["time-request", "clock", "draft"]);
  await assert.rejects(
    draftAssistantIssue({
      input: "test",
      now,
      model: {
        requestTime: async () => {},
        draftIssue: async () => ({ ...draft, dueDate: "2026-02-30" }),
      },
    }),
    /Invalid draft date/,
  );
});

test("the intake operation deadline aborts the provider and prevents a later draft stage", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | undefined;
  let drafts = 0;
  let releaseTime: (() => void) | undefined;
  let clockRead: (() => void) | undefined;
  const timeReply = new Promise<void>((resolve) => {
    releaseTime = resolve;
  });
  const resumed = new Promise<void>((resolve) => {
    clockRead = resolve;
  });
  assert.ok(releaseTime && clockRead);
  const observeClock = clockRead;
  try {
    const pending = draftAssistantIssue({
      input: "test",
      now: () => {
        observeClock();
        return new Date();
      },
      model: {
        requestTime: async (value) => {
          signal = value;
          await timeReply;
        },
        draftIssue: async () => {
          drafts++;
          return draft;
        },
      },
    });
    const rejected = assert.rejects(pending, /Agent timed out/);
    t.mock.timers.tick(12_000);
    await rejected;
    assert.equal(signal?.aborted, true);
    releaseTime();
    await resumed;
    assert.equal(drafts, 0);
  } finally {
    t.mock.timers.reset();
  }
});
