# @line-work/daily-check-in

Owner: DailyCheckIn policy and application contract. Canonical semantics: [DailyCheckIn](../../docs/owners/daily-check-in.md).

- Keep DailyCheckIn distinct from Attendance, Payroll, identity, and generic user-event semantics.
- Preserve qualification/scope recheck, one-command replay, durable claim authority, and distinct unavailable/forbidden/conflict outcomes.
- Client organization/time/amount are inputs only; server policy owns subject and business day.
- Preserve the published Ledger source tuple until a verified one-to-one migration exists; old/new tuples must never double-credit one business day.
