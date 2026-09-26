# Runtime architecture

## App Router partitions

`apps/web/src/app` 目前使用 `(public)/`、`(resource)/`、`(onboarding)/`、`(mobile)/`、`(admin)/`、`(system)/` 與 `api/`。`(mobile)` 擁有 Mobile / LINE MINI App delivery；Repository canonical identity 與 Repository-scoped subresources 統一由 `(resource)` 擁有。Route Group 只分 runtime/layout responsibility，不改正式 URL，也不產生新的 authorization；相同正式 URL 只有一個 route owner。

## Next.js module-graph boundary

App Router 的 Server / Client boundary 是 source module graph 邊界。Server Component／route 可使用 server-only dependency；`'use client'` 後可達 dependency 必須 browser-safe。Route Handler 能存取 environment/database 不代表它取得 business rule ownership。Runtime placement 與 Layer／Bounded Context 是不同問題。

## Runtime responsibilities

| Partition | Runtime responsibility |
| --- | --- |
| `public` | 公開內容與登入入口；不讀 private business data |
| `resource` | Canonical resource URL；同一 Repository locator 可解析 public projection，或在可信 identity 後解析 authorized private/internal projection；URL 本身不授權 |
| `onboarding` | 可信外部身分後執行註冊／恢復等設定流程 |
| `mobile` | Mobile / LINE MINI App application delivery；shell/navigation/composition 不取得 business authority，各功能仍自行核驗 current User／business scope |
| `admin` | 管理 UI shell；私有讀寫仍依 feature permission / module contract 驗證 |
| `system` | OAuth callback、一次性接續、特殊結果；不常駐 business state |
| `api` | HTTP transport；每個 request 自行驗證 identity、qualification、input 與 authorization |

Browser 可以保存 presentation state、白名單 navigation intent 與 pending command metadata，但不能成為 identity、role/permission、version、durable replay 或 secret authority。Browser 提供的 Member/User ID、role、scope、version、return URL、operation state 都只是 input/intent；server 依 owner contract 重驗。

## Route ownership and URL state

Page／route handler 負責 transport 與組裝，不複製 use case。Feature business rules 由 `010-domain-owners/*` 與 application/domain owner 維護。Stable ID 可以出現在 URL，但只定位、不授權；URL 不保存 credential、arbitrary return URL、private draft、authorization decision 或 mutable server version authority。

MINI App/login intent 白名單由 [LINE MINI App](../030-platform/010-line.md) 擁有。

## Account、Organization、Enterprise 與 Team 的 MINI App 實作對照

| 使用者任務 | MINI App／Next.js surface | 權威來源與實作界線 |
| --- | --- | --- |
| 查看 User／管理目前 viewer 設定、登入與恢復資格 | `/{login}`、`/settings/*`、onboarding 與 LINE identity flow | Account/User current qualification；`login` 是 User locator，authenticated viewer 只是 self-resolution context，不建立 `/me` 第二套 identity；register/restore 各自擁有明確流程 |
| 選擇可參與的 Organization | 經 server 授權的組織列表與詳情 | Organization query 回傳可讀 summary；URL/local storage/LINE group 不建立 participation |
| 管理 Organization 成員 | 成員列表、加入／移除操作及確認結果 | Organization owns invitation/direct membership source/effective membership；Identity/Access owns scoped RoleAssignment |
| 管理 Organization Team | 組織內 Team 列表、詳情與成員管理 | Team owner 驗證 immutable Organization scope、Organization participation、TeamMembership 與 TeamMaintainer invariant；不是 EnterpriseTeam alias |
| 管理 Enterprise | `/enterprises` collection + authenticated `/enterprises/{slug}` canonical detail | Enterprise query/command；slug 只定位，治理 relation 不授予 Organization private writer |
| 管理 EnterpriseTeam | Enterprise 內獨立 Team 列表、建立、成員與 Organization assignment | Enterprise owner；Team assignment 形成 `enterprise-team` Organization membership source，不重用 Organization Team storage/role/hierarchy |

每一條私有讀寫沿 `LINE proof → server identity/qualification → application use case → domain/port → infrastructure transaction`。Page／Route Handler 只接 transport；`app/api/_composition` 組裝 concrete adapters。Mutation 仍重驗目前資格、scope、version/replay。

EnterpriseTeam surface 已是 current slice，但 GitHub outside collaborator、Enterprise Team role/licensing/ruleset bypass 等尚未有本地 owner/consumer，不因 UI 可見而宣稱完成。其他尚未完成能力按實際 slice 開 UI：Employment、Attendance Employment cutover、Payroll 等需同時完成其持久化、授權、replay/audit、錯誤映射與對應畫面，不用 mock UI 宣稱完成。

