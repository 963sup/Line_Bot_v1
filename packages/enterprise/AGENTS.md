# @line-work/enterprise

- Owns Enterprise lifecycle, direct affiliation, Enterprise↔Organization attachment, Enterprise invitations, Enterprise Teams, EnterpriseTeamMembership and Team→Organization assignment.
- Enterprise Team is not Organization Team. Organization membership/invitation facts remain Organization authority; Enterprise may request Organization-owned changes only through Organization public contracts or an explicit transaction coordinator.
- Identity/Access owns RoleAssignment; Enterprise consumes authorization decisions/contracts and must not become a second role writer.
- Preserve effective-user qualification, membership-source provenance, expected-version/replay, owner protection, audit and recovery semantics.
