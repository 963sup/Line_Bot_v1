# File / Intelligence / Contract / Content / WBS: minimum-owner reduction

Status: proposed target, implemented only where explicitly noted below.
Stacked change: #413 targets #412 (`refactor/gateway-structured-document-output`).
This proposal is not current semantic, data or dependency authority.

## Question and first-principles decision

The user flow `File -> Intelligence -> ContractDocument -> ContentPlan -> Project WBS`
is **not** a required package dependency chain. Keep only irreducible business facts,
their current authority, a justified transaction/recovery boundary, and the public
capability needed by an actual consumer.

A provider is not a business owner. #412 extracts technical Vercel and Supabase
integrations; it does not authorize moving File integrity or Intelligence processing
facts into those integrations. Contract's engineering agreements separately consume
Content Work/Task definitions; do not infer `Contract <-> Content` mutual package
imports from these two different business flows.

Reduction means removing unnecessary *authority, effects and dependencies*, not
blindly reducing file count. Never delete or overwrite immutable historical evidence
to make the new path appear simpler.

## Minimal responsibility matrix

| Owner | Irreducible truth and boundary | Keep in the owner | Explicitly outside this owner |
| --- | --- | --- | --- |
| File | Repository-scoped immutable FileRevision and exact private bytes, after current authorization | Upload Intent, verified object readback and SHA-256, revision/head/receipt atomic finalize, authorized exact source reader/qualifier | Parsing, ProcessingRun, Contract candidate, Content nodes, WBS |
| Intelligence | An interpretation/processing attempt and its durable evidence, not accepted commercial truth | Run/attempt identity, processor identity, save/discard evidence, exact replay and UNKNOWN recovery | Original bytes, final Contract approval, Content/WBS writes, SDK configuration |
| Contract | ContractDocument commercial facts and human confirmation; separately, EngineeringContract agreements | Complete immutable document revisions and source pins, explicit confirmation, version/replay/authorization, existing engineering-agreement rules | File bytes, work plan creation, WBS Baseline, automated commercial acceptance |
| Content | Repository-scoped planning definition and immutable plan revisions | Five-level Subject/Object/SubObject/Work/Task hierarchy, exact planned quantities/measures, source-row disposition and pinned Resources, current qualification | Editing Contract commercial values, approving Project WBS scope, execution actuals |
| WBS | Project-scoped work scope revision and approved Baseline | Draft revisions, Project authorization, explicit governance/reviews/publication, source-qualified Content import, durable receipts/outbox | Owning Content plan, Contract rows, Issue execution, GitHub ProjectItem meaning |

The exact existing published type and schema contracts, not these short labels,
remain authoritative until a reviewed implementation changes them.

## Cut/move/retain decisions

| Existing responsibility | Target | Decision and evidence gate |
| --- | --- | --- |
| Original protected bytes, upload intent, SHA and immutable File revisions | File | **Retain.** Removal breaks atomicity and source integrity. |
| Supabase SDK client construction/credentials | `integration-supabase` + outer composition | **Move technical setup only.** #412 is in progress; a later consumer-complete change may remove File's concrete integration import. Do not move File-owned `putVerified/readVerified` integrity semantics. |
| Vercel SDK, model configuration, provider protocol | `integration-vercel` + outer composition | **Keep out of the five Owner domains.** The general Gateway serves Assistant/Expense/Intelligence; domain-specific error translations and public Ports must be resolved with all consumers before changing #412. |
| Intelligence generic ProcessingRun versus Contract-specific Intake | Separate narrow capabilities inside Intelligence | **Retain distinct only while separately consumed.** Do not create a unified workflow engine, registry or extra domain layer. |
| Processing exact request replay | Intelligence | **Repair now.** A persisted STARTED receipt cannot authorize another provider execution. See `processing-replay.test.ts`. |
| `file_processing_*` and processing-kind legacy File receipts | Controlled migration history | **Preserve read-only.** Cutover requires counts, hashes, authorized readback and retention decision. |
| EngineeringContract and purchase-order ContractDocument aggregates | Contract | **Retain separate.** One pins Content Work/Task agreements; the other owns confirmed source-document business facts. Do not merge their lifecycles. |
| `import-file` Content or `import-contract` WBS historical shapes | Historical read/replay only | **No new writes; no deletion in this proposal.** Retire only after exact history/replay verification. |
| Contract-to-Content fixed expansion | Content | **Retain one deterministic mapping.** Validate exact confirmed input and current plan transaction. No general mapping engine or independent Preflight authority. |
| Content-to-WBS fixed expansion | WBS (consumes Content public reader) | **Retain.** Import only into empty Project draft, never publish a Baseline implicitly. |
| Repository-scoped legacy WBS transfer | Release-only controlled cutover | **Defer removal.** Keep transfer, source replay, outbox and history until a verified migration and downstream consumer inventory. |
| New global Source Registry / Coverage Service / Workflow Engine | None | **Reject.** Derive source status from owner-owned immutable revisions until a concrete consumer and unrecoverable invariant requires more state. |

