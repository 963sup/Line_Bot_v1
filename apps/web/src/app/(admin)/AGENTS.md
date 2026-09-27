# Admin route group

## GitHub Mobile 目標（後續實作）

- 管理入口從 viewer hub 或已授權任務進入；admin 維持明確標題與退出/返回，不增加第五個全域管理 tab，也不把危險操作放入首頁快捷點擊。
- 先顯示 scope 與可操作對象，再以緊湊列表進詳情/表單；停權、權限等 mutation 保留原因、確認、版本與結果。overflow 只改呈現，不省略確認。
- 未開放的 audit/attendance/expenses/settings 仍顯示未實作；FPT audit-log 或 Mobile 管理畫面不能當成已有本地讀取能力。

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
