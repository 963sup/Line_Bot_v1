# Document owner skeleton reduction — Step 4: Contract SAVE / REVIEW / CONFIRM

**狀態：目標設計，未完成實作驗證。** 上一步：[Step 3 Gateway → 候選資料](document-owner-skeleton-reduction-step-3.md)；下一步：[Step 5 Contract → Content](document-owner-skeleton-reduction-step-5.md)。

**唯一目的：** 把不可信 `PurchaseOrderCandidate` 經 Contract **自己的**資料規則與人工覆核，變成可追溯、不可修改的 `CONFIRMED ContractDocumentRevision`。這表示商業事實經確認，**不保證** Content 可展開或 WBS 已批准。工程承諾 `EngineeringContract` 是同 Owner 的獨立 Aggregate，不納入本 Step 的採購單閉環。

## 1. 事實與信任邊界

| 事實 | Authority | 不可交給誰 |
| --- | --- | --- |
| File bytes / exact SHA-256 | File | Contract、AI Gateway |
| 解析 Attempt、結果不明／處理回執 | Intelligence | Contract |
| 採購單完整 `PurchaseOrderCandidate`、DRAFT/CONFIRMED、確認理由及 Receipt | **Contract** | Gateway、Content、WBS |
| 工作結構、工程數量映射 | Content | Contract |
| Baseline 的核准 | WBS | Contract |

Contract 接到的 candidate 即使符合 JSON Schema，仍是**未確認資料**。它只能以 public `ContractDocumentIntake.submit` SAVE Draft，不能由 Intelligence、SDK 或 Web 的 provider result 直接寫 CONFIRMED。Actor 身份、Repository 授權、來源資格、expectedVersion、request identity 均必須在 Contract 自己的交易邊界重新檢查。

## 2. 最小結構化資料與持久化版本

權威欄位在 `packages/contract/src/domain/document-intake.ts` 及 `contracts/input/document-intake.ts`：

```ts
type DocumentIntakeInput = {
  action: "save" | "confirm";
  repositoryId: string; documentId: string; requestId: string;
  intentFingerprint: string; expectedVersion: number;
  source: { fileId: string; fileRevisionId: string; fileSha256: string };
  expectedLineCount: number;
  candidate: PurchaseOrderCandidate;   // Step 3 的完整 header/buyer/seller/lines/totals/terms/evidence/corrections
  acknowledgement?: { reason: string };
};
type ContractDocumentRevision = {
  schemaVersion: 1; id: string; documentId: string; repositoryId: string;
  version: number; parentRevisionId: string | null;
  actorUserId: string; at: number;
  state: "DRAFT" | "CONFIRMED";
  source: DocumentIntakeInput["source"];
  expectedLineCount: number; candidate: PurchaseOrderCandidate;
  diagnostics: string[]; acknowledgementReason: string | null;
};
```

`PurchaseOrderCandidate.lines` 的 `sourceRowId` 必須在此 exact source revision 下唯一且穩定；`sourcePages` 是原始文件頁面證據，不是 WBS Node ID。金額採精確 decimal 字串，絕不可用浮點數作簽約或金額比較。字串格式與未來幣別精度／折扣符號規則應由 Contract domain 明確定義，不能由 Gateway 或 Content 推斷。

**原始候選與人工修正：** 可在 DRAFT 中明確修正並產生新 revision；保留來源與 `corrections` 證據。不能讓 `confirm` 同時偷偷修改候選資料；若需要修正，先另存一個新的 Draft，再明確確認該版本。

## 3. Domain 驗證清單（現況與必補差異分開）

| 檢查 | 現有代碼證據 | 完整閉環標準 |
| --- | --- | --- |
| 完整 schema | 公開 `purchaseOrderExtractionSchema`，Contract input 解析 | **所有欄位**由 Contract original schema/domain 重驗，不能只接受 provider JSON 結構 |
| 行數 | `lines.length === expectedLineCount` | 加上**原件頁面人工核對的獨立行數／範圍確認**；caller 期待數不是原件真相 |
| 行身份 | 非空 `sourceRowId`、檢查重複 | 每 source revision 穩定唯一，跨頁續行不能錯誤合併／重算 |
| 不確定性 | `uncertain`，必需欄位與 `sourcePages` | `uncertain` 或必要來源位置缺失不得 CONFIRM，明確保留證據 |
| 數量價格 | 目前檢查 quantity>0、unitPrice>=0 | 補 exact-decimal `quantity * unitPrice` 與 gross 的一致性／例外政策；不得暗中推定計價方式 |
| 行金額 | 目前檢查 `grossAmount + discountAmount = netAmount` | 明確定義 signed discount convention，禁無證據的符號翻轉 |
| 單據總額 | 目前檢查 lines gross / discount / net sums、`net + tax = total` | 精確十進位、稅與折扣之合法例外須明確、可追溯；金額差異不等於缺資料 |
| 商業確認 | DRAFT → CONFIRMED，只能確認未修改的 review facts | 真實 reviewer/actor 意圖清楚、版本固定、不能自動 Confirm |

