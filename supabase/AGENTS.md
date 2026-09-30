# Supabase 約束

Current schema semantics 見 [Schema model](../docs/reference/data/schema.md)；provider reconciliation 見 [Supabase platform](../docs/reference/platform/supabase.md)。

## Governing files

本 scope 修改前仍必須遵守 root `AGENTS.md#Mandatory governing set`，尤其是以下 current authority / guard：

`architecture/README.md` · `architecture/data-topology.json` · `architecture/implementation-topology.json` · `architecture/domain/fpt/*.json` + `architecture/domain/fpt-source.json` · `architecture/semantic-model.json` · `.dependency-cruiser.mjs` · `biome.json` · `knip.jsonc`

Local code、workflow、schema 或 guard 不得繞過、弱化或重定義這些 governing inputs；若發生 violation，先修真正 Owner / Truth / Boundary / Dependency。

- `supabase/schemas/` 的可執行 SQL 是 application-owned PostgreSQL current structure 的唯一 Source of Truth；`architecture/data-topology.json` 只擁有 persisted relation → semantic owner / role / physical file mapping。
- Schema authority unit 是 Object / Relationship relation，不是檔案。Authoritative relation 恰好一個 semantic owner；同一 authoritative SQL file 不得混合不同 owner。
- `000` 是 neutral foundation；`100–899` 只放 current owner-authoritative definitions；`900–930` 只放 projection、cross-owner invariant、transaction coordinator 與 access enforcement，不取得 business truth authority。未使用的 prefix 保持不存在；future target / filename reservation 只能留在 `docs/change/` 或 owner docs，不得建立 comment-only schema placeholder 或 data-topology file entry。
- Runtime package 不得因共用 PostgreSQL connection 直接取得其他 owner mutation authority；跨 owner 使用 public contract、reference/projection 或明確 transaction coordinator。
- `supabase/migrations/` 不參與 current contract、一般 test、`schema:check` 或 remote deployment；不得新增 migration file、repair history 或以 migration history 作同步 authority。
- Production remote mutation 只能由 current `main` 的 GitHub Actions Release 執行；本機與任意 branch 不得直接執行 `repair`、`prepare` 或 `sync`。`plan`、`verify`、`recovery` 只作 read-only diagnosis/readback，不得冒充 publication evidence。
- Provider-owned `auth`、`storage`、`public` helper 與 `supabase_migrations` 不屬 application schema mutation boundary。
- Runtime `line_app` 不得持 LOGIN、SUPERUSER、BYPASSRLS、schema ownership 或 DDL/migration authority；RLS/grants 是 defense in depth，不取代 application authorization。
- Schema/source 變更後至少跑 `pnpm schema:check` 與適用 repository validation。Remote/release 行為不要在本檔重寫，引用 canonical Platform／Release docs。
- 不提交 secret、個資、production-sensitive dump 或 fabricated verification data。
