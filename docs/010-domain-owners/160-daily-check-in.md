# DailyCheckIn

狀態：Domain policy、Application use case/query 與原子 claim port/adapter 由 DailyCheckIn 擁有。Account/User 提供 current human qualification；既有 Membership 路由、`member_id` storage 與 Ledger V1 source literal 只作相容 protocol，不恢復第二個 Membership owner。

## Current implementation / target distinction

Current human qualification 由 [Account/User](010-account.md) 擁有。DailyCheckIn 用例解析可信 LINE subject 對應的 User；claim adapter 在同一 SQL transaction 內鎖定並重查 User qualification，再提交 Ledger credit 與既有 audit/protocol result。這個 owner 分離不改既有 ID value、wire result、SQL 欄位或歷史 source tuple。

DailyCheckIn 接受合格 User 的明確 intent。它不擁有 Account lifecycle、Asset denomination、Wallet balance、Ledger history 或 Attendance clock reward；不新增泛用 Reward Context、點數引擎或活動平台。

## Preserved policy

- 只有 qualified active human User 能提出每日簽到；Bot/Organization/Enterprise 不自動符合此規則。
- Server supplied time 使用 Asia/Taipei business day；同人每日最多一次，成功固定 1 Coin。
- 不自動簽到、補發、streak bonus；client 不提供可信 amount/day/subject。
- Qualification、每日唯一 claim/audit 與 Ledger credit 原子 commit/rollback。
- Retry 不建立第二筆 credit；provider、cache、Personal Center、Rich Menu 都不是獎勵 authority。
- Attendance clock reward 仍由 Attendance 決定，不因同樣發 Coin 而合併規則。

Policy source 是 `packages/daily-check-in/src/domain.ts`。`dailyCheckInDay` 只接受既有有效範圍內的整數 epoch milliseconds；無效時間產生獨立 `DailyCheckInError`。HTTP adapter 保留既有 400 / `invalid_request` 回應，不依賴 Account/User error 繼承或 alias。

## Command / query / failure

Intent 是 daily-check-in；trusted human actor 必須對應本人 User，不開放 Bot 代領。Query 提供本人今日 claim/result；balance 由 Wallet projection 組合，不保存第二份 counter。

Not qualified、invalid time、replay conflict、Ledger unavailable、unknown result 不混為成功。未知結果使用既有 request identity/readback，不另發 reward。

## Durable protocol continuity

`sourceContext=membership / sourceType=daily_checkin / sourceRef=businessDay` 是已保存的 Ledger V1 origin key。首個 Account owner cutover 保留此 tuple 與既有唯一性，不對 immutable Ledger/receipt/audit 做字串替換。

日後改 tuple 必須有獨立、已驗證的一對一 key migration，不能讓同一天舊／新 source 各領一次。保留既存 protocol literal 不等於建立第二套 Membership identity model。

## Acceptance / remaining work

Policy tests 覆蓋 Taipei 午夜、閏日、epoch、有效上界與 invalid times；HTTP tests 覆蓋 policy error、Account qualification failure、未知 error redaction。既有 Application、DB、Web reward/replay tests 必須繼續通過。

Application tests 固定完整回應與單次 server time；本機 PostgreSQL fixture 測試覆蓋 audit 失敗時 credit rollback、用例讀取後資格改變、claim 已提交但 projection 失敗後重試不重複入帳。Web fixture 必須將 DailyCheckIn 與 Account qualification、Wallet、Ledger 接到同一測試資料庫。這些本機證據不等於真實 PostgreSQL 多連線競爭或遠端 release 驗收。

完整 release 仍需對應遠端、跨入口及 unknown-result 驗收；本機用例／transaction port 分離不宣稱這些驗收已完成。

- [Ledger](150-ledger.md)：posting/idempotency。
- [Account current rules](010-account.md)：User qualification。
- [Account identity design](../090-governance/010-decisions/070-account-identity-design.md)：未完成 Account/Bot target。
- [Convergence plan](../090-governance/030-migrations/040-enterprise-organization-workforce-payroll.md)：階段與未完成條件。
