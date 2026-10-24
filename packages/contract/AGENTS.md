# Contract package constraints

Inherits [packages](../AGENTS.md). Contract owns Repository-scoped engineering agreements and a separate purchase-order document intake aggregate. Each has immutable revisions and exact command receipts.

- The historical engineering-agreement lifecycle is `DRAFT -> ACTIVE -> CLOSED`; preserve its Content-pinned snapshots without reinterpreting them as purchase orders.
- Purchase-order intake owns complete source rows, exact decimal commercial facts, draft diagnostics, confirmations, source pins and receipts. These facts do not belong in File or Intelligence.
- Each purchase-order revision pins an exact File revision and SHA-256, qualified by File within the Contract transaction.
- Engineering-agreement commitments pin exact Content Work/Task plan items through its public reader in the same transaction; Contract never owns Content structure or actual completion.
- Legacy engineering-agreement rows remain Content-based; purchase-order documents use their own schema and persistence without a compatibility writer.
- Contract reference reads expose exact ACTIVE revision line facts to Execution and never rewrite already frozen source facts. Persistence never queries private Content tables.
- Preserve current Repository authorization, qualification, locking, exact replay, expected-version concurrency, atomic head/revision/receipt storage, and detached DTO projection.
