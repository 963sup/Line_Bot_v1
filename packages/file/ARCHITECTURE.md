# file Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

## Context Card

| Field | Value |
| --- | --- |
| Owner | file |
| Module | @line_bot_v1/file |
| Kind | domain-module |

## Context Boundary

```mermaid
flowchart LR
  Owner[file Owner] --> Module[file module]
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
  file --> integration-supabase
  file --> namespace
  file --> platform
  file --> repository
```

## Key Invariants

- Domain invariants remain owned here.
- Authorization, isolation, replay, and version rules fail closed.

## Public Surface

- ./application/use-cases/files
- ./application/use-cases/reclaim
- ./composition/bootstrap/files
- ./contracts/output/references
- ./domain/error
- ./domain/file

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/file.json)

