# DailyCheckIn

狀態：Domain policy、Application use case/query 與原子 claim port/adapter 由 DailyCheckIn 擁有。Account/User 提供 current human qualification；既有 Membership 路由、`member_id` storage 與 Ledger V1 source literal 只作相容 protocol，不恢復第二個 Membership owner。

## Current implementation / target distinction

Current human qualification 由 [Account/User](010-account.md) 擁有。DailyCheckIn 用例解析可信 LINE subject 對應的 User；claim adapter 在同一 SQL transaction 內鎖定並重查 User qualification，再提交每日獎勵結果、Ledger credit 與 audit。Current Web surface 是 `/daily-check-in`，由 `apps/web/src/modules/daily-check-in` 承接 claim/recovery/presentation lifecycle。前端轉盤只呈現已提交的結果，動畫完成、關閉或跳過都不決定是否入帳；Account `/settings` 使用 Account-only read projection，不載入 DailyCheckIn/Wallet。

DailyCheckIn 接受合格 User 的明確 intent。它不擁有 Account lifecycle、Asset denomination、Wallet balance、Ledger history 或 Attendance clock reward；不新增泛用 Reward Context、點數引擎或活動平台。

## Preserved policy

- 只有 qualified active human User 能提出每日簽到；Bot/Organization/Enterprise 不自動符合此規則。
- Server supplied time 使用 Asia/Taipei business day；同人每日最多一次。
- `wheel-v1` 取代固定獎勵：0.5 Coin 權重 60、1 Coin 權重 30、4 Coin 權重 10，總權重 100，期望值 1 Coin；期望值不是每日總額上限。Domain 擁有政策，Postgres adapter 提供安全隨機整數，UI 不另定機率。
- 每日 claim 保存獎項、整數獎勵單位、政策版本與決定時間；`daily_check_in_claims` 由 DailyCheckIn 擁有，Ledger 仍是入帳事實權威，Wallet 仍投影餘額。
- 不自動簽到、補發、streak bonus；client 不提供可信 amount/day/subject。
- Qualification、每日唯一 claim/audit 與 Ledger credit 原子 commit/rollback；同 User row lock 與 `(user_id, business_day)` 唯一鍵共同保護並行。
- Retry 不建立第二筆 credit；provider、cache、Personal Center、Rich Menu 都不是獎勵 authority。
- Attendance clock reward 仍由 Attendance 決定，不因同樣發 Coin 而合併規則。

Policy source 是 `packages/daily-check-in/src/domain.ts`。`dailyCheckInDay` 只接受既有有效範圍內的整數 epoch milliseconds；無效時間／日期產生獨立 `DailyCheckInError`，HTTP 為 400 / `invalid_request`。日期過期且無原結果為 409 / `operation_conflict`，不依賴 Account/User error 繼承或 alias。

## Command / query / failure

Intent 是 daily-check-in；trusted human actor 必須對應本人 User，不開放 Bot 代領。Query 提供本人今日 claim/result 與政策；balance 由 Wallet projection 組合，不保存第二份 counter。`claim` 是當日獎勵結果；`credited` 是本次新增入帳；`replayed` 表示回傳既有結果，不能把 `credited = 0` 當作未中獎。

POST `/api/membership` 的 `checkIn` intent 必須攜帶從 server view 取得的 `expectedDay`，它是前置條件，不是 client 指定發獎日期的 authority。原日結果已存在就重播；不存在且已跨日就拒絕，不補簽，也不自動改領新日。使用者重新整理後，須明確再次提出當日 intent。

GET `/api/membership?checkInDay=YYYY-MM-DD` 只查本人原日結果，用於 unknown-result recovery，不會建立 claim 或 credit。UI 先回讀再恢復畫面，不因逾時重新決定獎項；GET 確認查無結果後，使用者可明確重送原日 intent，仍受每日唯一與日期前置條件保護。機率版本不符時直接呈現結果，不使用新轉盤錯誤演示。

Not qualified、invalid time、replay conflict、Ledger unavailable、unknown result 不混為成功。未知結果使用原 business day/readback，不另發 reward。

## Durable protocol continuity

`sourceContext=membership / sourceType=daily_checkin / sourceRef=businessDay` 是已保存的 Ledger V1 origin key。首個 Account owner cutover 保留此 tuple 與既有唯一性，不對 immutable Ledger/receipt/audit 做字串替換。

日後改 tuple 必須有獨立、已驗證的一對一 key reconciliation，不能讓同一天舊／新 source 各領一次。保留既存 protocol literal 不等於建立第二套 Membership identity model。開發期直接採用新 claim 契約，不保留固定獎勵、舊 DTO 或自動補建歷史 claim 的相容分支；若有 Ledger credit 卻無相符 claim，視為資料衝突，不重新發獎或刪除歷史。既有環境的資料處置需獨立確認。

## Acceptance / remaining work

Policy tests 必須覆蓋全部 100 個 ticket 的 60/30/10 分配、機率邊界、Taipei 午夜、閏日與 invalid times；HTTP tests 覆蓋缺少／無效 expectedDay、跨午夜恢復、Account qualification failure、偽造金額／他人 ID 無效與未知 error redaction。

Application tests 固定完整回應與單次 server time；本機 PostgreSQL fixture 必須驗 claim／credit rollback、交易內資格重查、結果與 Ledger 不一致時拒絕，以及 claim 已提交但 projection 失敗後重試取得原結果。Web fixture 必須將 DailyCheckIn 與 Account qualification、Wallet、Ledger 接到同一測試資料庫。本機 PGlite fixture 的並行呼叫不等於真實 PostgreSQL 多連線競爭驗證。

Browser cases 使用合成 LINE／API，驗證 server 結果呈現、重整不重抽、斷線後只讀恢復、鍵盤與 reduced motion，以及手機尺寸。它們不證明正式資料庫、LINE 登入或真機行為。

完整 release 仍需對應遠端、跨入口及 unknown-result 驗收；本機用例／transaction port 分離不宣稱這些驗收已完成。

- [Ledger](150-ledger.md)：posting/idempotency。
- [Account current rules](010-account.md)：User qualification。
- [Account identity design](../090-governance/010-decisions/070-account-identity-design.md)：未完成 Account/Bot target。
- [Convergence plan](../090-governance/030-migrations/040-enterprise-organization-workforce-payroll.md)：階段與未完成條件。
