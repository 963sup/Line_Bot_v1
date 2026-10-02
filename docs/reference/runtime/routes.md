# Runtime route inventory

Low-frequency route lookup. Route existence does not grant authorization or prove a capability is active.

## Route contract

正式 URL 只有一個 route owner。Route Group 只表達 layout/runtime 分區，不改 URL，也不授予 business permission。

## Public / onboarding / system

| Route | Responsibility |
| --- | --- |
| `/`, `/login`, `/privacy`, `/terms` | 公開內容與登入意圖；不讀 private business data |
| `/{login}` | User / Organization canonical locator；login 只定位，不授權；Account profile visibility 控制個人資料欄位，私人本人資料須重新核驗身分 |
| `/membership/register`, `/membership/restore`, `/complete` | 註冊／恢復與一次性結果；完成後重新讀後端資格 |
| `/auth/callback`, `/unavailable` | OAuth／LINE 接續與特殊結果；不常駐 business state |

## Mobile application routes

| Route | Owner responsibility |
| --- | --- |
| `/home` | 工作台組裝；current IA = Popular Repository projection + primary Workspace links + collapsed More tools。Popular 重用 Repository discovery query，不建立第二份 ranking truth；Issues/Discussions仍先選 Repository再進 canonical scoped route；Projects進入 authorized `/projects` collection；Starred直接進 `/stars`；More 只重排既有 destination，不建立 browser-owned business state |
| `/assistant` | Assistant one-shot Ask / Issue-draft Generate / text Review；current User qualification required，output 不直接形成 formal write；`/home/assistant` 為 compatibility redirect |
| `/attendance`, `/attendance/clock-in`, `/attendance/clock-out` | Attendance 查詢與明確操作 |
| `/diary` | Product external-entry surface；不代表存在 Diary business state |
| `/expenses` | 指定 Expense 操作／結果 |
| `/team` | Organization Team collection/workbench；不是 Team resource identity |
| `/orgs/{organizationLogin}/teams/{teamSlug}` | Authenticated Organization Team canonical detail；slug 由 Team name derive，rename 後 canonical URL 隨新 slug 更新，TeamId 仍是 stable command identity |
| `/organizations/{organizationLogin}/teams/{teamSlug}` | 已發布入口透過 internal rewrite 使用同一 `/orgs/...` page；不反向 redirect，以免與舊版已快取的永久轉址形成循環 |
| `/enterprises`, `/enterprises/{enterpriseSlug}` | Authenticated Enterprise collection / canonical governance detail；slug 只定位，不授權 |
| `/enterprises/{enterpriseSlug}/teams/{teamSlug}` | Authenticated Enterprise Team canonical detail；stable TeamId 由 server 產生，slug 由 name derive並隨 rename 更新 |
| `/partners`, `/partners/news`, `/partners/referrals` | Partners directory / news / referral surfaces |
| `/projects` | Authorized Project collection read；User-owned Project 只對 owner User 可見，Organization-owned Project 目前只對 current `OrganizationOwner` 可見；不宣稱 Project planning write management |
| `/repositories`, `/explore` | Repository collection/workbench、Trending / Awesome Lists / Activity discovery + Star surface |
| `/stars` | Current User 已 Star 且目前仍可存取的 Repository；使用既有 Repository Star query，Home Favorites 為相同 query 的摘要入口 |
| `/issues` | Repository 選擇入口，進入 `/{login}/{repository}/issues`；目前不是跨 Repository Issue aggregate |
| `/repositories/lists`, `/repositories/lists/new` | Current User Repository Star List collection/create；create預設 private，pending requestId 只作 exact-retry presentation metadata |
| `/repositories/lists/{listId}` | Repository Star List detail/manage；stable ListId只定位，private/public read與 mutation仍由 Repository owner重驗 |
| `/repositories/lists/discover` | Awesome Lists presentation：public Repository Star List discovery，只顯示 viewer 可見 Repository/count |
| `/{ownerLogin}/{repositoryName}` | Repository canonical locator；RepositoryId stable，current name 優先，old alias 預設 follow rename；PUBLIC anonymous-readable，PRIVATE explicit access，INTERNAL same current active Enterprise；登入 User 可在此管理 Watch state但 Watch 不授權 |
| `/{ownerLogin}/{repositoryName}/access` | Repository access management；管理 Direct User / Organization Team grants，owner/name 只定位，每次讀寫重新驗 Repository admin 或 OrganizationOwner recovery authority |
| `/{ownerLogin}/{repositoryName}/settings` | Repository lifecycle + address；rename/visibility/archive 與 address 是獨立 replay family，current admin 授權；archive 保留地址但不再作新 clock-in site |
| `/{ownerLogin}/{repositoryName}/issues` | Repository-scoped Issue collection；owner/name 只定位 Repository，read API 重新驗 current User access |
| `/{ownerLogin}/{repositoryName}/issues/{issueNumber}` | Repository-scoped Issue detail；`issueNumber` 是 Repository-local locator，stable IssueId 仍只作 internal identity/command reference；重新解析 owner/name 並驗目前 access |
| `/{ownerLogin}/{repositoryName}/discussions` | Repository-scoped Discussion collection；只讀 authorized conversations，不宣稱 Discussion write management |
| `/{ownerLogin}/{repositoryName}/discussions/{discussionId}` | Repository-scoped Discussion detail；`discussionId` 是本產品 opaque id，不採用 GitHub Discussion number；comments 隨 detail authorized read 載入 |
| `/{ownerLogin}/{repositoryName}/labels` | Repository Label collection；Label 是 Repository-owned classification metadata，沒有獨立 label URL identity |
| `/{ownerLogin}/{repositoryName}/milestones` | Repository Milestone collection；Milestone 是 Repository goal/checkpoint，不等於 Project Milestone |
| `/{ownerLogin}/{repositoryName}/milestones/{milestoneNumber}` | Repository-scoped Milestone detail；`milestoneNumber` 是 Repository-local locator，stable MilestoneId 留在 internal identity |
| `/notifications`, `/notifications/[notificationId]` | recipient-scoped Notification inbox/read-state projection；Issue/Discussion source 每次 read/mark-read 重驗 current Repository access |
| `/history` | 工作紀錄入口 |
| `/{login}` | 唯一 User / Organization Profile；Home 頭像、Rich Menu 個人入口與分享收斂於此。Namespace 解析後使用 stable ID 查 User，不重做 login 解析；只有 trusted active User 與目標 User 相符才載入本人資料、Achievements 與 Settings，其他訪客只有 public projection |
| `/profile` | 已發布個人入口解析：核驗 LINE 身分並取得 Account login 後 replace 至 `/{login}`；不呈現第二個 Profile。缺 login 是資料完整性錯誤，不導向設定或推導名稱 |
| `/trending` | Explore-active Repository discovery secondary surface；沿 Repository 7-day active-Star ranking，只顯示 current-accessible Repository，不建立 Explore/Trending owner |
| `/settings`, `/settings/profile`, `/settings/network`, `/settings/permissions` | authenticated viewer 的 Account/Profile/Follow/Permission command/configuration surfaces；不是第二個 User resource locator |
| `/feedback`, `/planned` | 只有明確定義的功能或「未開放」結果；不得產生假資料 |

