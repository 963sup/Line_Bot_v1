# Recovery

## Principle

Recovery 以不遺失已確認業務資料、不復活已撤銷資格、不破壞唯一 writer 為前提。程式 rollback、schema forward-fix與資料 restore是不同操作。

## Backup requirements

針對實際服務方案確認 backup capability、retention、cost、RPO與RTO；文件與 provider預設值不能代替指定環境驗證。

Automatic declarative schema publication不因 DDL被標記為 `sensitive` 就轉成人工 approval；它由 validated schema source授權，並以 transaction、database invariant、second diff與 security readback驗收。若變更還需要不可由 schema決定的 business data transform／metadata cutover，該 data-cutover才必須依其風險取得 recovery evidence與明確授權。

Current manual data-cutover recovery gate使用 provider API machine-read recovery state並保存最小必要 evidence；Supabase contract接受 `PITR + WALG` 或至少一筆 `COMPLETED` managed backup。Operator attestation不能替代 provider readback。若指定環境沒有可驗證 recovery capability，需先建立可驗證的 provider recovery或安全 off-site backup contract；不得以文字 reference、GitHub artifact或同一故障域的副本冒充 recovery。

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

Schema publication ordering見 [Release](020-release.md)；Supabase recovery/readback mechanism見 [Supabase](../030-platform/020-supabase.md)。

## External state

Database recovery不自動恢復 LINE Rich Menu、webhook、scheduler、Google/Supabase console等外部狀態；外部平台狀態由 [External change control](050-external-change-control.md)逐項 readback。

## Validation

Recovery只有在 restore／forward-fix後重新驗證 authorization、isolation、replay、version、停權／撤權與必要 end-to-end flow後才算完成。具日期 evidence歸 [Acceptance](../090-governance/060-acceptance/README.md)。
