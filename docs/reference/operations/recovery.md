# Recovery

## Principle

Recovery 以不遺失已確認業務資料、不復活已撤銷資格、不破壞唯一 writer 為前提。程式 rollback、schema forward-fix與資料 restore是不同操作。

## Backup requirements

針對實際服務方案確認 backup capability、retention、cost、RPO與RTO；文件與 provider預設值不能代替指定環境驗證。

Automatic declarative schema publication不因 DDL被標記為 `sensitive` 就轉成人工 approval；它由 validated schema source授權，並以 transaction、database invariant、second diff與 security readback驗收。若變更還需要不可由 schema決定的 business data transform／metadata cutover，該 data-cutover才必須依其風險取得 recovery evidence與明確授權。

Current manual data-cutover recovery gate預設使用 provider API machine-read recovery state並保存最小必要 evidence；Supabase contract接受 `PITR + WALG` 或至少一筆 `COMPLETED` managed backup。Operator attestation不能替代 provider readback。除下述使用者明確授權的特定 transition 外，若指定環境沒有可驗證 recovery capability，需先建立可驗證的 provider recovery或安全 off-site backup contract；不得以文字 reference、GitHub artifact或同一故障域的副本冒充 recovery。

使用者於 2026-10-19 明確指示「先不備份，又能綠燈，我要在vercel驗收」，授權現有 scoped identifier transition 在沒有已驗證備份下執行。這是接受無完整資料還原保障的風險，並非 backup / restore evidence，也不授權清空業務資料。其 executable 授權紀錄為 `scripts/providers/supabase/identifier-cutover-authorization.json`，僅綁定指定 project、`scoped-identifiers-v1` 與當次完整 declarative schema SHA-256（統一 LF 換行）。只有 validated current-main Release 的 `sync` 在 existing database 尚需首次 cutover 時可使用；project、authority 或 schema 不符時仍必須取得真實 provider recovery readback。不得新增通用 skip flag 或以此授權其他資料轉換。

此路徑保留 transaction、writer freeze、parity、current-main、migration-history 與部署後 activation 檢查；minimal evidence 明示 `backupVerified=false`、`providerRecoveryVerified=false`、授權 ID、project、schema hash 及實際 release SHA。`recovery` 診斷不接受此風險授權，仍只回報可驗證 provider recovery。切換提交後由 durable authority marker 阻止重 seed；後續問題優先保持 freeze 並 forward-fix，不宣稱可從未建立的備份 restore。

隔離 restore至少核對：

- Member與 external identity mapping
- ledger / Coin
- attendance facts and events
- expense records
- permission / suspension state
- audit / command receipts
- deletion / withdrawal state that must remain effective

## Release evidence horizon

Release／recovery operations owns this evidence contract. Provider workflows retain their own run artifacts and readbacks according to their configured retention window; this is not a business receipt, provider log or backup retention guarantee. 每次取證仍須讀回 artifact 的實際 expiry、availability 與內容；證據缺失採 fail-closed 處置。

先固定 exact source SHA、run ID／attempt、owner job 與 target；需要 artifact 時記錄其 ID、digest、建立／到期時間，核對內容的 target、revision、plan hash 與 result。Job conclusion 只證明 orchestration；可取得的同次 job logs／provider records 可證明其中明確記錄的操作或 readback，不能由 success 補出未保存的 facts。Artifact digest 驗證整包 bytes，不取代包內 plan hash。Skipped／已驗證 no-op 與遺失證據不同：記錄未執行原因，不要求不存在的 mutation plan，也不將 skipped 當成 provider 已收斂。

