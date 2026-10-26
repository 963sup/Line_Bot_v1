# Document owner skeleton reduction — Step 5: CONFIRMED Contract → ContentPlanRevision

**狀態：目標設計，尚未全數驗證。** 前一步：[Step 4 Contract CONFIRM](document-owner-skeleton-reduction-step-4.md)；下一步：[Step 6 Content → WBS](document-owner-skeleton-reduction-step-6.md)。

**唯一目的：** 把一份已確認的採購單商業事實，**確定性且完整地轉換**成 Repository 的工程工作計畫，保留每一來源行的處置。Content 是新工程規劃的 Owner，**不能修改** Contract 的商業價格、稅額或確認狀態。

## 1. 最小 Source Reader 契約與信任

`Content` 現有 `ContractDocumentExpansionReader.readConfirmed(actor, repositoryId, documentId, revisionId)` 在**同一個 Content 持久化交易**內從 Contract 的公開 Reader 讀取指定 immutable `CONFIRMED` Revision。使用者的 `confirmedDisclosure` 是揭露意圖，不等於 Repository 權限；仍需重新授權 File 來源資格／Contract READ／Content WRITE 與 Repository archive state。

```ts
type ContractDocumentExpansion = {
  documentId: string;
  revisionId: string;           // exact CONFIRMED ContractDocumentRevision
  sourceFileId: string;
  sourceFileRevisionId: string;
  sourceFileSha256: string;
  title: string;
  lines: Array<{
    sourceRowId: string;
    description: string | null;
    quantity: string | null;
    unit: string | null;
    category: string | null;
    uncertain: boolean;
  }>;
};
```

這是 Content **只需的商業欄位投影**；價格、稅金、付款條件仍只在 Contract。不得再在 Content 儲存可獨立修改的價金總額。讀取 Contract projection 不能跳過 Contract 的原始 Revision 狀態與來源驗證。

## 2. 固定、完整且最小的轉換表（`purchase-order-content-v1`）

`packages/content/src/domain/plan.ts::expandContractDocument` 已有以下固定規則：

| Contract `line.category` | 產生 Content 節點 | plannedQuantity | row disposition |
| --- | --- | --- | --- |
| `material` | **一個 WORK + 一個 TASK**（同一 WORK 之子） | WORK 和 TASK 都使用來源 quantity 與相同 measure | `CONTENT_WORK`, `nodeIds=[workId,taskId]` |
| `service` | **一個 WORK + 一個 TASK**（同上） | 同上 | `CONTENT_WORK` |
| `freight` | 不產生工作節點 | 無 | `COMMERCIAL_ONLY`, `nodeIds=[]` |
| `other` | 不產生工作節點 | 無 | `COMMERCIAL_ONLY` |
| `null` / 其他 | **整筆匯入拒絕**（不得當成 freight/other） | 無 | 不提交任何 ContentRevision |

有至少一筆 WORK 時，該 ContractDocument import 另外建立 **一組** SUBJECT → OBJECT → SUBOBJECT 祖先節點；全部 freight/other 時，不憑空建立空祖先。原有 Repository 計畫節點和資源 pins 保留，新增節點接入原 Content plan；不是覆寫成只剩採購單的工作。

```text
Contract CONFIRMED Revision R
  ├─ row-1, material   ─→ SUBJECT / OBJECT / SUBOBJECT / WORK(row-1) / TASK(row-1)
  ├─ row-2, service    ─→ 同一祖先 / WORK(row-2) / TASK(row-2)
  ├─ row-3, freight    ─→ COMMERCIAL_ONLY (無工程 node)
  └─ row-4, other      ─→ COMMERCIAL_ONLY (無工程 node)
```

**最重要的業務歧義（先不改原 Schema）：** WORK 與 TASK 各有同一筆 plannedQuantity，它們是父子層級的規劃描述，不應在報表對同一來源重複累加。若要加總選 **TASK 葉節點**或其他經 Content 定義的唯一計量層級；不可同時將 WORK+TASK 都計入商業數量。是否維持每列 WORK+TASK 的 1:1 映射，必須由真實 Content/Execution consumer 的需求與負面測試決定；在消費者核實前不直接砍掉其中一層。

## 3. Deterministic Identity / Lineage

目前 `sourcePin = "contract-document:" + documentId + ":" + revisionId`，採 stableId 建立：

```text
subjectId   = stableId(sourcePin + ":subject")
objectId    = stableId(sourcePin + ":object")
subObjectId = stableId(sourcePin + ":subobject")
workId      = stableId(sourcePin + ":row:" + sourceRowId + ":work")
taskId      = stableId(sourcePin + ":row:" + sourceRowId + ":task")
measureId   = stableId(sourcePin + ":measure:" + unit) // 新 measure 時
```

同一確定來源、mappingVersion 和穩定 ID 函數，重算應得到相同節點 ID，與 actor/requestId 的隨機性無關；`sourceRowId` 應承接 Step 3/4 已固定的來源列身份，絕不能在這裡重新排序為不相關 ID。

**每次 Import Revision 留存：**

```ts
type ContentContractImportEvidence = {
  documentId: string; revisionId: string;
  fileId: string; fileRevisionId: string; fileSha256: string;
  mappingVersion: "purchase-order-content-v1";
  rows: Array<{
    sourceRowId: string;
    disposition: "CONTENT_WORK" | "COMMERCIAL_ONLY";
    nodeIds: string[];
  }>;
};
```

