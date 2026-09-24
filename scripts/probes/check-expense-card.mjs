/**
 * ============================================================================
 * 第一性原理分析：LINE Flex 支出通知卡片語法校驗腳本 (Expense Card Validation Script)
 * ============================================================================
 *
 * 1. 根本問題 (Root Problem):
 *    LINE Flex Message JSON 結構複雜且具有極度嚴格的官方 schema 約束。
 *    若未經事先驗證直接向群組發送，格式錯誤將導致整筆推播失敗；若透過實際發送測試，
 *    又會對測試群組造成垃圾訊息干擾與 Quota 浪費。
 *
 * 2. 核心公理與離線核驗約束 (Core Axioms & Dry-Run Validation):
 *    - 【零實際發送公理 (Zero-Send Invariant)】：
 *      利用 LINE 官方 API 之 `validateReply` 端點，僅進行 JSON Schema 伺服端校驗，
 *      不發送任何實際推播訊息 (`messagesSent: 0`)。
 *    - 【脫敏與假名化】：使用合成的 UUID 與流水號測試卡片渲染，不洩漏任何真實支出實體。
 * ============================================================================
 */

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createLineClient } = await import(
  pathToFileURL(require.resolve("@line-work/line-channel/adapters/messaging")).href
);
const { tsImport } = require("tsx/esm/api");
const { renderExpenseNotice } = await tsImport(
  "../../apps/web/src/modules/expense/notice.server.ts",
  import.meta.url,
);
const { lineMiniApp } = await tsImport(
  "../../apps/web/src/shared/server/line-mini-app.ts",
  import.meta.url,
);

import { loadRootEnv } from "../runtime/load-env.mjs";

try {
  loadRootEnv();
  const client = createLineClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",
  });
  await client.validateReply({
    messages: [
      renderExpenseNotice(
        { id: "00000000-0000-4000-8000-000000000000", number: 5 },
        lineMiniApp().url,
      ),
    ],
  });
  console.log(JSON.stringify({ ok: true, validatedCards: 1, messagesSent: 0 }));
} catch {
  console.error("Expense notification validation failed. No message was sent.");
  process.exitCode = 1;
}
