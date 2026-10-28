# CommercialDocument 實作計畫

狀態：2026-10-28 依新版欄位、函數契約與官方 OpenAI 指南重訂；實作中，最小 DRAFT 流程已在本地接通，尚未完成整體規格與上線驗收。取代舊 v1/v2 hot-path 並行計畫。使用者已授權實施，要求六角形架構、高內聚、低耦合；不代表已授權未審閱的 Production 資料破壞。

**依據：** 目前 source、schema 與 tests；[整體設計](../specs/2026-10-28-commercial-document-design.md) 僅保留當時的問題與證據供追溯。

## 架構與不可變條件

| 責任 | Owner／位置 | 依賴與交易邊界 |
| --- | --- | --- |
| 原件、revision、hash | File public capability | 其他 owner 不存第二份原件，不繞過來源授權。 |
| 解析 job、technical result、dispatch fence | Intelligence domain/application/ports | 不依賴 Contract 私有型別或資料表；technical result 不存 normalized business candidate。 |
| Responses HTTP／provider 失敗邊界 | integration-openai adapter | 不含商務 prompt、授權、保存或重試策略；Intelligence adapter 組合具體解析設定。 |
| 商務事實、正規化、核對、receipt | Contract domain/application/ports/adapters | Domain 無 HTTP、SQL、OpenAI 或 host 依賴；自己的 head/revision/receipt 同交易。 |
| 規劃選擇、數量假設、provenance | Content | 消費最小已核對來源 projection，不承接價格或商務接受。 |
| Project 工作結構草稿 | WBS | 消費 exact Content snapshot，保留版本／授權／disclosure，不自動發布 Baseline。 |
| 跨 owner 接線、transport DTO 與 UI | Web composition／inbound adapter | 接線不含領域決策，route 不直接寫業務 SQL；不讓模型調度保存。 |

Port 由需要能力的 use case 所在 owner 定義，adapter 實作該能力；跨 owner 只能用 package exports。共享 DTO 只包含真實 consumer 必要資料，不建立全域商務大物件或轉發 facade。資料 schema 技術檢查留 persistence adapter；金額、來源引用、核對、生命週期留 Domain。每項行為只有一個 owner，不為目錄對稱新增空層或 package。

Contract 與 Intelligence 的單向讀取／保存協調經 host 注入 consumer-owned ports，不新增循環 package 依賴。Intelligence job 狀態不複製 Contract 保存成功事實；只能查權威 receipt。不得在 provider network call 期間持有 DB transaction。

新模型使用 commercial-document/1、DRAFT/VERIFIED、新獨立 relations 與明確 command/trace/job/result 身分；不加入 v2 alias、舊 candidate if/else 或自動重解析。舊資料保存及 readback 與新 hot path 分開。所有新路徑保持既定 Sentry exclusion。

## 執行與驗證方式

依下列順序執行，每項先寫失敗測試，再完成最小實作與 affected suite。使用 ignored ledger 記錄完成項目、實際命令、結果與決策；完整日誌留 artifact，後續只讀當前任務片段。新增 public exports／relations 時同步真實 consumer、architecture registry 對應分片及 SQL authority；不可先把未實作規格宣告成 current runtime。

### 執行盤點（2026-10-28）

以下是本輪進度，不代表已部署能力；以 source、tests 與實際接線為準。依原完整驗收範圍，8 個工作項尚無整項完成：7 個部分完成、1 個尚未開始，不以測試數或檔案數換算功能完成百分比。

| 工作項 | 狀態 | 剩餘交付 |
| --- | --- | --- |
| Task 0 | 部分完成：本地 owner／consumer 證據、Docker catalog 已查；本地舊表沒有 expected_line_count | Production catalog、資料保留、cutover／rollback 差異；本地結果不代表 Production 漂移已修復。 |
| Task 1 | 部分完成：欄位／行模型、純 Domain 規則、邊界 codecs、文頭／ITEM 正規化、草稿驗證；未知觀察保留來源 extensions | 完整 first-class parties／sections／terms／CHARGE／SUBTOTAL／totals 映射與核對分類。 |
| Task 2 | 部分完成：嚴格 observations/hints schema、實際 PDF inspection、固定 profile、正式 token counter 的64k admission、超限不 dispatch | 真實模型／代表性文件驗收與實際 provider usage 蒐集。 |
| Task 3 | 部分完成：durable job/result、單一 dispatch fence、原命令狀態與恢復；Docker PG 驗證 READY 後重送不重跑模型 | 完整技術 metadata／運維生命週期與線上執行驗收。 |
| Task 4 | 部分完成：C1 草稿交易、readiness、讀回／回執與完整意圖重送；具體來源接線已完成 | 編輯／核對／重開／歸檔交易與完整 readers。 |
| Task 5 | 部分完成：新 HTTP／composition、File UI 解析商務草稿、來源 pin、唯讀欄位／extensions、原命令 reload/status/resume 與 Sentry exclusions | 完整編輯／核對介面及真實登入瀏覽器驗收。 |
| Task 6 | 尚未開始 | 新來源的 Content 規劃與 WBS 接線。 |
| Task 7 | 部分完成：Docker 跨 owner 保存失敗恢復測試、各 owner suite、獨立審查、本地 schema readback、Web build | Production 部署／readback；全庫既有依賴違規與 expense probe 缺檔仍阻擋全綠 gate。 |

