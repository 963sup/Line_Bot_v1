# wiki Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

## Context Card

| Field | Value |
| --- | --- |
| Owner | wiki |
| Module | @line_bot_v1/wiki |
| Kind | domain-module |

## Context Boundary

```mermaid
flowchart LR
  Owner[wiki Owner] --> Module[wiki module]
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
  wiki --> platform
  wiki --> repository
```

## Key Invariants

- Domain invariants remain owned here.
- Authorization, isolation, replay, and version rules fail closed.

## Public Surface

- ./application/commands/pages
- ./application/use-cases/history
- ./application/use-cases/pages
- ./composition/bootstrap/wiki-pages
- ./contracts/dto/wiki
- ./contracts/repositories/wiki-pages
- ./domain/policies/wiki-access
- ./domain/wiki-error

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/wiki.json)

