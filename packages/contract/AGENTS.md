# Contract package constraints

Inherits [packages](../AGENTS.md). Contract owns Repository-scoped engineering agreements, their lifecycle, immutable revisions, and exact command receipts.

- Lifecycle is `DRAFT -> ACTIVE -> CLOSED`; every accepted command creates an immutable revision.
- A revision owns one complete frozen JSONB line snapshot. Do not add mutable line tables, staging, signatures, prices, counterparties, payment, or legal-effect models.
- Resource facts enter only through the public Resources quantity reader in the same SQL transaction. Contract persistence must not query private Resource tables.
- Contract reference reads expose exact ACTIVE revision line facts to Execution and never requalify already frozen Resource facts.
- Preserve current Repository authorization, qualification, locking, exact replay, expected-version concurrency, atomic head/revision/receipt storage, and detached DTO projection.
