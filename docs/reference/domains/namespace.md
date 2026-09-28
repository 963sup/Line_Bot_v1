# Namespace detailed reference

Owner 與不變量見 [Namespace](../../owners/namespace.md)。

## Implementation

`packages/namespace/src/` 統一保存 `domain/`、`application/`、`contracts/`、`adapters/` 與 `index.ts`；package 設定、README、AGENTS 與 tests 留在 package 根目錄。

| Layer | Responsibility |
| --- | --- |
| domain | 全域 login 格式、target/binding/error、root reservation、結構化路由 |
| application | claim、resolve、rename 的輸入與流程 |
| contracts | application 使用的 NamespaceStore port |
| adapters | PostgreSQL persistence；沿用 caller 的 Sql transaction |
| index.ts | 實際跨 package 使用的公開能力；server adapter 使用獨立 export |

`@line_bot_v1/namespace` 提供 `normalizeAccountLogin`、`claimNamespace`、`resolveNamespace`、`renameNamespace`、`NamespaceError` 與 `buildNamespacePath`。Server consumer 使用 `@line_bot_v1/namespace/postgres`；不透過 Account 轉接。

## Persistence and transactions

`account_logins` 是 Namespace 唯一的 global binding truth，保留原有資料及索引。`login` unique index 支援全域查詢，`account_id` primary key 支援 stable target 查詢；批次讀取使用單次 query。沒有額外 registry 或 cache。

`claim_account_login` 只建立 binding；相同 target/kind/login 重試回原 binding，不同 login 或撞名回衝突。`rename_account_login` 以 account ID、kind 與 `expectedLogin` 做條件更新；過期值回衝突，unique constraint 保護跨帳戶名稱碰撞。

User registration 在原交易建立 User、identity 與 Namespace binding；Organization provisioning 同樣使用原交易呼叫 claim。跨 owner 的 User/login 完整性 constraint 位於 `910_cross_owner_constraints.sql`。Account 的 `user_namespace_projection` 位於 `900_cross_owner_projections.sql`，以一次 query 取得 User、login 與 optional Google email；缺 login 仍明確報完整性錯誤。View 是 projection，不新增持久化 authority。

目前不提供 release；pause／suspend 保留名稱。Rename 不改 stable ID、資源 ownership 或 provider binding。

## Scoped locators and routes

Current locator ownership 由 `architecture/semantic-model.json#locators` 管理；完整路徑與 active/planned 由 `packages/namespace/src/domain/routes.ts` 管理。

| Locator | Current persistence authority |
| --- | --- |
| User / Organization global login | Namespace / account_logins |
| Repository owner-scoped name | Repository |
| Organization Team slug | Team |
| Enterprise / EnterpriseTeam slug | Enterprise |
| Repository Issue / Discussion / Milestone locator | Repository |

Web Profile 與 Team navigation 直接使用 Namespace path builder。Builder 驗證 active route 及所需參數，逐段編碼；Repository 合法名稱包含斜線時仍能建立 encoded segment。Planned descriptor 不做 DB lookup，也不預建未定義的功能。

尚未啟用的 Pull、Organization Project／People／Packages／Discussions、Sponsors 等條件見 [selected topology](../../change/decisions/namespace-route-topology.md)。Namespace 的結構化契約集中描述路由；上述 scoped 實體的配置與持久化並未在本次一併搬遷。

## Validation

Package tests 覆蓋 normalization、保留名稱、claim/rename/resolve、衝突與交易 rollback、route inventory 及 scoped locator ownership。`pnpm check` 是一般修改的驗證入口；本機測試與靜態檢查不等於遠端 schema 部署或 LINE 實機驗收。
