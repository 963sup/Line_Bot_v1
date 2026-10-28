# resources Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/resources |
| semanticOwner | resources |
| moduleKind | domain-module |

## Boundary and dependencies

```mermaid
flowchart LR
  resources --> platform
  resources --> repository
```

## Domain boundary

```mermaid
flowchart TD
  Domain[Domain invariants] --> Application[Application use cases]
  Application --> Ports[Contracts / ports]
  Composition[Composition] --> Application
  Adapters[Adapters] --> Ports
  Composition --> Adapters
```

## Public surface

- ./application/use-cases/resources
- ./composition/bootstrap/resource-references
- ./composition/bootstrap/resources
- ./contracts/dto/resources
- ./contracts/output/resource-references
- ./domain/resource-error
- ./domain/resource-reference

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/resources.json)

