# namespace Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

## Context Card

| Field | Value |
| --- | --- |
| Owner | namespace |
| Module | @line_bot_v1/namespace |
| Kind | domain-module |

## Context Boundary

```mermaid
flowchart LR
  Owner[namespace Owner] --> Module[namespace module]
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
  namespace --> platform
```

## Key Invariants

- Domain invariants remain owned here.
- Authorization, isolation, replay, and version rules fail closed.

## Public Surface

- .
- ./postgres

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/namespace.json)

