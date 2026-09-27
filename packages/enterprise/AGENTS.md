# @line_bot_v1/enterprise
Owner: Enterprise lifecycle, direct affiliation, Organization attachment, invitations, Enterprise Teams, memberships, and Team→Organization assignment. Semantics: [Enterprise](../../docs/owners/enterprise.md).

- Enterprise Team ≠ Organization Team; Organization membership/invitation remain Organization authority.
- Identity/Access is the RoleAssignment writer; Enterprise consumes authorization and never duplicates role authority.
- Preserve effective-user qualification, membership-source provenance, expected-version/replay, owner protection, audit, and recovery.
- Legacy Enterprise name/slug recovery is one-time Enterprise-owned behavior for a current EnterpriseOwner; never derive it from provider metadata or Supabase reconciliation.
