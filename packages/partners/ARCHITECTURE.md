# partners Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/partners |
| semanticOwner | partner-directory |
| moduleKind | domain-module |

## Boundary and dependencies

```mermaid
flowchart LR
  partners --> account
  partners --> platform
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

- ./application/commands/partner-command
- ./application/partners
- ./contracts
- ./contracts/repositories/partners
- ./domain
- ./postgres

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/partners.json)

