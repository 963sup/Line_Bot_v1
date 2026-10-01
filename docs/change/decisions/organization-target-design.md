# Organization target design

本文保存 Organization target decision 與理由；current lifecycle/membership/runtime 狀態由 [Organization owner](../../owners/organization.md)、machine semantic/data truth 與 runtime evidence 擁有。

## Decision

Organization 是主要 business/authorization/data scope，不是 Enterprise、Company alias、LINE group、Organization Team、Workplace、Project 或 Supabase tenant。它可獨立或屬 Enterprise；hierarchy 不等於 permission inheritance。

Pending join intent、direct participation source、effective participation 與 Employment 必須分開：

```text
OrganizationInvitation
→ direct source
→ effective OrganizationMembership

Employment
→ working relationship
≠ OrganizationMembership
```

OrganizationAccountId 與 Organization Domain identity 使用同一 stable key；不建立第二套 identity。

## Organization Team decision

Organization Team 擁有自己的 Team/TeamMembership lifecycle 與 Organization scope。Team membership write、TeamMaintainer RoleAssignment、OrganizationOwner authority 不能合併成一個 generic role/membership model。

- Organization 不直接寫 Team private state。
- Team membership 不自動形成 Repository/Issue/Payroll capability。
- Organization Team 與 EnterpriseTeam 是不同 entity；不得用 generic Team flag/alias 共用 invariant。
- Historical storage/protocol literal 可為 continuity 保留，但不能升格為 current Domain alias。

## Authority

- OrganizationOwner 是 Organization-scoped membership-level governance role；Organization 是此 role fact 的 authority writer，Identity/Access 只計算 authorization。
- Principal 必須符合 active effective Organization participation。
- OrganizationOwner 不自動取得 TeamMaintainer、Payroll 或 Repository capability。
- 未來 additive/custom roles 若接受 Team principal，必須由 RoleDefinition 明確定義。

## EnterpriseTeam participation source

EnterpriseTeam assignment 可以形成 indirect Organization participation，但 source 必須 explicit 且可獨立撤銷：

```text
OrganizationMembership source
├─ direct
└─ enterprise-team source(s)
```

移除一個 source 只移除該 source 的資格；若會破壞必要 authority/recovery invariant，mutation fail closed。EnterpriseTeam assignment 不把 EnterpriseTeam 變成 Organization Team，也不授予 OrganizationOwner/TeamMaintainer。

## Deferred

Repository outside collaborator 已回 Repository owner：direct grant 不以 OrganizationMembership 為必要條件，Organization 只提供 member/outside classification。Historical resource ownership backfill、其他 resource 的 outside access、Employment qualification policy、Bot entry、離職後 self-read、nested Organization Team、generic tenant/plugin framework 都回各自 owner，由真實 use case 決定。

## Current-state routing

- [Organization owner](../../owners/organization.md)
- [Enterprise owner](../../owners/enterprise.md)
- [Team owner](../../owners/team.md)
- [Semantic model](../../../architecture/semantic-model.json)
- [System invariants](../../rules/system-invariants.md)
- [Security target](../proposals/security-target.md)
- [Data target](../proposals/data-target.md)
- [Migration plan](../migrations/enterprise-organization-workforce-payroll.md)
