# @line-work/wallet

- Wallet owns the derived holder-facing balance projection; it does not own a writable balance relation.
- Holder qualification comes from Account, denomination from Asset, and immutable value facts from Ledger through their public transaction-scoped contracts.
- Wallet adapters must not directly query or mutate Account, Asset, or Ledger authoritative relations; package dependencies must expose every real upstream owner.
- Balance must remain reconstructable from Ledger facts and Asset denomination. Do not create cached/writable balance authority for convenience.
