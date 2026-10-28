# CommercialDocument 欄位與資料契約

狀態：2026-10-28 完整目標規格；最小 DRAFT 流程已實作，完整欄位映射與核對／規劃功能仍待完成。使用者要求目標模型不遷就舊欄位；本文件取代先前 v2 欄位草案，不修改 current SQL authority。函數見 [函數契約](2026-10-28-commercial-document-functions.md)，整體決策見 [設計](2026-10-28-commercial-document-design.md)。

## 1. 命名與基本型別

| 概念 | TypeScript／API | PostgreSQL | 規則 |
| --- | --- | --- | --- |
| 業務操作身分 | commandId | command_id | UUID；同一操作重試不變。不能與 HTTP request ID 混用。 |
| 單次請求診斷 | traceId | 不作業務欄位 | 每次 HTTP 請求獨立；不進 command fingerprint。 |
| 技術解析工作 | extractionJobId | extraction_job_id | UUID；一次工作最多一次 provider dispatch。 |
| 不可變解析結果 | extractionResultId | extraction_result_id | UUID；與 job 一對一，寫入後內容不可修改。 |
| 商務文件 | documentId | document_id | UUID；不是廠商文件號。 |
| 商務文件快照 | revisionId | revision_id | UUID；不是使用者看到的廠商版本字樣。 |
| 樂觀鎖 | version／expectedVersion | version | bigint／非負安全整數；create 使用 expectedVersion=0。 |
| 廠商文件號 | documentNumber | content JSON | 可含非數字、前導零；不作 PK／FK。 |
| 廠商版本字樣 | documentRevisionLabel | content JSON | 例如 A、Rev.2；不決定系統 revision 順序。 |
| 格式版本 | schemaVersion | schema_version | 整數；只表示新契約的資料格式，不混用業務版本。 |

- API、TypeScript 使用 camelCase，SQL 使用 snake_case；縮寫只保留 ID、ISO 等已定義概念。
- UUID、SHA-256、DateOnly、Instant、DecimalString、CurrencyCode、UnitLabel 必須有 decoder，不以 TypeScript 型別宣稱已驗證。
- DecimalString：無千分位／指數記號；最多 38 位有效數字、12 位小數；標準化負零與尾端零，運算以整數係數及 scale，不使用浮點金額。
- DateOnly：有效 Gregorian `YYYY-MM-DD`；Instant：server UTC timestamp，API 為 ISO 字串，SQL 為 timestamptz。
- CurrencyCode：明確的 ISO 4217 code；不能辨識時為 null，不能以廠商國別補 TWD。
- pageNumber 一律從 1 開始；position 是同群組內從 0 開始的排序，不作身分。
- 金額、數量的零與缺值分開；所有未知值有明確缺值原因，沒有隱含的 0、1 或空字串預設。

## 2. 共通事實與來源型別

### SourceFileReference

| 欄位 | 型別／null | 驗證 |
| --- | --- | --- |
| fileId | UUID，必填 | 由 File public qualifier 驗證。 |
| fileRevisionId | UUID，必填 | 必須屬於 fileId／Repository。 |
| sha256 | 64 位小寫 hex，必填 | 必須符合 FileRevision 及實際已驗證來源。 |

不在此物件放 signed URL、bucket key 或 storage credential。

### EvidenceReference

封閉 union：`{kind:"EXTRACTION", extractionResultId, observationId}` 或 `{kind:"HUMAN", evidenceId}`。observationId 是 technical result 內由服務端固定的 UUID；不能指向別份結果或跨 scope 觀察。技術來源頁數／位置由 result reader 解析。

AI 漏掉來源行時，允許人工補證據，不能因 result immutable 而無法修正。`HumanSourceEvidence`：evidenceId、同 source FileRevision、pageNumber、可空的 normalized rectangle、quotedText、reason、createdByUserId、createdAt。browser 只提交 evidenceId/pageNumber/rectangle/quotedText/reason，source/actor/time 由 owner 固定；page bounds 與 hash 依可信 sourceManifest 檢查，幾何座標與引文標為人工聲明，不偽稱 parser proof。證據寫在 Contract revision 的 humanEvidence 陣列；新 snapshot 只能引用其自身保留的 immutable evidence。舊證據不得原地覆寫。

### FieldValue<T>

