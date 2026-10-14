# Wiki

Wiki owns Repository-scoped page identity, immutable content revisions, page heads and durable exact-replay receipts. Repository remains the authority for scope, qualification, access and archive.

- Each page has an independent version. Create expects version zero; subsequent commands require the observed page version.
- Create/edit supply title and raw Markdown body; rename changes only title. Archive preserves reads. Restore copies a same-page historical title/body into a new active revision.
- Reads and historical comparisons recheck current Repository access. Write requires current write/maintain/admin; Repository archive blocks new commands. Exact authorized replay may return its original receipt.
- Head, revision and receipt commit atomically; stale versions and reused request identities with changed content conflict. Reads never initialize pages.
- History uses version-keyset pages; page lists use stable page-ID cursors. Both have 20 items per page.
- Wiki does not own formal WBS scope, Issue execution, Markdown rendering, attachments or page-specific grants.

Delivery includes authenticated stdin `pnpm wiki:run`, `GET/POST /api/repository-wiki`, and Web collection/detail pages at `/{login}/{repository}/wiki` and `/wiki/{pageId}`. URL names locate current Repository scope; a write command must match the resolved Repository ID. The host verifies LINE identity and active Account mapping; owner queries/commands recheck current access. Web preserves exact unknown-result retries bound to User/Repository/page, clears private state on session loss/hidden views and renders Markdown only as escaped text. Machine facts: [semantic model](../../architecture/semantic-model.json), [module topology](../../architecture/implementation-topology.json), [data topology](../../architecture/data-topology.json).
