# integration-vercel Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

## Context Card

| Field | Value |
| --- | --- |
| Owner | vercel-integration |
| Module | @line_bot_v1/integration-vercel |
| Kind | integration-adapter |

## Context Boundary

```mermaid
flowchart LR
  Owner[vercel-integration Owner] --> Module[integration-vercel module]
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
  integration-vercel --> intelligence
```

## Key Invariants

- This module does not acquire another Owner's business authority.
- Boundary errors remain explicit and evidence-backed.

## Public Surface

- ./agents/purchase-order
- ./gateway
- ./gateway-config

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/integration-vercel.json)

