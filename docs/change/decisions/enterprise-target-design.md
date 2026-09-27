# Enterprise target design

狀態：已選定 target design。Current Enterprise／Organization governance runtime、EnterpriseTeam membership／Organization assignment 與 Organization membership provenance 已有 source/schema；本文以 GitHub Enterprise Cloud 的公開治理語意作 benchmark，不因既有 package/schema 簡化而改寫其責任。Outside collaborator、Enterprise role/license/ruleset bypass 與完整 resource access 仍是 target。

## Decision and rationale

Enterprise 是 cross-Organization governance boundary，不是 Organization 的大型版本、legal entity、tenant database 或外部 provider。它擁有 Enterprise lifecycle、effective Enterprise users/affiliations、EnterpriseOrganization、EnterpriseTeam、versioned EnterprisePolicy 與跨 Organization governance；不擁有下游 Workforce/Attendance/Payroll private model。

Current primitive 不使用 `EnterpriseMembership` 代表 direct user。Direct Enterprise participation 是 `EnterpriseDirectAffiliation`；pending request 是 `EnterpriseInvitation`。Effective Enterprise user population 由 direct affiliation 與 attached Organization 的 active OrganizationMembership 聚合，因此：

```text
Invitation ≠ Affiliation
Enterprise user ≠ direct affiliation only
```

一個 direct-affiliated user 可以尚未加入任何 Organization；Organization-derived user 也不需要額外 direct affiliation。Current `EnterpriseOwner` 則比 effective Enterprise user 更嚴格，仍要求 active direct affiliation，不讓 Organization-derived affiliation 自動維持 root authority。

## Enterprise Team vs Organization Team

兩者是不同 entity，不建立 generic Team aggregate/role alias：

- `EnterpriseTeam`：Enterprise-level group，可跨 Organizations；current slice 已有 Team membership 與 Organization assignment，未來可再承接 Enterprise role/license/ruleset bypass。
- `OrganizationTeam`：單一 Organization 內的 team；current package `@line-work/team` 只實作這一種，role 使用 `TeamMaintainer`，scope kind 為 `organization-team`。
- EnterpriseTeam 不使用 `TeamMaintainer`，也不因 Organization Team 的 parent/child capability 而取得 nested-team invariant。

Current Organization Team 的 `TeamMembership` 與 `TeamMaintainer` RoleAssignment 是兩個不同事實，write command 亦分離。`OrganizationOwner` 是 membership-level owner role，只能由 active individual Organization member 持有；Organization Team／Enterprise Team 不可整體成為 OrganizationOwner。未來若引入可授予 Team principal 的 additive Organization roles，必須建立明確 RoleDefinition，不得重用 Owner。

## Enterprise Team → Organization assignment

EnterpriseTeam 被 assigned 到 Organization 時，不只是「可見關係」。依 GitHub benchmark：team members 會直接取得該 Organization membership/access，不需要額外 invitation，並取得 Organization base access；Organization 後續還可授予額外 Organization role/resource access。

Current persistence 已保存 membership provenance/source：

```text
OrganizationMembership source
├── direct
└── enterprise-team source(s)
```

同一 user 可以同時有 direct membership 與一個以上 EnterpriseTeam-derived membership source。`organization_direct_memberships` 保存 direct source；`organization_membership_sources` security-invoker projection 聚合 direct + Enterprise Team source；effective `organization_memberships` 由 `refresh_organization_membership()` 依 source 刷新。

撤銷 direct source 不得移除仍有效的 indirect source；移除 EnterpriseTeam member/Organization assignment 也只能移除該 source 帶來的資格，不能誤刪其他 source。若 source removal 會使 membership-bound OrganizationOwner 留下不可恢復狀態，runtime 先拒絕 mutation，而不是 destructive cascade。

## Authority

- `EnterpriseOwner` 是 Identity/Access 的 Enterprise-scoped role，principal current 為 active User + active direct Enterprise affiliation。
- `OrganizationOwner` 是 Organization membership-level owner role，principal 必須是 active individual effective Organization member。
- `TeamMaintainer` 只屬 Organization Team，不泛化到 EnterpriseTeam。
- EnterpriseTeam membership/assignment 本身不授予 EnterpriseOwner 或 OrganizationOwner。
- 未來 additive Organization roles 可以依 role-specific policy 支援 principal 為 User 或適用 Team；principal kind 不是全域等同所有 role 都可接受 Team。
- Membership/Affiliation 本身不直接授權；RoleAssignment 仍是 authority source。

## Current / target boundary

Current source 已完成：

- generic Team 語意收斂為 Organization Team；
- `TeamManager` 收斂為 `TeamMaintainer`；
- governance scope 收斂為 `organization-team`；
- OrganizationOwner 收斂為 individual Organization member；
- Enterprise direct affiliation 與 invitation 分離；
- Organization invitation、direct membership source 與 effective membership 分離；
- Enterprise effective user projection 支援 direct + Organization-derived affiliation；
- EnterpriseTeam、EnterpriseTeamMembership、Team → Organization assignment；
- direct + EnterpriseTeam-derived Organization membership provenance、source-aware refresh；
- transaction/replay/audit/expected-version 與 membership-bound owner protection。

仍屬 target：outside collaborator、resource-level access、EnterpriseTeam 作為 role principal、Enterprise role/license/ruleset bypass、additive/custom Organization roles、完整 Policy runtime。

EnterpriseTeam current slice 的 schema/runtime 已按同一 vertical slice 完成 Domain invariant、Application command/query、Identity/Access authority、transaction/replay、Supabase declarative schema、remote catalog sync、tests 與 canonical docs；remote/deployment/device acceptance 仍各自保留獨立證據，不因本文狀態文字自動成立。

## Deferred

SCIM/IdP sync、license/catalog、ruleset bypass、generic policy DSL、跨 Enterprise data sharing 等沒有 current consumer 的能力不預建。GitHub 是 semantic benchmark，不代表一次複製所有 GitHub product features。

正式 current/target 狀態分別由 [Enterprise business rules](../../010-domain-owners/020-enterprise.md)、[Target authorization](../020-proposals/040-security-target.md)、[Target data model](../020-proposals/030-data-target.md) 與 governance acceptance/gaps 文件承接。
