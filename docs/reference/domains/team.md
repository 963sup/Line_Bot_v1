# Team detailed reference

Low-frequency Team details. The owner boundary and invariants remain canonical in [Team](team.md).

## Locator

TeamId 是 stable identity；Organization Team 的 human-readable locator 是 Organization `login` + Team `slug`。Current implementation 在 create／rename 時由 `name` deterministic derive slug，rename 會改變 slug，但不改 TeamId。Canonical authenticated route 是 `/orgs/{organizationLogin}/teams/{teamSlug}`；`/team` 是 collection/workbench。舊 slug 不建立 speculative redirect/history。

每個 Organization Team 都有 non-null slug 且同 Organization 唯一。Locator 只定位；direct open 仍重新驗 LINE proof、active OrganizationMembership，再依 Team privacy/effective membership 決定 read。

## 建立與加入

- active User 必須同時是 active OrganizationMembership，才能在該 Organization scope 建立或操作 Team。
- `create-team` 在同一 transaction 建立 Team、creator 的 active direct TeamMembership 與初始 TeamMaintainer；local defaults 是 `SECRET` + `NOTIFICATIONS_DISABLED`。
- `join` 必須提交 `organizationAccountId + teamId`，先建立／更新本人 pending direct TeamMembership；pending 不等於 effective membership，也不取得 SECRET Team read。
- 曾被 removed 的 direct participant 不能自行重新加入。
- LINE `groupId`、聊天室成員、URL/Rich Menu 都不是 TeamMembership 或 TeamMaintainer proof。

## Hierarchy 與 membership projection

Team row 保存 nullable `parent_team_id`。Composite FK 保證 parent/child 同 Organization，trigger + serialized hierarchy mutation 保證無 self-parent/cycle。

`app_private.team_effective_memberships` 是可重建 read projection：

- direct active row → target Team 的 `IMMEDIATE` source，depth 0；
- descendant Team 的 direct active row → 每個 ancestor 的 `CHILD_TEAM` source，depth > 0；
- projection 保留 `source_team_id`、`source_membership_version`、`depth`，不建立第二份 membership truth；
- 同一 User 可有多個來源；consumer 若需要 FPT `ALL`，應取 IMMEDIATE + CHILD_TEAM 的集合，而不是 overwrite source。

parent-team 是 versioned Team command。Link/move 要求 actor 同時具備 child 與新 parent 的管理權；unlink 只要求 child 管理權。管理權可以來自 effective TeamMaintainer，或 current same-scope OrganizationOwner 的 administrative capability。Cross-Organization parent 與 cycle fail closed。

## Privacy read policy

SECRET 的一般可見性只讓 current effective Team member 發現／讀 Team detail 與 active effective members。Current same-scope OrganizationOwner 另有 administrative read/manage capability，可讀 Team detail 與 pending/removed direct rows；這不建立 TeamMembership 或 TeamMaintainer，Owner 的 isMaintainer 仍為 false。VISIBLE 讓 current active Organization member 發現／讀 Team detail 與 active effective members，但不建立 membership。Effective TeamMaintainer 也可看到 pending/removed direct rows。

Collection query因此同時回傳：actor 的 effective Teams，以及同 Organization 的 VISIBLE Teams。Summary 明確標出 `membershipStatus` 與 `membershipType`；`none` 只表示可見但不是 member。

## Notification setting

Team-level `NOTIFICATIONS_DISABLED | NOTIFICATIONS_ENABLED` 是 Team aggregate state，由 effective TeamMaintainer 或 current same-scope OrganizationOwner 以 `settings` command 修改。Enabled 的語意只定義 Team @mention 時的 current effective member recipient population；Team module 不因此建立 recipient Notification、個人 subscription 或 delivery attempt。

Current Team slice 尚未有 Team @mention producer/fan-out。真正 Notification fact、read state、delivery idempotency/retry 仍由 [Notifications](../../owners/notifications.md) owner 管理。

## Commands and consistency

Current Organization Team commands:

- `create-team`：建立 Team + creator membership + maintainer。
- rename-team：effective TeamMaintainer 或 current same-scope OrganizationOwner 修改 name/derived slug。
- `parent-team`：link/move/unlink hierarchy，使用上述雙方管理權規則。
- settings：effective TeamMaintainer 或 current same-scope OrganizationOwner 修改 privacy/notification setting。
- `join`：本人建立 pending direct membership request。
- `membership`：核准／移除 direct membership；self removal 是受限特例。
- `maintainer`：授予／撤銷 TeamMaintainer，維持 last-effective-maintainer invariant。

