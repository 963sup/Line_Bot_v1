# assistant Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/assistant |
| semanticOwner | assistant |
| moduleKind | application-module |

## Boundary and dependencies

```mermaid
flowchart LR
  assistant --> none
```

## Application boundary

```mermaid
flowchart TD
  Consumer[Consumer] --> Application[Application orchestration]
  Application --> Ports[Ports / contracts]
  Application --> Dependencies[Owner dependencies]
```

## Public surface

- ./agents/intake
- ./application/answer-question

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/assistant.json)

