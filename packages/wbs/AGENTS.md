# WBS package constraints

Inherits [packages](../AGENTS.md). Authority: [WBS owner](../../docs/owners/wbs.md).

- Repository-WBS owns versioned scope documents, not Issue execution or Project planning.
- Content has one authority: immutable Revision documents selected by the WBS head.
- Repository supplies transactional access, qualification and archive facts through its public contract.
- Every write preserves expected version, durable exact replay and atomic head/revision/receipt persistence.
- GitHub FPT Commit, PullRequest and ProjectItem are not redefined as WBS concepts.
- Expanded roles have one location: `domain/**`, `application/{commands,queries,use-cases}/**`, and `contracts/{dto,repositories}/**`; do not restore parallel root files or forwarding exports.
- Domain owns transition and approval rules. Application coordinates authorization/replay/load/decision/save through transaction ports. PostgreSQL adapters own locks, mapping and persistence, not legal business decisions. Keep the entire callback and receipt in one transaction.
