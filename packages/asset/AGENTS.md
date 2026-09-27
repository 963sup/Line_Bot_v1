# @line-work/asset

Owner: AssetDefinition identity and denomination. Canonical semantics: [Asset](../../docs/owners/asset.md).

- Runtime is read-only; asset additions or denomination changes are schema/domain decisions, not application writes.
- Asset metadata never grants holder authorization; Wallet owns balances and Ledger owns value history.
- Preserve stable AssetCode and historical integer-unit meaning; denomination changes require proving Ledger/Wallet consumer compatibility.
