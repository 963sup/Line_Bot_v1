# Schema model

## Canonical source

開發階段 `supabase/schemas/` 是 current desired PostgreSQL structure 的唯一 Source of Truth。Schema modules 依數字前綴表達 dependency order；table、constraint、index、RLS、grant、function、trigger 與 role 都由負責的 schema 檔定義。

`supabase/migrations/` 不屬於 current contract，也不是 remote deployment source。歷史 SQL 已退出工作樹，追溯與恢復見 [History extraction](../090-governance/060-acceptance/040-schema-history-extraction.md)；current code、fixtures、`schema:check` 與 remote reconciliation 都不 replay 或新增 migration history。

## Development workflow

Schema change：

1. 修改負責的 `supabase/schemas/*.sql`。
2. 用 `schema:check` 驗證 declarative schemas 能建立乾淨 database，並保護核心 RLS／role boundary。
3. 需要完整 local Supabase 時，用 repository `schema:local` 從 schemas 重建 local `app_private`；不 replay migration history。
4. Development remote 可丟棄 application data 時，由 schemas 重建 application-owned schema；需保留資料時，才產生由 remote current state 到 desired schemas 的暫時 DDL／data transform，審查後套用。
5. Remote 寫入後重新讀回 catalog、RLS、grants、functions、triggers 與 roles，確認 deployed current state 符合 schemas。

不得先在 remote Dashboard／SQL Editor 改結構再回填 schemas，也不得為了讓舊 parity test 通過而補 migration。

Supabase 官方 `db push`、`db reset --linked`、`migration up` 與 `migration repair` 都不屬於本專案 remote schema path。Remote 只接受由 current schemas 產生、經審查後直接套用的 reconciliation SQL，且 migration history 必須保持不變。

## Constraints

Database-enforceable invariant 使用 PostgreSQL constraint、index、FK、CHECK、unique 等 database guard。Application validation 負責 use-case error 與 Domain rule，但不能成為 concurrency／alternate server path 下唯一的資料完整性防線。

RLS／grants 是 database defense-in-depth，不取代 application authorization。Browser roles 不因 API 存在而取得 private business table access。

## Private schema

Business tables 位於 private application schema，透過受限 server role／adapter 使用。Runtime grant 維持最小化，不持 schema ownership、DDL、BYPASSRLS、任意 audit mutation 或不屬於產品 use case 的 administration capability。

`app_private`、`auth`、`storage` 是不同 Data Boundary；application schema reset 不等於 Auth／Storage reset。

## Desired state vs deployed state

Git 中存在 schema 檔，只能證明 repository desired state，不能證明：

- development／production remote 已同步；
- production data transformation 已完成；
- remote grants／RLS 與 repository 相同；
- backup／restore 已驗證。

Remote synchronization 必須以指定 project 的 post-write readback 為證據；SQL success、migration history 或 local test 都不能替代 remote state verification。

## Data preservation

需要保留資料的環境中，rename、consolidation、drop、backfill、non-null change 都要先確認 owner、retention、mapping 與 rollback/recovery。Schema diff 只能作為候選 DDL，不可自行推論業務資料轉換。

Test fixture／seed data 不是 production evidence，也不得冒充真實 user、role 或 business record。

## Production boundary

需要保留資料的 remote 不改變 Source of Truth：仍先修改 current schemas，再由 remote current state → desired state 產生 reviewed forward reconciliation。Production 額外要求 backup／recovery、資料轉換審查與 post-write readback；Supabase migration history 不新增、不修補、不作 deployment authority。

Development 與 production 的差異在 data preservation／release evidence，不在 schema owner 或 migration mechanism。

## Verification

Current repository schema verification只檢查 declarative schema source、乾淨 build 與安全 boundary；不比較 migration history。

- 開發入口：`../../../supabase/README.md`
- Supabase contract：`../../030-platform/020-supabase.md`
- Deployment／recovery：[Operations](../070-operations/README.md)
- Acceptance evidence：`../../090-governance/060-acceptance/`
