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

## Hexagonal placement

```mermaid
flowchart TD
Domain[Domain] --> Application[Application]
Application --> Contracts[Contracts / Ports]
Composition[Composition] --> Application
Adapters[Adapters] --> Contracts
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

