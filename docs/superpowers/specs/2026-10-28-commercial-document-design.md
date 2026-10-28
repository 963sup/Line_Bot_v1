# 多種類、多廠商商務文件設計

日期：2026-10-28。狀態：使用者於 2026-10-28 批准設計並授權開始實作；不是 current architecture authority。具體 Production DDL／資料處置仍須先完成 preflight、review 與授權邊界核對。

使用者已認可「共同業務欄位＋可擴充欄位＋原始來源證據」方向。本文件中的具體模型、限制與流程是設計建議；尚未把這些建議寫成現行能力。

本文件保留原始問題與當時的來源證據供追溯；不是新能力宣告。實際實作以目前 source、schema 與 tests 為準，執行順序見 [計畫](../plans/2026-10-28-commercial-document-plan.md)。

## 1. 問題與成功條件

同一條 File → Intelligence → Contract → Content → WBS 流程，需處理採購單、報價單、估價單及不同廠商欄位。解析結果須保留來源、可人工修正、能阻止漏行／重複／金額誤解，且保存失敗不能反覆產生模型費用。

提供的樣本有 12 頁；依文字層的項目起始位置初步找到 54 個編號項目，包含跨頁描述、逐項折扣、小計及其他說明。此數量只作本次人工驗收線索，不是任何文件類型的固定規則，也不是獨立驗證過的完整性證明。原件、文字全文、廠商聯絡資料及真實金額不得納入公開 repository 或自動測試 fixture。

成功條件：

- 不同表頭能對應穩定業務語意；未知欄位可見且保留，不需要每家廠商新增 SQL column。
- 草稿允許缺值與未知類型；確認時按文件種類檢查，不把缺少單價的估價項目自動補成零。
- 原始行、續行、調整項與工作規劃之間有完整、可追溯的對應。
- 一個 request 至多進行一次計費解析；保存與回執恢復不重新解析。
- 明確分開「來源核對完成」「商務承諾」「Content 規劃」「WBS 草稿／Baseline」。

## 2. 已證實的現況與來源

基準 revision：`0765f6dd423e8a7113540b1ebe540adee877500e`。以下連結是實際契約的入口，不以此處摘要取代來源。

| 範圍 | 現況來源與設計影響 |
| --- | --- |
| File | [來源與資格契約](../../../packages/file/src/contracts/output/references.ts)：File 保有原件、FileRevision、hash 與存取授權。 |
| Intelligence | [intake 用例](../../../packages/intelligence/src/application/use-cases/intake-document.ts)、[attempt port](../../../packages/intelligence/src/contracts/output/document-attempts.ts)：現有 attempt 只保存技術身分／狀態／target 回執，不保存商務 candidate。 |
| Contract | [intake public contract](../../../packages/contract/src/contracts/input/document-intake.ts)、[model](../../../packages/contract/src/domain/document-intake.ts)、[decoder](../../../packages/contract/src/domain/document-intake-decoder.ts)：目前固定 `purchase-order/v1`。 |
| 擴充證據缺口 | 同一 public contract 的 provider JSON Schema 將 `fieldEvidence` 定為空 properties 且禁止 additional properties；domain decoder 則接受 record。不能把現況誤認為已有可用的任意欄位證據機制。 |
| Persistence | [Contract SQL](../../../packages/integration-supabase/src/schemas/619_contract_documents.sql)、[writer](../../../packages/contract/src/adapters/outbound/persistence/documents.ts)：目前 revision schema version 為 1。 |
| Content | [confirmed-document reader](../../../packages/content/src/application/use-cases/contract-document-expansion.ts)、[plan model](../../../packages/content/src/domain/plan.ts)：目前轉換版本是 `purchase-order-content-v1`，匯入 whole document 並記錄來源行處置。 |
| WBS | [Content reader port](../../../packages/content/src/contracts/output/wbs-expansion.ts)、[Project command parser](../../../packages/wbs/src/application/commands/project-content.ts)：消費不可變 Content revision；跨 scope disclosure 與 Project 授權仍需檢查。 |
| Provider | [extractor](../../../packages/intelligence/src/adapters/outbound/openai-document-extractor.ts)、[transport](../../../packages/integration-openai/src/structured-output.ts)：固定 byte/page/output/time 預算，沒有隱含計費重試。 |

