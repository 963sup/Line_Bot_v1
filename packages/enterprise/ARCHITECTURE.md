# enterprise Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/enterprise |
| semanticOwner | enterprise |
| moduleKind | domain-module |

## Boundary and dependencies

```mermaid
flowchart LR
  enterprise --> account
  enterprise --> identity-access
  enterprise --> namespace
  enterprise --> organization
  enterprise --> platform
  enterprise --> repository
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

- ./application/commands/enterprise-lifecycle
- ./application/enterprise-governance
- ./composition/bootstrap/enterprise-governance
- ./contracts/enterprise-governance
- ./contracts/input/enterprise-governance
- ./domain

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/enterprise.json)

