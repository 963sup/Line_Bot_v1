# assistant Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/assistant |
| semanticOwner | assistant |
| moduleKind | application-module |

## Owner boundary

```mermaid
flowchart LR
  Owner[assistant Owner] --> Module[assistant module]
  Module --> Consumer[Real consumer]
  Module --> Evidence[Source / tests / schema]
```

## Ubiquitous language

| Term | Meaning |
| --- | --- |
| Owner | assistant |
| Module kind | application-module |
| Package role | implementation module mapped through registry topology |

## Dependencies

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

## Invariants

- Orchestration does not acquire another Owner's business authority.
- Public contracts and evidence remain the compatibility boundary.

## State and data flow

```mermaid
flowchart LR
  Input[Input / command] --> UseCase[Use case]
  UseCase --> Result[Result / state]
  Result --> Persistence[Persistence / evidence]
```

## Public functions

- ./agents/intake
- ./application/answer-question

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/assistant.json)

