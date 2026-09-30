# Audit package

Routing and module overview for `@line_bot_v1/audit`.

- Semantic Owner: `audit`
- Authority document: [`docs/owners/audit.md`](../../docs/owners/audit.md)
- Machine boundaries: [`architecture/implementation-topology.json`](../../architecture/implementation-topology.json)
- Persistence mapping: [`architecture/data-topology.json`](../../architecture/data-topology.json)

## Scope

Read use-case entry: [`src/application/use-cases/read-governance-audit.ts`](src/application/use-cases/read-governance-audit.ts); authorization and source projection are provided by the Identity/Access public contract. See the owner document for API scope.

The result and cursor wire contract live in [`src/contracts/dto/governance-audit.ts`](src/contracts/dto/governance-audit.ts). The use case consumes the existing authorized `GovernanceAuditReader`; Audit does not duplicate source events, scope authorization, or persistence ownership.

HTTP parsing, authentication context, response mapping and observability remain in the [API route](../../apps/web/src/app/api/audit/route.ts). Use-case/cursor behavior is covered by [`test/query.test.ts`](test/query.test.ts); the host exercises the actual route in [`audit-api.test.ts`](../../apps/web/test/audit-api.test.ts).
