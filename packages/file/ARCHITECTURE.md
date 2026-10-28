# file Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/file |
| semanticOwner | file |
| moduleKind | domain-module |

## Boundary and dependencies

```mermaid
flowchart LR
  file --> integration-supabase
  file --> namespace
  file --> platform
  file --> repository
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

- ./application/use-cases/files
- ./application/use-cases/reclaim
- ./composition/bootstrap/files
- ./contracts/output/references
- ./domain/error
- ./domain/file

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/file.json)

