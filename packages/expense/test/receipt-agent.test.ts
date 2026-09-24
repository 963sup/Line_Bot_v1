/**
 * ============================================================================
 * 第一性原理分析：收據多模態識別代理單元測試 (Receipt Agent Unit Tests)
 * ============================================================================
 *
 * 1. 根本問題 (Root Problem):
 *    在會計與財務審計領域，模型對模糊收據進行幻覺猜測 (Hallucination)
 *    遠比明確回報空值 (null) 更具破壞性。
 *
 * 2. 核心公理與確定性約束 (Core Axioms & Test Invariants):
 *    - 【不確定性轉為缺失公理 (Missing Over Guessing)】：
 *      任何在 `uncertainFields` 列表中被標記為不確定的欄位（如金額），
 *      清洗器必須強制抹除為 `null`，絕不將猜測數字提交給記帳者。
 *    - 【嚴格日期與數值正規化】：如 `2026-02-30` 等無效日期或非標金額字串必須被清洗為 `null`。
 *    - 【無工具與單次嘗試 (Zero Tool / No Retry Flooding)】：
 *      識別請求不掛載任何外掛工具，重試次數強制為 1，防止高頻循環重試。
 * ============================================================================
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { runReceiptAgent, validateReceiptReading } from "../src/agents/receipt.js";

const reading = {
  isReceipt: true,
  merchant: "DEMO",
  date: "2026-09-06",
  amount: "1260",
  currency: "TWD",
  invoiceNumber: null,
  uncertainFields: [],
};
test("uncertain money and invalid dates become missing fields instead of guesses", () => {
  assert.equal(validateReceiptReading({ ...reading, uncertainFields: ["amount"] }).amount, null);
  assert.equal(validateReceiptReading({ ...reading, date: "2026-02-30" }).date, null);
  assert.equal(validateReceiptReading({ ...reading, amount: "1,260" }).amount, null);
  assert.throws(() => validateReceiptReading({ ...reading, uncertainFields: ["execute"] }));
});
test("receipt agent sends bounded image with schema and no tools", async () => {
  const result = await runReceiptAgent({
    model: "offline",
    mimeType: "image/png",
    image: new Uint8Array([1, 2, 3]),
    models: {
      generateContent: async (parameters) => {
        assert.equal(parameters.config?.tools, undefined);
        assert.equal(parameters.config?.responseMimeType, "application/json");
        assert.equal(parameters.config?.httpOptions?.retryOptions?.attempts, 1);
        assert.match(JSON.stringify(parameters.contents), /AQID/);
        return { text: JSON.stringify(reading) };
      },
    },
  });
  assert.equal(result.amount, "1260");
});