目前沿用的舊 PO 入口不是新流程完成證據。Domain coverage 報告只是核對前置條件；不授權、不自動 VERIFIED，亦不取代未知來源項目的明確分類。遠端結構漂移、真實模型／文件驗收及部署驗證仍是上線 gate。輸入 token admission 已定案為正式 counter，無法計數時 fail closed；不以 bytes 換算 token。

## Task 0 — 邊界與現有保存故障證據

- [ ] 由 public exports、source、owner/module/data authority 與 consumers 確認實際依賴，建立最小修改清單；Serena 可用時用符號／reference 操作，未註冊則明示並用 bounded 原生定位。
- [ ] 唯讀核對 exact Supabase target 的 expected_line_count 與相依 catalog，對照 canonical 619 SQL／writer；不查私人文件內容、不補假數量。
- [ ] 將舊資料保留、未完成命令 drain/readback、新表部署及 rollback reader 的具體處置寫成可審閱差異。遠端 DDL 另依 repository 寫入規則執行。

**完成條件：** 分開記錄已證實 drift 與未知 catalog；本地 Task 1 不受遠端修復阻塞，但不得宣稱線上保存已修好。

## Task 1 — Contract Domain 與 provider 邊界資料契約

**介面：** 函數規格 P1–P6、欄位字典 CommercialDocumentContent／Evidence／revision；Intelligence 擁有 ProviderObservationPayload，Contract 消費自己的最小 technical evidence port，由 host 做真實結構映射。

- [ ] 合成 fixtures 覆蓋五種文件、缺值、typed extensions、同名 label、跨頁 continuation、ITEM/CHARGE/SUBTOTAL/NOTE、selection groups、人工補漏行與非法 references。
- [ ] 實作 decimal/date decoder、封閉 row union、budgets、deterministic normalizer、draft/verify validation、coverage 與金額 reconciliation；不猜幣別、不補零／一、不把 AI count 當獨立完整性證據。
- [ ] 驗 strict schema 全 required/nullable、nested anyOf、非空 evidence array，以及 schema/type/decoder 不漂移。輸出仍是不可信 input，不宣稱 schema 保證辨識正確。
- [ ] 跑 Contract／Intelligence 最小受影響 tests、typecheck、lint；consumer 僅透過新增的必要 public export 接入。

## Task 2 — Technical extraction 與固定成本邊界

**介面：** S1/S2/S6；Responses strict text.format、SourceManifest、ExtractionProfileSnapshot、ProviderObservationPayload。

- [ ] 測來源損壞、hash/page bounds、unsupported model/profile/schema、token admission failure；驗未 dispatch 即拒絕。
- [ ] 實作 inspection、固定 profile、schema 支援子集檢查與保守輸入預算。量測代表性 PDF 的文字、影像、schema 與輸出 usage，固定 inputTokenBudget／estimatorVersion；未定案不得啟用 profile。
- [ ] 測 HTTP 200 refusal、incomplete reason、空輸出、錯誤 references、network unknown；關閉 client 隱含 retries，不 repair／fallback／自動分批。
- [ ] 首版不 streaming；只接受完整 terminal response 後的有效 payload。跑 integration-openai 與 Intelligence tests/typecheck。

## Task 3 — Intelligence durable job/result 與恢復

**介面：** S3–S11；consumer-owned extraction store/target/source ports 與對應 persistence adapters。

