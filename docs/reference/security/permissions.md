# Feature permissions

This page owns the implemented cross-module permission catalog and mutation contract. Module business roles (TeamMaintainer, OrganizationOwner, Repository access, Project membership, etc.) remain with their domain owners; they are not global permissions.

## Authority

Identity/Access owns the catalog and authorization calculation:

- Domain: `packages/identity-access/src/domain/permission.ts`
- Command: `packages/identity-access/src/application/commands/permission.ts`
- Public entries: `@line_bot_v1/identity-access/domain/permission`, `@line_bot_v1/identity-access/application/permissions`
- Grant sources: `permission_grants`, `permission_administrators`

Identity/Access does not write EnterpriseOwner, OrganizationOwner, TeamMaintainer, or generic role assignments; those relation facts belong to their business owners. FPT `OrganizationMemberRole.ADMIN|MEMBER`, scoped `viewerCan*` capabilities, Repository permissions, and Project access are not this global catalog.

## Current catalog

| Permission | Meaning |
|---|---|
| `users.read` | user management query |
| `users.suspend` | suspend/restore user |
| `partners.manage` | manage partners |
| `partners.review` | review referrals |

`members.read`, `members.suspend`, and `workplaces.manage` are retired runtime permissions; legacy values are retained only as data/history and are not accepted for runtime reads/writes. An undeclared capability does not become a permission because a page, menu, or target document exists.

## Grant and mutation rules

- Effective grants bind to current User status version; status changes do not revive old grants.
- A permission mutation contains `requestId`, target `userId`, permission, enable/disable, `expectedVersion`, and required reason.
- Mutation preserves version conflict, replay protection, and reason; public identity is `userId`, not `memberId`.
- Permission administrators cannot change their own business permissions through this flow.
- `users.read` does not include `users.suspend`; `partners.manage` and `partners.review` remain separate.
- UI visibility, client role, URL, provider session, and previous capability results never authorize an API request.

## Request boundary

Every protected operation independently evaluates verified actor identity, current User qualification, required permission/role, data scope, and command state/version. Read, write, administer, and appoint-administrator are separate capabilities. Revocation applies to later operations; old receipts do not restore revoked authority. Keep forbidden, not-found, source failure, and conflict distinct.

See [request authorization](../../rules/request-authorization.md), [scope isolation](data-isolation.md), and [domain owners](../../owners/README.md).
