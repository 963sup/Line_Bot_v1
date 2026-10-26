# Document owner skeleton reduction — Step 2: 骨架後的最小協作設計

Status: **implemented in the current source tree; proposal promotion complete**. The Step 2 collaboration boundaries are now represented by the existing public ports, composition roots, owner contracts, package exports, topology entries and focused negative-path tests. This document remains a design record; runtime/provider/release acceptance is intentionally left to Steps 3–7 and their own evidence.

Purpose: answer **「砍到不可刪的骨架後，如何設計 File / Intelligence / Contract / Content / WBS 的正確協作，而不把依賴和狀態再加回來？」**. This RFC does not override current Owner, semantic/topology, schema or runtime contracts.

## 1. Minimum target architecture

```text
apps/web / authenticated CLI / application composition root
  ├── integration-supabase ── private Storage client
  ├── integration-vercel   ── provider protocol
  ├── File                 ── FileObjectStore / FileRevision public capabilities
  ├── Intelligence         ── authorized File source + processor + attempt/receipt
  ├── Contract             ── ContractDocument SAVE/CONFIRM/read
  ├── Content              ── exact confirmed Contract reader + plan transactions
  └── WBS                  ── exact Content reader + Project scope + governance
```

**Arrows above are host composition/injection, not direct package imports or cross-owner writes.** The five-Owner user journey is a business sequence, not a mandatory linear dependency DAG. Contract's engineering-agreement capability independently consumes Content Work/Task and stays outside the document-intake path.

Every Owner makes its own decision and commits **only its own** durable facts. Shared identity, File bytes, provider configuration, and source locators do not grant another Owner permission to commit. No distributed transaction and no new global orchestration or Source Registry authority.

## 2. 五個業務事實階段（Gateway 是 Intelligence 的技術 Adapter）

| Stage | Input (checked under current authority) | Local decision + immutable output | Does **not** imply |
| --- | --- | --- | --- |
| File | actor, Repository scope, bytes, expectedVersion, requestId | verified FileRevision/sha256/head/receipt after Upload Intent and storage readback | File parsed, commercially accepted |
| Intelligence | actor, exact authorized File revision, processor/target schema | untrusted processing evidence, bounded attempt state, receipt or UNKNOWN | Contract confirmed |
| ContractDocument | exact source pin + candidate, human review/confirm, expectedVersion/requestId | complete DRAFT/CONFIRMED ContractDocumentRevision + receipt | Content nodes exist |
| Content | authorized **exact CONFIRMED** ContractDocument revision + target plan version | full deterministic mapping into one ContentPlanRevision, every source row accounted for | WBS scope approved |
| Project WBS | authorized exact Content revision + empty Project WBS, then explicit governance command | WBS draft Revision; separately reviewed/published Baseline | Issue execution, deliverable accepted |

Gateway 的真實結構化採購單輸出、舊 CLI 遷移與 provider evidence 詳見 [Step 3](document-owner-skeleton-reduction-step-3.md)。

Each transition must work with an **exact source revision** rather than an implicit "latest" at a different time. Externally visible operations recheck the current actor, source/destination scope and lifecycle in the actual transaction.

## 3. Three minimal mechanisms — no new framework

### A. Capability injection instead of provider ownership leakage

**Technical integrations** expose only transport/protocol/client behaviors; application composition maps provider results/errors into a consumer's existing public Port. No provider SDK, credentials or env reads in Domain/Application.

- File keeps `FileObjectStore` and `FileRevisionQualifier`. Host provides the concrete private-object implementation; File owns the verified SHA-256/Upload Intent/finalize semantics and database persistence.
- Intelligence keeps `DocumentExtractor`, `IntelligenceProcessor`, attempt and processing Ports. Host provides a Vercel-backed implementation or a test fixture. The reusable Vercel Gateway must not expose Intelligence-specific error semantics to Assistant/Expense.
- Contract, Content and WBS accept only the **owning module's** published revision/source-reader contracts. No import of other Owner's private Adapter, SQL table or Vercel/Supabase module.
- Remove an unnecessary dependency only once all imports, bootstrap call sites, worker/CLI/runtime consumers, public exports and topology checks have been migrated in the **same** reviewed change.

### B. Qualification inside the consumer's transaction

Do **not** add a persistent `PreflightService`. The consuming Owner already has the rules and the authoritative write transaction.

- **Contract** verifies a candidate and requires explicit human confirmation. It never mutates Content to make commercial values fit.
- **Content** reads one exact confirmed Contract revision with current authorization inside its transaction; fixed mapping checks row classification, required work fields, quantity precision, measure rules, deterministic identities, existing plan node count and duplicate import. Every source line gets either `CONTENT_WORK` or `COMMERCIAL_ONLY` in that immutable import evidence. If one line cannot map, **rollback all**; retain Contract unchanged.
- **WBS** reads one exact Content revision inside its Project transaction, uses the fixed `content-wbs-v1` hierarchy, imports only into an empty Project draft and pins source identities. No automatic Baseline publication.

