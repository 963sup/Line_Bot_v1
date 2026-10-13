# WBS package constraints

Inherits [packages](../AGENTS.md). Authority: [WBS owner](../../docs/owners/wbs.md).

- Repository-WBS owns versioned scope documents, not Issue execution or Project planning.
- Content has one authority: immutable Revision documents selected by the WBS head.
- Repository supplies transactional access, qualification and archive facts through its public contract.
- Every write preserves expected version, durable exact replay and atomic head/revision/receipt persistence.
- GitHub FPT Commit, PullRequest and ProjectItem are not redefined as WBS concepts.
