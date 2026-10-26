# Document owner skeleton reduction — Step 2: 骨架後的最小協作設計

Status: **target design only; not yet implemented**. Depends on [Step 1 — 減法邊界與停止條件](document-owner-skeleton-reduction-step-1.md) being independently accepted and verified. Stacked PR #413 on #412 is the planning/initial regression change, not Step 2 completion.

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

## 2. Exactly five stages — minimal input, output and commit

| Stage | Input (checked under current authority) | Local decision + immutable output | Does **not** imply |
| --- | --- | --- | --- |
| File | actor, Repository scope, bytes, expectedVersion, requestId | verified FileRevision/sha256/head/receipt after Upload Intent and storage readback | File parsed, commercially accepted |
| Intelligence | actor, exact authorized File revision, processor/target schema | untrusted processing evidence, bounded attempt state, receipt or UNKNOWN | Contract confirmed |
| ContractDocument | exact source pin + candidate, human review/confirm, expectedVersion/requestId | complete DRAFT/CONFIRMED ContractDocumentRevision + receipt | Content nodes exist |
| Content | authorized **exact CONFIRMED** ContractDocument revision + target plan version | full deterministic mapping into one ContentPlanRevision, every source row accounted for | WBS scope approved |
| Project WBS | authorized exact Content revision + empty Project WBS, then explicit governance command | WBS draft Revision; separately reviewed/published Baseline | Issue execution, deliverable accepted |

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

## 6. Implementation sequence after skeleton acceptance

| Increment | Actual change boundary | Proof of completion |
| --- | --- | --- |
| **2A — Composition edge cleanup** | With #412 stabilized, eliminate unnecessary provider imports/error coupling while wiring real File/Intelligence consumers to existing narrow Ports. No owner-owned integrity moves. | Dependency graph, package exports, Web/CLI consumers and provider-independent tests agree |
| **2B — Contract→Content pure qualification** | Consolidate the fixed mapping checks; validate null category, invalid quantity precision, max-node limits, duplicate sources and exact revision authorization inside Content import. | All invalid cases reject atomically; valid complete documents create exactly one Content revision |
| **2C — Content→WBS provenance readback** | Derive initial mapping and subsequent edit lineage from existing immutable revisions; implement publication check at WBS governance boundary without new mutable source store. | Removing required imported work cannot silently yield an approved Baseline; manual WBS remains unaffected |
| **2D — Cross-owner failure matrix** | Exercise fresh/replay/in-flight/unknown results, cross-Repository/Project access, lost access, version competition and rollback with deterministic adapters | No duplicate provider operation, duplicate receipt or cross-owner write; documented failure types remain distinct |
| **2E — Controlled retirement** | Only after consumer scan and exact history/readback, retire proven-dead compatibility writers/exports; handle schema/history cutovers separately | No lost historical revisions, references, receipts, commands or outbox consumers; required validation passes |

These are **incremental reviewed changes**, not instructions to merge all five into #413. Do not begin 2B–2E simply to make a proposal look complete.

## 7. Minimal acceptance scenarios

1. **Same request twice:** processor invoked once; original immutable receipt is returned; a changed canonical payload under same identity is rejected.
2. **Storage unknown:** verified File source readback is required before FileRevision finalize; no visible pending File as a committed source.
3. **Contract approved but planning-incompatible:** a documented `CONFIRMED` revision stays unchanged; Content import fails without partial nodes/receipts.
4. **Exact complete Contract import:** every source row has a recorded disposition, without rounding or total reinterpretation.
5. **Content edited after import:** old provenance still resolves; currently missing required nodes are not mislabeled as present.
6. **WBS imported then edited:** the exact Content source is recoverable through WBS Revision history; publication checks selected candidate scope, not only its initial import.
7. **Permissions changed:** authorized historical reads/replay and new writes are requalified under current owner policy; no leaked private source references.
8. **Published vs draft:** importing does not approve; review counts/current reviewer authority and Baseline/outbox remain separately enforced.

Testing evidence layers must be reported separately: pure/domain, PostgreSQL/transaction, Web/CLI, provider, production. Only evidence **actually executed** supports a passing claim.

## 8. Adoption and non-goals

This design is usable only after [Step 1 exit criteria](document-owner-skeleton-reduction-step-1.md#5-每個刪減-pr-必須交付的證據) are met, all real consumer impacts are resolved, and negative test cases demonstrate the necessary logic changes.

- **Not a new Owner:** no shared business integration service, Source Registry or Coverage Engine.
- **Not a new database truth:** historical source resolution remains anchored in original immutable owner revisions.
- **Not forced into PR #413:** #413 is currently a Draft stacked branch on #412.
- **Not a migration approval:** historical File processing and Repository WBS transfer removal need distinct operator-controlled plans.
- **Not production acceptance:** provider availability and deploy state remain independently verified.

After a reviewed increment implements a decision, promote its actual durable truth into the relevant `docs/owners/*`, `architecture/*.json`, schema, code and tests. Delete obsolete proposal text when it no longer serves an open decision; Git retains history.

## References

- [Step 1 — reduction boundary](document-owner-skeleton-reduction-step-1.md)
- [Owner rules](../../rules/system-invariants.md), [dependency boundary](../../rules/dependency-boundaries.md)
- [File](../../owners/file.md), [Intelligence](../../owners/intelligence.md), [Contract](../../owners/contract.md), [Content](../../owners/content.md), [WBS](../../owners/wbs.md)