已由 Production runtime log 證實：寫入 `app_private.contract_document_revisions` 時，線上的 `expected_line_count` NOT NULL 限制造成 `23502`；現行 canonical SQL 與 writer 均沒有此欄位。此為已定位的結構不一致；欄位歷史、資料用途與相依物件尚未完成遠端 catalog 核對。

## 3. Approaches

| 方案 | 取捨 |
| --- | --- |
| 每家廠商一個模板 | 固定格式能較快適配，但廠商改版與新文件種類都增加維護；未知欄位容易遺失。只適合日後證據充分的解析提示，不作核心模型。 |
| 所有資料都存自由 JSON | 容易接收，但缺少穩定驗證、金額語意與 Content/WBS 轉換邊界。不能作正式 candidate 契約。 |
| 共通模型＋有型別的擴充欄位＋來源證據 | 推薦。共同規則可驗證，變動欄位可保存，來源與轉換可追溯；代價是需同步版本化、review 與下游 mapper。 |

採用第三種作為本提案。延用現有 packages；不新增「通用文件中心」package、第二套 writer 或廠商專用 database table。

## 4. Owner 與資料流

```mermaid
flowchart LR
  F[File 原件與不可變版本] --> I[Intelligence 有預算的辨識]
  I --> D[Contract 商務文件草稿]
  D --> R[人工核對來源與修正]
  R --> C[明確建立 Content 規劃]
  C --> W[明確匯入 WBS 草稿]
  W --> B[既有治理流程決定 Baseline]
```

| Owner | 擁有的責任 | 不得接手的責任 |
| --- | --- | --- |
| File | 原件生命週期、私有存取、revision/hash | 不擁有辨識欄位或商務確認。 |
| Intelligence | provider、技術解析、預算、attempt/recovery | 不擁有正式文件／商務 candidate 的另一份 durable truth；不 import Contract 私有 model。 |
| Contract | 文件種類、候選事實、來源核對、不可變 revision、商務驗證 | 文件確認不啟用 Engineering Contract，也不直接寫 Content/WBS。 |
| Content | 來源文件到工作內容／計畫數量的明確轉換 | 不改寫來源價格、付款條件或廠商欄位。 |
| WBS | Project 工作分解、治理、Baseline | 不把報價總價當作工作量或商務接受。 |
| Resources | 可選的已授權資源參照 | 辨識到材料不會自動建立資源或庫存事實。 |

## 5. ContractDocument v2 模型

保留既有 ContractDocument aggregate 與表名；新增 `schemaVersion: 2`。v1 revision 不原地改寫。以下名稱是預定的 public/domain 型別，尚未存在於程式。

### 5.1 文件與事實

- `CommercialDocumentKind`：`PURCHASE_ORDER | QUOTATION | ESTIMATE | CONTRACT | UNKNOWN`。
- `CommercialDocumentCandidateV2`：`schemaVersion`、`documentKind`、`header`、`parties`、`sections`、`rows`、`totals`、`terms`、`extensionFields`、`evidence`。
- `header` 保留編號、版本、日期、標題；無法確認的值為 null。日期含糊時保留 raw text，不猜測日／月順序。
- `parties[]` 使用角色 `ISSUER | RECIPIENT | BUYER | SELLER | OTHER`；同一方可有多個角色。不為估價文件憑空補出買方。
- 金額與數量使用十進位字串。金額保留 currency，無來源則為 null；不同 currency 分組驗證，不做隱含匯率換算。
- 每個標準欄位透過 `evidence[]` 的 canonical field path 引用來源；原始欄位只是來源觀察，不是另一份正式業務事實。

### 5.2 行、群組與調整

`CommercialDocumentRowV2` 保有 `sourceRowId`、`kind`、`parentRowId`、`sourceFragments`、共同品項事實及行內擴充欄位。

`kind` 為 `ITEM | SECTION | SUBTOTAL | ADJUSTMENT | NOTE | ALTERNATIVE`。採 discriminated union：ITEM／ALTERNATIVE 才帶完整品項 facts；其他行只帶其 text／amount／adjustment scope 及必要身分、來源，不輸出一整組無用的 null 品項欄位。這避免逐項折扣與小計把輸出 token 膨脹成數倍。

