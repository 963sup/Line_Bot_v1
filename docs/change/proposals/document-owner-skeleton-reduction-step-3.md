# Document owner skeleton reduction — Step 3: File → Intelligence → Vercel AI Gateway

**狀態：PR #412 已實施 provider adapter、structured gateway wiring 與 source layout；後續 current source 已具備 Contract SAVE implementation boundary。本文件仍保留完整來源證據、live provider 與正式入口 acceptance gate。** 前提：[Step 1 減法](document-owner-skeleton-reduction-step-1.md) 與 [Step 2 Port / Composition](document-owner-skeleton-reduction-step-2.md)。下一步：[Step 4 Contract 確認](document-owner-skeleton-reduction-step-4.md)。

**唯一目的：** 從一個經 File 授權且 SHA-256 已驗證的不可變檔案版本，取得**符合 Contract 自身 Schema 的完整採購單候選資料**，以 Intelligence 的 Attempt 證據保護不確定的 Gateway 執行。輸出是 *untrusted candidate*，**絕不直接 CONFIRM**。

## 1. 先區分兩條不是同一種資料的流程

| 能力 | 來源 | 輸出 | 業務消費者 | 可否直接 SAVE ContractDocument |
| --- | --- | --- | --- | --- |
| 一般 `ProcessingRun` | exact FileRevision | `{documentKind, observations: [{id,label,value,source,uncertain}]}` | File / Intelligence 預覽與人工編輯 | **不可**；缺少採購單完整行列、header/totals/terms 契約 |
| `DocumentIntake` | exact FileRevision + **Contract 的** `purchaseOrderExtractionSchema` | `PurchaseOrderCandidate` | Contract SAVE DRAFT | **可提交候選**；由 Contract 再驗證，**不可 CONFIRM** |

兩者可以重用同一個 Gateway SDK／Provider client，**不應先把採購單壓成最多 500 observations 再拼回完整行列**；那會增加資料失真、截斷與不可證明完整性的風險。

**已核對的 #412 與 current source 狀態：** `packages/integration-vercel/src/adapters/outbound/ai-gateway/document.ts` 提供 provider document transport，`scripts/intelligence/run.mjs` 已改接 `@line_bot_v1/integration-vercel/gateway` 的**公開、Contract Schema 驅動**能力，Contract SAVE implementation boundary 也已存在。完整來源證據、live provider 與正式入口 acceptance 仍未完成；一般 Web ProcessingRun 的 observations 與 DocumentIntake 的完整結構化輸出仍須分開測試。

## 2. 最小輸入與身份（不是全域共用 Aggregate）

Intelligence 現有 `IntakeCommand`：

```ts
type IntakeCommand = {
  action: "save";
  repositoryId: string;
  documentId: string;
  requestId: string;
  expectedVersion: number;        // ContractDocument optimistic version
  expectedLineCount: number;      // caller supplied; not independent source proof
  source: {
    fileId: string;
    fileRevisionId: string;
    fileSha256: string;           // SHA-256 of File's original bytes
  };
};
```

**完整的真實輸入** = 身份已驗證的 actor、上述 command、由 Contract 公開 contract 提供的 `{schemaId,schemaVersion,schema}`、以及固定的 extractor identity/version。嚴禁從 Gateway 自行選擇 Contract schema version 或猜測 source `latest`。

File `FileSourceReader.read(actor, repositoryId, {fileId,fileRevisionId})` 驗證當前授權、讀取 exact bytes；Intelligence 應再檢查回傳 Revision ID 與 command 的 SHA-256 一致。技術 Integration 不能略過 File Owner 的 Storage/Digest/permission 邊界，也不得將原始 bytes、service-role credentials 或 provider payload 記入日誌。

## 3. Contract 擁有的結構化輸出

**不要建立第二份 Intake Schema**。唯一權威：`packages/contract/src/contracts/input/document-intake.ts` 的 `purchaseOrderExtractionSchema`，由 Contract 定義、Intelligence 傳給 `DocumentExtractor`、Vercel Adapter 依需求轉為 SDK 結構化輸出。

