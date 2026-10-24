# Content constraints

Inherits [packages](../AGENTS.md). Authority: [Content owner](../../docs/owners/content.md).

- Content owns Repository work definitions, the strict Subject → Object → SubObject → Work → Task hierarchy, planned quantities and coherent immutable plan revisions.
- Task identity/definition belongs to Content; execution state, prerequisites, actuals and internal review belong to Execution.
- Resources owns Location, Equipment and Material identity/lifecycle. Use its public transaction-bound reference contract, never its private tables or adapters.
- Legacy extraction imports are retained only for explicit historical compatibility and must not be used by current Contract intake. Current Contract expansion consumes one exact CONFIRMED Contract revision through an injected public reader, applies one whole-document mapping and records a disposition for every source row. Content never queries private Contract, File or Intelligence tables. Provenance belongs to the immutable Content revision; it is not exposed in public projections. WBS is a separate Project-owned consumer and is never mutated implicitly.
- One Repository plan head selects a complete immutable document revision. Preserve current authorization, expected-version concurrency, exact replay and atomic head/revision/receipt writes.
- Equal units alone do not establish comparable quantities. Plan edits never rewrite Contract commitments or Execution facts.
- Project WBS remains a distinct Project-scoped owner; do not create a second writer for its document or Baseline.
- Text validation is a neutral Platform mechanism, not Content's public business capability.
