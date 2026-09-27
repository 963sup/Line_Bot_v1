# DailyCheckIn detailed reference

Low-frequency DailyCheckIn details. The owner boundary and invariants remain canonical in [DailyCheckIn](../../../010-domain-owners/160-daily-check-in.md).

## Current implementation / target distinction

Current human qualification 由 [Account/User](../../010-domain-owners/010-account.md) 擁有。DailyCheckIn 用例解析可信 LINE subject 對應的 User；claim adapter 在同一 SQL transaction 內鎖定並重查 User qualification，再提交每日獎勵結果、Ledger credit 與 audit。Current Web surface 是 `/daily-check-in`，由 `apps/web/src/modules/daily-check-in` 承接 claim/recovery/presentation lifecycle。前端轉盤只呈現已提交的結果，動畫完成、關閉或跳過都不決定是否入帳；Account `/settings` 使用 Account-only read projection，不載入 DailyCheckIn/Wallet。

DailyCheckIn 接受合格 User 的明確 intent。它不擁有 Account lifecycle、Asset denomination、Wallet balance、Ledger history 或 Attendance clock reward；不新增泛用 Reward Context、點數引擎或活動平台。

## Durable protocol continuity

`sourceContext=membership / sourceType=daily_checkin / sourceRef=businessDay` 是已保存的 Ledger V1 origin key。首個 Account owner cutover 保留此 tuple 與既有唯一性，不對 immutable Ledger/receipt/audit 做字串替換。

日後改 tuple 必須有獨立、已驗證的一對一 key reconciliation，不能讓同一天舊／新 source 各領一次。保留既存 protocol literal 不等於建立第二套 Membership identity model。開發期直接採用新 claim 契約，不保留固定獎勵、舊 DTO 或自動補建歷史 claim 的相容分支；若有 Ledger credit 卻無相符 claim，視為資料衝突，不重新發獎或刪除歷史。既有環境的資料處置需獨立確認。

## Acceptance / remaining work

Policy tests 必須覆蓋全部 100 個 ticket 的 60/30/10 分配、機率邊界、Taipei 午夜、閏日與 invalid times；HTTP tests 覆蓋缺少／無效 expectedDay、跨午夜恢復、Account qualification failure、偽造金額／他人 ID 無效與未知 error redaction。

Application tests 固定完整回應與單次 server time；本機 PostgreSQL fixture 必須驗 claim／credit rollback、交易內資格重查、結果與 Ledger 不一致時拒絕，以及 claim 已提交但 projection 失敗後重試取得原結果。Web fixture 必須將 DailyCheckIn 與 Account qualification、Wallet、Ledger 接到同一測試資料庫。本機 PGlite fixture 的並行呼叫不等於真實 PostgreSQL 多連線競爭驗證。

Browser cases 使用合成 LINE／API，驗證 server 結果呈現、重整不重抽、斷線後只讀恢復、鍵盤與 reduced motion，以及手機尺寸。它們不證明正式資料庫、LINE 登入或真機行為。

完整 release 仍需對應遠端、跨入口及 unknown-result 驗收；本機用例／transaction port 分離不宣稱這些驗收已完成。

- [Ledger](../../010-domain-owners/150-ledger.md)：posting/idempotency。
- [Account current rules](../../010-domain-owners/010-account.md)：User qualification。
- [Account identity design](../../090-governance/010-decisions/070-account-identity-design.md)：未完成 Account/Bot target。
- [Convergence plan](../../090-governance/030-migrations/040-enterprise-organization-workforce-payroll.md)：階段與未完成條件。
