# Invariants, policy and consistency

## Canonical responsibility

本文件定義 **Business Invariants、Policy / Decision Ownership、Consistency Boundary** 的 strategic relationship。Owner-local invariant 的真正內容留在各 [Domain owner](../../010-domain-owners/README.md)。

## Business Invariant

Business Invariant 是無論 UI、provider 或 storage 如何變化，都必須成立的 business condition。

好的 invariant 應該能回答：

- 哪個 owner 負責？
- 什麼狀態組合不合法？
- 哪個 transition 必須拒絕？
- 哪些 facts 必須一起成立？
- 違反時應該 fail closed 還是可 recovery？

Invariant 不是「最好如此」；它會反向決定 Domain、transaction、concurrency、validation 與 data constraint。

## State vs Policy

```text
State
= 現在是什麼

Policy
= 哪些 transition / decision 被允許
```

兩者不能因實作方便混在同一個 mutable object。

例如：

```text
Attendance state
≠ Employment qualification policy

Payroll result
≠ Payment policy

Identity proof
≠ Authorization policy
```

## Policy / Decision Ownership

每一個高影響 decision 必須定位唯一 owner。

決策模板：

| 問題 | Owner 應回答 |
| --- | --- |
| Who may act? | trusted Principal + authorization owner |
| Is subject eligible? | business qualification owner |
| Is transition valid? | state / lifecycle owner |
| How is result calculated? | calculation owner |
| What must be atomic? | owner invariant + consistency design |

Adapter / RLS / UI 不得成為 business policy 的唯一來源。Data Boundary enforcement 可以 defense-in-depth，但不能取代 Application / Domain authorization。

## Consistency Boundary

Consistency Boundary 回答：

> 哪些 invariants 必須在同一 atomic transition 內成立？

它不是「概念上屬於同一功能的所有資料」。

```text
Business Invariant
↓
Consistency Boundary
↓
Transaction / concurrency / replay requirement
↓
Data constraint / adapter implementation
```

## Aggregate relationship

Aggregate 是 tactical modeling tool；其 strategic 依據是 consistency boundary。

```text
Aggregate Boundary
≈ minimum model boundary needed
  to protect selected invariants

不是
= entire Bounded Context
= entire Organization
= all related tables
```

跨 Aggregate / Context 需要同一 DB transaction 不代表要合併 model。先證明真正 atomic invariant。

## Essential complexity

以下若由問題本身要求，就是 Essential Complexity，不能因「簡化」而刪：

- authorization
- tenant / scope isolation
- optimistic concurrency / expectedVersion
- replay protection / idempotency
- atomic state + receipt / posting
- recovery / unknown-result semantics
- durable audit evidence where required

Occam 的目標是刪 accidental complexity，不是刪 correctness。

## Evidence

Invariant 的成熟落地順序：

```text
Invariant
↓
Domain / Application rule
↓
Executable constraint
↓
Tests / architecture / schema guard
↓
Evidence
```

Written rule 不能取代 executable enforcement。