A UI preview, when a real consumer needs it, may call the **same pure qualification rule** before committing. A preview is not authorization, not a receipt, and not a second schema or ownership authority.

### C. Read-derived provenance instead of duplicate mutable Coverage state

Start with existing immutable facts:

- Content import evidence pins exact Contract document/revision/sourceRowId and associated Content nodeIds; later plan revisions can change node membership.
- WBS's initial content-import evidence pins the exact Content revision and Content→WBS nodeIds; later WBS revisions can edit or delete nodes.
- To answer current source coverage, **resolve history + compare with the selected current revision** under current authorization. Do not duplicate Contract line values or add a writable `source_coverage` table in advance.
- For Content-origin WBS, validate before publishing a candidate Baseline that each required work source remains represented by valid, existing WBS work nodes. `COMMERCIAL_ONLY` remains traceable but is not a required work package.
- Missing work mapping is a **hard publication blocker** in the minimal design; restore it or defer a separate explicit governed exclusion/replacement decision until the business semantics are authorized. No silent deletion, inferred renaming, automatic cancellation or synthetic "covered" state.
- A manually initialized WBS has no Content-origin coverage obligation; do not invent a Contract source for it. Older transferred/imported revisions require bounded historical source resolution or an explicit `UNAVAILABLE` outcome rather than pretending coverage is empty.

The initial design prefers a **pure query/check over immutable history**, not an independent new business state. Only introduce a materialized projection if a measured consumer/performance need exists, and keep it rebuildable and non-authoritative.

## 4. Recovery and consistency are not optional complexity

Use the existing Owner's `requestId`, observed `expectedVersion`, immutable Revision, receipt and current authority.

```text
new request -> authorize -> qualify exact source -> lock/check version
            -> append owner's Revision/head/receipt atomically
exact replay -> re-authorize -> compare canonical fingerprint -> return prior receipt
unknown I/O -> read durable receipt/source -> never assume missing means safe to re-run
```

Intelligence's external processing has an additional boundary: only the **fresh** durable attempt may start provider I/O. An existing `RUNNING` or `UNKNOWN` attempt does not authorize a second call. `STARTED` vs `COMPLETED` is not proof of whether an uncertain remote operation succeeded; preserve readback/fencing semantics.

This is **at-most-once execution with recovery evidence** where external operations cannot join a PostgreSQL transaction, not an unconditional exactly-once guarantee. Preserve File Storage quarantine/reclamation and WBS migration/event outbox until their separate readback cutovers complete.

## 5. Dependency rules to enforce after Step 1

```text
Domain         -> same Owner's pure rules, no SDK/ENV/HTTP/SQL
Application    -> same Owner's rules + narrow output/input Ports
Adapter        -> implements Ports, maps technology failures
Composition    -> connects adapters and published owner capabilities
Integration    -> owns provider protocol/client only, no business writes
```

Package imports follow actual consumers rather than the flow diagram. A type-only import is still an edge. `architecture/implementation-topology.json` and package exports must be updated **only when source and real consumers justify a different edge**, never weakened just to make CI green.

No mandatory empty layer, pass-through facade, new Shared business Owner, generic mapper, global state machine or second command writer.

## 6. 下一步的精確邊界：Step 3–7 不再塞進 Step 2

**本 Step 只核定依賴、Port、Composition 與 Owner 的輸入／輸出方向；不負責實作每條業務轉換或最終驗收。** Gateway 的結構化採購單擷取與 observations 是不同能力，不能被籠統的「Integration 可用」涵蓋。

| 下一階段 | 唯一責任 | 輸入 → 輸出契約 | 不應跨越的邊界 |
| --- | --- | --- | --- |
| [Step 3](document-owner-skeleton-reduction-step-3.md) | File → Intelligence → Vercel AI Gateway | exact FileRevision + Contract-owned JSON Schema → untrusted `PurchaseOrderCandidate` | SDK 不取得 CONFIRM 權；observations 不等於完整採購單 |
| [Step 4](document-owner-skeleton-reduction-step-4.md) | Contract 商業確認 | candidate + exact File pin + reviewer → immutable CONFIRMED ContractDocumentRevision | Contract 不直接建立 Content node |
| [Step 5](document-owner-skeleton-reduction-step-5.md) | Contract → Content 完整展開 | exact confirmed ContractRevision lines → complete ContentPlanRevision + source-row disposition | Content 不複製可編輯商業金額 |
| [Step 6](document-owner-skeleton-reduction-step-6.md) | Content → WBS 與治理 | exact ContentRevision → WBS Draft → reviewed Baseline | 匯入不等於核准；WBS 不擁有 Content 數量 |
| [Step 7](document-owner-skeleton-reduction-step-7.md) | E2E 逆向追溯與失敗恢復 | published Baseline → exact source chain + technical receipts | trace 為授權查詢投影，非第六個 Owner |

