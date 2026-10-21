# Contract package constraints

Inherits [packages](../AGENTS.md). Contract owns Repository-scoped engineering agreements, their lifecycle, immutable revisions, and exact command receipts.

- Lifecycle is `DRAFT -> ACTIVE -> CLOSED`; every accepted command creates an immutable revision.
- A revision owns one complete frozen JSONB line snapshot. Do not add mutable line tables, staging, signatures, prices, counterparties, payment, or legal-effect models.
- New commitments pin exact Content Work/Task plan items through its public reader in the same transaction; Contract never owns Content structure or actual completion.
- Legacy Resource-based immutable snapshots and exact receipts remain readable without inferred conversion. New Resource-only commitments are rejected; existing drafts must be explicitly edited to a Content basis before activation.
- Contract reference reads expose exact ACTIVE revision line facts to Execution and never rewrite already frozen source facts. Persistence never queries private Content or Resource tables.
- Preserve current Repository authorization, qualification, locking, exact replay, expected-version concurrency, atomic head/revision/receipt storage, and detached DTO projection.
