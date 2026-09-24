# 出勤 worker 操作

[Attendance business rules](../../docs/010-domain-owners/050-attendance.md) 維護通知、選單、租約、重試與順序。本目錄只記操作入口。

- `POST /api/internal/attendance-maintenance` 使用 ATTENDANCE_WORKER_SECRET Bearer（至少 32 字元）；未設定回 503，錯誤憑證回 401。
- `node scripts/attendance/worker.mjs` 執行一次完整處理，會寫資料並呼叫 LINE，不是離線測試。
- 原生排程：以部署角色將完整 HTTPS endpoint／secret 參數化存入 Vault 的 attendance_worker_url／attendance_worker_secret，再執行 [schedule.sql](schedule.sql)。這是獨立遠端操作，不在 validate 或 Web 啟動時執行。
- job 名稱固定為 attendance-maintenance；每分鐘只對到期工作發 HTTP。停用：`SELECT cron.unschedule('attendance-maintenance');`。
- 驗收 cron.job、cron.job_run_details、HTTP 回應及 outbox 積壓；failed／expired 先查原因，不產生新 retry key。單次成功不證明週期排程存在。

發布順序依 [Release process](../../docs/070-operations/020-release.md)；具日期結果由 [Acceptance evidence](../../docs/090-governance/060-acceptance/010-acceptance-evidence.md) 導覽。資料庫提交、LINE 接受與手機送達分開驗證。