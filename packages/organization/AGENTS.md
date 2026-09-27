# @line-work/organization

- Owner boundary: Organization owns lifecycle, invitations, direct membership sources and effective membership. Team owns Organization Team state/commands; Identity/Access owns scoped role assignment. Canonical semantics: [Organization](../../docs/owners/organization.md).
- Direct, Enterprise-Team-derived and effective membership are distinct facts; removing one source must not erase another valid source.
- Organization scope is explicit. Membership, UI placement, URL, Enterprise or Team presence must not be treated as authorization.
- Preserve version/replay safety, last-effective-owner protection, audit/receipt, cross-context transaction ordering and RLS/data isolation.
