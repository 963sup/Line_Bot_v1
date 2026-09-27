# @line-work/team

Owner: Organization Team lifecycle and TeamMembership. Canonical semantics: [Team](../../docs/owners/team.md).

- Team membership is participation, not authorization; TeamMaintainer authority is Identity/Access RoleAssignment.
- Preserve Organization scope, qualification, last-effective-maintainer protection, expected version, replay, and transaction/lock ordering.
- Nested Organization Teams are not current capability; Enterprise Team is a different owner/model.
- Team locator changes must not re-scope membership, RoleAssignment, Repository access, or Enterprise Team assignment.
