# account Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/account |
| semanticOwner | account |
| moduleKind | domain-module |

## Owner boundary

```mermaid
flowchart LR
  Owner[account Owner] --> Module[account module]
  Module --> Consumer[Real consumer]
  Module --> Evidence[Source / tests / schema]
```

## Ubiquitous language

| Term | Meaning |
| --- | --- |
| Owner | account |
| Module kind | domain-module |
| Package role | implementation module mapped through registry topology |

## Dependencies

```mermaid
flowchart LR
  account --> namespace
  account --> platform
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

- ./application/achievements
- ./application/follows
- ./application/manage-users
- ./application/profile
- ./application/user
- ./application/user-profile-status
- ./contracts/dto/user-profile-status
- ./contracts/output/achievements
- ./contracts/output/follows
- ./contracts/output/identity-provider
- ./contracts/repositories/profile
- ./contracts/repositories/user-profile-status
- ./contracts/user-management
- ./domain
- ./domain/user
- ./postgres
- ./supabase-identity

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/account.json)

