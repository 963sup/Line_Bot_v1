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
 *    - 【模型輸出隔離】：
 *      模型輸出只能作為草稿，並由使用案例的時鐘與契約驗證限制。
 *    - 【嚴格契約驗證】：草稿資料結構缺失必要欄位時必須主動拒絕。
 * ============================================================================
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { runIntakeAgent, validateIssueDraft } from "../src/composition/bootstrap/intake-agent.js";

const draft = {
  title: "檢查設備",
  dueDate: "2026-09-06",
  timeHint: "下午",
  checklist: ["確認設備清單"],
  questions: ["由誰負責？"],
};
test("injected intake model uses actual Taipei clock and preserves the staged calls", async () => {
  let calls = 0;
  const output = await runIntakeAgent({
    input: "明天下午檢查設備",
    now: () => new Date("2026-09-05T14:00:00Z"),
    model: {
      toolCalls: ["get_current_time", "draft_issue"],
      requestTime: async () => {
        calls++;
      },
      draftIssue: async (time) => {
        calls++;
        assert.match(time.local, /2026-09-05 22:00:00/);
        return draft;
      },
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(output.toolCalls, ["get_current_time", "draft_issue"]);
  assert.deepEqual(output.draft, draft);
  assert.equal(
    output.text,
    [
      "📝 Issue 草稿（尚未儲存／指派）",
      draft.title,
      "日期：2026-09-06 下午",
      "建議待辦：",
      "1. 確認設備清單",
      "待確認：",
      "• 由誰負責？",
      "工具：get_current_time → draft_issue",
    ].join("\n"),
  );
});

test("unexpected tools, invalid dates and excessive input are rejected", async () => {
  assert.throws(() => validateIssueDraft({ ...draft, dueDate: "2026-02-30" }));
  assert.throws(() => validateIssueDraft({ ...draft, command: "write-file" }));
  assert.throws(() => validateIssueDraft({ ...draft, checklist: [] }));
  let calls = 0;
  const model = {
    requestTime: async () => {
      calls++;
      throw new Error("Unexpected time tool call");
    },
    draftIssue: async () => draft,
  };
  await assert.rejects(runIntakeAgent({ model, input: "test" }), /Unexpected time/);
  await assert.rejects(runIntakeAgent({ model, input: "x".repeat(501) }), /Invalid agent input/);
  assert.equal(calls, 1);
});
