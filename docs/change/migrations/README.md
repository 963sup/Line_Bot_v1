# Migrations

只保存仍需執行或驗證的 cutover。完成後仍成立的 truth 蒸餾到 owner，完成 migration 文件刪除，不保留第二份現況。

- [Enterprise / Organization / Workforce / Payroll migration](enterprise-organization-workforce-payroll.md)：仍在進行的 Employment-scoped Attendance、Workforce 與 Payroll activation/cutover。
- [Issue core parity cutover](issue-core-parity.md)：Issue state/body/assignee expand 已相容；只追蹤經 recovery/preflight 後的 legacy physical backfill 與 contract cleanup。
- [Scoped Numbering and Namespace cutover](scoped-numbering-namespace.md)：追蹤五個 Numbering family 與十一個 Namespace family 的 production preflight、原子切換及 readback。
- [File / Intelligence processing receipt cutover](file-intelligence-processing-receipt-cutover.md)：追蹤舊 ProcessingRun 與混合 receipt 的受控資料切分、hash readback 與保留條件。

Permission/User naming 與早期 management migration 已完成並由 current source/schema/owner contract取代，因此不再留在 migration navigation。
