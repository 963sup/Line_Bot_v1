# Recovery

## Principle

Recovery 以不遺失已確認業務資料、不復活已撤銷資格、不破壞唯一 writer 為前提。程式 rollback、schema forward-fix與資料 restore是不同操作。

## Backup requirements

針對實際服務方案確認 backup capability、retention、cost、RPO與RTO；文件與 provider預設值不能代替指定環境驗證。

Automatic declarative schema publication不因 DDL被標記為 `sensitive` 就轉成人工 approval；它由 validated schema source授權，並以 transaction、database invariant、second diff與 security readback驗收。若變更還需要不可由 schema決定的 business data transform／metadata cutover，該 data-cutover才必須依其風險取得 recovery evidence與明確授權。

Current manual data-cutover recovery gate預設使用 provider API machine-read recovery state並保存最小必要 evidence；Supabase contract接受 `PITR + WALG` 或至少一筆 `COMPLETED` managed backup。Operator attestation不能替代 provider readback。除下述使用者明確授權的特定 transition 外，若指定環境沒有可驗證 recovery capability，需先建立可驗證的 provider recovery或安全 off-site backup contract；不得以文字 reference、GitHub artifact或同一故障域的副本冒充 recovery。

使用者於 2026-10-19 明確指示「先不備份，又能綠燈，我要在vercel驗收」，授權現有 scoped identifier transition 在沒有已驗證備份下執行。這是接受無完整資料還原保障的風險，並非 backup / restore evidence，也不授權清空業務資料。其 executable 授權紀錄為 `scripts/supabase/identifier-cutover-authorization.json`，僅綁定指定 project、`scoped-identifiers-v1` 與當次完整 declarative schema SHA-256（統一 LF 換行）。只有 validated current-main Release 的 `sync` 在 existing database 尚需首次 cutover 時可使用；project、authority 或 schema 不符時仍必須取得真實 provider recovery readback。不得新增通用 skip flag 或以此授權其他資料轉換。

此路徑保留 transaction、writer freeze、parity、current-main、migration-history 與部署後 activation 檢查；minimal evidence 明示 `backupVerified=false`、`providerRecoveryVerified=false`、授權 ID、project、schema hash 及實際 release SHA。`recovery` 診斷不接受此風險授權，仍只回報可驗證 provider recovery。切換提交後由 durable authority marker 阻止重 seed；後續問題優先保持 freeze 並 forward-fix，不宣稱可從未建立的備份 restore。

隔離 restore至少核對：

- Member與 external identity mapping
- ledger / Coin
- attendance facts and events
- expense records
- permission / suspension state
- audit / command receipts
- deletion / withdrawal state that must remain effective

## Recovery decision

尚未產生新 writer資料時，可以依已驗證方案恢復舊 runtime；一旦新版本已有寫入，必須先停止 writer、對帳增量，再選擇向前修復或受控資料還原。不得只 rollback Web丟棄新資料。

不得以雙寫、第二主庫或自動 fallback取代可驗證的 recovery procedure。

## Schema recovery

Current schema publication不以 migration history作 rollback機制，也不改寫 migration history。

若 schema與runtime發生相容問題：

1. 先確認 remote transaction結果、current catalog、consumer revision與 partial external effects。
2. 未產生不可相容新資料時，可恢復 compatible runtime。
3. 已產生新資料或已完成不可逆 business transform時，優先停止 writer並向前修復；只有在明確停機、備份與授權下才執行受控 restore。
4. Recovery完成後重新由 current declarative schemas驗證 desired/current parity；不得以重播舊 migration history取代 current reconciliation。

Schema publication ordering見 [Release](release.md)；Supabase recovery/readback mechanism見 [Supabase](../platform/supabase.md)。

## External state

Database recovery不自動恢復 LINE Rich Menu、webhook、scheduler、Google/Supabase console等外部狀態；外部平台狀態由 [External change control](../../rules/external-effects.md)逐項 readback。

## Validation

Recovery只有在 restore／forward-fix後重新驗證 authorization、isolation、replay、version、停權／撤權與必要 end-to-end flow後才算完成。具日期 evidence歸 [Acceptance](../../change/evidence/README.md)。
