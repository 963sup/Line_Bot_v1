# @line_bot_v1/identity-access
Owner: scoped roles, permissions, and authorization policy. Semantics: [Identity & Access](../../docs/owners/identity-access.md).

- Identity proof, Account qualification, membership/employment, and resource scope are inputs, not authorization authority.
- Re-evaluate current qualification, scope, role/permission version, and replay identity for every protected transition; fail closed.
- Keep RoleAssignment and feature grants distinct; do not collapse scoped/versioned authority into a generic role string.
- Audit/receipt evidence records a decision but is never a reusable permission token.
