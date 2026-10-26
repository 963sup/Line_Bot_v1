# Document owner skeleton reduction — Step 6: ContentPlanRevision → Project WBS → Baseline

**狀態：目標設計，尚未完成來源覆蓋驗證。** 前一步：[Step 5 Contract → Content](document-owner-skeleton-reduction-step-5.md)；下一步：[Step 7 完整閉環驗收](document-owner-skeleton-reduction-step-7.md)。

**唯一目的：** 把 Repository 的一個**精確、已授權** Content Revision 轉成 Project 的 WBS 草稿，經 Project 自己的治理規則正式發布 Baseline。WBS 是工作範圍 Authority，**不重新擁有** Content 計畫數量、Contract 商業金額或 File bytes。

## 1. 最小輸入、輸出與 Scope

```ts
type WbsContentImportCommand = {
  action: "import-content-document";
  projectId: string; requestId: string; expectedVersion: number; // 0 for uninitialized
  repositoryId: string; contentRevisionId: string;
  confirmedDisclosure: true;
};
type ContentWbsSource = {
  repositoryId: string; revisionId: string; version: number;
  nodes: Array<{
    id: string; parentId: string | null; position: number;
    kind: "SUBJECT" | "OBJECT" | "SUBOBJECT" | "WORK" | "TASK";
    title: string; body: string;
  }>;
  sourceRows: Array<{
    documentId: string; revisionId: string; sourceRowId: string;
    disposition: "CONTENT_WORK" | "COMMERCIAL_ONLY";
    nodeIds: string[];
  }>;
};
```

Reader authority：`packages/content/src/contracts/output/wbs-expansion.ts`。WBS 的 Project transaction 內經 Content public Reader 查到**指定** Revision 及來源列，不直接讀 Content private schema，不把 Content Repository 的 READ 權限當成 Project DISCLOSE 權限。**`confirmedDisclosure: true` 是使用者意圖，不能取代真實授權。** 產品必須明確確定誰有權將私有 Repository plan 範圍披露給 Project 讀者；在制度核定與測試前，跨 Scope 展開不得標示完整可上線。

## 2. Deterministic Content → WBS `content-wbs-v1`

目前映射由 `packages/wbs/src/domain/content.ts::importContentWbs` 實作：

| Content.kind | WBS.kind | 產生方式 | WBS 新事實 |
| --- | --- | --- | --- |
| SUBJECT | DELIVERABLE | stable source node ID → WBS ID | 範圍階層容器 |
| OBJECT | DELIVERABLE | 同上 | 範圍階層容器 |
| SUBOBJECT | DELIVERABLE | 同上 | 範圍階層容器 |
| WORK | DELIVERABLE | 同上 | 工作範圍分解容器 |
| TASK | **WORK_PACKAGE** | 同上 | 待補交付成果與驗收標準的工作包 |

`wbsNodeId = stableId("content-wbs-v1:" + projectId + ":" + contentNode.id)`。
所有 `parentId` 必須指到轉換後的 WBS node；原 `position/title/body` 轉成 `position/title/description`。初次建立的 `deliverable=""`、`acceptanceCriteria=""`，是**待完善的 Draft**，不應假裝可自動發布。

```ts
type WbsNode = {
  id: string; parentId: string | null; position: number;
  kind: "DELIVERABLE" | "WORK_PACKAGE";
  title: string; description: string;
  deliverable: string; acceptanceCriteria: string;
};
type WbsContentImportEvidence = {
  repositoryId: string; contentRevisionId: string; contentVersion: number;
  mappingVersion: "content-wbs-v1";
  nodeCoverage: Array<{
    contentNodeId: string; wbsNodeId: string;
    sourceKind: ContentWbsSource["nodes"][number]["kind"];
    targetKind: WbsNode["kind"];
  }>;
  sourceRows: Array<{
    documentId: string; revisionId: string; sourceRowId: string;
    disposition: "CONTENT_WORK" | "COMMERCIAL_ONLY";
    wbsNodeIds: string[];
  }>;
};
```

**不能宣稱 WBS 保留全部 Content business fields。** 現有 WBS 公開 Reader 投影只取 `title/body/kind/position` 等結構，不包含 `plannedQuantity/resourcePins`；這些仍由 Content 的 exact Revision 持有。確實需要時，另經 Content public query 依授權讀取，不在 WBS 創造第二份量價所有權。

## 3. 匯入原子性與 source row 驗證

同一 Project 只能先在**未初始化的 WBS** 上匯入（`current=null, expectedVersion=0`）；不可在已有工作範圍的 Project 暗中整份取代。初始化 WBS Draft 與寫入 `contentImport`、head、receipt 在一個 Project WBS transaction 內提交。

必要檢查：

1. 當前 Project role 允許編輯、Project 未 closed、當前遷移 Scope 可寫；Repository 的 Content exact revision 仍可授權讀取，Disclosure permission 經真實授權。
2. Content nodes 非空、最多 1000、IDs 唯一、parent 全部可解析、轉成合法的 WBS tree。未存在的 parent、cycle、非法 kind/position → **整筆拒絕**。
3. `nodeCoverage.length === content.nodes.length`，content nodeId 不重複；所有 target WBS node IDs 有效且唯一。
4. 原始 `sourceRows` 的每筆 `CONTENT_WORK` 對應到確實存在的 WBS nodes，且至少有一個由 Content TASK 產生的 **WORK_PACKAGE**。只有 WORK→DELIVERABLE 不足以證明工作已轉成可執行工作包。
5. `COMMERCIAL_ONLY` 的 `wbsNodeIds=[]`，仍保存 row identity；不因不屬施工項目而失去追溯。
6. 完整 import payload、source mapping、WBS Revision、Head 和 request receipt 成功或一律 rollback；不留下半棵工作樹。

