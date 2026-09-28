# Audit package constraints

Local constraints for `@line_bot_v1/audit`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Audit logs and receipts are append-only evidence; historical records must not be rewritten.
- Audit records capture actor, target, timestamp, request fingerprint, and outcome.
- Read queries consume authorized owner projections only; every page rechecks current scope authority.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
