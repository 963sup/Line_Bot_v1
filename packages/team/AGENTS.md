# Team package constraints

Local constraints for `@line_bot_v1/team`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Team belongs to exactly one Organization; team slug is unique within that Organization.
- Parent and child teams must belong to the same Organization (no cross-org hierarchy).
- Team maintainer authority is scoped to the specific team.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
