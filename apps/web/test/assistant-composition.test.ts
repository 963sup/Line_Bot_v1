import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { agentText, aiTestText, answer } from "../src/modules/assistant/answer.server";

test("question failures retain shared cooldown for issue aliases and fixed probes without network", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousModel = process.env.GEMINI_MODEL;
  const time = mock.method(Date, "now", () => 100_000);
  const network = mock.method(globalThis, "fetch", async () => {
    throw new Error("unexpected network request");
  });
  try {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
    assert.equal(await answer("建立 Issue：巡檢"), await agentText("巡檢"));
    assert.equal(await answer("問題"), "AI 暫不可用或免費額度已達限制，請稍後再試。");
    process.env.GEMINI_API_KEY = "offline-test-key";
    process.env.GEMINI_MODEL = "offline-test-model";
    assert.equal(await agentText("巡檢"), "AI 冷卻中，請稍候 30 秒再試。");
    assert.equal(await answer("建立 Issue：巡檢"), "AI 冷卻中，請稍候 30 秒再試。");
    assert.equal(await aiTestText(), "AI 測試冷卻中，請稍候 15 秒再試。");
    assert.equal(await answer("問題"), "AI 冷卻中，請 30 秒後再試。");
    assert.equal(network.mock.callCount(), 0);
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = previousModel;
    time.mock.restore();
    network.mock.restore();
  }
});
