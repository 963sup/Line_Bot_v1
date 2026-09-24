# Strategic to Hexagonal

## Canonical responsibility

本文件只負責 Strategic DDD 到 Hexagonal Architecture 的 **handoff**。Hexagonal layer 的完整 implementation contract 仍由 [Hexagonal architecture](../../020-architecture/020-hexagonal-architecture.md) 擁有。

## Handoff chain

```text
Business Reality
↓
Problem Space
↓
Subdomain
↓
Bounded Context
↓
Ubiquitous Language
↓
Responsibility / Ownership
↓
Context Map
↓
Integration Semantics
↓
Business Invariants
↓
Consistency Boundary
↓
Implementation Mapping
↓
────────────────────────
Hexagonal Architecture
↓
Domain
↓
Application
↓
Port / Contract
↑
Adapter
```

Strategic DDD 回答「為什麼 boundary 存在」；Hexagonal 回答「boundary 裡面的 source dependency 如何保持乾淨」。

## Domain

Domain 擁有不依賴 I/O 的 business truth：

- invariant
- state transition
- value rule
- business validation
- decision logic that remains true without provider / database

Domain 不知道 Supabase、LINE、Redis、HTTP、token 或 UI。

## Application

Application 擁有 use-case orchestration：

- 誰先查
- 呼叫哪個 Domain behavior
- 需要哪些 external capability
- transaction / follow-up boundary
- command / query result semantics

Application 不重新實作 Domain rule，也不把 provider protocol 當 business rule。

## Port / Contract

Port 表達 consumer / Application 真正需要的能力。

```text
Good
QualificationPort
CurrentEmploymentQuery
LedgerPostingPort

Bad
SupabaseService
RedisManager
LineSdkFacade
```

Bad 名稱不是絕對禁止，而是警訊：它們常代表 technology-first abstraction，而不是 capability boundary。

## Adapter

Adapter 負責把 Port 轉成 concrete technology / provider protocol：

```text
Application Port
↑
PostgreSQL / Supabase Adapter
LINE Adapter
Redis Adapter
Google Adapter
```

Adapter 可以處理 SDK、SQL、serialization、retry mechanism，但不能自行授予 business authority。

## Dependency direction

```text
Inbound Adapter / Web
        ↓
Application ──→ Domain
        ↓
     Ports
        ↑
Outbound Adapters
```

呼叫方向與 source import direction 不必相同；outer composition 負責 wiring。

## Layer existence rule

不為了 folder 完整建立空 layer。

```text
Responsibility exists
→ create layer / abstraction

No real responsibility
→ do not create empty layer
```

真正 variation、consumer、implementation 或 isolation responsibility 出現後才抽象。

## Final boundary test

一個 change 在落地前能回答：

1. 哪個 Domain / Context owns meaning？
2. 哪個 Application use case owns orchestration？
3. consumer 真正需要哪個 Port？
4. 哪個 Adapter 實作？
5. 哪些 invariant / consistency 不能破壞？
6. 用什麼 executable evidence 驗證？

如果第 1 題還無唯一答案，不要先建立 interface / adapter。
