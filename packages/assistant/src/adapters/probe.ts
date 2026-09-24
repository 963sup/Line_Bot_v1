/**
 * ============================================================================
 * 第一性原理分析：AI 模型存活與連通性探針 (AI Liveness & Connectivity Probe)
 * ============================================================================
 *
 * 1. 根本問題 (Root Problem):
 *    在整合外部生成式 AI 服務時，需要確認 API Key、網路路由與模型名稱的有效性。
 *    若允許傳入任意使用者聊天文本或動態工具，容易造成安全漏洞（如提示詞外洩、誤扣款或非預期副作用）。
 *    探針必須在確保零隱私暴露與零非預期成本的前提下，驗證端對端通訊健康狀態。
 *
 * 2. 核心公理與物理約束 (Core Axioms & Constraints):
 *    - 【固定不變輸入公理 (Deterministic Fixed Input)】：
 *      探針僅發送完全固定的非敏感驗收語句，絕不接收來自 HTTP 或外部對話的動態內容。
 *    - 【無副作用公理 (Side-Effect-Free)】：
 *      不掛載任何 Function Calling 或工具鏈，杜絕模型執行任何外部寫入或查詢動作。
 *    - 【雙層逾時熔斷保護 (Dual-Timeout Circuit Breaker)】：
 *      結合 Client 端 AbortController (5,000ms 硬逾時) 與 HTTP 層 deadline (10,000ms)，
 *      並設置僅一次嘗試 (`retryOptions: { attempts: 1 }`)，防止線程遭延遲模型永久掛起。
 *    - 【緊湊輸出防禦 (Compact Output Bound)】：
 *      限制最大 token 數 (maxOutputTokens: 256) 與字串長度 (slice 0, 200)，防止異常長回應消耗記憶體。
 * ============================================================================
 */

import type { GenerateContentParameters } from "@google/genai";
import { requireValue } from "./provider-runtime.js";

/**
 * 執行 AI 模型存活與連線探針
 *
 * @param client GoogleGenAI 客戶端封裝實例
 * @param model 目標 Gemini 模型名稱 (例如 gemini-2.5-flash)
 * @returns 模型回應之確認短句字串 (截斷至最多 200 字)
 */
export async function runAiProbe(
  client: {
    models: {
      generateContent: (parameters: GenerateContentParameters) => Promise<{ text?: string }>;
    };
  },
  model: string,
): Promise<string> {
  // 檢驗必要模型參數，避免空字串呼叫造成無謂的網路往返
  requireValue(model, "GEMINI_MODEL");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // 透過 Promise.race 實現 5 秒強制中斷機制
    const result = await Promise.race([
      client.models.generateContent({
        model,
        contents: "請用繁體中文的一句短句確認你是工作助手，最多二十個字。",
        config: {
          maxOutputTokens: 256,
          httpOptions: { timeout: 10_000, retryOptions: { attempts: 1 } },
          abortSignal: controller.signal,
        },
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("AI probe timed out"));
        }, 5_000);
      }),
    ]);
    const text = result.text?.trim();
    if (!text) throw new Error("AI probe returned no text");
    return text.slice(0, 200);
  } finally {
    clearTimeout(timer);
  }
}
