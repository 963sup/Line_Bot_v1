# EME DDD Hexagonal Implementation

## Strategic design vocabulary

| Concept | English | Main purpose |
| --- | --- | --- |
| 領域 | Domain | 定義系統要解決的業務問題與業務語言。 |
| 子領域 | Subdomain | 將業務拆分成不同能力與責任。 |
| 通用語言 | Ubiquitous Language | 讓業務與技術人員使用一致的術語。 |
| 界限上下文 | Bounded Context | 定義領域模型適用的明確邊界。 |
| 上下文映射 | Context Mapping | 定義不同 Bounded Context 之間的合作、依賴與整合關係。 |
| 核心領域 | Core Domain | 找出最具業務競爭優勢、值得優先投資的領域。 |
| 子領域分類 | Core／Supporting／Generic Subdomain | 區分自建競爭力、支援能力與可採購通用能力。 |

DDD Strategic Design 回答「系統應該有哪些業務邊界，以及彼此如何合作？」；DDD Tactical Design 回答「每個邊界內的模型、aggregate、entity、value object、domain service、domain event 與 repository contract 如何表達？」Hexagonal Architecture 回答「如何隔離業務邏輯與資料庫、框架及外部系統？」

## Strategic-to-code mapping

| Strategic concept | Repository location / evidence |
| --- | --- |
| Bounded Context | `architecture/registry.json#domain` context entries and owner contracts |
| Subdomain / Owner | `architecture/domain/owners/*.json`, package owner README and `docs/owners/` |
| Context Map | `architecture/registry.json#modules` dependencies, public exports, cross-owner projections and explicit integration packages |
| Ubiquitous Language | owner contracts, `architecture/domain/vocabulary.json`, package `SEMANTICS.md` |
| Core domain priority | owner capability and implementation status in architecture topology; do not infer priority from folder size |
| External system boundary | `packages/integration-*`, provider adapters and their server-only credentials/readback |

Strategic boundaries are decided before tactical folders. If two concepts use different language, lifecycle, authorization, consistency, or data authority, treat that as evidence for separate context or explicit translation; do not merge them because they share a table, screen, provider, or TypeScript type.

## Inner and outer hexagon

```text
Outer hexagon: delivery / infrastructure / integration adapters
  HTTP, Page, CLI, database, Supabase, OpenAI, Vercel, LINE, Google, Redis
        ↓ translates through ports
Inner hexagon: application + domain core
  use cases, authorization inputs, domain model, invariants, state transitions
        ↑ depends on abstractions, never provider implementations
```

- Inner hexagon: domain decisions and application orchestration. It must remain framework/provider independent and testable with in-memory or injected ports.
- Outer hexagon: inbound delivery adapters, outbound persistence adapters, provider integrations and composition/bootstrap. It translates protocols and wires dependencies; it does not own business truth.
- Ports belong at the boundary of the consumer that needs the capability. Inbound ports expose use cases; outbound ports describe required capabilities. An adapter may implement a port, but the port must not describe an adapter's vendor API.
- Context mapping belongs at explicit contracts: public package exports, DTO translation, projections, events, or integration adapters. Do not pass another context's entity, database row, provider object, or authorization decision directly across the boundary.

Apply DDD and Hexagonal Architecture by responsibility and dependency direction, not by directory symmetry:

- Identify the semantic Owner from `architecture/registry.json` before changing code. One business fact, invariant, authorization decision, and public capability has one authoritative owner.
- Domain owns immutable business concepts, invariants, state transitions, and domain errors. It does not import UI, Next.js, Supabase, OpenAI, Vercel, HTTP, or database implementations.
- Application owns use-case orchestration, transaction/replay decisions, authorization inputs, and port coordination. It calls domain rules and ports; it does not implement provider protocol details.
- Contracts/ports define the smallest stable capability needed by the use case. A port belongs with the consumer that needs the capability; avoid generic service interfaces.
- Adapters implement HTTP, persistence, provider SDK, file/object, clock, and transport protocols. Adapters translate external errors and data into the owning contract; they do not decide business authorization or confirmation.
- Composition/bootstrap wires concrete adapters into application ports. Composition selects dependencies and configuration; it does not make business decisions.
- Pages and route handlers are thin delivery adapters: parse input, call a public application contract, map the result to HTTP/UI, and contain no business writer or duplicate validation authority.
- Integration packages own provider credentials, protocol limits, SDK setup, and provider readback. Domain packages own business meaning and persistence authority; shared infrastructure does not become a business owner.

Use If/Then decisions:

- If an existing Owner and public contract can express the result, extend that contract; do not create a new package or facade.
- If a rule changes business truth or state, place it in the Owner domain and enforce it in the database when it is a concurrency or alternate-path invariant.
- If behavior only translates a provider or transport protocol, place it in an adapter or integration package; do not leak provider types into Domain.
- If a dependency is needed by one use case, define the narrowest port at that consumer boundary; do not add a global manager or generic repository.
- If a file has no independent responsibility or consumer, merge or delete it; do not retain forwarding layers for visual symmetry.
- If a change crosses Owner, public contract, persistence, authorization, or dependency direction, inspect real references and topology before editing and validate every consumer.

Preferred flow:

```text
delivery adapter
→ public application contract
→ application use case
→ domain invariant / state transition
→ consumer-owned ports
→ concrete adapters
→ provider or persistence
```

Validate architecture changes with affected owner tests, typecheck/lint, dependency checks, repository checks, and references/diagnostics. Source, exports, schemas, tests, and architecture topology remain authoritative; this memory only routes implementation decisions.