## Write lifecycle

有副作用操作的 UI 區分 `editing/confirm → sending → confirmed result | explicit rejection | unknown result`。Unknown result 不產生第二個 command；支援 replay 的功能保存原 request identity/內容並重新核驗目前 actor。Client optimistic state 只能暫時呈現 intent，server result/current state 可覆蓋。

## Background runtime

Worker／cron／outbox 只執行 durable source 建立的待辦；外部 callback/delivery success 不反向成為 business transaction authority。Background worker 不重新發明 business command；需要 current authorization/state 時仍重驗。

## Parallel / nested routes

只有需要獨立 navigation state、loading/error boundary 或持續 layout state 的真實需求才使用 Parallel/Intercepting Routes；一般卡片並排不構成預建 slot 的理由。

## Adjacent owners

- Product experience：[Product experience](../000-core/060-product-experience.md)
- LINE entry：[LINE](../030-platform/010-line.md)
- Authentication / authorization：[Security](../050-security/README.md)
- Monorepo / layering：[Repository architecture](010-repository-architecture.md) · [Hexagonal architecture](020-hexagonal-architecture.md)


## Route contract

正式 URL 只有一個 route owner。Route Group 只表達 layout/runtime 分區，不改 URL，也不授予 business permission。

## Public / onboarding / system

| Route | Responsibility |
| --- | --- |
| `/`, `/login`, `/privacy`, `/terms` | 公開內容與登入意圖；不讀 private business data |
| `/{login}` | User / Organization public locator；login 只定位，不授權，User 是否公開依 Account profile visibility |
| `/membership/register`, `/membership/restore`, `/complete` | 註冊／恢復與一次性結果；完成後重新讀後端資格 |
| `/auth/callback`, `/unavailable` | OAuth／LINE 接續與特殊結果；不常駐 business state |

## Mobile application routes

| Route | Owner responsibility |
| --- | --- |
| `/home` | 工作台組裝；current IA = My Work / Favorites / Shortcuts / Recent。Issues/Discussions先選 Repository再進 canonical scoped route；Projects無 runtime時只顯示 target；Favorites重用 Star；Shortcuts不持久化；Recent無 owner時不造資料 |
| `/assistant` | Assistant one-shot Ask / Issue-draft Generate / text Review；current User qualification required，output 不直接形成 formal write；`/home/assistant` 為 compatibility redirect |
| `/attendance`, `/attendance/clock-in`, `/attendance/clock-out` | Attendance 查詢與明確操作 |
| `/diary` | Product external-entry surface；不代表存在 Diary business state |
| `/expenses` | 指定 Expense 操作／結果 |
| `/team` | Organization Team collection/workbench；不是 Team resource identity |
| `/organizations/{organizationLogin}/teams/{teamSlug}` | Authenticated Organization Team canonical detail；slug 由 Team name derive，rename 後 canonical URL 隨新 slug 更新，TeamId 仍是 stable command identity |
| `/enterprises`, `/enterprises/{enterpriseSlug}` | Authenticated Enterprise collection / canonical governance detail；slug 只定位，不授權 |
| `/enterprises/{enterpriseSlug}/teams/{teamSlug}` | Authenticated Enterprise Team canonical detail；stable TeamId 由 server 產生，slug 由 name derive並隨 rename 更新 |
| `/partners`, `/partners/news`, `/partners/referrals` | Partners directory / news / referral surfaces |
| `/repositories`, `/explore` | Repository collection/workbench、Trending / Awesome Lists / Activity discovery + Star surface |\n| `/repositories/lists`, `/repositories/lists/new` | Current User Repository Star List collection/create；create預設 private，pending requestId 只作 exact-retry presentation metadata |\n| `/repositories/lists/{listId}` | Repository Star List detail/manage；stable ListId只定位，private/public read與 mutation仍由 Repository owner重驗 |\n| `/repositories/lists/discover` | Awesome Lists presentation：public Repository Star List discovery，只顯示 viewer 可見 Repository/count |
| `/{ownerLogin}/{repositoryName}` | Repository canonical locator；owner 是 User 或 Organization login；public 直接讀 public projection，private/internal 重新驗目前 User access |
| `/{ownerLogin}/{repositoryName}/issues` | Repository-scoped Issue collection；owner/name 只定位 Repository，read API 重新驗 current User access |
| `/{ownerLogin}/{repositoryName}/issues/{issueNumber}` | Repository-scoped Issue detail；`issueNumber` 是 Repository-local locator，stable IssueId 仍只作 internal identity/command reference；重新解析 owner/name 並驗目前 access |
| `/{ownerLogin}/{repositoryName}/discussions` | Repository-scoped Discussion collection；只讀 authorized conversations，不宣稱 Discussion write management |
| `/{ownerLogin}/{repositoryName}/discussions/{discussionId}` | Repository-scoped Discussion detail；`discussionId` 是本產品 opaque id，不採用 GitHub Discussion number；comments 隨 detail authorized read 載入 |
| `/{ownerLogin}/{repositoryName}/labels` | Repository Label collection；Label 是 Repository-owned classification metadata，沒有獨立 label URL identity |
| `/{ownerLogin}/{repositoryName}/milestones` | Repository Milestone collection；Milestone 是 Repository goal/checkpoint，不等於 Project Milestone |
| `/{ownerLogin}/{repositoryName}/milestones/{milestoneNumber}` | Repository-scoped Milestone detail；`milestoneNumber` 是 Repository-local locator，stable MilestoneId 留在 internal identity |
| `/notifications`, `/notifications/[notificationId]` | recipient-scoped Notification inbox/read-state projection |
| `/history` | 工作紀錄入口 |
| `/{login}` | canonical User / Organization locator；Home header 的 Account/Profile avatar 在 Account-owned current login 已解析時導向此 locator；legacy User 若已有 Account projection 但缺 login，只能導向 `/settings/profile` 做 explicit locator recovery，不得推導 fabricated login；viewer自己的 User Profile才可顯示 Settings齒輪，依 trusted membership login與 route login一致性判斷；其他工作目的地不重複顯示 avatar |
| `/profile` | authenticated viewer Profile hub；組合本人 owner-approved projection 與 Account-owned earned Achievements，分享仍回 `/{login}`，不建立第二 identity locator |
| `/trending` | Explore-active Repository discovery secondary surface；沿 Repository 7-day active-Star ranking，只顯示 current-accessible Repository，不建立 Explore/Trending owner |
| `/settings`, `/settings/profile`, `/settings/network`, `/settings/permissions` | authenticated viewer 的 Account/Profile/Follow/Permission command/configuration surfaces；不是第二個 User resource locator |
| `/feedback`, `/planned` | 只有明確定義的功能或「未開放」結果；不得產生假資料 |

