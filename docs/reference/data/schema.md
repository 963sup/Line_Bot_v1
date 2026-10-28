# Schema model

## Canonical source

`packages/integration-supabase/src/schemas/` 是 current desired PostgreSQL structure 的唯一 Source of Truth。Schema modules 以數字前綴表達 lexical dependency order；table、constraint、index、RLS、grant、function、trigger 與 role 都由負責的 declarative SQL 定義。

`packages/integration-supabase/src/migrations/` 不屬於 current contract，也不是 remote deployment source。歷史 SQL 的追溯與恢復見 [History extraction](../../change/evidence/schema-history-extraction.md)；current code、fixtures、`schema:check` 與 remote reconciliation 都不 replay、repair 或新增 migration history。

## Schema change

完整的 environment、operator、readback、branch 與 migration-history 規則集中在 [integration-supabase Canonical Supabase rules](../../../packages/integration-supabase/src/README.md#canonical-supabase-rules)。本文件只定義 schema 的資料語意與 DDL／data transform 分界。

## Schema change vs data transform

Declarative schema只擁有結構與 database-enforceable invariant，不能自行創造 business fact。

因此必須分開：

- **Schema DDL**：由 current schemas 決定；validated source change 可由受信任 operator 收斂到對應 target。
- **Business data transform / metadata cutover**：需要 owner、mapping、retention、recovery或其他無法由 schema推導的 truth時，使用獨立 data-cutover contract；不得把 fabricated backfill藏進 generic schema sync。

Rename、consolidation、drop、backfill、non-null transition若涉及既有資料，先判斷「DDL本身能否在 current data上成立」與「是否需要額外 business mapping」是兩個不同問題。PostgreSQL constraint/transaction可以拒絕不成立的 DDL；它不能替 business owner決定缺失資料。

## Constraints

Database-enforceable invariant使用 PostgreSQL constraint、index、FK、CHECK、unique等 database guard。Application validation負責 use-case error與 Domain rule，但不能成為 concurrency／alternate server path下唯一的資料完整性防線。

RLS／grants是 database defense-in-depth，不取代 application authorization。Browser roles不因 API存在而取得 private business table access。

## Private schema and provider boundary

Business tables位於 private application schema，透過受限 server role／adapter使用。Runtime grant維持最小化，不持 schema ownership、DDL、BYPASSRLS、任意 audit mutation或不屬於產品 use case的 administration capability。

`app_private`、`auth`、`storage`與 `supabase_migrations` 是不同 Data Boundary。Application schema reconciliation不得把 provider-owned schema或 migration history納入自己的 mutation authority。

## Desired state vs deployed state

Git中的 schemas只證明 repository desired state，不能證明：

- development／production remote已同步；
- business data transform已完成；
- remote grants／RLS與 repository相同；
- backup／restore已驗證；
- consuming runtime已安全發布。

Remote synchronization必須以指定 project的 post-write readback為證據；SQL success、migration history或 local test都不能替代 remote state verification。

## Production boundary

Production與development共享同一 schema authority與 reconciliation mechanism；差異在 retained data、consumer compatibility、recovery與 release evidence，不在 schema owner。

Production 與 development 的 schema authority 及 operator 規則集中在 [integration-supabase Canonical Supabase rules](../../../packages/integration-supabase/src/README.md#canonical-supabase-rules)。本文件只保留資料保留、consumer compatibility 與 DDL／business transform 的語意；publication ordering 由 [Release](../operations/release.md) 擁有，recovery 由 [Recovery](../operations/recovery.md) 擁有。

## Verification

Current repository schema verification只證明 declarative source、clean build與安全 boundary；remote parity、deployment與business acceptance是不同 evidence。

- 開發入口：[Supabase README](../../../packages/integration-supabase/src/README.md)
- Supabase platform：[Supabase](../platform/supabase.md)
- Release：[Release](../operations/release.md)
- Recovery：[Recovery](../operations/recovery.md)
- Acceptance evidence：[Acceptance](../../change/evidence/README.md)
