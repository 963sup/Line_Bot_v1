# Wiki

Wiki owns Repository-scoped page identity, immutable content revisions, page heads and durable exact-replay receipts. Repository remains the authority for scope, qualification, access and archive.

Wiki consumes the neutral [Platform](platform.md) `text` export for bounded title/body normalization, while retaining
raw Markdown meaning, validation timing, errors, immutable revisions and transaction authority.

Public reads, command receipts, replay and history use an explicit revision DTO projection. Application maps the internal Domain revision to the published field set; the Aggregate Repository exposes only Domain load/save with expected version. Read/qualification, transaction and durable receipt capabilities are output Ports; Application saves the head/revision and records its receipt in the same transaction. Command and Query models live in Application, and the concrete PostgreSQL adapter depends on scope/evidence rather than an Application command. Domain object identity and future internal fields are not part of the published contract.

- Each page has an independent version. Create expects version zero; subsequent commands require the observed page version.
- Create/edit supply title and raw Markdown body; rename changes only title. Archive preserves reads. Restore copies a same-page historical title/body into a new active revision.
- Reads and historical comparisons recheck current Repository access. Write requires current write/maintain/admin; Repository archive blocks new commands. Exact authorized replay may return its original receipt.
- Head, revision and receipt commit atomically; stale versions and reused request identities with changed content conflict. Reads never initialize pages.
- History uses version-keyset pages; page lists use stable page-ID cursors. Both have 20 items per page.
- Wiki does not own formal WBS scope, Issue execution, Markdown rendering, attachments or page-specific grants.

Delivery includes `GET/POST /api/repository-wiki` and Web collection/detail pages at `/{login}/{repository}/wiki` and `/wiki/{pageId}`. URL names locate current Repository scope; a write command must match the resolved Repository ID. The host verifies LINE identity and active Account mapping; owner queries/commands recheck current access. Web preserves exact unknown-result retries bound to User/Repository/page, clears private state on session loss/hidden views and renders Markdown only as escaped text. Machine facts: [semantic model](../../architecture/semantic-model.json), [module topology](../../architecture/implementation-topology.json), [data topology](../../architecture/data-topology.json).
