# Team

Read this file for the Team owner boundary and invariants. Load [detailed reference](../reference/domains/team.md) only when the task needs lifecycle / command / locator details.

## 目的與核心模型

Organization Team 是單一 Organization 內的協作責任範圍。每個 Team 有 stable TeamId、不可改綁的 `organizationAccountId`、可變 name/slug、可選 parent Team，以及 Team 自有的 privacy 與 notification setting。LINE group、Workplace、email domain、Repository visibility 都不是 Team identity 或 scope 來源。

TeamMembership 只保存 direct membership truth：`pending | active | removed`。FPT `TeamMembershipType` 的 current 值域是 `IMMEDIATE | CHILD_TEAM | ALL`；其中 `IMMEDIATE` 來自 Team 自己的 active TeamMembership，`CHILD_TEAM` 是 descendant Team 的 active direct membership 對 ancestor Team 的可重建衍生關係，`ALL` 是兩者的集合語意。不得為了 hierarchy 把 child members 複寫成 parent TeamMembership。

FPT `TeamMemberRole` 的 current 值域是 `MAINTAINER | MEMBER`：active direct TeamMembership 表示 MEMBER；額外的 Team-owned TeamMaintainer fact 表示 MAINTAINER。EnterpriseTeam 是 Enterprise-level 的不同 entity、identity 與 lifecycle；不得拿 EnterpriseTeam hierarchy/membership 取代 Organization Team。

## Parent / child hierarchy

- Team 最多一個 `parentTeamId`，parent 與 child 必須屬於同一 Organization。
- Team 不能成為自己的 parent，也不能形成 cycle；database invariant 與 versioned command 都 fail closed。
- Link／move child 到新 parent 時，actor 必須同時是 child 與新 parent 的 effective TeamMaintainer；unlink 只要求 child TeamMaintainer。
- Hierarchy mutation 使用 expectedVersion、requestId/fingerprint 與 durable command receipt；失敗 mutation 不增加 Team version。
- Child Team 的 active direct member 在每個 ancestor Team 形成 `CHILD_TEAM` effective membership；來源保留 `sourceTeamId + depth + sourceMembershipVersion`，不改寫 direct membership row。
- Hierarchy 本身不是 Repository permission。只有 Repository 明確授予某個 Team RepositoryPermission 時，該 Team 的 current effective members 才可透過該 grant 取得 Repository access；grant Team 與 membership source 都必須可追蹤。移除一條 hierarchy/source 不得抹掉其他仍有效的 access source。

## Team privacy

FPT `TeamPrivacy` 只有：

- `SECRET`：只有 current effective Team member 可發現 Team、讀 Team detail 與 active member list。
- `VISIBLE`：任何 current active Organization member 可發現 Team、讀 Team detail 與 active effective member list；這不等於加入 Team。

Pending／removed direct membership 只對 effective TeamMaintainer 顯示。使用 exact TeamId 提交 join request 不會讓 pending applicant 取得 SECRET Team read。Privacy 不建立 TeamMembership、不授予 TeamMaintainer，也不授予 Repository access。產品建立 Team 的 local default 是 `SECRET`；這是本產品 default，不是對 FPT enum 新增值或改寫定義。

## Team notification setting

FPT `TeamNotificationSetting` 只有：

- `NOTIFICATIONS_DISABLED`：Team 被 @mentioned 時不產生 Team-wide recipient eligibility。
- `NOTIFICATIONS_ENABLED`：Team 被 @mentioned 時，current effective Team members 是可被解析的 recipient population。

只有 effective TeamMaintainer 可 versioned 修改此 Team-level setting。產品建立 Team 的 local default 是 `NOTIFICATIONS_DISABLED`。這個設定不是 User→subject subscription，也不是 Notification record 或 delivery attempt：recipient-addressed Notification 與 retry/delivery lifecycle 仍由 Notifications owner 擁有。Current Team runtime 已採用 setting 的 persistence、read 與 mutation；Team @mention event producer／fan-out 尚未在 Team owner 內實作，也不得挪用此 setting 作 PR review delegation。

## TeamMaintainer 責任

只有 effective TeamMaintainer 可以核准加入申請、調整 direct TeamMembership、授予／撤銷 TeamMaintainer，以及修改 Team settings/hierarchy。Effective 表示 User、OrganizationMembership、direct TeamMembership 與 TeamMaintainer RoleAssignment 都仍為 current/active 且 version binding 有效。

Organization Team 必須至少保有一位 effective TeamMaintainer。最後一位 effective TeamMaintainer 不可被撤銷或移除。TeamMembership 狀態變更會增加 membership version，因此 removed／reactivated 狀態不會讓舊 assignment 自動恢復。CHILD_TEAM effective membership 本身不產生 TeamMaintainer。

## 與其他 owner 的邊界

- Organization owner 提供 active Organization／OrganizationMembership scope qualification；Team 不查寫 Organization private state。
- Team 是 TeamMaintainer 與 direct TeamMembership 的唯一 writer；Identity/Access 只讀 Team-owned facts 與 current qualification。
- Enterprise owner 擁有 EnterpriseTeam、EnterpriseTeamMembership 與 EnterpriseTeam → Organization assignment；Organization Team 不共用其 identity 或 membership。
- Repository 擁有 Repository access grant；Team 只提供可追蹤 current effective membership projection。Issue 擁有 Issue lifecycle。
- Notifications 擁有 recipient Notification 與 delivery attempts；Team 只擁有 Team-level notification setting。
- Partners、Attendance／Workplace 與 LINE integration 不建立 TeamMembership/TeamMaintainer，也不從 chat membership 推導 Team hierarchy。
