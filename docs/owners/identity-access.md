# Identity & Access

Read this file for authorization-policy ownership. Detailed permission catalog and mutation semantics: [permissions reference](../reference/security/permissions.md).

## Responsibility

Identity & Access owns feature Permission definitions/grants/administration and authorization decisions that are not owned by a business lifecycle. EnterpriseOwner, OrganizationOwner, and TeamMaintainer relationship facts are owned by Enterprise, Organization, and Team respectively; Identity/Access consumes them only to evaluate current authorization.

It does not own User identity proof/lifecycle, OrganizationMembership, Employment, Team membership, or the business state being protected.

## Invariants

- Authentication proof ≠ qualification ≠ membership/employment ≠ permission/role.
- Read, write, administer and appoint-admin capabilities are distinct.
- Permission/scope decisions use current authority; revoked or stale state cannot be recovered from UI/cache/old receipt.
- Client role/scope/ID is request input only; protected operations re-evaluate server-side.
- RLS/grants are defense in depth, not the policy owner.

Runtime package: `packages/identity-access`.

Feature permission changes use a Contracts-owned input capability and transaction output Port. Application checks current administration before exact replay, then coordinates target/version/dependency decisions owned by Domain. PostgreSQL retains the governance lock, sorted User locks, current qualification facts and atomic grant/version/receipt persistence. The public `PostgresPermissionStore` composition entry assembles these responsibilities and preserves its constructor and prototype methods for existing host consumers.

Domain also owns the last-effective-permission-administrator rule. The public transaction-scoped protection query supplies current User-bound assignment facts to that rule; User restoration alone does not make an old administrator assignment effective again.
