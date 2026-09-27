# @line_bot_v1/expense
Owner: Expense state, commands, receipt intent, and recognition boundary. Semantics: [Expense](../../docs/owners/expense.md).

- Preserve revision OCC, terminal idempotency, owner/scope isolation, receipt-intent atomicity, final transaction recheck, and audit/event persistence.
- Receipt recognition returns untrusted draft data only; never authorize, post value, persist image bytes by default, or guess uncertain fields.
- Keep image/schema/timeout/cancellation/no-retry safeguards when moving adapters or providers.
- Legacy `body.project` is compatibility-only history, not current Project authority; new commands must not write or require it.
- Account supplies current User qualification; Expense maps failures into its own error contract.
