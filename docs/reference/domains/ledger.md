# Ledger detailed reference

Low-frequency Ledger implementation / activation detail. Ownership remains canonical in [Ledger](../../010-domain-owners/150-ledger.md).

## Current persistence boundary

The private `post_asset_credit(...)` function remains the single runtime writer. Its positional SQL contract, V1 `member_id` storage reference, origin allowlist, integer conversion and unique key are retained. Product source now passes `LedgerCredit.holderAccountId` to this contract.

The public transaction-scoped `readLedgerCreditFact` reads an immutable entry by its complete posting identity. DailyCheckIn uses the stored units and business day to verify its durable claim; callers do not query Ledger tables directly. A boolean existence query is insufficient for reward-result recovery and parity checks.

Current Coin remains USER-only. The Ledger holder FK still references `users`, whose User facet is kind-bound to the Account root; it is not weakened to an unchecked generic Account FK. Wallet owns the eligibility policy, and persistence must continue to enforce it before other kinds are ever enabled.

Asset denomination comes from the schema-defined read-only Asset view. Non-representable amounts are rejected; fractional binary floating-point is not authoritative Ledger storage.

## Transactions

- Current human check-in rechecks active qualification and commits its reward claim, audit and Ledger credit atomically; the day/reward policy belongs to DailyCheckIn. A deferred cross-owner constraint rejects a claim without its matching Ledger units/day at commit.
- Attendance commits session/state/version/event/Ledger/receipt and required outbox effects atomically.
- Account registration commits the identity root and required User facet together; failed transactions cannot leave a usable orphan identity.
- A shared database transaction does not merge these business owners into one Aggregate.

## Acceptance / remaining work

Required checks include unchanged per-holder/source totals and denomination, missing/wrong-kind holder denial, direct-write denial, exact retry, transaction rollback and current qualification checks. The Account expansion does not complete Employment, Bot, non-USER holding or deployment stages.

## Adjacent owners

- [Asset](../../010-domain-owners/130-asset.md): definition and denomination.
- [Wallet](../../010-domain-owners/140-wallet.md): eligibility and derived holding.
- [DailyCheckIn](../../010-domain-owners/160-daily-check-in.md): daily reward policy.
- [Attendance](../../010-domain-owners/050-attendance.md): clock reward policy.
- [Current identity data](../../040-data/010-data-boundary-model.md)
- [Transactions](../../040-data/040-transaction-and-idempotency.md)
- [Migration gates](../../090-governance/030-migrations/040-enterprise-organization-workforce-payroll.md)
