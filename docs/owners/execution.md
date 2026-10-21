# Engineering Execution

Execution owns Repository-scoped Task quantity submissions, Task prerequisite metadata and internal
review evidence. A new report freezes one exact [Contract](contract.md) Work/Task commitment, one
exact [Content](content.md) Task, explicitly supplied physical [Resources](resources.md), the observed
dependency revision, quantity and note. It does not own agreement terms, plan structure, physical
Resource lifecycle, Issue workflow, Actions automation or Payroll calculation.

## Submission basis

- WRITE, MAINTAIN or ADMIN submits against the current ACTIVE Contract revision. A Task-based
  Contract line must either pin that Task directly or pin a Work ancestor in the same exact Content
  plan revision. Historical Resource-only Contract lines cannot receive new submissions.
- `task` is `{planRevisionId,nodeId}` and must resolve to an exact same-Repository Content Task with a
  planned quantity. `resources` is an explicit array of exact physical Resource revision references;
  new submissions require those Resources to be currently active.
- `observedDependencyVersion` must match the current Execution-owned dependency graph for that plan
  revision. The frozen report records its version, revision ID and that Task's prerequisite Task IDs.
- Dependency replacement validates same-plan Task endpoints, unique non-self edges and an acyclic
  graph. It is versioned metadata consistency only: the model has no Task completion state, so submit
  does not gate on prerequisite completion.
- Submission quantity uses Content's exact decimal/unit policy and the Task measure. Planned, agreed
  and actual quantities remain distinct; an actual may exceed the planned or agreed quantity.

## Report lifecycle

- Submission creates immutable `SUBMITTED` evidence. ADMIN accepts or rejects it; ADMIN can void an
  `ACCEPTED` report. `REJECTED` and `VOIDED` are terminal. Correction is a new report while the
  Contract remains ACTIVE; self-review is permitted.
- Note is preserved plain text up to 2000 UTF-16 code units. Reject/void require a trimmed nonempty
  reason of at most 2000 code units. Review revisions retain the original basis, Task, Resources,
  dependency metadata, quantity and note.
- Existing reports remain reviewable or voidable after Contract closure or later source changes.
  No source change rewrites an established report.
- Internal acceptance is not legal acceptance, payroll approval or a payable amount. There is no
  cumulative cap, automatic agreement closure, posting, event delivery or background worker.

## Historical reports

Reports created from the earlier Resource-based Contract basis remain readable and reviewable under
their original frozen shape. No Content Task, dependency graph or physical Resource list is inferred
for them, and new reports cannot be created from that legacy basis. The broader historical data
classification policy remains unresolved.

## Access and consistency

Current active User and Repository access are rechecked on reads, commands and exact replay. Action
permission precedes replay. Current-authorized replay returns its committed revision after source
closure or Repository archive; new mutations reject an archived Repository. Creation expects version
zero; reviews require the observed report version.

Application obtains Contract, Content and Resource qualification through public readers in the same
SQL transaction as Repository scope, source/aggregate locking, dependency read, version check,
head/revision save and command receipt. It does not query another owner's private tables. Changed
payload under the same actor/request identity conflicts; failures roll back the entire command.
Runtime revisions and receipts permit only insert/read. DTOs explicitly project detached values.

## Delivery and evidence

Use authenticated bounded stdin `pnpm execution:run`; see the
[CLI contract](../../scripts/execution/README.md). The CLI exposes report execute/read/list/history
and dependency read/replace operations. Lists are Contract-scoped with
bounded keyset pagination and report history is version-paged. Server timestamps represent commands,
not inferred work occurrence.

Canonical architecture models, manifests and declarative SQL own mappings, exports and schema.
Verify strict source matching, dependency-version conflicts, acyclicity, physical Resource pins,
unit precision, immutable facts, illegal transitions, closed-source behavior, replay/version
conflicts, rollback and native multi-session races. Local/CI evidence does not prove live operator
execution or deployment.
