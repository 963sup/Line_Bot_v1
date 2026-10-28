# workforce Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/workforce |
| semanticOwner | workforce |
| moduleKind | domain-module |

## Boundary and dependencies

```mermaid
flowchart LR
  workforce --> none
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

- No public exports declared.

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/workforce.json)

