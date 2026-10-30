# Issue package constraints

Local constraints for `@line_bot_v1/issue`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local invariants

- Every Issue belongs to exactly one Repository, but Repository identity/access remains Repository-owned.
- Issue number is unique only inside its Repository scope; allocation is delegated to the Repository owner.
- Issue command replay uses stable request identity; a reused request identity must match the original command exactly.
- Canonical FPT `OPEN/CLOSED + stateReason` and the local `pending/active/review/completed` workflow are independent axes; never infer one from the other during current mutations.
- Conditional Issue mutations require the expected version and preserve durable structured event history.
- Issue assignment and write operations re-check current effective Repository access.
- IssueType definitions are Issue-owned but Organization-scoped; an Issue assignment is valid only when its Repository is owned by the same Organization.
- IssueType never grants Repository permission or determines Issue state/workflow. Disabled types keep current relations readable but block new assignment; deletion is a tombstone and requires zero current assignments.
- Pre-parity `issues.assignee/status` are rollout-only compatibility storage. New commands must not write them; a locked legacy row may only clear them while atomically materializing canonical Issue fields/assignment. Do not infer historical CLOSED state, body, stateReason or assignment time from missing pre-parity facts.

## Issue writer authority

- Issue alone changes Issue state/reason, workflow, assignments, comments, relations, events and replay receipts. Repository owns scope/access and label/milestone definitions; Issue may link those definitions, not edit them.
- Protected operations recheck effective Repository access and archive state and retain expected-version, stable request identity and the existing numbering/transaction protocol.
- Repository and Discussion must not change Issue private tables or Domain transitions directly. Cross-Owner consumers use Issue commands and narrow public ports.
- Existing `repository/postgres/*` imports in Issue adapters are migration debt. Do not add new imports or weaken authorization, locking or replay while replacing them with Host-composed access.
