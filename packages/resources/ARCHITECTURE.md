# resources Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

## Context Card

| Field | Value |
| --- | --- |
| Owner | resources |
| Module | @line_bot_v1/resources |
| Kind | domain-module |

## Context Boundary

```mermaid
flowchart LR
  Owner[resources Owner] --> Module[resources module]
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
  resources --> platform
  resources --> repository
```

## Key Invariants

- Domain invariants remain owned here.
- Authorization, isolation, replay, and version rules fail closed.

## Public Surface

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

