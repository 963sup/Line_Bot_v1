# Execution constraints

Inherits [packages](../AGENTS.md). Execution owns Repository-scoped engineering quantity declarations and review evidence.

- State is `SUBMITTED -> ACCEPTED | REJECTED` and `ACCEPTED -> VOIDED`.
- Submission basis, quantity and note are immutable; review and void append revisions.
- Submit requires a currently ACTIVE Contract revision. Existing submissions remain reviewable after Contract closure.
- Authorization, exact replay, source verification, head/revision persistence and receipt share one transaction.
- Execution does not own Contract terms, Resource quantities, Payroll, payment, cumulative caps or automatic posting.
