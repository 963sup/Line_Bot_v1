# @line-work/identity-access

- Owns Principal resolution policy, typed EnterpriseOwner/OrganizationOwner/TeamMaintainer RoleAssignment, feature permission grants/administration and authorization decisions.
- Identity proof, Account qualification, Organization/Team membership and resource scope are inputs, not authorization authority; consume them through owner contracts or explicit derived projections.
- Other contexts never write Identity/Access authoritative relations directly. Conversely Identity/Access does not take ownership of membership or User lifecycle merely because it evaluates them.
- Every protected transition rechecks current qualification, scope, role/permission version and replay identity; fail closed when authority cannot be established.
- RoleAssignment and feature permission grants are separate contracts. Do not collapse `users.*`, TeamMaintainer, EnterpriseOwner, OrganizationOwner or feature-specific grants into a generic role string that hides scope and version requirements.
- Receipts and audit-style evidence prove what decision was made; they are not reusable permission tokens. A later command must recompute effective authority from current owner inputs.
