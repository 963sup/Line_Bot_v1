# Execution

Task submissions freeze a matching Content Task, an ACTIVE Content-based Contract line, explicit
physical Resource pins and the observed Execution-owned prerequisite graph revision. The graph is
acyclic versioned metadata; it does not gate submission on completion because Task completion state
is not modeled. Retired Resource/Object-based report shapes are rejected.

Read the [owner contract](../../docs/owners/execution.md), [local constraints](AGENTS.md),
[generated semantics](SEMANTICS.md) and [authenticated CLI](../../scripts/execution/README.md).
