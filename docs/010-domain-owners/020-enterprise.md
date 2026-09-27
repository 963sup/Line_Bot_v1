# Enterprise

狀態：current Enterprise／Organization governance 已有 Domain、Application、Postgres adapter、Web consumer 與 declarative schema；Enterprise Team、Team membership、Team → Organization assignment 與 Organization membership source/provenance 已形成同一 vertical slice。GitHub outside collaborator、resource-level access、Enterprise role/licensing/ruleset bypass 與更完整 Policy 仍是 target，不以 compatibility layer 模擬。

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

## Current state model

```text
Enterprise: active -> inactive
EnterpriseInvitation: pending -> accepted | cancelled
EnterpriseDirectAffiliation: active -> removed
EnterpriseOrganization: active -> detached
EnterpriseTeamMembership: active -> removed
EnterpriseTeamOrganizationAssignment: active -> detached

OrganizationMembership source
├── direct
└── enterprise-team
```

Direct affiliation／Organization-derived affiliation 只表示 Enterprise user qualification，不直接授權。`EnterpriseOwner` authority 仍要求 active Enterprise、active User、active direct affiliation 與 current User/RoleAssignment version。

## Enterprise Team / provenance

GitHub current benchmark 把 Enterprise Team 與 Organization Team 視為不同能力：Enterprise Team 可以被加入 Organizations，成員因此取得該 Organization participation；Enterprise Team 本身不提供 Organization Team 的 nested hierarchy 或 maintainer model。

本專案 current slice 收斂為：

- EnterpriseTeam 不使用 `TeamMaintainer`、不使用 Organization Team nested hierarchy，也不共用 Organization Team storage。
- Current `add-enterprise-team-member` 要求目標是 active effective Enterprise user；direct-affiliated unaffiliated user 與 Organization-derived Enterprise user 都可加入。GitHub outside collaborator 仍待 resource/access model，不放寬資格檢查假裝完成。
- EnterpriseTeam 只能 assign 到同一 Enterprise 的 active `EnterpriseOrganization` relation；Organization detach 前必須先解除其 active Enterprise Team assignments。
- Team assignment 對每個 active Team member建立 `enterprise-team` Organization membership source；若存在 pending Organization invitation，runtime 將其取消，避免同一 participation 同時保留無意義 pending request。
- `organization_direct_memberships` 保存 direct source；`organization_membership_sources` projection 聚合 direct 與 Enterprise Team sources。
- `refresh_organization_membership()` 只依所有 current sources 計算 effective OrganizationMembership。移除一個 Team member／assignment 不得刪除其他 direct 或 Enterprise Team source；沒有任何 source 時才把 effective membership 轉為 removed。
- source removal 前必須先驗證 OrganizationOwner 等 membership-bound authority 不會因此留下不可恢復狀態；不能以 destructive cascade 取代 owner invariant。

## Current commands

Current governance runtime 支援 Enterprise provisioning、lifecycle、invitation、direct affiliation、owner role、EnterpriseOrganization 與 Enterprise Team 關係的受控操作。正式 write 必須保留 trusted actor、requestId/fingerprint、expectedVersion、reason、audit/receipt 與 transaction isolation。Active User 可用 `create-enterprise` 建立新的 Enterprise，並在同一 transaction 形成 Account facet、active direct affiliation 與初始 EnterpriseOwner；operator bootstrap 只保留 recovery／administrative provisioning，兩條入口共用唯一 DB provisioning coordinator。

