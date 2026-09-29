# Account identity design decision

決策日期：2026-09-13。本文只保存 identity 設計理由與取捨；current implementation 由 [Account owner](../../owners/account.md)、[system invariants](../../rules/system-invariants.md) 與 machine semantic truth 擁有。

## Problem

Legacy `Member` 曾同時承擔 human identity、command actor、permission subject、Team participant、Wallet/Ledger holder，造成 owner/relationship/value 語意耦合。真正需求是穩定 identity 與既有 ID/history/replay continuity，而不是全域 rename。

## Selected decision

使用單一 opaque `AccountId` namespace。Account root 只擁有 identity/kind；產品核心 facet 使用 **User / Organization / Enterprise**，其中 `User` 是 human product identity。

```text
Account
├─ kind = USER         → User
├─ kind = ORGANIZATION → Organization
└─ kind = ENTERPRISE   → Enterprise
```

- PrincipalId／HolderAccountId 是 AccountId 的 consumer semantics，不建立第二套 identity。
- Human participant 使用 User；working relationship 使用 EmploymentId；Team 不是 Account。
- Existing text ID 優先保留，不為格式整齊 rekey/cast UUID。
- DailyCheckIn 不屬於 Account lifecycle；Ledger compatibility literal 若承載歷史/replay continuity 可保留。
- 不建立 universal `AccountRelation`、generic IAM、第二 ledger 或無 consumer 的 event bus。
- Provider identity（例如 LINE userId / webhook destination）不是 product Account authority；transport metadata 不自動建立 Bot actor。

## Alternatives rejected

| Alternative | Why rejected |
| --- | --- |
| Global MemberId → AccountId search/replace | 混淆 human/actor/holder/scope/Employment，破壞 protocol/history |
| Account + role/status/parentId 吞全部 | 把 unrelated lifecycle/consistency/authorization 綁在同 writer |
| Universal AccountRelation(role) | OrganizationMembership、TeamMembership、Employment、delegation authority 不同 |
| Every subtype gets second ID | 增加 mapping/ownership drift，沒有 consumer value |
| Force all existing IDs to UUID | 破壞既有 FK/receipt/replay/history continuity |
| PostgreSQL table inheritance | 不符合明確 typed facet/FK/integrity strategy |

## GitHub domain-truth calibration

Vendored GitHub FPT JSON 是 User / Organization / Enterprise / Team / invitation 等 GitHub GraphQL semantics 的 domain truth；它不是 Line_Bot_v1 SQL schema、permission inheritance 或 runtime activation authority。本地 overlay 只能決定 owner、invariant、policy、persistence 與 implementation state，不能重新定義 FPT。

- User / Organization / Enterprise separation：採 Account root + typed facets。
- Organization teams：採 Organization-scoped Team；Team role 不等於 Organization-wide admin。
- Scoped roles/permissions：採 typed RoleAssignment + owner eligibility，不複製 GitHub 全角色集合。
- Invitation：只採「加入意圖 ≠ active participation」語意。
- Audit：採 actor/action/target/time 可追溯語意；retention/search/export 由本地 policy 決定。

## Deferred

Nested Team／permission inheritance、team-derived grant、EnterpriseTeam auto-provision、Managed User/SCIM、自訂 role editor、generic policy DSL、Bot autonomous delegation、non-USER Coin holder 都需要真實 use case、authority、revoke/recovery evidence 才能啟用。

## Current-state routing

- [Account owner](../../owners/account.md)
- [System invariants](../../rules/system-invariants.md)
- [Semantic model](../../../architecture/semantic-model.json)
- [Domain target](../proposals/domain-target.md)
- [Security target](../proposals/security-target.md)
- [Data target](../proposals/data-target.md)
- [Migration plan](../migrations/enterprise-organization-workforce-payroll.md)
