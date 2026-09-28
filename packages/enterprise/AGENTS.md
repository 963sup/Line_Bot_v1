# Enterprise package constraints

Local constraints for `@line_bot_v1/enterprise`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- EnterpriseInvitation is a pending intent, not active affiliation or membership.
- An Organization can belong to at most one active Enterprise governance scope.
- Enterprise Team to Organization assignment does not transfer OrganizationOwner authority.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