行語意：

- ITEM 是候選品項；同名描述不代表同一行。
- 續行／跨頁描述以 fragments 連回同一 logical row，不另造計費品項。
- 折扣、運費、稅與加價可用 ADJUSTMENT，包含明確作用範圍（某行、某群組或整份文件）。以 signed amount 表示對金額的影響；保留原始符號，避免重複取負。
- SUBTOTAL 不是再次加總的 ITEM。
- ALTERNATIVE 不預設為已選方案；未明確選取時不得匯入 Content。
- parentRowId 只能指向同份 candidate，且不得循環。

`sourceRowId` 是技術身分，不是廠商項次或文字 hash。固定於同一 source revision／解析版本的觀察錨點；重新解析產生新 revision，不假裝行身分已跨版本配對。文字、數量或單價相同也不得自動合併行。

### 5.3 廠商特殊欄位

`CommercialExtensionFieldV2` 採陣列：`fieldId`、`label`、`valueKind`、有型別的值、可空的 unit 與 evidence references。允許 text、decimal、date、boolean；不接受任意巢狀 JSON 或可執行公式。

- 保留原始欄名；不得用 label 當唯一 key，避免同名欄位覆蓋。
- 已知欄位可經規則轉入共通欄位；未能映射者留在擴充欄位並顯示。
- 標準欄位值只有一份 canonical value；修正建立新 revision，記錄原值／新值／理由／actor。
- 廠商識別只是解析提示，不決定 authorization 或驗證例外。

### 5.4 證據與完整性

證據至少含 source FileRevision、頁碼、可空的 table/row/cell anchor、raw label/value 與辨識不確定標記。來源文字與值只在已授權的文件資料／review 顯示，不進 logs。

行數區分為：

1. `observedItemCount`：由正規化後 ITEM 與 ALTERNATIVE rows 計算；不含 SECTION／SUBTOTAL／ADJUSTMENT／NOTE。
2. `modelReportedItemCount`：可空的模型自述，不能證明完整性。
3. `expectedItemCount`：可空；只來自可追溯的獨立 parser 結果或明確的人工來源核對。

未取得獨立 count 時保存 null，不能用 observed count 反填後宣稱驗證通過。確認沿用具身分的人工原件核對；記錄 reviewed pages、source rows 與 verified item count。人工聲明是人工證據，不標成自動驗證。模型／browser 自述不得自行提升成 `PARSER_VERIFIED`。

首版延用現有 PDF／圖片 provider 路徑與人工核對，不假設 production 已有 native PDF text/OCR adapter。研究環境的 `pdftotext` 不等於 Vercel 可用能力。日後新增 parser 時，其技術來源 manifest 由 Intelligence 的既有 processing owner 承接，透過已授權 public reader 驗證；不得把完整商務 candidate 複製進 attempt table。

## 6. 文件類型、驗證與確認

| 類型 | 核對重點 | 建立 Content 的建議規則 |
| --- | --- | --- |
| PURCHASE_ORDER | 買賣方、品項、交付與金額關係；缺值需明示 | 已確認、行處置完整，且使用者明確建立規劃。 |
| QUOTATION | 報價方、有效期、選項、稅與報價範圍 | 來源核對後可明確建立 planning-only 草稿，不等於接受報價。 |
| ESTIMATE | 假設、範圍、數量基礎及未知價格 | 描述核對後，可在 Content 明確填寫規劃數量／measure；來源空值不變，才可明確匯入。 |
| CONTRACT | 保留契約事實；有明細才作行轉換 | 文件確認不建立／啟用既有 Engineering Contract。 |
| UNKNOWN | 保留草稿與來源；提示人工分類 | 不能確認或匯入，先由使用者選擇種類並重驗，不重跑模型。 |

Contract 確認時只要求替代方案已完整辨識、群組與金額 scope 已核對，不要求選中某一方案；因此含替代方案的報價仍可先確認來源。選哪些方案用於工作規劃，由後續 Content planning choices 決定，不回寫 Contract。

`DRAFT → CONFIRMED` 保持來源核對語意；不是法律效力或商務接受狀態。本提案不新增報價接受／簽約／核准 workflow，也不把 `CONFIRMED` 改成那種授權。

