# integration-vercel Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/integration-vercel |
| semanticOwner | vercel-integration |
| moduleKind | integration-adapter |

## Boundary and dependencies

```mermaid
flowchart LR
  integration-vercel --> intelligence
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

- ./agents/purchase-order
- ./gateway
- ./gateway-config

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/integration-vercel.json)

