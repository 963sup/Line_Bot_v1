# explore Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/explore |
| semanticOwner | repository |
| moduleKind | application-module |

## Boundary and dependencies

```mermaid
flowchart LR
  explore --> repository
```

## Application boundary

```mermaid
flowchart TD
  Consumer[Consumer] --> Application[Application orchestration]
  Application --> Ports[Ports / contracts]
  Application --> Dependencies[Owner dependencies]
```

## Public surface

- ./application/queries/repository-discovery

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/explore.json)

