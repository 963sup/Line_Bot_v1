# Authenticated app route group

## GitHub Mobile current slice / remaining target

- Home current 採 GitHub Mobile 的資訊層級語法「My Work / Favorites / Shortcuts」，但內容只組裝本地真實 owner：Repository/Issue、Organization、Enterprise、Team、Attendance、Expense；Favorites 仍直接使用 Repository-owned Star projection，Shortcuts 目前只做固定入口，不建立可儲存 Shortcut truth，也不新增假推薦、假 count、Pull Request 或未啟用 Project 頁面。
- 各主 tab 的排序、URL 與安全返回由父層 app 契約統一；`/repositories` 保留為 collection/workbench，不因移出底部 tab 失去入口。
- Repository 內頁在 resource header 下提供 scope 內導航；全域 tab、resource navigation、list filter 是三層，不互相替代。手機避免多個大按鈕擠壓標題。
- 一般 tab 切換不重做 LIFF 初始化、不自動送命令；直接開啟與返回都回到同一 owner query。未開放入口集中說明，不能用看似可操作的空管理畫面充數。

## 現行 URL 與 invariant

| Current URL | Owner / 定位 |
| --- | --- |
| `/home` | 跨功能工作台組裝 |
| `/attendance`、`/attendance/clock-in`、`/attendance/clock-out` | Attendance 明確查詢／操作 |
| `/diary`、`/expenses` | 外部日誌表單入口／Expense 畫面；不推定已有本地日誌儲存 |
| `/organizations` | Organization collection/governance 工作面；選取狀態不是額外 canonical URL |
| `/team`、`/organizations/{login}/teams/{teamSlug}` | Organization Team 工作台／詳情 |
| `/enterprises`、`/enterprises/{slug}`、`/enterprises/{slug}/teams/{teamSlug}` | Enterprise／EnterpriseTeam；不混用 Organization Team |
| `/partners`、`/partners/news`、`/partners/referrals` | Partners directory/news/referral |
| `/repositories`、`/explore` | Repository 工作台／discovery；不是 Repository identity |
| `/{login}/{repository}/issues`、`…/issues/{issueNumber}` | Repository-local Issue number |
| `/{login}/{repository}/discussions`、`…/discussions/{discussionId}` | Discussion opaque id；目前 read-only，含留言讀取 |
| `/{login}/{repository}/labels` | Repository Label collection；無獨立 detail locator |
| `/{login}/{repository}/milestones`、`…/milestones/{milestoneNumber}` | Repository-local Milestone number；目前 read-only |
| `/notifications`、`/notifications/{notificationId}` | 當前 recipient inbox/detail |
| `/settings`、`/settings/profile`、`/settings/network`、`/settings/permissions` | Viewer 設定，不是另一個 User identity |
| `/history`、`/feedback`、`/planned` | 目前歷史／回饋／規劃中入口；未開放部分保留明示狀態 |

表中 `…` 代表同列 Repository prefix，不是 literal URL。FPT owner/relationship 對照依 apps 父層；URL 不要求與 category 或 module 名稱一一對應。

- Back link 依使用者任務與真實 collection 設計；Partners 與 Organization Team 是不同 owner，不能由現有 `back=/team` 推導隸屬關係。修正需連同 entry consumer／navigation tests 檢查。
- `_shell` 只擁有此工作外框與導覽；不得把 shell 的可見性或選取狀態變成私有 API 的授權依據。

- Authenticated routes compose owner projections and commands for the current trusted Principal; login/session presence alone does not imply business qualification.
- Selected Organization, Team, Employment or resource IDs are intent/scope inputs and must be revalidated by the owner on every protected operation.
- Preserve mobile-first continuation, loading/empty/error distinctions and server authority across client navigation.
