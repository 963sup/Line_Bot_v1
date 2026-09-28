# Audit package

Routing and module overview for `@line_bot_v1/audit`.

- Semantic Owner: `audit`
- Authority document: [`docs/owners/audit.md`](../../docs/owners/audit.md)
- Machine boundaries: [`architecture/implementation-topology.json`](../../architecture/implementation-topology.json)
- Persistence mapping: [`architecture/data-topology.json`](../../architecture/data-topology.json)

## Scope

Read-query entry: `src/application/queries/governance-audit.ts`; authorization and source projection are provided by the Identity/Access public contract. See the owner document for API scope.
