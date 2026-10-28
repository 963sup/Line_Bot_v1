# contract Owner Architecture

<!-- Generated from package.json and architecture/modules/*.json. -->

| Field | Value |
| --- | --- |
| Package module | @line_bot_v1/contract |
| semanticOwner | contract |
| moduleKind | domain-module |

## Boundary and dependencies

```mermaid
flowchart LR
  contract --> content
  contract --> file
  contract --> platform
  contract --> repository
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

- ./application/normalization/commercial-document
- ./application/use-cases/commercial-document-review
- ./application/use-cases/contracts
- ./composition/bootstrap/commercial-documents
- ./composition/bootstrap/contracts
- ./composition/bootstrap/documents
- ./composition/bootstrap/references
- ./contracts/input/document-intake
- ./contracts/output/commercial-document-review
- ./contracts/output/commercial-documents
- ./contracts/output/references
- ./domain/error
- ./domain/line-reference

## Evidence

- [Manifest](./package.json)
- [Source](./src/)
- [Tests](./test/)
- [Module topology](../../architecture/modules/contract.json)