| 欄位 | 型別 | 語意 |
| --- | --- | --- |
| value | T 或 null | 正規化候選／已核對事實。 |
| missingReason | NOT_PRESENT／UNREADABLE／AMBIGUOUS／null | value 非 null 時必為 null；value 為 null 時必填。 |
| evidenceRefs | EvidenceReference[] | 非空事實須有可定位來源；人工 OCR 修正仍指原件。 |
| origin | EXTRACTION／HUMAN_CORRECTION | 不表示已驗證；revision.reviewState 才表示核對狀態。 |
| correctionReason | string 或 null | HUMAN_CORRECTION 必填；actor/time 由 command/revision 記錄。 |

來源沒有的商務事實不能以「人工修正」發明；規劃假設放 Content。頁面 confidence 或模型 hints 不代表正確率／授權。

### Money

`{ amount: DecimalString, currencyCode: CurrencyCode | null }`。未知 currency 不參與跨金額加總；混幣不自動換匯。數量／單價／總額分開，不用一個含糊的 amount 欄位同時表示三者。

## 3. 商務文件快照

### CommercialDocumentContent

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| documentKind | PURCHASE_ORDER／QUOTATION／ESTIMATE／CONTRACT／UNCLASSIFIED | UNCLASSIFIED 可保存草稿，不能核對完成。 |
| header | DocumentHeader | 見下表。 |
| parties | DocumentParty[] | 同一方可有多個角色。 |
| sections | DocumentSection[] | 群組樹；沒有群組時空陣列。 |
| rows | DocumentRow[] | 保留明細、費用、合計、備註；所有來源行均需可追溯。 |
| selectionGroups | DocumentSelectionGroup[] | 描述來源提供的選項，不存商務接受或規劃選取。 |
| totals | DocumentMoneySummary[] | 按範圍及 currency 分組，未知時不能假造算式。 |
| terms | DocumentTerm[] | 有來源的付款、交期、有效期、保固等。 |
| extensionFields | ExtensionField[] | 非標準欄位，無任意巢狀 JSON。 |

### DocumentHeader

全部使用 FieldValue：`documentNumber: string`、`documentRevisionLabel: string`、`title: string`、`issueDate: DateOnly`、`validUntilDate: DateOnly`、`defaultCurrencyCode: CurrencyCode`。日期含糊時 value=null／AMBIGUOUS；不能猜日月順序。defaultCurrencyCode 只有原件明示適用整份文件時才能用於金額正規化。

### DocumentParty

`partyId: UUID`、`roles: (ISSUER | RECIPIENT | BUYER | SELLER | OTHER)[]`、`name: FieldValue<string>`、`identifiers: {scheme, label: string|null, value: FieldValue<string>}[]`、`postalAddress: FieldValue<string>`、`extensionFields`。scheme 使用 TW_TAX_ID／VAT_ID／OTHER；label 在 OTHER 時保留來源標籤，不把不同識別碼混成 registrationNumber。聯絡方式只在有來源、已授權的 extension fields 顯示，不進 logs。

### DocumentSection

`sectionId: UUID`、`parentSectionId: UUID|null`、`position: number`、`title: FieldValue<string>`、`evidenceRefs`。parent 必須屬同 snapshot，不能循環。

### DocumentRow：依 rowType 區分的 union

共通欄位：`rowId: UUID`、`sectionId: UUID|null`、`position: number`、`evidenceRefs: EvidenceReference[]`、`extensionFields`。rowId 代表文件內的 logical row；不以項次、品名或價格當身分。來源續行可由多個 observation references 組成同一行；分割／合併必須是明確的人工 edit 並留下 derivedFromRowIds，不能按文字相同自動去重。

| rowType | 專屬欄位 | 規則 |
| --- | --- | --- |
| ITEM | itemNumber、referenceCode、description、quantity、unitLabel、unitPrice、lineAmount、deliveryDate，均為 FieldValue；quantity=DecimalString、unitPrice/lineAmount=Money | quantity 可為來源缺值；進 Content 時才要求明確計畫數量。 |
| CHARGE | chargeKind=DISCOUNT/TAX/FREIGHT/ROUNDING/OTHER；scope；signedAmount: FieldValue<Money>；rate: FieldValue<DecimalString>；description | signedAmount 正數增加、負數減少；折扣不能重複取負。只有 rate 而無 basis 時不猜金額。 |
| SUBTOTAL | scope；reportedAmount: FieldValue<Money>；label | 是來源報告的小計，不再當 ITEM 加總。 |
| NOTE | text: FieldValue<string> | 不自動變工作。 |

