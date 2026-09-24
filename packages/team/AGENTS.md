# @line-work/team

- Owns Organization Team lifecycle and TeamMembership; a Team has immutable Organization scope and is not an Enterprise Team alias.
- Membership identifies participation; TeamMaintainer/owner authority comes from Identity/Access RoleAssignment and is not implied by membership or UI.
- Preserve member qualification, scope isolation, last-effective-manager/owner protection, expected version, replay and audit semantics; Repository access / Issue responsibility are owned by `@line-work/repository`.
- Nested Organization Teams are not current capability; do not introduce hierarchy or recursive inheritance without an explicit owner contract and tests.
- Team slug/name are locators and display state inside immutable Organization scope; changing them must not re-scope membership, RoleAssignment, Repository access or Enterprise Team assignment.
- Cross-owner mutations that touch membership and RoleAssignment must preserve the existing transaction/lock ordering and last-effective-maintainer invariant; do not split them into independent writes for convenience.
