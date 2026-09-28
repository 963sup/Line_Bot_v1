# Project

Owner: cross-Repository planning, WBS, Project Milestones, and references to Repository work. Canonical semantics: [Project](../../docs/owners/project.md).

- Project owner is Account: `USER | ORGANIZATION`; Project ≠ WBS and Project Items never copy Repository work truth.
- Authorized collection read is active. Personal Projects require the owner User; Organization Projects currently require current `OrganizationOwner`. Do not derive Project access from Organization membership or Repository access.
- Planning writes remain inactive. Do not add create/update/WBS/Item/Milestone mutation until expected version, replay identity, Repository reference authorization, and consistency boundaries are defined.
- Cross-owner dependencies use only public exports; owner login is a locator, never permission.