數值驗證按已知稅模式、currency 與調整範圍執行；未知稅率、含稅狀態與匯率不能自行猜測。允許不完整草稿；確認 blocker 與可人工附理由接受的 discrepancy 分開。缺少來源、重複 row ID、未能核對的替代群組／行關係、缺少必要事實或不完整行覆蓋不能靠一般 acknowledgement 繞過。

## 7. Content 與 WBS 的轉換

新增 mapping version `commercial-document-content-v2`，保留舊 `purchase-order-content-v1` 的 reader 與歷史語意。

- 只讀取確切、當下仍有權限存取的 CONFIRMED ContractDocument revision。
- 新匯入須明確指定 `planningIntent: "PLANNING_ONLY"`；不由解析／保存／確認事件自動建立下游資料。
- 每個 source row 必須有一筆處置：`CONTENT_WORK`、`COMMERCIAL_ONLY` 或 `NOT_SELECTED`。NOT_SELECTED 只能對使用者已明確處置的替代方案／備註等使用，並保留理由；不能靜默跳過 ITEM。
- 可匯入的工作必須有核對後描述、正數計畫數量及明確 Content measure。來源有值時保留來源值與單位對應；缺值不能補 1，也不能猜測 measure。
- 來源缺數量／單位但使用者仍要規劃時，在 Content 匯入選擇中明確填寫 `planningQuantity`（value、measureId、reason），以 `USER_PLANNED` provenance 保存；Contract 的來源空值保持空值。這是計畫假設，不是改寫廠商事實。未提供則阻擋該次匯入。替代方案的選取也屬於此處的 planning choices，不寫成商務接受。
- 價格、付款、稅、折扣留在 Contract；Content 僅接收工作範圍、計畫數量與來源 pin。
- WBS 保持明確 `import-content-document`、Project access/open-state 檢查、跨 scope disclosure、版本條件與 idempotent request。只建立草稿，Baseline 仍走既有治理。
- 任一來源／Content／WBS 版本變動都不自動改寫另一 owner 的既有 revision。

報價／估價是否開放 planning-only 匯入，是本提案需使用者審閱的產品建議。若不採用，首版僅保存與核對這兩種類型；PO 的既有匯入維持。供應商橫向比價、報價接受與匯率換算不包含在本次計畫。

## 8. Intelligence、成本與恢復

- 同一次 structured extraction 同時產生候選文件種類與欄位，不額外加一個必定計費的分類 call。
- Contract 提供 target-owned strict JSON Schema；Intelligence 仍只依注入的通用 IntakeSchema/IntakeTarget 工作，不新增 Intelligence → Contract package import。
- 外部欄位以 bounded arrays 表示，避免 provider 的 arbitrary-properties 限制；Contract decoder 與 provider schema 必須以相同合成 fixtures 驗證接受／拒絕的一致性。
- Web 命令新增封閉列舉 `pipelineVersion: "purchase-order-v1" | "commercial-document-v2"`。舊命令未帶此欄位時永遠解讀成 v1；新 UI 明確指定 v2。host 只允許已登錄的版本，不接受任意模型、prompt 或 schema。
- 兩個版本各自固定既有／新 schema 與 processor 配置；舊 pending request 不隨 server default 改成 v2。receipt/read 操作不要求模型服務可用。
- intent fingerprint 包含 source、document/request identity、schema/profile、processor/model 與相關版本；同一 request 改意圖一律衝突。移除舊 pipeline 前須先盤點未結束 attempt，保留其無計費 receipt recovery。
- 沿用 reserve → receipt readback → fresh-only extraction → submit → completion。非 fresh 且無 receipt 仍回 UNKNOWN_RESULT，不再次計費。未知提交結果不得自動改 request ID。
- 人工修正、欄位重新映射與重新驗證不呼叫模型。需要重新解析時必須是明確新操作／新 identity，顯示其會再次計費。
- 首版不保證「解析成功但 Contract 保存失敗」能無成本重新保存 candidate：現有 attempt 不存 candidate。先用原命令查回執；無回執則人工查核。要新增此種恢復能力須另定 durable candidate ownership，不能偷偷放進 Intelligence attempt。

