import type { messagingApi } from "@line-work/line-channel/adapters/messaging";
/**
 * ============================================================================
 * 第一性原理分析：LINE 支出通知卡片渲染器 (Expense Flex Message Renderer)
 * ============================================================================
 *
 * 1. 根本問題 (Root Problem):
 *    在多人通訊軟體群組中，若將報帳金額、商家或機密發票號碼直接公布於聊天室，
 *    會造成群組隱私外洩與資訊干擾。同時，操作入口必須安全地引導使用者進入專屬
 *    授權的 Webview (LIFF / MINI App)，而不是在公開訊息中直接暴露操作命令。
 *
 * 2. 核心公理與設計原則 (Core Axioms & Constraints):
 *    - 【群組最小隱私暴露 (Minimal Group Disclosure)】：
 *      群組訊息中僅揭示流水號 (`#number`) 與待處理狀態，完全不揭示金額、商家或發票明細。
 *    - 【安全網址派生 (Deterministic URI Parameterization)】：
 *      以 LIFF ID 為前綴，並將 `expense.id` 進行標準 URI 編碼傳遞，
 *      確保點擊後由 In-App 瀏覽器載入並在後端驗證身分。
 * ============================================================================
 */

import { miniAppEntryUrl } from "../../shared/presentation/entry-route";

/**
 * 渲染新支出待處理 Flex 訊息卡片
 *
 * @param expense 支出基本索引 (id 與序號 number)
 * @param miniAppUrl LINE MINI App permanent URL
 * @returns 符合 LINE Messaging API 規範之 FlexMessage 物件
 */
export function renderExpenseNotice(
  expense: { id: string; number: number },
  miniAppUrl: string,
): messagingApi.FlexMessage {
  const text = `🧾 新支出 #${expense.number} · 待處理`;
  return {
    type: "flex",
    altText: text,
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        contents: [{ type: "text", text, wrap: true, size: "md" }],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            height: "sm",
            action: {
              type: "uri",
              label: "處理",
              uri: miniAppEntryUrl(miniAppUrl, "expense", expense.id),
            },
          },
        ],
      },
    },
  };
}
