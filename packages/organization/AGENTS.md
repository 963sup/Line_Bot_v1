# Organization package constraints

Local constraints for `@line_bot_v1/organization`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- OrganizationInvitation represents pending intent; it does not grant membership or authorization.
- Active membership requires verified direct membership or active Enterprise Team assignment.
- Organization login shares the global login namespace governed by @line_bot_v1/namespace.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
