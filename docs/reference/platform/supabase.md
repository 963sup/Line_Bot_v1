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

Supabase secret / service-role 類高權限變數即使由 Marketplace 一併注入，也必須視為 **server-only technical capability**：它可以繞過一般 RLS enforcement，因此不得出現在 browser/client bundle，也不能因持有高權限 key 就跳過 actor qualification、authorization、scope 或 business invariant。Application PostgreSQL persistence 不消費 service-role key；File 私有 Storage Object Adapter 在 server-only runtime 消費該 key，但必須先由 File Application／Repository 完成當下授權。

Web runtime 的 PostgreSQL application connection contract 是 provider-owned `POSTGRES_URL`。Vercel 與 Supabase resource 綁定後由平台同步該值；Vercel serverless runtime 使用 Supavisor transaction pooler（port 6543），business transaction 內立即 `SET LOCAL ROLE line_app`，維持 grants、RLS 與 application data boundary。

Supabase schema/operator reconciliation 與 product runtime 明確解耦。Production remote mutation 只接受已合併且已驗證的 current `main` canonical schema，並由受信任 Supabase MCP 或官方 non-pooling operator connection 執行及 readback。Branch 可使用 local stack 或明確隔離、可重建的 non-production project 做整合驗證；它不得寫入 Production，也不能產生 migration history 或 Production publication evidence。

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
| `SUPABASE_SERVICE_ROLE_KEY` | server-only File private object API credential；不得進 Browser、CLI 請求、Logs 或共用 PostgreSQL Adapter |
| `SUPABASE_ACCESS_TOKEN` | server-only Management API credential；只注入可能需要首次 cutover recovery readback 的 schema sync step，不進 browser/runtime、deployment 或 runtime activation，也不作 business authority |

Secret values、project ID、callback origin 等不寫入 docs 範例。

## Schema and deployed state

Schema authority與「DDL vs business data transform」的語意由 [Schema model](../data/schema.md) 擁有；本文件只描述 Supabase provider與 remote reconciliation mechanism。

Repository-owned remote reconciliation使用 `POSTGRES_URL_NON_POOLING`，並以 `SUPABASE_URL`／`SUPABASE_CONFIRM_PROJECT`交叉確認 exact target。Application mutation boundary只包含 repository-owned application schema；`auth`、`storage`、provider `public` helper與 `supabase_migrations` 不在其中。

`packages/integration-supabase/src/schemas/*.sql` 是所有環境的 application-schema DDL authority。Non-production target 可跟隨正在驗證的 branch source；Production 只跟隨 current `main`。Repository 目前沒有 `schema:remote` operator command 或通用 schema Release workflow；受信任 operator 使用 Supabase MCP 或官方 non-pooling connection 套用 exact bounded DDL，並保存 environment、target、source revision、preflight 與 readback evidence。

Read-only diagnosis 使用 Supabase logs、catalog query 與 local `schema:check`。Remote write 前確認 exact project、current-main source 與既有資料能承受 DDL；write 後驗 catalog／RLS／grant 及受影響 invariant。Business identity/data 不由 schema reconciliation 補值；需要 owner confirmation 的資料修正必須走 owning domain command。

Numbering / Namespace 首次成為 central authority 是一個明確、不可重播的例外 cutover contract，而非 generic schema backfill。Operator 只在 desired schema 含完整 authority objects、remote 尚無任何 business authority object時判定需要 cutover；existing database 必須先取得 machine-readable recovery readback，或 [Recovery](../operations/recovery.md) 規定的 exact project / authority / schema 無備份風險授權，才凍結 legacy writers並於同一 transaction 套用 DDL與呼叫 operator-only cutover function。風險授權不會讓 `recovery` 診斷宣稱有備份。Catalog 證明沒有 application schema 的 fresh bootstrap 沒有 retained business data，可略過 recovery gate。Function 只能從可證明的 current/tombstone/event/high-water facts建立 imported records，通過 parity後寫入 `scoped-identifiers-v1` marker，但保持 `runtime_ready=false`。此狀態是資料庫持有的 stop/drain 維護窗：舊 runtime 與已部署但未驗證的新 runtime 都不能寫入受保護資源。只有 Vercel exact SHA production deployment/readback 成功後的 operator-only activation function能設為 ready；deployment/activation failure 保持 frozen，由後續 compatible current-main Release forward-fix。後續發布只驗 marker、current parity與 readiness，不重 seed；partial deployment、缺 marker或 runtime role 可執行 lifecycle functions 皆 fail closed。

Production repository-owned remote mutation 只允許已合併且已驗證的 current `main` canonical source 授權。Non-production mutation 必須使用明確隔離、可重建且不承載 Production data 的 target。執行端可以是受信任 Supabase MCP 或官方 operator connection；任一 remote write 都必須保存 environment、target、source revision 與必要 preflight/readback evidence。

