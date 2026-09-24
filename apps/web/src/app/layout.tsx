/**
 * ============================================================================
 * 第一性原理分析：根佈局與全域視覺容器 (Root Layout & Global Visual Container)
 * ============================================================================
 *
 * 1. 根本問題 (Root Problem):
 *    作為 Web 與 LINE In-App 視窗 (LIFF) 的頂層 HTML 根容器。
 *    若未統一語言編碼宣告與全域樣式約束，將在行動裝置瀏覽器中引發字型渲染跳動 (FOUT)、
 *    觸控縮放破版或多租戶視窗樣式污染。
 *
 * 2. 核心公理與設計規範 (Core Axioms & Layout Invariants):
 *    - 【語義清晰公理 (Semantic Localization)】：
 *      宣告 `<html lang="zh-Hant">`，確保繁體中文排版在跨平台裝置的斷詞、字型渲染與語音輔助完全正確。
 *    - 【單一全域樣式引入 (Single CSS Pipeline)】：
 *      僅在此根組件引入 `./globals.css`，其餘頁面純粹以實體樣式隔離，杜絕分散樣式引發的特異性 (Specificity) 衝突。
 * ============================================================================
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { VercelObservability } from "../shared/browser/vercel-observability";
import "./globals.css";

export const metadata: Metadata = {
  title: "LINE 工作助手",
  description: "工作群組的任務協作空間。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        {children}
        {process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production" && (
          <VercelObservability />
        )}
      </body>
    </html>
  );
}