PricingScope：`{ scopeType: DOCUMENT|SECTION|ROW, sectionId: UUID|null, rowId: UUID|null }`；DOCUMENT 的兩個 ID 都為 null；SECTION 只需 sectionId；ROW 只需 rowId，且 ROW 不得指向自己、CHARGE 或 SUBTOTAL 形成循環。

### DocumentSelectionGroup

`selectionGroupId`、`label`、`itemRowIds`、`selectionMode=ONE_OF|ANY_OF|UNSPECIFIED`、`evidenceRefs`。成員必須是 ITEM。替代項仍然是 ITEM，因此來源品項計數不因選項分類而改變。Contract 核對「選項確實存在且表達正確」；Content 才決定規劃選取，不回寫為接受報價。

### DocumentMoneySummary

`summaryId`、`scope`、`currencyCode: CurrencyCode|null`、`amountBasis=TAX_EXCLUSIVE|TAX_INCLUSIVE|MIXED|UNSPECIFIED`、`itemsAmount`、`nonTaxAdjustmentsAmount`、`taxAmount`、`payableAmount`、`evidenceRefs`。四個 amount 使用 FieldValue<DecimalString>，是原件報告的值；derived calculation 不回填成來源值。

- TAX_EXCLUSIVE 且值完整：itemsAmount + nonTaxAdjustmentsAmount + taxAmount 對照 payableAmount。
- TAX_INCLUSIVE 且值完整：itemsAmount + nonTaxAdjustmentsAmount 對照 payableAmount；taxAmount 為內含資訊。
- MIXED／UNSPECIFIED、currency 不明或缺必要值：NOT_COMPUTABLE，不當作已驗算成功。
- 計算報告為 PASS／MISMATCH／NOT_COMPUTABLE，含 rulesetVersion、contentFingerprint、diagnostic codes。確認需對 REVIEW 類差異明確記錄理由；不能用理由繞過來源／結構 blocker。

rulesetVersion=1 的 checkKind=SUMMARY_BALANCE，逐筆驗證上述原件報告金額的等式，不把不同 scope／currency 或小計混加；PASS 不代表逐行計價、來源完整性或人工核對已完成。contentFingerprint 使用 schema decoder 正規化後的固定欄位順序 JSON，對 `commercial-document-content/1\n` 前綴與該 UTF-8 JSON 計算 SHA-256；陣列保持來源順序。這是內容指紋，不是 command fingerprint；變更此序列化契約須版本化與固定測試向量。

### DocumentTerm / ExtensionField

- Term：`termId`、`termKind=PAYMENT|DELIVERY|VALIDITY|WARRANTY|OTHER`、`text: FieldValue<string>`。
- Extension：`fieldId`、`label`、`valueType=TEXT|DECIMAL|DATE|BOOLEAN`、`value`（對應的 scalar 或 null）、`missingReason`、`unitLabel: string|null`、`evidenceRefs`。
- 同名 label 可以並存，fieldId 唯一。不得當作 key 覆寫，不執行公式、HTML 或任意程式。日期／數值格式不明時保留來源 observation，正規化值為 null。

## 4. 文件生命週期與核對證據

### CommercialDocument（head）

`documentId`、`repositoryId`、`version`、`draftRevisionId: UUID|null`、`verifiedRevisionId: UUID|null`、`createdByUserId`、`createdAt`、`updatedAt`、`archivedAt: Instant|null`。

- 至少一個 revision pointer 非 null。head 只指選中的草稿與已核對版本，不複製其欄位。
- verified snapshot 不可原地修改。重新編輯建立新 DRAFT，原 verified pointer 保留；新核對完成後才更新 verified pointer。
- 歸檔只阻止新 mutation／新下游匯入，不刪除歷史與既有來源 pins。

### CommercialDocumentRevision

`revisionId`、`documentId`、`repositoryId`、`documentVersion`、`parentRevisionId: UUID|null`、`schemaVersion`、`reviewState=DRAFT|VERIFIED`、`source: SourceFileReference`、`extractionResultId`、`content: CommercialDocumentContent`、`humanEvidence: HumanSourceEvidence[]`、`review: DocumentReviewConfirmation|null`、`createdByUserId`、`createdAt`。

