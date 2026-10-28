# asset Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/asset |
| semanticOwner | asset |
| moduleKind | domain-module |

## Boundary and dependencies

```mermaid
flowchart LR
  asset --> platform
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

- ./application/queries/asset-definition
- ./composition/bootstrap/postgres-asset-definition-query
- ./domain/entities/asset-definition
- ./domain/value-objects/asset-code

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/asset.json)

