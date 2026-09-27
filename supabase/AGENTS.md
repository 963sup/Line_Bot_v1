# Supabase 約束

Current schema semantics 見 [Schema model](../docs/040-data/030-schema-model.md)；provider reconciliation 見 [Supabase platform](../docs/030-platform/020-supabase.md)。

- `supabase/schemas/` 的可執行 SQL 是 application-owned PostgreSQL current structure 的唯一 Source of Truth；`architecture/data-topology.json` 只擁有 persisted relation → semantic owner / role / physical file mapping。
- Schema authority unit 是 Object / Relationship relation，不是檔案。Authoritative relation 恰好一個 semantic owner；同一 authoritative SQL file 不得混合不同 owner。
- `000–863` 只放 owner-authoritative definitions；`900–930` 只放 projection、cross-owner invariant、transaction coordinator 與 access enforcement，不取得 business truth authority。Reserved target files 只可保留純註解，不得冒充 current persistence。
- Runtime package 不得因共用 PostgreSQL connection 直接取得其他 owner mutation authority；跨 owner 使用 public contract、reference/projection 或明確 transaction coordinator。
- `supabase/migrations/` 不參與 current contract、一般 test、`schema:check` 或 remote deployment；不得新增 migration file、repair history 或以 migration history 作同步 authority。
- Provider-owned `auth`、`storage`、`public` helper 與 `supabase_migrations` 不屬 application schema mutation boundary。
- Runtime `line_app` 不得持 LOGIN、SUPERUSER、BYPASSRLS、schema ownership 或 DDL/migration authority；RLS/grants 是 defense in depth，不取代 application authorization。
- Schema/source 變更後至少跑 `pnpm schema:check` 與適用 repository validation。Remote/release 行為不要在本檔重寫，引用 canonical Platform／Release docs。
- 不提交 secret、個資、production-sensitive dump 或 fabricated verification data。
