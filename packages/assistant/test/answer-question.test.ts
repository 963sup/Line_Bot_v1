import assert from "node:assert/strict";
import { test } from "node:test";
import { createAnswerAssistantQuestion } from "../src/application/answer-question.js";

test("rules and issue delegation do not consume the question model or cooldown", async () => {
  const drafts: string[] = [];
  const answer = createAnswerAssistantQuestion({
    now: () => 123,
    acquireCooldown: () => {
      throw new Error("must not acquire question cooldown");
    },
    generate: async () => {
      throw new Error("must not call question model");
    },
    draftIssue: async (input) => {
      drafts.push(input);
      return "草稿";
    },
  });
  assert.deepEqual(await answer(""), { type: "help" });
  assert.deepEqual(await answer("今天幾號？"), { type: "time", at: 123 });
  assert.deepEqual(await answer("建立 Issue：巡檢"), { type: "text", text: "草稿" });
  assert.deepEqual(drafts, ["巡檢"]);
  assert.deepEqual(await answer("x".repeat(501)), { type: "tooLong" });
});

test("question cooldown gates concurrent calls and model output and failure stay bounded", async () => {
  let available = true;
  let calls = 0;
  let output: string | undefined = "  回覆  ";
  let fail = false;
  const answer = createAnswerAssistantQuestion({
    now: () => 0,
    acquireCooldown: () => {
      const allowed = available;
      available = false;
      return allowed;
    },
    draftIssue: async () => "",
    generate: async (input) => {
      assert.equal(input, "問題");
      calls++;
      if (fail) throw new Error("private provider error");
      return output;
    },
  });
  assert.deepEqual(await Promise.all([answer("問題"), answer("問題")]), [
    { type: "text", text: "回覆" },
    { type: "cooldown" },
  ]);
  assert.equal(calls, 1);
  available = true;
  output = "x".repeat(2001);
  assert.deepEqual(await answer("問題"), { type: "text", text: "x".repeat(2000) });
  available = true;
  output = undefined;
  assert.deepEqual(await answer("問題"), { type: "empty" });
  available = true;
  fail = true;
  assert.deepEqual(await answer("問題"), { type: "unavailable" });
  assert.deepEqual(await answer("問題"), { type: "cooldown" });
});
