# @line-work/attendance

- 本 package 擁有 Attendance、Workplace、WorkplaceChat 的 domain/application/runtime writer；只可直接 mutation Attendance-owned authoritative relations。
- Current User qualification 由 `@line-work/account` public PostgreSQL capability提供；需要在同一 SQL query 篩選 outbox 時只讀 `attendance_identity_bindings` derived projection。Attendance 不直接寫 Account relations。
- Workplace management permission 由 `@line-work/identity-access` public capability提供；Attendance 不直接讀寫 `permission_grants` 作第二套 authorization policy。
- Attendance 使用自己的 `AttendanceError`；Account/IdentityAccess 是 qualification inputs，不把外部 owner error/type 當 Attendance business authority。
- 保留 transaction 內資格重查、expectedVersion、request replay、geofence、Ledger credit、menu/notification durable retry 與 tenant isolation。
- Employment-scoped Attendance 仍是獨立 target evolution；不得用 ID rename 或 current Team/Workplace membership 推導 Employment。
