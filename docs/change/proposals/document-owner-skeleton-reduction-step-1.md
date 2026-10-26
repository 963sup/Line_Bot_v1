# Document owner skeleton reduction — Step 1: 減法邊界與停止條件

Status: **proposed reduction target; not fully promoted to current main**. PR #413 merged the owner-skeleton work into the intermediate refactor branch; this proposal remains a target/acceptance reference until that revision is part of the current main baseline.
Purpose: answer **「File / Intelligence / Contract / Content / WBS 究竟砍到什麼程度，才算剩下不可刪的骨架？」**.
Follow-on design: [Step 2 — 骨架後的最小協作設計](document-owner-skeleton-reduction-step-2.md).

This RFC does not supersede `docs/owners/*`, `architecture/*.json`, SQL, package exports, source or tests. The seven Step numbers are **logical gates**, not a second release/history ledger; Git is the change history. #412 (integration-vercel / integration-supabase) is **Step 0 prerequisite**, not proof that Document Intake or E2E is complete.

## 七個階段的唯一任務

- **Step 1（本文）**：砍到不可再刪的五個 Owner 核心、依賴與退役邊界。
- [Step 2](document-owner-skeleton-reduction-step-2.md)：Port / Adapter / Composition，隔離 Supabase Storage 和 Vercel AI Gateway。
- [Step 3](document-owner-skeleton-reduction-step-3.md)：Exact File bytes → Intelligence → Gateway 的 **Contract-owned structured candidate**，不同於 observations。
- [Step 4](document-owner-skeleton-reduction-step-4.md)：`PurchaseOrderCandidate` → Contract DRAFT / explicit human CONFIRMED。
- [Step 5](document-owner-skeleton-reduction-step-5.md)：Confirmed Contract → Content，完整 sourceRowId 映射與轉換限制。
- [Step 6](document-owner-skeleton-reduction-step-6.md)：Content → Project WBS Draft → reviewed Baseline，出版前對帳來源。
- [Step 7](document-owner-skeleton-reduction-step-7.md)：Gateway/Storage/DB/Runtime/使用者入口的 E2E、來源反查與失敗恢復。

每一步必須先證明自己的 Invariant；Step 7 不能補救前六步違反的資料事實。下面保留原本的 KEEP/MOVE/READ-ONLY/DELETE-AFTER-PROOF/REJECT 精簡判準，後續轉換細節由各專屬文件擁有，**不在 Step 1 複製 schema**。

## 1. 第一性原理：不是砍行數，而是砍掉第二個真相

For any source, command, dependency or persisted field ask:

1. **Owner:** 哪個不可變或持久化的事實只能由此 Owner 決定？
2. **Consumer:** 哪個真實 consumer 非使用此 public capability 不可？
3. **Invariant:** 刪除此機制，是否會損害授權、隔離、版本、原子性、回執或恢復？
4. **Boundary:** 它其實是 provider protocol / adapter / application composition，而非 business decision 嗎？
5. **History:** 是否仍需要讀取舊資料、處理重放、轉移或留存證據？

Result must be one of: **KEEP** (不可刪核心), **MOVE** (移往正確邊界), **READ-ONLY** (停止新寫入而保留歷史), **DELETE-AFTER-PROOF** (確認消費者與 cutover 才刪), **REJECT** (不建立新的抽象). **Unknown consumers means defer removal**, never assume absence.

## 2. 五個 Owner 的最小終態

