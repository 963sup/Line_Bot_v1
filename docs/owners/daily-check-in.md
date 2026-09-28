# DailyCheckIn

Read this file for the DailyCheckIn owner boundary and invariants. Load [detailed reference](../reference/domains/daily-check-in.md) only when the task needs lifecycle / command / locator details.

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
