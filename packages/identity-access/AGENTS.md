# Identity & Access package constraints

Local constraints for `@line_bot_v1/identity-access`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Identity/Access owns permission decisions. EnterpriseOwner lifecycle is Enterprise-owned and consumed here as a current governance fact; OrganizationOwner/TeamMaintainer remain current IAM writers until their owner migrations. Derived affiliations never bypass qualification.
- Subject version is monotonically incremented on permission mutation.
- Permission checks fail closed on inactive user, inactive scope, or missing role.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
