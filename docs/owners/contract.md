# Engineering Contract

Contract owns Repository-scoped engineering agreements: editable draft terms, a bounded complete
line set, ADMIN activation/closure, immutable revisions and exact command receipts. New commitments
pin exact [Content](content.md) Work or Task items. Content owns plan structure and planned quantities;
Contract owns the agreed quantity and agreement lifecycle. [Execution](execution.md) owns Task
submissions and internal review.

## Agreement lifecycle

- WRITE, MAINTAIN or ADMIN creates and edits a DRAFT. Every create/edit replaces the complete 1–100
  line set and appends an immutable revision; line IDs are unique within the agreement.
- A new line contains `{lineId, planRevisionId, nodeId, agreedQuantity}`. The pinned Content node must
  be a same-Repository Work or Task with a planned quantity. Its exact plan revision, node text/path,
  measure and planned quantity are frozen into the Contract revision.
- The positive agreed quantity uses Content's exact decimal/unit policy. It need not equal or be below
  the planned quantity. Later Content plan revisions never rewrite a frozen agreement.
- ADMIN activates a DRAFT after requalifying the same exact Content pins. Requalification cannot
  change line order, identity, plan revision, node or agreed quantity. ACTIVE terms are frozen.
- ADMIN closes ACTIVE. CLOSED cannot reopen or amend, and closure prevents new Execution submissions.
  Existing submissions remain reviewable and voidable against their original ACTIVE revision.
- `@line_bot_v1/platform/text` validates title/body values. Contract retains agreement meaning,
  errors, identity, lifecycle and history. Activation is internal approval; signatures,
  counterparties, prices, legal effect, payment and Payroll are outside this owner.

## Historical Resource-based revisions

Earlier Contract revisions may contain immutable Resource/Object quantity snapshots. Persistence,
DTOs, history, line-reference reads and exact receipt replay preserve that explicit historical
variant. They never infer a Content node or rewrite stored evidence.

New create/edit commands cannot write Resource-based lines. An existing Resource-based DRAFT must be
explicitly edited to a complete Content-based line set before activation. Existing Resource-based
ACTIVE agreements remain readable and closable, and their historical Execution reports remain
reviewable. The broader legacy data-classification/cutover policy is still unresolved.

## Access and consistency

Current active User and Repository access are rechecked for every read, command and replay. Action
permission precedes receipt replay; current-authorized exact replay can return its original revision
after Repository archive or agreement closure. A new mutation rejects an archived Repository.
Creation expects version zero; later commands require the observed version.

Repository scope, request identity, aggregate/source locks, version check, head, immutable revision
and command receipt share one transaction. Reusing actor/request identity with changed canonical
input conflicts. A failed receipt rolls back the revision and head. Runtime revisions/receipts are
insert/read-only. Lists and history use bounded keyset pages.

The published line reader returns the exact Content or historical Resource line variant from an
explicit revision. New Execution submission requires that revision to be the current ACTIVE head;
review permits its later CLOSED state. Consumers use this public contract rather than private SQL.

## Delivery and evidence

The authenticated operator entry is `pnpm contract:run`; bounded stdin carries identity proof,
never a trusted actor ID or role. See the [CLI contract](../../scripts/contract/README.md).
Server timestamps record commands, not inferred work occurrence dates. [Payroll](payroll.md)
retains its existing responsibility.

Mappings, exports and SQL remain governed by the canonical architecture models, manifests and
declarative schemas. Verify illegal transitions, detached union projections, current access,
Content pin qualification, historical replay/read behavior, rollback, foreign scope/version
constraints and native multi-session competition. Local tests, CI PostgreSQL and production
deployment are separate evidence.
