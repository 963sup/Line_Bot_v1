# intelligence Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/intelligence |
| semanticOwner | intelligence |
| moduleKind | application-module |

## Owner boundary

```mermaid
flowchart LR
  Owner[intelligence Owner] --> Module[intelligence module]
  Module --> Consumer[Real consumer]
  Module --> Evidence[Source / tests / schema]
```

## Ubiquitous language

| Term | Meaning |
| --- | --- |
| Owner | intelligence |
| Module kind | application-module |
| Package role | implementation module mapped through registry topology |

## Dependencies

```mermaid
flowchart LR
  intelligence --> file
  intelligence --> integration-openai
  intelligence --> platform
  intelligence --> repository
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

