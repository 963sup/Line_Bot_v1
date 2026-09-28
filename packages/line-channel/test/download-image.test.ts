/**
 * ============================================================================
 * 第一性原理分析：LINE 圖片串流下載防禦單元測試 (Line Image Download Tests)
 * ============================================================================
 *
 * 1. 根本問題 (Root Problem):
 *    從外部通訊平台下載使用者上傳之圖片時，面臨伺服端請求偽造 (SSRF)、
 *    巨量檔案記憶體崩潰 (OOM Bomb)、非圖片惡意檔案注入、以及重定向劫持等嚴重威脅。
 *
 * 2. 核心公理與防護邊界 (Core Axioms & Defense Boundaries):
 *    - 【固定官方端點公理 (Fixed Endpoint SSRF Immunity)】：
 *      下載端點硬編碼為 `https://api-data.line.me/v2/bot/message/{id}/content`，
 *      且不跟隨任何 HTTP 重新導向 (`redirect: 'error'`)，根除 SSRF 漏洞。
 *    - 【位元組邊界與型態白名單】：
 *      嚴格限制最大 5MB，超出即刻拒絕；並基於魔術數字 (Magic Numbers) 檢驗是否為合法 JPEG/PNG。
 * ============================================================================
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { downloadLineImage } from "../src/adapters/messaging/download-image.js";

test("LINE image adapter uses a fixed endpoint, bounds bytes and rejects non-images", async (t) => {
  let body = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api-data.line.me/v2/bot/message/123/content");
    assert.equal(init.redirect, "error");
    assert.ok(init.signal);
    return new Response(body);
  });
  assert.equal((await downloadLineImage("123", "offline-token")).mimeType, "image/png");
  body = new TextEncoder().encode("<html>not an image</html>");
  await assert.rejects(downloadLineImage("123", "offline-token"), /Unsupported/);
  body = new Uint8Array(5 * 1024 * 1024 + 1);
  await assert.rejects(downloadLineImage("123", "offline-token"), /too large/);
  await assert.rejects(
    downloadLineImage("https://other.invalid", "offline-token"),
    /Invalid image ID/,
  );
});
