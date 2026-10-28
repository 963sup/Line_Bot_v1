# CommercialDocument 函數、交易與失敗契約

狀態：完整目標規格；最小 DRAFT intake／技術結果保存／C1／讀回與恢復已實作，其他函數仍依計畫追蹤。資料型別見 [欄位字典](2026-10-28-commercial-document-fields.md)；[實作計畫](../plans/2026-10-28-commercial-document-plan.md) 已依本輪契約重訂。此處名稱與錯誤碼包含預定目標；目前可呼叫入口以 package exports／source 為準，不以本文件宣告尚未接通的功能。

## 1. 共通輸入與公開結果

```ts
type ActorContext = Readonly<{ actorUserId: string; traceId: string }>;
type SourceFileReference = Readonly<{ fileId: string; fileRevisionId: string; sha256: string }>;
type CommandMeta = Readonly<{ commandId: string; expectedVersion: number }>;
type DocumentReceipt = Readonly<{
  commandId: string;
  documentId: string;
  revisionId: string | null;
  documentVersion: number;
  operation: "CREATE_DRAFT" | "EDIT_DRAFT" | "VERIFY" | "REOPEN_DRAFT" | "ARCHIVE";
}>;
type ApiFailure = Readonly<{
  code: string;
  message: string;
  traceId: string;
  stage: string;
  retryAction: "REPLAY_COMMAND" | "READ_STATUS" | "EDIT_INPUT" |
    "START_NEW_ANALYSIS" | "CONTACT_ADMIN" | "NONE";
  diagnostics?: readonly { code: string; fieldPath: string; rowIds: readonly string[] }[];
}>;
```

ActorContext、actor、timestamps、dispatchToken 與 traceId 均由可信任 host／service 產生，不能從 request body 採信。commandId 在 browser 明確開始操作時建立並固定；traceId 每個 HTTP request 重新建立。API 不回傳 database schema/table/column、stack、provider raw body 或 credential。

所有 mutating command 均 strict decode：未知 keys、錯誤型別、重複 ID、超過 budgets、prototype path 或任意 model/prompt/schema 一律拒絕。公開結果是 DTO，不能直接 JSON serialize database row 或 internal job record。

## 2. Command replay 的共通順序

1. current actor／Repository／document scope 檢查；不能因知道 commandId 而讀到他人回執。
2. 同一 owner transaction 內查 `(actorUserId, commandId)`；相同 intent 回原 receipt，不因原 expectedVersion 已過期而重做。
3. commandId 已存在但 intent 不同，回 `COMMAND_ID_CONFLICT`；不更新原命令。
4. 首次操作才檢查 root expectedVersion、生命週期、來源與 domain invariant。
5. 寫 head／immutable revision／receipt，一起 commit。失敗全部 rollback，不能只有 receipt 或只有 head。

fingerprint 使用明確 canonical serializer、排序規則與版本；包含 operation、scope、source、target、expectedVersion 及使用者參數；排除 traceId、server time 與隨機 response 值。新增欄位或改 serializer 必須有 replay vectors。analysis 的 commandFingerprint 與 executionFingerprint 分開：前者綁使用者原始意圖，後者綁首次選定的 server profile snapshot；重試不能因 server default 改版而被改送新模型。

## 3. Source 與 technical extraction：Intelligence

### S1 inspectDocumentSource

`inspectDocumentSource(source: SourceFileReference, bytes: Uint8Array, mediaType: string): SourceManifest`

純技術檢查：byteLength/hash、實際 PDF pageCount／圖片單頁、MIME 支援、加密／損壞／大小限制。沒有 provider 呼叫，也不擁有 File bytes。失敗為 UNSUPPORTED_SOURCE／SOURCE_LIMIT_EXCEEDED／SOURCE_INVALID。頁數來自 server inspector，不採信 model 或 browser。

### S2 resolveExtractionProfile

`resolveExtractionProfile(profileKey: string): ExtractionProfileSnapshot`