Stable ID 只定位 entity，不授權。Detail route 直接開啟、刷新與 list navigation 都必須回同一 authoritative use case，不建立 route-specific business copy。

## Owner-scoped management

Admin partition 已移除。Account 使用者管理位於 `/settings/users`；Identity/Access 權限管理位於 `/settings/permissions`；Partners 名錄維護位於 `/partners/manage`；Repository lifecycle 與地址維護位於 `/{ownerLogin}/{repositoryName}/settings`。Lifecycle 支援 rename / PRIVATE-INTERNAL-PUBLIC / archive-unarchive；地址與 lifecycle 保持不同 request replay family。Repository admin 在該頁用 Google Maps 搜尋、目前位置或移動地圖選點，座標不作為文字欄位呈現；最後儲存仍走既有 expected-version / exact-replay owner contract。各操作仍由 owner contract 在 server 重新授權，沒有替代的集中管理入口。

Google Places／Geocoding 回傳地址只作當次設定草稿並允許使用者修改；使用者按儲存本身不構成 Google Maps Content 長期保存權的法律或契約豁免。Production 啟用前仍須依實際 billing region／agreement 核對 Google Maps Platform 的 attribution、Terms／Privacy Policy 與 caching/storage 限制。

Current / target capability status 回 [Ownership facts](../../facts/ownership.md) 與 [Governance](../../change/README.md)；permission contract 見 [Authorization](../security/permissions.md)。

