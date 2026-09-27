# @line-work/wallet

- Wallet owns the derived holder-facing balance projection; it does not own a writable balance relation.
- Holder qualification comes from Account, denomination from Asset, and immutable value facts from Ledger through their public transaction-scoped contracts.
- Wallet adapters must not directly query or mutate Account, Asset, or Ledger authoritative relations; package dependencies must expose every real upstream owner.
- Balance must remain reconstructable from Ledger facts and Asset denomination. Do not create cached/writable balance authority for convenience.
- Current Coin holding is USER-only unless the owner docs and tests explicitly activate another Account kind. Employment, Organization or Payroll naming must not widen holder eligibility by implication.
- Preserve the distinction between zero balance and missing/unsupported holder. A display projection may show `0`, but the repository contract must still prove qualification and supported asset semantics.
