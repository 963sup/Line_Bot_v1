/**
 * ============================================================================
 * 第一性原理分析：任務進件代理離線驗收腳本 (Agent Intake Verification Script)
 * ============================================================================
 *
 * 1. 根本問題 (Root Problem):
 *    在不向生產資料庫寫入垃圾資料、不觸發實際通訊軟體推送的前提下，
 *    如何對兩階段任務進件代理 (Intake Agent) 進行確定的鏈路驗收與工具調用檢驗？
 *
 * 2. 核心公理與驗收約束 (Core Axioms & Verification Discipline):
 *    - 【無副作用公理 (Zero-Side-Effect Verification)】：
 *      使用固定自然語言測試句，驗證代理之工具調用鏈（時間錨定 -> 任務草稿），
 *      失敗時明確回報狀態，且絕不造成任何資料持久化。
 *    - 【錯誤脫敏原則】：
 *      捕捉異常時僅輸出標準化 JSON 結構與 HTTP 狀態碼（若有），不反射包含金鑰或內部堆疊的原始錯誤物件。
 * ============================================================================
 */

import { createRequire } from "node:module";

const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { runIntakeAgent } = await import(require.resolve("@line-work/assistant/agents/intake"));
const { createGeminiClient } = await import(
  require.resolve("@line-work/assistant/adapters/gemini")
);

import { loadRootEnv } from "../runtime/load-env.mjs";

try {
  loadRootEnv();
  const result = await runIntakeAgent({
    models: createGeminiClient({ apiKey: process.env.GEMINI_API_KEY ?? "" }).models,
    model: process.env.GEMINI_MODEL ?? "",
    input: "明天下午檢查消防設備，整理成任務草稿。",
  });
  console.log(
    JSON.stringify({ ok: true, toolCalls: result.toolCalls, text: result.text }, null, 2),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      status: typeof error?.status === "number" ? error.status : undefined,
      message: "Agent acceptance failed; no task was persisted.",
    }),
  );
  process.exitCode = 1;
}
