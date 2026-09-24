# Strategic design

本區是 Strategic DDD 的 canonical concept / decision-rule owner。它不重複 current business state、package topology、schema 或 target migration；那些 truth 仍由各自 owner 維護。

完整鏈條：

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
├─ ACL
├─ Customer / Supplier
├─ Conformist
├─ Partnership
├─ Shared Kernel
├─ Separate Ways
├─ Open Host Service
└─ Published Language
↓
Integration Semantics
├─ Stable ID
├─ Snapshot
├─ Query
├─ Command
└─ Event
↓
Business Invariants
↓
Policy / Decision Ownership
↓
Consistency Boundary
↓
────────────────────────
Implementation Mapping
↓
Module Boundary
Data Boundary
Public Contract
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

## Concept owners

- [Business decomposition](010-business-decomposition.md)：Business Reality、Problem Space、Domain、Subdomain、Core / Supporting / Generic。
- [Semantic modeling](020-semantic-modeling.md)：Bounded Context、Ubiquitous Language、Glossary 與 semantic boundary。
- [Responsibility and ownership](030-responsibility-and-ownership.md)：Context Responsibility、Ownership、Decision Authority。
- [Context relationships](040-context-relationships.md)：Context Map、Upstream / Downstream 與八種 integration patterns。
- [Integration semantics](050-integration-semantics.md)：Stable ID、Snapshot、Query、Command、Event、contract ownership。
- [Invariants, policy and consistency](060-invariants-policy-consistency.md)：Business Invariants、Policy / Decision Ownership、Consistency Boundary。
- [Implementation mapping](070-implementation-mapping.md)：Bounded Context → Module / Data / Public Contract。
- [Strategic to Hexagonal](080-strategic-to-hexagonal.md)：Strategic DDD 到 Domain / Application / Port / Adapter 的 handoff。
- [Strategic decision path](090-strategic-decision-path.md)：Agent 實作時的最短判斷路徑。

## Strategic artifacts

Concept 是「要理解什麼」；Artifact 是「這項 strategic knowledge 在 repository 哪裡被保存」。兩者不可混為一張名詞清單，也不為每個 artifact 再建一份重複文件。

| Artifact | 回答的問題 | Canonical repository owner |
| --- | --- | --- |
| Domain / Problem-space map | 業務世界有哪些問題、哪些已能定位 owner？ | [Domain map](../020-domain-map.md) |
| Subdomain / strategic classification | 哪些問題可獨立演進；Core / Supporting / Generic 是否已定案？ | [Domain map](../020-domain-map.md)；future classification → Governance |
| Bounded Context / Responsibility map | 哪套 model/language 在哪裡有效；Owns / Consumes / Does Not Own？ | [Domain map](../020-domain-map.md) + [Domain owners](../../010-domain-owners/README.md) |
| Ownership / Decision Authority map | Concept、state、policy、calculation 最終由誰決定？ | [Domain map](../020-domain-map.md) + owner-local docs |
| Context Map | Provider / Consumer / Upstream / Downstream / contract 是什麼？ | [Repository map](../030-repository-map.md) |
| Glossary / Language catalog | 跨 Context 易混淆詞的 canonical meaning 是什麼？ | [Glossary](../050-glossary.md)；local vocabulary → owner docs |
| Boundary map | Bounded Context 如何投影成 Module / Data / Public Contract / Consistency Boundary？ | [Repository map](../030-repository-map.md) + machine truth |
| Source-of-Truth map | 同一問題看到多個答案時，哪個 source authoritative？ | [Repository map](../030-repository-map.md) |
| Invariant / Policy / Consistency record | 哪些條件不能破壞；哪些 decision / atomicity 必須保留？ | owner-local docs；cross-cutting rule →本區 concept docs |
| Target / migration / acceptance artifacts | 未完成方向、cutover、gap、evidence、history 在哪？ | [Governance](../../090-governance/README.md) |

因此 repository 不需要另外建立 `domain-map.md`、`subdomain-map.md`、`ownership-map.md`、`responsibility-map.md` 各自複製相同 truth。能由同一 canonical map 用 section / table 表達的，就留在同一 owner。

## Reading rule

Current business map 看 [Domain map](../020-domain-map.md)；current relationship / mapping 看 [Repository map](../030-repository-map.md)；cross-context term definition 看 [Glossary](../050-glossary.md)；owner-local semantics 看 [Domain owners](../../010-domain-owners/README.md)。

一般 feature 修改不要預讀本區全部文件。只有新 Domain、boundary / ownership 衝突、跨 Context integration 或重大 architecture review 才從 [Strategic decision path](090-strategic-decision-path.md) 展開；一旦 Owner + Truth + Boundary + Invariant + Validation 已唯一，停止增加 context。
