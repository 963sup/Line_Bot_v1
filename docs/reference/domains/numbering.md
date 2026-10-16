# Numbering detailed reference

Owner and invariants: [Numbering](../../owners/numbering.md).

## Public contract

`@line_bot_v1/numbering` exports the typed families, Series references, allocation request types,
limits and integrity error. `@line_bot_v1/numbering/postgres` exposes `allocateNumber(sql, request)`
and `resolveNumber(sql, series, number)`.

The `Sql` argument belongs to the caller. Numbering never opens a separate transaction. The caller
must first perform its existing governance lock, current qualification, request replay and resource
scope checks in the Owner-defined order, then allocate only when a new resource needs a number.

## Persistence

`number_series` is the small mutable Series aggregate. Its key is `(family, scope_kind, scope_id)`;
`next_number` advances once for each new committed resource. `legacy_high_water` and `managed_from`
record the explicit cutover boundary rather than pretending earlier allocations were observed.

`number_allocations` is append-only. Its unique keys prevent two resources from receiving one number
inside a Series and make the same resource retry idempotent inside that Series. The allocation key is
scoped; it is deliberately not a global resource uniqueness rule, so a future authorized scope move
can retain historical allocations without rewriting them.

The database validates family, scope and resource-kind compatibility. Direct table privileges are
revoked from runtime roles; the narrow allocation and resolution functions are the executable
surface. TypeScript validates returned numbers before crossing the package boundary.

## Transaction and contention

Allocation serializes one Series row. Different repositories, Accounts and Projects therefore use
different locks. A single hot Repository work-item Series can still contend; physical sharding does
not remove that per-Series ordering requirement and is not part of the current implementation.

No reserve, release, reset or counter-decrement operation exists. Deletion does not contact
Numbering. Exact command replay is resolved by the resource Owner before a new allocation, while
allocation-level idempotency remains a final database invariant.

## Cutover and recovery

The operator cutover requires a write drain/lock, live and retained-row reconciliation, a verified
high-water checkpoint and registry seeding. Only facts supported by current rows or verifiable
immutable events/receipts may be imported. A high-water mark can protect non-reuse without inventing
a target for an unknown historical number. The recovery provider/API must be available before the
first business cutover.

The cutover atomically establishes central database authority while the persisted Platform runtime
gate remains frozen. Strict `BEFORE` guards reject affected `line_app` resource writes with SQLSTATE
`55000`; operator reconciliation remains possible and must satisfy exact projection parity. Only
after a compatible production deployment has been read back at its exact revision may an operator
activate the runtime revision. A failed, obsolete or unverified deployment leaves both old and new
application writers frozen.

The schema is desired state, not proof that production data was reconciled. Remote preflight,
database cutover, deployment readback and runtime activation are separate release evidence. After
database authority activates, there is no database legacy fallback, registry reseed or
count-equality shortcut. Recovery freezes writes and repairs forward with a compatible build; it
never resumes `max(number) + 1` allocation.

## Validation

The package tests cover typed compatibility, limits and adapter decoding. PostgreSQL evidence must
also cover two-session same-Series allocation, different-Series independence, same-resource retry,
transaction rollback and delete-highest non-reuse. Static/schema checks do not prove remote cutover.
