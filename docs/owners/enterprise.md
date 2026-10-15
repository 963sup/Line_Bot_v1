# Enterprise

Read this file for the Enterprise owner boundary and invariants. Load [detailed reference](../reference/domains/enterprise.md) only for lifecycle / command / locator / policy details.

## Purpose / owned model

Enterprise 回答哪些 Organizations 屬於同一治理範圍、哪些 Users／Enterprise users 有治理責任、哪些 Enterprise Teams 跨 Organization 分組，以及 lifecycle 改變後哪些新治理行為必須拒絕。

Current owned model：

- Enterprise：governance Domain entity，stable identity = EnterpriseAccountId。
- EnterpriseDirectAffiliation：User 與 Enterprise 的 direct participation relation；可形成尚未加入任何 Organization 的 unaffiliated Enterprise user。
- EnterpriseInvitation：pending invitation；接受後才建立 direct affiliation，Invitation 不等於 Affiliation。
- EnterpriseUser projection：由 active direct affiliation 與 attached Organization 的 active OrganizationMembership 聚合出的 effective population。
- EnterpriseOwner：Enterprise-owned scoped governance role；current root authority 只由 active direct affiliation + active User + current EnterpriseOwner role fact 形成，不把 Organization-derived affiliation 自動升格為 Owner。
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
- EnterpriseOwner lifecycle 與 RoleAssignment fact 由 Enterprise 唯一寫入；Identity/Access 只讀取目前有效的 EnterpriseOwner fact 與 qualification 來做 authorization decision。
- Enterprise Team membership 不等於 EnterpriseOwner；Team → Organization assignment 不等於 OrganizationOwner。
- Organization membership 可同時有 direct 與多個 Enterprise Team sources；撤銷一個 source 不能破壞其他 source。
- Enterprise 的 Repository outside-collaborator read model 只由 active Enterprise→Organization attachment 與 Repository-owned direct grant 推導；Enterprise 不另建 Collaborator identity，也不取得 Repository grant writer。
- Enterprise Team assignment 只可指向同 Enterprise 的 active attached Organization；跨 Enterprise reference fail closed。
- Organization Team 是單一 Organization scope entity，TeamMaintainer 只對該 Organization Team scope 生效；Enterprise Team 不共用其 role/hierarchy。
- AccountKind、LINE group、provider role/email、UI route 都不是 governance authority。
- 一般責任撤銷不可把 active governance scope 留在不可恢復的錯誤狀態；最後有效 owner 防護與 controlled recovery 不因本次重構放寬。

## Failure / replay / persistence

Deactivate/reactivate commands use the existing Enterprise Domain transitions through an Application-owned transaction flow. The Repository contract only loads/saves the aggregate with its expected version; an Output Port carries current lifecycle-owner qualification, replay and durable evidence. Persistence owns locking and atomic state/receipt/audit writes. Exact replay remains available to the current lifecycle owner while the Enterprise is inactive.

EnterpriseOwner grant/revoke also uses an Application-owned transaction flow: current owner authority precedes replay; direct affiliation and active User qualification precede assignment/version decisions. Domain owns assignment transitions and last-effective-owner protection, including User status epochs. Persistence only implements current facts, ordered locks and atomic role/receipt/audit writes.

Invitation and direct-affiliation commands use the same separation. Application checks current owner or self authority before replay and coordinates affiliation, invitation and role effects; Domain decides pending/resolved transitions, effective-affiliation conflicts, independent-source leave restrictions and last-owner protection. Persistence reuses one private governance transaction mechanism with owner mutations, keeping the original lock order and atomic state/receipt/audit boundary. Pending invitation grants no affiliation; direct-source removal preserves Organization-derived affiliation.

Enterprise creation and legacy identity completion are also Application-owned flows. Domain owns the initial Enterprise state, name validity and one-time identity/version decisions. Creation reuses the narrow privileged SQL coordinator to atomically create the Account, Enterprise, current actor's direct affiliation and initial Owner assignment; it does not grant unrestricted root Account INSERT. Current actor qualification precedes creation replay; current Owner authority precedes identity-completion replay. IDs, SQL error conversion and atomic state/receipt/audit persistence remain outside the core.

Enterprise→Organization attachment is an Enterprise-owned relationship flow. Application requires the actor's current Owner qualification in both scopes before replay; attach requires active scopes, while detach preserves current-assignment recovery for inactive scopes. Domain owns scope/relation versions, legal transitions and the active-Team-assignment detachment guard. Persistence reads Organization qualification through its public contract, locks both scopes and the relation, and enforces uniqueness plus atomic relationship/receipt/audit writes.

Enterprise Team commands use the same Application-owned transaction flow. Domain owns name/slug validity, membership and assignment transitions, and monotonic versions across reactivation. Application coordinates current Owner authority before replay, current target affiliation, source-removal protection and membership/invitation effects. Persistence retains ordered locks and invokes the Organization public coordinator inside the same transaction; batch detachment supplies all affected Users so the last-owner guard only counts Owners who survive the batch. Read projections remain authorized persistence queries, wired directly by composition.

至少區分 not-found、forbidden、inactive、scope-conflict、consent-required、stale-version、replay-conflict、unknown-result。Mutation 保存 requestId/fingerprint、expectedVersion、必要 reason、audit/receipt；same request 只可 exact replay，different payload 不可重用 requestId。Membership source、Team membership、Team assignment 與 owner protection 必須在同一 transaction 內完成，不接受先寫 projection 再補 invariant 的 workaround。
