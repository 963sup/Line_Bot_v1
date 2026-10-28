# intelligence Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/intelligence |
| semanticOwner | intelligence |
| moduleKind | application-module |

## Boundary and dependencies

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

## Public surface

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