| Owner | 保留的不可再減核心 | 最小對外業務能力（概念，不是要立即刪掉既有 exports） | 必須移除的越界責任 |
| --- | --- | --- | --- |
| **File** | Exact immutable `FileRevision`, protected bytes identity, SHA-256, owner-authorized access; durable Upload Intent + verified write/readback + atomic head/revision/receipt | upload, list/read exact revision, authorized source read and transaction-bound source qualification | 解析器、ProcessingRun、Contract facts；SDK client 設定應由外層組裝 |
| **Intelligence** | `ProcessingRun` 或 `DocumentIntakeAttempt` 的來源／版本、執行證據、明確結果、回執／UNKNOWN 邊界 | explicit run, read, save/discard；獨立的 Contract intake SAVE/receipt | File 原始 bytes 所有權、正式 Contract CONFIRM、Content/WBS 寫入、Vercel credentials／SDK |
| **Contract** | **兩個不同 Aggregate**：`ContractDocument` 確認完整商業文件；`EngineeringContract` 凍結對 Content Work/Task 的承諾 | document draft/save, confirm, exact read/receipt；agreement draft/activate/close | 保存 File bytes、建 Content nodes、批准 WBS |
| **Content** | 一份完整的 Repository `ContentPlanRevision`、既有五層工作結構、planned quantity/unit、source-row disposition、exact Resource pins | initialize/replace, import exact confirmed ContractDocument, exact read/history | 更改 Contract 商業事實、執行 Issue、發布 WBS |
| **WBS** | Project `WBSRevision` 與明確的治理／批准 `Baseline`、當前 Project 權限及 exact receipts | create/edit draft, import one exact Content revision, propose/review/publish, exact read/history | 經營另一份 Content 真相、改 Contract 金額、Issue execution、GitHub ProjectItem |

**減法停止線**：只要以上核心行為仍有實際 consumer，就不能以「更少檔案」為理由移除其交易、授權或 public contract；也不強制 Owner 建立空的 DDD layer。

### File：最低不能砍掉什麼

- **KEEP**: upload intent before external object I/O; digest/readback before Finalize; FileRevision/head/request receipt atomically committed; private Storage byte integrity and current Repository authorization.
- **MOVE**: concrete `createPrivateStorageClient`, credentials and Supabase SDK initialization toward `integration-supabase` and the outer composition. `FileObjectStore` must remain File-owned Port; verified File semantics must not be outsourced.
- **DELETE-AFTER-PROOF**: any duplicate client creation/forwarder only after all Web/CLI/reclaimer source readers and package exports are migrated and tested.
- **NO**: merge `File` and `Intelligence`; read-only `File List` must never implicitly start processing.

### Intelligence：最低不能砍掉什麼

- **KEEP**: exact File source reference, processor identity, authorized evidence, durable attempt/receipt and bounded unknown-result recovery.
- **KEEP AS TWO INDEPENDENT CAPABILITIES WHILE CONSUMED**: general `ProcessingRun` (Web/CLI preview/edit history) and Contract-target intake (source→candidate→Contract SAVE). Contract intake must not require generic ProcessingRun SAVE first.
- **MOVE**: provider configuration, SDK calls and protocol-specific errors to `integration-vercel` or application-host error mapping. Provider-specific errors cannot become the domain's universal error authority.
- **FIX WITHOUT ADDING FRAMEWORK**: an exact RequestId replay cannot re-run a processor. #413 contains an initial fix and tests, but CI/runtime validation is still required.
- **READ-ONLY**: legacy `file_processing_*` and processing receipts; no deletion until the existing controlled cutover and authorized readback.
- **REJECT**: generic AI router, provider registry, schema registry, Workflow Engine, second candidate store.

### Contract：最低不能砍掉什麼

- **KEEP**: complete candidate rows/amounts/source evidence, explicit human confirmation, exact File revision pin, immutable revision and actor/request/version receipt.
- **KEEP SEPARATE**: EngineeringContract's ACTIVE/CLOSED lifecycle and Content exact Work/Task pins; do not merge it with purchase-order ContractDocument.
- **REMOVE FROM RESPONSIBILITY**: any implication that CONFIRMED equals Content-expandable or WBS-approved. Contract preserves commercial truth, even when a later planning import rejects it.
- **REJECT**: Contract-owned Content node mappings, automatic WBS Baseline or shared mutable source rows.
- **DO NOT DELETE** existing persisted engineering agreements, their public readers or historical revisions.

### Content：最低不能砍掉什麼

- **KEEP**: immutable whole-document `ContentPlanRevision`, current version check, canonical five-level hierarchy required by real consumers, exact measure/resource pins, source-row disposition from fixed whole-Contract mapping.
- **KEEP ONE RULE LOCATION**: classification, quantity/unit precision and max-node validation must be the same rules used by formal import, not a second independent Preflight authority.
- **REJECT**: automatic rounding of Contract quantities, source-row omission, generic transform pipeline and duplicated Contract commercial fields.
- **READ-ONLY**: historical `import-file` evidence; new writes use the accepted ContractDocument route only.
- **DO NOT PREMATURELY DELETE** the five-level hierarchy: Contract/Execution consumers already reference Work/Task.