每個正式 write 都重新核驗 actor/current scope，使用 stable ids、唯一 requestId、normalized fingerprint；existing Team mutation核對 expectedVersion。Exact retry 只可重放相同 command，且 replay 仍重新核對 current User/Organization/Team qualification與必要 maintainer authority。Team aggregate version 在成功 mutation 後增加；失敗 mutation整筆 rollback。

Application use case 擁有七種 command 的資格、replay、current facts 與 Domain transition
編排；單一 mutation transaction Output Port 只暴露必要 scope、opaque evidence 與
Domain values。PostgreSQL adapter 在同一 transaction 維持 governance lock、Team／hierarchy
row locks、expected version、Team／membership／maintainer state 與 receipt 的原子提交。
Query contract 只提供 read capability；Composition Root 組裝 query、mutation adapter 與
use case，公開的 PostgresTeamRepository constructor 與 view／viewByLocator／execute
介面維持不變。

## Repository access source

Repository grant 仍由 Repository owner保存。當 Repository grant target 是 Organization Team，`repository_team_effective_access_sources` 讀取 Team effective membership並保留：

- `grant_team_id`
- `source_team_id`
- `membership_type`
- `depth`
- `grant_version`
- `source_membership_version`

只有存在 explicit Repository Team grant 時 hierarchy membership 才可能形成 Repository access；parent/child 關係本身不是 permission inheritance。若 unlink/revoke 一個來源，aggregate access 只移除該來源，其他 direct/team source仍保留。

## Responsibility integrity

User 暫停／停權、OrganizationMembership 失效或 direct TeamMembership removed 後，都不得繼續提供 current effective Team authority。TeamMaintainer assignment綁定 current versions，舊 assignment 不會因 reactivation 自動復活。

若 direct participant仍承擔其他 owner 的未完成責任，相關 owner/invariant可以阻擋 removal；Team 不自行改派 Issue responsibility。

## Acceptance boundary

Repository source、declarative schema、local/static checks、PostgreSQL integration tests、Supabase readback、deployment與 LINE mobile acceptance 是不同證據。此文件描述 current Organization Team contract；EnterpriseTeam 仍是 Enterprise owner 的獨立 entity，不與 Organization Team hierarchy混用。

## Ownership

Read this file for the Team owner boundary and invariants. Load [detailed reference](team.md) only when the task needs lifecycle / command / locator details.

## 目的與核心模型

Organization Team 是單一 Organization 內的協作責任範圍。每個 Team 有 stable TeamId、不可改綁的 `organizationAccountId`、可變 name/slug、可選 parent Team，以及 Team 自有的 privacy 與 notification setting。LINE group、Workplace、email domain、Repository visibility 都不是 Team identity 或 scope 來源。

TeamMembership 只保存 direct membership truth：`pending | active | removed`。FPT `TeamMembershipType` 的 current 值域是 `IMMEDIATE | CHILD_TEAM | ALL`；其中 `IMMEDIATE` 來自 Team 自己的 active TeamMembership，`CHILD_TEAM` 是 descendant Team 的 active direct membership 對 ancestor Team 的可重建衍生關係，`ALL` 是兩者的集合語意。不得為了 hierarchy 把 child members 複寫成 parent TeamMembership。

FPT `TeamMemberRole` 的 current 值域是 `MAINTAINER | MEMBER`：active direct TeamMembership 表示 MEMBER；額外的 Team-owned TeamMaintainer fact 表示 MAINTAINER。EnterpriseTeam 是 Enterprise-level 的不同 entity、identity 與 lifecycle；不得拿 EnterpriseTeam hierarchy/membership 取代 Organization Team。

## Parent / child hierarchy

- Team 最多一個 `parentTeamId`，parent 與 child 必須屬於同一 Organization。
- Team 不能成為自己的 parent，也不能形成 cycle；database invariant 與 versioned command 都 fail closed。
- Link／move child 到新 parent 時，actor 必須同時具備 child 與新 parent 的管理權；unlink 只要求 child 管理權。管理權可來自 effective TeamMaintainer 或 current same-scope OrganizationOwner。
- Hierarchy mutation 使用 expectedVersion、requestId/fingerprint 與 durable command receipt；失敗 mutation 不增加 Team version。
- Child Team 的 active direct member 在每個 ancestor Team 形成 `CHILD_TEAM` effective membership；來源保留 `sourceTeamId + depth + sourceMembershipVersion`，不改寫 direct membership row。
- Hierarchy 本身不是 Repository permission。只有 Repository 明確授予某個 Team RepositoryPermission 時，該 Team 的 current effective members 才可透過該 grant 取得 Repository access；grant Team 與 membership source 都必須可追蹤。移除一條 hierarchy/source 不得抹掉其他仍有效的 access source。

