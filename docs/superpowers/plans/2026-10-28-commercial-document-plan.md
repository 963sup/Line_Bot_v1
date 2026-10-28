# Commercial Document v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓不同廠商的採購、報價與估價文件可保存、核對，並經明確選擇建立 Content／WBS 規劃，保留來源與一次計費／安全恢復。

**Architecture:** 延用 File、Intelligence、Contract、Content、WBS 各自 authority。Contract 新增版本化商務文件模型；Intelligence 消費 host 注入的 target schema，不新增對 Contract 的依賴。下游只消費已確認、當下授權的 immutable source，規劃數量與商務事實分開。

**Tech Stack:** 現有 TypeScript、Zod、PostgreSQL declarative SQL、Next.js、固定 structured-output provider、node:test；首版不新增 OCR/native PDF runtime 或新的 database/framework dependency。

**Spec:** [多種類、多廠商商務文件設計](../specs/2026-10-28-commercial-document-design.md)。狀態：使用者於 2026-10-28 批准，先合併本計畫再開始執行；規劃中的型別／函式不是現有 exports。

## Global Constraints

- 原始 FileRevision／hash、actor／Repository scope、expectedVersion、request identity、來源重新授權與交易邊界均保留。
- `CONFIRMED` 只代表來源核對；不代表商務接受，不啟用 Engineering Contract，不發布 WBS Baseline。
- 報價／估價 planning-only 匯入與 v2 限制是待審閱建議；未採用時 Task 5 只開放已同意的文件種類。
- 來源上限 558,512 bytes；PDF 24 頁；每次最多 24,000 output tokens、105,000 ms；沒有隱含計費重試。
- v2 candidate JSON 最多 393,216 UTF-8 bytes；HTTP body 上限仍為 524,288 bytes。
- v2 最多 1,000 source rows、64 個文件擴充欄位、每行 16 個擴充欄位、64 個條款；label 128 字元、擴充值 2,048 字元、單一條款 8,000 字元。
- 超限拒絕，不靜默截斷；原件與真實交易資料不納入公開 fixtures；logs 不包含內容、SQL、provider payload 或憑證。
- 不新增 migration history。Production DDL 只依 [canonical provider rules](../../../packages/integration-supabase/src/README.md#canonical-supabase-rules) 收斂 validated main；此計畫不是遠端寫入授權。
- 舊命令缺 pipelineVersion 永遠為 v1；同一 request 跨 pipeline／source／processor 意圖變更須衝突。v1 historical revision、receipt、fingerprint 不重寫。
- 驗證完整輸出寫 ignored artifact；上下文只保留 scoped 結果、第一個可處理錯誤及必要片段。每個 task 最後留一個可獨立理解的 logical commit。

## Review Focus

1. 混合種類／缺買方或單價：可存草稿，不補假值；UNKNOWN 與缺必要來源不能確認。由 Task 1 的 profile fixtures 驗證。
2. 同名欄位、跨頁續行、折扣／小計／替代項：不能覆蓋、重複計價或靜默變工作。由 Task 1、5 驗證。
3. 舊 pending request 在 v2 發布後重試：必須仍走 v1 回執恢復，不再次計費。由 Task 3、6 驗證。
4. 含稅／未稅／多 currency／未知數值格式：不猜測、混幣加總或用浮點誤判。由 Task 1 驗證。
5. 來源／權限／版本變動與跨 Project 匯入：不能憑舊預覽或前端狀態放行；未知提交結果不自動新建 request。由 Task 2、5、6 驗證。

---

## File Structure / Interfaces Map

| 責任 | 預定位置 |
| --- | --- |
| v2 model、profiles、decoder | 新增 `packages/contract/src/domain/commercial-document.ts`、`commercial-document-decoder.ts`、`commercial-document-profiles.ts`；v1 domain 檔保留原語意。 |
| 公開 schema／命令／DTO | 修改 `packages/contract/src/contracts/input/document-intake.ts`、`contracts/dto/document-intake.ts`、`contracts/output/document-intake.ts`。必要 exports 仍由 package manifest 擁有。 |
| reader／writer／source review | 修改 `packages/contract/src/application/use-cases/documents.ts`、`adapters/outbound/persistence/documents.ts` 與 `619_contract_documents.sql`。 |
| 一次計費與 host pipeline registry | 修改 `packages/intelligence/src/application/use-cases/intake-document.ts`、`adapters/outbound/openai-document-extractor.ts`、`composition/bootstrap/document-intake.ts`；Web 的 `document-intake.server.ts` composition 與 `document-intake-http.server.ts` 共同選定固定 pipeline。 |
| Review UI | File 現有 intake hook／projection／review container 演進；新增 `apps/web/src/modules/file/commercial-document-review.tsx` 作 v2 editor，v1 editor 保留。 |
| Content mapper／planning choices | 修改 Content 的 `contracts/output/plans.ts`、`application/commands/plans.ts`、`application/use-cases/contract-document-expansion.ts`、`domain/plan.ts` 及 host `contract-content-expansion.server.ts`。 |
| 下游 data checks | 核對並修改 `618_content_plans.sql`、`702_project_wbs.sql` 與各自 decoder 中的 mapping/disposition allowlist，不改歷史 v1 定義。 |
| authority | 依實際語意同步 `architecture/domain/owners/contract.json`、`content.json` 與必要 data owner entries；不預先建新 relation 或放寬 dependency guard。 |

### 預定 v2 型別決策

- `CommercialDocumentCandidateV2` 固定包含 schemaVersion=2、documentKind、header、parties、sections、rows、totals、terms、extensionFields、evidence；provider schema 的所有屬性明確定義，缺值用 null，不使用任意 JSON。
- `CommercialDocumentRowV2` 是以 kind 區分的 union，共通 sourceRowId、kind、parentRowId、sourceFragments、extensionFields。ITEM／ALTERNATIVE 的 facts 包含可空的 itemNumber、category、materialCode、description、quantity、unit、unitPrice、grossAmount、netAmount、deliveryDate；ALTERNATIVE 另帶 alternativeGroupId。category 沿用 material/service/freight/other，可為 null。SECTION／NOTE 只帶 text；SUBTOTAL 帶 amount；ADJUSTMENT 帶 signedAmount、adjustmentType 與 scope=ROW/SECTION/DOCUMENT，不重複完整品項 null 欄位。
- `SourceReviewAttestationV2`：verifiedItemCount、reviewedSourcePages、reviewedSourceRowIds、confirmedFromOriginal=true；verifiedItemCount 對 ITEM 與 ALTERNATIVE 計數，reviewedSourceRowIds 覆蓋所有 row kinds。不接受模型自稱人工核對。
- `CommercialDocumentDiagnostic`：code、severity=BLOCKER/REVIEW、fieldPath、sourceRowIds；顯示訊息由固定 code 產生。
- `CommercialDocumentPlanningChoices`：planningIntent=PLANNING_ONLY、逐 sourceRowId 的 disposition/reason，以及可空的 planningQuantity={value, measureId, reason}。它屬 Content 命令，不修改 Contract source。

## Task 0 — 現有保存故障：遠端 catalog preflight 與修復決策

**Files / evidence:** 只讀 [619_contract_documents.sql](../../../packages/integration-supabase/src/schemas/619_contract_documents.sql)、[writer](../../../packages/contract/src/adapters/outbound/persistence/documents.ts)、[provider rules](../../../packages/integration-supabase/src/README.md#canonical-supabase-rules)。遠端原始證據留 ignored artifact；公開文件只保存無內容的結論。

**Interfaces:** Consumes exact validated main 與 authorized operator target；produces catalog diff、資料保留／相依物件／回滾評估及可審閱 reconciliation SQL。沒有假定的 `schema:remote` script。

- [ ] 依 provider 規則唯讀確認 exact project，以及 expected_line_count 的 type/default/nullability、相關 constraints/functions/triggers/views 和資料用途；不得讀回文件資料列或憑證。
- [ ] 比對 canonical schema 與 writer，確認 drift 的完整範圍；不得假設移除一個 NOT NULL 就已對齊。
- [ ] 若欄位仍有業務用途，先決定 canonical owner／資料保留；否則提出最小 reconciliation。禁止補 0、補 54 或以 extracted count 假造 expected count。
- [ ] 在隔離環境重現舊 catalog 的 `23502` 與交易 rollback，再驗修復後的保存、原 request replay、確認及拒絕路徑。
- [ ] 產出可 review 的 SQL／preflight／readback 計畫。Production mutation 另依規則取得具體授權並 read back；未完成此 gate，不宣稱線上保存已修好。

**完成條件：** 能說明修復如何保留既有資料與解除現有故障；Task 1 可做純模型工作，但 v2 production rollout 必須等此項收斂。

## Task 1 — Contract v2 與文件種類驗證

**Files:** 新增上述三個 domain 檔及 `packages/contract/test/commercial-document.test.ts`、`commercial-document-schema.test.ts`；修改 public intake contract。執行時先依 LSP 查明真正 public consumers，不匯入他包私有路徑。

**Interfaces:**

- Produces `parseCommercialDocumentCandidateV2(value: unknown): CommercialDocumentCandidateV2`。
- Produces `validateCommercialDocumentCandidateV2(candidate, purpose: "SAVE" | "CONFIRM", review?: SourceReviewAttestationV2): readonly CommercialDocumentDiagnostic[]`。
- Produces `commercialDocumentExtractionSchemaId = "commercial-document/v2"`、version=2 與 `commercialDocumentExtractionSchema`；不改 v1 schema ID。

- [ ] 寫合成 fixtures 與 failing tests：五種 documentKind、無買方／單價的草稿、UNKNOWN 確認拒絕、同名欄位以不同 fieldId 並存、重複 row ID／循環 parent 拒絕；替代群組未核對不能確認，已核對但尚未選方案的報價可以確認來源。
- [ ] 為跨頁 fragments、SUBTOTAL 不重複加總、signed discount 不雙重取負、tax mode unknown、多幣分組與未知日期／小數格式補測試；不可把樣本 54 行寫成通則。
- [ ] 執行 `pnpm check test -- --filter=@line_bot_v1/contract`，確認新增測試因尚缺 v2 行為而失敗。
- [ ] 實作 parser、profiles、decimal 驗證、欄位／row／candidate byte budgets；SAVE 接受可表達的缺值，CONFIRM 依 profile 及 review evidence 決定 blocker。
- [ ] 用相同 fixtures 驗證 provider JSON Schema 與 domain decoder 接受／拒絕一致；特別驗證 evidence 可非空且不是自由 JSON。
- [ ] 重跑 Contract tests/typecheck，保留 v1 domain tests 綠燈；同步 Contract owner 的商務文件語意，提交 logical commit。

## Task 2 — v1/v2 持久化與不可變歷史

**Files:** Contract DTO/output ports、documents use case、documents persistence；`619_contract_documents.sql`；`packages/contract/test/documents-postgres.test.ts` 與新 v2 postgres fixtures。

**Interfaces:** Consumes Task 1 types；produces revision discriminated union `{schemaVersion: 1, candidate: PurchaseOrderCandidate} | {schemaVersion: 2, candidate: CommercialDocumentCandidateV2}`，其餘 revision/source/receipt identity 不變。`ContractDocumentIntake.read/receipt/submit` 的路由與命令角色保留。

- [ ] 先寫 failing tests：v1 歷史仍可讀、v2 round trip、version/candidate 不一致拒絕、extra fields 保留、未授權來源拒絕、競爭保存／確認、失敗回執完全 rollback。
- [ ] SQL reader-first 允許 v1/v2 並分別驗 candidate shape／source-review shape；不能把 version=1 的舊 candidate 解讀成 v2 或批次改寫舊 revision。
- [ ] 修改 decoder、DTO、writer 與 use case 的 version dispatch；確認時驗現有來源 pin 與完整 review，建立新 immutable revision。
- [ ] 驗 current-authorized receipt readback、舊 v1 expectedVersion/replay fingerprint；舊草稿只走 v1 editor／validator。
- [ ] 跑 `pnpm check schema:check`、Contract tests/typecheck 與隔離 PostgreSQL 競爭測試；新 persisted semantics 同步相關 authority，提交 commit。新 writer 尚不對使用者開啟。

## Task 3 — 固定 pipeline registry、一次解析與升級恢復

**Files:** Intelligence intake use case/extractor/composition；Web `apps/web/src/app/api/_composition/document-intake.server.ts`、`apps/web/src/modules/document-intake/document-intake-http.server.ts`；Intelligence intake tests、OpenAI transport tests、Web intake HTTP tests。

**Interfaces:**

- Consumes Task 1 target schema 與 Task 2 target port，由 host composition 注入；Intelligence 的 `IntakeSchema`／`IntakeTarget` 仍為 generic。
- Web accepts `pipelineVersion?: "purchase-order-v1" | "commercial-document-v2"`；缺少時固定 v1。host 用 closed registry 選擇固定 schema／processor；browser 不指定 model/prompt/schema。
- Web runtime 由單一 intake binding 演進為 `intakes: Readonly<Record<"purchase-order-v1" | "commercial-document-v2", Intake | null>>`；同步所有真正 consumers，不留第二個兼容 wrapper。
- `IntakeReceipt`／Contract receipt source pin 不變；stage／trace ID 與 safe runtime logging 保留。

- [ ] 先寫 failing tests：新文件一次 provider call；v2 開啟後，缺 pipelineVersion 的舊 pending request 仍走 v1；同一 request 改版本是衝突；receipt readback 不需 provider key。
- [ ] 補 provider incomplete/refusal、超過 byte/page/output/time budget、target 保存失敗、completion unknown、併發同 request、scope 變更的呼叫次數測試；所有恢復路徑不得再計費。
- [ ] host 登錄固定的 v1/v2 配置與 schema。保留 v1 processor 版本，直到未完成 request 有明確退場／readback 方案。
- [ ] extractor 同一次輸出文件種類與候選欄位。驗證超限與格式失敗，不隱含重試／自我修復；candidate 不寫入 attempt table。
- [ ] usage／processor／pipeline／attempt 次數可觀測，資料／PDF／raw provider response 不進 logs。儲存失敗無回執維持 UNKNOWN_RESULT，不宣稱 candidate 可無成本恢復。
- [ ] 跑 Intelligence／integration-openai／Web intake tests 與受影響 typecheck，提交 commit；此時舊 UI 仍可走 v1。

## Task 4 — 通用 review UI 與人工核對

**Files:** 修改 `apps/web/src/modules/file/files-panel.tsx`、現有 intake hook/view/container 與 `apps/web/src/modules/document-intake/document-intake-http.server.ts`；新增 `commercial-document-review.tsx`。使用 Serena LSP 先定位再將 hook/view/container 改成 `use-document-intake.ts`、`document-intake-view.ts`、`document-intake-review.tsx`；v1 `purchase-order-review.tsx` 保留。測試沿用 `apps/web/test/purchase-order-review.test.ts` 並新增 `commercial-document-review.test.ts`。

**Interfaces:** Consumes Task 2 discriminated DTO 與 Task 3 registry；produces使用者明確送出的 v2 save/confirm commands 及 SourceReviewAttestationV2。新解析命令帶 v2 pipelineVersion；現有 pending command 不被改版本或 request ID。

- [ ] 先寫 failing tests：依 revision 版本呈現正確 editor；未知欄位／重名 label 不遺失；分類修正與欄位修正不呼叫模型。
- [ ] 原件與欄位對照、分類、缺值、原始欄名、row fragments、調整 scope 與 blocker 可檢視；人工 confidence 不標成自動正確率。
- [ ] v2 confirm 明確要求核對 source pages/rows/item count；不能直接用 UI 已解析行數填作「已核對」。保留未知、拒絕、衝突與保存結果不明的區別。
- [ ] 保留 identity loss／Repository 切換／pagehide 清除私有 state、stale response 防護與原 request 重試；重新解析另建明確操作並提示計費。
- [ ] 欄位超限拒絕而不靜默截斷；v1 歷史與 v1 草稿可用。來源金額空值不能用補 0 的方式解開確認。
- [ ] 跑受影響 Web tests、lint/typecheck/build；用合成不同版面做人工 review 驗收，提交 commit。

## Task 5 — 明確的 Content 規劃轉換與 WBS 相容

**Files:** Content source/expansion port、plans command/use case/domain、host `apps/web/src/app/api/_composition/contract-content-expansion.server.ts`、`618_content_plans.sql`；WBS decoder／`702_project_wbs.sql` 中 source coverage allowlist；Content/WBS tests。SQL／public contract 變動同時更新相應 authority。

**Interfaces:**

- Content produces `CommercialDocumentPlanningChoices` 與 `expandCommercialDocumentIntoPlan(source, choices, context): ContentPlanRevision`；同一 snapshot 包含 mapping version、來源 pin、每行 disposition、USER_PLANNED 假設。
- Content 的 source port 接受 v1/v2 的最小 planning projection，不接收價格／付款資料。Contract 仍透過現有 public reader 提供版本；host 在兩個公開契約間接線，不新增 package private imports。
- New v2 mappingVersion=`commercial-document-content-v2`。既有 v1 reader/mapping 保留；WBS 的 Content reader 與 `import-content-document` wire identity 不變。

- [ ] 先寫 failing tests：CONFIRMED 與當下 scope 必須重驗；DRAFT／UNKNOWN 拒絕；報價不會自動成為承諾；所有 sourceRowIds 必須恰好被處置一次。
- [ ] 為替代方案未選／多選、折扣／稅／小計不變工作、重複匯入、缺描述／數量／measure、來源版本漂移補測試。
- [ ] v2 匯入要求 planningIntent 及完整 row dispositions。缺來源數量時只允許使用者提供有 reason 的 Content planningQuantity，origin 記為 USER_PLANNED，Contract source null 不變。
- [ ] Content domain 實作 v2 conversion；計畫數量與 measure 依 Content owner 規則驗證。不能用 acknowledgement 繞過缺失／未處置的 source rows。
- [ ] 更新 Content/WBS 的 mapping/disposition decoder 與 SQL 檢查以讀取新 provenance；確定 v1 snapshots 仍保持原語意。WBS 不新增價格／商務接受，也不自動發布 Baseline。
- [ ] 驗 WBS current Project authorization、跨 scope disclosure、open-state、expected version、source pins 與 idempotent replay；跑 Content/WBS tests、schema checks、相關 typecheck/build，提交 commit。

## Task 6 — 整合、rollout 與交付證據

**Files:** 各 owner 的整合 tests、Web profile fixtures、必要 provider/runbook 與 public contract 說明。原件只作獲授權的本地人工驗收。

**Interfaces:** Consumes Tasks 0–5；produces exact-head 的驗證證據與 operator 可執行、已 review 的 release/readback 步驟。不新增平行 release workflow。

- [ ] 用合成 PO、報價、估價、未知類型各跑 File → extraction → draft → confirm；再按已批准政策跑 explicit Content → WBS draft。
- [ ] 驗來源缺數量而另填計畫數量、跨頁續行、逐項折扣與多 currency；比較檢視的是來源事實，不能在測試中偷加報價接受／匯率轉換功能。
- [ ] 模擬 reader-first 滾動升級：舊 v1 UI／pending command、新 v2 UI／pending command、模型設定不可用、確認競爭、Contract commit 成功但 response/completion 中斷。驗每條路徑的 provider count 與 exact receipt。
- [ ] 驗 token/page/bytes/output caps 及輸出不完整時的明確拒絕；使用至少 54 個 logical items 並含逐項調整／小計的合成文件量測 provider usage，確認 compact row union 的成本。若不符合現有預算，先回報容量／成本決策，不提高上限或省略行；不以 bytes/page cap 宣稱精確 input token 或費用上限。
- [ ] 依 affected scope 跑 `pnpm check lint`、`pnpm check typecheck -- --filter=@line_bot_v1/contract --filter=@line_bot_v1/intelligence --filter=@line_bot_v1/content --filter=@line_bot_v1/wbs --filter=@line_bot_v1/web`、對應 test/build、schema checks 與必要全域 guards；已知 baseline failures 與新失敗分開記錄，不弱化規則。
- [ ] 完成 independent technical review，保留所有 findings 的處理結果；以 current head 的必要 CI 與最新 main 為 merge gate。
- [ ] Production 只收斂 validated main；Task 0 的 reconciliation 完成後 read back version constraints/RLS/grants/dependencies，再開新 UI。若 writer 需回退，只停止新的 v2 intake；v2 reader/receipt/review 保留，不能部署無法讀取已寫入 v2 的舊 binary。
- [ ] 用獲授權的小型樣本人工驗收並以 runtime trace 核對實際部署與保存；不得用 mock 或本地成功宣稱 Production 已修復。

## 本輪完成與執行前審閱

使用者已審閱方向並授權先合併文件、再開始實施。Builder check 已收斂重要歧義；不以 review 結論取代實作與外部驗證。實作採 reader-first／writer-second，保留可讀取 v2 的 rollback deployment 與 exact request receipt recovery。未取得具體 Production mutation 授權前，不執行遠端 DDL／資料處置。
