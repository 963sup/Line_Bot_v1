# Runtime route inventory

Low-frequency route lookup. Route existence does not grant authorization or prove a capability is active.

## Repository engineering delivery

| Route | Owner responsibility |
| --- | --- |
| `/{login}/{repository}/content` | Content work hierarchy, plan quantities, exact physical resource pins and coherent plan versions |
| `/{login}/{repository}/files` | Repository-scoped protected File collection, bounded Web Upload/Download, explicitly selected Processor, Run History and local Preview→Save/Discard |
| `/{login}/{repository}/resources` | Resources Location / Equipment / Material identity and lifecycle |
| `/{login}/{repository}/contracts` | Contract commitments against exact Content Work/Task plan items |
| `/{login}/{repository}/executions` | Execution Task actuals, prerequisite graph, resource use and internal review |

The corresponding `/api/repository-content`, `/api/repository-files`,
`/api/repository-resources`, `/api/repository-contracts` and `/api/repository-executions`
transports consume public owner capabilities. Each request verifies current identity and Repository scope; POST checks Origin,
bounded input and exact body/URL Repository agreement. File Upload uses bounded multipart
with a 3 MB Web limit and never silently starts a Processor. Content and physical Resources
have distinct identities and lifecycle contracts.

## Route contract

正式 URL 只有一個 route owner。Route Group 只表達 layout/runtime 分區，不改 URL，也不授予 business permission。

共用 frame 與主要導覽由 `app/_shell` 提供。Mobile 的 `(tabs)`／`(secondary)` layout 在各自 group 的軟導覽保留外殼；跨 group 允許重建。外層 mobile layout 只擁有原有 LineSessionGate。Profile resolver、自動打卡、compatibility redirect 不套工作頁外殼；Expense 由 EntryResolver 完成後才顯示外殼。Public canonical Profile 重用 frame，但本人控制項與導覽仍由 Profile 的可信 viewer 判斷，公開內容不受 mobile gate 阻擋。Repository 維持自己的共同 layout。

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
| `/attendance`, `/attendance/clock-in`, `/attendance/clock-out` | Attendance 查詢、明確打卡、補登申請與 Repository ADMIN 審核 |
| `/diary` | Product external-entry surface；不代表存在 Diary business state |
| `/expenses` | 指定 Expense 操作／結果 |
| `/team` | Organization Team collection/workbench；不是 Team resource identity |
| `/orgs/{organizationLogin}/teams/{teamSlug}` | Authenticated Organization Team canonical detail；slug 由 Team name derive，rename 後 canonical URL 隨新 slug 更新，TeamId 仍是 stable command identity |
| `/organizations/{organizationLogin}/teams/{teamSlug}` | 已發布入口透過 internal rewrite 使用同一 `/orgs/...` page；不反向 redirect，以免與舊版已快取的永久轉址形成循環 |
| `/enterprises`, `/enterprises/{enterpriseSlug}` | Authenticated Enterprise collection / canonical governance detail；slug 只定位，不授權 |
| `/enterprises/{enterpriseSlug}/teams/{teamSlug}` | Authenticated Enterprise Team canonical detail；stable TeamId 由 server 產生，slug 由 name derive並隨 rename 更新 |
| `/partners`, `/partners/news`, `/partners/referrals` | Partners directory / news / referral surfaces |
| `/projects` | Authorized Project collection；可建立 Personal/Organization Project 並進入 Project detail；Project-owned User/Team collaborator grants 與 public read projection 都由 Project owner重驗，來源 Repository/Issue 仍逐項重驗 access；planning write management 由 `/api/project-management` 承接 |
| `/projects/new`、`/projects/{projectId}` | Project create/detail presentation；detail 由 Project `ADMIN` 管理設定與協作者、由 `WRITE`/`ADMIN` 維護 Project-local DraftIssue 與 progress 欄位，命令使用 owner current role、expected version 與 replay contract；不改寫來源 Issue |
| `/projects/{projectId}/wbs` | Project-scoped WBS 編輯、不可變歷史、提案與審查；WRITE 可審查，ADMIN 才能發布 Baseline。Project 身分只定位，讀寫均重驗目前 Project access |
| `/repositories`, `/explore` | Repository collection/workbench、Trending / Awesome Lists / Activity discovery + Star surface |
| `/stars` | Current User 已 Star 且目前仍可存取的 Repository；使用既有 Repository Star query，Home Favorites 為相同 query 的摘要入口 |
| `/issues` | Repository 選擇入口，進入 `/{login}/{repository}/issues`；目前不是跨 Repository Issue aggregate |
| `/repositories/lists`, `/repositories/lists/new` | Current User Repository Star List collection/create；create預設 private，pending requestId 只作 exact-retry presentation metadata |
| `/repositories/lists/{listId}` | Repository Star List detail/manage；stable ListId只定位，private/public read與 mutation仍由 Repository owner重驗 |
| `/repositories/lists/discover` | Awesome Lists presentation：public Repository Star List discovery，只顯示 viewer 可見 Repository/count |
| `/{ownerLogin}/{repositoryName}` | Repository Overview 與內容入口；RepositoryId stable，current name 優先，old alias 預設 follow rename；PUBLIC anonymous-readable，PRIVATE explicit access，INTERNAL same current active Enterprise；登入 User 可管理 Watch，舊 WBS 恢復入口依 durable source/live transfer 顯示，Projects 不暗示關聯或繼承權限 |
| `/{ownerLogin}/{repositoryName}/access` | Repository access management；管理 Direct User / Organization Team grants，owner/name 只定位，每次讀寫重新驗有效 Repository admin（含 OrganizationOwner implicit admin） |
| `/{ownerLogin}/{repositoryName}/settings` | Repository lifecycle + address；rename/visibility/archive 與 address 是獨立 replay family，current admin 授權；archive 保留地址但不再作新 clock-in site |
| `/{ownerLogin}/{repositoryName}/issues` | Repository-scoped Issue collection；owner/name 只定位 Repository，read API 重新驗 current User access |
| `/{ownerLogin}/{repositoryName}/issues/{issueNumber}` | Repository-scoped Issue detail；`issueNumber` 是 Repository-local locator，stable IssueId 仍只作 internal identity/command reference；重新解析 owner/name 並驗目前 access |
| `/{ownerLogin}/{repositoryName}/discussions` | Repository-scoped Discussion collection；authorized read 與 Discussion owner 的 current management capability 分離，list navigation 優先使用 canonical number locator |
| `/{ownerLogin}/{repositoryName}/discussions/number/{discussionNumber}` | Repository-scoped canonical Discussion detail；`discussionNumber` 是 Repository-local locator，stable DiscussionId 仍是 internal identity；每次 read 重新驗 access |
| `/{ownerLogin}/{repositoryName}/discussions/{discussionId}` | Opaque DiscussionId compatibility detail；只供 pre-parity `number=null` 舊資料 fallback，不能取代 canonical Discussion.number 或授權 |
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

