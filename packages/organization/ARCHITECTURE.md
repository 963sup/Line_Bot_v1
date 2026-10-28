# organization Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

## Context Card

| Field | Value |
| --- | --- |
| Owner | organization |
| Module | @line_bot_v1/organization |
| Kind | domain-module |

## Implementation Status

| Area | Status |
| --- | --- |
| domain | required-but-missing |
| application | present |
| contracts | present |
| adapters | present |
| composition | present |
| test | present |

## Context Boundary

```mermaid
flowchart LR
  Owner[organization Owner] --> Module[organization module]
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
  organization --> account
  organization --> identity-access
  organization --> namespace
  organization --> platform
```

## Key Invariants

- Domain invariants remain owned here.
- Authorization, isolation, replay, and version rules fail closed.

## Public Surface

- ./application/commands/organization-lifecycle
- ./application/organization-governance
- ./application/public
- ./composition/bootstrap/organization-governance
- ./contracts/input/organization-governance
- ./contracts/organization-governance
- ./contracts/output/public
- ./domain
- ./postgres
- ./postgres/public

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/organization.json)

