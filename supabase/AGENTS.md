# Supabase 約束

資料模型見 [Core business data](../docs/040-data/010-data-boundary-model.md)；schema object tree 見 [schemas/README](schemas/README.md)。

- `supabase/schemas/` 的可執行 SQL 是 application-owned PostgreSQL current state 的唯一結構 Source of Truth；`870–891` reserved target files 只可放純 `--` comment 來保留未來命名，不是 current persistence。`architecture/data-topology.json` 只擁有 persisted relation → semantic owner / role / physical file 的 mapping，不重複 SQL definition。
- Schema 的 authority unit 是 **Object / Relationship relation**，不是檔案。Authoritative relation 恰好一個 semantic owner；同一 authoritative SQL file 不得混合不同 owner。File 只作 lexical dependency order 與 navigation。
- `000–863` 只放 owner-authoritative definitions；`900–930` 只放 derived projection、cross-owner invariant、transaction coordinator、access enforcement，永遠不得成為 business truth owner。
- Current authoritative semantic concept 若宣告 `persistenceExpectation = relation`，必須能解析到至少一個 authoritative persisted relation；反向每個 persisted `app_private` table/view 也必須恰好一個 data-topology mapping。
- Runtime package 不得因共用 PostgreSQL connection 直接取得其他 owner 的 mutation authority。跨 owner 由 owner public contract、reference/projection 或明確 transaction coordinator 承接；不得用 direct SQL 隱藏 module dependency。
- `supabase/migrations/` 不參與 current contract、一般 test、`schema:check` 或 remote deployment；不得新增 migration file、repair history 或用 migration history 當同步證據。
- 目標 invariant：`schemas desired state == clean local rebuild == target Supabase current state`，且 `supabase_migrations.schema_migrations` fingerprint 前後完全不變。
- Provider-owned `auth`、`storage`、`public` helper、`supabase_migrations` 不可被 application schema 做 DDL/DCL mutation；必要 Auth dependency 只能用 FK 或 narrow SECURITY DEFINER capability，`line_app` 不持 direct Auth privilege。
- Runtime `line_app` 不得持 LOGIN、SUPERUSER、BYPASSRLS、schema ownership、DDL 或 migration authority。RLS/grants 是 defense in depth，不取代 application authorization。
- Remote mutation 只走 repository-owned reconciliation：normal path 為 `plan → sync → verify`；plan classification 只有 `noop / automatic / manual`，unknown、destructive、data-sensitive 或敏感 privilege transition 一律 fail closed 到 manual path。Manual path 必須先 `prepare-plan` 產生 `plan.sql` + `plan.sha256`，review 後 apply 以 exact SHA-256 綁定重新計算的 current plan，且需 explicit recovery-readiness attestation。Automatic / manual GitHub jobs 共用同一 production resource concurrency key；所有 repository-owned remote mutation 另由 PostgreSQL advisory lock 序列化。`prepare` 不得猜 business metadata、drop legacy authority 或取代 manual authorization。任何 remote write 後都要 read back catalog/security 與 migration-history fingerprint。
- `config.toml` 只支援 local/declarative schema workflow；不得把它當成允許 official `db push`、linked reset、migration repair 或 remote migration replay 的證據。調整 Supabase CLI behavior 時，同步檢查 `scripts/supabase/*`、`.github/workflows/*` 與本 README 的 remote contract。
- 不提交 secret、個資、production-sensitive dump 或 fabricated verification data。Static/schema/test/build/deployment/provider/device evidence 分開回報。
