# Payroll package constraints

Local constraints for `@line_bot_v1/payroll`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Module remains inactive until explicit payroll consumer contracts and calculation engines are deployed.
- Payroll readiness consumes Attendance and Expense approved facts via query.
- Settlement entries require dual authorization and emit atomic Ledger records.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
