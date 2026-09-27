# @line-work/wallet

Owner: holder eligibility and derived balance projection. Canonical semantics: [Wallet](../../docs/owners/wallet.md).

- Balance is reconstructed from Ledger facts + Asset denomination; do not create writable/cached balance authority.
- Holder qualification comes from Account; current Coin eligibility is USER-only unless the owner contract explicitly changes it.
- Preserve zero balance ≠ missing/ineligible holder.
- Wallet adapters do not query or mutate upstream private persistence, and Wallet existence never grants posting authority.
