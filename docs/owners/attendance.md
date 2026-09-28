# Attendance

Read this file for the Attendance owner boundary and invariants. Load [detailed reference](../reference/domains/attendance.md) only for lifecycle / command / locator / policy details.

## Responsibility

Attendance owns clock-in / clock-out、Repository-scoped Workplace geofence configuration / verification、open session invariant、time classification、clock reward eligibility / amount、write replay/version 與 attendance-derived menu/notification expectations。Repository owns current effective access and therefore owns who may participate in that Repository's clock flow；Attendance does not maintain a second membership/access authority。Asset denomination、Wallet balance 與 durable Ledger history 由各自 owner 定義；LINE delivery、LIFF runtime 與 deployment 不屬本 module business authority。

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
- Transaction 內重新核驗 current User qualification、current Repository access 與 Workplace geofence。
- Session state、version、event、Ledger credit、receipt 與必要 outbox expectation 同 transaction commit/rollback；value persistence 不拆成遠端 service call。

Browser `sessionStorage` 只能協助 UX 恢復；server receipt/version/state 才是 authority。

## Repository / Workplace boundary

- Workplace identity = Repository id；每個 Repository 最多一個 configured Workplace。
- current effective Repository access 決定 User 是否可在該 Repository 打卡；direct User grant 與 Team-derived access 都由 Repository owner 計算。
- 沒有 separate WorkplaceMembership；撤銷 Repository access 後，下一次 clock operation 必須立即拒絕。
- current Repository `admin` capability 才能建立或修改該 Repository Workplace；可打卡不等於可管理地點。
- 成功 attendance event 保存當時 Workplace id/version/name/geometry/radius evidence；目前設定不能改寫歷史證據。
