# Responsibility and ownership

## Canonical responsibility

本文件定義 **Context Responsibility、Ownership、Decision Authority** 的判斷方式。Current owner routing 仍由 [Domain map](../020-domain-map.md) 與各 [Domain owner](../../010-domain-owners/README.md) 擁有。

## Context Responsibility

每個 business Context 最低限度要能明確寫出：

```text
Owns
Consumes
Does Not Own
```

### Owns

Owns 表示此 Context 對某項 business truth、state transition、calculation 或 policy 有最終語意 authority。

### Consumes

Consumes 表示需要其他 owner 提供的 identity、fact、decision 或 capability，但不能因此取得對方 model 的 ownership。

### Does Not Own

Does Not Own 是負面邊界。它明確阻止最常見的責任漂移，例如：

```text
Attendance
does not own Employment authority
does not own Payroll calculation

Payroll
does not own Attendance lifecycle
does not own Payment execution
```

負面邊界不是多餘文字；它使 agent / developer 在新增功能時知道「不能放哪裡」。

## Ownership

Ownership 回答：

> 誰有權決定這項 truth？

不是：

> 哪個 package 現在剛好有這個 type？

至少區分四種 ownership：

| Ownership | 問題 |
| --- | --- |
| Concept ownership | 誰定義這個 business concept？ |
| State ownership | 誰可合法改變它的 authoritative state？ |
| Decision / Policy ownership | 誰決定 transition / eligibility / calculation 是否成立？ |
| Contract ownership | 誰維護跨 boundary 可被 consumer 依賴的 public surface？ |

Data ownership 與 Module ownership是 implementation projection，見 [Implementation mapping](070-implementation-mapping.md)。

## Decision Authority

同一 decision 只能有一個明確 owner。Consumer 可以請求 decision，但不能自行複製 policy。

```text
Provider owner
→ owns decision

Consumer
→ owns why it needs the decision
→ not the decision itself
```

例如 consumer 需要「目前 qualification 是否成立」，不代表 consumer 可以複製 upstream lifecycle rule。

## Policy ownership

Policy 是「允許什麼 transition / outcome」的規則；State 是「目前是什麼」。兩者可以屬同一 Context，也可以是不同 responsibility，但必須明確。

```text
State
≠ Policy over state transition
```

Authorization 也不能散成 adapter-local if statement。Identity proof、business authorization、domain invariant、Data Boundary enforcement 各自有 owner。

## Responsibility document contract

Domain Owner 文件逐步使用：

```text
Purpose
Strategic position
Ubiquitous Language
Owns
Consumes
Does Not Own
Business Invariants
Policy / Decision Ownership
Consistency Boundaries
Public Capabilities
Module / Data Mapping
Validation
```

不要求空 section；只有真實責任存在才記錄。

## Ownership conflict rule

遇到兩個 owner 都宣稱同一 truth 時，不新增 facade 讓兩邊都繼續：

```text
Conflict
↓
找 authoritative business owner
↓
保留一個 writer / definition
↓
另一側改為 reference / query / projection / adapter
```

如果還無法得到唯一答案，先解 ownership ambiguity，再新增功能。