```ts
type PurchaseOrderCandidate = {
  header: {
    documentNumber: string | null; revision: string | null;
    issueDate: string | null; title: string | null; currency: string | null;
  };
  buyer: { name: string | null; registrationNumber: string | null };
  seller: { name: string | null; registrationNumber: string | null };
  lines: Array<{
    sourceRowId: string; itemNumber: string | null;
    category: "material" | "service" | "freight" | "other" | null;
    materialCode: string | null; description: string | null;
    quantity: string | null; unit: string | null; unitPrice: string | null;
    grossAmount: string | null; discountAmount: string | null;
    netAmount: string | null; deliveryDate: string | null;
    sourcePages: number[]; uncertain: boolean;
  }>;
  totals: {
    gross: string | null; discount: string | null;
    net: string | null; tax: string | null; total: string | null;
  };
  terms: { text: string | null; sourcePages: number[] };
  fieldEvidence: Record<string, Array<{
    sourcePages: number[]; rawText: string | null; confidence: string | null;
  }>>;
  corrections: Array<{
    field: string; original: string | null; replacement: string; reason: string;
  }>;
};
```

**精確轉換約束：**

1. `lines` 必須對應來源文件的**每一個真正商業明細列**，原順序保留；一列對一個 `sourceRowId`。跨頁同一列不重複計數；不可合併相似列、以合計列代替明細列，或創造不存在的列。
2. `sourceRowId` 僅保證在**該份 ContractDocument 的該次來源／修訂範圍內**唯一；對同一原件重跑理想上應穩定。**現行 Schema 只有自由字串，Gateway prompt 不足以保證穩定或原文對應。** 目標做法是在 Intake 對來源頁／表格列位置建立經驗證的定位證據，對跨頁續列做明確合併規則；若無法建立可信定位，保留未確定性並交由人工覆核，不能單靠雜湊或 AI 自行編號宣稱原件行身份確定。正式切換前需用 fixtures 驗證；跨多份文件／版本的比較一律使用 `(documentId, revisionId, sourceRowId)` 複合鍵。
3. 金額與數量**維持 decimal 字串**。不得轉 `number`、補估稅率、四捨五入、轉換幣別、推定折扣符號或將缺失欄位填成 `0`。
4. 無法確認的值用 `null`，並保留 `uncertain`／`sourcePages`／`fieldEvidence`；不以猜測值和 `uncertain=false` 假裝有來源證據。
5. `expectedLineCount` 來自呼叫者，**僅是可供驗證的宣告**。不得把 `lines.length === expectedLineCount` 當成獨立的真實 PDF 完整性證明；需要人員對照原件頁面／表格計數。
6. `schemaId`、`schemaVersion`、extractor identity/version、精確 File source identity 必須包含在 Attempt 的不可變意圖 fingerprint（依現有 Intake 介面）；不同意圖不可共用 requestId。

## 4. 每個邊界做自己的驗證

| 邊界 | 接受什麼 | 驗證責任 | 失敗結果 |
| --- | --- | --- | --- |
| File → Intelligence | `FileSourceReference`、`Uint8Array` | 現行 actor / scope、精確 FileRevision、SHA-256、MIME／bytes 有效性 | FORBIDDEN / NOT_FOUND / SOURCE_MISMATCH / UNAVAILABLE |
| Intelligence → Gateway | Target-owned JSON Schema + exact bytes + extractor identity | 媒體格式、請求上限、SDK timeout、禁自動 provider retry、無 credentials 泄漏 | UNSUPPORTED_MEDIA / EXTRACTION_UNAVAILABLE / UNKNOWN |
| Gateway → Intelligence | 結構化候選物件 | 原始 Schema 的結構、型別、必填 key、陣列上下限、輸出大小；不要承擔 Contract 業務審核 | INVALID_PROVIDER_OUTPUT；不寫任何 Contract confirmation |
| Intelligence → Contract | 候選資料 + command/source/fingerprint | 只經 Contract **public SAVE** 命令；由 Contract 做業務資料驗證／回執 | Contract-owned INVALID_INPUT / VERSION_CONFLICT / receipt readback |

