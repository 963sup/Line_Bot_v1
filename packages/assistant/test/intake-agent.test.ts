/**
 * ============================================================================
 * 第一性原理分析：Issue 進件代理單元測試 (Intake Agent Unit Tests)
 * ============================================================================
 *
 * 1. 根本問題 (Root Problem):
 *    大語言模型在處理非同步對話與工具呼叫 (Function Calling) 時，具有不確定性。
 *    必須在離線純單元環境下驗證：時鐘錨定、時區換算（Taipei +08:00）、
 *    Thought Signature 的無損傳遞以及兩階段狀態限制（強制只能呼叫特定工具）。
 *
 * 2. 核心公理與測試不變量 (Core Axioms & Test Invariants):
 *    - 【確定性時間軸公理 (Deterministic Clock)】：
 *      注入固定 `now` 函數（如 UTC 14:00 換算為台北 22:00:00），驗證時間計算零誤差。
 *    - 【思考簽名保護公理 (Thought Signature Preservation)】：
 *      模型回傳的思維鏈簽章必須完整保留並在下一次調用回傳，符合 Gemini 規範。
 *    - 【嚴格契約驗證】：草稿資料結構缺失必要欄位時必須主動拒絕。
 * ============================================================================
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { GenerateContentResponse } from "@google/genai";
import { runIntakeAgent, validateIssueDraft } from "../src/agents/intake.js";

const draft = {
  title: "檢查設備",
  dueDate: "2026-09-06",
  timeHint: "下午",
  checklist: ["確認設備清單"],
  questions: ["由誰負責？"],
};
const result = (name: string, args: Record<string, unknown>) => {
  const response = new GenerateContentResponse();
  response.candidates = [
    {
      content: {
        role: "model",
        parts: [
          { thoughtSignature: "offline-signature", functionCall: { id: "call-id", name, args } },
        ],
      },
    },
  ];
  return response;
};

test("two tool calls use actual Taipei clock and preserve model thought signatures", async () => {
  let calls = 0;
  const output = await runIntakeAgent({
    model: "offline",
    input: "明天下午檢查設備",
    now: () => new Date("2026-09-05T14:00:00Z"),
    models: {
      generateContent: async (parameters) => {
        calls++;
        if (calls === 1) return result("get_current_time", {});
        assert.match(JSON.stringify(parameters.contents), /2026-09-05 22:00:00/);
        assert.match(JSON.stringify(parameters.contents), /offline-signature/);
        assert.deepEqual(
          parameters.config?.toolConfig?.functionCallingConfig?.allowedFunctionNames,
          ["draft_issue"],
        );
        return result("draft_issue", draft);
      },
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(output.toolCalls, ["get_current_time", "draft_issue"]);
  assert.match(output.text, /尚未儲存／指派/);
});

test("unexpected tools, invalid dates and excessive input are rejected", async () => {
  assert.throws(() => validateIssueDraft({ ...draft, dueDate: "2026-02-30" }));
  assert.throws(() => validateIssueDraft({ ...draft, command: "write-file" }));
  assert.throws(() => validateIssueDraft({ ...draft, checklist: [] }));
  let calls = 0;
  const models = {
    generateContent: async () => {
      calls++;
      return result("send_message", {});
    },
  };
  await assert.rejects(
    runIntakeAgent({ models, model: "offline", input: "test" }),
    /Unexpected time/,
  );
  await assert.rejects(
    runIntakeAgent({ models, model: "offline", input: "x".repeat(501) }),
    /Invalid agent input/,
  );
  assert.equal(calls, 1);
});
