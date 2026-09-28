/**
 * ============================================================================
 * 第一性原理分析：LINE 訊息二進位圖片下載器 (LINE Image Streaming Downloader)
 * ============================================================================
 *
 * 1. 根本問題 (Root Problem):
 *    從通訊軟體內容分發網路 (LINE Data CDN) 下載報帳憑證圖像。
 *    面對惡意超大檔案（記憶體耗盡 DoS 攻擊）、假冒副檔名的偽造檔案（MIME 偽造）、
 *    非預期重定向攻擊 (Open Redirect)、以及未經授權的圖片存取，
 *    系統必須在零硬碟落盤的前提下，以串流模式完成嚴格的實體邊界檢查。
 *
 * 2. 核心公理與物理安全邊界 (Core Axioms & Boundaries):
 *    - 【記憶體串流保護 (Memory Stream Bounding)】：
 *      在底層 ReadableStream 讀取過程中即時累計 byte 長度，上限嚴格設為 5MB (5 * 1024 * 1024)。
 *      一旦超過立即 abort 串流並拋出異常，絕不預先配置大記憶體塊。
 *    - 【魔術字節先驗驗證 (Magic Bytes Verification)】：
 *      絕不信任 HTTP Content-Type 標頭（攻擊者可隨意偽造）。
 *      - PNG: 必須精確符合 8-byte 簽章 `[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]`。
 *      - JPEG: 必須精確符合 SOI (Start of Image) 標記 `[0xFF, 0xD8, 0xFF]`。
 *      非合法圖片格式直接拋出 "Unsupported image format" 阻斷進入後續處理。
 *    - 【零落盤隱私保證 (Zero-Disk-Persistence)】：
 *      回傳記憶體中的 `Uint8Array`，辨識流程結束後由 V8 自動垃圾回收，不在伺服器檔案系統留下殘留副本。
 *    - 【嚴格網路防護】：5,000ms 逾時斷開，並設定 `redirect: "error"` 阻斷轉跳。
 * ============================================================================
 */

import "../../server.js";
import { requireValue } from "../../config.js";

/**
 * 記憶體安全下載 LINE 訊息影像內容
 *
 * @param messageId LINE 訊息 ID (嚴格校驗純數字)
 * @param accessToken LINE Channel Access Token
 * @returns 圖片二進位 buffer 與驗證後的 MIME 類型
 */
export async function downloadLineImage(
  messageId: string,
  accessToken: string,
): Promise<{ image: Uint8Array; mimeType: "image/png" | "image/jpeg" }> {
  // 檢驗 Channel Access Token
  requireValue(accessToken, "LINE_CHANNEL_ACCESS_TOKEN");
  // 訊息 ID 格式白名單校驗，防範 URL 路徑注入
  if (!/^\d{1,100}$/.test(messageId)) throw new Error("Invalid image ID");

  const response = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(5_000),
    redirect: "error",
  });
  if (!response.ok || !response.body) throw new Error("LINE image unavailable");

  // 串流邊界讀取：即時計算尺寸，防範記憶體溢位
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 5 * 1024 * 1024) throw new Error("Image too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  const image = Buffer.concat(chunks);
  // 魔術字節真實性核對：精確檢查二進位檔案頭特徵
  const png = image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = image[0] === 255 && image[1] === 216 && image[2] === 255;
  if (!png && !jpeg) throw new Error("Unsupported image format");

  return { image, mimeType: png ? "image/png" : "image/jpeg" };
}
