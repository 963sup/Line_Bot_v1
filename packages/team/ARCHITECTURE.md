# team Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/team |
| semanticOwner | team |
| moduleKind | domain-module |

## Owner boundary

```mermaid
flowchart LR
  Owner[team Owner] --> Module[team module]
  Module --> Consumer[Real consumer]
  Module --> Evidence[Source / tests / schema]
```

## Ubiquitous language

| Term | Meaning |
| --- | --- |
| Owner | team |
| Module kind | domain-module |
| Package role | implementation module mapped through registry topology |

## Dependencies

```mermaid
flowchart LR
  team --> account
  team --> identity-access
  team --> namespace
  team --> organization
  team --> platform
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

## Invariants

- Domain invariants remain in this Owner.
- Authorization, isolation, replay, and expected-version rules fail closed.

## State and data flow

```mermaid
flowchart LR
  Input[Input / command] --> UseCase[Use case]
  UseCase --> Result[Result / state]
  Result --> Persistence[Persistence / evidence]
```

## Public functions

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