## API

`/api/**` 是 transport boundary。每一 request 重新驗 identity、qualification、authorization 與 input；頁面已顯示、query parameter 或先前成功操作都不能代替 API authorization。

Route handler 不複製 application use case，concrete adapters 在最外層 composition 注入。

Current Repository-scoped collaboration/resource read API：

| Route | Responsibility |
| --- | --- |
| `/api/issues`, `/api/issues/{issueNumber}` | Issue list/detail read and Issue command transport；保留既有 workbench/default repository、repository id 與 `owner` + `name` selector 行為 |
| `/api/discussions`, `/api/discussions/{discussionId}` | Discussion list/detail/comment read；`discussionId` 是 local opaque id |
| `/api/repository-labels` | Repository Label collection read |
| `/api/repository-milestones`, `/api/repository-milestones/{milestoneNumber}` | Repository Milestone list/detail read；`milestoneNumber` 是 Repository-local number |
| `/api/repository-address` | Repository 地址查詢及 expected-version / exact-replay 地址設定與移除 |
| `/api/repository-management` | Repository settings read + current-admin expected-version/exact-replay rename、visibility、archive、unarchive |
| `/api/repository-subscription` | Current-readable Repository 的 User Watch state；SUBSCRIBED / UNSUBSCRIBED / IGNORED，獨立 version/replay 且不授權 |
| `/api/repository-access` | GET access grant projection；POST expected-version + exact-replay Direct User / Organization Team grant mutation；不建立 Organization/Team membership |
| `/api/projects` | Authorized Project collection read；每次 request 重驗 current User，Organization-owned Project 只接受 current `OrganizationOwner` scope |

Discussion、Label 與 Repository Milestone API 只承接 authorized read，並要求 `owner` + `name` selector。Discussion read lifecycle 由 Discussion owner 承接；Label 與 Repository Milestone 仍由 Repository owner 承接。各自的 create/update/delete/close/comment write management 尚未成為 runtime capability。Project aggregate-root read 已 active；Project planning create/update、WBS/Item/Milestone mutation 仍是 data-only。

## Same-page view state

目前可由 URL 保存的白名單 view intent 包含：

- Notifications：`notificationView=all|unread`
- Repository：`repository=<stable RepositoryId>` 只選擇目前可存取的 Repository
- Repository Issues：`issueView=all|mine|created`
- Partners：`partnerView=news|directory|referrals`

省略、重複或非法值回到各自安全預設／拒絕規則。View value 只代表 navigation intent，不授予 team role、publish permission 或 command authorization。

View change 可以使用 browser history 支援 direct open、refresh、back/forward；URL 不保存 token、任意 return URL、private draft、team selection、pagination cursor 或 authorization decision。

送出中的 command / unknown result 不能因 view change、refresh 或 route remount 自動變成第二個 command。

## MINI App entry

LIFF state decoding、entry intent 白名單與 login continuation 由 [LINE MINI App](../line/identity.md) 擁有；route contract 不複製平台 SDK 行為。
