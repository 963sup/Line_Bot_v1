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

## Strategic design sequence

1. Domain Analysis：理解業務問題、核心能力、業務規則與 Domain Vision Statement。
2. Domain Decomposition：識別 business capabilities、Subdomains 與 Core／Supporting／Generic 分類。
3. Model Boundaries：以 Ubiquitous Language、Bounded Context、Context Ownership 與模型所有權界定範圍。
4. Context Integration：建立 Context Map，辨識 upstream/downstream、團隊合作關係與整合模式。
5. Organizational Alignment & Evolution：對齊 Team Topologies、認知負荷、責任分配，持續調整 Context 邊界與系統演進。

Continuous Integration 在模型層表示持續整合模型與程式碼，讓語言、邊界與 executable contract 保持一致；它不是無條件共享所有模型。

## Context Map patterns

| Pattern | Use when | Repository interpretation |
| --- | --- | --- |
| Shared Kernel | 兩個 context 必須共享一小段穩定模型，且可共同治理變更 | 只共享明確 public contract／value vocabulary；先證明共同 ownership 與變更協議。 |
| Customer–Supplier | 下游需求影響上游供應能力 | 明確記錄 consumer contract 與 upstream responsibility；下游不能直接取得上游 private source。 |
| Conformist | 下游成本低於自行轉譯，選擇遵循上游模型 | 只在 provider／外部標準不可控且污染風險可接受時使用。 |
| Anti-Corruption Layer | 外部模型不能污染內部語言、規則或資料邊界 | 使用 adapter／translator／ACL 將 provider DTO、錯誤與 identity 轉成 owner contract。 |
| Separate Ways | 整合成本高於價值，兩個 context 可獨立演進 | 不建立 facade、shared table 或無必要同步；各自保留 owner truth。 |
| Open Host Service | 多個 consumer 需要穩定、標準化的整合介面 | 以 package exports、HTTP contract 或明確 provider protocol 提供受控入口。 |
| Published Language | 跨 context 需要公開、穩定、可解析的交換語言 | 使用 versioned DTO、event schema 或 machine-readable contract，不傳遞 domain entity。 |

## Large-scale structure and core distillation

- Model Integrity：維持模型、語言、程式碼、schema、authorization 與 team ownership 的一致性。
- Distillation：透過 Domain Vision Statement、Highlighted Core、Segregated Core 與 Abstract Core，讓核心模型從 supporting／generic mechanism 中顯明並保持可投資性。
- Large-Scale Structure：以 Responsibility Layers、Knowledge Level、Cohesive Mechanisms 與 Pluggable Component Framework 組織大型模型；只有在存在真實 responsibility boundary 時採用，不為形式建立層。
- Core Domain：聚焦最具競爭優勢的能力；Generic Subdomains 可採用成熟技術，但不能因此移交產品 authorization 或 business truth。
- Evolving Order：架構持續演進；拆分、合併或調整 context 必須由語言、lifecycle、team ownership、consistency、authorization 或 dependency evidence 驅動。
- System Metaphor：只有在能穩定改善共同語言時使用；隱喻不能取代 executable contract 或明確 domain rule。

## Discovery and organizational methods

| Method | Purpose |
| --- | --- |
| Knowledge Crunching / Domain Expert Collaboration | 與領域專家反覆探索、提煉語言、規則與模型。 |
| EventStorming | 由 business events 探索流程、規則、聚合候選與邊界。 |
| Domain Storytelling | 以角色、活動與領域概念描述實際業務故事。 |
| Example Mapping | 用具體 examples、rules、questions 釐清可驗證行為。 |
| Business Capability Mapping | 分析企業能力與投資優先級。 |
| Subdomain Classification | 區分 Core、Supporting、Generic。 |
| Context Boundary Discovery | 從語言、lifecycle、authority、consistency、authorization 與 team responsibility 找出邊界。 |
| Context Ownership | 明確定義誰管理模型、變更 contract 與承擔相容性。 |
| Team Topologies | 將團隊結構、互動模式與認知負荷對齊系統邊界。 |
| Wardley Mapping | 分析能力演進階段與策略投資方向；不直接取代 repository architecture authority。 |

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
