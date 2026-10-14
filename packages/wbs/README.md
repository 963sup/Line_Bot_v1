# WBS

Repository-scoped work breakdown content. See [owner contract](../../docs/owners/wbs.md), [semantic model](../../architecture/semantic-model.json), [implementation topology](../../architecture/implementation-topology.json) and [data topology](../../architecture/data-topology.json).

## Source responsibilities

```text
src/
  domain/                         content and scope-governance state transitions
    policies/                     Repository permission and reviewer policy
  application/
    commands/                     strict boundary command parsing
    queries/                      query validation
    use-cases/                    identity, authorization, replay and transaction coordination
  contracts/
    dto/                          HTTP/application exchange models
    repositories/                 technology-independent transactional load/save ports
  adapters/outbound/persistence/   PostgreSQL mapping, locks, predicates and durable receipts
  composition/bootstrap/          explicit adapter construction
```

Domain owns legal content/proposal/policy/review/Baseline transitions. Application invokes those decisions inside the Repository port's transaction callback. Persistence owns the transaction, current Repository qualification/access locks, immutable inserts, conditional head updates and exact-replay storage. A failed decision or save rolls back the whole callback. Domain and Application do not import PostgreSQL or concrete adapters.

Public consumers use the explicit role paths in `package.json#exports`; there are no root-level forwarding files or compatibility exports. The host remains the HTTP inbound adapter; WBS does not duplicate it.
