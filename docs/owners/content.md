# Content

Content owns the shared bounded title/body normalization mechanism used by Resources and Wiki.
A title is trimmed and must contain 1–200 UTF-16 code units; a body may contain at most 262144
UTF-16 code units and is returned unchanged. Title failures take precedence over body failures.
The result identifies the invalid field; each consumer retains its established error wording,
status and validation timing.

Content has no identity, head, revision, classification, quantity, relationship, authorization,
rendering or persisted relation. Resources and Wiki keep their own immutable aggregate revisions,
exact replay, current access checks and transaction boundaries. Object plain text and Wiki raw
Markdown remain consumer-specific meanings. A shared value does not create another content store.

Use the exact `@line_bot_v1/content/text` export. Current implementation and consumers are recorded
in the canonical [semantic model](../../architecture/semantic-model.json) and
[module topology](../../architecture/implementation-topology.json).
