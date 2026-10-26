# Platform integration root migration — Step 1：根部與 consumer 全量盤點

Status: PROPOSED。上一階段：[Start](./platform-integration-root-migration-step-start.md)；下一階段：[Step 2](./platform-integration-root-migration-step-2.md)。

## 可核對的基線（PR #413 的起點）
- `vercel/` 有 README 入口與 `analytics,caching,cron,deployments,domains,environment,functions,integrations,observability,routing,security,storage,tests` 等分類。多數子目錄只有 README；**不能誤認都已啟用**。
- `vercel/integrations/ai-gateway.mjs` **仍存在且有 runtime consumer** `scripts/intelligence/run.mjs`，不同於 #412 的 `packages/integration-vercel/src/gateway.ts` / `gateway-document.ts`。它目前提供 target-schema `file(...)`，後者的 observations-only processor **不等價**。
- `supabase/` 有 `config.toml`、`.gitignore`、`AGENTS.md`、`README.md`、`schemas/`（109 個 executable SQL schema files，目錄樹共 111 entries）與 `auth,cron,functions,queues,realtime,storage,tests,vector,webhooks` 類別 README。
- `architecture/data-topology.json#schemaRoot` 指向 `supabase/schemas`；`supabase/config.toml` 的 `[db.migrations].schema_paths = ["./schemas/*.sql"]`；`scripts/supabase/storage.mjs` 以 `supabase/config.toml` 作**唯一 Bucket desired state**，並使用 `supabase/.temp/project-ref`。
- `scripts/supabase/schema-local.mjs` 從 repo root 呼叫原生 CLI；SQL loader、Schema tests、release guard 另持有舊路徑。
以上為被觀察到的**重要起點**，不是宣稱已枚舉所有引用。

## 必交付：受追蹤且分類的 consumer matrix
對 branch tip 掃描 tracked files（包含 dotfiles、.github、CLI、SQL、JSON、TS/JS、Markdown、tests、gitignore、workflow、workflow artifacts 設定），將每個實際使用的引用紀錄為：
`{oldPath, consumerPath, purpose, newOwner, destination, publicExportOrNativePath, safetyGate, verification}`。
必掃描：
- `vercel/`、`supabase/` 的**實際 Git tree**：分清 runnable source、CLI current state、README／分類、ignore、generated `.temp`。
- `rg -n 'vercel/integrations|(?:^|["\x27 ./])vercel/|supabase/schemas|supabase/config\.toml|supabase/\.temp|supabase/' apps packages scripts architecture .github docs AGENTS.md .vercelignore package.json pnpm-workspace.yaml`（示意，依 Git tracked inventory 與實際 regex 調整）。
- `import`、`require`、dynamic import、URL()、spawn CLI cwd、absolute/relative path、README links、release allowlist、data-topology `files[].path`、schema guard、prefix ordering 及 native config source。
- Root `supabase/` 是否存在**非 SQL 內容**的真實 runtime/CLI consumer；README-only 不能自動轉變成新功能。

## 決策輸出
每一列標註 **MOVE / UPDATE / KEEP-HOST / DELETE-AFTER-PROOF / UNKNOWN**。UNKNOWN 不允許當作無消費者直接刪除。對 native CLI 列出官方目錄格式與版本匹配證據。

驗收：機械清單可重生、變更前舊路徑引用總數可量化、每個 root tracked file 都被分配命運；未清點完成禁止 `rm -r supabase vercel`。
