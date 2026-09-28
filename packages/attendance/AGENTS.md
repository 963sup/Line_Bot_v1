# Attendance package constraints

Local constraints for `@line_bot_v1/attendance`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Current effective Repository access is the only Repository participation source used by clock eligibility.
- Workplace identity equals Repository id；each Repository has at most one configured Attendance geofence.
- Attendance session state transitions must be monotonic and replay-safe.
- Clock-in location and Workplace bounds are verified at command time.
- Attendance reward grants emit idempotency keys to Ledger/Wallet.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
