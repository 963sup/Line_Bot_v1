# Web API transport boundary

`GET/POST /api/repository-wiki` resolves `owner`/`name` through current Repository access after verified LINE identity/active Account mapping. GET transports list/page/history/compare queries; POST transports existing Wiki commands, with exact resolved RepositoryId matching, origin/JSON/size checks and owner-side replay/version authorization. Actor/role in input never authorizes; archived Repository is read-only.

`GET /api/repository-insights` transports Insights Repository Pulse. `owner`/`name` locate current Repository scope; optional `from`/`to` are nonnegative epoch milliseconds with `[from,to)` semantics. Verified LINE identity maps to an active User, and each source rechecks authorization. Authorization fails closed; infrastructure source failure stays explicitly unavailable. No mutation endpoint.

`GET /api/repository-overview` uses `owner`/`name` as locators and verified active User identity for current Repository scope. It composes canonical Repository metadata and WBS-owned legacy-entry eligibility only; no content document, transfer destination, inferred Project association or metric count is returned. Legacy source failure remains explicit and retryable.

`/api/project-wbs` GET/POST and `/api/project-wbs/history` GET are the current WBS owner transports. They use verified LINE identity and the Project owner's current content-scope contract; initialization is an explicit version-zero command. Project identity only locates the scope. Revision is immutable saved content, not a Baseline or acceptance decision.

`/api/project-wbs/governance` GET/POST transports WBS policy, proposal, exact-version review and atomic Baseline publication. `/api/project-wbs/metrics` GET transports WBS-owned current draft/Baseline metrics. Both recheck current Project access and lifecycle; governance version is separate from draft content version. Policy/version gates, origin checks and exact replay remain authoritative; publication is not deliverable acceptance.

`/api/repository-wbs`, its history/governance routes and Repository Insights are R1 predecessor transports retained only for verified cutover. `GET /api/repository-wbs/transfer` returns the current source User owner's live intent. POST records an exact Repository source version/head and target Project request only after source/target authorization, destination and dependent-state preflight. `POST /api/repository-wbs/transfer/cancel` lets the current source User owner exactly replay withdrawal of `REQUESTED`, independently of target Project access or deletion. Cancellation preserves the captured snapshot and cannot affect `ACTIVE`. Web does not execute or activate transfer; trusted Release execution rechecks the snapshot, destination and dependencies.


## 現行 URL 與 invariant

## Current transport map

以下是現有 route families；HTTP method、request/response shape 以各 `route.ts` 與 owner public contract 核對，不從 REST 單複數或 FPT mutation 名稱猜測。