DRAFT 的 review 為 null；VERIFIED 必須有完整 review。schemaVersion 初始為 1，格式 ID=`commercial-document/1`；不在新名稱放 v2，也不為舊 purchase-order/v1 留 aliases。

### DocumentReviewConfirmation

`reviewedByUserId`、`reviewedAt`（server 產生）、`sourceFingerprint`、`reviewedPageNumbers`、`reviewedEvidenceRefs`、`reviewedItemRowIds`、`sourceItemCount: number|null`、`countEvidence=HUMAN_ATTESTED|PARSER_OBSERVED|UNAVAILABLE`、`acknowledgedDiagnostics: {code, reason}[]`、`confirmedAgainstOriginal: true`。

模型與 browser 不能自稱 PARSER_OBSERVED；該值須由 technical evidence reader 驗證。人工 count 是人工聲明，不是自動證明。sourceItemCount 不能從 normalized item count 自動補入。sourceFingerprint 綁定 FileRevision、result 與目前 revision content fingerprint，不能拿舊 preview 的核對套到新內容。

UNCLASSIFIED、缺必需來源、重複／跨範圍 references、未核對的選項群組、未知的必要事實均為 blocker。選項未被選取不是 Contract blocker。

## 5. Intelligence 工作與不可變結果

### DocumentExtractionJob

`extractionJobId`、`analysisCommandId`、`actorUserId`、`repositoryId`、`source`、`profileSnapshot`、`state`、`version`、`providerDispatchCount`、`dispatchToken`、`leaseExpiresAt`、`targetIntent`、`lastFailureCode`、`createdAt`、`dispatchedAt`、`finishedAt`。

- state=`RESERVED|DISPATCHED|READY|FAILED|OUTCOME_UNKNOWN`。
- providerDispatchCount 只能 0→1；DISPATCHED 前先 durable commit count=1 與 dispatchToken。不能因 lease 逾時再呼叫 provider。
- targetIntent=`{documentId, draftCommandId, expectedDocumentVersion}`，是主要自動保存操作的穩定身分，不是商務保存成功事實。
- 不存 DELIVERED flag：保存是否成功只由 Contract command receipt 證明，避免第二套互相打架的完成狀態。
- RESERVED 的 lease 到期可 CAS 取得新的 dispatch fence；舊 worker 的 S5 會失敗。一旦 DISPATCHED，lease 到期不能授權第二次 provider call。
- OUTCOME_UNKNOWN 可由原 dispatch fence 的遲到結果轉 READY；不能因此重新派工。首版不提供解析取消，關頁不代表取消或撤銷計費。
- dispatchToken/lease 與 profile 的內部設定只屬 internal record，不暴露給 browser DTO。

profileSnapshot 固定 profileId/profileVersion、observationSchemaVersion、normalizerVersion、modelId、promptFingerprint、configurationFingerprint；另固定 API 模式 RESPONSES、schemaFingerprint、PDF detail 設定（僅在所選模型支援時）、inputTokenBudget、maxOutputTokens、timeoutMs 與 estimatorVersion。無法可靠估算的設定不能宣稱已通過 token 預算。不含 secrets；server registry 決定全部值，browser 只選已公開的 closed profile key。

### DocumentExtractionResult

`extractionResultId`、`extractionJobId`、`repositoryId`、`source`、`sourceManifest`、`observations`、`semanticHints`、`resultFingerprint`、`providerUsage`、`createdAt`。

- sourceManifest 包含實際已讀 bytes 的 byteLength/sha256、server inspector 得到的 pageCount、可空的 independentItemCount 及其 evidence kind。
- observation：服務端固定的 observationId、pageNumber、block/table/row/cell anchors、raw label/value、fragment relationship；缺座標允許 null，pageNumber 不得超過實際 pageCount。
- semanticHints 只有指向觀察的候選欄位／種類提示，仍是不可信 input；不是正式 CommercialDocumentContent。
- 只保存一份 technical result，不同時存 raw provider body 與另一份 normalized business candidate。結果不可變；主結果 commit 與 job→READY 同一交易。
- providerUsage：input/output/total tokens 與 provider request ID（有才存）；未知為 null，不把 output cap 說成費用保證。

來源為 PDF／圖片時沿用現有 byte/page/output/time 邊界；不能假設 production 有研究環境的 pdftotext。首版不新增 OCR OS binary 或任意自動分批。新 schema 的原始 labels／values 會增量計費，必須先量測再放行。

