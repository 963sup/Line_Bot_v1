# content Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/content |
| semanticOwner | content |
| moduleKind | domain-module |

## Boundary and dependencies

```mermaid
flowchart LR
  content --> platform
  content --> repository
  content --> resources
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

- ./application/use-cases/contract-document-expansion
- ./application/use-cases/plans
- ./composition/bootstrap/plan-references
- ./composition/bootstrap/plans
- ./composition/bootstrap/wbs-expansion
- ./contracts/output/plan-references
- ./contracts/output/wbs-expansion
- ./domain/error
- ./domain/plan-reference
- ./domain/quantity

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/content.json)

