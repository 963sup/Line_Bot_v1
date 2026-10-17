# WBS package constraints

Inherits [packages](../AGENTS.md). Authority: [WBS owner](../../docs/owners/wbs.md).

- WBS owns Project-scoped versioned scope documents and governance; Project owns current access/lifecycle, not WBS content. Repository-WBS is R1 transfer-only.
- Content has one authority: immutable Revision documents selected by the WBS head.
- Project supplies current `READ | WRITE | ADMIN` access and open/closed/deleted lifecycle through its public content-scope contract. Repository supplies source facts only for the guarded R1 transfer path.
- Transfer request and Release execution both verify destination emptiness and zero dependent legacy state; execution also rechecks the immutable source snapshot. Source writes remain allowed while `REQUESTED`, and drift must abort activation atomically rather than mutate the captured intent.
- Only the current source User owner may read a live intent or cancel `REQUESTED`. Cancellation is independent of target Project authority/deletion, uses its own exact-replay request identity, preserves the captured snapshot, releases only live uniqueness for replanning and never applies to `ACTIVE`.
- Every write preserves expected version, durable exact replay and atomic head/revision/receipt persistence. Closed is read/exact-replay only; deleted is not found.
- GitHub FPT Commit, PullRequest and ProjectItem are not redefined as WBS concepts.
- Expanded roles have one location: `domain/**`, `application/{commands,queries,use-cases}/**`, and `contracts/{dto,repositories}/**`; do not restore parallel root files or forwarding exports.
- Domain owns transition and approval rules. Application coordinates authorization/replay/load/decision/save through transaction ports. PostgreSQL adapters own locks, mapping and persistence, not legal business decisions. Keep the entire callback and receipt in one transaction.
