# Payroll package constraints

Local constraints for `@line_bot_v1/payroll`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Current capability is readiness validation over injected Workforce, Attendance-period and rule-version sources; readiness is not calculation, approval or settlement.
- Formal calculation and settlement remain inactive. Activation requires explicit consumer/input contracts and the [Payroll calculation gate](../../docs/reference/domains/payroll.md#calculation-activation-gate); do not infer approved Expense inputs or Ledger posting from this foundation.
- Any future settlement must preserve dual authorization and atomic Ledger posting through Ledger's public contract; this is an activation constraint, not a deployed capability.
