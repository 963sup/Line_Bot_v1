# Content constraints

Inherits [packages](../AGENTS.md). Authority: [Content owner](../../docs/owners/content.md).

- Content owns Repository work definitions, the strict Subject → Object → SubObject → Work → Task hierarchy, planned quantities and coherent immutable plan revisions.
- Task identity/definition belongs to Content; execution state, prerequisites, actuals and internal review belong to Execution.
- Resources owns Location, Equipment and Material identity/lifecycle. Use its public transaction-bound reference contract, never its private tables or adapters.
- File observation imports require explicit user disclosure confirmation, a selected SAVED revision and observation requalified by File's public transaction-bound reader, and a legal existing Content parent. Provenance belongs to the immutable Content revision, never public Content projections; no inferred hierarchy, automatic Contract/WBS mutation or File table query.
- One Repository plan head selects a complete immutable document revision. Preserve current authorization, expected-version concurrency, exact replay and atomic head/revision/receipt writes.
- Equal units alone do not establish comparable quantities. Plan edits never rewrite Contract commitments or Execution facts.
- Project WBS remains a distinct Project-scoped owner; do not create a second writer for its document or Baseline.
- Text validation is a neutral Platform mechanism, not Content's public business capability.
