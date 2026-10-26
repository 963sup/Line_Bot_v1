# Document owner skeleton reduction — Step 7: 全鏈路閉環、逆向證據與異常恢復驗收

**狀態：最終驗收設計，尚未執行。** 前提：[Step 1](document-owner-skeleton-reduction-step-1.md) → [Step 2](document-owner-skeleton-reduction-step-2.md) → [Step 3](document-owner-skeleton-reduction-step-3.md) → [Step 4](document-owner-skeleton-reduction-step-4.md) → [Step 5](document-owner-skeleton-reduction-step-5.md) → [Step 6](document-owner-skeleton-reduction-step-6.md)，以及獨立審查的 #412 Integration。

**唯一目的：** 在真實權限、資料庫、私有 Storage、Vercel AI Gateway、正式入口和受控使用者操作下，證明整條業務流程**確實閉環**。不以 mock、單元測試、build 成功或 AI 的一筆成功輸出代替正式驗收。

## 1. 「完整閉環」的嚴格定義

完整閉環必須同時滿足**三向驗證**：

```text
正向 committed facts
  verified FileRevision
  → authorized Intelligence Attempt / Gateway candidate
  → ContractDocument DRAFT → human CONFIRMED Revision
  → ContentPlanRevision with exact Contract row disposition
  → Project WBS Draft → reviewed/published Baseline

反向 immutable evidence
  Baseline(revisionId) → WBS candidate/ancestor contentImport
  → Content exact Revision + sourceRows
  → Contract exact CONFIRMED Revision + candidate lines
  → File exact Revision + SHA-256 + authorized verified bytes
  [Intelligence Attempt / Contract SAVE receipt independently trace extraction identity]

異常/重試
  request timeout / provider unknown / SQL conflict / permission loss
  → Owner's exact authorized revision/receipt/attempt readback
  → original committed outcome, explicit conflict or UNKNOWN
  → NEVER fabricated success or duplicate business facts
```

**重要：** Intelligence Attempt 不必成為 Content/WBS 的新 business parent；其 source/intent/receipt 是獨立技術執行證據，透過精確 Contract SAVE receipt 追溯，而不是把 provider transcript 複製到每一個下游 Revision。跨 Owner trace 是受權限限制的讀取組合，**不是**新全域 Owner/Database。

## 2. 最小 Trace Contract（查詢投影，不是新持久化權威）

```ts
type DocumentClosureTrace = {
  scope: { repositoryId: string; projectId: string };
  file: { fileId: string; revisionId: string; sha256: string };
  intelligence: {
    attemptId: string; requestId: string; extractorVersion: string;
    contractSaveRevisionId: string | null; // UNKNOWN 時為 null，不假成功
  };
  contract: {
    documentId: string; revisionId: string; state: "CONFIRMED";
    expectedLineCount: number; sourceRowIds: string[];
  };
  content: {
    repositoryId: string; revisionId: string;
    mappingVersion: "purchase-order-content-v1";
    rows: Array<{
      sourceRowId: string;
      disposition: "CONTENT_WORK" | "COMMERCIAL_ONLY";
      nodeIds: string[];
    }>;
  };
  wbs: {
    projectId: string; candidateRevisionId: string; baselineId: string;
    mappingVersion: "content-wbs-v1";
    sourceRowIds: string[];
    approvalReviewIds: string[];
  };
};
```

這是**驗收／可授權查詢時的概念形狀**，不是要求立刻新增對外 API 或全域可寫表。現有 Owner DTO 不必一次改成上述型別；實作可用各 Owner 公開 Reader 逐段產生一個短期投影。任何 Actor 未取得來源 Repository 的適當讀取／揭露權限，應回傳拒絕／有限結果，不能將 File/Contract sourceRows 泄漏給僅有 Project READ 的使用者。

**不變條件：**

