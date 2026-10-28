# workforce Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

## Context Card

| Field | Value |
| --- | --- |
| Owner | workforce |
| Module | @line_bot_v1/workforce |
| Kind | domain-module |

## Context Boundary

```mermaid
flowchart LR
  Owner[workforce Owner] --> Module[workforce module]
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
  workforce --> none
```

## Key Invariants

- Domain invariants remain owned here.
- Authorization, isolation, replay, and version rules fail closed.

## Public Surface

- No public exports declared.

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/workforce.json)

