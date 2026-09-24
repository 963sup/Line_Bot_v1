# Strategic decision path

## Purpose

這是 Agent / developer 從 business problem 走到 implementation 的可驗證決策路徑。它不是第二套 architecture truth；每一步都 route 回 canonical owner。

```text
Business Reality
↓
Subdomain
↓
Bounded Context
↓
Ubiquitous Language
↓
Responsibility
↓
Context Map
↓
Invariant
↓
Consistency Boundary
↓
Module / Data Boundary
↓
Application Port
↓
Adapter
```

## Decision path

| Step | 要回答的問題 | 主要 owner | 不應直接跳到 |
| --- | --- | --- | --- |
| Business Reality | 真正要成立的現實結果 / 約束是什麼？ | Product / Domain | route、table、SDK |
| Subdomain | 這是哪一類獨立 business problem？ | [Business decomposition](010-business-decomposition.md) + Domain map | package |
| Bounded Context | 哪套 model / language / authority 在哪裡有效？ | [Semantic modeling](020-semantic-modeling.md) | service / schema |
| Ubiquitous Language | canonical term 是什麼？ | owner doc + [Glossary](../050-glossary.md) | alias |
| Responsibility | Owns / Consumes / Does Not Own 是什麼？ | [Responsibility](030-responsibility-and-ownership.md) | shared utils |
| Context Map | 誰是 upstream / downstream？需要哪個 relationship？ | [Context relationships](040-context-relationships.md) + Repository map | mutual deep import |
| Invariant | 哪些條件永遠不能破壞？ | Domain owner | transaction mechanism |
| Consistency Boundary | 哪些 invariants 必須一起原子成立？ | [Invariant / consistency](060-invariants-policy-consistency.md) | 巨大 Aggregate |
| Module / Data Boundary | source 與 persisted truth 應由誰承接？ | [Implementation mapping](070-implementation-mapping.md) | 1 context = 1 package/table |
| Application Port | consumer 真正需要什麼 capability？ | consumer Application | provider API wrapper |
| Adapter | 哪個 technology 實作 Port？ | outer / integration boundary | business policy |

## Full strategic chain

需要做 architecture review、跨 Context refactor 或新 Domain capability 時，再走完整鏈：

```text
Business Reality
↓
Problem Space
↓
Domain
↓
Subdomain
├─ Core
├─ Supporting
└─ Generic
↓
Bounded Context
↓
Ubiquitous Language
↓
Glossary
↓
Context Responsibility
↓
Ownership
↓
Context Map
↓
Upstream / Downstream
↓
Integration Pattern
↓
Integration Semantics
↓
Business Invariants
↓
Policy / Decision Ownership
↓
Consistency Boundary
↓
Implementation Mapping
↓
Hexagonal Architecture
```

## Stop conditions

不要每次改 button 都重新讀全套 Strategic DDD。

```text
Change 已能唯一定位：
Owner
+ Truth
+ Boundary
+ Invariant
+ Validation

→ 停止向上展開
→ 只讀必要 owner / concern docs
```

若任何一步得到兩個互斥答案，先解 ambiguity，不用新增 abstraction 把矛盾包起來。

## Change strategy

任何 architecture / implementation 決策都先走：

```text
第一性原理
↓
高手思維
（逆向既有最佳解 + repository 真實 evidence）
↓
根因
（修 source，不修 symptom）
↓
Owner / Source of Truth / Boundary / Dependency
↓
奧卡姆剃刀
（刪除不必要假設、層級、元件與路徑）
↓
Validation / Evidence
```

不得把「最小 change」「最少檔案」「最短路徑」當獨立目標。簡化只在根因與責任已確認後發生；correctness、security、authorization、transaction、replay、isolation、recovery 所需複雜度屬 essential complexity，不刪。
