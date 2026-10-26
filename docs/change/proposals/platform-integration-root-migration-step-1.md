# Platform integration root migration — Step 1：根部與 consumer 全量盤點

Status: 平台移轉盤點已由 PR #412 實施；本文件保留 consumer matrix 與歷史基線，完整 release acceptance 仍由 Step 8/End 定義。上一階段：[Start](./platform-integration-root-migration-step-start.md)；下一階段：[Step 2](./platform-integration-root-migration-step-2.md)。

## 可核對的基線（PR #412 後）
- 根部 `vercel/` 與 `supabase/` 已移除；Vercel native capability assets 直接位於 `packages/integration-vercel/src/`，Supabase native assets 與 executable SQL 直接位於 `packages/integration-supabase/src/`。
- Vercel AI Gateway 的公開 runtime entries 是 `packages/integration-vercel/src/gateway.ts` 與 `src/gateway-config.ts`；provider document transport 仍是 package 內部的 `src/adapters/outbound/ai-gateway/document.ts`。
- Supabase server client 的公開 package entry 是 `packages/integration-supabase/src/storage-client.ts`；File 的 hash、verified upload/read/remove 與 readback 仍由 `packages/file` 擁有。
- `architecture/data-topology.json#schemaRoot`、Supabase CLI workdir、schema loader、Schema tests 與 release guard 均指向 `packages/integration-supabase/src/schemas/`；實際 SQL 數量以 current Git tree 為準，不將 109 筆摘要當成永久上限。
以上為被觀察到的**重要起點**，不是宣稱已枚舉所有引用。

## 必交付：受追蹤且分類的 consumer matrix
對 branch tip 掃描 tracked files（包含 dotfiles、.github、CLI、SQL、JSON、TS/JS、Markdown、tests、gitignore、workflow、workflow artifacts 設定），將每個實際使用的引用紀錄為：
`{oldPath, consumerPath, purpose, newOwner, destination, publicExportOrNativePath, safetyGate, verification}`。
必掃描：
- `packages/integration-vercel/src/`、`packages/integration-supabase/src/` 的**實際 Git tree**：分清 runtime source、CLI current state、README／分類、ignore、generated `.temp`。
- `rg -n 'vercel/integrations|(?:^|["\x27 ./])vercel/|supabase/schemas|supabase/config\.toml|supabase/\.temp|supabase/' apps packages scripts architecture .github docs AGENTS.md .vercelignore package.json pnpm-workspace.yaml`（示意，依 Git tracked inventory 與實際 regex 調整）。
- `import`、`require`、dynamic import、URL()、spawn CLI cwd、absolute/relative path、README links、release allowlist、data-topology `files[].path`、schema guard、prefix ordering 及 native config source。
- Root `supabase/` 是否存在**非 SQL 內容**的真實 runtime/CLI consumer；README-only 不能自動轉變成新功能。

## 決策輸出## SQL 與根部檔案的必備對帳表

Step 1 必須產出 **每個 tracked path 一列**的 manifest（不能僅列資料夾或文件類別），SQL 每一列至少包含：

`{oldPath: "supabase/schemas/<name>.sql", newPath: "packages/integration-supabase/src/schemas/<name>.sql", gitBlobSha, rawSha256, ordinal, owner, relationOrConstraint, consumerPaths, action: "MOVE_UNCHANGED", checked: false}`。

SQL 的 `ordinal` 是由現有 schema loader 使用的確切排序規則計算，必核對 `config.toml` 中 `./schemas/*.sql` 的解析。零修改搬移時舊 SHA-256 與新 SHA-256 必須相同；執行時產生的 schema 聚合輸出亦須相同。對 `supabase/schemas/AGENTS.md`、`README.md`、`supabase/config.toml`、`.gitignore`、根部其他各分類 README、測試及真正 CLI 資產，也須有明確對應或經 consumer 證明的刪除理由。

**驗收公式：** `set(old tracked SQL relative paths) === set(new tracked SQL relative paths)` 且每個對應的 raw SHA-256 完全相等；`unmappedSqlCount=0`、`duplicateSqlCount=0`、`missingRootFileDecisions=0`。未知 SQL consumer = **BLOCKED**，不能默默 skip。


每一列標註 **MOVE / UPDATE / KEEP-HOST / DELETE-AFTER-PROOF / UNKNOWN**。UNKNOWN 不允許當作無消費者直接刪除。對 native CLI 列出官方目錄格式與版本匹配證據。

驗收：機械清單可重生、變更前舊路徑引用總數可量化、每個 root tracked file 都被分配命運；未清點完成禁止 `rm -r supabase vercel`。
