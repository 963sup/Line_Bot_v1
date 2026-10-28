# attendance Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/attendance |
| semanticOwner | attendance |
| moduleKind | domain-module |

## Boundary and dependencies

```mermaid
flowchart LR
  attendance --> account
  attendance --> asset
  attendance --> ledger
  attendance --> platform
  attendance --> repository
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

- ./application/clock
- ./application/maintenance
- ./application/supplements
- ./composition/bootstrap/postgres-attendance-store
- ./contracts/clock
- ./contracts/dto/attendance-client
- ./contracts/dto/attendance-presentation
- ./contracts/dto/attendance-supplement
- ./contracts/input/attendance-command
- ./contracts/input/attendance-supplement
- ./contracts/supplements
- ./domain/error
- ./domain/policies/attendance-view
- ./domain/value-objects/attendance-action
- ./domain/value-objects/location

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/attendance.json)

