# Ledger

Read this file for Ledger ownership and core invariants. Load [detailed reference](../reference/domains/ledger.md) only for persistence / transaction / activation detail.

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