1. `trace.file.sha256` 與原 FileRevision 完全一致；真正 bytes 由 File Reader 驗證，不讓 WBS 自己下載。
2. Content 的 Contract source `{documentId,revisionId}` 對應的 `CONFIRMED` exact Revision 必須存在；它不可只靠名稱或最新 Head 猜測。
3. `set(content.rows.sourceRowId)` 必須精確等於該 ContractRevision 的所有原始 `lines.sourceRowId`，每筆只出現一次，不因 freight/other 被刪。
4. WBS `sourceRows` 必須與其所 pin 的 ContentRevision來源行一致；需施工列在要發布的**候選版本**擁有有效 WORK_PACKAGE。刪改後不可使用初始匯入覆蓋數假充現在的覆蓋。
5. Baseline 的 `revisionId`、proposal/approval IDs、current policy/reviewer authority 及 outbox event 都能讀回，且指到一份真實的 immutable candidate。
6. 失敗與未知不是通過：每個缺失必須顯示明確 Owner/階段/錯誤語意，**不能填補不存在的欄位**讓 trace 完整。

## 3. 具體 E2E Fixture 設計（測試資料 != 實際使用者秘密）

準備**無真實個資、經人工核對**的至少兩份文件（例如一份 54 行跨頁採購單及一份包含多幣別／折扣或複雜表格的合法反例），每份 fixture 配有獨立人工核對的 page count、line count、stable row keys、必需欄位、Decimal totals、來源欄位位置。沒有人工核對原件的 fixture 只能驗證「對照宣告」，不能叫 full-document coverage。

驗收檔案可包含 PDF、JPG/PNG/WebP；對宣稱支援的每種 MIME/入口測試成功與不支援結果。不能把 provider output 直接當成預期答案（會循環論證）。Contract 全量保存來源原值；Content 只取得允許的工程投影；WBS 只取得其需要的工作結構。

主情境：

1. Actor A 在有權限 Repository 透過 File Upload；讀回 FileRevision ID／SHA，確認 Storage bytes 完整，List 沒有 pending upload。
2. 用相同 exact FileRevision 呼叫 Intelligence Contract Intake；取得 Gateway 的完整 `PurchaseOrderCandidate` 並保留 Attempt，對照**獨立人工 fixture**；不得先進行泛化 observations 截斷。
3. Contract SAVE Draft，人工核對所有行／金額／來源頁，必要時以新 Draft Revision 修正，最後由具權限 Actor 確認 exact candidate → CONFIRMED。
4. Content 匯入 exact Confirmed ContractRevision；驗證每行 map 或 commercial-only，總節點數、measure、stable IDs 和歷史 import evidence。
5. 有權限且有來源披露資格的 Actor 將指定 ContentRevision 匯入**空** Project WBS；完成 work package deliverable / acceptance criteria、建立 proposal／review、正式發布 Baseline。
6. 逆向追溯 Published Baseline 到同一 Content/Contract/File sha，驗證沒有任何來源行遺失；同時依額外權限策略檢查不得對 Project-only Actor 展露 Repository 的原始私有商業資料。

## 4. 必須測的反例矩陣

| 場景 | 具體注入 | 必須觀察 |
| --- | --- | --- |
| File object write timeout | Storage upload 回應不明、readback success/fail 各一 | 只有 readback success 可以 finalize；否則 pending，List 看不到 committed 假檔案 |
| File source tampered | bytes SHA 與 stored FileRevision 不符 | 不能處理／保存候選；明確 SOURCE_MISMATCH / unavailable |
| Gateway malformed | 欠 `terms`、錯欄位型別、超過大小限制 | 沒有 Contract SAVE/CONFIRM；錯誤可分類 |
| Gateway timeout/unknown | Provider 呼叫已開始後斷線 | 同 requestId 不啟動第二次 provider；replay/receipt/readback 結果明確 |
| Contract save response lost | Postgres committed but response lost | Contract receipt 查得同一 exact revision；不重寫、不再呼叫 Gateway |
| Human review mismatch | fixture 55 行，Gateway/caller 只有 54 | 不得標記正式文件完整且確認成功 |
| Invalid commercial math | quantity × unitPrice ≠ gross、稅／折扣歧義 | Contract 明確 diagnostics/拒絕或有受控例外，不無聲篡改原值 |
| Confirmed-but-not-expandable | category=null、四位小數、499 工作行超過 Content 1000 nodes | Contract CONFIRMED 保持；Content 整體拒絕且無半成品 |
| Content already changed | 讀取後他人更新 Content head | expectedVersion conflict；沒有丟失其他人的 plan |
| Source removed after import | 新 ContentRevision 刪除映射 Work/Task | 歷史仍可查；WBS 用該 revision 不能假裝來源仍覆蓋 |
| WBS deleted imported TASK | candidate 中少一個必要 WORK_PACKAGE | Baseline publish 被阻止，即使其餘工作包欄位完整 |
| WBS proposal raced | reviewer policy/eligible role/baseBaseline changed | 過期核准不能發布；治理/Outbox rollback 原子 |
| Cross-scope disclosure | Actor 可寫 Project 但無來源揭露資格 | 不展開／不洩漏 File / Contract 原始資料 |
| Replays and concurrency | 每段重送相同/不同 fingerprint、兩 session 競爭 | immutable revision/head/receipt 一致，不產生第二個業務效果 |
| Migration legacy records | 舊 File processing / Repository WBS provenance 缺失或格式異常 | 明確 UNKNOWN/UNAVAILABLE，不清除 evidence、不將缺失當「無來源」 |

