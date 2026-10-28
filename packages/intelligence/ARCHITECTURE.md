# intelligence Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

## Context Card

| Field | Value |
| --- | --- |
| Owner | intelligence |
| Module | @line_bot_v1/intelligence |
| Kind | application-module |

## Implementation Status

| Area | Status |
| --- | --- |
| domain | present |
| application | present |
| contracts | present |
| adapters | present |
| composition | present |
| test | present |

## Context Boundary

```mermaid
flowchart LR
  Owner[intelligence Owner] --> Module[intelligence module]
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
  intelligence --> file
  intelligence --> integration-openai
  intelligence --> platform
  intelligence --> repository
```

## Key Invariants

- This module does not acquire another Owner's business authority.
- Boundary errors remain explicit and evidence-backed.

## Public Surface

- ./composition/bootstrap/commercial-intake
- ./composition/bootstrap/document-intake
- ./contracts/output/commercial-intake
- ./contracts/output/document-intake
- ./contracts/output/processing
- ./domain/error

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/intelligence.json)