Stable ID 只定位 entity，不授權。Detail route 直接開啟、刷新與 list navigation 都必須回同一 authoritative use case，不建立 route-specific business copy。

## Admin routes

`/admin` 與子頁由 admin partition 組裝。Static navigation 可以存在，但 private read/write 仍由各 feature permission / module contract 驗證。

已接線能力與未開放能力的產品狀態見 [Product experience](../000-core/060-product-experience.md)；permission contract 見 [Authorization](../050-security/030-authorization.md)。

## API

`/api/**` 是 transport boundary。每一 request 重新驗 identity、qualification、authorization 與 input；頁面已顯示、query parameter 或先前成功操作都不能代替 API authorization。

Route handler 不複製 application use case，concrete adapters 在最外層 composition 注入。

Current Repository resource read API：

| Route | Responsibility |
| --- | --- |
| `/api/issues`, `/api/issues/{issueNumber}` | Issue list/detail read and Issue command transport；保留既有 workbench/default repository、repository id 與 `owner` + `name` selector 行為 |
| `/api/discussions`, `/api/discussions/{discussionId}` | Discussion list/detail/comment read；`discussionId` 是 local opaque id |
| `/api/repository-labels` | Repository Label collection read |
| `/api/repository-milestones`, `/api/repository-milestones/{milestoneNumber}` | Repository Milestone list/detail read；`milestoneNumber` 是 Repository-local number |

新增 Discussion、Label 與 Repository Milestone API 只承接 authorized read，並要求 `owner` + `name` selector。Discussion、Label、Repository Milestone 的 create/update/delete/close/comment write management 尚未成為 runtime capability；Project 仍是 data-only owner，未知 access/command contract 前不開 Project 空頁或 API。

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

LIFF state decoding、entry intent 白名單與 login continuation 由 [LINE MINI App](../030-platform/010-line.md) 擁有；route contract 不複製平台 SDK 行為。


## Command entrypoints

狀態：runtime target contract。Next.js版本仍由manifest/lockfile擁有；以下固定inbound responsibility，不把framework API或action ID當作business boundary。Current入口尚未完成Account/Employmentcutover。

## Core rule

```text
Browser / External Client / LINE / Agent
        ↓
Route Handler / Server Function / Tool Adapter
        ↓
verified proof → trusted Principal context
        ↓
current qualification / delegation / scope / capability
        ↓
Owner Application Command / Query
        ↓
Owner Domain / transaction
```

Entrypoint只轉譯transport intent與failure，不直接操作private repository/table取代use case。相同business command的HTTP/ServerAction/Agent入口必須共用ownerapplicationcontract，而非各寫一套規則。

