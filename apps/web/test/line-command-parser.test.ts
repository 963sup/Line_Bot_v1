import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAssistantCommand } from "../src/modules/assistant/command-parser.server";

test("command extraction preserves existing matching and precedence", () => {
  for (const [input, expected] of [
    [" 上班！ ", "clockIn"],
    ["下班", "clockOut"],
    ["打卡", "attendance"],
    ["填寫工作日誌", "diary"],
    ["取消！", "cancel"],
    ["算了", "cancel"],
    ["取消記帳", "receipt"],
    ["收據", "receipt"],
    [" 取消 ", "answer"],
    ["今天幾號", "answer"],
    ["建立任務：巡檢", "answer"],
  ])
    assert.equal(parseAssistantCommand(input!), expected);
});
