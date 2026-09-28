# Attendance operation scripts

本目錄只負責 Attendance maintenance worker / scheduler 的 repository operation；business rules 由 [Attendance owner](../../docs/owners/attendance.md) 維護。

| Script | 用途 |
| --- | --- |
| `worker.mjs` | 執行一次 production Attendance maintenance：呼叫受保護 internal endpoint，處理 outbox/menu maintenance 並回報 HTTP result；會產生 external side effect。 |
| `scheduler.mjs` | `pnpm attendance:scheduler verify|reconcile --live --sha <sha>`：驗證或收斂 production `pg_cron` / Vault / endpoint desired state。 |
| `scheduler.test.mjs` | 驗證 scheduler argv、exact SHA/live authorization、SQL desired state、Web preflight、remote target/readback 與 reconcile semantics。 |

## Operation contract

- `ATTENDANCE_WORKER_SECRET` 至少 32 字元；credential 不成為 business truth。
- Scheduler job 名稱固定為 `attendance-maintenance`；只有 notification retry/menu reconciliation 到期才發 HTTP。
- `verify` readback 現況；`reconcile` 才允許 remote mutation，並保留 exact target、authorization 與 post-write readback。
- Release 只在 scheduler source、schema 或相關 Web runtime 變更時收斂；不同 provider evidence 分開回報。
- 本目錄的 production operation 不屬於 local `pnpm check` / `pnpm validate` evidence。

發布順序見 [Release process](../../docs/reference/operations/release.md)；dated 結果由 [Acceptance evidence](../../docs/change/evidence/acceptance-evidence.md) 導覽。
