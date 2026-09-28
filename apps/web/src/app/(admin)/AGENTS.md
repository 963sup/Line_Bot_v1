# Admin route group


## 現行 URL 與 invariant

| Current URL | 現行責任 |
| --- | --- |
| `/admin` | 依權限呈現管理導覽 |
| `/admin/members` | Account User 查詢／管理停權 |
| `/admin/permissions` | Identity/Access 權限管理 |
| `/admin/groups` | Partners 管理；名稱沿用既有 URL，不是 Organization Team 或 LINE group |
| `/admin/workplaces` | Attendance 工作場所管理 |
| `/admin/attendance`、`/admin/expenses`、`/admin/audit`、`/admin/settings` | 現行未開放頁面；不宣稱已有查詢／管理 runtime |

FPT enterprise-admin、orgs、teams、audit-log 可協助區分治理概念，但不意味本產品 `admin` 下的頁面都屬 Enterprise 或 Audit owner。若另提 `/admin/partners`，先列為改名提案，查 Link、權限導覽、測試與既有入口後才實作；本檔不授權直接切換 URL。

- Admin routes are presentation/transport entrypoints for owner-approved management capabilities; the `/admin` path never grants authority.
- Every read and mutation resolves the actual Principal, explicit scope and owner contract server-side; UI visibility and route naming are not authorization.
- Keep audit, forbidden, unavailable, conflict and unknown-result mappings explicit.
