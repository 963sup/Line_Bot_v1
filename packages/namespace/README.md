# Namespace package

Routing and module overview for `@line_bot_v1/namespace`.

- Semantic Owner: `namespace`
- Authority document: [`docs/owners/namespace.md`](../../docs/owners/namespace.md)
- Machine boundaries: [`architecture/implementation-topology.json`](../../architecture/implementation-topology.json)
- Persistence mapping: [`architecture/data-topology.json`](../../architecture/data-topology.json)

## Scope

Typed global and scoped business-name binding, occupancy, alias/release policy, normalization profiles,
and URL locator contracts. Resource lifecycle and authorization stay with the consuming Owner; the
PostgreSQL adapter uses the caller's transaction.
