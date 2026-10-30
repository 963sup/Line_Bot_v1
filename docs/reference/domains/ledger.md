# Ledger detailed reference

Low-frequency Ledger implementation / activation detail. Ownership remains canonical in [Ledger](ledger.md).

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

- [Asset](../../owners/asset.md): definition and denomination.
- [Wallet](wallet.md): eligibility and derived holding.
- [DailyCheckIn](daily-check-in.md): daily reward policy.
- [Attendance](attendance.md): clock reward policy.
- [Current identity data](../data/boundaries.md)
- [Transactions](../data/transactions.md)
- Migration gates follow the current Workforce, Attendance and Payroll owner contracts and schema checks.

## Ownership

Read this file for Ledger ownership and core invariants. Load [detailed reference](ledger.md) only for persistence / transaction / activation detail.

## Responsibility

Ledger owns immutable Asset value facts, source identity and posting idempotency. It records the value decision of an originating business owner; it does not decide reward eligibility or amount.

The internal credit contract uses `holderAccountId`. That is an AccountId value used as a holder, not a new identifier, Principal, Employee or Organization scope.

## Durable posting identity

```text
(HolderAccountId, AssetCode, sourceContext, sourceType, sourceRef)
```

The ID value and the rest of the existing V1 key do not change during identity expansion. Current durable sources remain:

| sourceContext | sourceType | sourceRef |
| --- | --- | --- |
| `membership` | `daily_checkin` | Asia/Taipei business day |
| `attendance` | `clockIn` | session-start business day |
| `attendance` | `clockOut` | session-start business day |
| `migration` | `legacy_balance` | privileged historical import reference |

DailyCheckIn and Attendance own their reward policies. The `membership` literal is a preserved Ledger V1 origin, not a claim that Account owns reward policy. Runtime cannot manufacture `migration/legacy_balance` credits.

Exact retry is a no-op, not a second credit. An identity rename, a future Employment scope or a different entrypoint cannot create a second daily reward namespace. Historical origin tuples, receipt fingerprints and stored results are not rewritten.

## Durability

Runtime has no direct INSERT/UPDATE/DELETE grant on Ledger entries. No second Ledger, balance counter, ownership re-key or historical rewrite is introduced.

Correction, debit, transfer, spending and reversal require explicit posting semantics before implementation; they are not simulated by updating old rows. This Asset Ledger is not an accounting General Ledger, and AccountId is not a Finance accounting-account identifier.