| URL | Owner / scope |
| --- | --- |
| `/api/membership`、`/api/membership/register`、`/api/membership/restore`、`/api/membership/manage`、`/api/membership/google-link` | Account 與明確組裝的既有 membership wire contract；GET `view=account` 是 Account-only projection，default/readback/checkIn 仍保留既有 DailyCheckIn composition；Google protocol 由 integration 擁有 |
| `/api/auth` | GET 只讀有效 HttpOnly cookie 的 session generation，供續期失敗後核對；POST `{action:"restore"}` 一次驗證並續期既有 cookie session，或 `{accessToken}` 以伺服器驗證的 LINE proof 建立／切換 session；PATCH 以已知 generation 續期，DELETE 撤銷；不承載 Account qualification 或 business permission |
| `/api/profile`、`/api/profile/achievements`、`/api/profile/status`、`/api/follows` | Account Profile / earned Achievement read projection / authored Profile status / Follow；status POST 使用 requestId + expectedVersion，Follow 的 login locator 經 Namespace 解析後交 Account 重驗 |
| `/api/permissions` | Identity/Access；不能因 Web presenter 在 account 目錄就歸為 Account domain |
| `/api/organization`、`/api/team`、`/api/enterprise` | 各自 owner 的治理、scope 與命令；EnterpriseTeam 不共用 Organization Team 語意 |
| `/api/issues`、`/api/issues/{issueNumber}` | Issue owner transport；Repository-scoped read returns canonical `state/stateReason`, local `workflowStatus`, body and assignees；POST carries replay-safe create/workflow/edit/close/reopen/add-remove-assignees commands；GET `workflowStatus` is canonical and legacy `status` remains a temporary alias |
| `/api/issue-types` | Issue owner Organization-scoped IssueType definition read/manage；current active `OrganizationOwner` only，create/update/delete 與 Issue assign/clear 分離 |
| `/api/issue-collaboration` | Issue collaboration transport；comments/labels/milestone/relations/lock、IssueType assign/clear 及固定 Object Revision 引用共用 Issue expected-version/exact-replay aggregate mutation；Object 來源資格由其公開契約重驗 |
| `/api/discussions`、`/api/discussions/{discussionId}` | Discussion owner transport；Repository-scoped authorized GET，必須提供 `owner` + `name` |
| `/api/repository-labels` | GET：Repository Label authorized collection read，必須提供 `owner` + `name`；POST：Repository-owned replay-safe Label create/update/delete definition mutation |
| `/api/repository-milestones`、`/api/repository-milestones/{milestoneNumber}` | GET：Repository Milestone authorized collection/detail read，必須提供 `owner` + `name`；collection POST：Repository-owned replay-safe Milestone create/update/open/close definition mutation |
| `/api/repositories` | GET：Current User 的 explicit-access Repository collection；POST：Repository owner contract 的 replay-safe PRIVATE / INTERNAL / PUBLIC Repository create |
| `/api/repository-management` | GET：current Repository settings projection；POST：current admin replay-safe rename/visibility/archive/unarchive with expected Repository version |
| `/api/repository-subscription` | GET/POST：current-readable Repository 的 User Watch state；exact SUBSCRIBED / UNSUBSCRIBED / IGNORED，subscription 不授權 |
| `/api/repository-object-types`、`/api/repository-objects`、`/api/repository-object-relationships` | Object owner 的分類、版本化內容與同 Repository 有向關係；verified LINE identity、current Repository scope、expected version 與 exact retry 由 owner contract 重驗 |
| `/api/project-wbs`、`/api/project-wbs/history` | Project WBS content command/current view 與 immutable Revision history；current Project access/lifecycle、expected version 與 exact replay 由 owner contract 決定 |
| `/api/project-wbs/governance`、`/api/project-wbs/metrics` | Project WBS policy/proposal/review/Baseline command and read transport，以及 WBS-owned current metrics；Project 僅供目前授權與 lifecycle |
| `/api/repository-wbs/transfer`、`/api/repository-wbs/transfer/cancel` | R1 live-intent read、preflighted request 與 current source User owner exact-replay withdrawal；cancel 不依賴 target Project 且不適用 ACTIVE，Web 不執行 Release-only transfer |
| `/api/repository-access` | GET：Repository access management projection；POST：replay-safe Direct User / Organization Team grant mutation；owner/name/request body 只定位與表達 intent，不授權 |
| `/api/repository-address` | GET：current effective Repository member address projection；POST：current effective Repository admin replay-safe address set/remove；public visibility does not grant this read |
| `/api/repositories/owners` | Repository create owner options：current User 本人 + Organization scopes with at least one allowed visibility under current Owner/member creation policy；Organization option 回 allowed visibilities 與 current INTERNAL eligibility |
| `/api/repositories/explore` | GET：Repository Trending + current-access-filtered Issue Activity；`view=activity` 只讀 Issue Activity，不執行 Trending；POST：Repository Star/unstar transport |
| `/api/repositories/starred` | Current User 的 Repository Star projection；仍由 Repository owner 授權與查詢 |\n| `/api/repositories/lists`、`/api/repositories/lists/{listId}` | Repository Star List owner lifecycle；create預設 private，mutation使用 stable requestId + expectedVersion，item add 仍由 Repository owner重驗 Star/access |\n| `/api/repositories/lists/discover` | Published Repository Star List discovery projection；只計算並預覽 viewer 當下可見的 Repository items |
| `/api/audit` | Audit read query over Identity/Access governance evidence; exact current EnterpriseOwner / OrganizationOwner scope required |
| `/api/notifications` | recipient-scoped Notifications；Issue/Discussion-backed source 在 create/read/mark-read 都需 current Repository source access |
| `/api/assistant` | Assistant Ask / Issue-draft Generate / text Review transport；current User qualification required，output 不形成 formal write |
| `/api/attendance`、`/api/attendance/clock-in`、`/api/attendance/clock-out`、`/api/attendance/supplements`、`/api/attendance/supplements/review` | Attendance 現行 subject 與 Repository 座標／半徑打卡契約（描述地址可為 null）；補登 request 由 User 提出，決策時重驗該 Repository 當下 effective ADMIN |
| `/api/expenses/{id}`、`/api/partners` | Expense／Partners |
| `/api/line/webhook` | LINE 驗簽、Bot qualification 與 event delivery，再交各 owner |
| `/api/internal/attendance-maintenance` | Attendance 內部維護；不是一般使用者入口 |
| `/api/health` | 技術健康狀態；不證明所有 business capability 可用 |

FPT queries/mutations 是 GitHub GraphQL domain truth；它們定義 GitHub semantics，但不要求 Line_Bot_v1 使用 GraphQL transport 或每個 entity 一個 API。URL 改名需明確 consumer migration；不能為目錄一致新增平行 writer、改歷史 payload 或繞過原 replay。

`_composition/*.server.ts` 組裝 concrete adapters，module 接收明確 dependency；不把 `_composition` 變成下層任意查找服務的 registry。新增 route 時同步所屬 module AGENTS、上層 URL 契約與對應 HTTP/browser tests。

- Route handlers own transport parsing, response/error mapping and composition lookup only; business lifecycle, authorization, persistence and transaction ownership remain in the owning package.
- Every route must pass explicit stable IDs, scope, expected version and request identity to the owner contract when required; URL, body role, selected UI scope or session cache is not authority.
- Keep HTTP/LINE wire contracts and failure classification stable during module moves; do not implement a second use case or query private tables from a route.
- API tests must cover unauthorized/forbidden, wrong scope, stale/replay conflict, unavailable source and unknown-result behavior where the owner supports those states.
