# expense Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

## Context Card

| Field | Value |
| --- | --- |
| Owner | expense |
| Module | @line_bot_v1/expense |
| Kind | domain-module |

## Context Boundary

```mermaid
flowchart LR
  Owner[expense Owner] --> Module[expense module]
  Module --> Consumer[Real consumer]
  Module --> Evidence[Source / tests / schema]
```

## Domain Model

```mermaid
flowchart TD
  Aggregate[Aggregate Root] --> Entity[Entities]
  Aggregate --> ValueObject[Value Objects]
  Aggregate --> Invariant[Business invariants]
```

## Boundary and Dependencies

```mermaid
flowchart LR
  Consumer[Consumer] --> Application[Application]
  Application --> Domain[Domain]
  Application --> Ports[Ports]
  Composition[Composition] --> Adapters[Adapters]
  Adapters --> Ports
  expense --> account
  expense --> platform
```

## Key Invariants

- Domain invariants remain owned here.
- Authorization, isolation, replay, and version rules fail closed.

## Public Surface

- ./application/command-expense
- ./application/get-expense
- ./application/receipt-intake
- ./application/recognize-receipt
- ./composition/bootstrap/postgres-expense-store
- ./composition/bootstrap/receipt-recognizer
- ./contracts/dto/expense-api-view
- ./contracts/dto/expense-failure
- ./domain/aggregates/expense

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/expense.json)

