# Supabase 約束

資料模型見 [Core business data](../docs/040-data/010-data-boundary-model.md)；schema object tree 見 [schemas/README](schemas/README.md)。

- `supabase/schemas/` 是 application-owned PostgreSQL current state 的唯一結構 Source of Truth；`architecture/data-topology.json` 只擁有 persisted relation → semantic owner / role / physical file 的 mapping，不重複 SQL definition。
- Schema 的 authority unit 是 **Object / Relationship relation**，不是檔案。Authoritative relation 恰好一個 semantic owner；同一 authoritative SQL file 不得混合不同 owner。File 只作 lexical dependency order 與 navigation。
- `000–863` 只放 owner-authoritative definitions；`900–930` 只放 derived projection、cross-owner invariant、transaction coordinator、access enforcement，永遠不得成為 business truth owner。
- Current authoritative semantic concept 若宣告 `persistenceExpectation = relation`，必須能解析到至少一個 authoritative persisted relation；反向每個 persisted `app_private` table/view 也必須恰好一個 data-topology mapping。
- Runtime package 不得因共用 PostgreSQL connection 直接取得其他 owner 的 mutation authority。跨 owner 由 owner public contract、reference/projection 或明確 transaction coordinator 承接；不得用 direct SQL 隱藏 module dependency。
- `supabase/migrations/` 不參與 current contract、一般 test、`schema:check` 或 remote deployment；不得新增 migration file、repair history 或用 migration history 當同步證據。
- 目標 invariant：`schemas desired state == clean local rebuild == target Supabase current state`，且 `supabase_migrations.schema_migrations` fingerprint 前後完全不變。
- Provider-owned `auth`、`storage`、`public` helper、`supabase_migrations` 不可被 application schema 做 DDL/DCL mutation；必要 Auth dependency 只能用 FK 或 narrow SECURITY DEFINER capability，`line_app` 不持 direct Auth privilege。
- Runtime `line_app` 不得持 LOGIN、SUPERUSER、BYPASSRLS、schema ownership、DDL 或 migration authority。RLS/grants 是 defense in depth，不取代 application authorization。
- Remote mutation 只走 repository-owned reconciliation：normal path 為 `plan → sync → verify`；destructive/data-sensitive diff 只能由 explicit Supabase Replace workflow 授權，且先以 `prepare` 做 preserve-data additive expansion/preflight。`prepare` 不得猜 business metadata、drop legacy authority 或取代 destructive authorization。任何 remote write 後都要 read back catalog/security 與 migration-history fingerprint。
- 不提交 secret、個資、production-sensitive dump 或 fabricated verification data。Static/schema/test/build/deployment/provider/device evidence 分開回報。
