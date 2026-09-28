# Attendance package constraints

Local constraints for `@line_bot_v1/attendance`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Attendance session state transitions must be monotonic and replay-safe.
- Clock-in location and workplace bounds are verified at command time.
- Attendance reward grants emit idempotency keys to Ledger/Wallet.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
