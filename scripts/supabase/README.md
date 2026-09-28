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

任何 schema change 先修改 `supabase/schemas/*.sql`；remote 是部署結果，不是反向 source of truth。詳細規則見同層 `AGENTS.md`。

Diff 使用已鎖定 CLI 的 explicit `--from <remote> --to local --schema app_private --strict-coverage`，不使用 migrations baseline。CLI 輸出為 review SQL；本 operator 僅支援單一 transaction 可執行的 DDL，拒絕 transaction control、concurrent index 等非交易操作；其他 SQL 失敗會 rollback，不會拆成部分提交。未涵蓋的 schema object 由 strict coverage 拒絕。參見 [Supabase CLI](https://supabase.com/docs/reference/cli/supabase-db-diff)。
