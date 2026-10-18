# Supabase operation scripts

Database current-state SSOT 是 `supabase/schemas/*.sql`。本目錄只負責 declarative schema source 組裝、本機重建、remote plan/apply/readback 與 PostgreSQL execution mechanism；不維護 migration history。

| Script | 用途 |
| --- | --- |
| `schema-source.mjs` | 依 canonical lexical order 讀取/組合 `supabase/schemas/*.sql` declarative source。 |
| `schema-source.test.mjs` | 驗證 schema source discovery、ordering 與 current-state contract。 |
| `postgres.mjs` | Bounded PostgreSQL execution helper，區分 local/remote failure semantics。 |
| `postgres.test.mjs` | 驗證 PostgreSQL adapter target、timeout/error handling。 |
| `schema-local.mjs` | `pnpm schema:local`：重建本機 Supabase，從 declarative schemas 建立乾淨 local database。 |
| `remote.mjs` | `pnpm schema:remote`：production Supabase exact target/authorization、diff/apply、bounded failure、post-write readback。 |
| `remote.test.mjs` | 驗證 remote target、mutation authorization、unknown-result、schema diff/readback 與 no-migration-history constraints。 |
| `identifier-cutover.mjs` | Scoped Numbering / Namespace authority 的 one-time catalog detection、persistent writer freeze、post-deployment runtime activation 與 readback contract。 |

任何 schema change 先修改 `supabase/schemas/*.sql`；remote 是部署結果，不是反向 source of truth。詳細規則見同層 `AGENTS.md`。

Diff 使用已鎖定 CLI 的 explicit `--from <remote> --to local --schema app_private --strict-coverage`，不使用 migrations baseline。CLI 輸出為 review SQL；本 operator 僅支援單一 transaction 可執行的 DDL，拒絕 transaction control、concurrent index 等非交易操作；其他 SQL 失敗會 rollback，不會拆成部分提交。未涵蓋的 schema object 由 strict coverage 拒絕。參見 [Supabase CLI](https://supabase.com/docs/reference/cli/supabase-db-diff)。

Scoped identifier 首次發布是已治理的單次 authority transition：existing database 必須先以 Supabase Management API 證明 PITR/WALG 或至少一筆 completed managed backup，或符合 [Recovery](../../docs/reference/operations/recovery.md) 的指定 project / authority / schema 無備份風險授權，才取得 governance exclusive lock，依固定順序鎖住所有 legacy writer tables，於同一 transaction 套用 DDL、執行 `cutover_scoped_identifiers(exactGitRevision, at)` 並寫入 `runtime_ready=false` marker。無備份授權會明示沒有 backup verification，不冒充 provider recovery。Catalog 證明沒有 application schema 的 fresh bootstrap 沒有 retained business data，可略過 recovery gate。這是明確的 stop/drain 維護窗；資料庫 freeze 會跨 job 持續，Vercel exact-revision 部署與 readback 成功後，獨立 `activate-identifiers` 才呼叫 `activate_scoped_identifier_runtime` 解凍。部署或 activation 失敗時保持 frozen，後續 current-main Release 以 forward fix 重試，不回滾或重 seed。`plan` 只回報需要 cutover；只有 validated-current-main `sync` 可執行。後續 sync 看到完整 marker 只走一般 declarative DDL，不重跑 seed。Partial object、缺 marker、summary/count/readiness readback 異常都停止發布。

每一次 remote SQL mutation（含 foundation repair、bootstrap、schema apply、runtime activation）都在實際 query 前重新讀取 GitHub `main` 並要求與 `SUPABASE_RELEASE_SHA` 完全相同；preflight 後 branch 已前進時不會送出 SQL。