只從 server registry 選固定設定，產生 profile/result-schema/normalizer/model/prompt/configuration fingerprints；未知 profile 拒絕。不能回傳 secret。既有 job 重試使用已保存 snapshot，不以此函數重新選設定；fresh job 才解析目前 registry。

dispatch 前須通過 schema 支援子集、模型/file 能力與輸入預算檢查；欄位及預算定義以欄位字典為準。profile 未固定 admission policy 或不能通過檢查，回 EXTRACTION_PROFILE_INVALID／SOURCE_TOKEN_BUDGET_EXCEEDED，不先呼叫模型試錯。

### S3 startCommercialDocumentIntake

`startCommercialDocumentIntake(ctx: ActorContext, command: StartIntakeCommand): Promise<IntakeStatus>`

StartIntakeCommand：`{commandId, repositoryId, source, profileKey, target:{documentId, draftCommandId, expectedDocumentVersion}}`。

協調順序固定：

1. 驗 actor／Repository，以及 File source public qualification；若已有同 analysis command，先驗 intent 後直接走 S9，不重新解析設定／計費。
2. fresh command 先呼叫 Contract 的 C0 確認有權保存且 storage contract ready，再解析 profile、讀 bytes、S1 檢查來源。
3. S4 reserve job；若競爭者已 reserve 同 intent，回狀態，當前請求不 dispatch。
4. 取得 dispatch fence 的唯一執行者呼叫 S5／S6／S7；每個邊界都有 stage code。
5. READY 後可呼叫 C1，以原 target command 保存草稿。target 失敗不刪 result，不回到 provider。

此函數本身不直接寫 Contract tables，也不包住 provider network call 開長 transaction。若環境不適合長 HTTP execution，改 durable worker 是另一次有證據的實施決策，不能只回「背景處理」卻沒有實際執行者。

### S4 reserveDocumentExtraction

`reserveDocumentExtraction(ctx, command, profileSnapshot, sourceManifest): Promise<{jobId, ownerFence: DispatchFence|null}>`

Intelligence transaction：對 actor/analysisCommandId 做 unique/CAS；只在 fresh insert 固定 source、target、profile snapshot。existing intent 不同拒絕。state=RESERVED、dispatchCount=0；只有唯一 winner 取得 internal fence。既有 RESERVED 且 lease 已到期時，允許同 intent 以 version CAS 換發 fence；未到期／已 dispatched 的重試只讀狀態。fresh 權限與來源必須在此 transition 再驗。

### S5 markProviderDispatched

`markProviderDispatched(service: JobExecutionContext, fence: DispatchFence): Promise<DispatchedJob>`

短 transaction：CAS RESERVED/version/token → DISPATCHED，先 durable 記錄 providerDispatchCount=1；commit 成功後才允許 S6。失去 fence、已 dispatched 或其他不符 RESERVED 的狀態均不得呼叫 provider。commit 結果不明時先讀 job，不能把它當失敗後重新 dispatch。

### S6 extractDocumentObservations

`extractDocumentObservations(sourceBytes, sourceManifest, profileSnapshot): Promise<ProviderObservationPayload>`

純外部 port：一次 provider request；source 為不可信資料，忽略其中指令；輸出 technical observations 與 semantic hints，不輸出可直接信任的業務 revision。保留固定的 byte/page/output/time limits；不隱含 repair、模型 fallback 或 retry。provider timeout/network unknown → OUTCOME_UNKNOWN；有明確 refusal／incomplete／invalid output → FAILED，兩者均不自動重跑。

採 Responses API 的 strict text.format；具體輸出限制見欄位字典 ProviderObservationPayload。本文件的 S/C/P/W 函數是程式內部責任，不因此成為模型 function tools。只有產品確實需要模型選擇並呼叫能力時才另設 function calling 契約；本流程由應用固定呼叫保存、核對與匯入。

