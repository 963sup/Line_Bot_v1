# @line-work/ledger

- Owns append-only Ledger facts, posting/idempotency contract and owner-approved fact projections such as summed units.
- Ledger does not own WalletBalance. Wallet derives balance from Ledger facts plus Asset denomination.
- Consumers use Ledger public transaction-scoped capabilities; they do not mutate `asset_ledger_entries` directly.
- Preserve holder/scope isolation, source identity, transaction atomicity, immutable history and reconciliation behavior.
