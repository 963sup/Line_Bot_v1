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

## Domain boundary

```mermaid
flowchart TD
  Domain[Domain invariants] --> Application[Application use cases]
  Application --> Ports[Contracts / ports]
  Composition[Composition] --> Application
  Adapters[Adapters] --> Ports
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

