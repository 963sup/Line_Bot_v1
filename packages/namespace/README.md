# Namespace package

Routing and module overview for `@line_bot_v1/namespace`.

- Semantic Owner: `namespace`
- Authority document: [`docs/reference/domains/namespace.md`](../../docs/reference/domains/namespace.md)
- Machine boundaries: [`architecture/registry.json#modules`](../../architecture/registry.json#modules)
- Persistence mapping: [`architecture/registry.json#data`](../../architecture/registry.json#data)

## Scope

Typed global and scoped business-name binding, occupancy, alias/release policy, normalization profiles,
and URL locator contracts. Resource lifecycle and authorization stay with the consuming Owner; the
PostgreSQL adapter uses the caller's transaction.
