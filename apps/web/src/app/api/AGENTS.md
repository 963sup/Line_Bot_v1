# Web API transport boundary

## GitHub Mobile 目標（後續實作）

- API 沒有手機視覺布局；支援 module 的既有 projection、分頁、scope、error/result 即可。FPT query/mutation 分離語意不要求新增 GraphQL 或複製 REST 路由。
- 列表 badge/count、scope 名稱、timeline、search 或批次操作若缺 contract，先列能力缺口，不能只為 Mobile 外觀臨時拼 SQL 或回 fake 0。
- 保留 current URL 與 receipt/replay；UI reorder、tab rename、drawer/sheet 選擇不得影響 method/status/identity 契約。

## 現行 URL 與 invariant

## Current transport map

以下是現有 route families；HTTP method、request/response shape 以各 `route.ts` 與 owner public contract 核對，不從 REST 單複數或 FPT mutation 名稱猜測。

| URL | Owner / scope |
| --- | --- |
| `/api/membership`、`/api/membership/register`、`/api/membership/restore`、`/api/membership/manage`、`/api/membership/google-link` | Account 與明確組裝的既有 membership wire contract；Google protocol 由 integration 擁有 |
| `/api/profile`、`/api/follows` | Account Profile/Follow |
| `/api/permissions` | Identity/Access；不能因 Web presenter 在 account 目錄就歸為 Account domain |
| `/api/organization`、`/api/team`、`/api/enterprise` | 各自 owner 的治理、scope 與命令；EnterpriseTeam 不共用 Organization Team 語意 |
| `/api/issues`、`/api/issues/{issueNumber}` | Repository Issue；保留 workbench/default、repository ID、owner/name 現行 selector 契約 |
| `/api/discussions`、`/api/discussions/{discussionId}` | Repository Discussion/comment authorized GET；必須提供 `owner` + `name` |
| `/api/repository-labels` | Repository Label authorized GET；必須提供 `owner` + `name` |
| `/api/repository-milestones`、`/api/repository-milestones/{milestoneNumber}` | Repository Milestone authorized GET；必須提供 `owner` + `name` |
| `/api/repositories` | Current User 的 authorized Repository collection；只回傳 Repository locator/capability projection |
| `/api/repositories/explore` | Repository discovery/Star transport |
| `/api/repositories/starred` | Current User 的 Repository Star projection；仍由 Repository owner 授權與查詢 |
| `/api/notifications` | recipient-scoped Notifications |
| `/api/assistant` | Assistant Ask / Issue-draft Generate / text Review transport；current User qualification required，output 不形成 formal write |
| `/api/attendance`、`/api/attendance/clock-in`、`/api/attendance/clock-out`、`/api/workplaces` | Attendance 現行 subject 與工作場所契約 |
| `/api/expenses/{id}`、`/api/partners` | Expense／Partners |
| `/api/line/webhook` | LINE 驗簽、Bot qualification 與 event delivery，再交各 owner |
| `/api/internal/attendance-maintenance` | Attendance 內部維護；不是一般使用者入口 |
| `/api/health` | 技術健康狀態；不證明所有 business capability 可用 |

FPT queries/mutations 是語意參考，不要求 GraphQL transport 或每個 entity 一個 API。URL 改名需明確 consumer migration；不能為目錄一致新增平行 writer、改歷史 payload 或繞過原 replay。

`_composition/*.server.ts` 組裝 concrete adapters，module 接收明確 dependency；不把 `_composition` 變成下層任意查找服務的 registry。新增 route 時同步所屬 module AGENTS、上層 URL 契約與對應 HTTP/browser tests。

- Route handlers own transport parsing, response/error mapping and composition lookup only; business lifecycle, authorization, persistence and transaction ownership remain in the owning package.
- Every route must pass explicit stable IDs, scope, expected version and request identity to the owner contract when required; URL, body role, selected UI scope or session cache is not authority.
- Keep HTTP/LINE wire contracts and failure classification stable during module moves; do not implement a second use case or query private tables from a route.
- API tests must cover unauthorized/forbidden, wrong scope, stale/replay conflict, unavailable source and unknown-result behavior where the owner supports those states.
