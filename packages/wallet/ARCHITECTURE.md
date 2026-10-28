# wallet Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/wallet |
| semanticOwner | wallet |
| moduleKind | domain-module |

## Boundary and dependencies

```mermaid
flowchart LR
  wallet --> account
  wallet --> asset
  wallet --> ledger
  wallet --> platform
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

- ./contracts/repositories/wallet-repository
- ./domain/value-objects/wallet-balance
- ./postgres

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/wallet.json)

