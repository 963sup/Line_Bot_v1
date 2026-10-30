# Enterprise detailed reference

Low-frequency Enterprise flows and edge cases. The owner boundary and invariants remain canonical in [Enterprise](enterprise.md).

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

Direct affiliation／Organization-derived affiliation 只表示 Enterprise user qualification，不直接授權。`EnterpriseOwner` authority 仍要求 active Enterprise、active User、active direct affiliation 與 current Enterprise-owned role fact 綁定目前 User qualification version；Identity/Access 只消費此事實做 authorization evaluation。

## Enterprise Team / provenance

Vendored GitHub FPT domain truth 將 Enterprise Team 與 Organization Team 定義為不同語意：Enterprise Team 可以被加入 Organizations，成員因此取得該 Organization participation；Enterprise Team 本身不提供 Organization Team 的 nested hierarchy 或 maintainer model。Current runtime 是否實作這些能力是獨立狀態，不得反向改寫 FPT truth。

本專案 current slice 收斂為：

- EnterpriseTeam 不使用 `TeamMaintainer`、不使用 Organization Team nested hierarchy，也不共用 Organization Team storage。
- Current `add-enterprise-team-member` 要求目標是 active effective Enterprise user；direct-affiliated unaffiliated user 與 Organization-derived Enterprise user 都可加入。Repository outside collaborator 已由 Repository-owned direct grant 與 attached Organization projection 承載，不放寬 EnterpriseTeam qualification，也不把 outside collaborator 變成 Enterprise affiliation。
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

## Acceptance boundary

Repository source、declarative schema、Supabase remote catalog/data、repository validation、Vercel deployment 與 LINE mobile acceptance 是不同證據。Current source 已包含 Enterprise Team + provenance vertical slice；remote project 的 catalog/readback 需由 acceptance evidence 或本次變更紀錄獨立證明，不能用 source existence 代替 deployment evidence。

Enterprise target rationale 與 Identity/Access 由 Enterprise、Organization、Workforce 與 Identity Access owner contracts 定義。

## Locator

Enterprise 依 GitHub Enterprise semantic 使用自己的 `slug`，不加入 User/Organization 的 RepositoryOwner login namespace；`name` 是 display identity，兩者不可合併。EnterpriseAccountId 仍是 stable identity，slug 只負責定位。Current canonical route 是 authenticated `/enterprises/{slug}`：先驗證 LINE actor，再以既有 Enterprise affiliation / invitation / EnterpriseOwner policy解析同一 governance detail；沒有 anonymous Enterprise detail surface，也不因知道 slug 而取得 authority。New Enterprise provisioning 必須在同一 transaction 建立 non-null `name` 與 unique non-null `slug`。對 locator contract 出現前已存在的 legacy Enterprise，declarative schema 只允許 `(name, slug) = (null, null)` 這一個 recovery state；不得出現半完成 identity。該 recovery state 保留原 stable EnterpriseAccountId、direct affiliation 與 EnterpriseOwner authority，並由 current EnterpriseOwner 透過 replay-safe `complete-enterprise-identity` command 一次性完成 `name` / `slug`，完成後 version 遞增。LINE channel、產品名稱、User login/display name、Supabase/Vercel project name或其他 provider metadata都不是 Enterprise identity Source of Truth，不得用來推導或預設。Supabase reconciliation 只從 `main/packages/integration-supabase/src/schemas/*.sql` 收斂 current desired state，不用 provider-side/manual data cutover 產生 business identity。

Enterprise Team 同樣維持 stable TeamId 與可讀 slug 分離。GitHub FPT 定義 `Enterprise.enterpriseTeam(slug)` 與 `EnterpriseTeam.slug`；current canonical route 是 authenticated `/enterprises/{enterpriseSlug}/teams/{teamSlug}`。新 Team create 不接受 caller-supplied TeamId，server 產生 stable ID並由 name derive slug；rename 改變 slug而不改 TeamId。Current declarative contract 要求每個 Enterprise Team 都有 non-null slug，且同 Enterprise 內唯一；create／rename 都由 name deterministic derive slug。

## Ownership

Read this file for the Enterprise owner boundary and invariants. Load [detailed reference](enterprise.md) only for lifecycle / command / locator / policy details.

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

EnterpriseOwner grant/revoke also uses an Application-owned transaction flow: current owner authority precedes replay; direct affiliation and active User qualification precede assignment/version decisions. Domain owns assignment transitions and last-effective-owner protection, including User status epochs. Command subsets and input normalization live in `application/commands/enterprise-governance.ts`; Output Ports carry only required scope, Domain write values and opaque replay/audit evidence. Persistence only implements current facts, ordered locks and atomic role/receipt/audit writes.

Invitation and direct-affiliation commands use the same separation. Application checks current owner or self authority before replay and coordinates affiliation, invitation and role effects; Domain decides pending/resolved transitions, effective-affiliation conflicts, independent-source leave restrictions and last-owner protection. Persistence reuses one private governance transaction mechanism with owner mutations, keeping the original lock order and atomic state/receipt/audit boundary. Pending invitation grants no affiliation; direct-source removal preserves Organization-derived affiliation.

Enterprise creation and legacy identity completion are also Application-owned flows. Domain owns the initial Enterprise state, name validity and one-time identity/version decisions. Creation reuses the narrow privileged SQL coordinator to atomically create the Account, Enterprise, current actor's direct affiliation and initial Owner assignment; it does not grant unrestricted root Account INSERT. Current actor qualification precedes creation replay; current Owner authority precedes identity-completion replay. IDs, SQL error conversion and atomic state/receipt/audit persistence remain outside the core.

Enterprise→Organization attachment is an Enterprise-owned relationship flow. Application requires the actor's current Owner qualification in both scopes before replay; attach requires active scopes, while detach preserves current-assignment recovery for inactive scopes. Domain owns scope/relation versions, legal transitions and the active-Team-assignment detachment guard. Persistence reads Organization qualification through its public contract, locks both scopes and the relation, and enforces uniqueness plus atomic relationship/receipt/audit writes.

Enterprise Team commands use the same Application-owned transaction flow. Domain owns name/slug validity, membership and assignment transitions, and monotonic versions across reactivation. Application coordinates current Owner authority before replay, current target affiliation, source-removal protection and membership/invitation effects. Persistence retains ordered locks and invokes the Organization public coordinator inside the same transaction; batch detachment supplies all affected Users so the last-owner guard only counts Owners who survive the batch. Read projections remain authorized persistence queries, wired directly by composition.

至少區分 not-found、forbidden、inactive、scope-conflict、consent-required、stale-version、replay-conflict、unknown-result。Mutation 保存 requestId/fingerprint、expectedVersion、必要 reason、audit/receipt；same request 只可 exact replay，different payload 不可重用 requestId。Membership source、Team membership、Team assignment 與 owner protection 必須在同一 transaction 內完成，不接受先寫 projection 再補 invariant 的 workaround。
