# Asset

## Responsibility

Asset owns the definition of a value type, not ownership or transaction history. An `AssetDefinition` answers only:

- stable `AssetCode`
- display name
- smallest ledger denomination (`unitsPerWhole`)

The selected current model defines one Asset: `coin`, display name `Coin`, `unitsPerWhole = 2`. Therefore 1 ledger unit = 0.5 Coin. Whether this model is deployed in a specific environment is acceptance/release evidence, not a business-rule claim.

## Invariants

- `AssetCode` is stable business identity; code changes are migrations, not presentation renames.
- `unitsPerWhole` is positive integer reference data and is the single denomination authority.
- Runtime does not mutate Asset definitions. New assets or denomination changes require an explicit domain/schema decision and forward migration.
- Asset does not decide why a Member receives value. Membership owns daily check-in eligibility/amount; Attendance owns clock reward eligibility/amount.
- Asset does not own Member qualification, Wallet balance, Ledger posting history, transfer, spending, payment or payroll.

## Current scope

Only Coin is modeled. The existence of Asset does not pre-create currencies, points, tokens, vouchers, inventory or exchange-rate abstractions. Add another Asset only when an actual product capability requires distinct identity and denomination.

## Adjacent owners

- Holding / balance projection: [Wallet](140-wallet.md)
- Append-only value history: [Ledger](150-ledger.md)
- Data schema: [Core business data](../040-data/010-data-boundary-model.md)
