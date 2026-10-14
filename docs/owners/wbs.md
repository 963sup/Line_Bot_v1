# WBS

Baseline publication atomically saves a version-bound outbox event. The public event feed exposes leased claim/acknowledge and a Repository event cursor; rule activation reads that cursor in the same transaction as its Repository lock. Consumers commit deduped acceptance before acknowledging. Runtime cannot update event payload; lease expiry permits redelivery with the same Baseline/Revision identity.

The owner-published metrics query reports current OPEN proposals, the published Baseline and structural draft differences under current Repository access. Missing content remains uninitialized; without a published Baseline, differences are null rather than an invented approved scope. Insights consumes these facts without acquiring WBS authority.

Repository-WBS owns a Repository-scoped work decomposition document, its head version, immutable Revision content/history and durable exact-replay receipts. It is a local extension, not GitHub Commit, PullRequest or ProjectItem semantics.

## Authority and invariants

- Repository owns identity, current visibility/access and archive. The public transactional content-scope contract retains qualification, governance and Repository locks; WBS never queries Repository private tables.
- Read follows current Repository access, including historical content. Write requires exact `write | maintain | admin`; public visibility is never write authority. Archived repositories reject new writes; an authorized exact replay may return its prior receipt.
- One Repository has at most one WBS head. Immutable schema-versioned Revision documents are the only scope content authority; the head points to one matching version/revision. No second mutable node store exists.
- Node identity survives rename/reparent/reorder. WORK_PACKAGE is a leaf; DELIVERABLE is a decomposition container. Reject duplicates, cycles, missing parents and depth over 32; maximum 1000 nodes. Position is normalized among siblings; displayed numbering is derived.
- Draft content may omit deliverable/acceptance text. A saved revision is not approval, acceptance or Baseline.
- Each committed command advances WBS version once and atomically inserts a Revision and receipt. Stale versions and reuse of requestId with different content conflict. Replay rechecks current qualification/access before returning history.
- Initialization is explicit. Reads never create WBS content. Subtree deletion is explicit and historical documents remain immutable.
- Issue owns assignment, execution and workflow. Project owns planning; neither edits WBS scope. Legacy `project_wbs` remains separate Project-owned data-only persistence; no automatic mapping, migration or dual write is performed.

## Delivery

Source roles are explicit: `domain/document.ts` and `domain/content.ts` own scope content; `domain/governance.ts`, `domain/scope-governance.ts` and `domain/policies/access.ts` own governance rules and transitions. `application/commands`, `application/queries` and `application/use-cases` separate parsing from coordination. `contracts/dto` contains exchange models; `contracts/repositories` contains the technology-independent transaction/load/save ports. PostgreSQL adapters implement those ports; composition exposes only their contract types. Root-level forwarding entries are absent. Public consumers were migrated together with the exports and semantic implementation paths.

Runtime owner: `packages/wbs`. Web presentation is Repository-scoped. `/{login}/{repository}/wbs` reads/edits current content and displays read-only historical revisions. `/api/repository-wbs` provides authorized GET/POST; `/api/repository-wbs/history` provides version-keyset pagination (20 per page).

Commands require `requestId`, `repositoryId`, `expectedVersion` and exactly the fields of the selected action. Actions: initialize, create-node, update-node, move-node, delete-subtree. Initialization expects version zero. All other commands require an existing WBS. Update-node edits content/type only; structural changes use move-node. Errors distinguish input, access, missing resource, version/replay conflict and unavailable/unknown result.

Current schema: [Repository WBS](../../supabase/schemas/609_repository_wbs.sql). Machine facts: [semantic model](../../architecture/semantic-model.json), [module topology](../../architecture/implementation-topology.json), [data topology](../../architecture/data-topology.json).

## Scope governance

`/api/repository-wbs/governance` GET/POST owns proposal, policy, review and Baseline transport. GET accepts owner/name and optional proposalId, baselineId, beforeProposal or beforeBaseline; proposalVersion and beforeReview require proposalId. Proposal/Baseline/review lists use 20-row keyset pages; detail reads always remain Repository-scoped. Reads never initialize governance state.

- Draft content head/version stays independent from governance version. Governance commands never fabricate a content Revision or overwrite a later draft.
- Create/revise Proposal freezes a same-Repository candidate Revision and the current nullable base Baseline. Immutable ProposalVersion snapshots preserve the exact title/reason/base/candidate/status and actor reviewed previously; the Proposal head selects one snapshot. Revise increments proposal version and invalidates older reviews; close and publish are terminal. Historical proposal versions remain read-only. Proposal numbers and Baseline numbers are stable governance sequence locators and may contain gaps.
- Review binds proposal version, candidate Revision and policy version. Only the latest review by each reviewer for that tuple counts. A currently eligible request-changes review blocks publication. Publication rechecks active qualification and current maintain/admin permission for every counted reviewer under the Repository transaction locks.
- Default policy is at least one approval with self-approval allowed. When disabled, neither the original creator nor the current proposal version's proposer may supply approval. Current Repository admin may change the approval count (1–10) and self-approval policy; immutable policy versions remain readable and old-policy reviews do not authorize a new publication.
- Write/maintain/admin may create/revise/close proposals. Maintain/admin may review/publish. All commands require requestId and expected governance version; proposal commands additionally bind expected proposal version, and review/publish/policy commands bind expected policy version. Exact replay rechecks current operation authority and may return its receipt while archived; new mutations fail while archived.
- First Baseline requires a reviewed proposal. Mandatory checks enforce a valid tree, at least one work package and each work package's nonempty deliverable/acceptance requirements. Incomplete drafts and proposals may be saved but cannot be published.
- Publication atomically persists immutable Baseline (including counted review IDs and policy version), marks Proposal published, advances the formal pointer and writes the exact-replay receipt. A changed formal base requires an explicit proposal update and fresh review. Two competing publications cannot overwrite each other.
- Baseline records approved scope, not completion or work-package acceptance. Immutable policy/review/Baseline/receipt relations grant no UPDATE/DELETE to the application role. Structural comparison reports changes by stable node identity, including parent/order/content.
- Historical proposal reads resolve publication by the reviewed proposal version, retaining the publication-time policy and approval evidence even after policy changes; the old OPEN snapshot status does not erase its published Baseline association.

Verification: owner domain/persistence tests, HTTP tests, browser checks and a CI-only disposable PostgreSQL 17 multi-session race test. Local runs without `WBS_TEST_DATABASE_URL` explicitly skip that race test; CI requires it and disables WBS test-result caching. The test only accepts a loopback server and never uses production credentials.

## Subsequent delivery contract

1. Scope governance above is implemented; subsequent work-package acceptance remains separate.
2. WBS references Issue execution and Discussion decisions by stable identity/version; reads recheck source access. Issue completion never automatically accepts a work package.
3. Project adds a local WBS reference without extending the FPT ProjectItem union. Legacy Project-WBS cutover requires explicit mapping and recovery evidence.
4. Evidence adds version-bound decisions, source references and protected attachments. Asset is a monetary value definition owner, not file storage.
5. Watch retains its three-state intent; committed-event outbox, deduplicated fan-out and current source access are required before notification delivery is claimed.
6. Structural comparison precedes branches/three-way conflict handling and same-Owner independent Forks. Fork never copies grants or private attachment access. Automation starts with fixed checks, without arbitrary code execution.

Items 2–6 are delivery targets, not current runtime capabilities. No empty tables, writer surfaces or disabled UI shells are created for them.
