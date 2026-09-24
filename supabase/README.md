# Supabase 開發入口

開發階段以 [`schemas/`](schemas) 作為 database structure 的唯一 Source of Truth。歷史 SQL 已完成價值提取並退出工作樹；原 commit、逐檔 checksum 與恢復方式見 [History extraction](../docs/090-governance/060-acceptance/040-schema-history-extraction.md)。歷史不參與 current schema contract、一般測試或 `schema:check`，也不改寫遠端 migration history。

Supabase 官方 `db push`／`db reset --linked`／`migration up`／`migration repair` 會建立、重播或改寫 remote migration state；本專案 remote schema reconciliation 不使用它們。`config.toml` 停用 migration replay，`supabase/schemas/` 始終是唯一 current schema owner。

## Schema ownership

Database truth 分三層，不在 README 重複維護 object inventory：

1. [semantic model](../architecture/semantic-model.json)：business concept / owner。
2. [data topology](../architecture/data-topology.json)：persisted relation authority、role、physical file。
3. [declarative schemas](schemas/)：actual PostgreSQL definition。

[Schema tree](schemas/README.md) 只提供 object/navigation view。Authoritative relation 恰有一個 semantic owner；`900–930` 只承接 projection、cross-owner invariant、transaction coordination 與 access enforcement，不取得 business authority。Runtime package 不能因共用 PostgreSQL 直接讀寫其他 owner private relation。

## 修改流程

1. 先修改負責的 `supabase/schemas/*.sql`；不要先改 Dashboard／SQL Editor 再回填 Git。
2. 驗證 current schemas：

```sh
pnpm schema:check
pnpm check
```

`schema:check` 直接從 declarative schemas 建立乾淨 PGlite database，驗證 schema 可建立及核心 RLS／role boundary；不 replay migrations，也不驗 migration parity。PR fast validation 另會對 schema change 執行 remote reconciliation contract tests、Data Topology architecture check，以及全 workspace typecheck/test，避免 application adapter 靜默落後於 SQL desired state。

3. 需要完整 local Supabase database 時，使用：

```sh
pnpm schema:local
```

此命令只操作 `--local`：先 reset local database，再由 `supabase/schemas/` 重建 `app_private`。它會移除 local application data，不接受 linked／remote target。

4. 同步 development remote 時，先確認 project 與資料保留需求：
   - 可丟棄的 `app_private`：由 current schemas 重建 application-owned schema。
   - 需要保留資料：先比較 remote current state 與 schemas desired state，產生並審查暫時 DDL／data transform，再由 operator 套用。暫時 diff 不提交成 migration history。
5. 寫入 remote 後重新讀回 catalog／roles／grants／RLS／functions／triggers；migration history 或 SQL 執行成功本身都不能證明 remote 與 schemas 一致。

`app_private`、`auth`、`storage` 是不同 Data Boundary；重建 application schema 不代表可以刪除 Auth users 或 Storage。Runtime 不持 DDL、schema owner、migration 或 BYPASSRLS 權限。

PGlite/local validation 不等於 remote PostgreSQL、deployment、Auth、Storage 或 LINE 實機驗收；各層證據分開回報。

## Remote reconciliation

Repository-owned remote commands：

```sh
pnpm schema:remote prepare
pnpm schema:remote plan
pnpm schema:remote sync
pnpm schema:remote verify
pnpm schema:remote verify --api
```

`prepare` 只供 **preserve-data destructive cutover 前置**。它不 drop table/column/function、不改
migration history，也不把 target constraint 降級。它會在單一 transaction 內鎖定相關 authority
relations、確認 legacy source 是否可安全搬移，建立 current runtime 必須先存在的 additive
surface，並 read back。若既有資料需要不可推導的新 business metadata，必須由 operator 以
`SUPABASE_ENTERPRISE_METADATA_BACKFILL` 提供 explicit mapping；script 只接受 exact
`accountId/name/slug` JSON，不能從 UUID、display text、歷史 UI 或 provider state猜值。
任何 non-empty legacy owner data沒有明確 migration rule時都 fail closed。

