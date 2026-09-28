# Repository package constraints

Local constraints for `@line_bot_v1/repository`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Every Issue and Discussion belongs to exactly one Repository.
- Star/unstar is idempotent; starring never grants repository access.
- Repository Star Lists are user-owned curated collections over the user current stars.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
