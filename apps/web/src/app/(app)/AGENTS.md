# Authenticated app route group

## GitHub Mobile current slice / remaining target

- Home current 採「My Work / Favorites / Shortcuts / Recent」資訊層級。My Work 顯示真實 Repository/Issue/Discussion/Star 入口；Project 只標示 current-data-only，沒有 active runtime 就不建立可操作頁面。Pull Request 屬 Git/SCM-specific semantic，本產品不引入，不能為了對齊畫面建立假 capability。
- Favorites 直接使用 Repository-owned Star projection；Shortcuts 目前只做固定入口，不建立可儲存 Shortcut truth；Recent 沒有跨 owner canonical activity source 時只顯示明確 empty/unavailable state，不以 browser history 冒充 business activity。
- Inbox 的 All/Unread 是 current transport；Focused 與 Repository Filter 沒有 policy/query contract 時只能呈現 inactive affordance，不能 client-side 猜測。Explore 的 Repository discovery/Star 是 current；Trending、Templates、Activity 沒有 ranking/template/feed owner 時維持 inactive。
- AI current 使用 `/home/assistant` 的 one-shot Ask / Issue-draft Generate / text Review；Profile 由 avatar 進 `/settings`，Preferences 沒有 persistence contract 時不放假 toggle。
- 各主 tab 的排序、URL 與安全返回由父層 app 契約統一；`/repositories` 保留為 collection/workbench，不因移出底部 tab 失去入口。
- Repository 內頁在 resource header 下提供 scope 內導航；全域 tab、resource navigation、list filter 是三層，不互相替代。手機避免多個大按鈕擠壓標題。
- 一般 tab 切換不重做 LIFF 初始化、不自動送命令；直接開啟與返回都回到同一 owner query。未開放入口集中說明，不能用看似可操作的空管理畫面充數。

## 現行 URL 與 invariant

| Current URL | Owner / 定位 |
| --- | --- |
| `/home` | 跨功能工作台組裝 |
| `/home/assistant` | Assistant one-shot Web surface；不保存 durable chat/session，不直接 formal write |
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