## Team privacy

FPT `TeamPrivacy` 只有：

- SECRET：一般可見性只授予 current effective Team member。Current same-scope
  OrganizationOwner 另有 administrative read/manage capability，可讀 Team detail 與
  active／pending／removed projection；這不使 Owner 成為 Team member 或 TeamMaintainer，
  isMaintainer 仍為 false。
- `VISIBLE`：任何 current active Organization member 可發現 Team、讀 Team detail 與 active effective member list；這不等於加入 Team。

Pending／removed direct membership 只對 effective TeamMaintainer 或 current same-scope OrganizationOwner 顯示。使用 exact TeamId 提交 join request 不會讓 pending applicant 取得 SECRET Team read。Privacy 不建立 TeamMembership、不授予 TeamMaintainer，也不授予 Repository access。產品建立 Team 的 local default 是 `SECRET`；這是本產品 default，不是對 FPT enum 新增值或改寫定義。

## Team notification setting

FPT `TeamNotificationSetting` 只有：

- `NOTIFICATIONS_DISABLED`：Team 被 @mentioned 時不產生 Team-wide recipient eligibility。
- `NOTIFICATIONS_ENABLED`：Team 被 @mentioned 時，current effective Team members 是可被解析的 recipient population。

Effective TeamMaintainer 或 current same-scope OrganizationOwner 可 versioned 修改此 Team-level setting。產品建立 Team 的 local default 是 `NOTIFICATIONS_DISABLED`。這個設定不是 User→subject subscription，也不是 Notification record 或 delivery attempt：recipient-addressed Notification 與 retry/delivery lifecycle 仍由 Notifications owner 擁有。Current Team runtime 已採用 setting 的 persistence、read 與 mutation；Team @mention event producer／fan-out 尚未在 Team owner 內實作，也不得挪用此 setting 作 PR review delegation。

## TeamMaintainer 責任

Effective TeamMaintainer 或 current same-scope OrganizationOwner 可以核准加入申請、調整 direct TeamMembership、授予／撤銷 TeamMaintainer，以及修改 Team settings/hierarchy。OrganizationOwner 是 scoped administrative authority，不會因此取得 TeamMembership 或 TeamMaintainer fact。Effective TeamMaintainer 表示 User、OrganizationMembership、direct TeamMembership 與 TeamMaintainer RoleAssignment 都仍為 current/active 且 version binding 有效。

Organization Team 必須至少保有一位 effective TeamMaintainer。最後一位 effective TeamMaintainer 不可被撤銷或移除。TeamMembership 狀態變更會增加 membership version，因此 removed／reactivated 狀態不會讓舊 assignment 自動恢復。CHILD_TEAM effective membership 本身不產生 TeamMaintainer。

## 與其他 owner 的邊界

- Organization owner 提供 active Organization／OrganizationMembership scope qualification；Team 不查寫 Organization private state。
- Team 是 TeamMaintainer 與 direct TeamMembership 的唯一 writer，並與 OrganizationOwner 一起決定 Team 管理權。Identity/Access 在現行 Team runtime 只解析 verified request actor；User qualification 由 Account 提供，Team/Organization 權限仍由各自 Owner 的 current facts 與 version binding 決定。資料庫中的 Team subject projection 不是 Identity/Access 已消費 TeamMaintainer facts 或擁有 Team authorization 的 runtime 證據。
- Enterprise owner 擁有 EnterpriseTeam、EnterpriseTeamMembership 與 EnterpriseTeam → Organization assignment；Organization Team 不共用其 identity 或 membership。
- Repository 擁有 Repository access grant；Team 只提供可追蹤 current effective membership projection。Issue 擁有 Issue lifecycle。
- Notifications 擁有 recipient Notification 與 delivery attempts；Team 只擁有 Team-level notification setting。
- Partners、Attendance／Workplace 與 LINE integration 不建立 TeamMembership/TeamMaintainer，也不從 chat membership 推導 Team hierarchy。
