# Attendance

Read this file for the Attendance owner boundary and invariants. Load [detailed reference](../reference/domains/attendance.md) only for lifecycle / command / locator / policy details.

## Responsibility

Attendance owns clock-in / clock-out、open session invariant、time classification、workplace eligibility、clock reward eligibility / amount、write replay/version 與 attendance-derived menu/notification expectations。Asset denomination、Wallet balance 與 durable Ledger history 由各自 owner 定義；LINE delivery、LIFF runtime 與 deployment 不屬本 module business authority。

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
- Transaction 內重新核驗 current User qualification 與 workplace eligibility。
- Session state、version、event、Ledger credit、receipt 與必要 outbox expectation 同 transaction commit/rollback；value persistence 不拆成遠端 service call。

Browser `sessionStorage` 只能協助 UX 恢復；server receipt/version/state 才是 authority。

## Qualification

- Flow 綁定 server 驗證後的 current human identity；Account/User 提供人類 qualification，legacy storage / protocol literal 只作 compatibility，不建立第二套 identity authority。
- 開始、接收 location/radius 與最終確認都重新核驗 current human qualification 與全域 `workplaces.manage`。
- TeamManager、LINE group admin、一般 active User 都不因此取得地點管理權。
- Group chat location、普通聊天、沒有進行中 flow 的 location event 不建立地點。