先檢查 response status 與所有 message content 的 refusal，再解碼完整輸出。HTTP 200、可 parse JSON 或輸出某一欄完成，都不能證明整次成功。incomplete 保留 max_output_tokens／content_filter 等 allowlisted reason；缺少預期輸出、schema／references 不合法皆明確失敗。provider SDK／HTTP client 的自動 retry 必須關閉，否則單次函數呼叫不等於單次 dispatch。

首版不啟用 streaming。日後需要時只用於暫存預覽／進度；完整 terminal response、refusal/incomplete 判斷及 schema 驗證完成後才允許 S7／C1。不得逐個 delta 寫正式 revision，或在串流中斷時將部分文件當成完整結果。

### S7 storeDocumentExtractionResult

`storeDocumentExtractionResult(service, fence, payload, providerUsage): Promise<ExtractionResultReference>`

驗 technical schema、來源 page bounds、budgets 與 hint references；resultId 由 jobId 決定，observation IDs 由 resultId／原始觀察位置固定，不能由 provider 任意指定。Intelligence transaction 一起 insert immutable result、job→READY；同 job/resultFingerprint 重試回原 result，不同內容拒絕。只有原 dispatch fence 可以從 DISPATCHED 或 OUTCOME_UNKNOWN 接受遲到結果；READY 後不得換 payload。原 provider response 不另存一份，不能把 normalized business candidate 存進 job。

service 是原已授權工作的 job-scoped 執行身分，只能完成同 job/source；不能拿它建立新工作或寫業務文件。完成結果不會授予已失去 Repository 權限的使用者讀取權。DB write 回應不明時先查既有 result fingerprint；結果尚未 durable 就 process 消失時，誠實維持 OUTCOME_UNKNOWN，不能保證可無成本取回遺失結果。

### S8 readDocumentExtractionResult

`readDocumentExtractionResult(ctx, {repositoryId, extractionResultId}): Promise<QualifiedExtractionResult>`

current actor／Repository／File qualification 後讀不可變結果；檢查 job/source/result hash 與 sourceManifest 一致。只經 public port 暴露需要的 observations，不能讀別人的 artifact 或回傳 dispatch fence／provider secret。原件不可讀時回明確 SOURCE_UNAVAILABLE，不假裝空結果。

### S9 getDocumentIntakeStatus

`getDocumentIntakeStatus(ctx, {repositoryId, analysisCommandId}): Promise<IntakeStatus>`

唯讀、無 provider／business write：讀 job、READY result reference，以及 Contract 對 target.draftCommandId 的當前授權 receipt。derived status 為 WAITING／ANALYZING／RESULT_READY／DRAFT_SAVED／FAILED／OUTCOME_UNKNOWN；沒有 receipt 只表示「尚未取得保存回執」，不能證明另一個正在 commit 的 transaction 永遠不會成功。

不存在第二個 durable DELIVERED flag；Contract receipt 是保存成功的唯一證據。原始 result 可讀但保存失敗時，UI 可明確重送 C1；不能在 GET/status poll 內偷偷重新解析。

### S10 resumeCommercialDocumentIntake

`resumeCommercialDocumentIntake(ctx, {repositoryId, analysisCommandId}): Promise<IntakeStatus>`

只讀既有 job/result 並重送同 target command：有 receipt 直接返回；READY 無 receipt 以同 draftCommandId 呼叫 C1；RESERVED 且 dispatchCount=0 時可重新走 source/readiness 檢查並 CAS 取得唯一 fence；DISPATCHED／OUTCOME_UNKNOWN 且無 durable result 不得 S6。真正的版本衝突交給使用者決定是否以新 business command 使用既有 result，不能自動變更 expectedVersion／target。

### S11 recordDocumentExtractionFailure

`recordDocumentExtractionFailure(service, {jobId, dispatchToken, expectedJobVersion, stage, code, outcome:DEFINITE_FAILURE|UNKNOWN}): Promise<void>`

Intelligence 短交易；先 read back result，已有結果則維持 READY。無結果時，明確錯誤轉 FAILED，外部／commit 結果不明轉 OUTCOME_UNKNOWN；只保存 allowlisted failure code/stage。不能倒退到 RESERVED 或清掉 dispatchCount。唯讀 S9 不執行此 transition。