Admin partition 已移除。Account 使用者管理位於 `/settings/users`；Identity/Access 權限管理位於 `/settings/permissions`；Partners 名錄維護位於 `/partners/manage`；Repository lifecycle 與打卡點維護位於 `/{ownerLogin}/{repositoryName}/settings`。Lifecycle 支援 rename / PRIVATE-INTERNAL-PUBLIC / archive-unarchive；打卡點與 lifecycle 保持不同 request replay family。Repository admin 在該頁用 Google Maps 搜尋、目前位置或明確地圖操作選點，座標不作為文字欄位呈現；座標與半徑決定打卡點，地址描述選填，無地址搜尋或反向地理編碼結果仍可儲存；最後儲存仍走既有 expected-version / exact-replay owner contract。各操作仍由 owner contract 在 server 重新授權，沒有替代的集中管理入口。

Google Places／Geocoding 回傳地址只作當次設定草稿並允許使用者修改；使用者按儲存本身不構成 Google Maps Content 長期保存權的法律或契約豁免。Production 啟用前仍須依實際 billing region／agreement 核對 Google Maps Platform 的 attribution、Terms／Privacy Policy 與 caching/storage 限制。

Current capability status 回 [Ownership facts](../../facts/ownership.md) 與 owner/package source；permission contract 見 [Authorization](../security/permissions.md)。

## API

`/api/**` 是 transport boundary。每一 request 重新驗 identity、qualification、authorization 與 input；頁面已顯示、query parameter 或先前成功操作都不能代替 API authorization。

Route handler 不複製 application use case，concrete adapters 在最外層 composition 注入。

Current Repository-scoped collaboration/resource API：

