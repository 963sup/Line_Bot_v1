# Execution constraints

Inherits [packages](../AGENTS.md). Execution owns Repository-scoped Task execution, prerequisites, actual quantities and review evidence.

- State is `SUBMITTED -> ACCEPTED | REJECTED` and `ACCEPTED -> VOIDED`.
- Submission basis, quantity and note are immutable; review and void append revisions.
- Content owns Task identity/definition and the work hierarchy. New Task executions pin an exact Content Task and a matching Contract Work/Task commitment; Execution never edits either source.
- Task prerequisites form an Execution-owned acyclic graph, distinct from Content parent/child structure. Resource use refers to Resources-owned identities through its public contract.
- Legacy reports remain readable and reviewable under their original frozen basis; do not invent Task mappings or rewrite historical evidence.
- Submit requires a currently ACTIVE Contract revision. Existing submissions remain reviewable after Contract closure.
- Authorization, exact replay, source verification, head/revision persistence and receipt share one transaction.
- Execution does not own Contract terms, Resource quantities, Payroll, payment, cumulative caps or automatic posting.
