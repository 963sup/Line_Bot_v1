# Organization target design

狀態：Organization/Organization Team 核心 boundary 已選定且已有 current source；Organization direct membership source、EnterpriseTeam-derived membership provenance 與 effective OrganizationMembership 亦已成 current source。OrganizationPolicy、outside collaborator、additive/custom Organization roles、所有 resource scope 與完整 release/device acceptance 仍有 gap。本文保存設計決策，不重複 current business rules。

## Decision and rationale

Organization 是主要 business/authorization/data scope，不是 Enterprise、Company alias、LINE group、Organization Team、Workplace、Project 或 Supabase tenant。它可獨立或屬一 active Enterprise；hierarchy 不等於 permission inheritance。

OrganizationAccountId 與 Organization Domain identity 共用 stable key。Pending join intent 由 `OrganizationInvitation` 擁有；接受後建立 `OrganizationDirectMembership` source 並刷新 effective `OrganizationMembership`。EnterpriseTeam assignment 則可以形成 `enterprise-team` source。Employment 表示具期間的工作關係，與 Membership 不合併。

`OrganizationOwner` 是 Identity/Access 的 Organization-scoped membership-level role，RoleAssignment 是 authority writer；principal 必須是 active individual effective Organization member。Organization Team 或 Enterprise Team 不可整體成為 Owner。

## Organization Team decision

Current `@line-work/team` 只實作 Organization Team。Team/TeamMembership 保留獨立 aggregate/writer 與 immutable OrganizationAccountId scope；`TeamMaintainer` 是獨立 scoped RoleAssignment，membership write 與 maintainer write 不合併。

Organization 提供 lifecycle/participation/policy decision，不直接寫 Team private state。Repository access 與 Issue responsibility 由 Repository owner 獨立判斷；Team membership 不形成 Repository capability。

`Team` 是 current package name；Domain 語意明確為 Organization Team。`WorkGroup` 只在 historical/legacy protocol/storage 需要時保留原 literal。EnterpriseTeam 是不同 current entity，由 Enterprise owner 擁有，不透過 generic Team flag 或 alias 共用 invariant。

## Authority decisions

Operator bootstrap、Enterprise/Organization scoped RoleAssignment 與 governance runtime 已有 current source。Current authority graph：

```text
EnterpriseOwner -> active direct Enterprise affiliation
OrganizationOwner -> active individual effective Organization member
TeamMaintainer -> active Organization Team member
```

Enterprise direct affiliation、Organization membership sources、effective OrganizationMembership、Organization TeamMembership 與 RoleAssignment 各自獨立；`EnterpriseOwner` 不取得 Organization private data，`OrganizationOwner` 不自動取得 TeamMaintainer/Payroll capability。

GitHub-like 某些 additive Organization roles未來可以支援 User 或 Organization Team principal，但 principal kind 必須由各 RoleDefinition 明示。這項能力不得用 `OrganizationOwner -> Team` 先行模擬。

Existing Expense、Repository/Issue、Notification、Workplace、Project、Attendance history 不因 Organization/Team current source 存在就猜 historical scope。Organization Team 已有 authoritative Organization scope；其他 resource 逐 owner/slice 建立可信 mapping。

## EnterpriseTeam boundary

EnterpriseTeam 被 assigned 到 Organization 時會產生 indirect Organization participation。Current persistence/runtime 已用 explicit provenance 表達：

```text
OrganizationMembership source
├── direct
└── enterprise-team source(s)
```

- `OrganizationDirectMembership` 保存 direct source。
- EnterpriseTeam membership + active Team → Organization assignment 形成 `enterprise-team` source。
- `organization_membership_sources` 聚合 current sources；effective `OrganizationMembership` 由 source-aware refresh 維護。
- direct 與一個以上 EnterpriseTeam-derived source 可以共存與獨立撤銷；撤銷單一 source 不得誤刪其他資格。
- source removal 若會使 OrganizationOwner 等 membership-bound authority 失去必要 qualification，runtime 先拒絕 mutation，不用 destructive cascade。
- EnterpriseTeam assignment 不把 EnterpriseTeam 變成 Organization Team，也不授予 TeamMaintainer/OrganizationOwner。

GitHub outside collaborator/resource-level access 尚未有本地 authoritative owner；因此 current EnterpriseTeam member gate 仍要求 active effective Enterprise user，不用 generic collaborator record 或兼容 alias 擴張 scope。

## Canonical contract routing

- [Organization rules](../../010-domain-owners/030-organization.md)：current lifecycle/invitation/membership source/effective membership/owner/query。
- [Enterprise rules](../../010-domain-owners/020-enterprise.md)：current EnterpriseTeam、Team membership、Organization assignment 與跨 scope invariant。
- [Team rules](../../010-domain-owners/070-team.md)：current Organization Team collaboration、TeamMembership/TeamMaintainer；不擁有 Repository access 或 Issue lifecycle。
- [Target language](../020-proposals/010-domain-target.md)、[Target consistency](../020-proposals/010-domain-target.md)：跨 owner target language/consistency。
- [Public contracts](../020-proposals/010-domain-target.md)：Workforce/Payroll 等 owner-approved target projection/ports。
- [Target data](../020-proposals/030-data-target.md)、[Persistence](../020-proposals/030-data-target.md)、[Isolation](../020-proposals/040-security-target.md)：scope/history/cutover。

## Deferred

建立 Employment 是否要求 active OrganizationMembership、historical resource ownership backfill、outside collaborator/resource access、Bot entry、離職後 self-read 各回真正 owner。Department/job grade/nested Organization Team/generic tenant/plugin framework 不因 Organization exists 預建。

Current source 與未完成項見 [Implementation state](../../000-core/010-system.md)、[Gaps](../040-gaps/080-enterprise-and-organization.md) 與 [Migration plan](../030-migrations/040-enterprise-organization-workforce-payroll.md)。
