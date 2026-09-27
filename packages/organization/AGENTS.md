# @line-work/organization

Owner: Organization lifecycle, invitations, direct membership sources, and effective membership. Canonical semantics: [Organization](../../docs/owners/organization.md).

- Team owns Organization Team state/commands; Identity/Access owns scoped role assignment.
- Direct, Enterprise-Team-derived, and effective membership are distinct facts; removing one source must not erase another valid source.
- Scope is explicit. Membership, UI, URL, Enterprise, or Team presence is not authorization.
- Preserve version/replay safety, last-effective-owner protection, audit/receipt, cross-context transaction ordering, and RLS/data isolation.