- `create-enterprise`：active User 以唯一 URL `slug` 建立新的 Enterprise；creator 同 transaction 成為 active direct-affiliated EnterpriseOwner。
- Enterprise lifecycle：`deactivate` / `reactivate`，均要求 current EnterpriseOwner、expectedVersion、reason 與 durable receipt；reactivate 不恢復已撤銷 affiliation／role／Team assignment。
- `invite-user` 建立或重新開啟 pending EnterpriseInvitation。
- `accept-invitation` / `decline-invitation` 只能由被邀請 User 自己執行；accept 建立 active direct affiliation，decline 只終結 invitation。
- `cancel-invitation` 由 EnterpriseOwner 取消 pending invitation。
- `leave-enterprise` 只允許本人移除自己的 direct affiliation；若仍有 Organization-derived affiliation 則拒絕，最後有效 EnterpriseOwner 也不得退出。
- `remove-direct-affiliation` 只移除 direct source；若仍存在 Organization-derived affiliation，effective Enterprise user projection仍可保留，但 EnterpriseOwner authority 不再由該 indirect source維持。
- `attach-organization` / `detach-organization` 管理 EnterpriseOrganization；detach 會拒絕仍有 Enterprise Team assignment 或會失去最後有效 EnterpriseOwner 的情況。
- `create-enterprise-team` 只接受 Team name 等 business input；stable TeamId 由 server 產生，slug 由 name deterministic derive。 `rename-enterprise-team` 修改 name 時同步改變 slug；TeamId／Enterprise scope／creator identity 保持 immutable。
- `add-enterprise-team-member` / `remove-enterprise-team-member` 維護 Team membership，並在同一 transaction 刷新所有已指派 Organizations 的 effective membership。
- `assign-enterprise-team-organization` / `detach-enterprise-team-organization` 維護 Team → Organization assignment，並在同一 transaction 刷新所有 active Team members 的 Organization membership sources。

Enterprise inactive 拒絕一般新 invitation/attach/Team/owner mutation；歷史 relation/audit/receipt 保留。Detach/deactivate 不 cascade delete Organization private state。

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

## Acceptance boundary

Repository source、declarative schema、Supabase remote catalog/data、repository validation、Vercel deployment 與 LINE mobile acceptance 是不同證據。Current source 已包含 Enterprise Team + provenance vertical slice；remote project 的 catalog/readback 需由 acceptance evidence 或本次變更紀錄獨立證明，不能用 source existence 代替 deployment evidence。

Target rationale 見 [Enterprise target design](../090-governance/010-decisions/030-enterprise-target-design.md)；Identity/Access 見 [Target authorization](../090-governance/020-proposals/040-security-target.md)。


## Locator

Enterprise 依 GitHub Enterprise semantic 使用自己的 `slug`，不加入 User/Organization 的 RepositoryOwner login namespace；`name` 是 display identity，兩者不可合併。EnterpriseAccountId 仍是 stable identity，slug 只負責定位。Current canonical route 是 authenticated `/enterprises/{slug}`：先驗證 LINE actor，再以既有 Enterprise affiliation / invitation / EnterpriseOwner policy解析同一 governance detail；沒有 anonymous Enterprise detail surface，也不因知道 slug 而取得 authority。Current declarative contract 要求每個 Enterprise 同時具有 non-null `name` 與 unique non-null `slug`；new provisioning 在同一 transaction 建立兩者。Legacy pre-locator Enterprise 若已擁有 stable EnterpriseAccountId、direct affiliation 或 EnterpriseOwner authority，cutover 必須保留同一 stable identity；`name` / `slug` 只能由該 Enterprise 的 owner 明確確認後 backfill。LINE channel、產品名稱、User login/display name、Supabase/Vercel project name或其他 provider metadata都不是 Enterprise identity Source of Truth，不得用來推導或預設。若歷史 evidence不足，就表示 owner-confirmation required，而不是 fabricated fallback。

Enterprise Team 同樣維持 stable TeamId 與可讀 slug 分離。GitHub FPT 定義 `Enterprise.enterpriseTeam(slug)` 與 `EnterpriseTeam.slug`；current canonical route 是 authenticated `/enterprises/{enterpriseSlug}/teams/{teamSlug}`。新 Team create 不接受 caller-supplied TeamId，server 產生 stable ID並由 name derive slug；rename 改變 slug而不改 TeamId。Current declarative contract 要求每個 Enterprise Team 都有 non-null slug，且同 Enterprise 內唯一；create／rename 都由 name deterministic derive slug。
