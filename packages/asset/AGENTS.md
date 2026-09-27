# @line-work/asset

- Owns AssetDefinition identity and denomination contract. Current `asset_definitions` is schema-defined read-only authority, not a writable catalog.
- Asset does not own holder identity, Wallet balance or Ledger facts. Consumers use the Asset public read contract instead of querying the view directly.
- Preserve integer-unit denomination and stable AssetCode semantics; do not infer holder authorization from asset metadata.
- Adding an asset is current schema/reference-data work, not an application write API. Keep generated/read projections reconstructable from the canonical schema source.
- Denomination changes are compatibility-sensitive: prove all Ledger and Wallet consumers preserve historical integer-unit meaning before changing an existing AssetCode.