## 4. 商務文件：Contract

所有 public reader/writer 只依 Contract public ports取得 File、Repository 與 technical evidence；host composition 接線，不把 Intelligence 私有 model 或 table 匯入 Contract。

### C0 assertDraftWriteReady

`assertDraftWriteReady(ctx, {repositoryId, expectedSchemaVersion}): Promise<void>`

current write qualification、storage schema capability、必要欄位與未識別的 NOT NULL/no-default 漂移檢查；未 ready 回 DOCUMENT_STORE_NOT_READY，不能先計費後才發現已知欄位不一致。此 preflight 不能保證之後沒有 concurrent DDL／故障；因此仍須 durable result 與 C1 replay。不得靠暫時插假資料測 ready。

### C1 createDraftFromExtraction

`createDraftFromExtraction(ctx, command: CreateDraftCommand): Promise<DocumentReceipt>`

CreateDraftCommand：`{commandId, repositoryId, documentId, expectedVersion, extractionResultId}`。new document 的 expectedVersion=0；對現有 document 新建草稿須 current version 且沒有其他 active draft。

取得 S8 的已授權 source result；以 pinned normalizer version 執行 P1/P2。Contract transaction 驗 scope/source、replay/CAS／archived，建立新的 DRAFT revision，更新 draft pointer 並記錄 receipt。不得在 target write 失敗時重新呼叫 provider。使用者明確要求同 scope 的既有 result 建另一份草稿時可以使用新 command/documentId；不是原命令的 retry，不更新原 job intent。

### C2 applyCommercialDocumentEdits

`applyCommercialDocumentEdits(ctx, command: EditDraftCommand): Promise<DocumentReceipt>`

EditDraftCommand：`{commandId, repositoryId, documentId, expectedVersion, draftRevisionId, newEvidence: HumanSourceEvidenceInput[], edits: DocumentEdit[]}`。

DocumentEdit 為封閉 union：SET_DOCUMENT_KIND／SET_HEADER_FIELD／UPSERT_PARTY／UPSERT_SECTION／UPSERT_ROW／REMOVE_ROW／SET_SELECTION_GROUP／UPSERT_EXTENSION_FIELD。newEvidence 依字典加入有 source bounds 的人工證據，允許修補 AI 漏行；操作攜帶定義好的型別、source evidence 與 correctionReason；不是任意 JSON Patch。field key 必須在該 edit schema 的 allowlist，不能改 source、IDs、review state 或 actor。

純函數 P3 先產生新 content；P2 驗 draft；交易內重新讀 root／原 draft、CAS、immutable insert、更新 draft pointer、receipt 原子 commit。刪掉來源行並不能消除 source coverage 問題；確認時需明確說明該 observation 是延續／備註等，不能靜默漏行。

### C3 verifyCommercialDocument

`verifyCommercialDocument(ctx, command: VerifyDocumentCommand): Promise<DocumentReceipt>`

VerifyDocumentCommand：`{commandId, repositoryId, documentId, expectedVersion, draftRevisionId, sourceReview:{sourceFingerprint, reviewedPageNumbers, reviewedEvidenceRefs, reviewedItemRowIds, sourceItemCount, confirmedAgainstOriginal:true, acknowledgements}}`。

重新授權、驗 source/result/content fingerprint、reviewedPageNumbers 覆蓋整份來源、P2/P4／所有 blocker、數值報告與 acknowledgement scope。reviewedBy/time 由 server 填；模型或 browser 不能自行升級 countEvidence。交易 insert 新 VERIFIED revision，更新 verified pointer、清除 draft pointer、receipt；原 DRAFT 及上一個 VERIFIED immutable 保留。商務接受／簽約／Engineering Contract activation 不在此函數。

### C4 reopenCommercialDocumentDraft

