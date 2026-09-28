# Platform

Read this file for neutral runtime/support ownership.

## Responsibility

`packages/platform` owns mechanisms with no business authority: shared database/runtime primitives, neutral coordination/transport and explicit testing support when multiple owners truly share the same mechanism.

It does not own business adapters merely because they use PostgreSQL/Redis/HTTP, and it does not become a cross-owner service layer.

## Invariants

- Business-specific adapter stays with its semantic owner.
- Platform state cannot become a second business Source of Truth.
- New mechanism requires a real cross-owner consumer or technology/runtime boundary.
- No generic service locator, mega barrel, facade or compatibility layer to hide dependency problems.

Runtime package: `packages/platform`.
