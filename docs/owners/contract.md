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

## Access and consistency

Current active User and Repository access are rechecked for every read, command and replay. Action
permission precedes receipt replay; current-authorized exact replay can return its original revision
after Repository archive or agreement closure. A new mutation rejects an archived Repository.
Creation expects version zero; later commands require the observed version.

Repository scope, request identity, aggregate/source locks, version check, head, immutable revision
and command receipt share one transaction. Reusing actor/request identity with changed canonical
input conflicts. A failed receipt rolls back the revision and head. Runtime revisions/receipts are
insert/read-only. Lists and history use bounded keyset pages.

The published line reader returns the exact Content line from an explicit revision. New Execution
submission requires that revision to be the current ACTIVE head; review permits its later CLOSED
state. Resource/Object-based payloads and persisted line shapes are rejected rather than interpreted
through a compatibility model. Consumers use this public contract rather than private SQL.

## Purchase-order documents

Contract also owns a separate Repository-scoped `ContractDocument` aggregate. It keeps a complete,
versioned purchase-order candidate in Contract's fixed schema: header, buyer/seller, every source
line, totals, terms, field evidence and corrections. This is distinct from Engineering Contract; it
does not create an agreement, Content plan, WBS baseline or Execution report.

Each revision pins `{fileId, fileRevisionId, fileSha256}` after File requalifies that exact source
inside Contract's transaction. Contract stores no original bytes. A candidate may be saved as DRAFT
only through Contract's public intake command. Confirmation is an explicit Contract command; it
requires complete source-review coverage, no unresolved line uncertainty and any financial
discrepancy acknowledgement. The source value is retained with diagnostics rather than silently
rounded or replaced.

Intelligence receives the target-owned extraction schema and can submit only a SAVE candidate
through this public contract. Contract alone validates the candidate, rechecks Repository authority,
enforces expected version and request fingerprints, writes immutable revision/head/receipt atomically,
and reads a receipt back under current access. The current CLI exposes bounded document read, submit
and receipt operations. Contract does not create Content or WBS records: Content separately reads one
exact CONFIRMED revision through Contract's public reader, applies its fixed whole-document expansion,
and WBS subsequently consumes that immutable Content revision.

## Delivery and evidence

The authenticated Web operator carries identity proof through the application boundary,
never a trusted actor ID or role. There is no standalone Contract CLI.
Server timestamps record commands, not inferred work occurrence dates. [Payroll](payroll.md)
retains its existing responsibility.

Mappings, exports and SQL remain governed by the canonical architecture models, manifests and
declarative schemas. Verify illegal transitions, detached union projections, current access,
Content pin qualification, retired-shape rejection, rollback, foreign scope/version
constraints and native multi-session competition. Local tests, CI PostgreSQL and production
deployment are separate evidence.