實作選擇：若 AI SDK 支援原 Contract Schema 的受限結構化輸出，**重用原 Schema**；若 provider 不支援某個 JSON Schema 關鍵字，Adapter 只能明確拒絕或使用經測試、等價且不放寬必要欄位的技術投影，再由 Contract 原 Schema/Domain 重驗。不能把 `observationsSchema` 冒充 `purchaseOrderExtractionSchema`。

## 5. 執行與恢復順序

```text
verify actor / command / exact source
  -> reserve (same intent fingerprint, durable attempt ID)
  -> find Contract receipt by actor+requestId+documentId
      -> exists & same identity => return it without Gateway call
      -> exists & conflicts     => REQUEST_ID_REUSED
  -> fresh attempt only: read exact File bytes
  -> call Gateway once (untrusted structured output)
  -> Contract SAVE via public IntakeTarget
  -> mark attempt COMPLETED with exact Contract revision receipt
```

**結果未知**（provider timeout／連線斷開／Contract commit 回應遺失）絕不能重跑 Gateway 來「補成功」。先讀 Contract receipt；若缺少可判斷的 durable evidence，維持 `UNKNOWN_RESULT`，以獨立新意圖或人工操作處理。讀檔前即失敗的可安全恢復流程與「Gateway 可能已執行」的 UNKNOWN 必須區分，但若需要修改狀態 schema，應先以獨立反例測試證明，保留歷史 Attempt。

**風險邊界：** 單次外部呼叫無法提供跨 PostgreSQL 的真正 exactly-once；目標是有 durable attempt/fencing 的 at-most-once provider invocation（依請求身份）與可查回執。當目前裝置／Provider 無法提供確定 outcome，不得回傳成功。

## 6. 最小實施面與驗收

**只改真正相關消費者：** `packages/integration-vercel` 的文件輸出公開能力、`scripts/intelligence/run.mjs` 的舊 Gateway 使用路徑、Intelligence 的 Contract Intake Composition／測試。必要時再補 Web 的正式入口，但一般 ProcessingRun route 不得偽裝成採購單審查頁面。Step 3 不改 Contract CONFIRM、Content、WBS Schema。

**必測反例：**

- 54 列跨頁來源 → 54 個唯一 `sourceRowId`、每列 `sourcePages`、無跨頁重複。
- 500 observations 的一般解析限制 **不可** 截斷正式採購單候選。
- `decimal "0.100"` 保留字串；不變成 JS 浮點。
- Gateway 回 `valid JSON` 但缺 `terms`、欄位型別錯誤、重複／缺列 → 不可當完整 Contract Candidate 接受。
- 檔案 digest 不合、無權限、不同 request fingerprint → Gateway 呼叫次數為 0。
- 同 requestId 已完成／執行中／UNKNOWN → Gateway 呼叫次數不增加，結果依 durable receipt/attempt 判定。
- provider timeout、Contract SAVE response lost → 無假成功、無第二份 Draft、必要時 `UNKNOWN_RESULT`。
- 實際提供的 PDF/JPEG/PNG/WebP 與所選模型之結構化輸出能力，需各自證明；mock 成功不等於 provider live 成功。

**Step 3 通過條件：** 由正式入口使用**新** Gateway public Port 及 Contract 原 Schema，獲得可交給 Contract SAVE 的完整候選；來源可追溯、無重複 provider 操作，固定 fixtures／交易測試及至少一個真實文件受控驗證有明確結果。未通過仍視為功能未完成。

## Reference

- `packages/file/src/contracts/output/references.ts`
- `packages/intelligence/src/application/use-cases/intake-document.ts`
- `packages/intelligence/src/contracts/output/document-intake.ts`
- `packages/contract/src/contracts/input/document-intake.ts`
- `packages/integration-vercel/src/adapters/outbound/ai-gateway/document.ts` (PR #412)
- `scripts/intelligence/run.mjs` (PR #412)
