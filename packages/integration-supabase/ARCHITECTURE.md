# integration-supabase Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/integration-supabase |
| semanticOwner | supabase-integration |
| moduleKind | integration-adapter |

## Owner boundary

```mermaid
flowchart LR
  Owner[supabase-integration Owner] --> Module[integration-supabase module]
  Module --> Consumer[Real consumer]
  Module --> Evidence[Source / tests / schema]
```

## Ubiquitous language

| Term | Meaning |
| --- | --- |
| Owner | supabase-integration |
| Module kind | integration-adapter |
| Package role | implementation module mapped through registry topology |

## Dependencies

```mermaid
flowchart LR
  integration-supabase --> none
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

- ./storage-client

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/integration-supabase.json)

