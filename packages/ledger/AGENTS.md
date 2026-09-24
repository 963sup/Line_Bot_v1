# @line-work/ledger

- Owns append-only Ledger facts, posting/idempotency contract and owner-approved fact projections such as summed units.
- Ledger does not own WalletBalance. Wallet derives balance from Ledger facts plus Asset denomination.
- Consumers use Ledger public transaction-scoped capabilities; they do not mutate `asset_ledger_entries` directly.
- Preserve holder/scope isolation, source identity, transaction atomicity, immutable history and reconciliation behavior.
- Posting identity includes holder, asset, source context/type/ref and idempotency semantics. Exact retry returns the same fact; a different business event must not reuse the same source identity.
- Do not rewrite historical source tuples, storage column names or holder IDs for naming symmetry. Migration must prove per-holder/source parity and preserve rollback/recovery evidence.