| Recovery case | 此次判斷所需的歷史 evidence | 可重新取得的 current evidence／限制 |
| --- | --- | --- |
| Schema 已變更、Web 未就緒 | Schema/job 的 exact SHA、attempt、實際 plan／hash、所需 before／after 與 post-write verification；Web deployment ID、SHA、target、結果與適用 alias readback | 使用 Supabase CLI、Vercel CLI 與對應 workflow readback；目前 catalog／deployment 不能重建先前 state 或證明舊 runtime 相容。 |
| Identifier activation fail／unknown | Exact SHA／attempt、是否執行 activation、執行的 SQL 或 verified no-op、migration history comparison、scoped-identifier readiness readback | 讀取對應 workflow 與 provider state；目前 marker／readiness 不能回填舊 attempt 的 intermediate outcome。 |
| Storage publication fail／unknown | Exact SHA／attempt、該 SHA 的 desired config、實際 write 或 no-op 結果、同次等價 provider evidence；未保存的 preflight 明示 unknown | 讀取對應 workflow 與 provider state；目前一致不能證明舊 write 是否發生。 |
| Rerun／forward-fix | 新舊 SHA／run／attempt、各 owner 操作與上述適用 evidence；分開保留 failed／unknown 與新結果 | 讀取對應 GitHub workflow run 與受影響 provider 的唯讀查證；目前 readback 不能重建舊 attempt 的 intermediate outcome。 |

Evidence 是否充分由要採取的 recovery action 決定，不能用另一種 evidence 冒充缺少的 facts。到期或缺失時先列出「已證實／未知／不適用」，保留仍可驗證的 logs／records，再取得有新查詢時間的 current readback。Current convergence 只證明目前狀態；需要歷史 before／after、plan 或 outcome 卻無法取得時，該歷史問題保持 unknown，禁止推定成功，以及禁止依賴該假設執行 rollback、重播或解凍。Forward-fix 必須依 current facts、既有授權與 validated current-main workflow 契約重新證明安全性；缺少必要證據時保持停止。涉及 backup 能力時另用 provider 官方 CLI 與 workflow readback 查證，不以 artifact 代替 backup。

取證僅保留必要 target、revision、run／attempt、deployment／artifact ID、hash、狀態、時間、counts 與 redacted error classification。不得保存 token、credential、signed URL、raw business rows、個資或不必要的 provider payload；沿既有 GitHub／provider 存取權限，不新增證據資料庫或第二份 business truth。Logs 與 provider records 的保存期限須另行查證，不假設同樣為七天或永久可取得。

受控演練可對固定 run 隱藏 artifact payload，再逐項評估剩餘 logs／metadata 能證明的 facts：包含 partial release、已驗證 no-op、skipped 與缺失 outcome。演練不得刪除遠端 artifact 或修改 production；結果與限制記錄在對應 Issue／PR，區分 tabletop evidence-completeness 與真正 provider recovery。


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

## File orphan recovery

A File Upload Intent is not a committed FileRevision. The File-owned `file:reclaim plan` is read-only. Destructive `apply` requires a separately governed, validated current-main Release operator context not yet wired into the existing main-push-only workflow; do not invoke from a branch, workstation or unvalidated provider context. Initial eligibility requires an explicitly selected UTC cutoff and at least seven days of inactivity. Quarantine under the original request/File locks blocks late Finalize before object deletion. Storage removal needs independent object-absence readback, and every successful check refreshes a durable reconciliation cursor because an unknown earlier PUT can complete after absence was observed. The historical `reclaimed_at` name does not mean provider-write quiescence. Each command examines at most 20 oldest cursors; `pageFull` describes that bounded page and must not drive an unbounded drain loop. Provider failure stops the current command and leaves quarantine for a separate explicit retry, so this mechanism does not claim global fairness past a repeatedly failing oldest candidate. Before the revised runtime handles operator work, stop or drain older operator invocations and verify the current Release revision plus declarative schema; an older command's completed result permanently filtered `reclaimed_at` rows and is not evidence of write quiescence. Committed FileRevision bytes and receipts never qualify as orphan cleanup. This is not a database backup, a global Storage scan or permission to remove business evidence.

## External state

Database recovery不自動恢復 LINE Rich Menu、webhook、scheduler、Google/Supabase console等外部狀態；外部平台狀態由 [External change control](../../rules/external-effects.md)逐項 readback。

## Validation

Recovery只有在 restore／forward-fix後重新驗證 authorization、isolation、replay、version、停權／撤權與必要 end-to-end flow後才算完成。具日期 evidence歸 [Acceptance](../../change/evidence/README.md)。