`reopenCommercialDocumentDraft(ctx, {commandId, repositoryId, documentId, expectedVersion, verifiedRevisionId}): Promise<DocumentReceipt>`

current verified 且沒有 active draft 時，複製其 content 成新 DRAFT、parent 指舊 VERIFIED；保留 verified pointer。更換來源 FileRevision 應走新的 extraction result／C1，不暗改舊 source pin。新確認成功後才更新 active verified pointer。

### C5 archiveCommercialDocument

`archiveCommercialDocument(ctx, {commandId, repositoryId, documentId, expectedVersion}): Promise<DocumentReceipt>`

Contract transaction 只設 archivedAt、version 與 receipt，result revisionId=null；保留所有 pointers/history。不得刪原件或級聯刪 Content/WBS；新 mutation／匯入拒絕，舊 snapshot 的已授權歷史查詢保留。

### C6 / C7 / C8 readers

- `getCommercialDocument(ctx, {repositoryId, documentId}): Promise<DocumentDetail>`：root、active draft／verified 的明確 DTO；無寫入。
- `getCommercialDocumentRevision(ctx, {repositoryId, documentId, revisionId}): Promise<CommercialDocumentRevision>`：exact immutable revision；歷史讀取不代表可作新匯入。
- `getCommercialDocumentReceipt(ctx, {repositoryId, commandId}): Promise<DocumentReceipt|null>`：current authorized exact receipt；無模型依賴，不會執行原命令。

## 5. 純函數：Contract domain

| ID／函數 | 輸入 → 輸出 | 必須拒絕／保留的邊界 |
| --- | --- | --- |
| P1 normalizeCommercialDocument | `(qualifiedResult, profile) → CommercialDocumentContent` | 決定性；不做 I/O／LLM。不猜缺值；相同文字不自動合併；unknown hint 保留 extension 或形成 diagnostic，不丟欄位。 |
| P2 validateCommercialDocument | `(content, purpose:DRAFT|VERIFY, evidenceContext) → ValidationReport` | 嚴格 references／graph／budgets；DRAFT 允許合理缺值，VERIFY 依 kind／來源與核對證據。 |
| P3 applyDocumentEdits | `(content, typedEdits, evidenceContext) → CommercialDocumentContent` | input immutable；未知 field、跨 source evidence、未明示的 split/merge 拒絕；correction 不等於來源之外的新事實。 |
| P4 reconcileDocumentAmounts | `(content, rulesetVersion) → MoneyReconciliationReport` | BigInt decimal；scope/currency/tax basis 正確；不完整時 NOT_COMPUTABLE，不補零、不回填來源數值。 |
| P5 fingerprintDocumentCommand | `(operation, canonicalPayload, serializerVersion) → SHA256` | 已定義欄位與陣列順序；不含 trace/time；固定測試向量。 |
| P6 collectDocumentCoverage | `(content, resultManifest, review) → CoverageReport` | ITEM count 不等於 WBS work count；不能用 AI self count 證明完整；每個 source observation 需被核對或明確分類。 |

## 6. Content／WBS：規劃函數

### W1 prepareCommercialDocumentImport

`prepareCommercialDocumentImport(ctx, {repositoryId, documentId, revisionId, contentRevisionId}): Promise<PlanningImportPreview>`

唯讀，依 current access讀 active verified source 與 Content scope，產生每個 row 的 proposed disposition／必要 planning inputs／measure choices。preview 帶來源 pins、content version 與 fingerprint；不是後續 mutation 的授權。

### W2 importCommercialDocumentIntoContent

`importCommercialDocumentIntoContent(ctx, {commandId, repositoryId, expectedContentVersion, source:{documentId, revisionId}, planningPurpose:"PLANNING_ONLY", selections:PlanningRowSelection[]}): Promise<ContentReceipt>`

Content transaction 內重驗 source 仍是 active VERIFIED、當下來源與目標權限、Content CAS、所有 row 恰好一筆 disposition、measure qualification、選項及 quantity origin。P7 轉換後一次寫 Content revision／完整 provenance／receipt。價格、稅、付款與 party contacts 不複製進工作結構；USER_PLANNED 數量不回寫 Contract。

