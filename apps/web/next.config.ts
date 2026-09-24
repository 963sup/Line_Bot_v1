/**
 * ============================================================================
 * 第一性原理分析：Next.js 全域安全與構建組態 (Next.js Security & Build Config)
 * ============================================================================
 *
 * 1. 根本問題 (Root Problem):
 *    Web 應用程式作為面對公網與 LINE Webview 的中樞。
 *    若未配置嚴格的 HTTP 安全標頭與日誌策略，OAuth 授權碼 (`code`) 與一次性 Token
 *    可能透過開發日誌、Referer 洩漏給第三方，或遭點擊劫持 (Clickjacking) 攻擊。
 *
 * 2. 核心公理與安全約束 (Core Axioms & Security Controls):
 *    - 【零 URL 授權碼日誌洩漏 (Zero Logging of OAuth Tokens)】：
 *      `logging: { incomingRequests: false }`，徹底防止含有高熵授權碼的網址進入開發日誌或監控串流。
 *    - 【無標識防指紋公理 (Fingerprint Minimization)】：
 *      `poweredByHeader: false` 抹除 X-Powered-By 伺服器指紋。
 *    - 【敏感路由防護矩陣 (Security Headers Matrix)】：
 *      針對 `/expenses`, `/membership`, `/settings`, `/api/membership` 等 private surfaces 強制注入：
 *        - `Referrer-Policy: no-referrer`：阻斷參照網址外洩。
 *        - `Cache-Control: no-store`：杜絕敏感使用者資料在中間代理快取。
 *        - `X-Content-Type-Options: nosniff`：防止 MIME 混淆攻擊。
 *        - `X-Frame-Options: DENY`：防範點擊劫持。
 * ============================================================================
 */

import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const root = fileURLToPath(new URL("../../", import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: root,
  turbopack: { root },
  poweredByHeader: false,
  // OAuth 回調包含一次性授權碼；開發與執行期間嚴禁記錄傳入請求的完整 URL
  logging: { incomingRequests: false },
  serverExternalPackages: ["@line-work/infrastructure"],
  async redirects() {
    return [
      {
        source: "/orgs/:login/teams/:teamSlug",
        destination: "/organizations/:login/teams/:teamSlug",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      "/expenses",
      "/membership/:path*",
      "/attendance/:path*",
      "/settings/:path*",
      "/enterprises/:path*",
      "/organizations/:path*",
      "/team/:path*",
      "/repositories/:path*",
      "/:login/:repository/:path*",
      "/api/issues/:path*",
      "/api/team/:path*",
      "/groups/:path*",
      "/api/membership/:path*",
      "/api/attendance/:path*",
      "/api/groups/:path*",
    ].map((source) => ({
      source,
      headers: [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Cache-Control", value: "no-store" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    }));
  },
};

const sentryBuildEnabled = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT,
);

export default sentryBuildEnabled
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: true,
    })
  : nextConfig;
