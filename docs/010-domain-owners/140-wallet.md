# Wallet

Read this file for Wallet ownership and core invariants. Load [detailed reference](../reference/domains/wallet.md) only for persistence / transaction / activation detail.

## Responsibility

The source contract identifies a holding by `holderAccountId + AssetCode`. The ID is the same stable AccountId value, not a second UUID, command actor, Employment, tenant scope or permission.

Wallet owns eligibility and the derived balance projection for a supported holding. It does not own reward policy or a second writable balance. The current policy is **Coin = USER-only**; other Account kinds are not enabled by the presence of AccountKind.

## Invariants

- Only an existing eligible Account and supported Asset form a Wallet projection.
- An eligible Account with no entries has zero balance; a missing or ineligible holder is not zero.
- No dedicated Wallet table, authoritative balance column, create-wallet or direct balance mutation is introduced.
- Current Asset denomination and durable Ledger facts determine value.
- Human qualification changes do not erase or transfer historical ownership; private read authorization remains explicit.
- Wallet does not decide why DailyCheckIn or Attendance awards value, nor Ledger posting identity.
- Selecting an Organization in the UI does not transfer the person's holding to that Organization.
- AccountId, kind, a cached relationship graph or the existence of a Wallet never grants posting permission.
