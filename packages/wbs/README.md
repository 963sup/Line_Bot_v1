# WBS

Project-scoped work breakdown content and governance. Project supplies current access/lifecycle; WBS retains document, immutable Revision, governance and Baseline authority. Repository-scoped entries remain during R1 only for verified one-way transfer. A request captures an immutable source snapshot and preflights the empty destination and dependent state; Release execution rechecks them. The current source User owner may exactly replay withdrawal of a stranded `REQUESTED` intent into immutable `CANCELLED` evidence and replan, without target Project authority. `ACTIVE` remains irreversible. See [owner contract](../../docs/owners/wbs.md), [semantic model](../../architecture/semantic-model.json), [implementation topology](../../architecture/implementation-topology.json) and [data topology](../../architecture/data-topology.json).

For the current document flow **File → Intelligence → Contract → Content → WBS**, WBS consumes
only one exact Content revision through Content's public reader. It deterministically creates a
Project-scoped draft with source coverage and never reads Contract rows directly or publishes a
Baseline implicitly.

## Source responsibilities

```text
src/
  domain/                         content and scope-governance state transitions
    policies/                     scope access and reviewer policy
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

Domain owns legal content/proposal/policy/review/Baseline transitions. Project-scoped Application invokes those decisions through `project-*` contracts inside the transaction callback. Persistence owns the transaction, Project public scope lookup, immutable inserts, conditional head updates and exact-replay storage. A failed decision or save rolls back the whole callback. Domain and Application do not import PostgreSQL or concrete adapters.

Public consumers use the explicit role paths in `package.json#exports`; Project-scoped files carry the `project-` prefix in the same role directories. There are no root-level forwarding files or compatibility exports. The host remains the HTTP inbound adapter; WBS does not duplicate it.
