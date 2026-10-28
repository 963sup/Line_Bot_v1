# team Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

## Context Card

| Field | Value |
| --- | --- |
| Owner | team |
| Module | @line_bot_v1/team |
| Kind | domain-module |

## Context Boundary

```mermaid
flowchart LR
  Owner[team Owner] --> Module[team module]
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
  team --> account
  team --> identity-access
  team --> namespace
  team --> organization
  team --> platform
```

## Key Invariants

- Domain invariants remain owned here.
- Authorization, isolation, replay, and version rules fail closed.

## Public Surface

- ./application/collaboration
- ./application/commands/team-command
- ./application/commands/team-slug
- ./contracts
- ./contracts/errors/team-error
- ./contracts/input/team-command
- ./postgres
- ./postgres/project-access

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/team.json)

