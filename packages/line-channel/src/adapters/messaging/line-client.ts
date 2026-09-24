/**
 * ============================================================================
 * 第一性原理分析：LINE 基礎設施適配器 (LINE Infrastructure Adapter)
 * ============================================================================
 *
 * 1. 根本問題 (Root Problem):
 *    LINE Platform 與本系統透過公開網際網路進行雙向通訊。
 *    外部 Webhook 呼叫必須經過密碼學數位簽章驗證以證明身分來源；
 *    對應的主動訊息推送必須具備正確的 Bearer Token 授權，且憑證絕不可在客戶端曝光。
 *
 * 2. 核心公理 (Core Axioms):
 *    - 【位元組保真度 (Byte Fidelity)】：HMAC-SHA256 簽章是針對原始位元組串流進行計算。
 *      任何在驗簽前對 Body 進行的字串轉換、空白過濾或 JSON 解析，都會因編碼規範不同
 *      （例如換行符號 CR/LF、物件鍵排序、Unicode 轉義）破壞摘要，導致驗簽不可逆地失敗。
 *    - 【安全邊界 (Server-Only)】：引入 server.js 確保此模組絕不被 Webpack/Vite 打包至前端 bundle。
 * ============================================================================
 */

import "../../server.js";
import { LineBotClient } from "@line/bot-sdk";
import { requireValue } from "../../config.js";

/**
 * 建立 LINE 官方 Messaging API 客戶端
 * 遵循延遲求值 (Lazy Evaluation) 原則，僅在調用時檢驗環境變數。
 */
export function createLineClient(config: { channelAccessToken: string }) {
  return LineBotClient.fromChannelAccessToken({
    channelAccessToken: requireValue(config.channelAccessToken, "LINE_CHANNEL_ACCESS_TOKEN"),
  });
}
