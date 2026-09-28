# Attendance package

Routing and module overview for `@line_bot_v1/attendance`.

- Semantic Owner: `attendance`
- Authority document: [`docs/owners/attendance.md`](../../docs/owners/attendance.md)
- Machine boundaries: [`architecture/implementation-topology.json`](../../architecture/implementation-topology.json)
- Persistence mapping: [`architecture/data-topology.json`](../../architecture/data-topology.json)

## Scope

Repository-scoped Workplace geofence configuration, attendance sessions, clock in/out tracking, and shift verification. Repository owns current access eligibility；Attendance does not maintain a second Workplace membership list.
