# Repository architecture

Root DDD and hexagonal architecture map. Each Owner-specific design is in `packages/<Owner>/ARCHITECTURE.md`.

```mermaid
flowchart TB
  Delivery[Apps / Delivery] --> Contracts[Public Contracts]
  Contracts --> Application[Application Use Cases]
  Application --> Domain[DDD Domain]
  Application --> Ports[Outbound Ports]
  Composition[Composition Root] --> Application
  Composition --> Adapters[Adapters]
  Adapters --> Providers[Supabase / OpenAI / Vercel / External Providers]
  Ports --> Adapters
```

```mermaid
flowchart LR
  Owner[Semantic Owner] --> Module[Package Module]
  Module --> Exports[package.json exports]
  Exports --> Consumer[Real Consumer]
  Module --> Evidence[Source / Tests / Schema]
  Registry[architecture/registry.json] --> Owner
  Registry --> Module
```

## Rules

- Domain owns business invariants and state decisions.
- Application coordinates use cases and ports.
- Contracts expose stable DTOs and ports.
- Adapters implement persistence, transport, and provider protocols.
- Composition wires dependencies and contains no business decisions.
- Cross-package imports use public exports only.
- `semanticOwner` comes from `architecture/registry.json`; package name is an implementation path.
- Source, manifests, schemas, tests, and provider readback remain evidence.

## Owner diagrams

Each first-level package has `packages/<Owner>/ARCHITECTURE.md`; resolve `<Owner>` through `architecture/registry.json#modules` and its `semanticOwner`.
