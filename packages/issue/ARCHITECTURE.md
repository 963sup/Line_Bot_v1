# issue Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/issue |
| semanticOwner | issue |
| moduleKind | domain-module |

## Boundary and dependencies

```mermaid
flowchart LR
  issue --> namespace
  issue --> numbering
  issue --> organization
  issue --> platform
  issue --> repository
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

- ./application/activity
- ./application/collaboration
- ./application/issue-types
- ./application/issues
- ./composition/bootstrap/collaboration
- ./composition/bootstrap/metrics
- ./contracts/activity
- ./contracts/collaboration
- ./contracts/input/issues
- ./contracts/issue-types
- ./contracts/output/metrics
- ./contracts/repositories/issues
- ./domain
- ./postgres
- ./postgres/activity
- ./postgres/issue-types
- ./postgres/project-reference

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/issue.json)

