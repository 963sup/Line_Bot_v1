# @line-work/daily-check-in

Owner: DailyCheckIn policy/application contract. Canonical semantics: [DailyCheckIn](../../docs/owners/daily-check-in.md).

- Keep DailyCheckIn separate from Attendance, Payroll, identity, and generic user events.
- Preserve qualification/scope recheck, one-command replay, durable claim authority, and distinct failure outcomes.
- Client organization/time/amount are inputs only; server policy owns subject and business day.
- Preserve the Ledger source tuple until a verified one-to-one migration prevents double credit.