Supabase migration history不是 current schema authority，也不是 deployment mechanism。Reconciliation不得新增、replay或repair migration history；`supabase_migrations.schema_migrations` fingerprint before/after必須完全相同。

Production schema publication 必須在 validated `main` 後由 operator 明確執行；repository 目前沒有自動 Supabase schema Release workflow。與 runtime 協調的 ordering 由 [Release](../operations/release.md) 擁有；backup／restore 與 data-cutover recovery 要求由 [Recovery](../operations/recovery.md) 擁有。

PGlite/local SQL test能驗局部 schema／transaction，不等於 remote TLS、pool、multi-connection contention或 production state。

- Schema semantics：[Schema model](../data/schema.md)
- Core data semantics：[Data boundary model](../data/boundaries.md)
- Release ordering：[Release](../operations/release.md)
- Recovery：[Recovery](../operations/recovery.md)
- Production gaps：[Runtime and platform gaps](../../change/gaps/runtime-and-platform.md)

## Free Plan capability ownership and activation

The current Supabase Organization for `Line_Bot_v1` is on the Free plan; account-specific quotas and provider availability must be verified again before publication. This section routes capabilities to their existing authority; it does **not** enable optional features by declaration.

| Free-capable provider feature | Current consumer and authority | Activation policy |
| --- | --- | --- |
| Postgres / application SQL / RLS | `app_private` declarative schema; each `packages/<owner>` owns its facts | Current; keep browser roles outside private schema |
| PostgREST and pg_graphql | Hosted PostgREST exists; no authorized private-business GraphQL consumer | Do not create a second direct browser business API |
| Auth providers | Account's Google PKCE proof; LINE identity remains independent | Current subset; provider user metadata never grants Repository permission |
| File Storage | File's originals; `packages/integration-supabase/supabase/config.toml` owns the private `repository-files` bucket settings | Target; Bucket publication does not imply File Upload adapter delivered |
| Realtime Broadcast / Presence / Postgres Changes | No verified realtime consumer for File or other owners | Leave inactive until actual private change feed and access revocation rules exist |
| Edge Functions | No deployed function consumer currently evidenced | No empty `functions/` or duplicate Next.js use case |
| pg_cron / pg_net / Vault | Attendance's existing authenticated scheduler | Current; do not create a generic second scheduler |
| Queues / pgmq | No durable queue consumer (ProcessingRun already owns user intent) | Not enabled until claim, lease, recovery and retry contract is necessary |
| pgvector / semantic search | No authoritative embedding consumer | Not enabled until owner, provenance, version and privacy contract exists |
| Database webhooks | No separate required outbound consumer | Keep dormant; use owner-specific events only when needed |
| Studio / Logs / advisors / CLI | Provider diagnostics and existing schema/Release operator | Provider tools, not product business Owners |

Supabase Free currently documents approximately 500 MB per project for Database, 1 GB Storage, and 50 MB global maximum upload size. The File Bucket deliberately limits one object to 45 MiB (under the Free global limit). These are provider limits, **not** product authorization, upload completeness or backup guarantees. Free plans do not include downloadable managed daily backups or PITR. Database-only backups do not restore Storage objects. Reference: [Free quotas](https://supabase.com/docs/guides/platform/billing-on-supabase), [Storage limits](https://supabase.com/docs/guides/storage/uploads/file-limits), [Backup guarantees](https://supabase.com/docs/guides/platform/backups).

### File Storage publication boundary

- Bucket configuration Source of Truth: native `packages/integration-supabase/supabase/config.toml#storage.buckets.repository-files`. Do not add another `supabase/storage/file.json` manifest.
- Bucket is **private**, format-neutral, and shared across Repositories. RepositoryId isolation comes from current Repository authorization in File; object keys or bucket visibility alone do not grant access.
- `packages/integration-supabase/src/schemas/*.sql` remains the sole application PostgreSQL schema authority; it must never `INSERT/UPDATE/ALTER` provider-owned `storage.buckets` or `storage.objects` to publish File Storage.
- Storage provider mutation uses the pinned Supabase CLI or trusted provider operator; repository currently has no Storage Release workflow. Production requires exact current-main authorization, the pinned project, a matching preflight and a post-write readback. Unknown outcomes must be read back rather than blindly retried; existing divergent Bucket settings must fail closed rather than overwrite.
- Bucket creation and File's object storage adapter are independent deliverables. A configured empty Bucket does **not** mean objects are safely persisted. File requires a durable upload identity, hash verification, finalize, immutable key, rollback/recovery and protected download before replacing its current PostgreSQL `bytea` implementation.
