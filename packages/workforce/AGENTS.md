# @line_bot_v1/workforce
Owner: Workforce target for Employment lifecycle, terms/policy, calendar, and schedule. Foundation only; status/semantics: [Workforce](../../docs/owners/workforce.md).

- Do not invent runtime APIs, public exports, persistence, adapters, or policy defaults before a real consumer and authority decision exist.
- Employment is a time-bounded User↔Organization working relationship; it is not Account identity or Organization membership. `Employee` is contextual, not a global identity.
- Account owns User qualification; Organization owns participation; Attendance owns actual facts; Payroll owns calculation/result; Identity/Access owns authorization policy.
- Before the first runtime capability, resolve the activation gates in the owner document.
