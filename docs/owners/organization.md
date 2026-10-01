# Organization

Read this file for the Organization owner boundary and invariants. Load [detailed reference](../reference/domains/organization.md) only for lifecycle / command / locator / policy details.

## Purpose / owned model

Organization 回答 scope 是否存在/active、哪些 User 已成為 effective member、哪些 membership source 仍有效、哪些 invitation 尚待處理，以及 lifecycle 改變如何影響新的 private operation。

Organization identity 使用 OrganizationAccountId，與 Account root 同一 stable value；OrganizationAccount 是 shared business/resource identity facet，不是人類登入者，也不把全部 resource 私有模型收進 Aggregate。

Current owned relations：

- `OrganizationInvitation`：pending join request；接受前不是 membership、role 或 resource access。
- `OrganizationDirectMembership`：User 與 Organization 的 direct participation source，status 為 `active | removed`。
- `OrganizationMembership`：由 current sources 推導並持久化的 effective participation epoch，status 為 `active | removed`；source 可以來自 direct membership 或 Enterprise Team assignment。
- `OrganizationOwner`：Organization-owned membership-level governance role fact；principal 必須是 active individual Organization member，並綁定 current membership version。Identity/Access 只消費此 fact 做 authorization evaluation。
- Team capability：Organization 提供 qualification/scope，Organization Team 本身由 Team owner 維護。

```text
Invitation ≠ MembershipSource ≠ OrganizationMembership ≠ OrganizationOwner RoleAssignment

OrganizationMembership source
├── direct
└── enterprise-team
```

FPT `OrganizationMemberRole` 的 current 值域是 `ADMIN | MEMBER`。本產品把 active effective `OrganizationMembership` 直接表示為 MEMBER；不另外持久化一般 member role。需要額外治理權限時，由 Organization-owned `OrganizationOwner` fact 表示 ADMIN 語意。這個本地名稱不建立第二套 Person/Member identity，也不形成 generic role authority。

OrganizationMembership 與 Employment 分離。Membership active 不直接授予 Owner 或 feature capability；Organization 是 OrganizationOwner fact 的唯一 authority writer。

## Invariants

- OrganizationInvitation != OrganizationDirectMembership != OrganizationMembership != Employment。
- OrganizationMembership active 不自動授予 OrganizationOwner、EnterpriseOwner、TeamMaintainer、Workforce/Payroll 或 feature permissions。
- direct 與一個以上 Enterprise Team membership sources 可以同時存在；撤銷單一 source 只能移除該 source 帶來的資格，不能誤刪其他 source。
- 沒有任何 active source 時，effective OrganizationMembership 才能轉為 removed；重新取得有效 source 時可以建立新的 active membership epoch/version。
- OrganizationOwner principal 必須是 active individual Organization member；Organization Team 不可整體成為 Owner，source removal 也不得繞過 last-owner/replacement protection。
- Enterprise Team assignment 只能來自 active、同 Enterprise attached Organization；跨 scope reference fail closed。
- TeamMembership participation 必須符合 Organization qualification；Organization 不直接寫 Organization Team private state。
- Organization-scoped reference 必須同 scope；只驗 record existence 不足。
- Deactivate/remove 不 cascade 刪除 Employment/Attendance/Payroll/Repository Issue/Expense/audit/history。
- Provider proof、email domain、LINE group、Supabase role 或知道 OrganizationAccountId 都不授權。
- Current personal Expense 或 global announcement audience 不因 Organization 存在自動轉移 ownership。

## Team / Workforce / Enterprise boundaries

Organization Team 不是 Account。Organization 提供 OrganizationAccountId、status、OrganizationMembership qualification；Team 保存 immutable scope 並擁有 TeamMembership、TeamMaintainer 與 last-maintainer rules。Repository access 由 Repository owner 維護；Issue responsibility 由 Issue owner 維護。

Enterprise Team 是 Enterprise-owned group。其 Organization assignment 只提供 `enterprise-team` Organization membership source；不取得 Organization Team identity、TeamMaintainer 或 OrganizationOwner。

Workforce creates/manages EmploymentId from UserId + OrganizationAccountId。OrganizationMembership != Employment；是否要求 active membership 才建立 Employment 由 Workforce activation gate 定案。

Enterprise 提供上層 governance relation、Enterprise Team 與未來 policy。Direct Enterprise affiliation 或 EnterpriseOwner 不直接取得 Organization private writer；只有明確 Organization participation + scoped authority 才能通過相應 owner gate。

## Non-goals

Enterprise governance duplicate owner、Organization Team lifecycle duplicate owner、Employment/Payroll 計算、department/grade/position tree、generic tenant/plugin/resource framework。Repository outside collaborator access 由 Repository-owned direct grant 擁有；Organization 只提供 current membership classification，不成為 grant owner。其他 resource 的 outside-collaborator model 仍不得在沒有 owner/consumer 前預建。
