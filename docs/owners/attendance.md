# Attendance

Read this file for the Attendance owner boundary and invariants. Load [detailed reference](../reference/domains/attendance.md) only for lifecycle / command / locator / policy details.

## Responsibility

Attendance owns clock-in / clock-out、open session invariant、time classification、Repository-address eligibility、clock reward eligibility / amount、write replay/version 與 attendance-derived menu/notification expectations。Asset denomination、Wallet balance 與 durable Ledger history 由各自 owner 定義；LINE delivery、LIFF runtime 與 deployment 不屬本 module business authority。

## Session invariants

- 同一 current User 最多一筆未結束 session。
- Session 不重疊，end 不早於 start；同日可以多次 clock-in/out。
- Server 保存 UTC time point；display / business day 使用 Asia/Taipei。
- 跨日 session 只是一筆 session；按每日實際相交時間分類，不重複累計。
- 未結束 session 只顯示截至 query `computedAt` 的暫計。

## Command safety

Write command 帶 stable request UUID、`expectedVersion` 與定位 payload。Actor / server time 由 server 決定。

- Version conflict → 拒絕，不覆寫新狀態。
- Same request ID + same command → 回 durable receipt，不重複 session、Ledger credit、event 或 notification。
- Same request ID + different content → conflict。
- Transaction 內重新核驗 current User qualification 與 Repository-address eligibility。
- Session state、version、event、Ledger credit、receipt 與必要 outbox expectation 同 transaction commit/rollback；value persistence 不拆成遠端 service call。

Browser `sessionStorage` 只能協助 UX 恢復；server receipt/version/state 才是 authority。

## Qualification

- Account/User 提供 current active human qualification，每次操作重新驗證。
- 上班使用 Repository 的地址屬性作打卡點，且必須具有該 Repository 的 current effective access；公開可見或 Star 不授權。
- 下班使用該筆出勤的原始地址快照。移除成員、移除或修改儲存庫地址不阻擋本人正常下班，但不授予新上班資格。
- Repository 擁有地址、座標、半徑與地址維護授權；Attendance 擁有出勤、定位核驗、快照與結果。
- 舊 Workplace 管理 API、Web 與 LINE 聊天建立流程已移除。原表只保留歷史資料，runtime 不再讀寫；不得由舊名單推導 Repository access。
