# organization Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/organization |
| semanticOwner | organization |
| moduleKind | domain-module |

## Boundary and dependencies

```mermaid
flowchart LR
  organization --> account
  organization --> identity-access
  organization --> namespace
  organization --> platform
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

- ./application/commands/organization-lifecycle
- ./application/organization-governance
- ./application/public
- ./composition/bootstrap/organization-governance
- ./contracts/input/organization-governance
- ./contracts/organization-governance
- ./contracts/output/public
- ./domain
- ./postgres
- ./postgres/public

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/organization.json)

