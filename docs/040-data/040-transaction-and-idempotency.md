# Transaction and idempotency

## Source of truth

Business persistence uses PostgreSQL as the durable authority. Redis、browser storage、Rich Menu state、external forms or model output cannot replace durable business records.

A business command that changes authoritative state must define its transaction owner, concurrency rule and replay behavior before implementation.

## Atomic business change

When one operation requires multiple durable effects to remain consistent, they commit or roll back together. Depending on the module this can include:

- aggregate state
- version increment
- immutable event / revision
- command receipt / replay record
- ledger entry
- durable outbox / expected projection state

Do not split these merely because code lives in different technical layers.

External network calls such as LINE、Google or AI provider calls are not held inside long database locks. Persist required intent/outbox first, commit authoritative state, then perform external delivery with explicit retry semantics.

## Optimistic concurrency

Mutable aggregates use explicit version / revision when stale clients could overwrite newer state. A command carrying an old expected version is rejected rather than silently merging or last-write-wins overwriting business decisions.

UI refresh and retry may read a new version, but must not rewrite the original command while claiming it is the same request.

## Idempotency / replay

For operations with retry risk, the durable store records a stable request identifier plus enough fingerprint/result data to distinguish:

1. first execution
2. exact retry of the same command
3. reuse of the same request ID with different content

Exact retry returns the prior durable result without creating a second business effect. Same ID + different content is a conflict.

Replay protection does not freeze authorization forever. When the current contract requires active membership / permission for replay, the server rechecks current qualification before returning or continuing the command.

## Locking

Lock only data needed to protect real invariants. Common patterns include aggregate row locks, ordered multi-entity locks and advisory locks for a stable command / shared resource key.

Lock order must be deterministic where multiple rows/resources are involved. Do not introduce broad global locks merely to simplify code if a narrower invariant can be protected.

## Audit and history

History required for correction, recovery or accountability is append-only or versioned according to the module contract. Runtime roles must not gain arbitrary update/delete access to command receipts or immutable event history.

Audit records do not automatically grant read access to the original private business object. Data authorization remains separate.

## Browser storage

`sessionStorage` or other browser state may retain non-secret pending command metadata for UX recovery, but it is not idempotency authority. Closing the tab, clearing storage or switching devices must not make server-side replay protection disappear.

## Adjacent owners

- Module-specific state/command semantics：[Domain owners](../010-domain-owners/README.md)
- Schema constraints / RLS：`../030-schema/`
- Security / authorization：[Security](../050-security/README.md)
- External delivery / recovery：[Operations](../070-operations/README.md)