`plan` 從 declarative schemas 重建 clean local target，再比較 exact remote
`app_private`。Normal `sync` 會在同一程序完成 initial plan、apply、second diff
與 acceptance readback；partial application-owned drift 交由 canonical diff 收斂，缺少 runtime
foundation role 時先以 idempotent foundation repair 修復。沒有 `--allow-destructive` 時，
destructive/data-sensitive DDL 仍 fail closed；帶 `--allow-destructive` 時仍不得改寫 migration
history，且要完成 second diff 與 acceptance readback。Standalone `verify` 保留給人工診斷；
`verify --api` 另用 publishable key 讀回 public Data API denial 與 Auth settings（Google provider
狀態只作診斷，不是 acceptance gate）。Release/Replace
保存 initial `plan.sql`、post-sync `verification.sql` 與 migration-history before/after evidence。

Remote target 由 `SUPABASE_URL` 與 `POSTGRES_URL_NON_POOLING` 交叉驗證，並要求
`SUPABASE_CONFIRM_PROJECT` exact match。Auth、Storage、`public` provider helper 與
`supabase_migrations` 都在 application mutation boundary 外。

### Automatic Release

每次 successful same-repository `main` `Validate` 都會觸發 `Release`。Release 的 `gate` 以先前 **completed Release 中成功的固定 `gate` job** 作 affected-source cursor；整體 Release conclusion 只代表 downstream external-effect evidence，不是 routing authority。沒有合格 cursor 時才以 empty tree 做 bootstrap。

Declarative schema 相對 cursor 有變更時：

```text
current validated main
→ prepare preserve-data expansion / preflight
→ plain sync (plan → apply → second diff → acceptance)
→ preserve plan / verification / history evidence
```

Declarative schema沒有變更時仍執行：

```text
current validated main
→ verify remote desired/current parity
→ preserve verification evidence
```

Automatic Release 的 plain `sync` 不帶 `--allow-destructive`；若 plan 含 destructive / data-sensitive DDL，必須 fail closed，由 manual `Supabase Replace` 承接 explicit destructive authorization。Supabase convergence 成功後才允許 Release 進入 Vercel Production deployment；database failure 不得留下已先接流量的新 runtime。

### Explicit Supabase Replace

Destructive/data-sensitive plan 只由 `Supabase Replace` workflow 授權。它固定 target
`nmssogphayjymjpbnrxv`、要求 exact current `main`、repository validation與人工 confirmation，
然後執行：

```text
prepare preserve-data expansion
→ sync --allow-destructive (plan → apply → second diff → acceptance)
→ retained evidence
```

`prepare` 成功不代表 destructive contract 已完成；`sync --allow-destructive` 成功也不代表
deployment/device/business acceptance。Supabase Replace 只修 database contract，不取得 Web
deployment ownership；完成後由 Release 對 exact validated SHA 執行 production deployment。
兩條 path 都由
`scripts/supabase/remote.mjs` 擁有 reconciliation semantics，不新增 migration file，也不改寫
`supabase_migrations.schema_migrations`。

## Production boundary

需要保留正式資料的 remote 也不建立 Supabase migration history。Forward schema change 仍先修改 current schemas，再以 reviewed diff／DDL 與必要 data transform 做 reconciliation；寫入前確認 backup／recovery，寫入後 read back catalog／roles／grants／RLS/functions/triggers，且 migration history before/after 必須一致。

操作規則見 [Supabase platform contract](../docs/030-platform/020-supabase.md)、[Schema evolution](../docs/040-data/030-schema-model.md) 與 [Release process](../docs/070-operations/020-release.md)。具日期的既有結果只保存在 [Acceptance evidence](../docs/090-governance/060-acceptance/010-acceptance-evidence.md)。

官方參考：[Declarative database schemas](https://supabase.com/docs/guides/local-development/declarative-database-schemas)。
