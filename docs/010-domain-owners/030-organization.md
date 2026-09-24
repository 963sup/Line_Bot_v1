# Organization

狀態：current Organization governance 已有 Domain、Application、Postgres adapter、declarative schema 與 Web consumer；direct membership source 與 Enterprise Team-derived source 已分離並聚合成 effective OrganizationMembership。OrganizationPolicy、outside collaborator、additive/custom Organization roles 仍是 target。操作與持久化邊界見 [Persistence](../090-governance/020-proposals/030-data-target.md)。

## Purpose / owned model

Organization 回答 scope 是否存在/active、哪些 User 已成為 effective member、哪些 membership source 仍有效、哪些 invitation 尚待處理，以及 lifecycle 改變如何影響新的 private operation。

Organization identity 使用 OrganizationAccountId，與 Account root 同一 stable value；OrganizationAccount 是 shared business/resource identity facet，不是人類登入者，也不把全部 resource 私有模型收進 Aggregate。

Current owned relations：

- `OrganizationInvitation`：pending join request；接受前不是 membership、role 或 resource access。
- `OrganizationDirectMembership`：User 與 Organization 的 direct participation source，status 為 `active | removed`。
- `OrganizationMembership`：由 current sources 推導並持久化的 effective participation epoch，status 為 `active | removed`；source 可以來自 direct membership 或 Enterprise Team assignment。
- `OrganizationOwner`：Identity/Access 對指定 Organization 的 membership-level scoped RoleAssignment；principal 必須是 active individual Organization member，並綁定 current membership version。
- Team capability：Organization 提供 qualification/scope，Organization Team 本身由 Team owner 維護。

```text
Invitation ≠ MembershipSource ≠ OrganizationMembership ≠ OrganizationOwner RoleAssignment

OrganizationMembership source
├── direct
└── enterprise-team
```

OrganizationMembership 與 Employment 分離。Membership active 不直接授予 Owner 或 feature capability；RoleAssignment 是 authority writer。

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
- Owner role：Identity/Access scoped `grant/revoke OrganizationOwner`。
- Enterprise Team-derived membership：由 Enterprise owner 的 Team membership / Team → Organization commands 在同一 transaction 內建立、移除 source 並刷新 effective OrganizationMembership；Organization 不直接寫 Enterprise Team private state。

一般產品建立走 active User 的 `create-organization`，同 transaction 建立 Account identity、Organization、creator 的 active `OrganizationDirectMembership`、active effective OrganizationMembership 與初始 OrganizationOwner。受控 operator bootstrap 保留 recovery／administrative provisioning，且與 runtime create 共用唯一 DB provisioning coordinator。Organization 可獨立存在，不要求先有 Enterprise。

一般 Owner 移除／降權必須保留另一位有效 Owner；任何 direct / Enterprise Team source 撤銷若會使 OrganizationOwner 失去有效 membership，也必須先符合 owner replacement/revocation invariant。上游 User 資格失效導致無有效 Owner 時 fail closed 並走 operator recovery，不自動任命。

## GitHub semantic benchmark

GitHub-like Organization membership 的 base participation 與 Organization roles 必須分開。Current `OrganizationOwner` 只允許 individual active Organization member；Organization Team 不可整體取得 Owner。

GitHub Enterprise Team 與 Organization Team 是不同模型。Enterprise Team 可被 assigned 到 Organization，Team members 因此取得 Organization participation；本專案以 explicit membership-source provenance 保存這個來源，使 direct source 與多個 Enterprise Team source 可以同時存在、獨立撤銷。這不把 Enterprise Team 變成 Organization Team，也不把 Team assignment 直接當 OrganizationOwner authority。

GitHub 支援某些 additive/custom Organization roles 指派給 user 或 team。若未來引入 Moderator、Security Manager、App Manager 或 custom role，Identity/Access 必須以 role-specific `principalKinds` 明確建模，不能把「有些 role 支援 Team」推廣成「所有 role 都支援 Team」。

Outside collaborator 亦不是 OrganizationMembership。未來 resource-level collaboration 需要 resource owner/access model；不能為了取得 resource access 強迫外部 User 先成為 Organization member，也不能為了貼近 GitHub 名稱而放寬 current membership/authority gate。

## Queries / read model

