# @line_bot_v1/attendance
Owner: Attendance, Workplace, WorkplaceChat behavior, and Attendance-owned writes. Semantics: [Attendance](../../docs/owners/attendance.md).

- Account owns current User qualification; Identity/Access owns workplace-management permission. Use public capabilities; do not write their relations or duplicate their policy.
- `attendance_identity_bindings` is derived read data only.
- Preserve transaction-time qualification recheck, `expectedVersion`, replay, geofence, Ledger credit, durable retry, and tenant isolation.
- Attendance business failures use `AttendanceError`.
