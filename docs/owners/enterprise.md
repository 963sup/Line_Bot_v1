# Enterprise

Read this file for the Enterprise owner boundary and invariants. Load [detailed reference](../reference/domains/enterprise.md) only for lifecycle / command / locator / policy details.

## Purpose / owned model

Enterprise 回答哪些 Organizations 屬於同一治理範圍、哪些 Users／Enterprise users 有治理責任、哪些 Enterprise Teams 跨 Organization 分組，以及 lifecycle 改變後哪些新治理行為必須拒絕。

Current owned model：

- Enterprise：governance Domain entity，stable identity = EnterpriseAccountId。
- EnterpriseDirectAffiliation：User 與 Enterprise 的 direct participation relation；可形成尚未加入任何 Organization 的 unaffiliated Enterprise user。
- EnterpriseInvitation：pending invitation；接受後才建立 direct affiliation，Invitation 不等於 Affiliation。
- EnterpriseUser projection：由 active direct affiliation 與 attached Organization 的 active OrganizationMembership 聚合出的 effective population。
- EnterpriseOwner：Identity/Access 對指定 Enterprise 的 scoped Role；current root authority 只由 active direct affiliation + active User + current RoleAssignment 形成，不把 Organization-derived affiliation 自動升格為 Owner。
- EnterpriseOrganization：active/historical governance relation。
- EnterpriseTeam：Enterprise-owned collaboration group，與 Organization Team 分離。
- EnterpriseTeamMembership：User 與 EnterpriseTeam 的 active/removed participation relation。
- EnterpriseTeamOrganizationAssignment：EnterpriseTeam 與已 attached Organization 的 active/detached assignment。
- Organization membership provenance：Enterprise Team assignment 與 direct Organization membership 是可獨立存在、可獨立撤銷的 membership sources。
- EnterprisePolicy：versioned governance constraint；完整 policy runtime 仍依 target gate 演進。

EnterpriseAccountId 是同一 AccountId 值的 ENTERPRISE identity facet，不另外建立 mapping UUID。Enterprise 不是 legal entity、Organization alias 或全部 Organization private objects 的容器 Aggregate。

## Invariants / authority

- 同一 Organization 同一時點最多一個 active Enterprise governance relation。
- Invitation 不授予 authority，也不計為 effective Enterprise user affiliation。
- Direct affiliation 或 Organization-derived affiliation 本身不授予 EnterpriseOwner、Organization Team、Workforce 或 Payroll capability。
- EnterpriseOwner 是 Identity/Access 的 Enterprise-scoped Role；RoleAssignment 是 authority writer，current qualification 另要求 active direct Enterprise affiliation。
- Enterprise Team membership 不等於 EnterpriseOwner；Team → Organization assignment 不等於 OrganizationOwner。
- Organization membership 可同時有 direct 與多個 Enterprise Team sources；撤銷一個 source 不能破壞其他 source。
- Enterprise Team assignment 只可指向同 Enterprise 的 active attached Organization；跨 Enterprise reference fail closed。
- Organization Team 是單一 Organization scope entity，TeamMaintainer 只對該 Organization Team scope 生效；Enterprise Team 不共用其 role/hierarchy。
- AccountKind、LINE group、provider role/email、UI route 都不是 governance authority。
- 一般責任撤銷不可把 active governance scope 留在不可恢復的錯誤狀態；最後有效 owner 防護與 controlled recovery 不因本次重構放寬。

## Failure / replay / persistence

至少區分 not-found、forbidden、inactive、scope-conflict、consent-required、stale-version、replay-conflict、unknown-result。Mutation 保存 requestId/fingerprint、expectedVersion、必要 reason、audit/receipt；same request 只可 exact replay，different payload 不可重用 requestId。Membership source、Team membership、Team assignment 與 owner protection 必須在同一 transaction 內完成，不接受先寫 projection 再補 invariant 的 workaround。
