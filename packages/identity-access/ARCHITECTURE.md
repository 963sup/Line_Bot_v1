# identity-access Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/identity-access |
| semanticOwner | identity-access |
| moduleKind | domain-module |

## Owner boundary

```mermaid
flowchart LR
  Owner[identity-access Owner] --> Module[identity-access module]
  Module --> Consumer[Real consumer]
  Module --> Evidence[Source / tests / schema]
```

## Ubiquitous language

| Term | Meaning |
| --- | --- |
| Owner | identity-access |
| Module kind | domain-module |
| Package role | implementation module mapped through registry topology |

## Dependencies

```mermaid
flowchart LR
  identity-access --> account
  identity-access --> platform
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

- ./application/permissions
- ./contracts/audit
- ./contracts/governance
- ./contracts/permissions
- ./domain/permission
- ./domain/role-assignment
- ./postgres
- ./postgres/audit

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/identity-access.json)

