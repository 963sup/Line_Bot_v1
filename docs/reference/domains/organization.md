# Organization detailed reference

Low-frequency Organization flows and edge cases. The owner boundary and invariants remain canonical in [Organization](../../owners/organization.md).

## Lifecycle

```text
Organization: active -> inactive -> active
OrganizationInvitation: pending -> accepted | cancelled
OrganizationDirectMembership: active -> removed
OrganizationMembership: active -> removed -> active
```

INACTIVE 後新的 Organization-scoped private writes 預設 fail closed；歷史 read policy 由各 owner 明確授權。Reactivation 不恢復 removed direct source、ended Employment、revoked grant 或 Team role；effective membership 只由仍存在的 current sources 重建。

Pending invitation 不能讀 private data；接受 invitation 才建立／恢復 direct source 與 effective membership。Invitation cancel/expiry 不等於 membership removal，也不挪用 User lifecycle。Enterprise Team assignment 可在沒有 invitation 的情況形成 `enterprise-team` source；若同一 user 有 pending invitation，assignment path 會取消該 pending request，避免同一 participation 同時保留無意義的邀請狀態。

## Current commands

Current runtime 支援：

- `create-organization`：active User 以唯一 `login` 與獨立 `name` 建立新的 Organization；`login` 是 locator、`name` 是 display identity。Account identity、shared RepositoryOwner login、Organization name、direct/effective membership 與初始 OrganizationOwner 在同一 transaction 成立。
- Organization lifecycle：`deactivate` / `reactivate`。
- People：`invite-member`、受邀者本人 `accept-invitation` / `decline-invitation`、Owner `cancel-invitation` / `remove-direct-membership`、本人 `leave-organization`。
- Owner role：Organization-owned `grant-organization-owner` / `revoke-organization-owner`；`OrganizationOwner` 是獨立治理 fact，不是 FPT `OrganizationMemberRole` 的 alias。
- Member role：Organization-owned `grant-organization-admin` / `revoke-organization-admin` 寫入 FPT exact `OrganizationMemberRole.ADMIN`；active membership 且無有效 ADMIN assignment 的 projection 是 `MEMBER`。Owner 可以在 viewer projection 呈現 `memberRole=ADMIN`，但仍保留獨立 Owner authority。
- Viewer capability：Organization public contract 以 current organization/membership/role versions 計算 `viewerCanAdminister`、`viewerCanCreateRepositories`、`viewerCanCreateProjects`、`viewerCanCreateTeams`。這些 capability 不進入 generic Permission catalog。
- Enterprise Team-derived membership：由 Enterprise owner 的 Team membership / Team → Organization commands 在同一 transaction 內建立、移除 source 並刷新 effective OrganizationMembership；Organization 不直接寫 Enterprise Team private state。

一般產品建立走 active User 的 `create-organization`，同 transaction 建立 Account identity、Organization、creator 的 active `OrganizationDirectMembership`、active effective OrganizationMembership 與初始 OrganizationOwner。受控 operator bootstrap 保留 recovery／administrative provisioning，且與 runtime create 共用唯一 DB provisioning coordinator。Organization 可獨立存在，不要求先有 Enterprise。

一般 Owner 移除／降權必須保留另一位有效 Owner；任何 direct / Enterprise Team source 撤銷若會使 OrganizationOwner 失去有效 membership，也必須先符合 owner replacement/revocation invariant。上游 User 資格失效導致無有效 Owner 時 fail closed 並走 operator recovery，不自動任命。

## Queries / read model

提供可參與 Organization summary、current lifecycle/version、actor membership/invitation、FPT member-role projection、membership source projection、Owner responsibility、viewer capability 與 invitation projection。Consumer 只拿必要欄位，不暴露 unrestricted repository。

Resource 自身 owner 保存其 authoritative scope reference；Organization 提供 scope/lifecycle/participation contract，不新增萬用 resource ownership table。Organization Team → OrganizationAccountId 由 Team owner維護；EnterpriseTeam → Organization assignment 由 Enterprise owner 維護，Organization 只消費其 membership-source 結果。

## OrganizationPolicy target

OrganizationPolicy 是本 Organization scope 的 versioned governance constraint，不是 Workforce WorkPolicy、RoleAssignment 或 Billing entitlement。Policy 可以縮小已授予 capability，不能憑空產生 Permission。

- Lifecycle：draft → published → retired；published payload 不原地改寫。
- Publish/retire 需要明確 scoped capability、active Organization 與 current principal qualification；`OrganizationOwner` 名稱本身不等於所有未來 policy capability。
- 上層 Enterprise constraint 不可被 Organization policy 放寬。
- 缺必要 policy/version、查詢失敗或衝突時 fail closed。
- Policy mutation、audit/receipt 與 source version 需可追溯。

第一個真實 consumer 出現前不建立 generic DSL/rules engine。

## Failure / transaction / replay

至少區分 not-found、forbidden、inactive、scope mismatch、invalid transition、last-effective-role-holder、version/replay conflict、upstream unavailable、unknown result。

Private operation 由 trusted Principal 解析，按 owner authority、current participation 與 feature capability 重驗。Repository/Project 建立依 Organization viewer capability；Team 建立依 viewerCanCreateTeams；Repository access recovery 仍是 OrganizationOwner 專屬 authority。Mutation 使用 requestId/fingerprint/expectedVersion/reason 與 audit/receipt；same request 只可 exact replay，撤權後不靠舊 receipt 恢復 access。Membership source mutation、effective membership refresh、role version binding、owner protection 與 invitation cleanup 必須維持同一 transaction boundary。

[Persistence](../../change/proposals/data-target.md) 與 [Audit](../../change/proposals/security-target.md) 擁有 transaction/locking/history 要求；[Public contracts](../../change/proposals/domain-target.md) 限定 consumer 依賴。

## Acceptance criteria

至少驗證 invitation 與 membership source 分離、direct + Enterprise Team source 共存、單一 source 撤銷不破壞其他 source、Owner 僅 active individual member、last Owner protection、跨 Organization/Enterprise reference 拒絕、deactivate/reactivate 不復活資格、same-request replay、stale version、concurrent revoke 與歷史保留。Remote/database/deployment/device acceptance 必須分開回報。

## Public routing

Organization 依 GitHub `RepositoryOwner(login)` semantic 與 User 共用同一個 global login namespace。OrganizationAccountId 仍是 stable identity；current surface 在建立時指定唯一 `login` 作可讀 public locator，尚未提供 rename command；login 不是 authorization。Current public root route 是 `/{login}`；Organization 與 User 都可作 RepositoryOwner，因此 canonical Repository route 統一為 `/{ownerLogin}/{repositoryName}`。Organization Team grant 只適用 Organization-owned Repository。知道 login、Repository name 或 URL 都不授權 private read/write。