### ProviderObservationPayload：模型輸出契約

模型輸出、不可變 technical result 與 CommercialDocumentContent 是三個不同契約。ProviderObservationPayload 只含 `observations` 與 `semanticHints`；可信 source manifest、IDs、權限、審核狀態與 receipt 由 server 補入或另行管理，不能交由模型決定。

- Responses API 使用 `text.format={type:"json_schema", name, strict:true, schema}`。JSON mode 只保證 JSON 格式，不作替代或自動降級。
- 根節點是 object，不使用 root anyOf；每個 object 都有 `additionalProperties:false`，所有 properties 都列入 required。可缺值用 nullable 欄位表達，不能用空字串／零補齊。
- 可在巢狀欄位使用符合支援子集的 anyOf；例如不同 observation／hint 類型。跨欄位關係、金額、引用與來源完整性仍由程式驗證，不依賴不支援的 if/then/else 等組合關鍵字。
- 廠商自訂欄位與 evidence 都使用固定欄位的陣列，不使用任意 key 的 record/map。既有 purchase-order/v1 的空 properties evidence object 不能沿用，否則 strict schema 只允許空物件。
- provider 的來源引用使用 observation 陣列索引；S7 驗證範圍後轉成 server observationId。ExtensionField 是業務正規化結果，不能把整份業務 revision 重複要求模型輸出。
- 模型 schema 與其 decoder/type 共用定義或產生流程；另有支援子集檢查與漂移檢查。不能直接把含 refinement 的任意 domain schema 當作 provider schema。
- schema 相符仍可能辨識錯誤或漏行。缺值、無法分類與不相關文件必須可明確表達；不得為滿足結構而猜造事實。

官方 schema 上限與應用 payload 預算分開：目前文件列出最多 5,000 個 object properties、10 層巢狀、名稱／enum／const 字串總計 120,000 字元；這些不是允許產生無限 observations 的理由。實作時依 pinned model 與當時官方支援重新驗證。

## 6. Content 規劃契約

### CommercialDocumentPlanningSelection

`source: {documentId, revisionId}`、`planningPurpose: PLANNING_ONLY`、`rows: PlanningRowSelection[]`。

每個來源 rowId 恰好一筆：`{ rowId, disposition: WORK|REFERENCE_ONLY|EXCLUDED, reason, quantitySource: DOCUMENT|USER_PLANNED|null, plannedQuantity: DecimalString|null, measureId: UUID|null }`。

- WORK 只能對已核對的 ITEM；必須有描述、正數 plannedQuantity 與通過 Content qualifier 的 measureId。
- DOCUMENT 要能從來源 quantity/unitLabel 與明確 measure mapping 說明，不自動猜單位。
- USER_PLANNED 必填 reason，商務文件來源空值不變。價格不變為 quantity。
- CHARGE、SUBTOTAL、NOTE 只能 REFERENCE_ONLY 或有理由 EXCLUDED。
- 選項群組的規劃選取須明確符合已核對 selectionMode；UNSPECIFIED 需明確承認規劃假設，不能假稱商務接受。
- 整份來源覆蓋與選取理由保留在 Content provenance；WBS 只接收 Content snapshot 的工作結構與既有授權的來源 pins，不接收價格／付款條款。

## 7. 目標關聯與 SQL invariant

以下是目標 relation 名稱，不是立即執行的 SQL。SQL 詳細型別依本字典一對一映射；所有實際 DDL 必須先進 canonical schema 與 authority registry。

| Relation / Owner | 欄位與約束 |
| --- | --- |
| commercial_documents / Contract | document_id PK；repository_id；version>0；draft_revision_id、verified_revision_id；server timestamps/actor；archived_at。至少一個 pointer；pointer 必須同 repository/document，deferred FK 支援 head+revision 原子建立。 |
| commercial_document_revisions / Contract | revision_id PK；document_id/repository_id；document_version；parent_revision_id；schema_version；review_state；source_file_id/source_file_revision_id/source_sha256；extraction_result_id；content JSONB；human_evidence JSONB；review_confirmation JSONB；actor/time。unique(repository_id,document_id,revision_id)、unique(document_id,document_version)；immutable insert-only。 |
| commercial_document_commands / Contract | actor_user_id + command_id 唯一；repository_id/document_id；operation；intent_fingerprint；result_revision_id；result_document_version；created_at。receipt 與 head/revision 同 transaction。 |
| document_extraction_jobs / Intelligence | extraction_job_id PK；actor_user_id + analysis_command_id 唯一；repository/source；profile_snapshot JSONB；target_intent JSONB；state/version；provider_dispatch_count in(0,1)；dispatch_token/lease_expires_at；last_failure_code/timestamps。Intent/source/profile 不可原地改寫。 |
| document_extraction_results / Intelligence | extraction_result_id PK；extraction_job_id 唯一；repository/source；source_manifest/observations/semantic_hints JSONB；result_fingerprint；provider_usage；created_at。insert-only；READY 與 result 存在須同 owner 交易成立。 |

