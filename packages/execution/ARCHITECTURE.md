# execution Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/execution |
| semanticOwner | execution |
| moduleKind | domain-module |

## Boundary and dependencies

```mermaid
flowchart LR
  execution --> content
  execution --> contract
  execution --> platform
  execution --> repository
  execution --> resources
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

- ./application/use-cases/executions
- ./application/use-cases/task-dependencies
- ./composition/bootstrap/executions
- ./composition/bootstrap/task-dependencies
- ./contracts/dto/executions
- ./contracts/dto/task-dependencies
- ./domain/error

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/execution.json)

