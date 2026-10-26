# Platform integration root migration — Step 6：Supabase native CLI／109 SQL Schema 原位權威遷移

Status: Supabase native assets／109 SQL 已由 PR #412 實施並集中於 package `src/`；原提案的 root-level CLI layout 已被目前 repository design 取代，native CLI acceptance 仍待 Step 8 證據。上一階段：[Step 5](./platform-integration-root-migration-step-5.md)；下一階段：[Step 7](./platform-integration-root-migration-step-7.md)。

## 已採用的 source layout
目前 repository 將 Supabase native assets 與 schema 直接放在 integration package 的 `src/` 下，以維持單一 package source root；`src/config.toml` 與 `src/schemas/*.sql` 是目前 canonical paths。Supabase CLI 的實際 workdir／探索行為仍須依 Step 8 的受控證據驗收，不由目錄命名本身推定。
```text
packages/integration-supabase/
  src/
    config.toml
    .gitignore
    schemas/*.sql           # 原 109 份 executable current schema，內容不得改
    auth/ cron/ functions/ queues/ realtime/ storage/ tests/ vector/ webhooks/
```
此處 `packages/integration-supabase/src` 是目前 repository 的唯一 native source root；不建立第二個 `supabase/` provider wrapper，也不把 SQL 複製成 TypeScript source。

## 強制搬移清單與路徑（一份都不能遺漏）

**此 Step 必須遷移根部 `supabase/` 已有的全部 109 份 executable `.sql`，不是只改引用路徑。** 逐一套用下列 deterministic mapping，保留檔名及原始 bytes：

| 舊路徑 | 新路徑 | 動作 |
| --- | --- | --- |
| `supabase/schemas/*.sql`（目前 109 份） | `packages/integration-supabase/src/schemas/*.sql` | **109/109 全部原樣 MOVE**，不得挑選、合併、重新編號或以 TypeScript 檔案替代 |
| `supabase/schemas/AGENTS.md`、`README.md` | `packages/integration-supabase/src/schemas/AGENTS.md`、`README.md` | 連同 schema scope 規範移動，更新相對連結 |
| `supabase/config.toml`、`.gitignore` | `packages/integration-supabase/src/config.toml`、`.gitignore` | MOVE，保留 CLI 語意；更新與 root 相對路徑 |
| `supabase/AGENTS.md`、`README.md` 及各子目錄受追蹤檔案 | `packages/integration-supabase/src/` 對應路徑或單一 owner 文件 | MOVE 或證明無 consumer 後 DELETE，**不得漏列** |
| `supabase/.temp/*`、密鑰與本機環境產物 | 不提交 Git；由新工作目錄在執行期產生 | 重新產生（並驗證 ignore 規則），不複製憑證 |

**範圍包括所有 SQL 類型：** 基礎 `000`、業務 Owner `100–899`、`900–930` 中的跨 Owner 約束／transaction coordinator／access enforcement。所有 `CREATE TABLE`、`FUNCTION`、`POLICY`、`GRANT`、`RLS` 等定義仍由原業務 Owner 與 declarative schema 擁有。新 Integration Package 只是原生工具資產位置，不變成資料庫業務 Owner。

```text
原本 supabase/schemas/ 109 個 .sql
                |
                | 搬移（保持每個檔名、內容 SHA-256、載入順序）
                v
packages/integration-supabase/src/schemas/ 109 個相同 .sql
```

**遷移提交須證明的等式：** 原、新 SQL 檔案集合相等（相對於各自的 `schemas/`）、每檔 `SHA256(before)===SHA256(after)`、原與新 ordered concatenation/manifest checksum 相同、relation/RLS/Grant 投影相同；除必要 path 與 docs 引用更新外，不修改 SQL 內容。若上游增加/刪除 SQL，先更新盤點，不能強制用舊版 109 數字過關。

## 唯一一次原生搬移
1. 精確盤點 `supabase/` 的 tracked files、ordered SQL SHA-256、`config.toml`、`[db.migrations]`、Bucket manifest、ignore 行為。把原檔 **無 SQL 行為修改**搬移到 `packages/integration-supabase/src/`。不得在 repo root 與新 package 各保留一套 schema。
2. 原 `[db.migrations].schema_paths = ["./schemas/*.sql"]` 必須在新 workdir 下解析到**同一有序 SQL 清單**； migrations 仍 disabled、不重播歷史 migrations。Bucket `[storage.buckets.repository-files]` 是單一 desired state，private、file limit/Unit 不變。
3. 對所有 Supabase CLI 操作**顯式**使用目前 canonical source root（例如 `supabase --workdir packages/integration-supabase/src ...`；腳本需用當前 pinned CLI 版本確認實際參數位置）。避免靠目前 process.cwd 巧合搜尋到舊 root。
4. `scripts/supabase/schema-source.mjs`、`schema-local.mjs`、`remote.mjs`、`storage.mjs`、remote schema/identifier/DB guards、local tests 改成新唯一 native path；`supabase/.temp/project-ref` 搬到新 native .temp（**不能 commit runtime-linked secrets/state**）。
5. 同步 `architecture/data-topology.json#schemaRoot` 與 `files[].path`、schema-relations mapping、Data topology validation、SQL ownership guard、schema doc links。資料關係 owner **仍** Contract/Account/File 等既有業務 Owner；絕不因搬 SQL 路徑而將 DB facts 重歸 `supabase-integration`。
   **必須完整更新全部 109 份 SQL 的權威路徑映射，以及 `schema-source.mjs`／其 loader 讀取的 glob、prefix/order guard、RLS/relations extraction、`schema:check`、本地重建與 CI release 工作目錄**。不得只改 `schemaRoot` 而保留 109 筆 `files[].path` 舊值；不必更改原 relation owner。
6. 對照移動前後每個 SQL bytes hash、ordered list、relation+RLS+grant extraction、target `app_private`、Bucket parsed desired state；任何 drift 阻止切換。
7. **先驗證新位置**：使用同一受控本地資料庫，跑原/new SQL compiler 與 native CLI 配置解析，證明前後建立的 schema 定義、RLS、GRANT、functions、SQL sorting/fixtures 一致；**在刪除舊位置後再重跑**，防止測試仍依賴 root 作隱性 fallback。
8. **切換後禁止遺留**：tracked root `supabase/schemas/*.sql` 必須為零，`packages/integration-supabase/src/schemas/*.sql` 必須與 cutover 前清單等量且逐 SHA 一致；沒有舊 root SQL、第二個 schemaRoot、雙份 Bucket 設定，也不能以 symlink 代替真正搬移。

## 驗收
- `pnpm schema:check`、`pnpm schema:local`（**本地測試庫可重設，嚴禁操作實際遠端**）、`pnpm schema:remote plan` / `verify`（在授權只讀環境）及 `pnpm storage:remote plan` / `verify` 認得新 workdir。
- release `schema:remote sync` / `storage:remote sync` 只由 current main 的**原有驗證後授權流程**啟用，不能因本 RFC 放寬。遠端 schema/RLS/object bytes 變更為 **零**。
- 未能獲得 native CLI 精確工作目錄證據時，不可刪根 `supabase/`。不得以 symlink、複製 config.toml、forked project 形成第二真相。