File／Repository／Content／WBS 原有 authority 不重建。跨 owner technical-result reference 透過授權 public port 核對；沒有必要的 atomic invariant 不增跨 owner transaction coordinator。不得因方便 join 而在 Contract 複製完整 technical result。

沒有 expected_line_count 的 NOT NULL 欄位；數量完整性是有證據的 review／validation contract，不是要求所有文件都有同一欄位。tenant/source composite keys、RLS/grants 與 owner-side current authorization 均不可省略。

## 8. 大小、型別與敏感資料界線

保留來源最多 558,512 bytes、PDF 24 頁、provider output 24,000 tokens／105,000 ms／無隱含計費重試。初始 proposal：normalized content JSON≤393,216 UTF-8 bytes；HTTP body≤524,288 bytes；最多 1,000 rows、64 文件 extensions／16 每行 extensions、64 terms；label≤128 字元、extension value≤2,048、term≤8,000；每 revision 最多 256 筆 humanEvidence，每筆引文≤2,048 字元。

Technical result 的 canonical JSON 也最多 393,216 bytes；不另存完整 PDF 文字副本。單一 source value 超限須明確失敗，不能截斷成「完整」；原件仍由 File 保存。計算前逐層限制大小／深度／references，避免任意 JSON、正則或大字串造成異常資源消耗。僅受信任 service logger 接收 code、stage、traceId、job/document IDs 與經審閱的技術 metadata，不輸出內容。

以上 byte/page/output/time 值是應用限制，不是 OpenAI 平台上限。PDF 輸入會包含抽取文字與頁面影像；小檔案不等於低 token。輸入預算必須計入 instructions、schema、文字與影像，並預留輸出／模型所需空間；無可靠估算時使用經量測的保守 admission policy，不能只憑 bytes 宣稱成本安全。正式放行前量測代表性跨頁文件，固定 inputTokenBudget 與 estimatorVersion；未定案前不可啟用新 profile。usage 記錄實際可取得值，不把估算或 output cap 當費用保證。首版不自動重送全文、分批、repair 或串入歷次分析內容。

## 9. 舊資料與切換

新模型不直接讀取舊 candidate 欄位別名，不寫回舊表，也不在 hot path 保留舊 DTO 的 if/else 分支。舊資料以有期限的 read-only archive／readback 邊界保留；是否轉換為新 snapshot，必須有明確 mapping、來源證據與驗證，不能推導不存在的事實。舊未完成 request 的回執查詢在 cutover 完成前保留，不以新模型重新解析它。

新 relation 名稱／snapshot 語意是本輪待核准的目標，不代表現有資料已可安全刪除。任何 DROP、回填或 Production operator 操作須先有 catalog/data-dependency preflight、具體可審閱差異、資料保留與回退 evidence。

最小 DRAFT 實作採 [固定 profile](../../../packages/intelligence/src/application/commercial-profile.ts) 與正式 Responses input-token counter，輸入上限64,000，計數逾時10秒，整體解析預算105秒；snapshot 記錄 estimatorVersion，job 記錄實際 admission count。這些是應用政策，不是平台或費用保證。真實模型與代表性文件尚待驗收；其他尚未 first-class 映射的來源觀察先保留為可見 extensions，不宣稱完整商務模型已實作。

## 10. 官方依據

2026-10-28 已讀取：[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)（含 supported schemas、streaming、JSON mode）、[Token counting](https://developers.openai.com/api/docs/guides/token-counting)、[File inputs](https://developers.openai.com/api/docs/guides/file-inputs)。平台限制以官方為準；本文件的業務交易與恢復策略是應用設計。介紹文章與 Cookbook 本次存取受限，未作為已核實依據。
