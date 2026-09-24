/**
 * ============================================================================
 * 第一性原理分析：Gemini Developer API 連通性探針腳本 (Gemini Probe Script)
 * ============================================================================
 *
 * 1. 根本問題 (Root Problem):
 *    在啟動大語言模型整合或排查故障時，如何快速確認 API Key、配額（Quota）及模型可用性，
 *    並絕對杜絕意外降級至付費模型或產生未預期的帳單？
 *
 * 2. 核心公理與免費層邊界 (Core Axioms & Free-Tier Guard):
 *    - 【固定無副作用提示詞 (Fixed Probe Sentence)】：
 *      僅向模型發送預設固定句（如 "Respond with 'ok'."），嚴禁將使用者的群聊或日誌輸入模型。
 *    - 【零付費降級原則 (No Paid Fallback)】：
 *      明確限制於 Developer API 免費層；若失敗直接拋出錯誤並標記 status，絕不自動切換至 Vertex AI 或付費 API。
 * ============================================================================
 */

import { createRequire } from "node:module";

const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createGeminiClient, runGeminiProbe } = await import(
  require.resolve("@line-work/assistant/adapters/gemini")
);

import { loadRootEnv } from "../runtime/load-env.mjs";

try {
  loadRootEnv();
  const { GEMINI_API_KEY: apiKey, GEMINI_MODEL: model } = process.env;
  if (!apiKey || !model) throw new Error("Missing Gemini configuration");
  const text = await runGeminiProbe(createGeminiClient({ apiKey }), model);
  console.log(JSON.stringify({ ok: true, api: "Gemini Developer API", model, text }, null, 2));
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      status: typeof error?.status === "number" ? error.status : undefined,
      message:
        "Gemini probe failed; check API key, free quota, model availability or timeout. No paid fallback.",
    }),
  );
  process.exitCode = 1;
}
