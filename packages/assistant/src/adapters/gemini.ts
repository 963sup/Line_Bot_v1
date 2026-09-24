/**
 * ============================================================================
 * 第一性原理分析：Gemini Developer API 客戶端適配器
 * ============================================================================
 *
 * 1. 根本問題 (Root Problem):
 *    在本地開發與非計費環境中，調用 Google AI 必須具有明確的成本邊界與逾時保護，
 *    絕不可因預設配置錯誤導致意外啟用 Vertex AI 計費或產生無窮重試風暴。
 *
 * 2. 核心公理與物理約束 (Core Invariants):
 *    - 【免費層保證 (Free-Tier Discipline)】：強制指定 `vertexai: false`，嚴格限制僅透過
 *      Google AI Studio Developer API Free Tier 調用，杜絕意外產生 Google Cloud 帳單。
 *    - 【緊湊逾時與零雪崩重試】：設置 10,000ms 嚴格網路逾時與僅 1 次重試 (attempts: 1)，
 *      防止模型延遲導致 LINE Webhook 事件處理線程耗盡或重複計費。
 *    - 【邊界防護】：引入 server.js 確保 API Key 絕不進入客戶端 bundle。
 * ============================================================================
 */

import { GoogleGenAI } from "@google/genai";
import { requireValue } from "./provider-runtime.js";

export { runAiProbe as runGeminiProbe } from "./probe.js";

/**
 * 建立具備成本防禦與嚴格逾時的 Gemini 官方 SDK 實例
 */
export function createGeminiClient(config: { apiKey: string }) {
  return new GoogleGenAI({
    vertexai: false,
    apiKey: requireValue(config.apiKey, "GEMINI_API_KEY"),
    httpOptions: { apiVersion: "v1beta", timeout: 10_000, retryOptions: { attempts: 1 } },
  });
}
