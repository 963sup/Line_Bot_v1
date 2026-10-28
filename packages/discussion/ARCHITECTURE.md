# discussion Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/discussion |
| semanticOwner | discussion |
| moduleKind | domain-module |

## Boundary and dependencies

```mermaid
flowchart LR
  discussion --> namespace
  discussion --> numbering
  discussion --> platform
  discussion --> repository
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

- ./application/discussions
- ./application/management
- ./contracts/discussions
- ./contracts/management
- ./domain
- ./postgres
- ./postgres/management

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/discussion.json)

