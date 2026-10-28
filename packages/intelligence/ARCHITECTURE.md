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

## Hexagonal placement

```mermaid
flowchart TD
Domain[Domain] --> Application[Application]
Application --> Contracts[Contracts / Ports]
Composition[Composition] --> Application
Adapters[Adapters] --> Contracts
Composition --> Adapters
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