### P7 expandCommercialDocumentIntoPlan

`expandCommercialDocumentIntoPlan(sourceProjection, selections, currentContent, idAllocator): ContentPlanChange`

決定性純函數；WORK 只接受符合規劃條件的 ITEM。CHARGE／SUBTOTAL／NOTE 不自動變工作。空 work set／漏行／重複選取／無 quantity／未識別 measure 均回明確 diagnostic，不能假稱匯入成功。每筆工作保留 source row pin、quantity origin 與 reason。

### W3 importContentSnapshotIntoWbs

沿用 WBS public use case 的權限／版本語意，更新 source projection 以接收新的 Content provenance。輸入必須包含穩定 command identity、Project expectedVersion、exact Content revision 與明確跨 scope disclosure。只建立 WBS 草稿；不在此發布 Baseline 或寫商務金額。

## 7. HTTP／UI 對應

| 操作 | 目標 transport | 主要函數 |
| --- | --- | --- |
| 開始解析 | POST /api/document-intakes | S3 |
| 查解析／保存回執狀態 | GET /api/document-intakes/status | S9 |
| 以既有 result 恢復保存 | POST /api/document-intakes/resume | S10 |
| 建／改／核對／重開／歸檔文件 | POST /api/commercial-documents，封閉 operation union | C1–C5 |
| 讀文件／revision／receipt | GET /api/commercial-documents，封閉 view union | C6–C8 |
| 預覽／建立 Content | 現有 Content transport 的明確新 command/view | W1/W2 |
| 建 WBS 草稿 | 現有 Project WBS transport | W3 |

新 API 不接舊 candidate aliases。新路徑同樣寫入 bounded runtime logs，並加入 Sentry scope exclusion／整合測試，不因重新命名而重新接回 Sentry。名稱與 UI 改動必須在實作時查 route/source/consumers 並一起更新，不用 API URL 取得授權。舊未完成操作先 drain／保留有限期 readback，不能轉送新模型重做。

## 8. 狀態與故障矩陣

公開失敗以 stage + code + traceId + retryAction 識別，不能全部包成 CONTRACT_SAVE_FAILED。下表是預定 allowlist；provider 原文／SQL 細節僅經受控內部診斷處理。

| stage | code | 工作／回執判斷與動作 |
| --- | --- | --- |
| extraction.preflight | EXTRACTION_PROFILE_INVALID / SOURCE_TOKEN_BUDGET_EXCEEDED | 無 dispatch；修設定或輸入，不自動放寬預算。 |
| extraction.provider | EXTRACTION_REFUSED | FAILED；不進 S7/C1，不自動 repair。 |
| extraction.provider | EXTRACTION_INCOMPLETE | FAILED；保留截斷／過濾 reason，不把部分 JSON 保存成結果。 |
| extraction.provider | EXTRACTION_PROVIDER_REJECTED | 明確 provider 拒絕請求為 FAILED；不自動 fallback。 |
| extraction.provider | EXTRACTION_OUTCOME_UNKNOWN | timeout／傳輸中斷等無法確認者為 OUTCOME_UNKNOWN；READ_STATUS。 |
| extraction.validate | EXTRACTION_OUTPUT_INVALID | 完整回覆但格式／references 無效為 FAILED；不得保存成 READY。 |
| extraction.persist | EXTRACTION_RESULT_SAVE_FAILED | 先 readback；仍持有 payload 時只重送相同 result write。無 durable 結果且 payload 遺失則 UNKNOWN。 |
| target.preflight | DOCUMENT_STORE_NOT_READY | 未 dispatch；修正 storage contract。 |
| target.submit | DOCUMENT_SAVE_FAILED / DOCUMENT_SAVE_OUTCOME_UNKNOWN | 區分明確 rollback 與 commit 未知；保留 READY result，用原 command 查回執／重送，絕不重新解析。 |

