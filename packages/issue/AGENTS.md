# Issue package constraints

Local constraints for `@line_bot_v1/issue`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local invariants

- Every Issue belongs to exactly one Repository, but Repository identity/access remains Repository-owned.
- Issue number is unique only inside its Repository scope; allocation is delegated to the Repository owner.
- Issue command replay uses stable request identity; a reused request identity must match the original command exactly.
- Canonical FPT `OPEN/CLOSED + stateReason` and the local `pending/active/review/completed` workflow are independent axes; never infer one from the other during current mutations.
- Conditional Issue mutations require the expected version and preserve durable structured event history.
- Issue assignment and write operations re-check current effective Repository access.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported by external packages.
