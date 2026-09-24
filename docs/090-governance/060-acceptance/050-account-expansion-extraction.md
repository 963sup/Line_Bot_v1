# Account expansion extraction — 2026-09-13

目的：在 [歷史 SQL 提取](040-schema-history-extraction.md) 後，將使用者指定 `refactor/account-schema-convergence` 的有效內容提取到目前工作樹，並同步指定 Supabase。Source 基準為 `30f241afaae425ecdc68f73d2296651adb557dd2`，提取來源為 `62c717a18196e0255ebfc22103bb8d3d21e5f6e2`；本紀錄對應未提交工作樹，不宣稱新 commit 或 Vercel deployment。

## Retained value

- 單一 stable text Account root，現有 `members` 作 USER facet。Kind-aware FK、deferred facet completeness、identity/creation-time immutability 與 RLS 阻止缺 facet、錯 kind、改 ID 或刪除 identity。
- 現有 registration/import writer 在同一 transaction 建 root；不新增第二個註冊 writer。V1 `members`、status、external mapping、receipt、source tuple、出勤及公開 Coin response 保留。
- Wallet/Ledger internal holding reference 使用 `holderAccountId`，與 actor/scope 分開；Wallet 從 Account root 核驗 USER。Coin 不因新增 Account kinds 自動開放企業、組織或 Bot。
- Member／Expense event history 收斂為 runtime INSERT/SELECT；Member 不再有 runtime DELETE。
- 提取對應 SQL、consumer、tests 與三份 current data/Wallet/Ledger 文件；原 CI 沒有變更。分支已存在於本工作樹的內容不重複套用。
- 修正來源分支新增 schema test 的 PGlite query result 泛型缺漏；第一次完整 validation 在該處失敗，修正後完整重跑通過。

## Local validation

`scripts/pnpm.ps1 validate` PASS：tooling、docs、lint、architecture tests、change-plan tests、schema:check、architecture、deadcode、全套 typecheck/tests、production build。

- Architecture：331 modules、0 violations。
- Infrastructure：81 tests；Application：35；Agents：4；Web：63 tests 加 3 個 environment tests，全部通過。
- Schema checks 包含 orphan root、wrong kind、creation-time mismatch、immutable IDs、transaction rollback、status version continuity 與 runtime history mutation 拒絕。
- 另從基準 schemas 演練增量 DDL：保留 non-UUID text ID 與原 Member row，失敗交易可回滾，成功結果的全部 catalog 與 clean current schemas 一致。

## Remote synchronization and reconciliation

Project metadata 與 privileged connection 均核對到 `clbpdzaprfcqtfwtaasg`，所屬 organization `nmximyzhtezzekjjvjyh`。沿用受控 PostgreSQL connection 與 CA/hostname 驗證，未輸出 credentials、未修改 Auth/Storage、未執行 migration repair。

於 `2026-09-13T15:39:59.670Z` 提交增量 transaction；暫時 DDL SHA256 為 `94a56c84ba2a3ce07a5b4daff54fad6ce7369b9451f5b5085690a908a9735a54`。DDL 由 desired Account schema、USER facet guards 與明確的 ALTER/backfill 組成，不作第二份 current migration history。

1. 在有限 lock/statement timeout 內鎖定既有 application tables，核對 pre-change catalog。
2. 新增 Account root，從 existing Member 的原 ID／createdAt 回填 USER；新增 generated kind、FK、identity/deferred triggers，縮小 event grants。
3. 比對全部 47 張既有表的 count 與逐列 JSON 指紋；只排除新 generated `account_kind`。所有既有資料一致，Account 與 Member 一對一且 createdAt/kind 無 mismatch。
4. Transaction 內確認新 catalog 等於 clean schemas 後才 COMMIT。第一次嘗試在 precondition 因 node-postgres 對 name[] 的表示差異而回滾；將 policy roles 明確 cast 為 text[] 後重新檢查，沒有略過 drift guard。
5. 以獨立 Supabase MCP 連線重新讀回：328 columns、242 非 NOT NULL constraints、100 indexes、51 policies、8 triggers、11 functions、53 relations、1 view 全部一致。僅正規化 CRLF/LF 與 PostgreSQL/PGlite 的 NOT NULL catalog 表示，不忽略語意差異。

最终有 48 張 application tables／48 張 RLS tables、1 個 USER Account、1 位 Member、5 筆 Ledger entries、1 個 open attendance session。Runtime 不可 UPDATE/DELETE Account、不可 DELETE Member。遠端原五筆 migration history 保留，沒有本次的新 history row。

## Runtime and concurrency evidence

- 使用 restricted runtime connection 實際執行提取後的 `PostgresWalletStore`、`PostgresMemberStore` read：1 位 holder 與舊 Wallet projection 的 units/balance 完全一致，Member status/createdAt 相同。
- Remote rollback transactions：runtime 非 USER insert 被 RLS 拒絕；orphan USER root 在 deferred constraint boundary 被拒絕。
- 兩條 PostgreSQL connections 競爭同一 synthetic identity，以實際 `pg_backend_pid()`／`pg_blocking_pids()` 觀察寫入等待；首 transaction rollback 後次 transaction 成功建立唯一 root/facet，最後亦 rollback，沒有留下 synthetic row。Pooler client protocol PID 不當作 PostgreSQL backend PID。
- Security advisor 僅回報 Auth leaked-password protection 未啟用；不是本次 schema/RLS 問題，未調整 Auth policy。參考 [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)。

## Remaining scope

這是 USER expansion 與指定分支價值提取，並非完整 UserAccount `paused` lifecycle／命名切換，也不是 EnterpriseAdmin、Organization durable lifecycle/membership、Team Organization scope、Bot 或 Payroll 完整實作。這些仍由 [Account gaps](../040-gaps/080-enterprise-and-organization.md) 與 [Migration gates](../030-migrations/040-enterprise-organization-workforce-payroll.md) 管理。

本次未發布新 Vercel runtime、未改 GitHub branch history，未做 LINE／手機或真人 business acceptance。既有 runtime 使用相容 SQL；上述本機與 restricted DB readback 不冒充新版本已部署。