**Step 2 exit gate：**

1. 確認 #412 的 `integration-vercel`、`integration-supabase` 擁有的是技術協定，不是 Domain authority。
2. 為 File Object Store、Intelligence `DocumentExtractor`、Contract public candidate/confirmed-reader、Content import-reader、WBS Project-reader 畫出**實際 consumer → Port → Adapter/Composition**；檢查所有 browser/CLI/worker entrypoints。
3. Gateway 供一般 observations 與供 Contract 的完整 `PurchaseOrderCandidate` **是兩個不同資料契約**；缺能力的路徑標記未實作，不以既有 observations 冒充成功。
4. 跨 Owner 只使用 public exports；Data/Transaction/Authorization authority 保留在真正 Owner，修改依賴時同步 package exports、topology、真實 consumer 與測試。
5. 用 deterministic fake provider / in-memory object-store proof 證明業務 Domain/Application 可不依賴 Vercel 或 Supabase 執行；再開始 Step 3。

## 7a. Current implementation evidence

The exit-gate design is implemented without introducing a shared business Owner or a second
orchestration layer:

- File publishes `FileObjectStore` and `FileRevisionQualifier`; its composition root injects the
  private storage adapter and keeps removal/reclamation ports out of ordinary application wiring.
- Intelligence consumes File's public revision qualifier and receives `DocumentExtractor` and
  `IntelligenceProcessor` through composition. Its durable attempt records source/target intent and
  recovery state, not Contract facts.
- Contract publishes the candidate intake command and the exact confirmed-document reader. Contract
  requalifies the File revision in its own transaction and owns candidate/confirmation truth.
- Content consumes Contract through `ContractDocumentExpansionReader`, applies its deterministic
  whole-document expansion, and publishes `ContentWbsExpansionReader` for WBS.
- WBS consumes exactly one authorized Content revision through its transaction-bound reader and
  creates its own Project-scoped draft; it does not read Contract persistence directly.
- The corresponding package exports, owner contracts, semantic relationships and implementation
  topology remain the source of truth. No proposal text is used as a replacement authority.

The implementation evidence is source-level and contract-level. Live provider behavior, deployed
runtime behavior, and the complete release acceptance matrix are not claimed here.

## 8. 跨邊界設計的最小驗收案例

1. **Same request twice:** processor invoked once; original immutable receipt is returned; a changed canonical payload under same identity is rejected.
2. **Storage unknown:** verified File source readback is required before FileRevision finalize; no visible pending File as a committed source.
3. **Contract approved but planning-incompatible:** a documented `CONFIRMED` revision stays unchanged; Content import fails without partial nodes/receipts.
4. **Exact complete Contract import:** every source row has a recorded disposition, without rounding or total reinterpretation.
5. **Content edited after import:** old provenance still resolves; currently missing required nodes are not mislabeled as present.
6. **WBS imported then edited:** the exact Content source is recoverable through WBS Revision history; publication checks selected candidate scope, not only its initial import.
7. **Permissions changed:** authorized historical reads/replay and new writes are requalified under current owner policy; no leaked private source references.
8. **Published vs draft:** importing does not approve; review counts/current reviewer authority and Baseline/outbox remain separately enforced.

Testing evidence layers must be reported separately: pure/domain, PostgreSQL/transaction, Web/CLI, provider, production. Only evidence **actually executed** supports a passing claim.

## 9. Adoption and non-goals

Step 2 的概念實施須先達成以上 exit gate。後續各 Owner 轉換與 provider 實際串接由 Step 3–7 個別驗收。

This design is usable only after [Step 1 exit criteria](document-owner-skeleton-reduction-step-1.md#5-每個刪減-pr-必須交付的證據) are met, all real consumer impacts are resolved, and negative test cases demonstrate the necessary logic changes.

- **Not a new Owner:** no shared business integration service, Source Registry or Coverage Engine.
- **Not a new database truth:** historical source resolution remains anchored in original immutable owner revisions.
- **Not a release acceptance claim:** Step 2 promotion records the implemented source boundaries; it does not claim provider, deployment, browser/device or full release acceptance.
- **Not a migration approval:** historical File processing and Repository WBS transfer removal need distinct operator-controlled plans.
- **Not production acceptance:** provider availability and deploy state remain independently verified.

After a reviewed increment implements a decision, promote its actual durable truth into the relevant `docs/owners/*`, `architecture/*.json`, schema, code and tests. Delete obsolete proposal text when it no longer serves an open decision; Git retains history.

## References

- [Step 1 — reduction boundary](document-owner-skeleton-reduction-step-1.md)
- [Owner rules](../../rules/system-invariants.md), [dependency boundary](../../rules/dependency-boundaries.md)
- [File](../../owners/file.md), [Intelligence](../../owners/intelligence.md), [Contract](../../owners/contract.md), [Content](../../owners/content.md), [WBS](../../owners/wbs.md)