### WBS：最低不能砍掉什麼

- **KEEP**: Project scope ownership/authorization, immutable WBSRevision + draft edits, separate governance policy/reviews/proposal/Baseline, stable source import and atomic receipt/outbox.
- **KEEP**: one-shot `import-content-document` into an uninitialized Project WBS. Draft import must never silently publish Baseline.
- **READ-ONLY / CUTOVER BOUNDARY**: legacy Repository WBS entries, historical `import-contract`, transfer intent, migrated replay evidence and event consumers until a verified transfer/retirement.
- **REJECT**: parallel live Repository and Project WBS authorities; local Contract row store or separate global coverage database.
- **REQUIRE BEFORE NEW BASELINE**: any source-work deletion must be checked against the pinned incoming Content revision; do not claim source completeness from the existence of some remaining work packages.

## 3. #412 的交界與依賴減法

#412 extracts `packages/integration-vercel` and `packages/integration-supabase`. These packages **own technical protocols**, not business truth. Their existence does not imply that every Owner imports them.

Desired testable dependency direction after reduction (subject to actual consumer verification):

- `apps/web` / CLI composition constructs integrations and injects public Ports into consuming Owner use cases.
- `File Domain/Application` depends only on its own Port and relevant Repository qualification. No Supabase SDK imports in those layers.
- `Intelligence Domain/Application` depends on processor/source/receipt Ports, not Vercel SDK, provider env or concrete gateway type.
- `Contract`, `Content`, `WBS` never import `integration-*`; owner-to-owner reads use narrow published capabilities with current authorization.
- The current #412 `File adapter → integration-supabase` import and `integration-vercel → Intelligence` type/error imports are **candidate coupling edges to audit**, not authorization to rewrite #412 in this stacked PR.

A user journey being linear does not force package imports to form `File → Intelligence → Contract → Content → WBS`. In particular EngineeringContract separately consumes Content pins; avoid fabricating a compile-time cycle.

## 4. What is intentionally NOT removed in Step 1

- No SQL schema/RLS, `file_processing_*` rows, File/Intelligence/Contract/Content/WBS immutable revisions or receipts are dropped.
- No legacy WBS transfer/outbox/replay path is deleted without audited source/target history and all downstream consumers.
- No fake green "implemented" flag, no disabled-shell replacement for active features, no speculative generic abstractions.
- No provider, release, production or data migration operation is bundled into architectural cleanup.

## 5. 每個刪減 PR 必須交付的證據

For each concrete cut, include: current Source/Owner, actual consumer, public export, dependency edge, database/recovery participation, replacement path (if MOVE), exact failure counterexample, and tests at the touched evidence layer. Refer to canonical source/manifests rather than maintaining a duplicate permanent inventory.

**Step 1 exit criteria** (all must hold before declaring the skeleton "砍完"):

1. Five Owner truth boundaries above are explicit and have **no two active writers** for the same durable fact.
2. Provider config/SDK are absent from business Domain/Application; remaining technical Adapter imports are identified and justified with actual consumers.
3. Duplicate/orphan forwarding and unnecessary business state removed **only after** consumer/replay proof; no unauthorized historical row removal.
4. Correctness tests cover actor/scope isolation, immutable revision, exact replay (including in-flight), version race, rollback, source readback and transaction boundaries.
5. Cross-owner source/import and WBS governance behavior still pass with deterministic provider-free fixtures; unresolved compatibility or completeness gaps are listed as blockers, not marked complete.
6. `pnpm check` / `pnpm docs:check` and exact-head `pnpm validate` pass **when actually run**; GitHub draft/branch existence alone is not evidence.

Once those are met, apply **[Step 2](document-owner-skeleton-reduction-step-2.md)**. Never promote this proposal to a competing authority; durable adopted semantics move to existing Owner contracts, architecture manifests, source and tests.

## References

- [System invariants](../../rules/system-invariants.md)
- [File](../../owners/file.md), [Intelligence](../../owners/intelligence.md), [Contract](../../owners/contract.md), [Content](../../owners/content.md), [WBS](../../owners/wbs.md)
- [Processing history cutover](../migrations/file-intelligence-processing-receipt-cutover.md)
- `architecture/semantic-model.json`, `architecture/implementation-topology.json`, `architecture/data-topology.json`