START_NEW_ANALYSIS 只代表可由使用者明確發起另一次可能計費的操作，不能由輪詢、一般 retry 或 timeout 自動觸發。下列矩陣補充交易與恢復行為。

| 故障點 | Durable 狀態／可用證據 | 允許動作 | 禁止動作 |
| --- | --- | --- | --- |
| 權限／source／storage readiness 失敗 | 無 dispatch，無新 provider 費用 | 修正輸入／權限／schema | 先解析再發現已知無法保存。 |
| RESERVED 後 crash | dispatchCount=0 | 同 command 重新取得單一 dispatch fence | 並行 winner 都呼叫模型。 |
| DISPATCHED commit 回應不明 | 先讀 job/token | 確認 fence；無法確定則 OUTCOME_UNKNOWN | 假設未 commit 並再 dispatch。 |
| provider timeout／process lost，尚無 result | DISPATCHED 或 OUTCOME_UNKNOWN | 查狀態；明確新操作才可能再計費 | 自動 timeout retry／換模型重試。 |
| provider 已返回，result commit 回應不明 | 同 result ID/hash 可能已存在 | readback／只重送 result write | 再呼叫 provider。 |
| READY 後 Contract 保存失敗 | immutable result 仍在；無或未取得 receipt | S10／C1 原 command 重送 | 丟 result／清 pending／新建 analysis。 |
| Contract commit 成功但 response lost | authoritative receipt 已存在 | exact receipt readback | 另建文件以掩蓋未知結果。 |
| expectedVersion 真正衝突 | result READY；原 command 不能改意圖 | 使用者預覽 current state，明確新 business command 重用 result | 自動改 expectedVersion、documentId 或重新解析。 |
| access 撤銷 | result 不對使用者公開 | 拒絕 read/write；必要 technical completion 只可用原 job fence | 用舊 session／preview／jobId 放行。 |
| schema／程式回退 | 新資料仍在 | 使用可讀新 schema/result/receipt 的 rollback release | 部署只懂舊 schema 的 binary 或刪資料。 |

## 9. 可驗收的不變條件

- 同 analysis command 重試 10 次／同時 10 個請求，providerDispatchCount≤1；network unknown 也不重派。
- 模擬 target `23502`：result READY 保留；修正 storage 後用同 draftCommandId 保存，provider 次數不變。
- 模擬 crash 於每個 commit 前後：head/revision/receipt 原子性、result/READY 原子性均成立。
- 模擬來源缺 quantity：Contract null 不變；Content 只有明確 USER_PLANNED reason 才能建立工作。
- 替代群組來源已核對但未選：可以 VERIFY；Content 必須明確處置所有 rows。
- sender 改 actor、scope、source hash、profile/model、old expectedVersion、cross-result evidence：拒絕或 exact replay，不能產生第二份 side effect。
- rollback release 對新資料的 GET/review/receipt/resume 必須通過；只停止新 analysis，不讓舊 pending 命令變成新計費。
- provider schema/type/decoder 漂移、root anyOf、未 required 欄位及任意 key evidence map 在 dispatch 前被檢查拒絕；nullable 與巢狀 union 正常處理。
- HTTP 200 refusal、max_output_tokens/content_filter incomplete、空輸出與無效 references 均不建立 READY／商務 revision；未知 transport 不觸發 SDK retry。
- 代表性多頁文件量測含 schema／文字／影像的輸入及輸出 usage；超 input budget 在 dispatch 前拒絕。同一 result 恢復保存不再傳 PDF 或呼叫模型。

## 10. 官方依據與設計邊界

2026-10-28 已讀取：[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)、[Function calling](https://developers.openai.com/api/docs/guides/function-calling)、[File inputs](https://developers.openai.com/api/docs/guides/file-inputs)。schema 詳細限制由欄位字典集中描述；一次 dispatch、結果持久化、receipt 與交易恢復是本應用策略，並非官方 API 提供的 exactly-once 保證。