**現況與補強：** 目前 `importContentWbs` 有 parent、node count、disposition/non-empty 映射檢查，但需要以反例證明 `CONTENT_WORK` 最終含 WORK_PACKAGE，而不只是某個 DELIVERABLE。不得新增通用 Mapper 以掩蓋缺口。

## 4. Draft 可編輯；Baseline 不能跳過來源對帳

Draft 匯入後仍可 `update-node`、`move-node`、`delete-subtree`、補交付成果與驗收標準。現行 `reviseWbsContent` 在新增 Revision 時不直接複製 `contentImport` 欄位，代表**新的 Head 不能僅從自身欄位推定已無來源約束**。

**最小實作（先不建立 Coverage Table）：**

1. 在同一 Project 下，沿選定候選 Revision 的 immutable parent ancestry 找到原始 `contentImport`（或明確確認這是一份手動初始化 WBS、沒有來源）。
2. 由 `contentImport` 的 pinned exact `contentRevisionId`、`nodeCoverage`、`sourceRows` 建立必要來源 WORK_PACKAGE ID 集合。
3. 與 **候選 WBSRevision.document.nodes** 比對，檢查每個需施工的 `CONTENT_WORK` sourceRowId 仍有有效且可達的 `WORK_PACKAGE`；如果缺失或 ancestor 被移除，阻止發布。
4. 不把最新 Content head 套用到這個已建立的 WBS；變更 Content 應產生明確新計畫決策，不得靜默覆寫舊 WBS。
5. 對已手動初始化且從未 Content import 的 WBS，不捏造來源責任；對 legacy WBS / 不可解碼來源歷史，回傳「來源證據無法確認」的可辨識失敗，**不能當來源集合為空而放行**。

```text
WBS initial import (with immutable contentImport evidence)
        ↓
WBS Revision v2 / v3 ... (editable)
        ↓
Published proposal selects exact candidateRevisionId
        ↓
resolve original source evidence from ancestor revisions
        ↓
compare required work rows with candidate work packages
        ├── missing / invalid / unreadable evidence → BLOCK publish
        └── all represented → continue existing governance checks
```

**不新增** 全域 Source Registry、泛用 `coverage` 寫入狀態或第二份可變 Contract 事實。若未來真有「正式刪除／取代已簽約工作」需求，應在 WBS 另案定義可審核的明確排除/取代決策及權限，而不是把刪除 node 自動解讀為合約取消。

## 5. Governance 的獨立不可變條件

`WbsRevision` 是 Draft；正式 `Baseline` 至少經過：

```text
select exact WbsRevision
 -> create or revise Proposal (pins candidateRevisionId + baseBaselineId)
 -> review by currently eligible Project reviewers
 -> check required WORK_PACKAGE fields (deliverable + acceptanceCriteria)
 -> verify effective approvals under current policy and no blocking REQUEST_CHANGES
 -> recheck proposal version / governance version / current Baseline
 -> verify source work coverage on candidate revision
 -> atomically publish Baseline + outbox + proposal status + governance head/receipt
```

目前預設 `minimumApprovals=1` 且 `allowSelfApproval=true` 是**現有政策**，不等於已證明適用所有組織；如需較高獨立性，透過現有 WBS policy 與治理決策處理，不能藏在 Gateway 或 Content。

Publication 候選必須仍屬指定 Project；不同 Project 的同名 nodeId 或 Repository 相似名稱不能互用。WBS 不對 Project 之外的 Actor 授予新的讀取／修改權限。

## 6. 最小驗收矩陣

| 反例 / 正向 | 必須結果 |
| --- | --- |
| Content 有 48 TASK、48 WORK | 建立 48 WORK_PACKAGE、其餘 DELIVERABLE，階層不變 |
| 對 Content sourceRows 有 54 筆，其中 6 商業列 | 54 筆 WBS row trace；商業列沒有 WBS工作 |
| Content Revision 變更或後續被修改 | 已匯入 WBS 仍 pin 原 ContentRevision，不被靜默重導向 |
| Content 有重複 nodeId／缺 parent／超過 1000 節點 | 不產生部分 WBSRevision |
| 相同 requestId 重放 | 返回原 receipt，無第二份 WBS |
| 匯入後刪除任一來源 TASK WORK_PACKAGE | 即使其他工作包有 deliverable/acceptance，發布必須拒絕 |
| WBS 手動初始化、非 Content 來源 | 仍依手動 scope 的合法治理規則，不憑空要求 Contract 來源 |
| reviewer 權限撤銷／proposal revised／Baseline 已更新 | 有效核准失效或版本 conflict，不發布 |
| 跨 Repository 私有來源 → Project 更廣泛讀者 | 沒有合法 disclosure authority 時拒絕，不洩漏 source details |
| outbox/receipt SQL 寫入失敗 | Baseline+治理狀態整交易 rollback；重試 readback |

**Step 6 通過條件：** 精確 ContentRevision 能建立完整 WBS Draft；有來源的候選 Baseline 在發布時完整比對實際工作包；治理授權與 outbox 原子性經真實 PostgreSQL 競爭／回滾測試證明。

## Reference

- `packages/content/src/contracts/output/wbs-expansion.ts`
- `packages/content/src/adapters/outbound/persistence/wbs-expansion.ts`
- `packages/wbs/src/domain/content.ts`
- `packages/wbs/src/domain/document.ts`
- `packages/wbs/src/domain/governance.ts`
- `packages/wbs/src/domain/scope-governance.ts`
