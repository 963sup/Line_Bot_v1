# audit Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/audit |
| semanticOwner | audit |
| moduleKind | domain-module |

## Boundary and dependencies

```mermaid
flowchart LR
  audit --> identity-access
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

- ./application/use-cases/read-governance-audit

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/audit.json)

