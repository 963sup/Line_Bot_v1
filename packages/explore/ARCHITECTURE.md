# explore Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

## Context Card

| Field | Value |
| --- | --- |
| Owner | repository |
| Module | @line_bot_v1/explore |
| Kind | application-module |

## Context Boundary

```mermaid
flowchart LR
  Owner[repository Owner] --> Module[explore module]
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
  Consumer[Consumer] --> Application[Application]
  Application --> Ports[Ports / dependencies]
  explore --> repository
```

## Key Invariants

- This module does not acquire another Owner's business authority.
- Boundary errors remain explicit and evidence-backed.

## Public Surface

- ./application/queries/repository-discovery

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/explore.json)

