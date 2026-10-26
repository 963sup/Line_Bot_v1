# Platform integration root migration — Step 6：Supabase native CLI／109 SQL Schema 原位權威遷移

Status: PROPOSED。上一階段：[Step 5](./platform-integration-root-migration-step-5.md)；下一階段：[Step 7](./platform-integration-root-migration-step-7.md)。

## 關鍵選擇：CLI 不能直接把 config.toml 放進 src/
官方 Supabase CLI 預期由 **project root 下的 `supabase/config.toml`** 探索專案，且支援 `--workdir`／`SUPABASE_WORKDIR`。因此新位置為：
```text
packages/integration-supabase/
  supabase/
    config.toml
    .gitignore
    schemas/*.sql           # 原 109 份 executable current schema，內容不得改
    auth/ cron/ functions/ queues/ realtime/ storage/ tests/ vector/ webhooks/
```
此處 `packages/integration-supabase` 是 native CLI **workdir**，內層 `supabase` 是 CLI 的目錄格式；它不是第二個根目錄 provider source，也不需要把 SQL 當成 TS `src`。

## 唯一一次原生搬移
1. 精確盤點 `supabase/` 的 tracked files、ordered SQL SHA-256、`config.toml`、`[db.migrations]`、Bucket manifest、ignore 行為。把原檔 **無 SQL 行為修改**搬移到 `packages/integration-supabase/supabase/`。不得在 repo root 與新 package 各保留一套 schema。
2. 原 `[db.migrations].schema_paths = ["./schemas/*.sql"]` 必須在新 workdir 下解析到**同一有序 SQL 清單**； migrations 仍 disabled、不重播歷史 migrations。Bucket `[storage.buckets.repository-files]` 是單一 desired state，private、file limit/Unit 不變。
3. 對所有 Supabase CLI 操作**顯式**使用 package workdir（例如 `supabase --workdir packages/integration-supabase ...`，腳本需用當前 pinned CLI 版本確認實際參數位置）。避免靠目前 process.cwd 巧合搜尋到舊 root。
4. `scripts/supabase/schema-source.mjs`、`schema-local.mjs`、`remote.mjs`、`storage.mjs`、remote schema/identifier/DB guards、local tests 改成新唯一 native path；`supabase/.temp/project-ref` 搬到新 native .temp（**不能 commit runtime-linked secrets/state**）。
5. 同步 `architecture/data-topology.json#schemaRoot` 與 `files[].path`、schema-relations mapping、Data topology validation、SQL ownership guard、schema doc links。資料關係 owner **仍** Contract/Account/File 等既有業務 Owner；絕不因搬 SQL 路徑而將 DB facts 重歸 `supabase-integration`。
6. 對照移動前後每個 SQL bytes hash、ordered list、relation+RLS+grant extraction、target `app_private`、Bucket parsed desired state；任何 drift 阻止切換。

## 驗收
- `pnpm schema:check`、`pnpm schema:local`（**本地測試庫可重設，嚴禁操作實際遠端**）、`pnpm schema:remote plan` / `verify`（在授權只讀環境）及 `pnpm storage:remote plan` / `verify` 認得新 workdir。
- release `schema:remote sync` / `storage:remote sync` 只由 current main 的**原有驗證後授權流程**啟用，不能因本 RFC 放寬。遠端 schema/RLS/object bytes 變更為 **零**。
- 未能獲得 native CLI 精確工作目錄證據時，不可刪根 `supabase/`。不得以 symlink、複製 config.toml、forked project 形成第二真相。