| Route | Responsibility |
| --- | --- |
| `/api/attendance`, `/api/attendance/clock-in`, `/api/attendance/clock-out`, `/api/attendance/supplements`, `/api/attendance/supplements/review` | Attendance state / clock commands / User-submitted supplement requests / effective Repository ADMIN decisions；所有 protected call 重新驗證 identity，review 每次重驗 Repository access |
| `/api/issues`, `/api/issues/{issueNumber}` | Issue list/detail read and replay-safe command transport；read 投影分開回 canonical `state/stateReason` 與 local `workflowStatus`，並含 body/assignees；保留 workbench/default repository、repository id 與 `owner` + `name` selector 行為 |
| `/api/issue-types` | Organization-scoped IssueType definition list/create/update/delete；current active `OrganizationOwner` only，disabled/tombstone lifecycle independent from Issue workflow/permission |
| `/api/issue-collaboration` | Issue collaboration + nullable IssueType assign/clear；assignment rechecks Repository triage authority and same Organization scope |
| `/api/discussions`, `/api/discussions/{discussionId}`, `/api/discussions/by-number/{discussionNumber}` | Discussion list/detail/comment read；number 是 canonical Repository-local locator，opaque id 只保留 compatibility read |
| `/api/discussion-management` | Discussion current write lifecycle/collaboration transport；create/update/close/reopen/comment/category/answer/label/upvote/poll/lock 依 Repository current access、expectedVersion、exact replay 與 Discussion events 驗證 |
| `/api/repository-labels` | Repository Label collection read |
| `/api/repository-milestones`, `/api/repository-milestones/{milestoneNumber}` | Repository Milestone list/detail read；`milestoneNumber` 是 Repository-local number |
| `/api/repository-address` | Repository 打卡點查詢及 expected-version / exact-replay 設定與移除；地址描述允許 null |
| `/api/repository-management` | Repository settings read + current-admin expected-version/exact-replay rename、visibility、archive、unarchive |
| `/api/repository-subscription` | Current-readable Repository 的 User Watch state；SUBSCRIBED / UNSUBSCRIBED / IGNORED，獨立 version/replay 且不授權 |
| `/api/repository-overview` | Verified active User 與 current Repository scope 的唯讀摘要；WBS Owner 提供舊入口 eligibility，失敗明示 unavailable；不回傳 Project 目的地或推測統計 |
| `/api/repository-files` | Authenticated Repository-scoped File List/detail/ProcessingRun history、受保護小檔下載與 multipart 上傳、單次手動 Run/Save/Discard；Server 驗身份與 Repository scope，File owner 重驗權限與版本 |
| `/api/repository-access` | GET access grant projection；POST expected-version + exact-replay Direct User / Organization Team grant mutation；不建立 Organization/Team membership |
| `/api/projects` | Authorized Project collection read；Project-owned collaborator/public read policy與來源 access 每次重新驗證 |
| `/api/projects/by-number/{projectNumber}` | owner-scoped canonical Project number lookup；owner login + number 只定位，仍重新驗 current Project access |
| `/api/project-management` | Project current planning management；root lifecycle、User/Team collaborator、Item/DraftIssue、typed fields/values、views、status updates 都保留 expectedVersion/exact replay 與 immutable Project events |
| `/api/project-management/users` | Project-scoped User lookup；exact login candidate 僅供 current Project ADMIN 邀請，label lookup 只接受 snapshot 中已可見的 User IDs |
| `/api/project-wbs`、`/api/project-wbs/history` | Project WBS content commands 與 immutable Revision history；projectId、獨立 content version 與 exact request replay |
| `/api/project-wbs/governance`、`/api/project-wbs/metrics` | Project WBS 提案、版本綁定審查、Baseline 與目前指標；所有來源讀取重驗 Project access |
| `/api/repository-wbs/transfer`、`/api/repository-wbs/transfer/cancel` | R1 Source User owner 讀取目前 intent（單一 repositoryId，或完整 owner/name 經 Repository current access 解析）、提交精確 source/head/target 請求或以獨立 requestId 撤回 REQUESTED；410 後仍可查詢 ACTIVE 目的地。保留快照與 CANCELLED 回執，資料移轉由 Release-only operator 執行 |

Discussion read 與 current management write 都由 Discussion owner 承接；read locator 不授權，write 仍逐次重驗 Repository access、version 與 replay。Project aggregate-root read 與 `manage-project-planning` 都已 current；Project-owned collaborator、Item/DraftIssue、typed fields/values、views、status updates 是正式 runtime capability，來源 Repository/Issue authority 不轉移。Project WBS 由 WBS Owner 管理內容與治理，Project 提供目前授權與生命週期；Project-local Milestone 仍是獨立 planning persistence。

## Same-page view state

目前可由 URL 保存的白名單 view intent 包含：

- Notifications：`notificationView=all|unread`
- Repository：`repository=<stable RepositoryId>` 只選擇目前可存取的 Repository
- Repository Issues：`issueView=all|mine|created`；local workflow filter 使用 `workflowStatus=pending|active|review|completed`，舊 `status` 僅保留 transport 相容
- Partners：`partnerView=news|directory|referrals`

省略、重複或非法值回到各自安全預設／拒絕規則。View value 只代表 navigation intent，不授予 team role、publish permission 或 command authorization。

View change 可以使用 browser history 支援 direct open、refresh、back/forward；URL 不保存 token、任意 return URL、private draft、team selection、pagination cursor 或 authorization decision。

送出中的 command / unknown result 不能因 view change、refresh 或 route remount 自動變成第二個 command。

## MINI App entry

LIFF state decoding、entry intent 白名單與 login continuation 由 [LINE MINI App](../line/identity.md) 擁有；route contract 不複製平台 SDK 行為。
