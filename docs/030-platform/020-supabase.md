# Supabase

Supabase 提供選填 Auth 與 PostgreSQL 平台能力；Member lifecycle、business data semantics、authorization 與 schema ownership 分別由 module/data/security owner 擁有。

## Auth boundary

日常 LINE Member 不需要 Supabase Auth session。LINE proof 與 Supabase JWT 是不同 credential；LINE-only Member 可以沒有 Auth user。

Google identity link 使用 Supabase Auth / PKCE 只作外部 Google proof：

1. 可信 LINE Member 發起短效 link request。
2. 外部 browser 完成 Google/Supabase proof，提交 candidate identity。
3. 回到原 LINE Member 明確確認。
4. Membership transaction 建立 mapping。

不以 email / profile metadata 自動合併 Member，也不把 Supabase provider token 挪作 Google Workspace API authorization。

`/google-link` 等外部流程不依賴 LIFF session；一次性 capability 只允許候選身分提交，不能直接讀／改 Member。Google → Supabase callback 與 Supabase → 本站 callback 是不同段落，不可互換。

Supabase Auth identity linking / provider identity list 只證明 Auth account 與 provider subject 的技術關係；產品內 authoritative business mapping 仍由 Membership / Data identity owner 建立。Supabase `linkIdentity()` 或 provider callback 成功，不自動轉移 Member ownership、OrganizationMembership、Employment 或任何管理權限。

Provider metadata 也不是本產品的 business authorization source：

- user-editable metadata 不得用來授予 role / permission / Organization / Enterprise responsibility。
- server-controlled provider metadata 即使可承載技術 claim，也必須先翻譯成產品內 contract，不能取代 Membership / Security / Module owner 的 current authorization。
- email、domain、avatar、display name 都不是 Member merge 或 business scope authority。

## PostgreSQL runtime

Business tables 位於 non-exposed private schema。Browser `PUBLIC` / `anon` / `authenticated` 不因使用 Supabase SDK 就取得 private business table access。Supabase-owned `auth` / `storage` schema 由平台管理；application declarative schemas 只可 reference/read 必要 platform facts，不取得其 ownership 或 ACL 管理責任。

Server runtime 直接使用 Supabase/Vercel integration 提供的 `POSTGRES_URL` 作 technical connection；每個 business transaction 一開始立即 `SET LOCAL ROLE line_app`，再固定 search_path 與 timeout。Connection identity 只是 infrastructure capability，不是 business authorization 或 Data Boundary；application SQL execution identity 才是 `line_app`。

RLS / grants 是 database defense-in-depth，不取代 application owner/scope authorization。需要 Auth database fact 的 cross-boundary invariant 由 app-owned FK 或 narrow SECURITY DEFINER function 封裝；`line_app` 只有 app_private 權限與 function EXECUTE，不直接取得 `auth` USAGE/SELECT。External identity proof 則走 Supabase Auth API adapter，不直接查 Supabase Auth tables。

Supabase secret / service-role 類高權限變數即使由 Marketplace 一併注入，也必須視為 **server-only technical capability**：它可以繞過一般 RLS enforcement，因此不得出現在 browser/client bundle，也不能因持有高權限 key 就跳過 actor qualification、authorization、scope 或 business invariant。Current business persistence 不消費 service-role key。

Web runtime 的 PostgreSQL application connection contract 是 provider-owned `POSTGRES_URL`。Vercel 與 Supabase resource 綁定後由平台同步該值；Vercel serverless runtime 使用 Supavisor transaction pooler（port 6543），business transaction 內立即 `SET LOCAL ROLE line_app`，維持 grants、RLS 與 application data boundary。

Supabase schema/operator reconciliation 與 product runtime 明確解耦：development remote sync 只由 `pnpm schema:remote` 使用 provider-owned `POSTGRES_URL_NON_POOLING`，並以 `SUPABASE_URL` 驗證 exact project；不讀 `POSTGRES_URL` 作 operator fallback，也不建立 migration history。

## RLS / application authorization separation

Target Enterprise / Organization scope 實作時：

