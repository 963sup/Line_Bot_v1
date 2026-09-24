# Web account module

## GitHub Mobile 目標（後續實作）

- FPT User/Profile/Follow 對應 viewer hub 的身分摘要、公開個人頁與社交關係入口；Mobile「我的」先展示本人，再分組設定/組織/權限，不把 public `/{login}` 與 `/settings` 混成同一資源。
- 管理帳號的清單、詳情、停權確認分層；permissions presenter 即使仍在本目錄，其 role/scope 文案及資料來自 Identity/Access。
- GitHub Mobile 多帳號切換只作互動參考；本地尚無對等能力時不顯示可切換的假帳號。LINE 身分變更仍必須清除私人投影並重驗；Google link 不是換一個 business actor。

## 現行 surface 與 invariant

Current surfaces：`/{login}` 的 User projection、`/settings`、`/settings/profile`、`/settings/network`、`/membership/register`、`/membership/restore`、`/login`、`/google-link`、`/admin/members`；HTTP families 為 `/api/membership/*`、`/api/profile`、`/api/follows`。

FPT users 對照 User/Profile/Follow；LINE/Google qualification 是本地 integration contract。`permissions-panel.tsx`、`permissions.server.ts` 目前服務 `/settings/permissions`、`/admin`、`/admin/permissions`、`/api/permissions`，其真正 owner 是 `@line-work/identity-access`；位置不授予 Account domain 權限管理責任。修改時對照各自 DTO，User management 為 `actorId/users/detail.user`，不可用舊 fixture 欄位冒充現行契約。

`membership` URL 與既有 wire code 保留相容用途；內部 current User lifecycle 使用 `active | paused | suspended`。更新文案或名稱不得改寫歷史 receipt。

- Owns account-facing presentation, view models and interaction wiring only; Account package owns identity/lifecycle truth.
- Server revalidates identity, qualification, scope, version and replay; client profile/session state is never authority.
- Do not duplicate Account domain rules or query Account persistence from this module.
