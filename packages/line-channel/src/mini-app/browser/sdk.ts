/**
 * ============================================================================
 * 第一性原理分析：LINE 前端 In-App LIFF SDK 全域型別宣告 (LIFF Global Declaration)
 * ============================================================================
 *
 * 1. 根本問題 (Root Problem):
 *    在 TypeScript 嚴格型別檢查環境下，透過 CDN 動態載入的外部 In-App SDK
 *    (`https://static.line-scdn.net/liff/edge/2/sdk.js`) 附加於瀏覽器 `window` 物件。
 *    若缺乏明確的強型別介面宣告，將導致編譯階段型別錯誤，或促使開發者濫用 `any` 喪失型別安全防線。
 *
 * 2. 核心公理與最小介面原則 (Core Axioms & Lean Interface):
 *    - 【按需宣告原則 (Minimal Surface Area)】：
 *      僅宣告本系統實際調用的 LIFF SDK 核心方法（初始化、登入狀態查詢、Token 獲取、客戶端檢驗、視窗關閉與外部開啟），
 *      杜絕載入多餘未使用的外部 API 型別負擔。
 *    - 【Nullable 嚴格語義】：`getAccessToken` 明確標記返回 `string | null`，強制呼叫端處理未登入狀態。
 * ============================================================================
 */

export {};

type Liff = {
  init: (v: { liffId: string }) => Promise<void>;
  isLoggedIn: () => boolean;
  login: (options?: { redirectUri: string }) => void;
  getProfile: () => Promise<{ userId: string; displayName: string; pictureUrl?: string }>;
  getAccessToken: () => string | null;
  isInClient: () => boolean;
  closeWindow: () => void;
  openWindow: (options: { url: string; external: boolean }) => void;
};

declare global {
  interface Window {
    liff: Liff;
  }
}
