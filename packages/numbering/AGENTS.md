# Numbering package constraints

Local constraints for `@line_bot_v1/numbering`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local invariants

- A Series is identified by family plus its typed stable scope; numbering is never global.
- A committed Allocation is immutable and is never released, reset, or reused.
- Allocation is atomic and idempotent for one resource inside the caller's PostgreSQL transaction.
- Numbering decides sequence integrity only. Resource authorization, lifecycle, replay receipts, and
  the decision to allocate stay with the consuming Owner.
- Numbering does not depend on Namespace and never queries a consumer's private tables.
- Public API surface is defined exclusively in `package.json#exports`.