- [ ] 測同 command 同時 10 次只 dispatch 一次、意圖衝突、RESERVED lease CAS、已 dispatch 不可續派、遲到結果、權限撤銷。
- [ ] 新增 job/result canonical relations；先寫 job fence，再外部呼叫；result insert 與 READY 同交易。保存只有 technical result，不存 raw body／business candidate 重複副本。
- [ ] 測 commit response lost 後 fingerprint readback；payload 尚在時只重送 result write，遺失且未 durable 則誠實 UNKNOWN。
- [ ] S9 唯讀；S10 READY 只重送原 target command；FAILED/UNKNOWN 不暗中再次計費。
- [ ] 跑 isolated PostgreSQL 競爭／交易測試、schema checks 與 Intelligence suite。

## Task 4 — Contract 保存、核對與不可變歷史

**介面：** C0–C8；自己的 transactions/source evidence ports，head/revision/command receipt relations。

- [ ] 測 schema readiness（含未知 NOT NULL/no-default drift）、來源資格、command replay/CAS、current authorization、draft/verified pointers、reopen/archive。
- [ ] 實作 C0 readiness，不插假資料；實作 C1–C5 的 owner transaction 與 C6–C8 readers。replay 先於首次操作版本檢查，receipt 不與 revision 分開 commit。
- [ ] 模擬 target 23502，technical result 保持 READY；修正 storage 後以同 draftCommandId 保存，provider count 不變。
- [ ] verified 只表示來源已核對；reopen 保留舊 verified；人工 evidence 由 server 固定 actor/time/source bounds。
- [ ] 跑 Contract domain/application/persistence suites、schema checks 與隔離 DB 原子性測試。

## Task 5 — Web 接線與可恢復的使用流程

**介面：** 新 document-intakes/status/resume、commercial-documents transport，S/C ports 由 host 接線。

- [ ] 測封閉 request decode、scope spoofing、未知 keys、body budgets、錯誤 stage/code/traceId/retryAction；不回 SQL／provider raw body。
- [ ] UI 固定 command identity，展示真正解析／保存狀態、原件及 typed 欄位、缺值／evidence／核對 blockers；refusal／incomplete 不顯示為保存失敗。
- [ ] result READY 後失敗可重送保存；receipt unknown 先查詢，不另建文件。狀態輪詢無 side effect，關頁不視為取消。
- [ ] 新路徑納入 Sentry exclusion 與 runtime bounded logging 整合測試；舊未完成命令維持 readback，不轉送新模型。
- [ ] 跑 Web 受影響 tests/typecheck/build，驗 route→use case→port→adapter 完整接線。

## Task 6 — Content → WBS 規劃

**介面：** W1/W2/P7/W3；Contract 最小 planning projection、Content immutable provenance 與 WBS snapshot consumer。

- [ ] 測 current VERIFIED、current scope、來源 pin、所有 rows 恰好一次處置、選項與 measure qualification、Content/Project CAS/replay。
- [ ] 缺來源數量只接受有 reason 的 USER_PLANNED；來源 null 不變。CHARGE/SUBTOTAL/NOTE 不成為工作；不傳價格、付款或聯絡資料。
- [ ] 同交易建立 Content revision/provenance/receipt；WBS 只消費 exact Content revision，跨 scope disclosure 保留。
- [ ] 更新實際 consumer 與 SQL checks；舊 snapshots 僅保留原有歷史語意。跑 Content/WBS tests/typecheck/schema checks。

## Task 7 — 整合、架構審查與 release gate

- [ ] 用合成 PO／報價／估價／無法分類文件驗全流程、跨頁折扣／小計、缺值、所有 commit 前後中斷與 provider call count。
- [ ] 檢查 Domain 無 provider/DB/host import、Application 僅用 ports、跨包 private import 為零、無循環依賴；不以新 wrapper 或放寬 guard 消除違規。
- [ ] 執行 affected lint/typecheck/test/build、check:repository、dependency/knip/schema guards；既有 baseline failure 分開報告。
- [ ] 完成獨立整體 review、修正重要 findings、驗 current head；以具體 readback 證據確認部署。
- [ ] reader-ready 後才開 writer；rollback release 必須能讀取新 result/revision/receipt 並恢復保存。禁止回退到只懂舊表的 binary 或刪新資料。
- [ ] Task 0 catalog／資料處置未收斂、token profile 未量測、必要 DB／整合測試未通過時，不開 production intake；本地測試不能冒充線上修復。

**整體完成條件：** 新欄位、持久化、HTTP/UI、Content/WBS 及恢復實際接通，必要檢查與 deployment/readback 證據到位；只完成 Domain 或文件不算功能交付。