## Route Handlers

承接product API、LINE/Google/Supabase callback/webhook等具有明確HTTP method/status/header/externalcaller的場景。Server-only dependency不意味businessauthorization已成立。

每個protectedrequest重新驗可信proof，再解析currentPrincipal與scope/capability。Client傳的role、accountId、organizationAccountId、employmentId只作requestedtarget，不能自稱actor或authority。Handler驗transportshape、映射ownererror/status，不放businessstate machine。

## Server Functions / Actions

First-party表單可用ServerFunction/Action，但安全要求與RouteHandler相同。`use server`只表serverexecution；action ID、buildpruning、已登入page都不是authorization。

FormData/arguments視為untrusted；每次mutation重新驗session/Principal/currentqualification/delegation/role/scope。Action只呼叫ownerusecase，不直接importprivateinfrastructure/SQL/Supabaseadminclient形成平行writer。

已存在route/protocol時，不為了「新API」另建第二套能力。Externalcallbacks仍按各providerstate/code/nonce/expiry/once-only契約處理，成功proof不直接授予businessrole。

## Selection and composition

| Situation | Appropriate entry |
| --- | --- |
| First-party form mutation | Server Function/Action或既有Route Handler，共用use case |
| External callback/webhook/provider | Route Handler |
| Explicit product HTTP contract | Route Handler |
| Agent/Bot invocation | Trusted tool adapter→Application use case |
| Data read | Server query/Component/Route Handler，均沿ownerprojection與authorization |

Concretewiring在最外層composition；Application/Domain不importNext.jsAPI/Request/Response/FormData/cookies。需要共用authentication/data-accessboundary時沿既有owner/ports，不建runtimeservicelocator。

## Account and Principal boundary

[Account rules](../010-domain-owners/010-account.md) 提供identity/qualification，[Target authorization](../090-governance/020-proposals/040-security-target.md) 擁有Principal、operatorbootstrap、delegation與scope。

User的actualAccountId用作current human PrincipalId，不另造UUID；Organization/Enterprise是acting scope，不把switcher選擇當actor。Selfclock/DailyCheckIn等human-onlysubject仍需User/Employment關係，不以genericPrincipal取代。

未核定issuer/usecase/delegation的tool不能從prompt、clientrole或 transport identity 取得寫權。Operatorbootstrap使用真實operatoraudit，不冒充productPrincipal。

## Failure mapping

至少保留unauthenticated、not-qualified/forbidden、not-found、kind/scope-mismatch、validation/lifecyclefailure、version/replayconflict、missing/unresolvedinput、upstream-unavailable、unknown-result。

不能用200+null、redirect或generic500把權限/不存在/來源失敗混掉。UX可以有安全摘要，但不把失敗當空資料或成功。

## Idempotency and protocol continuity

HTTP/Actionretry與navigation refresh不構成新intent；有副作用以ownerstable request identity/fingerprint/durable result保障。Transport失聯使用原requestreadback，不換requestId盲目再做。

Account內部語意改名不重寫V1payload/receiptfingerprint/result/source literal。若新wire欄位/protocol需演進，先有consumer rollout與舊receipt解析方案；沒有完成就沿既有wirecontract，不以permanentmodelalias隱藏雙writer。

## Client state, revocation and server-only graph

登入切換、scope切換、停權與revoke後，舊request/response/cache不得污染新的actor/scope。Viewpreference不授權；currentauthorization在owneroperation執行時重新核驗，SensitiveTOCTOU與locking由 [Persistence](../090-governance/020-proposals/030-data-target.md) 定義。

Secrets、restrictedDB、provideradminclient、migrationcredentials不進browserreachablegraph。檔名/marker只是防護手段，architectureguards必須驗證import reachability；不因伺服器有高權限connection跳过businesschecks。

## Agent / Bot parity

自然語言解析成功不等於command已授權或執行成功。Tooladapter將explicitintent交owner；Assistant只產生draft時不得假裝formalwrite。副作用需要deterministicvalidation、currentauthority、version/replay與必要人工confirmation；不直接碰Supabaseprivate tables。

## Validation target

RouteHandler/ServerAction/tool對同一usecase產生相同businessvalidation。待測未登入、被撤權、wrongkind、跨Organization/Employment、staleversion、exactretry/unknown-result、舊response覆蓋、providercallback限制、browserbundle不可達secret。

Repositorychecks、deploymentREADY、API與LINEdevice分開驗證；設計存在不代表entrypoint已Account-aware。Implementation依 [Migration gates](../090-governance/030-migrations/040-enterprise-organization-workforce-payroll.md) 放行。
