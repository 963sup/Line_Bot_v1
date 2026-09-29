# Attendance package constraints

Local constraints for `@line_bot_v1/attendance`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Attendance session state transitions must be monotonic and replay-safe.
- Clock-in location and workplace bounds are verified at command time.
- Attendance reward grants emit idempotency keys to Ledger/Wallet.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
Attendance semantics
Attendance vocabulary
Attendance state
Attendance commands
Attendance validation
Attendance use cases
Attendance read model
Attendance operation metadata
Attendance persistence
Attendance-specific input/output contracts
Attendance-specific recovery semantics

全部
→ packages/attendance

Web 不應再維護另一份 Attendance knowledge。
