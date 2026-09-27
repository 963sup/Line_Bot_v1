# Project

Owner: cross-Repository planning, WBS, Project Milestones, and references to Repository work. Canonical semantics: [Project](../../docs/owners/project.md).

- Project ≠ WBS; Project Items reference Repository-owned work and never copy its lifecycle/access truth.
- Project owner is an Account and may be User or Organization. Current `organization_id` persistence / `organizationId` type is known implementation debt, not a Domain invariant; do not build runtime authorization on that restriction.
- Runtime capability remains inactive until the owner model and a real consumer authorization contract are aligned. Keep placeholder layers empty until then; do not add runtime APIs, writers, adapters, aliases, or fallback ownership semantics prematurely.
- Activation must define Project access for User-owned and Organization-owned Projects, expected version, replay identity, and Repository reference integrity.