```text
trusted actor
  ↓
application authorization / scope decision
  ↓
owner command/query
  ↓
restricted persistence adapter
  ↓
PostgreSQL grants / RLS defense-in-depth
```

RLS 可以拒絕不合法 database access，但不能回答完整的 Domain 問題，例如：

- EnterpriseAdmin 是否可管理指定 Organization。
- OrganizationMembership 是否等於 Employment。
- TeamManager 是否可核准 Payroll。
- stale version / replay 是否可執行。
- AttendancePeriod 是否可 finalized。

這些仍由對應 owner contract 決定。

## TLS and connection safety

正式 PostgreSQL connection 驗證 CA / hostname；不以 `rejectUnauthorized=false` 關閉 TLS 驗證。Supabase/Vercel provider URL 可攜帶 `sslmode=require`、`verify-ca` 或 `verify-full` 作 secure transport hint；Platform adapter 會驗證後移除該 hint，避免 connection-string SSL option 覆蓋 repository-owned `pg` TLS 設定。`sslmode=disable|allow|prefer` 與其他 `ssl*` material 直接拒絕。Supabase CA material 由 repository platform owner 固定提供，不接受 deployment env 覆蓋。Provider connection 可能具較高 database capability，但所有 business SQL 必須在 transaction 內先降權到 `line_app`；`line_app` 不持 DDL、schema ownership、BYPASSRLS 或任意 Auth administration 權限。

任何 pool size、statement timeout、region、capacity 都是 deployment-specific setting／量測結果；即使 repository 有起始值，也不能寫成平台永久保證。

## Configuration classes

| Setting | Responsibility |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public client key；不授予 private business table access |
| `POSTGRES_URL` | server-only PostgreSQL technical connection；Vercel Production 由 Supabase Marketplace resource 自動同步，application transaction 立即降權到 `line_app` |
| `POSTGRES_URL_NON_POOLING` | server-only schema operator connection；只供 remote reconciliation，不是 Web runtime connection |
| `SUPABASE_URL` | remote reconciliation 的 project identity guard；必須與 operator connection 指向同一 Supabase project |

Secret values、project ID、callback origin 等不寫入 docs 範例。

## Schema and deployed state

`supabase/schemas/` 是 current desired schema 的唯一 Source of Truth；`supabase/migrations/` 不參與 current contract、tests、remote deployment 或 consistency proof。Supabase 官方 `db push`／`db reset --linked`／`migration up`／`migration repair` 不屬於本專案 remote schema path。

Repository schema 存在只證明 desired state。Development remote 是否一致必須由指定 project 的 catalog／role／grant／RLS/function/trigger readback 證明；SQL success、local PGlite 或 migration history 都不能取代 remote evidence。

Remote schema state 與 deployed consumer revision 是兩個獨立 contract。Live Web 使用中的 Supabase project 不可只因 application data 為空就視為「可任意重建」；data emptiness 不代表 consumer compatibility。GitHub `Release` 在 declarative schema state 或 Release workflow 變更時執行一次已授權的 `sync --allow-destructive`；該程序內完成 initial plan、apply、second diff 與 acceptance readback，並保存 plan／verification／migration-history evidence。Reconciler-only 變更不啟動 remote runner，避免浪費 Actions 分鐘。可無損的 application-owned partial drift 由 canonical diff 收斂；需要不可推導 business data 時仍必須 fail closed。Release 允許 destructive/data-sensitive DDL，不新增或清除既有 migration history；手動 `Supabase Replace` 另先執行 additive `prepare`。兩條 path 共用 `supabase/schemas/` 與 `scripts/supabase/remote.mjs`，不建立第二套 schema truth 或 migration history。

需要 retained production data 時仍以 reviewed forward reconciliation + backup/recovery + post-write readback 發布；remote migration history 必須 before/after 完全一致，不作 schema owner 或 deployment authority。

- Schema rules：[Schema model](../040-data/030-schema-model.md)
- Core data semantics：`../../040-data/010-data-boundary-model.md`
- Production gaps：`../../090-governance/040-gaps/010-runtime-and-platform.md`

PGlite/local SQL test 能驗局部 schema / transaction，不等於 remote TLS、pool、multi-connection contention 或 production state。
