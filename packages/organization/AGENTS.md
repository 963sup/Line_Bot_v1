# @line-work/organization

- Owns Organization lifecycle, direct/effective membership sources and Organization invitations.
- Organization Team, TeamMembership and Team commands belong to `@line-work/team`; Organization only provides scope/participation authority. TeamMaintainer RoleAssignment belongs to Identity/Access.
- Direct membership, EnterpriseTeam-derived membership and effective membership are distinct facts; removing one source must not remove another source incorrectly.
- Organization scope is explicit and is not inferred from User, Enterprise, Team UI or URL; membership does not become authorization.
- Preserve expected-version/replay, last-effective-owner protection, audit/receipt, cross-context transaction and RLS/data-isolation semantics.
