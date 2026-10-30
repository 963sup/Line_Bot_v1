# Expense package constraints

Local constraints for `@line_bot_v1/expense`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Expense claim mutation uses expected version checks to avoid concurrent overwrite.
- Current Expense `save | confirm | cancel` operations require the applicable actor/owner, scope, revision and transaction checks; `confirmed` is field confirmation, not approval, payment or Accounting. Follow the [Expense owner contract](../../docs/owners/expense.md) rather than introducing an unapproved approval transition.
- Receipt image intake requires verified upload intent before final claim attachment.
