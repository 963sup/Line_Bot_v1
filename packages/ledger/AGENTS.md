# Ledger package constraints

Local constraints for `@line_bot_v1/ledger`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Internal consistency boundary: must not be directly consumed by Web or external application hosts.
- Ledger transactions must balance (sum of debits equals sum of credits).
- Historical ledger entries are append-only and immutable; corrections require offsetting entries.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
