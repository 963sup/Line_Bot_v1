# Team

Read this file for the Team owner boundary and invariants. Load [detailed reference](../reference/domains/team.md) only when the task needs lifecycle / command / locator details.

## 目的與核心模型

Organization Team 是單一 Organization 內的任務協作責任範圍。每個 Team 建立時必須有一個明確、不可改綁的 `organizationAccountId`，不從 LINE group、Workplace、email domain 或既有名稱猜測歸屬。

TeamMembership 只回答某個 User 在 Organization Team 內是 `pending`、`active` 或 `removed`。它不保存 role，也不直接授權。TeamMaintainer 是 `organization-team` scope 的 RoleAssignment；一般成員沒有一個虛構的 `Member` role assignment。

Current runtime 尚未支援 nested Organization Team。Vendored GitHub FPT domain truth 中 Organization Team 存在 parent/child hierarchy semantics，但本產品仍可把 runtime capability 保持未實作；不得用 EnterpriseTeam 或 generic Team alias 代替，也不得因尚未實作而改寫 FPT。EnterpriseTeam 是 Enterprise-level 的不同 current entity，由 Enterprise owner 維護其 membership 與 Organization assignment。

## TeamMaintainer 責任

只有 effective TeamMaintainer 可以核准加入申請、調整其他 TeamMembership 或授予／撤銷 TeamMaintainer。Effective 表示以下條件同時成立：

- User 是 active，且 RoleAssignment 綁定 current User status version。
- Organization 與該 User 的 OrganizationMembership 都是 active。
- TeamMembership 是 active，且 RoleAssignment 綁定 current TeamMembership version。
- TeamMaintainer RoleAssignment 本身是 active。

Organization Team 必須至少保有一位 effective TeamMaintainer。最後一位 effective TeamMaintainer 不可被撤銷或移除。TeamMembership 狀態變更會增加 membership version，因此 removed／reactivated 狀態不會讓舊 assignment 自動恢復。

## 與其他 owner 的邊界

- Organization owner 提供 active Organization／OrganizationMembership scope qualification；Team 不查寫 Organization private state。
- Identity/Access 是 TeamMaintainer RoleAssignment 的唯一 writer；TeamMembership 不複製 role 欄位。
- Enterprise owner 擁有 EnterpriseTeam、EnterpriseTeamMembership 與 EnterpriseTeam → Organization assignment；Organization Team 不讀寫其 private state，也不共用 TeamMaintainer／nested hierarchy。
- Repository 擁有 Repository access；Issue 擁有 Issue lifecycle。Team 不提供 Repository access，也不替 Issue 保存 scope 或 responsibility truth。
- Partners、Attendance／Workplace、Repository 與 Notifications 各自保留授權與資料責任；TeamMaintainer 不自動取得其權限。
- LINE integration 只驗證 provider proof，不把 LINE group 轉成產品 Team。
