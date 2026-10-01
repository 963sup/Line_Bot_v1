# Repository package constraints

Local constraints for `@line_bot_v1/repository`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Every Discussion belongs to exactly one Repository. Issue lifecycle is Issue-owned; Repository provides its scope/access and repository-scoped number allocation.
- Star/unstar is idempotent; starring never grants repository access.
- Repository Star Lists are user-owned curated collections over the user current stars.
- Repository has at most one nullable address value; that address is the attendance point for current effective Repository members. Public visibility and Stars never grant attendance eligibility.
- Only a current effective Repository admin can set or remove its address. Address commands preserve expected-version checks, exact replay and the shared governance/access transaction lock.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
