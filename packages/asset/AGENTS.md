# @line-work/asset

- Owns AssetDefinition identity and denomination contract. Current `asset_definitions` is schema-defined read-only authority, not a writable catalog.
- Asset does not own holder identity, Wallet balance or Ledger facts. Consumers use the Asset public read contract instead of querying the view directly.
- Preserve integer-unit denomination and stable AssetCode semantics; do not infer holder authorization from asset metadata.