提供可參與 Organization summary、current lifecycle/version、actor membership/invitation、member safe projection、membership source projection、Owner responsibility 與 invitation projection。Consumer 只拿必要欄位，不暴露 unrestricted repository。

Resource 自身 owner 保存其 authoritative scope reference；Organization 提供 scope/lifecycle/participation contract，不新增萬用 resource ownership table。Organization Team → OrganizationAccountId 由 Team owner維護；EnterpriseTeam → Organization assignment 由 Enterprise owner 維護，Organization 只消費其 membership-source 結果。

## OrganizationPolicy target

OrganizationPolicy 是本 Organization scope 的 versioned governance constraint，不是 Workforce WorkPolicy、RoleAssignment 或 Billing entitlement。Policy 可以縮小已授予 capability，不能憑空產生 Permission。

- Lifecycle：draft → published → retired；published payload 不原地改寫。
- Publish/retire 需要明確 scoped capability、active Organization 與 current principal qualification；`OrganizationOwner` 名稱本身不等於所有未來 policy capability。
- 上層 Enterprise constraint 不可被 Organization policy 放寬。
- 缺必要 policy/version、查詢失敗或衝突時 fail closed。
- Policy mutation、audit/receipt 與 source version 需可追溯。

第一個真實 consumer 出現前不建立 generic DSL/rules engine。

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

Organization Team 不是 Account。Organization 提供 OrganizationAccountId、status、OrganizationMembership qualification；Team 保存 immutable scope 並擁有 TeamMembership、TeamMaintainer 與 last-maintainer rules。Repository access 與 Issue responsibility 由 Repository owner 獨立維護。

Enterprise Team 是 Enterprise-owned group。其 Organization assignment 只提供 `enterprise-team` Organization membership source；不取得 Organization Team identity、TeamMaintainer 或 OrganizationOwner。

Workforce creates/manages EmploymentId from UserId + OrganizationAccountId。OrganizationMembership != Employment；是否要求 active membership 才建立 Employment 由 Workforce activation gate 定案。

Enterprise 提供上層 governance relation、Enterprise Team 與未來 policy。Direct Enterprise affiliation 或 EnterpriseOwner 不直接取得 Organization private writer；只有明確 Organization participation + scoped authority 才能通過相應 owner gate。

## Failure / transaction / replay

至少區分 not-found、forbidden、inactive、scope mismatch、invalid transition、last-effective-role-holder、version/replay conflict、upstream unavailable、unknown result。

Private operation 由 trusted Principal 解析，按 owner authority、current participation與 feature capability 重驗。Mutation 使用 requestId/fingerprint/expectedVersion/reason 與 audit/receipt；same request 只可 exact replay，撤權後不靠舊 receipt 恢復 access。Membership source mutation、effective membership refresh、owner protection 與 invitation cleanup 必須維持同一 transaction boundary。

[Persistence](../090-governance/020-proposals/030-data-target.md) 與 [Audit](../090-governance/020-proposals/040-security-target.md) 擁有 transaction/locking/history 要求；[Public contracts](../090-governance/020-proposals/010-domain-target.md) 限定 consumer 依賴。

## Acceptance criteria

至少驗證 invitation 與 membership source 分離、direct + Enterprise Team source 共存、單一 source 撤銷不破壞其他 source、Owner 僅 active individual member、last Owner protection、跨 Organization/Enterprise reference 拒絕、deactivate/reactivate 不復活資格、same-request replay、stale version、concurrent revoke 與歷史保留。Remote/database/deployment/device acceptance 必須分開回報。

## Non-goals

Enterprise governance duplicate owner、Organization Team lifecycle duplicate owner、Employment/Payroll 計算、department/grade/position tree、generic tenant/plugin/resource framework、outside collaborator/resource access 在沒有 owner model 前的半套實作。


## Public routing

Organization 依 GitHub `RepositoryOwner(login)` semantic 與 User 共用同一個 global login namespace。OrganizationAccountId 仍是 stable identity；current surface 在建立時指定唯一 `login` 作可讀 public locator，尚未提供 rename command；login 不是 authorization。Current public root route 是 `/{login}`；Organization 與 User 都可作 RepositoryOwner，因此 canonical Repository route 統一為 `/{ownerLogin}/{repositoryName}`。Organization Team grant 只適用 Organization-owned Repository。知道 login、Repository name 或 URL 都不授權 private read/write。