## 5. 證據層級與 Release Gate

| Evidence level | 需要跑什麼 | 只能證明什麼 |
| --- | --- | --- |
| Domain / pure tests | Contract arithmetic、Content fixed mapping、WBS coverage/approval、Replay 狀態 | 規則與 fixture 反例 |
| Adapter / PostgreSQL | 現行 Schema、RLS、two-session race、rollback、receipt/outbox、transaction-bound read | 真正存取與交易效果 |
| Composition / CLI / Web | public ports、Gateway schema injection、authorization、完整操作入口 | 應用串接無跨 Owner 直寫 |
| Provider live | 指定模型、必要 MIME、結構化 JSON Schema 接受、真實文件質量 | Gateway 對該模型／文件的實際行為 |
| Storage / Vercel runtime | 私有 bytes/readback、Build、ENV、部署精確 commit、API response | 運行中的技術環境 |
| User / device | 實際需要的 LINE/LIFF 使用入口、人工 review/confirm、Project Baseline 操作 | 已驗證的使用者閉環 |

**Release Gate：** #412 先完成其 Integration 依賴驗證。各 Step 的 Domain/SQL/Composition tests 在自己的變更中先通過；`pnpm check`、`pnpm docs:check`、exact-head `pnpm validate` 與 Vercel production revision readback 各自有真實執行證據。可合併不等於驗收通過，CI `skipped` 也不是綠燈。

## 6. 通過／未通過明確宣告

只有當下列條件**全部**有可重複的實際驗收證據時，才能宣稱 `File → Intelligence → Contract → Content → WBS`「完整閉環」：

- 一份原始文件完整轉成同源 Confirmed 商業單據、工程 Content 和正式 Project WBS Baseline。
- 所有 Contract source rows 都有可判定的 Content disposition；所有應納入的 WBS 工作包在候選版本中仍存在。
- Source/File/SHA、Exact Contract/Content/WBS Revision 與 Baseline 從授權 Reader 可逆向驗證。
- 所有失敗／重放／未知結果不製造第二份業務事實；授權與 Scope 隔離未削弱。
- 真實 Gateway、Storage、部署及正式入口的適用測試通過；未實際驗證的環境不得填入成功。
- 歷史資料仍可讀，未經授權不刪舊 Schema/Receipt/Outbox。

**不採用** 新增全域 E2E Business Aggregate、通用 Workflow Engine、Source Registry 或 writable trace database 來換取表面閉環。驗收聚合只是現有五個 Owner 的可授權 read composition；事實的提交權仍分散且唯一。

## Reference

- [Step 3 — Gateway Candidate](document-owner-skeleton-reduction-step-3.md)
- [Step 4 — Contract Confirmation](document-owner-skeleton-reduction-step-4.md)
- [Step 5 — Content Mapping](document-owner-skeleton-reduction-step-5.md)
- [Step 6 — WBS Baseline](document-owner-skeleton-reduction-step-6.md)
- [System invariants](../../rules/system-invariants.md)
