# Wallet detailed reference

Low-frequency Wallet implementation / activation detail. Ownership remains canonical in [Wallet](../../010-domain-owners/140-wallet.md).

## Current source and desired schema

`PostgresWalletStore` resolves holder eligibility through the Account-owned User qualification contract and derives value from Asset definitions plus Ledger entries. Presence of the canonical `users` facet proves the current USER-only holding policy; lifecycle status changes do not erase that historical holding. The retained V1 `member_id` name exists only as Ledger storage compatibility.

The existing Ledger `member_id` column remains the V1 storage reference during this expansion. Its FK to `users`, together with the User facet's kind-aware Account FK, proves that the current Coin holder is an `Account(kind=USER)`. It does not create a second holding identity.

```text
AccountId + supported Asset + Ledger facts
        ↓
WalletBalance(holderAccountId, asset, units, balance)

balance = SUM(amountUnits) / unitsPerWhole
```

The composed public Coin response retains its existing fields; the internal holding key is not the command actor. Source/schema changes are not remote deployment evidence.

## Remaining activation gates

Organization/Enterprise/Bot holdings require an explicit Wallet policy, matching Ledger enforcement and negative tests. Transfer, debit, spending, reservation, withdrawal, exchange and shared credit pools are not implied by this expansion.

Removing V1 storage names requires a separate coordinated reader/writer cutover and before/after per-holder/source parity. Do not rewrite historical source tuples or create a duplicate balance to make naming uniform.

## Acceptance

Tests must retain existing amount/denomination totals, zero-entry versus missing-holder distinction, denied direct writes, current authorization and rollback/replay behavior. Remote synchronization and API/device verification require their own evidence, not a source-only PASS.

## Adjacent owners

- [Account data and expansion boundary](../../040-data/010-data-boundary-model.md)
- [Asset](../../010-domain-owners/130-asset.md): value definition and denomination.
- [Ledger](../../010-domain-owners/150-ledger.md): immutable value facts and posting.
- [Current human lifecycle](../../010-domain-owners/010-account.md)
- [Account identity design](../../090-governance/010-decisions/070-account-identity-design.md)
- [Migration gates](../../090-governance/030-migrations/040-enterprise-organization-workforce-payroll.md)