`ContentPlanRevision` 仍包含自身 `id/version/parentRevisionId` 與完整計畫 `{schemaVersion,measures,nodes,resourcePins}`。來源映射是 **Content 轉換的 immutable evidence**，不是另一份 Contract 商業事實。

## 4. 原子性與必要驗證：不能只檢查行數

**先驗證**：

1. Source Revision 存在、權限合法且 **state=CONFIRMED**。明確傳 `revisionId`，禁止不確定的 current/latest。
2. Content plan 已初始化；current expectedVersion 精確吻合，Repository 未 archived；同一 Contract revision 不得重複匯入。
3. 每列 `sourceRowId` 非空且唯一；無法分類（`null`）直接拒絕。
4. material/service 的 `description`、`quantity`、`unit` 可靠且 `uncertain=false`；計量單位經 `normalizeQuantityUnit`，數量經 `normalizeQuantity`，**最多 3 位小數**；`pcs` 必須整數。
5. 所有產生節點符合 Subject→Object→SubObject→Work→Task、合法 parent、唯一 sibling position、UUID/ID、文字與 resource pin 規則。
6. 正確計算**最終總節點數**：`existingNodeCount + 2 * workRowCount + (workRowCount > 0 ? 3 : 0) <= 1000`。還要符合 measures<=1000、resourcePins<=5000；不能只認 `source.lines.length<=1000`。例：空計畫有 499 筆工作行 → 1001 節點 → **原子性拒絕**。
7. `coverage.rows.length === source.lines.length` 且 `sourceRowId` 集合完全相同：每個來源行只有**一個**明確處置；每個 CONTENT_WORK 必須有有效 WORK/TASK nodes；COMMERCIAL_ONLY 沒有 node。

**不允許**：無聲截斷 1001 nodes、將 `1.0001` 捨入 `1.000`、把 category=null 猜成 other、丟掉 freight、只提交前半筆後留下 ContentRevision。

**全部通過後**，在 Content 單一 PostgreSQL transaction 內 append Content revision、Resource pins、更新 head、寫入 request receipt；任何一步失敗全部 rollback。Contract CONFIRMED 永遠不受該交易結果影響。重送相同 fingerprint/requestId 返回原 receipt；同 requestId 不同 payload 必須衝突。

## 5. 後續編輯與來源追溯不能混為一談

現有 source-row evidence 是**匯入那一版**的 immutable 事實，不代表較新 plan revision 一定仍包含該節點。新版 Content 允許合法刪除節點，會有兩個不同問題：

- **Historical provenance**：原始 Contract revision 哪筆 row 曾對應哪些 Content node？從 immutable import evidence 得到。
- **Current validity**：在**指定的現在或歷史 ContentRevision**，這些 node 是否仍存在，是否仍是可用的 WORK/TASK？由當前完整 document + 來源版本鏈 **唯讀推導**。

不得把遍歷整條 ancestry 所取得的舊 `nodeIds` 當成現在仍存在；也不得因現在刪除而覆寫或抹除歷史。可先提供 **transaction-bound / authorized source reconciliation query**，回傳有效對應／缺失，而非新增可寫 `source_coverage` 表或全域 Registry。

**注意現況缺口：** `PostgresContentWbsExpansionReader` 目前讀取完整祖先 Contract imports 卻使用目前 Content Revision nodes；刪除過的來源 node 會造成 WBS import `SOURCE_INVALID`。本 Step 應把它變成可解釋的資格拒絕，而非假稱歷史 row 仍映射有效。

## 6. Step 5 驗收（資料轉換必過）

| Fixture / 反例 | 必須結果 |
| --- | --- |
| 48 material/service + 6 freight/other | 48 WORK + 48 TASK + 3 祖先；54 個 row disposition |
| 只有 freight/other | 所有 row 記 COMMERCIAL_ONLY，無無意義工作節點 |
| category=null、重複來源 rowId | 無任何新 Content Revision、head 或 receipt |
| 499 個工作行 + 空計畫 | 節點超過 1000，全量拒絕；Contract 不變 |
| quantity `1.0001`、`pcs=2.5` | 無截斷／捨入，明確 INVALID_INPUT |
| 相同來源與 mapping 重放 | 原 Receipt、同 IDs，沒有重複節點 |
| 匯入後 Content vN 刪除原 work node | 舊 lineage 可追溯；vN 不得宣稱完整 current coverage |
| 不同 actor／Repository、失去 source read 權限 | Transaction requalification 拒絕、不得洩漏商業欄位 |
| 第三個 SQL 寫入失敗 | 整筆 Content Revision、pins、head、receipt rollback |

**Step 5 通過標準：** 合法完整 confirmed document 能全量轉入既有 ContentPlan；所有分類／數量／身份／容量反例都有原子性拒絕，歷史來源與現行節點對帳可重現，沒有第二份可變的 Contract 真相。

## Reference

- `packages/content/src/domain/plan.ts` (`expandContractDocument`)
- `packages/content/src/domain/quantity.ts`
- `packages/content/src/adapters/outbound/persistence/plans.ts`
- `packages/content/src/adapters/outbound/persistence/wbs-expansion.ts`
- `apps/web/src/app/api/_composition/contract-content-expansion.server.ts`
