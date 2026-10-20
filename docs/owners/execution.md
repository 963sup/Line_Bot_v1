# Engineering Execution

Execution owns Repository-scoped engineering quantity declarations and internal review facts.
Each report pins one line of an exact ACTIVE [Contract](contract.md) revision and keeps that
published agreement/resource/measure basis immutable. It does not own agreement terms,
Resource quantities, Issue workflow, Actions automation or Payroll calculation.

## Report lifecycle

- WRITE, MAINTAIN or ADMIN submits a positive exact quantity and a plain-text note of at most
  2000 UTF-16 code units. The Contract must currently be ACTIVE at the exact referenced revision.
  Resources supplies the single decimal/unit policy through its pure public value functions.
- ADMIN accepts or rejects SUBMITTED. ADMIN can void ACCEPTED. REJECTED and VOIDED are terminal;
  correction is a new report while the Contract remains ACTIVE. Self-review is permitted.
- Reject/void require a trimmed nonempty reason of at most 2000 UTF-16 code units. Reviews append
  immutable revisions; quantity, source basis and original note never change.
- Existing reports can be reviewed/voided after Contract closure. New submissions cannot use a
  closed agreement. Later Resource changes or archive do not rewrite established report facts.
- Reports may exceed agreed quantity; no cumulative quantity cap or automatic agreement closure
  is inferred. Internal acceptance is not legal acceptance, payroll approval or a payable amount.
  No automatic payment, posting, event delivery or background worker is introduced.

## Access and consistency

Current active User and Repository access are rechecked on reads, commands and exact replay.
Action permission precedes replay. Current-authorized replay returns its committed revision even
after source closure/Repository archive; new mutations reject an archived Repository.
Creation expects version zero; reviews require the observed report version.

Application obtains Contract source qualification through the public reader in the same SQL
transaction as Repository scope, aggregate/source locking, version checking, head/revision save
and command receipt. There are no private Contract/Resource table reads. SQL additionally pins
the source to an ACTIVE same-Repository Contract revision. Changed payload under the same
actor/request identity conflicts; failures roll back the entire command. Runtime revisions and
receipts permit only insert/read. DTOs explicitly project detached values.

## Delivery and evidence

Use authenticated bounded stdin `pnpm execution:run`; see the [CLI contract](../../scripts/execution/README.md).
Lists are Contract-scoped with bounded keyset pagination; report history is version-paged.
No Web UI is part of this increment. Server timestamps represent submission/review commands,
not inferred work occurrence. [Payroll](payroll.md) retains its existing responsibility.

Canonical architecture models, manifests and declarative SQL own mappings, exports and schema.
Verify unit precision, immutable facts, illegal transitions, closed-source behavior, current
access, replay/version conflicts, transaction rollback, same-Repository source constraints and
native multi-session review/close races. Local/CI evidence does not prove live operator execution
or deployment.
