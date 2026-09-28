# Expense package constraints

Local constraints for `@line_bot_v1/expense`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Expense claim mutation uses expected version checks to avoid concurrent overwrite.
- Approval transitions require verified authority from Identity & Access.
- Receipt image intake requires verified upload intent before final claim attachment.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
