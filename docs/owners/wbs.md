# WBS

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

Runtime owner: `packages/wbs`. Web presentation is Repository-scoped. `/{login}/{repository}/wbs` reads/edits current content and displays read-only historical revisions. `/api/repository-wbs` provides authorized GET/POST; `/api/repository-wbs/history` provides version-keyset pagination (20 per page).

Commands require `requestId`, `repositoryId`, `expectedVersion` and exactly the fields of the selected action. Actions: initialize, create-node, update-node, move-node, delete-subtree. Initialization expects version zero. All other commands require an existing WBS. Update-node edits content/type only; structural changes use move-node. Errors distinguish input, access, missing resource, version/replay conflict and unavailable/unknown result.

Current schema: [Repository WBS](../../supabase/schemas/609_repository_wbs.sql). Machine facts: [semantic model](../../architecture/semantic-model.json), [module topology](../../architecture/implementation-topology.json), [data topology](../../architecture/data-topology.json).

## Subsequent delivery contract

1. Change Proposal binds base Revision; review binds the exact proposal version. Atomic acceptance and immutable Baseline follow. Self-approval is permitted subject to current policy and checks.
2. WBS references Issue execution and Discussion decisions by stable identity/version; reads recheck source access. Issue completion never automatically accepts a work package.
3. Project adds a local WBS reference without extending the FPT ProjectItem union. Legacy Project-WBS cutover requires explicit mapping and recovery evidence.
4. Evidence adds version-bound decisions, source references and protected attachments. Asset is a monetary value definition owner, not file storage.
5. Watch retains its three-state intent; committed-event outbox, deduplicated fan-out and current source access are required before notification delivery is claimed.
6. Structural comparison precedes branches/three-way conflict handling and same-Owner independent Forks. Fork never copies grants or private attachment access. Automation starts with fixed checks, without arbitrary code execution.

These are delivery targets, not current runtime capabilities. No empty tables, writer surfaces or disabled UI shells are created for them.
