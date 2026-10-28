# platform Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/platform |
| semanticOwner | platform |
| moduleKind | support-module |

## Boundary and dependencies

```mermaid
flowchart LR
  platform --> none
```

## Module boundary

```mermaid
flowchart LR
  Consumer[Consumer] --> Module[Module]
  Module --> Dependencies[Dependencies]
```

## Public surface

- ./postgres
- ./redis
- ./testing/postgres
- ./testing/postgres-sessions
- ./text
- ./validation

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/platform.json)

