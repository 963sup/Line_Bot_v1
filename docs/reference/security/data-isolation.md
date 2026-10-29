# Scope and data isolation

Data Boundary controls access/isolation; it is not automatically a Bounded Context or code module. Authorization uses real scope relationships, never UI, URL, provider group, name similarity, or ID existence alone.

## Current scopes

The repository currently models User/self; Enterprise and Organization governance; Enterprise Team and Organization Team; Attendance user/repository eligibility; Partner directory/review; Announcement audience/publish; Expense owner/stored scope; and Employment/Payroll scopes where their owner contracts define them.

Enterprise Team and Organization Team are different scopes. An Enterprise Team assignment may target only an active Organization attached to the same Enterprise and creates only `enterprise-team` membership provenance. It does not create Organization Team identity, TeamMaintainer, or OrganizationOwner authority.

## Rules

- LINE `groupId` is not TeamMembership or OrganizationMembership.
- TeamMaintainer is scoped to one Organization Team; it is not a global administrator.
- Active User is not automatic access to an Organization, Team, Workplace, Project, or Employment.
- External identity must map to internal identity, then pass current participation, permission, and scope checks.
- Cross-scope checks validate both ends belong to the same legal relationship; existence of either ID is insufficient.
- Read, write, audit/history, and administration capabilities are separate.
- Enterprise Team assignment validates Enterprise, Team, and Organization relationships; it never infers authority from a name or one foreign key.

## Relationship and revocation

EnterpriseOwner, OrganizationMembership, Employment, Organization TeamMembership, TeamMaintainer, Enterprise Team, EnterpriseTeamMembership, Payroll/HR administrator, and feature permissions are distinct relationships. IDs locate scope; they do not grant access.

After revocation of User qualification, permission, participation, assignment, or scoped role, the next protected operation rechecks current authority. Old receipts are not permanent permission. Direct and Enterprise-Team-derived membership sources may coexist: removing one source removes only that source; effective membership is removed only when no active source remains.

## Database boundary

Private tables are accessed through restricted server/runtime roles. RLS/grants and application authorization are complementary. `organization_membership_sources` is a security-invoker projection, not a write authority; direct membership and Enterprise Team relations remain authoritative.

See [authentication](authentication.md), [permissions](permissions.md), [domain owners](../../owners/README.md), and the relevant Enterprise/Organization/Team/Workforce contracts.
