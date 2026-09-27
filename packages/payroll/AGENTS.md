# @line_bot_v1/payroll
Owner: Payroll readiness and future payroll lifecycle. Semantics: [Payroll](../../docs/owners/payroll.md).

- Readiness aggregates versioned Workforce, AttendancePeriod, and rule inputs; missing/duplicate/invalid required inputs fail closed.
- Validate PayPeriod before upstream reads.
- Readiness is read-only and does not create PayrollRun/PayStatement, calculate pay, publish results, or grant permission.
- Do not activate calculation/lifecycle/persistence/publication by shrinking required inputs or inventing formulas; satisfy the explicit owner/gap contracts first.
