# Daily Check-in package constraints

Local constraints for `@line_bot_v1/daily-check-in`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Exactly one check-in claim per user per UTC/timezone business day.
- Replay commands with identical request fingerprint are idempotent no-ops.
- Reward distribution triggers atomic credit entries via Ledger/Wallet.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
