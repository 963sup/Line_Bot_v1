# line Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

## Context Card

| Field | Value |
| --- | --- |
| Owner | line-integration |
| Module | @line_bot_v1/line |
| Kind | integration-adapter |

## Implementation Status

| Area | Status |
| --- | --- |
| domain | not-applicable |
| application | not-applicable |
| contracts | not-applicable |
| adapters | required-but-missing |
| composition | not-applicable |
| test | present |

## Context Boundary

```mermaid
flowchart LR
  Owner[line-integration Owner] --> Module[line module]
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
  line --> none
```

## Key Invariants

- This module does not acquire another Owner's business authority.
- Boundary errors remain explicit and evidence-backed.

## Public Surface

- ./identity
- ./liff
- ./messaging-api
- ./mini-app
- ./provider
- ./rich-menu

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/line.json)

