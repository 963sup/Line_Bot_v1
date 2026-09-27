# @line_bot_v1/namespace

```text
src/
├─ domain/
├─ application/
├─ contracts/
├─ adapters/
└─ index.ts
```

Namespace owns the shared User/Organization login lifecycle in the existing `account_logins` store. Claims and renames run inside the caller's transaction; account identity and authorization remain with their owners.

- Global Account namespace domain: [src/domain/namespace.ts](src/domain/namespace.ts).
- Claim/resolve/rename contract: [src/contracts/namespace.ts](src/contracts/namespace.ts), implemented by [application](src/application).
- Transaction-bound PostgreSQL adapter: [src/adapters/postgres.ts](src/adapters/postgres.ts).
- Root collision policy: [src/domain/root.ts](src/domain/root.ts).
- Structured namespace contract and typed active-path construction: [src/domain/routes.ts](src/domain/routes.ts).
- Browser-safe public surface: claim, rename, resolve, normalization, `NamespaceError`, and canonical path construction via [src/index.ts](src/index.ts).
- Contract / route evidence tests: [test/routes.test.ts](test/routes.test.ts).
- Remaining business activation decisions: [namespace topology](../../docs/change/decisions/namespace-route-topology.md).
- Owner contract: [namespace](../../docs/owners/namespace.md)
- Local constraints: [AGENTS.md](AGENTS.md)
- Public surface: [package.json](package.json)
- Parent package rules: [../AGENTS.md](../AGENTS.md)
