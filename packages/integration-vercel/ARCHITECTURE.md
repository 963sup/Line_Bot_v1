# integration-vercel Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/integration-vercel |
| semanticOwner | vercel-integration |
| moduleKind | integration-adapter |

## Owner boundary

```mermaid
flowchart LR
  Owner[vercel-integration Owner] --> Module[integration-vercel module]
  Module --> Consumer[Real consumer]
  Module --> Evidence[Source / tests / schema]
```

## Ubiquitous language

| Term | Meaning |
| --- | --- |
| Owner | vercel-integration |
| Module kind | integration-adapter |
| Package role | implementation module mapped through registry topology |

## Dependencies

```mermaid
flowchart LR
  integration-vercel --> intelligence
```

## Integration boundary

```mermaid
flowchart LR
  Application[Owner application] --> Port[Port / DTO]
  Port --> Adapter[Integration adapter]
  Adapter --> Provider[External provider]
```

## Invariants

- Provider protocol details remain behind the adapter boundary.
- External errors are normalized without inventing business truth.

## State and data flow

```mermaid
flowchart LR
  Input[Input / command] --> UseCase[Use case]
  UseCase --> Result[Result / state]
  Result --> Persistence[Persistence / evidence]
```

## Public functions

- ./agents/purchase-order
- ./gateway
- ./gateway-config

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/integration-vercel.json)

