/**
 * ============================================================================
 * 第一性原理分析：基礎設施強型別配置校驗 (Configuration Strict Invariant Guard)
 * ============================================================================
 *
 * 1. 根本問題 (Root Problem):
 *    環境變數（如 LINE Channel Secret、Gemini API Key）缺失或為空字串時，
 *    若延遲至下游業務深處才引發非預期 `null pointer`，除難以除錯外，更可能造成系統處於未授權的脆弱狀態。
 *
 * 2. 核心公理 (Core Axiom):
 *    - 【早崩潰原則 (Fail-Fast Configuration Constraint)】：
 *      任何必要的環境配置必須在接觸外部適配器前進行非空白字串校驗，
 *      一旦缺失立即拋出明確語意的 Error，阻斷不安全啟動。
 * ============================================================================
 */

export function requireValue(value: string, name: string): string {
  if (!value.trim()) throw new Error(`Missing required configuration: ${name}`);
  return value;
}
