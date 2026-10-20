# Engineering Contract

Contract owns Repository-scoped engineering agreements: editable draft terms, a bounded set of
agreed quantities against exact Resource revisions, ADMIN activation/closure, immutable revisions
and durable command receipts. Repository owns current access and archive state; Resources owns
the original resource/measure facts. [Execution](execution.md) owns submitted and reviewed quantities.

## Agreement lifecycle

- DRAFT creation/editing requires WRITE, MAINTAIN or ADMIN. Each command replaces the complete
  1–100 line set and appends an immutable revision. Line IDs are unique within the agreement.
- Each line pins one same-Repository Resource revision with a quantity and immutable measure.
  Its positive agreed quantity uses the Resources exact decimal/unit policy; it need not equal
  or be below the source quantity. Source changes never update an existing agreement implicitly.
- ADMIN activates DRAFT after requalifying all exact pins against currently unarchived Resources.
  ACTIVE terms/lines are frozen. ADMIN can close ACTIVE; CLOSED cannot reopen or amend.
- Closing prevents new Execution submissions. Existing reports remain reviewable and voidable
  against the original ACTIVE revision, including after a Resource is archived.
- [Content](content.md) supplies bounded title/body normalization. Contract keeps agreement
  meaning, error semantics, identity and history. Activation records internal approval;
  it does not model signatures, counterparties, prices, legal effectiveness, payment or Payroll.

## Access and consistency

Current active User and Repository access are rechecked for every read, command and replay.
Action permission precedes receipt replay; current-authorized exact replay can return its original
revision after Repository archive or agreement closure. A new mutation rejects an archived
Repository. Creation expects version zero; later commands require the observed version.

Repository scope, request identity, aggregate/source locks, version check, head, immutable revision
and command receipt share one transaction. Reusing actor/request identity with changed canonical
input conflicts. A failed receipt rolls back the revision and head. Runtime revisions/receipts
are insert/read-only. Lists and history use bounded keyset pages.

The published line reader qualifies exact ACTIVE revisions and line membership. Submission
requires the current head to be that ACTIVE revision; review permits subsequent CLOSED state.
Consumers use this transaction-bound public contract rather than private SQL.

## Delivery and evidence

The authenticated operator entry is `pnpm contract:run`; bounded stdin carries identity proof,
never a trusted actor ID or role. See the [CLI contract](../../scripts/contract/README.md).
No Web delivery is part of this increment. Server timestamps record commands, not inferred work
occurrence dates. [Payroll](payroll.md) retains its existing responsibility.

Mappings, exports and SQL remain governed by the canonical architecture models, manifests and
declarative schemas. Verify illegal transitions, detached projections, current access, pin
qualification, exact replay, rollback, foreign scope/version constraints and native multi-session
competition. Local tests, CI PostgreSQL and production deployment are separate evidence.