| 預算 | 首版規則 |
| --- | --- |
| 現有來源上限 | 558,512 bytes；PDF 24 頁；沿用現行支援 MIME。 |
| 現有模型預算 | 每次最多 24,000 output tokens、105,000 ms；沒有隱含計費重試。 |
| 新 candidate | 序列化 UTF-8 JSON 最多 393,216 bytes；保留在現有 524,288-byte HTTP body 邊界內。 |
| 新結構限制 | 最多 1,000 source rows、64 個文件擴充欄位、每行 16 個擴充欄位、64 個條款；label 128 字元、擴充值 2,048 字元、單一條款 8,000 字元。 |
| 超限 | 拒絕或保留明確 FAILED／待人工處理；不得截斷後稱為完整，不自動分成無上限模型重試。 |

前兩列是目前 source 中的限制；後兩列是本提案的 v2 限制，需用 fixtures 與 provider 實測確認。頁數／bytes／output cap 不等於保證 input token 或費用上限；應記錄 provider usage（有提供時）、模型與 attempt 次數。自動分批與新 OCR runtime 不列入首版。

## 9. 資料版本與 Production drift

先處理現有 `expected_line_count` drift，再發布 v2。遠端 write 必須依 [Canonical Supabase rules](../../../packages/integration-supabase/src/README.md#canonical-supabase-rules)，不是新增 migration history 或手動塞預設值。

1. 唯讀核對 exact project、main revision、欄位 type/default/nullability、相關 constraints/triggers/functions/views 與資料用途；不輸出資料列或文件內容。
2. 對照 canonical schema 與 writer。不能只因現行 source 未使用，就未審閱地刪除有資料的欄位。
3. 產出最小 catalog diff、資料保留方式與 rollback/recovery，完成 review；可能的 destructive reconciliation 不包含在這次文件授權。
4. 依既有規則收斂已驗證 main，read back catalog／RLS／grants 與寫入 invariant，再以同一 intent 查回執確認結果。

v2 發布採 reader-first：SQL 允許 v1/v2 並按版本檢查 candidate，reader 能讀兩者後才切換新 write。保留舊 revision/receipt/fingerprint，不對歷史 v1 回填新的語意。v1 草稿沿用 v1 editor／validator，首版不提供原地轉換成 v2。

既有表只有 schema version 需要擴充；新欄位放在版本化 candidate 與來源核對資料，不按廠商增加 column。任何新增 persisted fact／公共依賴變更必須同步相關 domain/data/module authority、SQL、reader、writer、consumers 與 tests；提案階段不改 machine truth。

## 10. 使用者操作與可觀測性

File 操作顯示「解析商務文件」；完成後顯示辨識種類、原始來源、共同欄位、擴充欄位、行對應與 blockers。可修正種類、映射與事實；確認前要求來源核對，不展示模型 confidence 為正確率保證。

每個階段分別回報讀檔、辨識、Contract 保存、來源核對、Content 匯入與 WBS 匯入。失敗沿用有界 runtime logs 的 trace ID／stage／code／SQLSTATE；不把 private raw fields、完整 provider payload 或商務文件送回 Sentry／日誌。

## 11. 交付順序與驗收

1. 現有 schema drift 的唯讀 preflight 與可審閱修復方案。
2. Contract v2 模型、profiles、evidence 與驗證。
3. v1/v2 reader-first persistence 與回歸。
4. Intelligence 一次解析與 Web review。
5. Content v2 mapping 與 WBS source coverage。
6. 整合、非 production readback、人工樣本驗收及明確的 production rollout。

驗收使用合成文件：不同欄名／重名欄位、無買方、未知日期／幣別、缺單價、稅內含、折扣負號、跨頁續行、替代項、缺失數量、覆蓋不全、舊 v1、併發保存／確認、未知結果與原 request 重試。原件只作獲授權的本地人工驗收，不納入公開 fixtures。

本文件與 [實施計畫](../plans/2026-10-28-commercial-document-plan.md) 先經 PR 合併，再按計畫實作。使用者要求能回退：發布前須保留可讀取 v2 的 reader-first rollback deployment；一旦已有 v2 資料，不得回退至僅支援 v1 的 binary，也不得以刪除資料作回滾。
