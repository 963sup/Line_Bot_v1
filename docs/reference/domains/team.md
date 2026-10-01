# Team detailed reference

Low-frequency Team details. The owner boundary and invariants remain canonical in [Team](../../owners/team.md).

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

`parent-team` 是 versioned Team command。Link/move 要求 actor 同時維護 child 與新 parent；unlink 只要求 child TeamMaintainer。Cross-Organization parent 與 cycle fail closed。

## Privacy read policy

`SECRET` 只讓 current effective Team member發現／讀 Team detail 與 active effective members。 `VISIBLE` 讓 current active Organization member發現／讀 Team detail與 active effective members，但不建立 membership。Maintainer 額外可看到 pending/removed direct rows。

Collection query因此同時回傳：actor 的 effective Teams，以及同 Organization 的 VISIBLE Teams。Summary 明確標出 `membershipStatus` 與 `membershipType`；`none` 只表示可見但不是 member。

## Notification setting

Team-level `NOTIFICATIONS_DISABLED | NOTIFICATIONS_ENABLED` 是 Team aggregate state，由 TeamMaintainer 以 `settings` command 修改。Enabled 的語意只定義 Team @mention 時的 current effective member recipient population；Team module 不因此建立 recipient Notification、個人 subscription 或 delivery attempt。

Current Team slice 尚未有 Team @mention producer/fan-out。真正 Notification fact、read state、delivery idempotency/retry 仍由 [Notifications](../../owners/notifications.md) owner 管理。

## Commands and consistency

Current Organization Team commands:

- `create-team`：建立 Team + creator membership + maintainer。
- `rename-team`：effective TeamMaintainer 修改 name/derived slug。
- `parent-team`：link/move/unlink hierarchy，使用上述雙方 maintainer 規則。
- `settings`：effective TeamMaintainer 修改 privacy/notification setting。
- `join`：本人建立 pending direct membership request。
- `membership`：核准／移除 direct membership；self removal 是受限特例。
- `maintainer`：授予／撤銷 TeamMaintainer，維持 last-effective-maintainer invariant。

每個正式 write 都重新核驗 actor/current scope，使用 stable ids、唯一 requestId、normalized fingerprint；existing Team mutation核對 expectedVersion。Exact retry 只可重放相同 command，且 replay 仍重新核對 current User/Organization/Team qualification與必要 maintainer authority。Team aggregate version 在成功 mutation 後增加；失敗 mutation整筆 rollback。

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
