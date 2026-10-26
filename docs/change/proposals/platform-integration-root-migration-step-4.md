# Platform integration root migration — Step 4：Vercel 根部殘餘／部署交界

Status: Vercel native capability source 已由 PR #412 整理至 integration package 的 `src/`；完整 deployment acceptance 仍待 Step 8。上一階段：[Step 3](./platform-integration-root-migration-step-3.md)；下一階段：[Step 5](./platform-integration-root-migration-step-5.md)。

## 目前 root inventory 的處置
`vercel/` 的 `README.md` 與 `analytics,caching,cron,deployments,domains,environment,functions,observability,routing,security,storage,tests` 多數為 **README-only navigation**，`integrations` 有舊 AI runtime。不能把分類 README 全改成空的 TypeScript workspace 子模組。
- 有永久參考價值的 Provider 操作知識：合併進 `packages/integration-vercel/README.md`、`docs/reference/platform/vercel.md` 或現有 Release 文檔；**只有一個權威說法**，避免雙重導覽。
- 無實際 consumer 且只有預留分類的空殼 README：記錄分類及刪除理由，於 Step 8 才移除。
- 真正的 Web native Vercel config **保留 `apps/web/vercel.json`**。Next config、`apps/web/package.json`、根 `.vercelignore`、Vercel platform team/project IDs、`scripts/vercel/deploy-production.mjs`、Release workflow 保留工具要求的位置；只改它們的 imports、部署包含規則與測試。Vercel monorepo builds 需要 workspace manifest/lockfile 可解決。
- 原 `vercel/README.md` 連到 `../supabase/README.md`；遷移時改成新 canonical package/documentation link。避免複製整份內容留在舊根部。

## 執行與反例
1. 確認 Vercel Project 原 `apps/web` rootDirectory、Next routes、Production Git deploy main gate、Preview Git integration 與 Release 不變；`packages/integration-vercel` 被 pnpm graph build/trace。
2. 修正 `.vercelignore` 與 `scripts/vercel/deploy-production.test.mjs`：只允許**實際** package dependencies 與 source 進入 upload（若現行 `!packages/*/src/**` 已可涵蓋，不必重複白名單）；不能以 CI full checkout 成功代替 Vercel filtered upload 成功。
3. 驗證 LINE callback/Webhook、Assistant、Expense、File API routes 在 Preview 是 READY 且可 import；身份與敏感 webhook 簽章行為不變。非授權請求仍拒絕。
4. Vercel preview READY 是**建置**證據，不能冒充帶資料的 Contract Intake 成功、LINE 裝置或正式域名已切換。

驗收：可追溯的 `git diff` 不再有根 `vercel/` runtime consumer；原生 Vercel host config/Release 測試仍綠，舊分類可移除。不能因「全部放進 package」而將 `vercel.json` 搬到 Vercel 不讀的位置。
