# repository Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/repository |
| semanticOwner | repository |
| moduleKind | domain-module |

## Boundary and dependencies

```mermaid
flowchart LR
  repository --> account
  repository --> namespace
  repository --> numbering
  repository --> organization
  repository --> platform
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

- ./application/access
- ./application/address
- ./application/collection
- ./application/creation
- ./application/management
- ./application/public
- ./application/resource-management
- ./application/resources
- ./application/star-lists
- ./application/stars
- ./application/subscription
- ./contracts/discovery
- ./contracts/errors/repository-error
- ./contracts/input/repository-access
- ./contracts/input/repository-creation
- ./contracts/input/repository-management
- ./contracts/input/repository-subscription
- ./contracts/output/collection
- ./contracts/output/public
- ./contracts/output/resource-management
- ./contracts/output/resources
- ./contracts/repositories/address
- ./contracts/repositories/star-lists
- ./contracts/repositories/stars
- ./contracts/selectors
- ./domain/milestone/value-objects/milestone-number
- ./domain/repository/entities/repository
- ./domain/repository/value-objects/repository-capability
- ./domain/repository/value-objects/repository-name
- ./postgres
- ./postgres/access
- ./postgres/access-management
- ./postgres/address
- ./postgres/collection
- ./postgres/content-scope
- ./postgres/creation
- ./postgres/discovery
- ./postgres/explicit-recipient
- ./postgres/management
- ./postgres/public
- ./postgres/resource-management
- ./postgres/resources
- ./postgres/star-lists
- ./postgres/subscription

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/repository.json)

