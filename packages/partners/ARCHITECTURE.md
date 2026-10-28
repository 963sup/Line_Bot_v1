# partners Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

## Context Card

| Field | Value |
| --- | --- |
| Owner | partner-directory |
| Module | @line_bot_v1/partners |
| Kind | domain-module |

## Context Boundary

```mermaid
flowchart LR
  Owner[partner-directory Owner] --> Module[partners module]
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
  partners --> account
  partners --> platform
```

## Key Invariants

- Domain invariants remain owned here.
- Authorization, isolation, replay, and version rules fail closed.

## Public Surface

- ./application/commands/partner-command
- ./application/partners
- ./contracts
- ./contracts/repositories/partners
- ./domain
- ./postgres

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/partners.json)

