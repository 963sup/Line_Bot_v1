# Local environment

## Runtime source

Node 的責任分成兩個 contract：`.node-version` 是本地與 CI 可重現執行的 exact Node pin；`package.json#engines.node` 是 Vercel 等 managed runtime 的 Node major compatibility range，兩者 major 必須一致。pnpm exact version 與 package-manager contract 由 `package.json` 擁有；共用依賴基準由 `pnpm-workspace.yaml` 與 lockfile 擁有。文件不複製固定版本作第二份 source of truth。Repository 不保存綁定單一開發機器、使用者目錄或 package store 的 pnpm wrapper。

從 repository 根目錄使用符合 `.node-version` 與 manifest 的 Node／pnpm：

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm check
pnpm validate
pnpm docs:check
```

只有需要安裝依賴時才執行 install。不在同一 checkout 同時啟動多套會寫入 node_modules、Next type output 或 build artifact 的流程。

## Environment files

根 `.env.example` 列 application 會直接消費、且本地開發可能需要提供的 configuration 名稱，是 `.env.local` 的名稱範本；Vercel/Supabase/Upstash 等 provider 在 deployment 自動注入的同名值仍由 provider 擁有，不由 repository 複製或維護。純平台／CI／tool-owned variables（例如 `NODE_ENV`、`VERCEL_*`、`GITHUB_*`、browser probe 的 `NAVIGATION_*`）不重複列入。

本地秘密只放被忽略的根 `.env.local`。Shell / deployment environment 優先；測試與 Vercel build 不應意外讀取個人本地 secret。GitHub Actions 不偽造 `VERCEL=1` 來控制本地 loader；真正 Vercel deployment 才使用 Vercel system environment。重複來源要拒絕或明確處理，不打印 secret value。

修改本地 env 後需重啟對應 process；deployment env 只對新 deployment 生效。不要整份複製 local env 到 production。

## Configuration responsibility

- LINE Messaging channel secret/access token：deployment secret；單一 LINE integration provider namespace 與 MINI App Developing / Review / Published public identity 由 source 擁有，不以 env 重複設定：[LINE integrations](../030-platform/010-line.md)
- Supabase public/runtime/operator configuration：[Supabase platform contract](../030-platform/020-supabase.md)
- Redis：Vercel Marketplace resource 的 `KV_REST_API_URL` / `KV_REST_API_TOKEN` 是唯一 application connection contract；environment namespace 由 runtime environment 推導：[Redis coordination](../030-platform/030-redis.md)
- Current AI runtime credential / model setting：[AI integration](../030-platform/060-ai.md)
- Workplace / allowed Members：business data，由 Attendance/permission 流程管理，不用 env 授權。

Public configuration（例如 publishable key / public URL）仍不等於 business authorization；browser bundle 不得包含 server credential。

## External tooling

CLI / probe / deployment tools 可能讀 environment 或進行外部寫入。Supabase remote schema tooling 只使用 provider-owned `POSTGRES_URL_NON_POOLING`，並以 `SUPABASE_URL` 驗證 exact project；Web runtime 的 `POSTGRES_URL` 不作 schema/operator fallback。執行前確認 exact project/channel/environment 與既有授權；名稱叫 `check` / `probe` 不代表一定唯讀。

Validation scope 見 [Validation and tooling entry points](040-validation.md)。
