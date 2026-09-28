# Web account module
## 現行 surface 與 invariant
Module-owned surfaces：`/{login}` 的 User projection、`/settings`、`/settings/profile`、`/settings/network`、`/settings/users`、`/membership/register`、`/membership/restore`、`/login`、`/google-link`；HTTP families 為 `/api/membership/*`、`/api/profile`、`/api/profile/achievements`、`/api/follows`。`/profile` 只解析本人入口到 `/{login}`；本 module 提供 Account projection/API，不取得跨 owner composition responsibility。

FPT users 對照 User/Profile/Follow；LINE/Google qualification 是本地 integration contract。`permissions-panel.tsx`、`permissions.server.ts` 目前服務 `/settings/permissions`、`/api/permissions`，其真正 owner 是 `@line_bot_v1/identity-access`；位置不授予 Account domain 權限管理責任。修改時對照各自 DTO，User management 為 `actorId/users/detail.user`，不可用舊 fixture 欄位冒充現行契約。

`membership` URL 與既有 wire code 保留相容用途；內部 current User lifecycle 使用 `active | paused | suspended`。更新文案或名稱不得改寫歷史 receipt。

- Owns account-facing presentation, view models and interaction wiring only; Account package owns identity/lifecycle truth.
- Server revalidates identity, qualification, scope, version and replay; client profile/session state is never authority.
- Do not duplicate Account domain rules or query Account persistence from this module.

- Account Settings reads the explicit `/api/membership?view=account` projection; it must not load or present DailyCheckIn/Wallet state. DailyCheckIn presentation and recovery live in the sibling `daily-check-in` module.

- `/{login}` composes authorized self projections at the App boundary only for the current active User's own Profile. LINE picture/status are provider presentation data; they never replace Account identity. Earned Achievement facts come from Account-owned `user_achievements` and are read-only on this surface.
- Home avatar resolves the current Account locator independently of the optional LINE photo and links directly to the namespace or lifecycle destination. `/profile` remains the unresolved/external entry; confirmed invalid/suspended Account state disables the avatar destination. Clear the locator on visibility loss/unmount and refresh it on resume; navigation hints never authorize private Profile reads.
