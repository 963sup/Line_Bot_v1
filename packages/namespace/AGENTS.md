# @line_bot_v1/namespace
Owner: shared cross-owner Namespace policy for scope, locator reservation, and collision. Semantics: [Namespace](../../docs/owners/namespace.md).

- `@line_bot_v1/namespace/root` / `src/root.ts` is the executable truth for global root reserved keys.
- Locator resolution/reservation never grants identity, qualification, or authorization.
- Owner-local naming stays with its owner; do not centralize validators, slug/number generation, or uniqueness without a real shared collision boundary.
- Do not add registry/cache/table/application layers until a real claim/resolve consistency or technology boundary exists.
- Preserve stable Subject ≠ mutable Locator, scoped uniqueness, and no double-claim in shared namespaces.
