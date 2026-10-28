# integration-supabase Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

## Context Card

| Field | Value |
| --- | --- |
| Owner | supabase-integration |
| Module | @line_bot_v1/integration-supabase |
| Kind | integration-adapter |

## Context Boundary

```mermaid
flowchart LR
  Owner[supabase-integration Owner] --> Module[integration-supabase module]
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
  integration-supabase --> none
```

## Key Invariants

- This module does not acquire another Owner's business authority.
- Boundary errors remain explicit and evidence-backed.

## Public Surface

- ./storage-client

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/integration-supabase.json)