**已證實的缺口**：現行 `diagnosticsFor` 沒有明確比較 `quantity * unitPrice` 與 `grossAmount`；此外 `expectedLineCount` 是 caller 提供，驗證 54/54 只證明對上宣告，不證明原 PDF 就有 54 行。這兩項必須列入修正與反例測試。

**設計決定：** 財務差異可用明確 `acknowledgementReason` 例外，但**不能用一段任意理由豁免缺少必要行、來源頁、重複 ID、未確定欄位、無效數量或未核對原件行數**。當實際商業單據存在手寫價格、折扣或特殊稅務例外時，應保留精確原始值及來源位置，而不是用公式強迫偽造一致。引入新的例外種類前先確立 domain 語意與測試；不加通用規則引擎。

## 4. 最小狀態轉換與失敗語意

```text
non-existent document
  -- SAVE(candidate, expectedVersion=0) --> DRAFT v1
DRAFT vN
  -- SAVE(corrected candidate, expectedVersion=N) --> DRAFT vN+1
DRAFT vN
  -- CONFIRM(exact same source, candidate, count, expectedVersion=N)
     + business checks + explicit actor --> CONFIRMED vN+1
CONFIRMED vN -- edit/confirm again --> LIFECYCLE_CONFLICT
```

Contract SAVE／CONFIRM 需在同一 PostgreSQL 交易內保存 aggregate head、immutable revision、文件來源資格及 command receipt；任何一步失敗均回滾。不可信 provider output **只**能走此入口。相同 actor/requestId/相同 canonical payload：重放舊 Receipt；相同 ID 不同內容：`REQUEST_ID_REUSED`，不可解讀成新確認。

若提交回應逾時，首先向 Contract 的 public `receipt(actor, {repositoryId, documentId, requestId})` 讀回；無回執不表示可以重跑 Gateway，也不能返回 `CONFIRMED`。已 CONFIRMED 需要商業更正時，採**新的明確修訂／取代文件**提案，保留舊確認事實，不能原地覆寫。

## 5. Structured Contract → Content 邊界（此 Step 只輸出，不映射）

```ts
type ConfirmedDocumentPin = {
  repositoryId: string;
  documentId: string;
  revisionId: string; // exact CONFIRMED revision, never "latest"
};
```

Contract 對 Content **只公開這個版本的已確認資料讀取能力**。不在 Contract 建 Content workId／taskId／plannedQuantity 的新權威，不先選擇 WBS。更不能在 Contract 中將 `material`、`service`、`freight`、`other` 解讀成必定可以展開；不相容性由 Step 5 的 Content 在自己的交易中拒絕且保留 Contract 真相。

## 6. 最小驗收案例與不可省的觀測證據

1. Gateway 產出完整但有 `uncertain=true`、缺來源頁或重複 `sourceRowId` → **SAVE Draft 可以保留調查證據**，CONFIRM 必須拒絕。
2. 宣告 54 行但原始文件人工核對為 55 行 → 不可標記「完整確認」；記錄實際核對差異與來源證據。
3. quantity=3、unitPrice=10、gross=20 → 不能當成無差異；新增規則需依明確折扣／計價例外處理。
4. signed discount、稅額、逐行與表尾金額 → 使用 exact decimals 驗證；合法單據例外必須可解釋與追溯，不能只修 AI prompt。
5. 兩個 reviewer 併發確認同 Draft → ExpectedVersion 只允許一個有效新版本；另一個明確 conflict。
6. Gateway 或 actor 已失去 Repository 權限 → 不得跨 scope SAVE/CONFIRM/讀取；receipt replay 亦依現在的權限。
7. CONFIRM 命令同時偷偷更改一行 → 拒絕；先 SAVE correction，後以新版本確認。
8. Confirmed document 從未轉成 Content → 仍是有效商業事實；不得自動產生工作節點／發布 WBS。

**Step 4 通過標準：** 以完整 fixture、邊界／算術反例、獨立人工文件核對、PostgreSQL 交易與 receipt readback 證明商業確認的正確性；Step 5 的工程展開狀態不影響這份證據。

## Reference

- `packages/contract/src/domain/document-intake.ts`
- `packages/contract/src/contracts/input/document-intake.ts`
- `packages/contract/src/adapters/outbound/persistence/documents.ts`
- [Step 3 的 candidate schema](document-owner-skeleton-reduction-step-3.md)
