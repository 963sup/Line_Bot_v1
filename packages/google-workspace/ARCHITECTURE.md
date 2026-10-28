# google-workspace Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

## Context Card

| Field | Value |
| --- | --- |
| Owner | google-workspace |
| Module | @line_bot_v1/google-workspace |
| Kind | integration-adapter |

## Context Boundary

```mermaid
flowchart LR
  Owner[google-workspace Owner] --> Module[google-workspace module]
  Module --> Consumer[Real consumer]
  Module --> Evidence[Source / tests / schema]
```

## Domain Model

```mermaid
flowchart TD
  Application[Application boundary] --> Port[Public port / DTO]
  Port --> Boundary[External boundary]
```

## Boundary and Dependencies

```mermaid
flowchart LR
  Application[Owner application] --> Port[Port / DTO]
  Port --> Adapter[Integration adapter]
  Adapter --> Provider[External provider]
  google-workspace --> none
```

## Key Invariants

- This module does not acquire another Owner's business authority.
- Boundary errors remain explicit and evidence-backed.

## Public Surface

- ./calendar
- ./docs
- ./drive
- ./forms
- ./gmail
- ./keep
- ./maps
- ./sheets
- ./tasks

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/google-workspace.json)

