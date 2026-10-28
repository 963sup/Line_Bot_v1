# project Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

## Context Card

| Field | Value |
| --- | --- |
| Owner | project |
| Module | @line_bot_v1/project |
| Kind | domain-module |

## Context Boundary

```mermaid
flowchart LR
  Owner[project Owner] --> Module[project module]
  Module --> Consumer[Real consumer]
  Module --> Evidence[Source / tests / schema]
```

## Domain Model

```mermaid
flowchart TD
  Aggregate[Aggregate Root] --> Entity[Entities]
  Aggregate --> ValueObject[Value Objects]
  Aggregate --> Invariant[Business invariants]
```

## Boundary and Dependencies

```mermaid
flowchart LR
  Consumer[Consumer] --> Application[Application]
  Application --> Domain[Domain]
  Application --> Ports[Ports]
  Composition[Composition] --> Adapters[Adapters]
  Adapters --> Ports
  project --> account
  project --> issue
  project --> namespace
  project --> numbering
  project --> organization
  project --> platform
  project --> repository
  project --> team
```

## Key Invariants

- Domain invariants remain owned here.
- Authorization, isolation, replay, and version rules fail closed.

## Public Surface

- ./application/management
- ./application/progress
- ./application/queries/project-collection
- ./composition/bootstrap/postgres-project-collection-store
- ./composition/bootstrap/postgres-project-management-store
- ./composition/bootstrap/project-content-scope
- ./composition/bootstrap/repository-imports
- ./contracts/dto/project-collection
- ./contracts/management
- ./contracts/output/content-scope
- ./domain

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/project.json)

