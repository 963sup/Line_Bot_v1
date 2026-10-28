# actions Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/actions |
| semanticOwner | actions |
| moduleKind | domain-module |

## Boundary and dependencies

```mermaid
flowchart LR
  actions --> account
  actions --> notifications
  actions --> platform
  actions --> project
  actions --> repository
  actions --> wbs
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

- ./application/use-cases/automation
- ./application/use-cases/project-automation
- ./application/use-cases/project-worker
- ./application/use-cases/worker
- ./composition/bootstrap/automation
- ./composition/bootstrap/project-automation
- ./composition/bootstrap/transfer-facts
- ./contracts/dto/automation
- ./contracts/dto/project-automation
- ./contracts/output/fixed-steps
- ./contracts/output/project-fixed-steps
- ./contracts/repositories/automation
- ./contracts/repositories/project-automation

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/actions.json)

