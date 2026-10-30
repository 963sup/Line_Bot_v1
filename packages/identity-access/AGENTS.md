# Identity & Access package constraints

Local constraints for `@line_bot_v1/identity-access`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Identity/Access owns feature permission decisions and verified request-actor resolution. EnterpriseOwner and OrganizationOwner lifecycles are owned by Enterprise and Organization and are consumed only through their current scoped authorization contracts. TeamMaintainer lifecycle and Team authorization remain Team/Organization-owned; the current Team consumer uses Identity/Access only for actor resolution. An unused database subject projection does not establish a runtime authorization consumer. Identity/Access does not write any of those business-role lifecycles, and derived affiliations never bypass qualification.
- Subject version is monotonically incremented on permission mutation.
- Permission checks fail closed on inactive user, inactive scope, or missing role.
