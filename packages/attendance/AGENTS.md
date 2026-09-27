# @line-work/attendance

- Owner boundary: Attendance owns Attendance, Workplace and WorkplaceChat behavior plus Attendance-owned writes. Canonical semantics: [Attendance](../../docs/owners/attendance.md).
- Cross-owner inputs use public capabilities: Account owns current User qualification; Identity/Access owns workplace-management permission. Attendance must not write their relations or recreate their authorization policy.
- `attendance_identity_bindings` is a derived read projection only for same-query filtering; it is not Account authority.
- Preserve transaction-time qualification recheck, `expectedVersion`, request replay, geofence, Ledger credit, durable menu/notification retry and tenant isolation. External owner errors/types remain inputs; Attendance business failures use `AttendanceError`.