## Minimum cross-boundary contracts

1. **Exact identity:** each reference pins the owner, scope, immutable revision and
   required integrity value (File includes SHA-256). A locator never grants access.
2. **Authorization:** reads and exact replay re-check current active actor/scope.
   New writes check current lifecycle and expected version at the transition boundary.
3. **Completeness:** a whole-document expansion accounts for every accepted source
   row (work or commercial-only) without silently inventing or omitting business facts.
4. **Atomicity:** each owner commits its own head, immutable revision, source
   qualifications and receipt together. No cross-owner distributed transaction.
5. **Replay:** exact matching RequestId produces no duplicate processing or write.
   Unknown outcome requires persisted readback, not an automatic provider retry.
6. **Governance:** Content plan revision is not WBS approval. Publication follows
   WBS's own current authorization, proposal and review checks.

Business qualification belongs to the consuming owner. In particular, commercial
confirmation need not mean that the exact Contract document fits Content unit,
classification, quantity precision or maximum node limits; Content must reject
incompatible imports atomically rather than corrupt or round the source.

## Evidence-first reduction order

1. **Lock invariants with counterexamples.** Start with the reproduced
   Intelligence request replay defect. Classify baseline tests by their actual
   evidence level (domain, adapter, PostgreSQL, runtime, production).
2. **Inventory concrete consumers and exported ports.** For each delete or move,
   trace consumer -> public contract -> owner -> persistence/recovery evidence.
   Remove nothing while a live consumer or historical receipt depends on it.
3. **Simplify one boundary at a time.** Move provider construction outward only
   after the host wiring, package exports, topology and tests agree. Do not introduce
   new facade or shared `common` package to hide a wrong dependency.
4. **Check unchanged business semantics.** Re-run authorization, rollback,
   two-session version competition, exact replay and scope-isolation tests.
5. **Retire historical writers and storage independently.** Require actual
   migration/readback and explicit retention approval; CI success is not a
   production cutover.

## Deliberately out of scope for this stacked PR

- New Schema or RLS, live migrations, production deploy, CI/Release modifications.
- Removing legacy `file_processing_*`, Repository WBS tables, command receipts
  or historical Content/Contract/WBS Revisions.
- Refactoring #412's integration work while its review branch is still moving.
- A generic Source Coverage state machine, global Source Registry, Preflight
  framework, universal Idempotency Service or broad public interface redesign.
- Claiming Contract -> Content -> WBS live end-to-end completion based only on
  unit tests.

## Evidence pointers

- Governing invariants: [system-invariants](../../rules/system-invariants.md).
- Owner contracts: [File](../../owners/file.md),
  [Intelligence](../../owners/intelligence.md),
  [Contract](../../owners/contract.md),
  [Content](../../owners/content.md),
  [WBS](../../owners/wbs.md).
- Canonical semantics and allowed dependencies:
  `architecture/semantic-model.json`,
  `architecture/implementation-topology.json`,
  `architecture/data-topology.json`.
- File/Intelligence processing history cutover:
  [file-intelligence-processing-receipt-cutover](../migrations/file-intelligence-processing-receipt-cutover.md).
- First implementation:
  `packages/intelligence/src/application/use-cases/processing.ts` and
  `packages/intelligence/test/processing-replay.test.ts`.

This proposal is complete only after owner/consumer review and exact-head
validation. Adopted rules belong in the existing canonical owners and architecture
manifests; do not preserve a competing architecture authority here.
