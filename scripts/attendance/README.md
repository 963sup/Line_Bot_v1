# 出勤 worker 操作

[Attendance business rules](../../docs/owners/attendance.md) 維護通知、選單、租約、重試與順序。本目錄只記操作入口。

- `POST /api/internal/attendance-maintenance` 執行 maintenance；`GET` 使用相同 Bearer 只驗證 production runtime credential，不處理 outbox。
- `ATTENDANCE_WORKER_SECRET` 至少 32 字元；同一 credential 分別綁定 Vercel runtime 與 Supabase Vault，但不成為 business truth。
- `node scripts/attendance/worker.mjs` 執行一次完整處理，會寫資料並呼叫 LINE，不是離線測試。
- Canonical scheduler command 是 `pnpm attendance:scheduler verify|reconcile --live --sha <exact-sha>`。只有 `reconcile` 會建立必要 `pg_cron` / `pg_net` extension、更新 Vault credential、收斂 named cron job；兩種模式都先驗 production endpoint credential，再做 database readback。
- job 名稱固定為 `attendance-maintenance`；每分鐘只在 notification retry 或 menu reconciliation 到期時發 HTTP。已同步 menu 會安排下一次週期性 readback，provider binding 一致時不重複 link。
- Release 只在 scheduler 程式或自上次 scheduler 成功後的 schema／Web runtime 有变更時收斂。所需 schema／Web 操作須成功，未變更依賴可 skipped；缺 credential、target 不一致或 readback 失敗均停止。
- 驗收分開看 Web credential preflight、cron desired-state readback、worker HTTP result、outbox backlog 與 LINE provider readback；任一層成功都不替代其他層。

發布順序依 [Release process](../../docs/reference/operations/release.md)；具日期結果由 [Acceptance evidence](../../docs/change/evidence/acceptance-evidence.md) 導覽。資料庫提交、LINE 接受與手機送達分開驗證。
